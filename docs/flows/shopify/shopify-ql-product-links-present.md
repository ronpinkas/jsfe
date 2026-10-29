# ShopifyQLProductLinksPresent

<!-- generated:start -->
**ShopifyQLProductLinksPresent** · `shopify-ql-product-links-present` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Report link delivery only from the guarded send result.

- **Parameters:** 
  - `result`: Action result
  - `request`: Prepared delivery
- **Calls:** no other flow
- **Tools:** none
- **Called by:** [shopify-ql-product-links](shopify-ql-product-links.md) (presents)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2["say: I already texted these product links to that destination. Y…"]
   c1 -- "result && result.status==='not_applicable' && request.to" --> b2
   b3["say: Done, I texted the product links. You can continue your sea…"]
   c1 -- "result && result.status==='sent'" --> b3
   b4["say: Sorry, I couldn't text the links right now."]
   c1 -- "else" --> b4
   DONE(["end (back to caller)"])
   class DONE endstep
   b2 --> DONE
   b3 --> DONE
   b4 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
