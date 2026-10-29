# ShopifyQLProductLinksPrepare

<!-- generated:start -->
**ShopifyQLProductLinksPrepare** · `shopify-ql-product-links-prepare` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Prepare links for exactly the products the channel showed, without including unoffered results.

- **Parameters:** 
  - `form`: Owning delivery form
- **Calls:** [operation:get-whatsapp-link](operation:get-whatsapp-link.md) (call)
- **Tools:** none
- **Called by:** [shopify-ql-product-links](shopify-ql-product-links.md) (prepares)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0[["call operation:get-whatsapp-link"]]
   class n0 flowstep
   START --> n0
   n1["set wa"]
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
