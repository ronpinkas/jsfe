# OtpTextUndeliverable

<!-- generated:start -->
**OtpTextUndeliverable** · `otp-text-undeliverable` · version 1.1.0 · worker (called by other flows) · steps

> Worker for authenticate-user: the number cannot receive texts; ask for an email or a mobile number. The question is a form question (collect-service-answer): the answer is kept as spoken, so an email with digits in it is never reduced to its digits.

- **Parameters:** 
  - `note`: 'international' when asked again after a number outside the US and Canada: the question says codes reach only US and Canadian numbers
- **Calls:** [collect-service-answer](collect-service-answer.md) (call), [authenticate-user](authenticate-user.md) (replace), [live-agent-requested](live-agent-requested.md) (reboot), {{cargo.authCancelFlow || 'contact-support'}} (reboot), [otp-text-undeliverable](otp-text-undeliverable.md) (replace)
- **Tools:** none
- **Called by:** [otp-send-failed](otp-send-failed.md), [otp-text-undeliverable](otp-text-undeliverable.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set undeliverable_last4, other_contact_question, other_contact_question_es"]
   START --> n0
   n1[["call collect-service-answer"]]
   class n1 flowstep
   n0 --> n1
   n2["set user_choice, choice_digits, choice_email, cell_number, email"]
   n1 --> n2
   c3{"case"}
   n2 --> c3
   b4(["replace → authenticate-user"])
   class b4 endstep
   c3 -- "choice_email && validateEmail(choice_email)" --> b4
   b5(["replace → authenticate-user"])
   class b5 endstep
   c3 -- "validatePhone(choice_digits)" --> b5
   b6(["reboot → live-agent-requested"])
   class b6 endstep
   c3 -- "isAgentRequest(user_choice)" --> b6
   b7(["reboot → #123;#123;cargo.authCancelFlow #124;#124; 'contact-support'#125;#125;"])
   class b7 endstep
   c3 -- "isAnswer(user_choice, 'exit') && String(user_choice #124;#124; '').trim().spl…" --> b7
   b8(["replace → otp-text-undeliverable"])
   class b8 endstep
   c3 -- "readInternationalPhone(user_choice)" --> b8
   b9(["replace → authenticate-user"])
   class b9 endstep
   c3 -- "else" --> b9
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
