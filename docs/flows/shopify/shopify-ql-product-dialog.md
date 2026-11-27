# ShopifyQLProductDialog

<!-- generated:start -->
**ShopifyQLProductDialog** · `shopify-ql-product-dialog` · version 3.0.0 · worker (called by other flows) · form + steps · isolated scope

> Collect the next question about shown products; unknown requests yield through the shared FORM contract.

- **Parameters:** 
  - `completion`: Outcome already presented before this optional follow-up
  - `form_instance`: Internal instance to resume
- **Calls:** [shopify-ql-product-dialog-prepare](shopify-ql-product-dialog-prepare.md) (prepare), [shopify-ql-product-dialog-validate](shopify-ql-product-dialog-validate.md) (validator), [collect-input-accept](../system/collect-input-accept.md) (system) (call), [run-form](../system/run-form.md) (system) (call), [shopify-ql-shown-product-read](shopify-ql-shown-product-read.md) (call), [form-done](../system/form-done.md) (system) (call), [shopify-ql-product-links](shopify-ql-product-links.md) (call), [shopify-ql-product-search](shopify-ql-product-search.md) (replace), [shopify-ql-product-dialog](shopify-ql-product-dialog.md) (replace)
- **Tools:** none
- **Called by:** [shopify-ql-product-search](shopify-ql-product-search.md), [shopify-ql-products-fetch](shopify-ql-products-fetch.md) (by name), [shopify-ql-product-dialog](shopify-ql-product-dialog.md)

### Form inputs

```mermaid
flowchart TD
   START(("start"))
   n0[/"response (product question or selection): pattern"\]
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
   n6["set has_stores, followup_said"]
   c4 -- "else" --> n6
   n7[["call shopify-ql-shown-product-read"]]
   class n7 flowstep
   n6 --> n7
   n8["set next"]
   n7 --> n8
   c9{"case"}
   n8 --> c9
   b10[["call form-done"]]
   class b10 flowstep
   c9 -- "next.done" --> b10
   c11{"case"}
   b10 --> c11
   c9 -- "else" --> c11
   b12(["return to host / AI"])
   class b12 endstep
   c11 -- "next.done" --> b12
   n13[["call form-done"]]
   class n13 flowstep
   c11 -- "else" --> n13
   c14{"case"}
   n13 --> c14
   b15[["call shopify-ql-product-links"]]
   class b15 flowstep
   c14 -- "next.text" --> b15
   c16{"case"}
   b15 --> c16
   c14 -- "else" --> c16
   b17(["replace → shopify-ql-product-search"])
   class b17 endstep
   c16 -- "!next.text" --> b17
   n18(["replace → shopify-ql-product-dialog"])
   class n18 endstep
   c16 -- "else" --> n18
   n19[["call form-done"]]
   class n19 flowstep
   DONE(["end (back to caller)"])
   class DONE endstep
   n19 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
