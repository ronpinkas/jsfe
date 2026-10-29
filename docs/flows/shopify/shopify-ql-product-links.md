# ShopifyQLProductLinks

<!-- generated:start -->
**ShopifyQLProductLinks** · `shopify-ql-product-links` · version 3.0.0 · worker (called by other flows) · form + steps · isolated scope

> Send only the product links shown, to the explicitly resolved text destination, after a TEXT request.

- **Parameters:** 
  - `form_instance`: Internal instance to resume
- **Calls:** [send-text-action](../system/send-text-action.md) (system) (call), [shopify-ql-product-links-prepare](shopify-ql-product-links-prepare.md) (prepares, call), [shopify-ql-product-links-present](shopify-ql-product-links-present.md) (presents, call), [text-destination](../system/text-destination.md) (system) (call), [collect-input-accept](../system/collect-input-accept.md) (system) (call), [run-form](../system/run-form.md) (system) (call), [give-up](../system/give-up.md) (system) (reboot), [perform-action](../system/perform-action.md) (system) (call), [form-done](../system/form-done.md) (system) (call)
- **Tools:** none
- **Called by:** [shopify-ql-product-dialog](shopify-ql-product-dialog.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set form_internal_resume, form_instance, assignment_side_effect, form_arg…"]
   START --> n0
   n1[["call text-destination"]]
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
   n9[["call shopify-ql-product-links-prepare"]]
   class n9 flowstep
   n8 --> n9
   n10["set pf_request, pf_action"]
   n9 --> n10
   c11{"case"}
   n10 --> c11
   b12(["reboot → give-up"])
   class b12 endstep
   c11 -- "!(pf_action === null #124;#124; pf_action && typeof pf_action === 'object' &&…" --> b12
   n13["set pf_record"]
   c11 -- "else" --> n13
   c14{"case"}
   n13 --> c14
   b15[["call perform-action"]]
   class b15 flowstep
   c14 -- "pf_action && typeof pf_action === 'object'" --> b15
   c16{"case"}
   b15 --> c16
   c14 -- "else" --> c16
   n17["set pf_result, pf_receipt, pf_projected"]
   c16 -- "pf_action === null" --> n17
   c16 -- "else" --> n17
   n18[["call shopify-ql-product-links-present"]]
   class n18 flowstep
   n17 --> n18
   n19[["call form-done"]]
   class n19 flowstep
   n18 --> n19
   DONE(["end (back to caller)"])
   class DONE endstep
   n19 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
