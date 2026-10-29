# ShopifyQLProductDialog

<!-- generated:start -->
**ShopifyQLProductDialog** · `shopify-ql-product-dialog` · version 3.0.0 · worker (called by other flows) · form + steps · isolated scope

> Collect the next question about shown products; unknown requests yield through the shared FORM contract.

- **Parameters:** 
  - `completion`: Outcome already presented before this optional follow-up
  - `form_instance`: Internal instance to resume
- **Calls:** [shopify-ql-product-dialog-prepare](shopify-ql-product-dialog-prepare.md) (prepare), [shopify-ql-product-dialog-validate](shopify-ql-product-dialog-validate.md) (validator), [collect-input-accept](../system/collect-input-accept.md) (system) (call), [run-form](../system/run-form.md) (system) (call), [form-done](../system/form-done.md) (system) (call), [shopify-ql-product-links](shopify-ql-product-links.md) (call), [shopify-ql-product-search](shopify-ql-product-search.md) (replace), [shopify-ql-product-dialog](shopify-ql-product-dialog.md) (replace)
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
   n6["set has_stores, next"]
   c4 -- "else" --> n6
   c7{"case"}
   n6 --> c7
   b8[["call form-done"]]
   class b8 flowstep
   c7 -- "next.done" --> b8
   c9{"case"}
   b8 --> c9
   c7 -- "else" --> c9
   b10(["return to host / AI"])
   class b10 endstep
   c9 -- "next.done" --> b10
   n11[["call form-done"]]
   class n11 flowstep
   c9 -- "else" --> n11
   c12{"case"}
   n11 --> c12
   b13[["call shopify-ql-product-links"]]
   class b13 flowstep
   c12 -- "next.text" --> b13
   c14{"case"}
   b13 --> c14
   c12 -- "else" --> c14
   b15(["replace → shopify-ql-product-search"])
   class b15 endstep
   c14 -- "!next.text" --> b15
   n16(["replace → shopify-ql-product-dialog"])
   class n16 endstep
   c14 -- "else" --> n16
   n17[["call form-done"]]
   class n17 flowstep
   DONE(["end (back to caller)"])
   class DONE endstep
   n17 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
