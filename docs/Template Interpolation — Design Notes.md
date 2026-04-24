# Template Interpolation — Design Notes

> Captures the architectural discussion on 2026-04-23 about JSFE's two template
> interpolators, the asymmetry they create for flow authors, and why the
> proposed unification was shelved. Read this before modifying `interpolateObject`,
> `interpolateMessage`, or any CALL-TOOL / FLOW step argument handling.

## TL;DR

JSFE has **two** template interpolators with different capabilities:

| Context where `{{ }}` appears | Interpolator | Full JS (`??`, `||`, `?.`, ternary, `.map()`)? | Returns raw types? |
|---|---|---|---|
| SAY `value` / `value_es` | `interpolateMessage` | ✅ Yes | ❌ Always stringifies |
| SAY-GET `value` / `value_es` | `interpolateMessage` | ✅ Yes | ❌ Always stringifies |
| SET `value` | `evaluateExpression` | ✅ Yes | ✅ Yes |
| CASE `condition: ...` | `evaluateExpression` | ✅ Yes | ✅ Yes |
| RETURN `value` | `evaluateExpression` | ✅ Yes | ✅ Yes |
| FLOW `value` / `name` (sub-flow id) | `interpolateMessage` | ✅ Yes | ❌ Always stringifies |
| **CALL-TOOL `args`** | **`interpolateObject` → `extractByPath`** | ❌ **Dot-path only** | ✅ Yes |
| **FLOW `parameters`** | **`interpolateObject` → `extractByPath`** | ❌ **Dot-path only** | ✅ Yes |
| **FLOW `onFail.parameters`** | **`interpolateObject` → `extractByPath`** | ❌ **Dot-path only** | ✅ Yes |

**Mnemonic:** contexts passing a *structured object* (args/parameters) to a tool or sub-flow use the limited dot-walk interpolator; everything else uses the full-JS evaluator.

## Workaround For Flow Authors

If a CALL-TOOL arg or FLOW parameter needs a JS expression, **hoist the computation into a preceding SET step** and reference the result via simple `{{ }}`:

```json
// ❌ Silently returns "" — CALL-TOOL args don't evaluate JS operators
{ "type": "CALL-TOOL", "args": {
    "variantId": "{{selected.id ?? selected.variant_id}}"
}}

// ✅ Works — hoist to SET, reference the simple variable
{ "type": "SET", "variable": "variant_gid",
  "value": "selected.id ?? selected.variant_id" },
{ "type": "CALL-TOOL", "args": {
    "variantId": "{{variant_gid}}"
}}
```

`SET value` supports full JS. `{{variant_gid}}` in CALL-TOOL args is a pure dot-path and resolves correctly through the dot-walker.

## Why The Asymmetry Exists

Historical, not intentional. `interpolateObject` was designed to recursively walk a JSON-like structure (CALL-TOOL args and FLOW parameters are both nested objects with string/array/object leaves) and interpolate each string leaf. The string-leaf handler used `extractByPath` — a simple, null-safe dot-walk that does exactly enough for the common case and nothing more.

`interpolateMessage` was built separately for SAY messages. It takes one string, does full expression evaluation, returns one string. No tree walk.

Neither one is wrong for its original purpose. The footgun is that the same `{{ }}` template syntax is used in both contexts, but only some of them support JS operators.

## Why Null-Safety Is Load-Bearing (Not Just An Implementation Detail)

`extractByPath` returns null gracefully when walking through a null/undefined parent. In template form, that means `{{cargo.user.email}}` resolves to `""` even when `cargo.user` hasn't been populated. This is **critical** for production flows because intermediate properties are routinely absent:

- Pre-auth turns: `cargo.user` undefined until OTP completes
- Digital-goods orders: `order.shippingAddress` absent entirely
- Partial tool results: `{ success: false }` with no `.store` sub-object
- Branch-specific cargo fields populated only on certain flow paths

Raw JavaScript evaluation (`new Function(...)` under `evaluateJavaScriptExpression`) **throws** on `null.field`. That TypeError would become a runtime failure for any flow relying on the null-safe behavior. Audits identified 23 nested-dot-path templates in CALL-TOOL args (e.g., `{{cargo.accountNumber}}`, `{{location_result.store.address}}`) that all rely on this invariant.

This is why the asymmetry cannot be "fixed" by mechanically swapping the interpolator. Any unification must either:
- Preserve null-safe behavior for pure dot-paths while enabling JS for complex expressions (a heuristic approach), OR
- Force flow authors to migrate to `?.` for every null-safe access (a breaking change)

## The 2026-04-23 Incident

Shopify's UCP 2026-04-08 rollout and an earlier tool-rename (Apr 15) caused `shopify-store-availability` tool calls to fail with `Variable $variantId of type ID! was provided invalid value`. Root cause traced to a CALL-TOOL arg template:

```json
"variantId": "{{selected_variant.id ?? selected_variant.variant_id}}"
```

The `??` operator is not supported by `extractByPath`. Expression resolved to `""`, passed to Shopify's Admin API, rejected. Similar pattern at `{{language || 'en'}}`.

Fixed in `AIDevelopment/jsfe-flows/shopify.flows.json` (and `.dev.json`) by applying the hoist-to-SET workaround above — repurposing the existing `variant_ok` CASE branch to compute `variant_gid` via JS expression, then referencing `{{variant_gid}}` in the CALL-TOOL args.

## Options Considered For JSFE Unification

### Option A — Heuristic-routed `interpolateObject` (shelved)

