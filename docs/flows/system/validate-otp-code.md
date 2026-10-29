# ValidateOtpCode

<!-- generated:start -->
**ValidateOtpCode** · `validate-otp-code` · version 1.0.0 · worker (called by other flows) · steps · shared scope

> Validate a challenge response with explicit bounded retries, alternate-contact handling and tenant callbacks.

- **Parameters:** none
- **Calls:** [contact-support](contact-support.md) (value, by name), {{cargo.authOptions.code_validator}} (call), {{cargo.authOptions.answer_handler}} (call), [get-and-validate-otp-code](get-and-validate-otp-code.md) (replace), [authenticate-user](authenticate-user.md) (replace, retry_flow of generic-retry-with-options, retry_flow), {{otp_cancel}} (reboot), [live-agent-requested](live-agent-requested.md) (reboot), [switch-to-text](switch-to-text.md) (reboot), [resend-otp-code](resend-otp-code.md) (call), [generic-retry-with-options](generic-retry-with-options.md) (replace)
- **Tools:** `validate-otp`, `send-whatsapp-invite`
- **Called by:** [get-and-validate-otp-code](get-and-validate-otp-code.md), [generic-retry-with-options](generic-retry-with-options.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set auth_retry_code_message, auth_retry_code_message_es, otp_no_phone_mes…"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2[["call #123;#123;cargo.authOptions.code_validator#125;#125;"]]
   class b2 flowstep
   c1 -- "cargo.authOptions && cargo.authOptions.code_validator && normalized_o…" --> b2
   n3["set other_account_given, wants_other_account"]
   b2 --> n3
   c1 -- "else" --> n3
   c4{"case"}
   n3 --> c4
   b5[["call #123;#123;cargo.authOptions.answer_handler#125;#125;"]]
   class b5 flowstep
   c4 -- "cargo.authOptions && cargo.authOptions.answer_handler && normalized_o…" --> b5
   c6{"case"}
   b5 --> c6
   c4 -- "else" --> c6
   b7[/"tool: validate-otp"/]
   class b7 toolstep
   c6 -- "normalized_otp_code.length === 6" --> b7
   b7f(["replace → get-and-validate-otp-code"])
   class b7f endstep
   b7 -- "fails" --> b7f
   b8(["replace → authenticate-user"])
   class b8 endstep
   c6 -- "wants_other_account" --> b8
   b9(["replace → authenticate-user"])
   class b9 endstep
   c6 -- "!!cargo.otp_cell_number && normalized_otp_code.length !== 6 && matche…" --> b9
   b10(["reboot → #123;#123;otp_cancel#125;#125;"])
   class b10 endstep
   c6 -- "isExitRequest(user_choice)" --> b10
   b11(["reboot → live-agent-requested"])
   class b11 endstep
   c6 -- "isAnswer(user_choice,'agent')" --> b11
   b12(["reboot → switch-to-text"])
   class b12 endstep
   c6 -- "isAnswer(user_choice,'text')" --> b12
   b13[["call resend-otp-code"]]
   class b13 flowstep
   c6 -- "matchesChoice(user_choice,otp_phrases.resend)" --> b13
   b14["say: No problem. Say TEXT and I'll continue with you by message …"]
   c6 -- "matchesChoice(user_choice,otp_phrases.later)" --> b14
   b15["say: I was expecting a 6-digit code. Let's try again. You can al…"]
   c6 -- "normalized_otp_code.length #gt; 0 && Number(cargo.otpFormatMisses #124;#124; 0)#lt;2" --> b15
   b16(["replace → generic-retry-with-options"])
   class b16 endstep
   c6 -- "matchesChoice(user_choice,otp_phrases.noPhone) #124;#124; (function otpPhoneU…" --> b16
   b17["set no_code_given"]
   c6 -- "else" --> b17
   n18["set noop"]
   b7 --> n18
   b13 --> n18
   b14 --> n18
   b15 --> n18
   c6 -- "normalized_otp_code.length #gt; 0" --> n18
   b17 --> n18
   c19{"case"}
   n18 --> c19
   b20(["replace → generic-retry-with-options"])
   class b20 endstep
   c19 -- "no_code_given && cargo.otpWordMisses #gt;= 3" --> b20
   c21{"case"}
   c19 -- "else" --> c21
   b22["say: Let me explain. I sent you a message with a six-digit code …"]
   c21 -- "no_code_given" --> b22
   n23["set noop"]
   b22 --> n23
   c21 -- "else" --> n23
   c24{"case"}
   n23 --> c24
   b25(["replace → generic-retry-with-options"])
   class b25 endstep
   c24 -- "normalized_otp_code.length !== 6 && cargo.otpFormatMisses #gt;= 3" --> b25
   c26{"case"}
   c24 -- "else" --> c26
   b27(["replace → get-and-validate-otp-code"])
   class b27 endstep
   c26 -- "normalized_otp_code.length !== 6" --> b27
   n28["set noop"]
   c26 -- "else" --> n28
   c29{"case"}
   n28 --> c29
   c30{"case"}
   c29 -- "!cargo.otpVerified && cargo.otpFailure === 'mismatch' && cargo.otpMis…" --> c30
   c29 -- "else" --> c30
   b31[["call resend-otp-code"]]
   class b31 flowstep
   c30 -- "cargo.otpFailure === 'expired' #124;#124; cargo.otpFailure === 'missing'" --> b31
   b32(["replace → generic-retry-with-options"])
   class b32 endstep
   c30 -- "cargo.otpFailure === 'mismatch' && cargo.otpMismatches #gt;= 3" --> b32
   b33["say: That code didn't match. Let's try again."]
   c30 -- "else" --> b33
   n34["set invite_text"]
   c30 -- "cargo.otpVerified === true" --> n34
   b31 --> n34
   b33 --> n34
   c35{"case"}
   n34 --> c35
   b36[/"tool: send-whatsapp-invite"/]
   class b36 toolstep
   c35 -- "!cargo.otpVerified && cargo.otpFailure === 'mismatch'" --> b36
   b36f["set whatsapp_invite_sent"]
   b36 -- "fails" --> b36f
   c37{"case"}
   b36 --> c37
   b36f --> c37
   c35 -- "else" --> c37
   b38["say: I texted you a WhatsApp link so you can try again on WhatsA…"]
   c37 -- "whatsapp_invite_sent === true" --> b38
   c39{"case"}
   b38 --> c39
   c37 -- "else" --> c39
   b40(["replace → get-and-validate-otp-code"])
   class b40 endstep
   c39 -- "cargo.otpVerified !== true" --> b40
   DONE(["end (back to caller)"])
   class DONE endstep
   c39 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
