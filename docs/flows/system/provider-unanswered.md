# ProviderUnanswered

<!-- generated:start -->
**ProviderUnanswered** · `provider-unanswered` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Worker: a question the provider has no fact for, sent back to it from its own menu: says provides.menu.unanswered.question(_es) and offers that menu's choice unanswered.choice. YES runs it, NO returns to the menu, anything else is DISPATCHed. Param: provides.

- **Parameters:** 
  - `provides`: The provider catalog
- **Calls:** [ask-choice](ask-choice.md) (call), {{pu_flow}} (replace), [provider-menu](provider-menu.md) (replace)
- **Tools:** none
- **Called by:** [provide-data](provide-data.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set pu_choice"]
   START --> n0
   n1[["call ask-choice provides.menu.unanswered.question"]]
   class n1 flowstep
   n0 --> n1
   n2["set pu_yes, pu_no, pu_flow"]
   n1 --> n2
   c3{"case"}
   n2 --> c3
   b4(["replace → #123;#123;pu_flow#125;#125;"])
   class b4 endstep
   c3 -- "pu_flow" --> b4
   b5(["replace → provider-menu"])
   class b5 endstep
   c3 -- "pu_no" --> b5
   b6(["dispatch: intent detection"])
   class b6 endstep
   c3 -- "else" --> b6
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
