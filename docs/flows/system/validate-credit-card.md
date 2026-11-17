# ValidateCreditCard

<!-- generated:start -->
**ValidateCreditCard** · `validate-credit-card` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Form validator: the security code has the length of the card brand, 4 digits for American Express (34, 37) and 3 for every other brand. Params: form, values.

- **Parameters:** 
  - `form`: form instance
  - `values`: the form's values
- **Calls:** no other flow
- **Tools:** none
- **Called by:** [collect-credit-card](collect-credit-card.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set assignment_side_effect"]
   START --> n0
   DONE(["end (back to caller)"])
   class DONE endstep
   n0 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
