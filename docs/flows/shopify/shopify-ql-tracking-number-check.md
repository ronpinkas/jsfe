# ShopifyQLTrackingNumberCheck

<!-- generated:start -->
**ShopifyQLTrackingNumberCheck** · `shopify-ql-tracking-number-check` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Normalize a complete carrier identifier without joining arbitrary spoken words into a false number.

- **Parameters:** 
  - `value`: Carrier number
  - `reading`: Original input reading
- **Calls:** [shopify-ql-order-desk](shopify-ql-order-desk.md) (reboot), [shopify-ql-tracking-unavailable](shopify-ql-tracking-unavailable.md) (reboot)
- **Tools:** none
- **Called by:** [shopify-ql-tracking-inputs](shopify-ql-tracking-inputs.md) (validator)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set recovery"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2(["reboot → shopify-ql-order-desk"])
   class b2 endstep
   c1 -- "recovery.kind==='order' && recovery.number" --> b2
   c3{"case"}
   c1 -- "else" --> c3
   b4(["reboot → shopify-ql-tracking-unavailable"])
   class b4 endstep
   c3 -- "recovery.kind==='invoice' #124;#124; recovery.kind==='order' #124;#124; recovery.kind…" --> b4
   n5["set number"]
   c3 -- "else" --> n5
   DONE(["end (back to caller)"])
   class DONE endstep
   n5 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
