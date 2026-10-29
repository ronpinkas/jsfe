# CollectGeocodedAddress

<!-- generated:start -->
**CollectGeocodedAddress** · `collect-geocoded-address` · version 1.0.0 · worker (called by other flows) · form + steps · isolated scope

> Collect a mailing address in any order, project geocoder evidence, and read the complete address back for confirmation.

- **Parameters:** 
  - `given`: given
  - `form_instance`: Internal instance to resume
- **Calls:** [address-zip-prompt](address-zip-prompt.md) (prepare), [address-zip-validate](address-zip-validate.md) (validator), [address-city-prompt](address-city-prompt.md) (prepare), [address-street-prompt](address-street-prompt.md) (prepare), [address-street-validate](address-street-validate.md) (validator), [collect-input-accept](collect-input-accept.md) (call), [run-form](run-form.md) (call), [confirm-form](confirm-form.md) (call), [collect-geocoded-address](collect-geocoded-address.md) (replace), [collect-geocoded-address-declined](collect-geocoded-address-declined.md) (replace), [form-done](form-done.md) (call)
- **Tools:** none
- **Called by:** [collect-geocoded-address](collect-geocoded-address.md), [collect-geocoded-address-declined](collect-geocoded-address-declined.md)

### Form inputs

```mermaid
flowchart TD
   START(("start"))
   n0[/"zip (ZIP code): digits"\]
   class n0 inputstep
   START --> n0
   n1[/"city (city): when [object Object] · choice"\]
   class n1 inputstep
   n0 --> n1
   n2[/"city_state (city and state): when [object Object] · text"\]
   class n2 inputstep
   n1 --> n2
   n3[/"street (street address): pattern"\]
   class n3 inputstep
   n2 --> n3
   n4[/"unit (apartment or unit): pattern"\]
   class n4 inputstep
   n3 --> n4
   DONE(["end (back to caller)"])
   class DONE endstep
   n4 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set form_internal_resume, form_instance, assignment_side_effect, form_arg…"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2[["call collect-input-accept"]]
   class b2 flowstep
   c1 -- "initial_readings.length #gt; 0" --> b2
   n3[["call run-form"]]
   class n3 flowstep
   b2 --> n3
   c1 -- "else" --> n3
   c4{"case"}
   n3 --> c4
   b5(["end (back to caller)"])
   class b5 endstep
   c4 -- "rf_status !== 'complete' #124;#124; !cargo.forms[form_instance]" --> b5
   n6["set address_result, form_should_confirm"]
   c4 -- "else" --> n6
   c7{"case"}
   n6 --> c7
   b8["set form_confirm_q"]
   c7 -- "form_should_confirm === true" --> b8
   c9{"case"}
   b8 --> c9
   c7 -- "else" --> c9
   b10["set form_confirm_q_es"]
   c9 -- "form_should_confirm === true" --> b10
   c11{"case"}
   b10 --> c11
   c9 -- "else" --> c11
   b12[["call confirm-form"]]
   class b12 flowstep
   c11 -- "form_should_confirm === true" --> b12
   c13{"case"}
   b12 --> c13
   c11 -- "else" --> c13
   b14["CASE"]
   c13 -- "form_should_confirm === true" --> b14
   n15["set noop"]
   b14 --> n15
   c13 -- "else" --> n15
   n16[["call form-done"]]
   class n16 flowstep
   n15 --> n16
   DONE(["end (back to caller)"])
   class DONE endstep
   n16 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
