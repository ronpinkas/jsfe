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
   c4{"case"}
   c2 -- "else" --> c4
   b5["set assignment_side_effect"]
   c4 -- "reply && reply.concern === true" --> b5
   c6{"case"}
   b5 --> c6
   c4 -- "else" --> c6
   b7(["end (back to caller)"])
   class b7 endstep
   c6 -- "reply && reply.concern === true" --> b7
   n8["set picked, reading, args"]
   c6 -- "else" --> n8
   c9{"case"}
   n8 --> c9
   b10[["call collect-input-accept"]]
   class b10 flowstep
   c9 -- "reading && reading.hits.length" --> b10
   n11["set field, corrections"]
   b10 --> n11
   c9 -- "else" --> n11
   c12{"case"}
   n11 --> c12
   b13[["call collect-input-accept"]]
   class b13 flowstep
   c12 -- "corrections.length" --> b13
   c14{"case"}
   b13 --> c14
   c12 -- "else" --> c14
   b15["set assignment_side_effect"]
   c14 -- "field && !corrections.length" --> b15
   c16{"case"}
   b15 --> c16
   c14 -- "else" --> c16
   b17[["call collect-input-accept"]]
   class b17 flowstep
   c16 -- "!picked && args.hits.length" --> b17
   n18["set assignment_side_effect"]
   b17 --> n18
   c16 -- "else" --> n18
   DONE(["end (back to caller)"])
   class DONE endstep
   n18 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
