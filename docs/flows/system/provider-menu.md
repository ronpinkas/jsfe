# ProviderMenu

<!-- generated:start -->
**ProviderMenu** · `provider-menu` · version 1.1.0 · worker (called by other flows) · steps · isolated scope

> Worker: after a provider answered, offer its menu (provides.menu: question(_voice)(_es) with {verb} / {name}; choices [{ key, phrases, flow, exact, set }]; done { phrases, say(_es) }). A fact or set named by its words is answered and the menu comes back (menu.whole_phrases: only when the phrase is the whole reply; a phrase inside a sentence goes to the reply ranker, whose no-pick is the host's); an action runs its flow (replace) after setting its `set` cargo fields; done says goodbye. Other phrases: DISPATCH. No phrases: asked once more, then 'anything else?'. Params: provides, retry.

- **Parameters:** 
  - `provides`: The provider catalog
  - `retry`: '1' on the re-ask
- **Calls:** [ask-choice](ask-choice.md) (call), [read-provider-reply](read-provider-reply.md) (call), [answer-facts](answer-facts.md) (call), {{pm_flow}} (replace), [provider-menu](provider-menu.md) (replace)
- **Tools:** none
- **Called by:** [provide-data](provide-data.md), [provider-menu](provider-menu.md), [provider-unanswered](provider-unanswered.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set pm_who, pm_q, pm_q_es, pm_choices"]
   START --> n0
   n1[["call ask-choice pm_q"]]
   class n1 flowstep
   n0 --> n1
   n2["set pm_key, pm_contained, assignment_side_effect"]
   n1 --> n2
   c3{"case"}
   n2 --> c3
   b4[["call read-provider-reply"]]
   class b4 flowstep
   c3 -- "pm_contained" --> b4
   n5["set pm_also, pm_key, assignment_side_effect, pm_keys, pm_close, pm_flow, …"]
   b4 --> n5
   c3 -- "else" --> n5
   c6{"case"}
   n5 --> c6
   b7[["call answer-facts"]]
   class b7 flowstep
   c6 -- "pm_keys.length #gt; 0" --> b7
   b8(["replace → #123;#123;pm_flow#125;#125;"])
   class b8 endstep
   c6 -- "pm_flow" --> b8
   b9["say: #123;#123;pm_bye#125;#125;"]
   c6 -- "pm_key === 'done'" --> b9
   b10(["dispatch: intent detection"])
   class b10 endstep
   c6 -- "/[a-záéíóúüñ]/i.test(String(cargo.choiceText #124;#124; ''))" --> b10
   b11(["replace → provider-menu"])
   class b11 endstep
   c6 -- "retry !== '1'" --> b11
   b12["say: #123;#123;pm_sorry#125;#125;"]
   c6 -- "else" --> b12
   c13{"case"}
   b7 --> c13
   b9 --> c13
   b12 --> c13
   b14["say: #123;#123;anythingElse('en', pm_who)#125;#125;"]
   c13 -- "pm_close" --> b14
   c15{"case"}
   b14 --> c15
   c13 -- "else" --> c15
   b16(["replace → provider-menu"])
   class b16 endstep
   c15 -- "pm_keys.length #gt; 0 && !pm_close" --> b16
   DONE(["end (back to caller)"])
   class DONE endstep
   c15 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
