# ConfirmForm

<!-- generated:start -->
**ConfirmForm** · `confirm-form` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Worker: ask a form's confirmation (YES / NO, keys 1 and 2; firm only when an action it authorizes is a payment; otherwise soft: YES is read as a soft confirmation's and offered to the reply ranker). A correction instead ('no, make it $40') is read against the form chain and stored, and the result is 'changed' so the form runs again; an answer with words it cannot read goes to the reply ranker (read-confirm-reply); an unclear one is asked again, and after four the give-up worker takes over. Result: cargo.formConfirm[form] = 'yes' | 'no' | 'changed'. Params: form, question(_es), exit_context(_es).

- **Parameters:** 
  - `form`: form
  - `confirmation`: confirmation
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
  - `rank_parameters`: rank_parameters
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
   n10["set cf_must, cf_clarify"]
   b9 --> n10
   c8 -- "else" --> n10
   c11{"case"}
   n10 --> c11
   b12["say: #123;#123;confirmOutOfOrderLine(cf_clarify,cf_clarify.value,'en',ca…"]
   c11 -- "cf_clarify" --> b12
   c13{"case"}
   b12 --> c13
   c11 -- "else" --> c13
   b14["set cf_result"]
   c13 -- "cf_clarify" --> b14
   b15["set cf_result"]
   c13 -- "cf_m.questions.length #gt; 0" --> b15
   b16["set cf_result"]
   c13 -- "cargo.choice === 'yes'" --> b16
   b17[["call disambiguate-input"]]
   class b17 flowstep
   c13 -- "cf_m.ambiguous.length #gt; 0" --> b17
   b18[["call collect-input-accept"]]
   class b18 flowstep
   c13 -- "cf_m.hits.length #gt; 0" --> b18
   b19["set cf_result"]
   c13 -- "cargo.choice === 'no'" --> b19
   b20["set cf_result"]
   c13 -- "Array.isArray(clarifications) && pickChoice(String(cargo.choiceText #124;…" --> b20
   b21[["call read-confirm-reply"]]
   class b21 flowstep
   c13 -- "cf_words #gt; 0" --> b21
   b22["set cf_result"]
   c13 -- "else" --> b22
   n23["set cf_result, cf_tries"]
   b14 --> n23
   b15 --> n23
   b16 --> n23
   b17 --> n23
   b18 --> n23
   b19 --> n23
   b20 --> n23
   b21 --> n23
   b22 --> n23
   c24{"case"}
   n23 --> c24
   b25["set assignment_side_effect"]
   c24 -- "cf_must && cf_result === 'unclear' && cf_words #gt; 0" --> b25
   c26{"case"}
   b25 --> c26
   c24 -- "else" --> c26
   b27(["dispatch: intent detection"])
   class b27 endstep
   c26 -- "(cf_tries #gt;= 4 && !cf_must) && !!formIncompleteOutcome(cargo,form,#123;ou…" --> b27
   c28{"case"}
   c26 -- "else" --> c28
   c29{"case"}
   c28 -- "cf_tries #gt;= 4 && !cf_must" --> c29
   c28 -- "else" --> c29
   b30(["reboot → give-up"])
   class b30 endstep
   c29 -- "cf_tries #gt;= 4 && !cf_must" --> b30
   c31{"case"}
   c29 -- "else" --> c31
   b32["set assignment_side_effect"]
   c31 -- "cf_clarify" --> b32
   c33{"case"}
   b32 --> c33
   c31 -- "else" --> c33
   b34["set assignment_side_effect"]
   c33 -- "cf_result === 'yes'" --> b34
   n35["set assignment_side_effect"]
   b34 --> n35
   c33 -- "else" --> n35
   DONE(["end (back to caller)"])
   class DONE endstep
   n35 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
