# AnswerFacts

<!-- generated:start -->
**AnswerFacts** · `answer-facts` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Worker: say the facts `keys` of a provider catalog in one message, each from its path in the source result through its sentence template (say / say_es: {field} formatted by `format`, {name}, [optional part], [first|second]; a list: format { type: 'list', item, join }, {count}, {items}), per language and channel. A missing value says `missing` (never invented). A fact with its own `flow` is answered by that flow. Params: provides, keys.

- **Parameters:** 
  - `provides`: The provider catalog
  - `keys`: Fact keys to say
- **Calls:** {{af_first.flow}} (call), [answer-facts](answer-facts.md) (replace)
- **Tools:** none
- **Called by:** [provide-data](provide-data.md), [answer-facts](answer-facts.md), [provider-menu](provider-menu.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set af_inline, af_flows, af_who, af_text, af_text_es"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2["say: #123;#123;af_text#125;#125;"]
   c1 -- "af_text" --> b2
   n3["set af_first, af_rest"]
   b2 --> n3
   c1 -- "else" --> n3
   c4{"case"}
   n3 --> c4
   b5[["call #123;#123;af_first.flow#125;#125;"]]
   class b5 flowstep
   c4 -- "af_first" --> b5
   c6{"case"}
   b5 --> c6
   c4 -- "else" --> c6
   b7(["replace → answer-facts"])
   class b7 endstep
   c6 -- "af_rest.length #gt; 0" --> b7
   DONE(["end (back to caller)"])
   class DONE endstep
   c6 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
