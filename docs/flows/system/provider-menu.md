# ProviderMenu

<!-- generated:start -->
**ProviderMenu** · `provider-menu` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Worker: after a provider answered, offer its menu (provides.menu: question(_voice)(_es) with {verb} / {name}; choices [{ key, phrases, flow, exact, set }]; done { phrases, say(_es) }). A fact or set named by its words is answered and the menu comes back; an action runs its flow (replace) after setting its `set` cargo fields; done says goodbye. Other phrases: DISPATCH. No phrases: asked once more, then 'anything else?'. Params: provides, retry.

- **Parameters:** 
  - `provides`: The provider catalog
  - `retry`: '1' on the re-ask
- **Calls:** [ask-choice](ask-choice.md) (call), [answer-facts](answer-facts.md) (call), {{pm_flow}} (replace), [provider-menu](provider-menu.md) (replace)
- **Tools:** none
- **Called by:** [provide-data](provide-data.md), [provider-menu](provider-menu.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set pm_who, pm_q, pm_q_es, pm_choices"]
   START --> n0
   n1[["call ask-choice pm_q"]]
   class n1 flowstep
   n0 --> n1
   n2["set pm_key, pm_keys, pm_close, pm_flow, pm_bye, pm_bye_es, pm_sorry, pm_s…"]
   n1 --> n2
   c3{"case"}
   n2 --> c3
   b4[["call answer-facts"]]
   class b4 flowstep
   c3 -- "pm_keys.length #gt; 0" --> b4
   b5(["replace → #123;#123;pm_flow#125;#125;"])
   class b5 endstep
   c3 -- "pm_flow" --> b5
   b6["say: #123;#123;pm_bye#125;#125;"]
   c3 -- "pm_key === 'done'" --> b6
   b7(["dispatch: intent detection"])
   class b7 endstep
   c3 -- "/[a-záéíóúüñ]/i.test(String(cargo.choiceText #124;#124; ''))" --> b7
   b8(["replace → provider-menu"])
   class b8 endstep
   c3 -- "retry !== '1'" --> b8
   b9["say: #123;#123;pm_sorry#125;#125;"]
   c3 -- "else" --> b9
   c10{"case"}
   b4 --> c10
   b6 --> c10
   b9 --> c10
   b11["say: #123;#123;anythingElse('en', pm_who)#125;#125;"]
   c10 -- "pm_close" --> b11
   c12{"case"}
   b11 --> c12
   c10 -- "else" --> c12
   b13(["replace → provider-menu"])
   class b13 endstep
   c12 -- "pm_keys.length #gt; 0 && !pm_close" --> b13
   DONE(["end (back to caller)"])
   class DONE endstep
   c12 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
