# ServiceAnswerRaw

<!-- generated:start -->
**ServiceAnswerRaw** · `service-answer-raw` · version 1.0.0 · worker (called by other flows) · steps · shared scope

> Leave protocol commands to their owning service rather than the generic menu transport.

- **Parameters:** 
  - `answer`: Raw answer
- **Calls:** no other flow
- **Tools:** none
- **Called by:** [collect-service-answer](collect-service-answer.md) (answer_precheck, by name)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set answer_key"]
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
