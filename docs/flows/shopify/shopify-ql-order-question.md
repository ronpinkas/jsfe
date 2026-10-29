# ShopifyQLOrderQuestion

<!-- generated:start -->
**ShopifyQLOrderQuestion** · `shopify-ql-order-question` · version 3.0.0 · worker (called by other flows) · form + steps · isolated scope

> Collect one contextual order selection or follow-up using the standard reentrant FORM protocol.

- **Parameters:** 
  - `question`: English contextual question
  - `question_es`: Spanish contextual question
  - `form_instance`: Internal instance to resume
- **Calls:** [shopify-ql-order-reply-check](shopify-ql-order-reply-check.md) (validator), [shopify-ql-order-gate](shopify-ql-order-gate.md) (call), [collect-input-accept](../system/collect-input-accept.md) (system) (call), [run-form](../system/run-form.md) (system) (call), [form-done](../system/form-done.md) (system) (call), [shopify-ql-order-desk](shopify-ql-order-desk.md) (replace)
- **Tools:** none
- **Called by:** [shopify-ql-order-desk](shopify-ql-order-desk.md), [shopify-ql-order-reply-check](shopify-ql-order-reply-check.md)

### Form inputs

```mermaid
flowchart TD
   START(("start"))
   n0[/"reply (order selection or question): text"\]
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
   n2["set initial_readings"]
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
   n10(["replace → shopify-ql-order-desk"])
   class n10 endstep
   n9 --> n10
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
