# Expression sandbox (design, for review)

Status: proposal. No code yet.

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
| `__locale(kind, value, locales, options)` | `toLocaleDateString` / `toLocaleString` / `toLocaleTimeString` and `Number#toLocaleString` on the host (QuickJS has no `Intl`) |

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

### Which functions are callable

A function reached through a stand-in is callable only when it is an approved function or a member of `fn`. Any other
function-valued property of host data crosses as `undefined`. (The prototype bridged every function; this tightens it.)
An approved function that returns a Promise throws `bridged function returned a Promise`: an expression is synchronous,
and today such a call yields an unusable Promise object.

## Named functions

Named functions are flow text and move into the sandbox too. At flow load, jsfe compiles the factory source once in a
throwaway context, so a syntax error still fails the flow at load as now. An evaluation whose expression mentions `fn`
evaluates the factory source in its context, with the approved functions as bridged host functions, and passes the
resulting namespace as `fn`. Named functions calling each other and approved functions keep today's semantics. Cost per
evaluation that uses `fn` is to be measured; if it matters, the factory is compiled once per turn context instead (see
Contexts).

## Contexts, limits, loading

- **Runtime:** one QuickJS runtime per process (Node) or page (browser), created when jsfe is imported. jsfe evaluates
  synchronously, so evaluations never overlap in a runtime.
- **Context:** a new context per evaluation, disposed with every handle in a `finally`. Only the names the expression
  mentions are passed in. No state survives an evaluation.
- **Limits** (engine options, these defaults): memory 64 MB, stack 1 MB, a wall deadline of 500 ms per evaluation checked
  by the interrupt handler. The prototype's slowest evaluation took 70 ms. A limit hit throws `Expression evaluation
  failed: interrupted` (or `out of memory`), handled like any failed expression.
- **Loading:** the WebAssembly is embedded in the package (the single-file variant) and instantiated with a top-level
  `await` in jsfe's entry module, so `new WorkflowEngine(...)` stays synchronous and hosts change nothing. Node and every
  current browser support top-level await in ES modules, and esbuild's `esm` format keeps it.

## Behaviour that changes for flow authors

- Host globals that jsfe never exposed are gone: `structuredClone`, `fetch`, `process`, `setTimeout`, `globalThis`
  members, `require`. The standard built-ins (`Object`, `Array`, `JSON`, `Math`, `Date`, `String`, `Number`, `Boolean`,
  `RegExp`, `Map`, `Set`, ...) are the sandbox's own, with the same behaviour.
- `Intl` is absent; the locale methods above are bridged.
- `Date` local-time methods use the sandbox's time zone. To be verified equal to the host's in Node and in the browser
  before release.

## Browser

The Flow Designer loads jsfe in a page. WebAssembly compilation needs `'wasm-unsafe-eval'` if the page sets a Content
Security Policy; that is narrower than the `'unsafe-eval'` that `new Function` needs today. The package grows by the
embedded WebAssembly (about 0.5 MB, more as base64; to be measured).

## Tests

- **Escapes** (new jsfe suite, all must return nothing of the host): `constructor.constructor` from every built-in and
  from a stand-in, `Function`, AsyncFunction and GeneratorFunction constructors, `__proto__` writes, `Object.getPrototypeOf`
  of a stand-in, `globalThis` enumeration, `import()`, `eval`, a callback receiving a host object, a thrown host error.
- **Limits:** an infinite loop, recursion, unbounded arrays and strings; the next evaluation must succeed.
- **Parity:** jsfe's own suite and every host flow suite, unchanged.
- **Latency:** the per-evaluation benchmark, published with the release.
- **Browser:** the escape and parity suites in Chromium, WebKit and Firefox; time zone checks in each.

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
