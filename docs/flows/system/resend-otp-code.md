# ResendOtpCode

<!-- generated:start -->
**ResendOtpCode** · `resend-otp-code` · version 1.1.3 · worker (called by other flows) · steps

> Worker: send a fresh one-time code to the destination authenticate-user used. Params: resend_reason.

- **Parameters:** 
  - `resend_reason`: 'expired' | 'missing' | 'requested'
- **Calls:** [generic-retry-with-options](generic-retry-with-options.md) (replace), [authenticate-user](authenticate-user.md) (retry_flow of generic-retry-with-options, retry_flow), [send-otp-code](send-otp-code.md) (call), [otp-send-failed](otp-send-failed.md) (replace)
- **Tools:** none
- **Called by:** [validate-otp-code](validate-otp-code.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   c0{"case"}
   START --> c0
   b1(["replace → generic-retry-with-options"])
   class b1 endstep
   c0 -- "(cargo.otpResends #124;#124; 0) #gt;= 2" --> b1
   b2["set proceed"]
   c0 -- "else" --> b2
   n3["set assignment_side_effect"]
   b2 --> n3
   n4[["call send-otp-code"]]
   class n4 flowstep
   n3 --> n4
   c5{"case"}
   n4 --> c5
   b6(["replace → otp-send-failed"])
   class b6 endstep
   c5 -- "cargo.otpSendFailure" --> b6
   b7["set proceed"]
   c5 -- "else" --> b7
   c8{"case"}
   b7 --> c8
   b9["say: Your code expired, so I've sent you a new one."]
   c8 -- "resend_reason === 'expired'" --> b9
   b10["say: I don't have an active code for you, so I've sent you a new…"]
   c8 -- "resend_reason === 'missing'" --> b10
   b11["say: I've sent you a new code."]
   c8 -- "else" --> b11
   DONE(["end (back to caller)"])
   class DONE endstep
   b9 --> DONE
   b10 --> DONE
   b11 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
