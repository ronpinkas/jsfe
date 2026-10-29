# ShopifyQLTrackingUnavailable

<!-- generated:start -->
**ShopifyQLTrackingUnavailable** · `shopify-ql-tracking-unavailable` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> End an unavailable tracking exchange with the configured support contact; never invent a delivery date.

- **Parameters:** none
- **Calls:** [contact-support](../system/contact-support.md) (system) (reboot)
- **Tools:** none
- **Called by:** [shopify-ql-tracking-help](shopify-ql-tracking-help.md), [shopify-ql-tracking-inputs](shopify-ql-tracking-inputs.md), [shopify-ql-tracking-number-check](shopify-ql-tracking-number-check.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   n1(["reboot → contact-support"])
   class n1 endstep
   n0 --> n1
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
