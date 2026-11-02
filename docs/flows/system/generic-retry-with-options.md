# GenericRetryWithOptions

<!-- generated:start -->
**GenericRetryWithOptions** · `generic-retry-with-options` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Collect a retry, alternate contact, code or exit through the shared FORM adapter.

- **Parameters:** 
  - `retry_misses`: Replies already asked again
  - `error_message`: Failure sentence
  - `error_message_es`: Spanish failure sentence
  - `retry_flow`: Retry destination
  - `cancel_flow`: Exit destination
  - `capture_patterns`: Declared contact capture readers
  - `retry_call_type`: reboot or replace
  - `allow_code_entry`: Accept the active six-digit challenge
  - `question`: Retry question
  - `question_es`: Spanish retry question
  - `caller_outcome`: Unresolved outcome
  - `caller_reason`: Unresolved reason
  - `parent_form`: Owning task FORM instance
  - `contact_options`: Contact field protocol declaration
- **Calls:** [authenticate-user](authenticate-user.md) (value), [contact-support](contact-support.md) (value, by name), [collect-service-answer](collect-service-answer.md) (call), {{retry_flow}} (replace, reboot), [validate-otp-code](validate-otp-code.md) (call), [generic-retry-with-options](generic-retry-with-options.md) (replace), [switch-to-text](switch-to-text.md) (reboot), [live-agent-requested](live-agent-requested.md) (reboot), {{cancel_flow}} (reboot)
- **Tools:** none
- **Called by:** [authenticate-user](authenticate-user.md), [get-cell-or-email](get-cell-or-email.md), [validate-otp-code](validate-otp-code.md), [generic-retry-with-options](generic-retry-with-options.md), [otp-send-failed](otp-send-failed.md), [contact-not-on-file](contact-not-on-file.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set parent_form, retry_profiles, retry_question, retry_question_es"]
   START --> n0
   n1[["call collect-service-answer"]]
   class n1 flowstep
   n0 --> n1
   n2["set user_choice, cancel_flow"]
   n1 --> n2
   c3{"case"}
   n2 --> c3
   b4["set retry_question"]
   c3 -- "/^\s*[2-8]\s*$/.test(user_choice)" --> b4
   c5{"case"}
   b4 --> c5
   c3 -- "else" --> c5
   b6["set retry_question_es"]
   c5 -- "/^\s*[2-8]\s*$/.test(user_choice)" --> b6
   c7{"case"}
   b6 --> c7
   c5 -- "else" --> c7
   b8[["call collect-service-answer"]]
   class b8 flowstep
   c7 -- "/^\s*[2-8]\s*$/.test(user_choice)" --> b8
   n9["set user_choice, smart_capture_result"]
   b8 --> n9
   c7 -- "else" --> n9
   c10{"case"}
   n9 --> c10
   b11(["replace → #123;#123;retry_flow#125;#125;"])
   class b11 endstep
   c10 -- "smart_capture_result && retry_call_type === #quot;replace#quot;" --> b11
   b12(["reboot → #123;#123;retry_flow#125;#125;"])
   class b12 endstep
   c10 -- "smart_capture_result" --> b12
   n13["set normalized_otp_code"]
   c10 -- "else" --> n13
   c14{"case"}
   n13 --> c14
   b15[["call validate-otp-code"]]
   class b15 flowstep
   c14 -- "!!normalized_otp_code" --> b15
   n16["set retry_known, retry_asked"]
   b15 --> n16
   c14 -- "else" --> n16
   c17{"case"}
   n16 --> c17
   b18(["dispatch: intent detection"])
   class b18 endstep
   c17 -- "!retry_known" --> b18
   n19["set retry_picked"]
   c17 -- "else" --> n19
   c20{"case"}
   n19 --> c20
   b21(["replace → generic-retry-with-options"])
   class b21 endstep
   c20 -- "!retry_known && !retry_picked && retry_misses #lt; 1" --> b21
   c22{"case"}
   c20 -- "else" --> c22
   b23(["end (back to caller)"])
   class b23 endstep
   c22 -- "normalized_otp_code && cargo.otpVerified === true" --> b23
   b24(["replace → #123;#123;retry_flow#125;#125;"])
   class b24 endstep
   c22 -- "(retry_picked === 'yes' #124;#124; user_choice.trim() === '1' #124;#124; isAnswer(use…" --> b24
   b25(["reboot → #123;#123;retry_flow#125;#125;"])
   class b25 endstep
   c22 -- "user_choice.trim() === '1' #124;#124; isAnswer(user_choice,'yes',retry_yes_wo…" --> b25
   b26(["reboot → switch-to-text"])
   class b26 endstep
   c22 -- "user_choice.trim() === '9' #124;#124; isAnswer(user_choice,'text')" --> b26
   b27(["reboot → live-agent-requested"])
   class b27 endstep
   c22 -- "retry_picked === '__agent' #124;#124; isAgentRequest(user_choice)" --> b27
   b28(["reboot → #123;#123;cancel_flow#125;#125;"])
   class b28 endstep
   c22 -- "retry_picked === 'exit' #124;#124; !user_choice.trim() #124;#124; /^\d$/.test(user_ch…" --> b28
   b29(["dispatch: intent detection"])
   class b29 endstep
   c22 -- "else" --> b29
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
