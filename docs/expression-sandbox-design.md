# Expression sandbox (design, for review)

Status: implemented (`src/helpers/expression-sandbox.js`).

## Problem

Flow expressions and named functions are compiled with `new Function` (`src/index.ts` `evaluateJavaScriptExpression`,
`src/helpers/named-functions.js` `compileNamedFunctions`). The names jsfe passes in (variables, approved functions,
`fn`, `Math`, ...) only decide what resolves by name. Every other identifier resolves to the host's global scope, and
every object passed in leads back to the host's `Function` constructor (`Math.constructor.constructor`,
`"".constructor.constructor`, the AsyncFunction constructor). An expression can therefore read the host's environment
variables and credentials, call `fetch`, and loop forever. Flow text is untrusted input; jsfe must evaluate it so that it
reaches only what jsfe exposes.

## Decision

Evaluate every expression and every named function in QuickJS compiled to WebAssembly (`quickjs-emscripten`), through a
live bridge. The host's objects never enter the sandbox; the sandbox gets stand-ins whose every operation is a call into
jsfe code that returns only primitives or another stand-in.

Prototype results (all flow suites of one host, about 1.08 million evaluations):

- Behaviour: every suite passes except one test whose own probe flow calls `structuredClone`, a host global jsfe never
  exposed.
- Latency per evaluation: p50 0.49 ms, p90 0.63 ms, p99 1.38 ms (native `new Function`: 0.14 / 0.33 / 1.75). The longest
  suite took 113 s against 102 s.
- Escapes: `process`, `fetch`, `globalThis` contents of the host and the `constructor.constructor` path all return
  `undefined` or the sandbox's own objects. `while(true)` is interrupted; unbounded allocation stops at the memory cap.
- Size: the release-sync WebAssembly is 503 KB.

Copying the inputs into the sandbox and merging changes back was measured first and rejected: copying a 40 KB cargo
costs 4 to 6 ms per evaluation, and a turn runs hundreds of evaluations.

## The bridge

### Host side (jsfe)

Per evaluation, jsfe keeps two tables: objects by id and functions by id. It installs these host functions in the
context; each takes and returns only numbers and strings:

| Function | Does |
|---|---|
| `__get(id, key)` | the object's OWN property: a primitive, or a tagged id for an object or function; a marker when absent |
| `__set(id, key, json)` | writes the decoded value; `__proto__` is refused |
| `__has(id, key)` / `__del(id, key)` / `__keys(id)` | own-property test, delete, `Object.keys` |
| `__call(fid, json)` | calls the host function with decoded arguments; its result crosses back like `__get`'s |
| `__locale(kind, value, locales, options)` | `toLocaleDateString` / `toLocaleString` / `toLocaleTimeString`, `Date#toString` / `toTimeString` and `Number#toLocaleString` on the host (QuickJS has no `Intl`) |

Tags use a private-use character (``) prefix: `o:<id>` an object (`:a` an array), `f:<id>` a host function,
`g:<id>` a sandbox function. NUL cannot be used: it truncates QuickJS C strings.

Only own properties cross. An inherited member (`constructor`, `toString`, `__proto__`) is never read from the host
object; the stand-in falls back to the sandbox's own prototypes, so `cargo.items.map(...)` uses the sandbox's
`Array.prototype.map` over the stand-in.

### Sandbox side

A small guest runtime (evaluated once per context) builds a `Proxy` per host id with `get`, `set`, `has`,
`deleteProperty`, `ownKeys`, `getOwnPropertyDescriptor`, `defineProperty` and `getPrototypeOf` traps, and encodes values
for the host: primitives as themselves (`undefined` as a marker), stand-ins as their id, sandbox functions by index,
`Date` as its time, plain objects and arrays by value.

Consequences, each covered by a prototype test:

- Identity and aliasing are the host's own: `a = cargo.x; a.y = 1` changes `cargo.x.y`; a stand-in passed to an approved
  function arrives as the real host object.
- A sandbox function passed to a host function (a callback) is callable from the host for the rest of the evaluation.
- A plain sandbox object stored into a host object (`cargo.list = []; cargo.list.push(1)`) is re-sent before every host
  call and at the end, only if the expression changed it after storing it.
- The result crosses like any value. With `preserveObjects` false, an object result is stringified on the host, as now.

### Host functions

Any host function an expression reaches (an approved function, or a function the host itself placed in data: JSON flow
text cannot hold one) is called on the host; only its arguments and result cross. A host function's id lasts one
evaluation; named functions hold approved functions by name. An approved function that returns a
Promise throws `an approved function returned a Promise; expressions are synchronous`. A function an expression creates
and hands to the host is callable only while that evaluation runs.

A host error reaches the sandbox with its name and message (built by the sandbox's own constructor: the frozen
`Error.prototype` refuses an assigned message).

## Named functions

Named functions are flow text and run in the sandbox too. Each distinct source is compiled once per process; a syntax
error still fails the flow at load. They call approved functions BY NAME, from the table of the engine evaluating (called
from the host, from the table they were compiled with), so one compiled copy serves every engine. Their members are
frozen and hold no state.

## Contexts, limits, loading

