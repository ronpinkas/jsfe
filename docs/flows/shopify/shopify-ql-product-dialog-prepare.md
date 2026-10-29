# ShopifyQLProductDialogPrepare

<!-- generated:start -->
**ShopifyQLProductDialogPrepare** · `shopify-ql-product-dialog-prepare` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Offer only supported store and text actions for this channel.

- **Parameters:** 
  - `form`: Owning form
- **Calls:** no other flow
- **Tools:** none
- **Called by:** [shopify-ql-product-dialog](shopify-ql-product-dialog.md) (prepare)

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
