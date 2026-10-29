# ShopifyQLTrackingInputs

<!-- generated:start -->
**ShopifyQLTrackingInputs** · `shopify-ql-tracking-inputs` · version 3.0.0 · worker (called by other flows) · form + steps · isolated scope

> Collect a carrier tracking number through generic input matching; answer where to find it before resuming.

- **Parameters:** 
  - `tracking_number`: Tracking number already supplied
  - `intro_message`: English lead-in
  - `intro_message_es`: Spanish lead-in
  - `form_instance`: Internal instance to resume
- **Calls:** [shopify-ql-tracking-number-check](shopify-ql-tracking-number-check.md) (validator), [shopify-ql-tracking-help](shopify-ql-tracking-help.md) (call), [shopify-ql-tracking-unavailable](shopify-ql-tracking-unavailable.md) (call), [shopify-ql-order-gate](shopify-ql-order-gate.md) (call), [collect-input-accept](../system/collect-input-accept.md) (system) (call), [run-form](../system/run-form.md) (system) (call), [form-done](../system/form-done.md) (system) (call)
- **Tools:** none
- **Called by:** [shopify-ql-shipstation-track-by-number-verified](shopify-ql-shipstation-track-by-number-verified.md)

### Form inputs

```mermaid
flowchart TD
   START(("start"))
   n0[/"tracking_number (tracking number): pattern"\]
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
   n1[["call shopify-ql-order-gate"]]
   class n1 flowstep
   n0 --> n1
   n2["set question, question_es, initial_readings"]
   n1 --> n2
   c3{"case"}
   n2 --> c3
   b4[["call collect-input-accept"]]
   class b4 flowstep
   c3 -- "initial_readings.length #gt; 0" --> b4
   n5[["call run-form"]]
   class n5 flowstep
   b4 --> n5
   c3 -- "else" --> n5
   c6{"case"}
   n5 --> c6
   b7(["end (back to caller)"])
   class b7 endstep
   c6 -- "rf_status !== 'complete' #124;#124; !cargo.forms[form_instance]" --> b7
   n8["set noop"]
   c6 -- "else" --> n8
   n9[["call form-done"]]
   class n9 flowstep
   n8 --> n9
   DONE(["end (back to caller)"])
   class DONE endstep
   n9 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