Replace `interpolateObject`'s string-leaf branch with:
- Pure dot-path (matches `/^[\w.\[\]\s]+$/`) → continue using legacy null-safe walk (no behavior change for any existing flow)
- Complex expression (contains `??`, `||`, `?.`, etc.) → route to `evaluateExpression` with `context: 'javascript-evaluation'` + `returnType: 'auto'` + `securityLevel: 'none'`
- Error-marker mapping: `[error: ...]` string returns → coerce to `""`

Implemented, build passed, 31 regression tests passing. Shelved because CALL-TOOL args is the highest-traffic path in production and the null-safety heuristic, while correct, adds ongoing maintenance burden — authors who want JS in complex expressions must still learn to add `?.` for null-safe member access. Benefit-to-risk ratio didn't justify a production release.

### Option B — Shallow `buildSubFlowParameters` (leaned-toward but also shelved)

Surgical change limited to FLOW parameters (not CALL-TOOL args). Two parts:

**B.1 — Add `stringify = true` flag to `interpolateMessage`** so it can return raw types when opted out:

```typescript
function interpolateMessage(
  template: string,
  contextStack: ContextEntry[],
  variables: Record<string, unknown> = {},
  engine: Engine,
  stringify: boolean = true
): string | unknown {
  if (!template.includes("{{")) return template;
  const result = evaluateExpression(template, variables, contextStack, {
    securityLevel: 'none',
    allowLogicalOperators: true,
    allowMathOperators: true,
    allowComparisons: true,
    allowTernary: true,
    context: stringify ? 'template-interpolation' : 'javascript-evaluation',
    returnType: stringify ? 'string' : 'auto',
  }, engine);
  return stringify ? String(result) : result;
}
```

**B.2 — Replace `interpolateObject(step.parameters, ...)` at call sites (lines 3752, 4373) with a shallow walker:**

```typescript
function buildSubFlowParameters(
  parameters: Record<string, unknown>,
  variables: Record<string, unknown>,
  engine: Engine
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(parameters)) {
    if (typeof value === 'string' && value.includes('{{')) {
      out[name] = interpolateMessage(value, [], variables, engine, /*stringify=*/false);
    } else {
      out[name] = value; // literal (string without templates, number, array, object) — pass through
    }
  }
  return out;
}
```

**Why this was tempting:** CALL-TOOL args (with its 23 null-safety-dependent nested paths) is completely untouched. The 23 stay on `interpolateObject`/`extractByPath`. The change affects only FLOW parameters, where an audit found zero existing risk: all 53 FLOW-parameter templates are top-level simple identifiers, and the single nested-path template (`{{smart_capture_result.value}}`, 1 occurrence in `system.flows.json` + dev twin) resolves identically under either interpolator.

**The open question that led to shelving:** shallow vs recursive walker semantics for FLOW parameters.

- **Shallow (this sketch):** only top-level string values in `parameters` are interpolated. An array literal like `capture_patterns: [{ regex: "{{dyn}}" }]` would **not** resolve the nested `{{dyn}}` — the array passes through verbatim as a literal.
- **Recursive (current behavior):** `{{ }}` templates nested inside array/object literals inside parameters are interpolated at any depth.

Audit showed zero current flows use deep interpolation (all 53 templates are top-level). Adopting the shallow walker would make the contract cleaner ("each named parameter is a literal passed verbatim, or a single template evaluated") but removes a capability — albeit one nobody is currently using.

Ron's lean at time of shelving was slightly toward the shallow walker (cleaner contract, fewer hidden semantics, authors who need dynamic values inside nested config can hoist to SET and reference the result as a top-level param). Decision left for a future session.

### Option C — Do nothing (shipped)

Document the limitation (this file), apply the hoist-to-SET workaround as needed (landed for Shopify), revisit only if authoring pain emerges.

## Scope Where JSFE Uses Which Interpolator

Source: `src/index.ts` as of 2026-04-23.

- `interpolateObject` defined around line 1963. Called from:
  - Line 4540 — CALL-TOOL args
  - Line 4373 — FLOW step `parameters`
  - Line 3752 — FLOW step `onFail.parameters`
- `interpolateMessage` defined around line 5832. Used throughout SAY, SAY-GET, FLOW `value`/`name`, and for any free-form string template outside structured argument objects.
- `evaluateExpression` defined around line 5555. Called directly for SET values, CASE conditions, RETURN values, and via `interpolateMessage` / `evaluateSafeCondition`.

## For Future Maintainers

Before modifying any of the three interpolators, recall these invariants:

1. **Null-safe traversal of dot-paths is production-critical.** 23+ existing CALL-TOOL arg templates assume `{{a.b.c}}` resolves to `""` when any intermediate is null. Do not break this.
2. **Type preservation for single-template matches matters.** `{{some_array}}` as a CALL-TOOL arg or FLOW parameter must return the actual array, not its stringified form. `interpolateObject`'s line 1990 `return value !== undefined && value !== null ? value : ''` is load-bearing.
3. **SAY/SET/CASE/RETURN already have full JS.** Consistency with those contexts is the argument for unification, but the cost is borne mostly by CALL-TOOL args (highest traffic + most nested paths).
4. **The hoist-to-SET workaround is always available.** Any pain from the asymmetry has a clean, documented escape hatch.

If this document is being read because someone tripped on the asymmetry again: consider extending this document with the new case before reaching for a JSFE patch. Patterns of pain are more valuable than a one-off fix.
