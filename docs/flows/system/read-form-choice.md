# ReadFormChoice

<!-- generated:start -->
**ReadFormChoice** · `read-form-choice` · version 1.3.0 · worker (called by other flows) · steps · isolated scope

> Rank an unreadable answer to a choice question and take the offered option it picks, or a request for a person or for text; otherwise ask again. A withdrawal or a new request leaves with saved form progress.

- **Parameters:** 
  - `form`: 
  - `input`: 
  - `question`: 
  - `question_es`: 
  - `choices`: 
  - `firm`: 
- **Calls:** [live-agent-requested](live-agent-requested.md) (reboot), [collect-input-accept](collect-input-accept.md) (call)
- **Tools:** none
- **Called by:** [collect-input](collect-input.md) (by name)

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
   n4["set picked, owner"]
   c2 -- "else" --> n4
   c5{"case"}
   n4 --> c5
   b6["set assignment_side_effect"]
   c5 -- "!picked" --> b6
   c7{"case"}
   b6 --> c7
   c5 -- "else" --> c7
   b8(["end (back to caller)"])
   class b8 endstep
   c7 -- "!picked" --> b8
   n9["set assignment_side_effect, reading"]
   c7 -- "else" --> n9
   c10{"case"}
   n9 --> c10
   b11["set assignment_side_effect"]
   c10 -- "!reading.hits.length" --> b11
   c12{"case"}
   b11 --> c12
   c10 -- "else" --> c12
   b13(["end (back to caller)"])
   class b13 endstep
   c12 -- "!reading.hits.length" --> b13
   n14["set assignment_side_effect"]
   c12 -- "else" --> n14
   n15[["call collect-input-accept"]]
   class n15 flowstep
   n14 --> n15
   DONE(["end (back to caller)"])
   class DONE endstep
   n15 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
