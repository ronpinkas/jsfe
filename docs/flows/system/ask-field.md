# AskField

<!-- generated:start -->
**AskField** · `ask-field` · version 1.4.0 · worker (called by other flows) · steps · isolated scope

> Worker: one card field, kind 'card' | 'exp' | 'cvv' | 'zip'. Sets cargo.field and cargo.fieldOutcome ('ok' | 'link' | 'failed'); the answer is erased from cargo.choiceText once read. Two tries; the card number gets a third when its second answer was another card entry (12 or more digits). On voice the card number's keypad completes by shape (digits.complete, by first digit). An answer with no digits ("tarjeta nueva" said again) is asked again without the error line.

- **Parameters:** 
  - `kind`: 'card' | 'exp' | 'cvv' | 'zip'
  - `question`: The question (English)
  - `question_es`: The question (Spanish)
  - `error`: Said before the re-ask (English)
  - `error_es`: Said before the re-ask (Spanish)
  - `attempt`: Internal: the attempt number
  - `show_error`: 'no': the previous answer had no digits (words such as "tarjeta nueva"), so the question is asked again without the error line. Absent: the error is shown, as before.
- **Calls:** [ask-choice](ask-choice.md) (call), [ask-field](ask-field.md) (replace)
- **Tools:** none
- **Called by:** [ask-field](ask-field.md), [card-entry](card-entry.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set af_n, af_q, af_q_es, af_digits, af_pii"]
   START --> n0
   n1[["call ask-choice af_q"]]
   class n1 flowstep
   n0 --> n1
   n2["set af_value, af_reentry, af_show, assignment_side_effect, af_next_attempt"]
   n1 --> n2
   c3{"case"}
   n2 --> c3
   b4["set assignment_side_effect"]
   c3 -- "cargo.choice === 'link'" --> b4
   b5["set assignment_side_effect"]
   c3 -- "af_value" --> b5
   b6(["replace → ask-field"])
   class b6 endstep
   c3 -- "af_n #lt; 1 #124;#124; (af_n #lt; 2 && af_reentry)" --> b6
   b7["set assignment_side_effect"]
   c3 -- "else" --> b7
   DONE(["end (back to caller)"])
   class DONE endstep
   b4 --> DONE
   b5 --> DONE
   b7 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
