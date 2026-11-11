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
   n8["set picked, owner, args"]
   c6 -- "else" --> n8
   c9{"case"}
   n8 --> c9
   b10["set assignment_side_effect"]
   c9 -- "!picked && args.hits.length" --> b10
   c11{"case"}
   b10 --> c11
   c9 -- "else" --> c11
   b12[["call collect-input-accept"]]
   class b12 flowstep
   c11 -- "!picked && args.hits.length" --> b12
   c13{"case"}
   b12 --> c13
   c11 -- "else" --> c13
   b14(["end (back to caller)"])
   class b14 endstep
   c13 -- "!picked && args.hits.length" --> b14
   c15{"case"}
   c13 -- "else" --> c15
   b16[["call disambiguate-input"]]
   class b16 flowstep
   c15 -- "!picked && args.ambiguous.length" --> b16
   c17{"case"}
   b16 --> c17
   c15 -- "else" --> c17
   b18(["end (back to caller)"])
   class b18 endstep
   c17 -- "!picked && args.ambiguous.length" --> b18
   c19{"case"}
   c17 -- "else" --> c19
   b20["set assignment_side_effect"]
   c19 -- "!picked" --> b20
   c21{"case"}
   b20 --> c21
   c19 -- "else" --> c21
   b22(["end (back to caller)"])
   class b22 endstep
   c21 -- "!picked" --> b22
   n23["set assignment_side_effect, reading"]
   c21 -- "else" --> n23
   c24{"case"}
   n23 --> c24
   b25["set assignment_side_effect"]
   c24 -- "!reading.hits.length" --> b25
   c26{"case"}
   b25 --> c26
   c24 -- "else" --> c26
   b27(["end (back to caller)"])
   class b27 endstep
   c26 -- "!reading.hits.length" --> b27
   n28["set assignment_side_effect"]
   c26 -- "else" --> n28
   n29[["call collect-input-accept"]]
   class n29 flowstep
   n28 --> n29
   DONE(["end (back to caller)"])
   class DONE endstep
   n29 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
