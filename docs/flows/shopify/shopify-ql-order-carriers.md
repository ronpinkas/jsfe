# ShopifyQLOrderCarriers

<!-- generated:start -->
**ShopifyQLOrderCarriers** · `shopify-ql-order-carriers` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Load independent shipment status only for a tracking or delivery fact, not an item/details question.

- **Parameters:** none
- **Calls:** [shopify-ql-order-gate](shopify-ql-order-gate.md) (call), [shopify-ql-order-shipments](shopify-ql-order-shipments.md) (call)
- **Tools:** none
- **Called by:** [shopify-ql-order-facts-load](shopify-ql-order-facts-load.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   n1[["call shopify-ql-order-gate"]]
   class n1 flowstep
   n0 --> n1
   n2["set numbers"]
   n1 --> n2
   n3[["call shopify-ql-order-shipments"]]
   class n3 flowstep
   n2 --> n3
   n4["set noop"]
   n3 --> n4
   DONE(["end (back to caller)"])
   class DONE endstep
   n4 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
