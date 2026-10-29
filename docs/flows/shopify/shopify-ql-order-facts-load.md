# ShopifyQLOrderFactsLoad

<!-- generated:start -->
**ShopifyQLOrderFactsLoad** · `shopify-ql-order-facts-load` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Project localized focused-order facts from the verified Shopify detail and available carrier evidence.

- **Parameters:** none
- **Calls:** [shopify-ql-order-detail](shopify-ql-order-detail.md) (call), [shopify-ql-order-carriers](shopify-ql-order-carriers.md) (call), [give-up](../system/give-up.md) (system) (reboot), {{cargo.shopifyOptions.pickup_flow}} (call)
- **Tools:** none
- **Called by:** [shopify-ql-track-order](shopify-ql-track-order.md), [shopify-ql-order-pickup](shopify-ql-order-pickup.md), [shopify-ql-order-track](shopify-ql-order-track.md), [shopify-ql-order-delivery](shopify-ql-order-delivery.md), [shopify-ql-order-items](shopify-ql-order-items.md), [shopify-ql-order-details](shopify-ql-order-details.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   n1[["call shopify-ql-order-detail"]]
   class n1 flowstep
   n0 --> n1
   c2{"case"}
   n1 --> c2
   b3[["call shopify-ql-order-carriers"]]
   class b3 flowstep
   c2 -- "cargo.shopifyOrderFact === 'track' #124;#124; cargo.shopifyOrderFact === 'del…" --> b3
   c4{"case"}
   b3 --> c4
   c2 -- "else" --> c4
   b5(["reboot → give-up"])
   class b5 endstep
   c4 -- "cargo.orderMissing" --> b5
   n6["set noop"]
   c4 -- "else" --> n6
   c7{"case"}
   n6 --> c7
   b8[["call #123;#123;cargo.shopifyOptions.pickup_flow#125;#125;"]]
   class b8 flowstep
   c7 -- "cargo.shopifyOrderFact === 'pickup' && cargo.shopifyOptions && cargo.…" --> b8
   DONE(["end (back to caller)"])
   class DONE endstep
   b8 --> DONE
   c7 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
