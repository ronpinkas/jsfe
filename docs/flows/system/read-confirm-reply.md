# ReadConfirmReply

<!-- generated:start -->
**ReadConfirmReply** · `read-confirm-reply` · version 1.4.0 · worker (called by other flows) · steps · isolated scope

> Rank an unreadable answer to a confirmation: it declines (NO), picks another of the form's choices (a correction, read as that input's answer), says a named field read back is wrong (confirm.named_fields: that input is asked again), asks for a person, or is asked again; a withdrawal or a new request leaves with saved form progress. Never confirms.

- **Parameters:** 
  - `form`: 
  - `confirmation`: 
  - `question`: 
  - `question_es`: 
  - `named_fields`: 
  - `reply_context`: 
  - `rank_parameters`: 
  - `invites`: 
- **Calls:** [live-agent-requested](live-agent-requested.md) (reboot), [collect-input-accept](collect-input-accept.md) (call)
- **Tools:** none
- **Called by:** [confirm-form](confirm-form.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set asked, stay, chain, prompt, others, fields, field_arguments, ranked, …"]
   START --> n0
   n1(["dispatch: intent detection"])
   class n1 endstep
   n0 --> n1
   c2{"case"}
   b3(["reboot → live-agent-requested"])
   class b3 endstep
   c2 -- "reply && reply.key === '__agent'" --> b3
   n4["set picked, reading, args"]
   c2 -- "else" --> n4
   c5{"case"}
   n4 --> c5
   b6[["call collect-input-accept"]]
   class b6 flowstep
   c5 -- "reading && reading.hits.length" --> b6
   n7["set field, corrections"]
   b6 --> n7
   c5 -- "else" --> n7
   c8{"case"}
   n7 --> c8
   b9[["call collect-input-accept"]]
   class b9 flowstep
   c8 -- "corrections.length" --> b9
   c10{"case"}
   b9 --> c10
   c8 -- "else" --> c10
   b11["set assignment_side_effect"]
   c10 -- "field && !corrections.length" --> b11
   c12{"case"}
   b11 --> c12
   c10 -- "else" --> c12
   b13[["call collect-input-accept"]]
   class b13 flowstep
   c12 -- "!picked && args.hits.length" --> b13
   n14["set assignment_side_effect"]
   b13 --> n14
   c12 -- "else" --> n14
   DONE(["end (back to caller)"])
   class DONE endstep
   n14 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
