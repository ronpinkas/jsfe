# Operation shopify-search-products

<!-- generated:start -->
**Operation shopify-search-products** · `operation:shopify-search-products` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Execute registered tool shopify-search-products; return its transport outcome.

- **Parameters:** 
  - `request`: Explicit tool arguments
- **Calls:** [operation-failed](../system/operation-failed.md) (system) (replace)
- **Tools:** `shopify-search-products`
- **Called by:** [shopify-ql-products-fetch](shopify-ql-products-fetch.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0[/"tool: shopify-search-products"/]
   class n0 toolstep
   START --> n0
   n0f(["replace → operation-failed"])
   class n0f endstep
   n0 -- "fails" --> n0f
   n1["set noop"]
   n0 --> n1
   DONE(["end (back to caller)"])
   class DONE endstep
   n1 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
