# ShopifyQLShipStationTrackByNumberVerified

<!-- generated:start -->
**ShopifyQLShipStationTrackByNumberVerified** · `shopify-ql-shipstation-track-by-number-verified` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Verify the contact, collect a carrier number, retrieve real status and permit one explicit not-found correction.

- **Parameters:** 
  - `tracking_number`: Carrier tracking number
  - `intro_message`: Optional introduction
  - `intro_message_es`: Optional Spanish introduction
  - `tn_attempt`: Internal bounded correction marker
- **Calls:** [shopify-ql-tracking-load](shopify-ql-tracking-load.md) (call), [shopify-ql-order-gate](shopify-ql-order-gate.md) (call), [shopify-ql-tracking-inputs](shopify-ql-tracking-inputs.md) (call), [load-source](../system/load-source.md) (system) (call), [shopify-ql-shipstation-track-by-number-verified](shopify-ql-shipstation-track-by-number-verified.md) (replace), [give-up](../system/give-up.md) (system) (reboot)
- **Tools:** none
- **Called by:** [shopify-ql-track-order](shopify-ql-track-order.md), [shopify-ql-no-orders](shopify-ql-no-orders.md), [shopify-ql-shipstation-track-by-number-verified](shopify-ql-shipstation-track-by-number-verified.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   n1[["call shopify-ql-order-gate"]]
   class n1 flowstep
   n0 --> n1
   n2[["call shopify-ql-tracking-inputs"]]
   class n2 flowstep
   n1 --> n2
   n3["set noop"]
   n2 --> n3
   n4[["call load-source"]]
   class n4 flowstep
   n3 --> n4
   n5["set tracking_detail, tn_clean"]
   n4 --> n5
   c6{"case"}
   n5 --> c6
   b7["say: Here's the latest on tracking number #123;#123;cargo.voice ? 'endin…"]
   c6 -- "tracking_detail.success" --> b7
   b8(["replace → shopify-ql-shipstation-track-by-number-verified"])
   class b8 endstep
   c6 -- "tracking_detail.notFound && !tn_attempt" --> b8
   b9(["reboot → give-up"])
   class b9 endstep
   c6 -- "else" --> b9
   DONE(["end (back to caller)"])
   class DONE endstep
   b7 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
