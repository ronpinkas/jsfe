# ShopifyQLOrderDetail

<!-- generated:start -->
**ShopifyQLOrderDetail** · `shopify-ql-order-detail` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Load a focused order only under its verified contact; use shared source lifecycle and exact per-contact caches.

- **Parameters:** none
- **Calls:** [shopify-ql-order-detail-load](shopify-ql-order-detail-load.md) (call), [shopify-ql-order-gate](shopify-ql-order-gate.md) (call), [give-up](../system/give-up.md) (system) (reboot), [load-source](../system/load-source.md) (system) (call)
- **Tools:** none
- **Called by:** [shopify-ql-order-desk](shopify-ql-order-desk.md), [shopify-ql-order-facts-load](shopify-ql-order-facts-load.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   n1[["call shopify-ql-order-gate"]]
   class n1 flowstep
   n0 --> n1
   c2{"case"}
   n1 --> c2
   b3(["reboot → give-up"])
   class b3 endstep
   c2 -- "!cargo.orderFocus" --> b3
   n4["set noop"]
   c2 -- "else" --> n4
   n5[["call load-source"]]
   class n5 flowstep
   n4 --> n5
   n6["set noop"]
   n5 --> n6
   DONE(["end (back to caller)"])
   class DONE endstep
   n6 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
