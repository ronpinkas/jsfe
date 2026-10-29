# SendOtpCode

<!-- generated:start -->
**SendOtpCode** · `send-otp-code` · version 1.0.0 · worker (called by other flows) · steps

> Worker: sends a one-time code to cargo.otp_cell_number (SMS) or cargo.otp_email. Never texts a number that cannot receive texts (cargo.otpUndeliverableTo). Sets cargo.otpSendFailure ('' | 'undeliverable' | 'sms' | 'email' | 'none'); the caller hands a failure to otp-send-failed.

- **Parameters:** none
- **Calls:** no other flow
- **Tools:** `send-sms-otp`, `send-email-otp`
- **Called by:** [authenticate-user](authenticate-user.md), [resend-otp-code](resend-otp-code.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set assignment_side_effect"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2["set assignment_side_effect"]
   c1 -- "cargo.otp_cell_number && cargo.otpUndeliverableTo && String(cargo.otp…" --> b2
   b3["set proceed"]
   c1 -- "else" --> b3
   c4{"case"}
   b2 --> c4
   b3 --> c4
   b5[/"tool: send-sms-otp"/]
   class b5 toolstep
   c4 -- "!cargo.otpSendFailure && cargo.otp_cell_number" --> b5
   b5f["set assignment_side_effect"]
   b5 -- "fails" --> b5f
   b6[/"tool: send-email-otp"/]
   class b6 toolstep
   c4 -- "!cargo.otpSendFailure && cargo.otp_email" --> b6
   b6f["set assignment_side_effect"]
   b6 -- "fails" --> b6f
   b7["set assignment_side_effect"]
   c4 -- "!cargo.otpSendFailure" --> b7
   b8["set proceed"]
   c4 -- "else" --> b8
   DONE(["end (back to caller)"])
   class DONE endstep
   b5 --> DONE
   b5f --> DONE
   b6 --> DONE
   b6f --> DONE
   b7 --> DONE
   b8 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
