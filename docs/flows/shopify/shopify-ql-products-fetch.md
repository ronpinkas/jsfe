# ShopifyQLProductsFetch

<!-- generated:start -->
**ShopifyQLProductsFetch** · `shopify-ql-products-fetch` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Retrieve a new public catalog result and replace the prior context only with a valid response.

- **Parameters:** none
- **Calls:** [operation:shopify-search-products](operation:shopify-search-products.md) (call), [no-action-needed](../system/no-action-needed.md) (system) (reboot), [shopify-ql-get-search-query](shopify-ql-get-search-query.md) (by name), [shopify-ql-product-dialog](shopify-ql-product-dialog.md) (by name), [shopify-ql-product-stores](shopify-ql-product-stores.md) (by name), [shopify-ql-product-location-retry](shopify-ql-product-location-retry.md) (by name)
- **Tools:** none
- **Called by:** [shopify-ql-product-search](shopify-ql-product-search.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set request"]
   START --> n0
   n1[["call operation:shopify-search-products"]]
   class n1 flowstep
   n0 --> n1
   n2["set result"]
   n1 --> n2
   c3{"case"}
   n2 --> c3
   b4(["reboot → no-action-needed"])
   class b4 endstep
   c3 -- "!result" --> b4
   n5["set noop"]
   c3 -- "else" --> n5
   DONE(["end (back to caller)"])
   class DONE endstep
   n5 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
