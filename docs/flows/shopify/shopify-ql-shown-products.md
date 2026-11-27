# ShopifyQLShownProducts

<!-- generated:start -->
**ShopifyQLShownProducts** · `shopify-ql-shown-products` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> The products the channel showed, each with every attribute it carries (title, brand, option values, the price the list reads) and its label for the reply ranker, into cargo.shopifyShown; the one place a listed product is described, for its readers, its labels and the price the list speaks.

- **Parameters:** none
- **Calls:** no other flow
- **Tools:** none
- **Called by:** [shopify-ql-product-facts-load](shopify-ql-product-facts-load.md), [shopify-ql-shown-product-read](shopify-ql-shown-product-read.md), [shopify-ql-product-selection-prepare](shopify-ql-product-selection-prepare.md)

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
