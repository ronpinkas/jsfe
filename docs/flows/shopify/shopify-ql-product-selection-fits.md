# ShopifyQLProductSelectionFits

<!-- generated:start -->
**ShopifyQLProductSelectionFits** · `shopify-ql-product-selection-fits` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> route_keys handler at the store product question: the answer fits several shown products (key fits:<numbers>); says which, counts an attempt, and the form asks the question again.

- **Parameters:** 
  - `form`: Owning form
  - `input`: The asked input
- **Calls:** no other flow
- **Tools:** none
- **Called by:** [shopify-ql-product-stores](shopify-ql-product-stores.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set fits_list, fits_list_es"]
   START --> n0
   n1["say: That fits products #123;#123;fits_list#125;#125;."]
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
