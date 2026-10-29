# ReadConfirmReply

<!-- generated:start -->
**ReadConfirmReply** · `read-confirm-reply` · version 1.2.0 · worker (called by other flows) · steps · isolated scope

> Rank an unreadable answer to a confirmation: it declines (NO), picks another of the form's choices (a correction, read as that input's answer), asks for a person, or is asked again; a withdrawal or a new request leaves with saved form progress. Never confirms.

- **Parameters:** 
  - `form`: 
  - `question`: 
  - `question_es`: 
- **Calls:** [live-agent-requested](live-agent-requested.md) (reboot), [collect-input-accept](collect-input-accept.md) (call)
- **Tools:** none
- **Called by:** [confirm-form](confirm-form.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set asked, chain, others, ranked"]
   START --> n0
   n1(["dispatch: intent detection"])
   class n1 endstep
   n0 --> n1
   c2{"case"}
   b3(["reboot → live-agent-requested"])
   class b3 endstep
   c2 -- "reply && reply.key === '__agent'" --> b3
   n4["set picked, reading"]
   c2 -- "else" --> n4
   c5{"case"}
   n4 --> c5
   b6[["call collect-input-accept"]]
   class b6 flowstep
   c5 -- "reading && reading.hits.length" --> b6
   n7["set assignment_side_effect"]
   b6 --> n7
   c5 -- "else" --> n7
   DONE(["end (back to caller)"])
   class DONE endstep
   n7 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
