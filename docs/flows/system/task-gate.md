# TaskGate

<!-- generated:start -->
**TaskGate** · `task-gate` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Mark the lifecycle of a task-owned gate so private provider questions wait for the existing gate rather than opening another.

- **Parameters:** 
  - `form`: Owning FORM instance
  - `gate`: Stable gate service identifier
  - `active`: Whether this gate is active
- **Calls:** no other flow
- **Tools:** none
- **Called by:** [authenticate-user](authenticate-user.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
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
