# LoadSource

<!-- generated:start -->
**LoadSource** · `load-source` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Worker: load a provider's data when missing or stale (refresh: per_session | per_turn | max_age_ms) through the tenant's loader flow (source.flow), which writes source.result. Still missing after the loader: give-up (a service the caller needs failed). Param: source.

- **Parameters:** 
  - `source`: { flow, result, refresh, max_age_ms }
- **Calls:** {{source.flow}} (call), [give-up](give-up.md) (reboot)
- **Tools:** none
- **Called by:** [provide-data](provide-data.md), [shopify-ql-orders-fetch](../shopify/shopify-ql-orders-fetch.md) (shopify), [shopify-ql-order-detail](../shopify/shopify-ql-order-detail.md) (shopify), [shopify-ql-shipstation-track-by-number-verified](../shopify/shopify-ql-shipstation-track-by-number-verified.md) (shopify)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set ls_stale"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2["set assignment_side_effect"]
   c1 -- "ls_stale" --> b2
   c3{"case"}
   b2 --> c3
   c1 -- "else" --> c3
   b4[["call #123;#123;source.flow#125;#125;"]]
   class b4 flowstep
   c3 -- "ls_stale" --> b4
   n5["set ls_have"]
   b4 --> n5
   c3 -- "else" --> n5
   c6{"case"}
   n5 --> c6
   b7(["reboot → give-up"])
   class b7 endstep
   c6 -- "!ls_have" --> b7
   DONE(["end (back to caller)"])
   class DONE endstep
   c6 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
