# GlobalExit

<!-- generated:start -->
**GlobalExit** · `global-exit` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Worker (started by the engine): the caller exited; give the support closing with the outcome in force.

- **Parameters:** 
  - `exit_outcome`: The declared outcome in force when the caller exited (resolved: thanks)
  - `support_context`: What the caller needed help with (the question's exit_context), English
  - `support_context_es`: The same in Spanish
- **Calls:** [contact-support](contact-support.md) (reboot)
- **Tools:** none
- **Called by:** nothing (unreachable)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   n1(["reboot → contact-support"])
   class n1 endstep
   n0 --> n1
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
