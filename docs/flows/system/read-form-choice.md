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
   n0["set asked, params, rank_params, chain, stay, others, ranked, none_label"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2["set ranked"]
   c1 -- "none_label" --> b2
   n3(["dispatch: intent detection"])
   class n3 endstep
   b2 --> n3
   c1 -- "else" --> n3
   c4{"case"}
   b5(["reboot → live-agent-requested"])
   class b5 endstep
   c4 -- "reply && reply.key === '__agent'" --> b5
   c6{"case"}
   c4 -- "else" --> c6
   b7["set assignment_side_effect"]
   c6 -- "reply && reply.concern === true" --> b7
   c8{"case"}
   b7 --> c8
   c6 -- "else" --> c8
   b9(["end (back to caller)"])
   class b9 endstep
   c8 -- "reply && reply.concern === true" --> b9
   n10["set picked, owner, args"]
   c8 -- "else" --> n10
   c11{"case"}
   n10 --> c11
   b12["set assignment_side_effect"]
   c11 -- "!picked && args.hits.length" --> b12
   c13{"case"}
   b12 --> c13
   c11 -- "else" --> c13
   b14[["call collect-input-accept"]]
   class b14 flowstep
   c13 -- "!picked && args.hits.length" --> b14
   c15{"case"}
   b14 --> c15
   c13 -- "else" --> c15
   b16(["end (back to caller)"])
   class b16 endstep
   c15 -- "!picked && args.hits.length" --> b16
   c17{"case"}
   c15 -- "else" --> c17
   b18[["call disambiguate-input"]]
   class b18 flowstep
   c17 -- "!picked && args.ambiguous.length" --> b18
   c19{"case"}
   b18 --> c19
   c17 -- "else" --> c19
   b20(["end (back to caller)"])
   class b20 endstep
   c19 -- "!picked && args.ambiguous.length" --> b20
   c21{"case"}
   c19 -- "else" --> c21
   b22["set assignment_side_effect"]
   c21 -- "!picked" --> b22
   c23{"case"}
   b22 --> c23
   c21 -- "else" --> c23
   b24(["end (back to caller)"])
   class b24 endstep
   c23 -- "!picked" --> b24
   n25["set assignment_side_effect, reading"]
   c23 -- "else" --> n25
   c26{"case"}
   n25 --> c26
   b27["set assignment_side_effect"]
   c26 -- "!reading.hits.length" --> b27
   c28{"case"}
   b27 --> c28
   c26 -- "else" --> c28
   b29(["end (back to caller)"])
   class b29 endstep
   c28 -- "!reading.hits.length" --> b29
   n30["set assignment_side_effect"]
   c28 -- "else" --> n30
   n31[["call collect-input-accept"]]
   class n31 flowstep
   n30 --> n31
   DONE(["end (back to caller)"])
   class DONE endstep
   n31 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
