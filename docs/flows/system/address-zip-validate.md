# AddressZipValidate

<!-- generated:start -->
**AddressZipValidate** · `address-zip-validate` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Read city and state from geocoder evidence for the proposed ZIP; missing geocoder data requires an explicit city.

- **Parameters:** 
  - `form`: form
  - `value`: value
- **Calls:** no other flow
- **Tools:** `geocode-zip`
- **Called by:** [collect-geocoded-address](collect-geocoded-address.md) (validator)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set components"]
   START --> n0
   n1[/"tool: geocode-zip"/]
   class n1 toolstep
   n0 --> n1
   n1f["set result"]
   n1 -- "fails" --> n1f
   n2["set location"]
   n1 --> n2
   n1f --> n2
   DONE(["end (back to caller)"])
   class DONE endstep
   n2 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
