# ReadFormReply

<!-- generated:start -->
**ReadFormReply** · `read-form-reply` · version 1.1.0 · worker (called by other flows) · steps · isolated scope

> Rank an unreadable answer against its question: a request for a person or for text is taken; an answer is asked again; a withdrawal or a new request leaves with saved form progress.

- **Parameters:** 
  - `form`: 
  - `input`: 
  - `question`: 
  - `question_es`: 
- **Calls:** [live-agent-requested](live-agent-requested.md) (reboot)
- **Tools:** none
- **Called by:** [collect-input](collect-input.md) (by name)

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
