# ShopifyQLProductFactsLoad

<!-- generated:start -->
**ShopifyQLProductFactsLoad** · `shopify-ql-product-facts-load` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Project only supported facts from the result list actually shown; keep ordinal positions stable.

- **Parameters:** none
- **Calls:** no other flow
- **Tools:** none
- **Called by:** [shopify-ql-product-search](shopify-ql-product-search.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   DONE(["end (back to caller)"])
   class DONE endstep
   n0 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
