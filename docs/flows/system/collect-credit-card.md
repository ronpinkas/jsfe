# CollectCreditCard

<!-- generated:start -->
**CollectCreditCard** · `collect-credit-card` · version 1.0.0 · worker (called by other flows) · form + steps · isolated scope

> Sub-form: card number, expiration, security code, billing ZIP, in any order. Result (with keep_pii for the charge step): the parent's result input.

- **Parameters:** 
  - `form_instance`: Internal instance to resume
- **Calls:** [validate-card-number](validate-card-number.md) (validator), [validate-card-expiration](validate-card-expiration.md) (validator), [validate-card-cvv](validate-card-cvv.md) (validator), [collect-input-accept](collect-input-accept.md) (call), [run-form](run-form.md) (call), [validate-credit-card](validate-credit-card.md) (call), {{form_exhaustion.flow}} (reboot), [give-up](give-up.md) (reboot), [collect-credit-card](collect-credit-card.md) (replace), [form-done](form-done.md) (call)
- **Tools:** none
- **Called by:** [collect-credit-card](collect-credit-card.md)

### Form inputs

```mermaid
flowchart TD
   START(("start"))
   n0[/"card_number (card number): digits"\]
   class n0 inputstep
   START --> n0
   n1[/"card_expiration (expiration date): pattern"\]
   class n1 inputstep
   n0 --> n1
   n2[/"card_cvv (security code): digits"\]
   class n2 inputstep
   n1 --> n2
   n3[/"card_zip (billing ZIP code): digits"\]
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
   n6["set form_values, assignment_side_effect"]
   c4 -- "else" --> n6
   n7[["call validate-credit-card"]]
   class n7 flowstep
   n6 --> n7
   c8{"case"}
   n7 --> c8
   b9(["end (back to caller)"])
   class b9 endstep
   c8 -- "!cargo.forms[form_instance]" --> b9
   n10["set form_validation"]
   c8 -- "else" --> n10
   c11{"case"}
   n10 --> c11
   b12["set form_exhaustion"]
   c11 -- "form_validation === 'failed'" --> b12
   c13{"case"}
   b12 --> c13
   c11 -- "else" --> c13
   b14(["reboot → #123;#123;form_exhaustion.flow#125;#125;"])
   class b14 endstep
   c13 -- "form_exhaustion" --> b14
   c15{"case"}
   c13 -- "else" --> c15
   b16(["dispatch: intent detection"])
   class b16 endstep
   c15 -- "(form_validation === 'failed') && !!formIncompleteOutcome(cargo,form_…" --> b16
   c17{"case"}
   c15 -- "else" --> c17
   c18{"case"}
   c17 -- "form_validation === 'failed'" --> c18
   c17 -- "else" --> c18
   b19(["reboot → give-up"])
   class b19 endstep
   c18 -- "form_validation === 'failed'" --> b19
   c20{"case"}
   c18 -- "else" --> c20
   b21["set assignment_side_effect"]
   c20 -- "form_validation === 'retry' && cargo.formCheck.message" --> b21
   c22{"case"}
   b21 --> c22
   c20 -- "else" --> c22
   b23(["replace → collect-credit-card"])
   class b23 endstep
   c22 -- "form_validation === 'retry'" --> b23
   n24[["call form-done"]]
   class n24 flowstep
   c22 -- "else" --> n24
   DONE(["end (back to caller)"])
   class DONE endstep
   n24 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
