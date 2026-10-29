# OtpSendFailed

<!-- generated:start -->
**OtpSendFailed** · `otp-send-failed` · version 1.0.2 · worker (called by other flows) · steps

> Worker: a code could not be sent (cargo.otpSendFailure). A line that cannot receive texts goes to otp-text-undeliverable; any other failure offers the retry.

- **Parameters:** none
- **Calls:** [otp-text-undeliverable](otp-text-undeliverable.md) (replace), [generic-retry-with-options](generic-retry-with-options.md) (replace), [authenticate-user](authenticate-user.md) (retry_flow of generic-retry-with-options, retry_flow)
- **Tools:** none
- **Called by:** [authenticate-user](authenticate-user.md), [resend-otp-code](resend-otp-code.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   c0{"case"}
   START --> c0
   b1(["replace → otp-text-undeliverable"])
   class b1 endstep
   c0 -- "cargo.otpSendFailure === 'undeliverable'" --> b1
   b2(["replace → generic-retry-with-options"])
   class b2 endstep
   c0 -- "cargo.otpSendFailure === 'sms'" --> b2
   b3(["replace → generic-retry-with-options"])
   class b3 endstep
   c0 -- "cargo.otpSendFailure === 'email'" --> b3
   b4(["replace → generic-retry-with-options"])
   class b4 endstep
   c0 -- "else" --> b4
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
