# ShopifyQLProductSelectionPrepare

<!-- generated:start -->
**ShopifyQLProductSelectionPrepare** · `shopify-ql-product-selection-prepare` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Offer only the product positions the channel actually showed, each labelled with every attribute the product carries (shopify-ql-shown-products: title, brand, option values, the price the list reads) so the reply ranker can match any of them.

- **Parameters:** 
  - `form`: Owning form
- **Calls:** [shopify-ql-shown-products](shopify-ql-shown-products.md) (call)
- **Tools:** none
- **Called by:** [shopify-ql-product-stores](shopify-ql-product-stores.md) (prepare)

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
