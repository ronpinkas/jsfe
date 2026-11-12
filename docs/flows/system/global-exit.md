# GlobalExit

<!-- generated:start -->
**GlobalExit** · `global-exit` · version 1.1.0 · worker (called by other flows) · steps · isolated scope

> Worker (started by the engine): the caller exited; say the process was cancelled at their request (thanks when the outcome in force is resolved) and offer more help.

- **Parameters:** 
  - `exit_outcome`: The declared outcome in force when the caller exited (resolved: thanks)
  - `support_context`: What the caller needed help with (the question's exit_context), English; not spoken since 1.52.0
  - `support_context_es`: The same in Spanish
- **Calls:** no other flow
- **Tools:** none
- **Called by:** nothing (unreachable)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   n1["say: #123;#123;exit_outcome === 'resolved' ? 'Thank you for contacting u…"]
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
