# ShopifyQLOrdersFetch

<!-- generated:start -->
**ShopifyQLOrdersFetch** · `shopify-ql-orders-fetch` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Load the verified customer orders through the shared subject-scoped source lifecycle.

- **Parameters:** none
- **Calls:** [shopify-ql-orders-load](shopify-ql-orders-load.md) (call), [shopify-ql-order-gate](shopify-ql-order-gate.md) (call), [load-source](../system/load-source.md) (system) (call)
- **Tools:** none
- **Called by:** [shopify-ql-order-desk](shopify-ql-order-desk.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   n1[["call shopify-ql-order-gate"]]
   class n1 flowstep
   n0 --> n1
   n2[["call load-source"]]
   class n2 flowstep
   n1 --> n2
   DONE(["end (back to caller)"])
   class DONE endstep
   n2 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
