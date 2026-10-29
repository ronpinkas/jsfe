# ShopifyQLOrdersLoad

<!-- generated:start -->
**ShopifyQLOrdersLoad** · `shopify-ql-orders-load` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Retrieve orders for exactly the verified email or phone; a different proposed customer provides no orders.

- **Parameters:** none
- **Calls:** [shopify-ql-order-gate](shopify-ql-order-gate.md) (call), [give-up](../system/give-up.md) (system) (reboot)
- **Tools:** `shopify-lookup-orders`
- **Called by:** [shopify-ql-orders-fetch](shopify-ql-orders-fetch.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   n1[["call shopify-ql-order-gate"]]
   class n1 flowstep
   n0 --> n1
   n2["set identifier"]
   n1 --> n2
   n3[/"tool: shopify-lookup-orders"/]
   class n3 toolstep
   n2 --> n3
   n3f(["reboot → give-up"])
   class n3f endstep
   n3 -- "fails" --> n3f
   c4{"case"}
   n3 --> c4
   b5(["reboot → give-up"])
   class b5 endstep
   c4 -- "!result #124;#124; result.success !== true #124;#124; !Array.isArray(result.orders) #124;…" --> b5
   n6["set result"]
   c4 -- "else" --> n6
   DONE(["end (back to caller)"])
   class DONE endstep
   n6 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
