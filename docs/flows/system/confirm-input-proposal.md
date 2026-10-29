# ConfirmInputProposal

<!-- generated:start -->
**ConfirmInputProposal** · `confirm-input-proposal` · version 1.0.0 · worker (called by other flows) · form + steps · isolated scope

> Confirm an owned validated input candidate; retain it on yield and authorize only normal input acceptance.

- **Parameters:** 
  - `input`: Owning input awaiting proposal confirmation
  - `form_instance`: Internal instance to resume
- **Calls:** [collect-input-accept](collect-input-accept.md) (call), [form-done](form-done.md) (replace, call), [run-form](run-form.md) (call), [confirm-form](confirm-form.md) (call), [confirm-input-proposal](confirm-input-proposal.md) (replace), [confirm-input-proposal-declined](confirm-input-proposal-declined.md) (replace)
- **Tools:** none
- **Called by:** [run-form](run-form.md), [confirm-input-proposal](confirm-input-proposal.md)

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
   c1 -- "proposal_readings.length #gt; 0" --> b2
   n3["set proposal"]
   b2 --> n3
   c1 -- "else" --> n3
   c4{"case"}
   n3 --> c4
   b5(["replace → form-done"])
   class b5 endstep
   c4 -- "!proposal #124;#124; !['pending','confirmed'].includes(proposal.status) #124;#124; pr…" --> b5
   n6["set assignment_side_effect, form_confirmation, initial_readings"]
   c4 -- "else" --> n6
   c7{"case"}
   n6 --> c7
   b8[["call collect-input-accept"]]
   class b8 flowstep
   c7 -- "initial_readings.length #gt; 0" --> b8
   n9[["call run-form"]]
   class n9 flowstep
   b8 --> n9
   c7 -- "else" --> n9
   c10{"case"}
   n9 --> c10
   b11(["end (back to caller)"])
   class b11 endstep
   c10 -- "rf_status !== 'complete' #124;#124; !cargo.forms[form_instance]" --> b11
   n12["set form_should_confirm"]
   c10 -- "else" --> n12
   c13{"case"}
   n12 --> c13
   b14["set form_confirm_q"]
   c13 -- "form_should_confirm === true" --> b14
   c15{"case"}
   b14 --> c15
   c13 -- "else" --> c15
   b16["set form_confirm_q_es"]
   c15 -- "form_should_confirm === true" --> b16
   c17{"case"}
   b16 --> c17
   c15 -- "else" --> c17
   b18[["call confirm-form"]]
   class b18 flowstep
   c17 -- "form_should_confirm === true" --> b18
   c19{"case"}
   b18 --> c19
   c17 -- "else" --> c19
   b20["CASE"]
   c19 -- "form_should_confirm === true" --> b20
   n21["set assignment_side_effect"]
   b20 --> n21
   c19 -- "else" --> n21
   n22[["call form-done"]]
   class n22 flowstep
   n21 --> n22
   DONE(["end (back to caller)"])
   class DONE endstep
   n22 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
