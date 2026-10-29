# RequestCancelled

<!-- generated:start -->
**RequestCancelled** · `request-cancelled` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Retire an explicitly withdrawn owning request and acknowledge it; preserve unknown actions for reconciliation.

- **Parameters:** 
  - `form`: 
- **Calls:** no other flow
- **Tools:** none
- **Called by:** nothing (unreachable)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set cancelled"]
   START --> n0
   n1["say: #123;#123;cancelled.recovery.mode === 'hold' ? 'The result of your …"]
   n0 --> n1
   DONE(["end (back to caller)"])
   class DONE endstep
   n1 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
