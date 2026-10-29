# ShopifyQLProductVariant

<!-- generated:start -->
**ShopifyQLProductVariant** · `shopify-ql-product-variant` · version 3.0.0 · worker (called by other flows) · form + steps · isolated scope

> Choose one descriptively labeled source variant for physical-store inventory. Online stock never implies the intended variant.

- **Parameters:** 
  - `form_instance`: Internal instance to resume
- **Calls:** [collect-input-accept](../system/collect-input-accept.md) (system) (call), [run-form](../system/run-form.md) (system) (call), [form-done](../system/form-done.md) (system) (call)
- **Tools:** none
- **Called by:** [shopify-ql-product-stores](shopify-ql-product-stores.md) (sub-form, definition)

### Form inputs

```mermaid
flowchart TD
   START(("start"))
   n0[/"choice (variant number): choice"\]
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
   n6["set noop"]
   c4 -- "else" --> n6
   n7[["call form-done"]]
   class n7 flowstep
   n6 --> n7
   DONE(["end (back to caller)"])
   class DONE endstep
   n7 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
