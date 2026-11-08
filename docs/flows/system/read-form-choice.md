# ReadFormChoice

<!-- generated:start -->
**ReadFormChoice** · `read-form-choice` · version 1.4.0 · worker (called by other flows) · steps · isolated scope

> Rank an unreadable answer to a choice question and take the offered option it picks, or a request for a person or for text; otherwise ask again. A withdrawal or a new request leaves with saved form progress.

- **Parameters:** 
  - `form`: 
  - `input`: 
  - `question`: 
  - `question_es`: 
  - `choices`: 
  - `firm`: 
- **Calls:** [live-agent-requested](live-agent-requested.md) (reboot), [collect-input-accept](collect-input-accept.md) (call), [disambiguate-input](disambiguate-input.md) (call)
- **Tools:** none
- **Called by:** [collect-input](collect-input.md) (by name)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set asked, params, rank_params, chain, stay, others, ranked"]
   START --> n0
   n1(["dispatch: intent detection"])
   class n1 endstep
   n0 --> n1
   c2{"case"}
   b3(["reboot → live-agent-requested"])
   class b3 endstep
   c2 -- "reply && reply.key === '__agent'" --> b3
   n4["set picked, owner, args"]
   c2 -- "else" --> n4
   c5{"case"}
   n4 --> c5
   b6["set assignment_side_effect"]
   c5 -- "!picked && args.hits.length" --> b6
   c7{"case"}
   b6 --> c7
   c5 -- "else" --> c7
   b8[["call collect-input-accept"]]
   class b8 flowstep
   c7 -- "!picked && args.hits.length" --> b8
   c9{"case"}
   b8 --> c9
   c7 -- "else" --> c9
   b10(["end (back to caller)"])
   class b10 endstep
   c9 -- "!picked && args.hits.length" --> b10
   c11{"case"}
   c9 -- "else" --> c11
   b12[["call disambiguate-input"]]
   class b12 flowstep
   c11 -- "!picked && args.ambiguous.length" --> b12
   c13{"case"}
   b12 --> c13
   c11 -- "else" --> c13
   b14(["end (back to caller)"])
   class b14 endstep
   c13 -- "!picked && args.ambiguous.length" --> b14
   c15{"case"}
   c13 -- "else" --> c15
   b16["set assignment_side_effect"]
   c15 -- "!picked" --> b16
   c17{"case"}
   b16 --> c17
   c15 -- "else" --> c17
   b18(["end (back to caller)"])
   class b18 endstep
   c17 -- "!picked" --> b18
   n19["set assignment_side_effect, reading"]
   c17 -- "else" --> n19
   c20{"case"}
   n19 --> c20
   b21["set assignment_side_effect"]
   c20 -- "!reading.hits.length" --> b21
   c22{"case"}
   b21 --> c22
   c20 -- "else" --> c22
   b23(["end (back to caller)"])
   class b23 endstep
   c22 -- "!reading.hits.length" --> b23
   n24["set assignment_side_effect"]
   c22 -- "else" --> n24
   n25[["call collect-input-accept"]]
   class n25 flowstep
   n24 --> n25
   DONE(["end (back to caller)"])
   class DONE endstep
   n25 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
