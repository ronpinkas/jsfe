# ShopifyQLOrderShipments

<!-- generated:start -->
**ShopifyQLOrderShipments** · `shopify-ql-order-shipments` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Retrieve each distinct package tracking number once under the already verified focused order; preserve per-package fallback.

- **Parameters:** 
  - `numbers`: Distinct carrier numbers
- **Calls:** [shopify-ql-order-gate](shopify-ql-order-gate.md) (call), [give-up](../system/give-up.md) (system) (reboot), [shopify-ql-order-shipments](shopify-ql-order-shipments.md) (replace)
- **Tools:** `shipstation-get-tracking`
- **Called by:** [shopify-ql-order-shipments](shopify-ql-order-shipments.md), [shopify-ql-order-carriers](shopify-ql-order-carriers.md)

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
   n4["set number"]
   c2 -- "else" --> n4
   c5{"case"}
   n4 --> c5
   b6(["end (back to caller)"])
   class b6 endstep
   c5 -- "!number" --> b6
   n7["set noop"]
   c5 -- "else" --> n7
   c8{"case"}
   n7 --> c8
   b9[/"tool: shipstation-get-tracking"/]
   class b9 toolstep
   c8 -- "!cargo.orderShipmentTracking[cargo.orderFocus][number]" --> b9
   b9f["set result"]
   b9 -- "fails" --> b9f
   n10["set result, remaining"]
   b9 --> n10
   b9f --> n10
   c8 -- "else" --> n10
   n11(["replace → shopify-ql-order-shipments"])
   class n11 endstep
   n10 --> n11
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
