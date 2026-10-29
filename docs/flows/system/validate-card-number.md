# ValidateCardNumber

<!-- generated:start -->
**ValidateCardNumber** · `validate-card-number` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Validator: a card number passes the Luhn check (validateCardNumber). Params: input, value.

- **Parameters:** 
  - `input`: input name
  - `value`: the reading
- **Calls:** no other flow
- **Tools:** none
- **Called by:** [collect-card-number](collect-card-number.md) (validator), [collect-credit-card](collect-credit-card.md) (validator), [confirm-form](confirm-form.md) (validator)

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
