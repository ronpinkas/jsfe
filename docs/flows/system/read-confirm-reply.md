# ReadConfirmReply

<!-- generated:start -->
**ReadConfirmReply** · `read-confirm-reply` · version 1.3.0 · worker (called by other flows) · steps · isolated scope

> Rank an unreadable answer to a confirmation: it declines (NO), picks another of the form's choices (a correction, read as that input's answer), says a named field read back is wrong (confirm.named_fields: that input is asked again), asks for a person, or is asked again; a withdrawal or a new request leaves with saved form progress. Never confirms.

- **Parameters:** 
  - `form`: 
  - `question`: 
  - `question_es`: 
  - `named_fields`: 
- **Calls:** [live-agent-requested](live-agent-requested.md) (reboot), [collect-input-accept](collect-input-accept.md) (call)
- **Tools:** none
- **Called by:** [confirm-form](confirm-form.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set asked, chain, others, fields, ranked"]
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
   n7["set field"]
   b6 --> n7
   c5 -- "else" --> n7
   c8{"case"}
   n7 --> c8
   b9["set assignment_side_effect"]
   c8 -- "field" --> b9
   n10["set assignment_side_effect"]
   b9 --> n10
   c8 -- "else" --> n10
   DONE(["end (back to caller)"])
   class DONE endstep
   n10 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
