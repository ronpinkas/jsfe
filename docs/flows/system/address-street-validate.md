# AddressStreetValidate

<!-- generated:start -->
**AddressStreetValidate** · `address-street-validate` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Validate a proposed street against its ZIP; retain unverified wording when geocoding is inconclusive.

- **Parameters:** 
  - `form`: form
  - `value`: value
  - `values`: values
- **Calls:** no other flow
- **Tools:** `geocode-street`
- **Called by:** [collect-geocoded-address](collect-geocoded-address.md) (validator)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   c1{"case"}
   n0 --> c1
   c2{"case"}
   c1 -- "!/^\d#123;1,6#125;\s+[A-Za-z\xC0-\xFF]/.test(String(value))" --> c2
   c1 -- "else" --> c2
   b3(["end (back to caller)"])
   class b3 endstep
   c2 -- "!/^\d#123;1,6#125;\s+[A-Za-z\xC0-\xFF]/.test(String(value))" --> b3
   n4["set components"]
   c2 -- "else" --> n4
   n5[/"tool: geocode-street"/]
   class n5 toolstep
   n4 --> n5
   n5f["set result"]
   n5 -- "fails" --> n5f
   n6["set location"]
   n5 --> n6
   n5f --> n6
   DONE(["end (back to caller)"])
   class DONE endstep
   n6 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
