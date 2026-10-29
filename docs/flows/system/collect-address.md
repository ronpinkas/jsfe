# CollectAddress

<!-- generated:start -->
**CollectAddress** · `collect-address` · version 1.0.0 · worker (called by other flows) · form + steps · isolated scope

> Sub-form: street address, city, state, ZIP, in any order. Result: the parent's result input (or cargo.formResults['collect-address']).

- **Parameters:** 
  - `form_instance`: Internal instance to resume
- **Calls:** [collect-input-accept](collect-input-accept.md) (call), [run-form](run-form.md) (call), [form-done](form-done.md) (call)
- **Tools:** none
- **Called by:** nothing (unreachable)

### Form inputs

```mermaid
flowchart TD
   START(("start"))
   n0[/"street_address (street address): text"\]
   class n0 inputstep
   START --> n0
   n1[/"city (city): text"\]
   class n1 inputstep
   n0 --> n1
   n2[/"state (state): pattern"\]
   class n2 inputstep
   n1 --> n2
   n3[/"zip (ZIP code): digits"\]
   class n3 inputstep
   n2 --> n3
   DONE(["end (back to caller)"])
   class DONE endstep
   n3 --> DONE
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
   n6[["call form-done"]]
   class n6 flowstep
   c4 -- "else" --> n6
   DONE(["end (back to caller)"])
   class DONE endstep
   n6 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
