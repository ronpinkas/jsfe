# ShopifyQLProductStoresPresent

<!-- generated:start -->
**ShopifyQLProductStoresPresent** · `shopify-ql-product-stores-present` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Present live store inventory without fabricating locations, quantities or geocoding success.

- **Parameters:** 
  - `result`: Store result
- **Calls:** no other flow
- **Tools:** none
- **Called by:** [shopify-ql-product-stores](shopify-ql-product-stores.md), [shopify-ql-product-location-retry](shopify-ql-product-location-retry.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set locator, result"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2["say: #123;#123;(result.productTitle #124;#124; 'This product')+' Available for p…"]
   c1 -- "result && result.success===true && result.found===true && Array.isArr…" --> b2
   b3["say: This product is not currently available for in-store pickup…"]
   c1 -- "result && result.success===true && result.found===false" --> b3
   b4["say: I couldn't find that location. #123;#123;locator?'You can see our s…"]
   c1 -- "result && /could not geocode/i.test(String(result.error #124;#124; ''))" --> b4
   b5["say: Sorry, I could not check store availability right now. Plea…"]
   c1 -- "else" --> b5
   DONE(["end (back to caller)"])
   class DONE endstep
   b2 --> DONE
   b3 --> DONE
   b4 --> DONE
   b5 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
