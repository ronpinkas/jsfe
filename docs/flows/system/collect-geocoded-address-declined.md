# CollectGeocodedAddressDeclined

<!-- generated:start -->
**CollectGeocodedAddressDeclined** · `collect-geocoded-address-declined` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Ask which part of the declined address is wrong, re-ask only that part, or start a fresh pass.

- **Parameters:** 
  - `form_instance`: form_instance
- **Calls:** [ask-choice](ask-choice.md) (call), [collect-geocoded-address](collect-geocoded-address.md) (replace)
- **Tools:** none
- **Called by:** [collect-geocoded-address](collect-geocoded-address.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set parent_form, result_input"]
   START --> n0
   n1[["call ask-choice part_question"]]
   class n1 flowstep
   n0 --> n1
   n2["set part"]
   n1 --> n2
   n3(["replace → collect-geocoded-address"])
   class n3 endstep
   n2 --> n3
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
