# ShopifyQLTrackingHelp

<!-- generated:start -->
**ShopifyQLTrackingHelp** · `shopify-ql-tracking-help` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Explain where a carrier number is found once per owned tracking form, then hand off without an indefinite re-ask.

- **Parameters:** none
- **Calls:** [shopify-ql-tracking-unavailable](shopify-ql-tracking-unavailable.md) (reboot)
- **Tools:** none
- **Called by:** [shopify-ql-tracking-inputs](shopify-ql-tracking-inputs.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set owner"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2(["reboot → shopify-ql-tracking-unavailable"])
   class b2 endstep
   c1 -- "!owner #124;#124; Number(owner.data.trackingHelpTries #124;#124; 0)#gt;=1" --> b2
   n3["set noop"]
   c1 -- "else" --> n3
   n4["say: Your tracking number is in the shipping confirmation we sen…"]
   n3 --> n4
   DONE(["end (back to caller)"])
   class DONE endstep
   n4 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
