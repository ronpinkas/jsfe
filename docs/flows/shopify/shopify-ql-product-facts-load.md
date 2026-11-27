# ShopifyQLProductFactsLoad

<!-- generated:start -->
**ShopifyQLProductFactsLoad** · `shopify-ql-product-facts-load` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Project only supported facts from the result list actually shown; keep ordinal positions stable.

- **Parameters:** none
- **Calls:** [shopify-ql-shown-products](shopify-ql-shown-products.md) (call)
- **Tools:** none
- **Called by:** [shopify-ql-product-search](shopify-ql-product-search.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0[["call shopify-ql-shown-products"]]
   class n0 flowstep
   START --> n0
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
