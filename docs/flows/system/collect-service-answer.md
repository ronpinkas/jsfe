# CollectServiceAnswer

<!-- generated:start -->
**CollectServiceAnswer** · `collect-service-answer` · worker (called by other flows) · form + steps · isolated scope

> Collect one protocol answer against explicit profiles and the owning FORM ancestry; return its accepted readings and original text.

- **Parameters:** 
  - `profiles`: Declared alternative input profiles
  - `question`: English prompt
  - `question_es`: Spanish prompt
  - `keypad`: Keypad completion metadata
  - `prefill`: An activation answer to validate through the same profiles
  - `context`: Exit context
  - `context_es`: Spanish exit context
  - `stop_path`: State path that completes this protocol without another answer
  - `form_instance`: Internal instance to resume
- **Calls:** [service-answer-raw](service-answer-raw.md) (answer_precheck, by name), [disambiguate-input](disambiguate-input.md) (call), [collect-input-accept](collect-input-accept.md) (call), [run-form](run-form.md) (call), [form-done](form-done.md) (call)
- **Tools:** none
- **Called by:** [get-cell-or-email](get-cell-or-email.md), [get-and-validate-otp-code](get-and-validate-otp-code.md), [generic-retry-with-options](generic-retry-with-options.md), [otp-text-undeliverable](otp-text-undeliverable.md), [ask-email](ask-email.md)

### Form inputs

```mermaid
flowchart TD
   START(("start"))
   n0[/"answer"\]
   class n0 inputstep
   START --> n0
   DONE(["end (back to caller)"])
   class DONE endstep
   n0 --> DONE
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
   b2[["call disambiguate-input"]]
   class b2 flowstep
   c1 -- "service_matches.ambiguous.length #gt; 0" --> b2
   c3{"case"}
   b2 --> c3
   c1 -- "else" --> c3
   b4[["call collect-input-accept"]]
   class b4 flowstep
   c3 -- "!service_matches.ambiguous.length && service_matches.hits.length #gt; 0" --> b4
   n5["set service_prefilled, exit_context, exit_context_es, initial_readings"]
   b4 --> n5
   c3 -- "else" --> n5
   c6{"case"}
   n5 --> c6
   b7[["call collect-input-accept"]]
   class b7 flowstep
   c6 -- "initial_readings.length #gt; 0" --> b7
   n8[["call run-form"]]
   class n8 flowstep
   b7 --> n8
   c6 -- "else" --> n8
   c9{"case"}
   n8 --> c9
   b10["set assignment_side_effect"]
   c9 -- "rf_status === 'stopped'" --> b10
   c11{"case"}
   b10 --> c11
   c9 -- "else" --> c11
   b12(["end (back to caller)"])
   class b12 endstep
   c11 -- "rf_status !== 'complete' #124;#124; !cargo.forms[form_instance]" --> b12
   n13["set noop"]
   c11 -- "else" --> n13
   n14[["call form-done"]]
   class n14 flowstep
   n13 --> n14
   DONE(["end (back to caller)"])
   class DONE endstep
   n14 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
