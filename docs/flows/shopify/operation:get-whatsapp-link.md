# Operation get-whatsapp-link

<!-- generated:start -->
**Operation get-whatsapp-link** · `operation:get-whatsapp-link` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Execute registered tool get-whatsapp-link; return its transport outcome.

- **Parameters:** 
  - `request`: Explicit tool arguments
- **Calls:** [operation-failed](../system/operation-failed.md) (system) (replace)
- **Tools:** `get-whatsapp-link`
- **Called by:** [shopify-ql-product-links-prepare](shopify-ql-product-links-prepare.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0[/"tool: get-whatsapp-link"/]
   class n0 toolstep
   START --> n0
   n0f(["replace → operation-failed"])
   class n0f endstep
   n0 -- "fails" --> n0f
   n1["set noop"]
   n0 --> n1
   DONE(["end (back to caller)"])
   class DONE endstep
   n1 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
