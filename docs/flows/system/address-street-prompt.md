# AddressStreetPrompt

<!-- generated:start -->
**AddressStreetPrompt** · `address-street-prompt` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Include the ZIP-derived location when asking for the street.

- **Parameters:** 
  - `form`: form
- **Calls:** no other flow
- **Tools:** none
- **Called by:** [collect-geocoded-address](collect-geocoded-address.md) (prepare)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   DONE(["end (back to caller)"])
   class DONE endstep
   n0 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