- **One sandbox per process** (`sharedSandbox()`): one QuickJS runtime and context, shared by every engine. Measured with
  a tenant's full flow set: a per-engine sandbox recompiled every flow's named functions in each engine (engine
  construction p50 404 ms against 162 ms natively, and the host builds an engine per turn); shared, construction is 158 ms
  against 164 ms, and the first engine in a process pays about 200 ms once.
- **Isolation between evaluations and engines:** the context's global object and every built-in and prototype are frozen
  before the first evaluation, so nothing an expression or a named function does survives it (strict mode already refuses
  undeclared assignments). Each evaluation compiles its expression as a fresh function, passes only the names it mentions,
  and on exit the host's object and function tables and the guest's stand-in cache are cleared, so no stand-in outlives
  its evaluation. jsfe evaluates synchronously, so evaluations never overlap.
- **Limits** (`EXPRESSION_LIMITS`; an `ExpressionSandbox` takes overrides, the engine uses these): memory 256 MB for the
  process (a tenant's full flow set compiled uses about 12 MB), stack 1 MB, and 1,000 steps per evaluation: the interrupt
  handler's calls, which QuickJS makes at a fixed count of executed bytecode. The budget is the expression's own work, so
  the verdict does not depend on the machine or its load, and a helper the expression calls is not counted. Real flows use
  at most 6 steps (7.29 M evaluations measured); a runaway loop is stopped within about 30-600 ms. A limit hit throws `Expression evaluation
  failed: interrupted` (or `out of memory`), handled like any failed expression.
- **Compiled expressions** are cached per sandbox (1,000, least recently used); a cached wrapper holds no state.
- **Release:** the shared sandbox lives as long as the process. A separately created `ExpressionSandbox` is released by
  `dispose()` or when it is collected (a `FinalizationRegistry`; the bridge reaches it only through a `WeakRef`).
- **Loading:** `scripts/bundle-quickjs.mjs` bundles QuickJS with its WebAssembly embedded into one relative module,
  `dist/vendor/quickjs.js` (the Flow Designer imports `dist/` from a CDN with no bundler, so `dist/` holds no bare
  package import). It is instantiated with a top-level `await`, so `new WorkflowEngine(...)` stays synchronous and hosts
  change nothing. The QuickJS packages are build-time dependencies only.

## Behaviour that changes for flow authors

- Host globals that jsfe never exposed are gone: `structuredClone`, `fetch`, `process`, `setTimeout`, `globalThis`
  members, `require`. The standard built-ins (`Object`, `Array`, `JSON`, `Math`, `Date`, `String`, `Number`, `Boolean`,
  `RegExp`, `Map`, `Set`, ...) are the sandbox's own, with the same behaviour.
- `Intl` holds only `DateTimeFormat` and `NumberFormat` (`format`, `formatToParts`, `resolvedOptions`), formatted by the
  host; with the locale methods above, the only formatting the flow sets use.
- `structuredClone` is the sandbox's own: plain objects, arrays, `Date`, `Map`, `Set`, `RegExp`, cycles kept.
- `Date` local time is the host's: QuickJS asks the host's own `Date` for the time zone. Verified equal (offset, hours,
  day, both DST transitions, local-time parsing) in Node, Chromium and WebKit, in five zones. The one difference:
  `Date#toString` and `toTimeString` omit the zone name ("(Pacific Standard Time)"), so both are bridged to the host
  like the locale methods.

## Browser

The Flow Designer loads jsfe in a page. WebAssembly compilation needs `'wasm-unsafe-eval'` if the page sets a Content
Security Policy; that is narrower than the `'unsafe-eval'` that `new Function` needs today. The browser bundle grows by about
0.9 MB (QuickJS with its WebAssembly embedded, measured with esbuild).

## Tests

- **Escapes** (new jsfe suite, all must return nothing of the host): `constructor.constructor` from every built-in and
  from a stand-in, `Function`, AsyncFunction and GeneratorFunction constructors, `__proto__` writes, `Object.getPrototypeOf`
  of a stand-in, `globalThis` enumeration, `import()`, `eval`, a callback receiving a host object, a thrown host error.
- **Limits:** an infinite loop, recursion, unbounded arrays and strings; the next evaluation must succeed.
- **Parity:** jsfe's own suite and every host flow suite, unchanged.
- **Latency:** the per-evaluation benchmark, published with the release.
- **Browser:** the escape and parity suites in Chromium, WebKit and Firefox, and the time zone comparison.

## Rollout

The sandbox replaces `new Function` outright: no option keeps the native evaluator, since that would keep the hole.
jsfe has no other users, and every flow set's suites pass on the prototype. Release as a minor version, pinned by the
host after its suites pass on dev.

## Alternatives considered

- **A self-built interpreter** over its own object model (no host object ever reachable): the strongest boundary and no
  dependency, at the cost of writing and maintaining a JavaScript subset interpreter that flows already rely on in full
  (IIFEs, closures, loops, `var`). QuickJS gives the full language now; the bridge would carry over to an interpreter later.
- **Node `vm`, vm2, SandboxJS, sval, SES, isolated-vm, ShadowRealm, restricted expression languages:** rejected (not a
  security boundary by its own documentation, a record of escapes, host-realm side effects, Node only, not shipped, or
  not the language flows are written in).
