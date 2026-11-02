# ConfirmForm

<!-- generated:start -->
**ConfirmForm** · `confirm-form` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Worker: ask a form's confirmation (exact YES / NO; keys 1 and 2). A correction instead ('no, make it $40') is read against the form chain and stored, and the result is 'changed' so the form runs again; an answer with words it cannot read goes to the reply ranker (read-confirm-reply); an unclear one is asked again, and after two the give-up worker takes over. Result: cargo.formConfirm[form] = 'yes' | 'no' | 'changed'. Params: form, question(_es), exit_context(_es).

- **Parameters:** 
  - `form`: form
  - `question`: question
  - `question_es`: question_es
  - `exit_context`: exit_context
  - `exit_context_es`: exit_context_es
  - `phrases`: phrases
  - `words`: words
  - `interrupts`: interrupts
  - `no_keys`: no_keys
  - `clarifications`: clarifications
  - `invites`: invites
  - `named_fields`: true: an answer that names one of the form's inputs (its names) without a value re-asks only that input
- **Calls:** [validate-card-number](validate-card-number.md) (validator), [validate-card-expiration](validate-card-expiration.md) (validator), [validate-card-cvv](validate-card-cvv.md) (validator), [ask-choice](ask-choice.md) (call), {{cf_event}} (reboot), [collect-input-accept](collect-input-accept.md) (call), [provide-data](provide-data.md) (call), [disambiguate-input](disambiguate-input.md) (call), [read-confirm-reply](read-confirm-reply.md) (call), [give-up](give-up.md) (reboot)
- **Tools:** none
- **Called by:** [collect-geocoded-address](collect-geocoded-address.md), [confirm-input-proposal](confirm-input-proposal.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set assignment_side_effect, cf_choices, cf_chain, cf_amount, cf_prompt, c…"]
   START --> n0
   n1[["call ask-choice cf_prompt"]]
   class n1 flowstep
   n0 --> n1
   n2["set assignment_side_effect, cf_event"]
   n1 --> n2
   c3{"case"}
   n2 --> c3
   b4(["reboot → #123;#123;cf_event#125;#125;"])
   class b4 endstep
   c3 -- "cf_event" --> b4
   n5["set cf_chain, cf_questions, cf_provides, cf_skip_gate, cf_current, cf_m, …"]
   c3 -- "else" --> n5
   c6{"case"}
   n5 --> c6
   b7[["call collect-input-accept"]]
   class b7 flowstep
   c6 -- "cf_m.questions.length #gt; 0 && cf_m.hits.length #gt; 0" --> b7
   c8{"case"}
   b7 --> c8
   c6 -- "else" --> c8
   b9[["call provide-data"]]
   class b9 flowstep
   c8 -- "cf_m.questions.length #gt; 0" --> b9
   n10["set cf_must"]
   b9 --> n10
   c8 -- "else" --> n10
   c11{"case"}
   n10 --> c11
   b12["set cf_result"]
   c11 -- "cf_m.questions.length #gt; 0" --> b12
   b13["set cf_result"]
   c11 -- "cargo.choice === 'yes'" --> b13
   b14[["call disambiguate-input"]]
   class b14 flowstep
   c11 -- "cf_m.ambiguous.length #gt; 0" --> b14
   b15[["call collect-input-accept"]]
   class b15 flowstep
   c11 -- "cf_m.hits.length #gt; 0" --> b15
   b16["set cf_result"]
   c11 -- "cargo.choice === 'no'" --> b16
   b17["set cf_result"]
   c11 -- "Array.isArray(clarifications) && pickChoice(String(cargo.choiceText #124;…" --> b17
   b18[["call read-confirm-reply"]]
   class b18 flowstep
   c11 -- "!cf_must && cf_words #gt; 0" --> b18
   b19["set cf_result"]
   c11 -- "else" --> b19
   n20["set cf_result, cf_tries"]
   b12 --> n20
   b13 --> n20
   b14 --> n20
   b15 --> n20
   b16 --> n20
   b17 --> n20
   b18 --> n20
   b19 --> n20
   c21{"case"}
   n20 --> c21
   b22(["dispatch: intent detection"])
   class b22 endstep
   c21 -- "(cf_tries #gt;= 2 && !cf_must) && !!formIncompleteOutcome(cargo,form,#123;ou…" --> b22
   c23{"case"}
   c21 -- "else" --> c23
   c24{"case"}
   c23 -- "cf_tries #gt;= 2 && !cf_must" --> c24
   c23 -- "else" --> c24
   b25(["reboot → give-up"])
   class b25 endstep
   c24 -- "cf_tries #gt;= 2 && !cf_must" --> b25
   c26{"case"}
   c24 -- "else" --> c26
   b27["set assignment_side_effect"]
   c26 -- "cf_result === 'yes'" --> b27
   n28["set assignment_side_effect"]
   b27 --> n28
   c26 -- "else" --> n28
   DONE(["end (back to caller)"])
   class DONE endstep
   n28 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
