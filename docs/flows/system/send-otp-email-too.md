# SendOtpEmailToo

<!-- generated:start -->
**SendOtpEmailToo** · `send-otp-email-too` · version 1.0.0 · worker (called by other flows) · steps · shared scope

> Email a second one-time code to the account's email beside the texted one, and say so.

- **Parameters:** none
- **Calls:** no other flow
- **Tools:** `send-email-otp`
- **Called by:** [validate-otp-code](validate-otp-code.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   n1[/"tool: send-email-otp"/]
   class n1 toolstep
   n0 --> n1
   n1f["set alt_hash"]
   n1 -- "fails" --> n1f
   n2["set also_sent, also_sent_es, otp_where, otp_where_es"]
   n1 --> n2
   n1f --> n2
   c3{"case"}
   n2 --> c3
   b4["say: #123;#123;also_sent#125;#125;"]
   c3 -- "cargo.otpAltSent === true" --> b4
   b5["say: #123;#123;otp_where#125;#125;"]
   c3 -- "else" --> b5
   DONE(["end (back to caller)"])
   class DONE endstep
   b4 --> DONE
   b5 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
