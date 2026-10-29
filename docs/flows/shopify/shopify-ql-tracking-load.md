# ShopifyQLTrackingLoad

<!-- generated:start -->
**ShopifyQLTrackingLoad** · `shopify-ql-tracking-load` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Retrieve carrier status for an explicitly collected number; no inferred delivery state.

- **Parameters:** none
- **Calls:** [shopify-ql-order-gate](shopify-ql-order-gate.md) (call), [give-up](../system/give-up.md) (system) (reboot)
- **Tools:** `shipstation-get-tracking`
- **Called by:** [shopify-ql-shipstation-track-by-number-verified](shopify-ql-shipstation-track-by-number-verified.md)

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
   c2 -- "!cargo.shopifyTrackingNumber #124;#124; !/^[A-Z0-9]#123;8,40#125;$/.test(cargo.shopif…" --> b3
   n4[/"tool: shipstation-get-tracking"/]
   class n4 toolstep
   c2 -- "else" --> n4
   n4f(["reboot → give-up"])
   class n4f endstep
   n4 -- "fails" --> n4f
   n5["set result"]
   n4 --> n5
   c6{"case"}
   n5 --> c6
   b7(["reboot → give-up"])
   class b7 endstep
   c6 -- "!result #124;#124; !result.success && !result.notFound" --> b7
   n8["set noop"]
   c6 -- "else" --> n8
   DONE(["end (back to caller)"])
   class DONE endstep
   n8 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
