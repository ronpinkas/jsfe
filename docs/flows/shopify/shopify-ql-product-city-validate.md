# ShopifyQLProductCityValidate

<!-- generated:start -->
**ShopifyQLProductCityValidate** · `shopify-ql-product-city-validate` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Classify a candidate place before accepting it or requesting inventory.

- **Parameters:** 
  - `value`: Candidate location
  - `form`: Owning form
  - `reading`: FORM reading and activation provenance
- **Calls:** no other flow
- **Tools:** none
- **Called by:** [shopify-ql-product-stores](shopify-ql-product-stores.md) (validator), [shopify-ql-product-location-retry](shopify-ql-product-location-retry.md) (validator)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2(["dispatch: intent detection"])
   class b2 endstep
   c1 -- "!reading #124;#124; reading.origin!=='activation'" --> b2
   n3["set noop"]
   c1 -- "else" --> n3
   DONE(["end (back to caller)"])
   class DONE endstep
   n3 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
