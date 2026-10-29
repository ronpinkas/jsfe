# DisambiguateInput

<!-- generated:start -->
**DisambiguateInput** · `disambiguate-input` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Worker: the answer fits two or more inputs at the same scope (or a declared confirm_against pair). Stores the unambiguous readings, asks which input the rest was for (keys 1..n, never 8), stores the pick. No pick: nothing stored, not a miss. Params: readings, hits.

- **Parameters:** 
  - `readings`: The ambiguous readings
  - `hits`: Readings to store as they are
  - `remaining`: 
- **Calls:** [collect-input-accept](collect-input-accept.md) (call), [ask-choice](ask-choice.md) (call), [disambiguate-input](disambiguate-input.md) (replace)
- **Tools:** none
- **Called by:** [collect-input](collect-input.md), [collect-input-accept](collect-input-accept.md), [disambiguate-input](disambiguate-input.md), [confirm-form](confirm-form.md), [collect-service-answer](collect-service-answer.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2[["call collect-input-accept"]]
   class b2 flowstep
   c1 -- "Array.isArray(hits) && hits.length #gt; 0" --> b2
   n3["set di_keys, di_choices, di_value, di_q, di_q_es, di_form, di_must, di_in…"]
   b2 --> n3
   c1 -- "else" --> n3
   n4[["call ask-choice di_prompt"]]
   class n4 flowstep
   n3 --> n4
   n5["set assignment_side_effect, di_pick"]
   n4 --> n5
   c6{"case"}
   n5 --> c6
   b7["set assignment_side_effect"]
   c6 -- "di_pick" --> b7
   n8["set di_words"]
   b7 --> n8
   c6 -- "else" --> n8
   c9{"case"}
   n8 --> c9
   b10(["dispatch: intent detection"])
   class b10 endstep
   c9 -- "!di_pick && di_words #gt;= 3 && !di_must" --> b10
   c11{"case"}
   c9 -- "else" --> c11
   b12["set di_misses"]
   c11 -- "!di_pick" --> b12
   c13{"case"}
   b12 --> c13
   c11 -- "else" --> c13
   b14(["dispatch: intent detection"])
   class b14 endstep
   c13 -- "!di_pick && di_misses #gt;= 2 && !di_must" --> b14
   c15{"case"}
   c13 -- "else" --> c15
   b16(["replace → disambiguate-input"])
   class b16 endstep
   c15 -- "!di_pick" --> b16
   c17{"case"}
   c15 -- "else" --> c17
   b18[["call collect-input-accept"]]
   class b18 flowstep
   c17 -- "di_pick" --> b18
   n19["set di_next, di_rest"]
   b18 --> n19
   c17 -- "else" --> n19
   c20{"case"}
   n19 --> c20
   b21(["replace → disambiguate-input"])
   class b21 endstep
   c20 -- "di_next.length #gt; 0" --> b21
   DONE(["end (back to caller)"])
   class DONE endstep
   c20 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
