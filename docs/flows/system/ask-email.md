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
- **Called by:** [ask-email](ask-email.md)

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
   n10["set email_found, email_spelling"]
   c8 -- "else" --> n10
   c11{"case"}
   n10 --> c11
   c12{"case"}
   c11 -- "email_spelling" --> c12
   c11 -- "else" --> c12
   b13(["replace → ask-email"])
   class b13 endstep
   c12 -- "email_spelling" --> b13
   n14["set email_new, email_readback, email_readback_es"]
   c12 -- "else" --> n14
   c15{"case"}
   n14 --> c15
   b16[["call collect-service-answer"]]
   class b16 flowstep
   c15 -- "email_new" --> b16
   c17{"case"}
   b16 --> c17
   c15 -- "else" --> c17
   c18{"case"}
   c17 -- "email_new && isOtherRequest(cargo.serviceAnswer.raw,'email') && !pick…" --> c18
   c17 -- "else" --> c18
   b19(["dispatch: intent detection"])
   class b19 endstep
   c18 -- "email_new && isOtherRequest(cargo.serviceAnswer.raw,'email') && !pick…" --> b19
   c20{"case"}
   c18 -- "else" --> c20
   b21["set email_found"]
   c20 -- "email_new && pickChoice(cargo.serviceAnswer.raw,[#123;key:'no',phrases:['…" --> b21
   c22{"case"}
   b21 --> c22
   c20 -- "else" --> c22
   c23{"case"}
   c22 -- "!!email_found" --> c23
   c22 -- "else" --> c23
   b24(["end (back to caller)"])
   class b24 endstep
   c23 -- "!!email_found" --> b24
   c25{"case"}
   c23 -- "else" --> c25
   n26["set noop"]
   c25 -- "email_choice === 'another' && !!email_state.on_file" --> n26
   c25 -- "else" --> n26
   c27{"case"}
   n26 --> c27
   b28(["replace → ask-email"])
   class b28 endstep
   c27 -- "email_state.attempt#lt;2" --> b28
   n29["set noop"]
   c27 -- "else" --> n29
   DONE(["end (back to caller)"])
   class DONE endstep
   n29 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
