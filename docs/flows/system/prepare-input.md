# PrepareInput

<!-- generated:start -->
**PrepareInput** · `prepare-input` · version 2.0.0 · worker (called by other flows) · steps · isolated scope

> Worker: run a field or group preparation once before prompting or validation, against committed prerequisites.

- **Parameters:** 
  - `form`: 
  - `input`: 
- **Calls:** {{pi_spec.flow}} (call)
- **Tools:** none
- **Called by:** [collect-input](collect-input.md), [validate-input-batch](validate-input-batch.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set pi_spec"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2[["call #123;#123;pi_spec.flow#125;#125;"]]
   class b2 flowstep
   c1 -- "pi_spec && pi_spec.flow" --> b2
   c3{"case"}
   b2 --> c3
   c1 -- "else" --> c3
   b4["set assignment_side_effect"]
   c3 -- "pi_spec && pi_spec.flow" --> b4
   DONE(["end (back to caller)"])
   class DONE endstep
   b4 --> DONE
   c3 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
