# AskEmail

<!-- generated:start -->
**AskEmail** · `ask-email` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Collect an email through shared FORM matching, retaining field-specific spelling and readback behavior.

- **Parameters:** 
  - `question`: English email question
  - `question_es`: Spanish email question
  - `on_file`: Known email offered by OK
  - `attempt`: Retry attempt
  - `why`: invalid, retry or more
  - `confirm`: Read back a caller-supplied known address
  - `parent_form`: Owning task FORM instance
  - `email_state`: Internal field protocol state
- **Calls:** [collect-service-answer](collect-service-answer.md) (call), [live-agent-requested](live-agent-requested.md) (reboot), [contact-support](contact-support.md) (reboot), [ask-email](ask-email.md) (replace)
- **Tools:** none
- **Called by:** [ask-email](ask-email.md), [send-copy](send-copy.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set email_state, email_profiles, email_question, email_question_es"]
   START --> n0
   n1[["call collect-service-answer"]]
   class n1 flowstep
   n0 --> n1
   n2["set email_raw"]
   n1 --> n2
   c3{"case"}
   n2 --> c3
   b4(["reboot → live-agent-requested"])
   class b4 endstep
   c3 -- "isAgentRequest(email_raw)" --> b4
   b5(["reboot → contact-support"])
   class b5 endstep
   c3 -- "isExitRequest(email_raw)" --> b5
   n6["set email_choice"]
   c3 -- "else" --> n6
   c7{"case"}
   n6 --> c7
   c8{"case"}
   c7 -- "!email_choice && !readEmail(email_raw) && isOtherRequest(email_raw,'e…" --> c8
   c7 -- "else" --> c8
   b9(["dispatch: intent detection"])
   class b9 endstep
   c8 -- "!email_choice && !readEmail(email_raw) && isOtherRequest(email_raw,'e…" --> b9
   n10["set email_found"]
   c8 -- "else" --> n10
   c11{"case"}
   n10 --> c11
   c12{"case"}
   c11 -- "!email_found && !email_choice && !!emailWithoutEnding(email_raw)" --> c12
   c11 -- "else" --> c12
   b13(["replace → ask-email"])
   class b13 endstep
   c12 -- "!email_found && !!email_state.ending" --> b13
   n14["set email_spelling"]
   c12 -- "else" --> n14
   c15{"case"}
   n14 --> c15
   c16{"case"}
   c15 -- "email_spelling" --> c16
   c15 -- "else" --> c16
   b17(["replace → ask-email"])
   class b17 endstep
   c16 -- "email_spelling" --> b17
   n18["set email_new, email_readback, email_readback_es"]
   c16 -- "else" --> n18
   c19{"case"}
   n18 --> c19
   b20[["call collect-service-answer"]]
   class b20 flowstep
   c19 -- "email_new" --> b20
   c21{"case"}
   b20 --> c21
   c19 -- "else" --> c21
   c22{"case"}
   c21 -- "email_new && isOtherRequest(cargo.serviceAnswer.raw,'email') && !pick…" --> c22
   c21 -- "else" --> c22
   b23(["dispatch: intent detection"])
   class b23 endstep
   c22 -- "email_new && isOtherRequest(cargo.serviceAnswer.raw,'email') && !pick…" --> b23
   c24{"case"}
   c22 -- "else" --> c24
   b25["set email_found"]
   c24 -- "email_new && pickChoice(cargo.serviceAnswer.raw,[#123;key:'no',phrases:['…" --> b25
   c26{"case"}
   b25 --> c26
   c24 -- "else" --> c26
   c27{"case"}
   c26 -- "!!email_found" --> c27
   c26 -- "else" --> c27
   b28(["end (back to caller)"])
   class b28 endstep
   c27 -- "!!email_found" --> b28
   c29{"case"}
   c27 -- "else" --> c29
   n30["set noop"]
   c29 -- "email_choice === 'another' && !!email_state.on_file" --> n30
   c29 -- "else" --> n30
   c31{"case"}
   n30 --> c31
   b32(["replace → ask-email"])
   class b32 endstep
   c31 -- "email_state.attempt#lt;2" --> b32
   n33["set noop"]
   c31 -- "else" --> n33
   DONE(["end (back to caller)"])
   class DONE endstep
   n33 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
