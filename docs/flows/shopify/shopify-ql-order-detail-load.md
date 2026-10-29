# ShopifyQLOrderDetailLoad

<!-- generated:start -->
**ShopifyQLOrderDetailLoad** · `shopify-ql-order-detail-load` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Retrieve one verified order, distinguish a missing order from a failed service, and preserve carrier fallback.

- **Parameters:** none
- **Calls:** [shopify-ql-order-gate](shopify-ql-order-gate.md) (call), [give-up](../system/give-up.md) (system) (reboot)
- **Tools:** `shopify-get-order-status`
- **Called by:** [shopify-ql-order-detail](shopify-ql-order-detail.md)

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
   n4["set identifier, result"]
   c2 -- "else" --> n4
   c5{"case"}
   n4 --> c5
   b6[/"tool: shopify-get-order-status"/]
   class b6 toolstep
   c5 -- "!result" --> b6
   b6f(["reboot → give-up"])
   class b6f endstep
   b6 -- "fails" --> b6f
   n7["set normalized"]
   b6 --> n7
   c5 -- "else" --> n7
   c8{"case"}
   n7 --> c8
   b9(["reboot → give-up"])
   class b9 endstep
   c8 -- "result && result.success === true && !normalized" --> b9
   n10["set result, missing"]
   c8 -- "else" --> n10
   c11{"case"}
   n10 --> c11
   b12(["reboot → give-up"])
   class b12 endstep
   c11 -- "!missing && (!result #124;#124; result.success !== true #124;#124; !result.order)" --> b12
   n13["set noop"]
   c11 -- "else" --> n13
   DONE(["end (back to caller)"])
   class DONE endstep
   n13 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
