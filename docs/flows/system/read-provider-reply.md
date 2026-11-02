# ReadProviderReply

<!-- generated:start -->
**ReadProviderReply** · `read-provider-reply` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Rank a menu reply its phrases do not settle: a fact or action it picks, the other facts it also asks for, or a request for a person; a withdrawal or a new request leaves.

- **Parameters:** 
  - `question`: 
  - `question_es`: 
  - `choices`: 
- **Calls:** [live-agent-requested](live-agent-requested.md) (reboot)
- **Tools:** none
- **Called by:** [provider-menu](provider-menu.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set asked, ranked"]
   START --> n0
   n1(["dispatch: intent detection"])
   class n1 endstep
   n0 --> n1
   c2{"case"}
   b3(["reboot → live-agent-requested"])
   class b3 endstep
   c2 -- "reply && reply.key === '__agent'" --> b3
   n4["set assignment_side_effect"]
   c2 -- "else" --> n4
   DONE(["end (back to caller)"])
   class DONE endstep
   n4 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
