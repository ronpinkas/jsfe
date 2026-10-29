# ReadFormResponse

<!-- generated:start -->
**ReadFormResponse** · `read-form-response` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Read the requested field with contextual DISPATCH: an answer continues, an answer with nothing usable is asked again, a withdrawal or a new request leaves with saved form progress.

- **Parameters:** 
  - `form`: 
  - `input`: 
- **Calls:** no other flow
- **Tools:** none
- **Called by:** [validate-input-batch](validate-input-batch.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set group, spec, question, reply"]
   START --> n0
   n1(["dispatch: intent detection"])
   class n1 endstep
   n0 --> n1
   c2{"case"}
   b3["set assignment_side_effect"]
   c2 -- "!reply #124;#124; typeof reply.answer !== 'string' #124;#124; !reply.answer.trim()" --> b3
   DONE(["end (back to caller)"])
   class DONE endstep
   b3 --> DONE
   c2 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
