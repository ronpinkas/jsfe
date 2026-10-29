# AskChoice

<!-- generated:start -->
**AskChoice** · `ask-choice` · version 1.19.0 · worker (called by other flows) · steps · isolated scope

> Worker: ask one question and return cargo.choice plus the original cargo.choiceText. Declared choices, precheck keys and typed answer-validator keys keep priority across both read passes. Exact negative choices accept only their own declared words and keys. With amount, an unowned legacy payment question accepts a complete USD monetary answer or a simple payment instruction through readMoneyAmount; uncertain prose yields to DISPATCH without declaring an action failure. A lone digit keeps the question's keypad policy; amount:'marked' still requires marked money. An owning FORM supplies form_context and performs its own field, correction, provider-question and confirmation matching before deciding to retry or yield, retaining its draft and safety guards. Optional answer_precheck runs before choices; answer_validator runs only when no choice matched. AGENT/0 requests a person; EXIT/* leaves the request; a consumed switch offer routes its declared flow. Params include question(_es), choices [{key,phrases,exact?,negative?,neutral?}], retry(_es), accept_other, expect, amount, digits, exit_context(_es), pii and form_context.

- **Parameters:** 
  - `form_context`: Optional declared FORM reader context {form,current,names,questions}; valid field readings take precedence over stale verification-code echoes.
  - `question`: The question (English)
  - `question_es`: The question (Spanish)
  - `choices`: [{key, phrases}] in priority order
  - `retry`: Re-ask wording (English); default "Sorry, I didn't catch that." + the question
  - `retry_es`: Re-ask wording (Spanish)
  - `accept_other`: Return any other answer as choice "other" instead of re-asking
  - `digits`: Keypad input bounds {min, max} on voice
  - `exit_context`: What EXIT abandons, for the support message (English)
  - `exit_context_es`: What EXIT abandons (Spanish)
  - `expect`: With accept_other: what the answer should be — 'number', 'email' or 'contact' (either). Three or more words of neither shape are another request and are DISPATCHed
  - `amount`: true on a payment question: the answer is kept as spoken (the question's asSpoken) and an answer that names an amount ($1, 1 dollar, 12.50) returns cargo.choice = 'amount' with the text — never a keypad key, never a DISPATCH
  - `pii`: true when the answer is sensitive (a card's security code): every question here is a SAY-GET `pii` (jsfe >= 1.3.5), so the host keeps the answer out of its logs and records
  - `answer_validator`: Optional flow name. When an answer picks no choice, it is called (call) with { answer } and MAY set answer_key to a choice key, which is then returned as cargo.choice; if it sets none, the answer is handled as before (amount check, re-ask). Fail-closed. The validator must end by completion: a RETURN in it terminates the conversation turn.
  - `answer_precheck`: Optional flow run with { answer } before the choices are matched; an answer_key it sets is the answer's key (for an answer that must not be read as a choice, such as a question)
  - `reask_long`: true: an answer of three words or more that matches no choice is asked again once (the retry question) instead of being DISPATCHed at once; the second miss is DISPATCHed. For a question whose loss costs the caller real work, e.g. the charge confirmation after a card was typed (owner 2026-10-17).
  - `as_spoken`: Keep exact speech independently of numeric or amount semantics
- **Calls:** [late-code-reask](late-code-reask.md) (call), {{answer_precheck}} (call), {{answer_validator}} (call), {{ac_offer.flow}} (reboot), [live-agent-requested](live-agent-requested.md) (reboot), [contact-support](contact-support.md) (reboot), [switch-to-text](switch-to-text.md) (reboot)
- **Tools:** none
- **Called by:** [ask-address](ask-address.md), [ask-field](ask-field.md), [card-entry](card-entry.md), [collect-input](collect-input.md), [disambiguate-input](disambiguate-input.md), [provide-data](provide-data.md), [confirm-form](confirm-form.md), [provider-menu](provider-menu.md), [collect-geocoded-address-declined](collect-geocoded-address-declined.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set assignment_side_effect, ac_other, ac_amount, ac_marked, ac_pii, ac_q_…"]
   START --> n0
   n1["ask: #123;#123;ac_q#125;#125;"]
   n0 --> n1
   n2["set ac_late"]
   n1 --> n2
   c3{"case"}
   n2 --> c3
   b4[["call late-code-reask"]]
   class b4 flowstep
   c3 -- "ac_late" --> b4
   n5["set ac_answer, assignment_side_effect"]
   b4 --> n5
   c3 -- "else" --> n5
   c6{"case"}
   n5 --> c6
   b7["ask: #123;#123;ac_q#125;#125;"]
   c6 -- "/^[\s¿¡]*(?:(?:por favor#124;please#124;a#124;que#124;me lo#124;me#124;lo#124;puede#124;can you#124;could…" --> b7
   c8{"case"}
   b7 --> c8
   c6 -- "else" --> c8
   b9["ask: #123;#123;ac_q#125;#125;"]
   c8 -- "/^[\s¿¡]*(?:(?:por favor#124;please#124;a#124;que#124;me lo#124;me#124;lo#124;puede#124;can you#124;could…" --> b9
   n10["set answer_key"]
   b9 --> n10
   c8 -- "else" --> n10
   c11{"case"}
   n10 --> c11
   b12[["call #123;#123;answer_precheck#125;#125;"]]
   class b12 flowstep
   c11 -- "typeof answer_precheck !== 'undefined' && answer_precheck && String(a…" --> b12
   n13["set ac_prechecked, ac_key, answer_key"]
   b12 --> n13
   c11 -- "else" --> n13
   c14{"case"}
   n13 --> c14
   b15[["call #123;#123;answer_validator#125;#125;"]]
   class b15 flowstep
   c14 -- "ac_key === '' && typeof answer_validator !== 'undefined' && answer_va…" --> b15
   n16["set ac_key, assignment_side_effect, ac_missed"]
   b15 --> n16
   c14 -- "else" --> n16
   c17{"case"}
   n16 --> c17
   b18["ask: #123;#123;ac_retry#125;#125;"]
   c17 -- "ac_missed" --> b18
   c19{"case"}
   b18 --> c19
   c17 -- "else" --> c19
   b20["ask: #123;#123;ac_q#125;#125;"]
   c19 -- "ac_missed && /^[\s¿¡]*(?:(?:por favor#124;please#124;a#124;que#124;me lo#124;me#124;lo#124;puede#124;…" --> b20
   c21{"case"}
   b20 --> c21
   c19 -- "else" --> c21
   b22["ask: #123;#123;ac_q#125;#125;"]
   c21 -- "ac_missed && /^[\s¿¡]*(?:(?:por favor#124;please#124;a#124;que#124;me lo#124;me#124;lo#124;puede#124;…" --> b22
   n23["set answer_key"]
   b22 --> n23
   c21 -- "else" --> n23
   c24{"case"}
   n23 --> c24
   b25[["call #123;#123;answer_precheck#125;#125;"]]
   class b25 flowstep
   c24 -- "typeof answer_precheck !== 'undefined' && answer_precheck && String(a…" --> b25
   n26["set ac_prechecked, ac_key, answer_key"]
   b25 --> n26
   c24 -- "else" --> n26
   c27{"case"}
   n26 --> c27
   b28[["call #123;#123;answer_validator#125;#125;"]]
   class b28 flowstep
   c27 -- "ac_key === '' && typeof answer_validator !== 'undefined' && answer_va…" --> b28
   n29["set ac_key, assignment_side_effect"]
   b28 --> n29
   c27 -- "else" --> n29
   c30{"case"}
   n29 --> c30
   b31(["reboot → #123;#123;ac_offer.flow#125;#125;"])
   class b31 endstep
   c30 -- "ac_key === '__switch'" --> b31
   b32(["reboot → live-agent-requested"])
   class b32 endstep
   c30 -- "ac_key === '__agent'" --> b32
   b33(["reboot → contact-support"])
   class b33 endstep
   c30 -- "ac_key === '__exit'" --> b33
   b34(["reboot → switch-to-text"])
   class b34 endstep
   c30 -- "ac_key === '__text'" --> b34
   b35["set assignment_side_effect"]
   c30 -- "ac_key === '__amount'" --> b35
   b36(["dispatch: intent detection"])
   class b36 endstep
   c30 -- "ac_key === '__elsewhere'" --> b36
   b37["set assignment_side_effect"]
   c30 -- "ac_key === '' && ac_other" --> b37
   b38(["dispatch: intent detection"])
   class b38 endstep
   c30 -- "ac_key === ''" --> b38
   b39["set assignment_side_effect"]
   c30 -- "else" --> b39
   DONE(["end (back to caller)"])
   class DONE endstep
   b35 --> DONE
   b37 --> DONE
   b39 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
