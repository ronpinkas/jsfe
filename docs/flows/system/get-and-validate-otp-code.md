# GetAndValidateOtpCode

<!-- generated:start -->
**GetAndValidateOtpCode** · `get-and-validate-otp-code` · version 1.0.0 · worker (called by other flows) · steps · shared scope

> Collect a one-time-code answer through the owning FORM ancestry, preserving protocol commands for validation.

- **Parameters:** none
- **Calls:** [collect-service-answer](collect-service-answer.md) (call), [validate-otp-code](validate-otp-code.md) (replace)
- **Tools:** none
- **Called by:** [authenticate-user](authenticate-user.md), [validate-otp-code](validate-otp-code.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2(["end (back to caller)"])
   class b2 endstep
   c1 -- "cargo.otpVerified === true" --> b2
   n3["set otp_question, otp_question_es"]
   c1 -- "else" --> n3
   n4[["call collect-service-answer"]]
   class n4 flowstep
   n3 --> n4
   c5{"case"}
   n4 --> c5
   b6(["end (back to caller)"])
   class b6 endstep
   c5 -- "cargo.otpVerified === true" --> b6
   n7["set otp_code, user_choice, normalized_otp_code"]
   c5 -- "else" --> n7
   n8(["replace → validate-otp-code"])
   class n8 endstep
   n7 --> n8
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
