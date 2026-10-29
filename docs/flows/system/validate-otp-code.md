# ValidateOtpCode

<!-- generated:start -->
**ValidateOtpCode** · `validate-otp-code` · version 1.0.0 · worker (called by other flows) · steps · shared scope

> Validate a challenge response with explicit bounded retries, alternate-contact handling and tenant callbacks.

- **Parameters:** none
- **Calls:** [contact-support](contact-support.md) (value, by name), {{cargo.authOptions.code_validator}} (call), {{cargo.authOptions.answer_handler}} (call), [get-and-validate-otp-code](get-and-validate-otp-code.md) (replace), [authenticate-user](authenticate-user.md) (replace, retry_flow of generic-retry-with-options, retry_flow, by name), {{otp_cancel}} (reboot), [live-agent-requested](live-agent-requested.md) (reboot), [switch-to-text](switch-to-text.md) (reboot), [resend-otp-code](resend-otp-code.md) (call), [generic-retry-with-options](generic-retry-with-options.md) (replace)
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
   n18["set otp_reply, otp_offers"]
   b7 --> n18
   b13 --> n18
   b14 --> n18
   b15 --> n18
   c6 -- "normalized_otp_code.length #gt; 0" --> n18
   b17 --> n18
   c19{"case"}
   n18 --> c19
   b20(["dispatch: intent detection"])
   class b20 endstep
   c19 -- "no_code_given" --> b20
   n21["set no_code_given"]
   c19 -- "else" --> n21
   c22{"case"}
   n21 --> c22
   b23(["replace → authenticate-user"])
   class b23 endstep
   c22 -- "!no_code_given && otp_reply && otp_reply.key === 'email'" --> b23
   b24(["replace → authenticate-user"])
   class b24 endstep
   c22 -- "!no_code_given && otp_reply && otp_reply.key === 'another_account'" --> b24
   b25[["call resend-otp-code"]]
   class b25 flowstep
   c22 -- "!no_code_given && otp_reply && otp_reply.key === 'resend'" --> b25
   b26(["replace → generic-retry-with-options"])
   class b26 endstep
   c22 -- "!no_code_given && otp_reply && otp_reply.key === 'no_phone'" --> b26
   b27(["reboot → live-agent-requested"])
   class b27 endstep
   c22 -- "!no_code_given && otp_reply && otp_reply.key === '__agent'" --> b27
   n28["set noop"]
   b25 --> n28
   c22 -- "else" --> n28
   c29{"case"}
   n28 --> c29
   b30(["replace → generic-retry-with-options"])
   class b30 endstep
   c29 -- "no_code_given && cargo.otpWordMisses #gt;= 3" --> b30
   c31{"case"}
   c29 -- "else" --> c31
   b32["say: Understood. First we need to finish verifying your identity…"]
   c31 -- "no_code_given && otp_reply && String(otp_reply.key #124;#124; '').indexOf('us…" --> b32
   c33{"case"}
   b32 --> c33
   c31 -- "else" --> c33
   b34["say: Let me explain. I sent you a message with a six-digit code …"]
   c33 -- "no_code_given && !(no_code_given && otp_reply && String(otp_reply.key…" --> b34
   n35["set noop"]
   b34 --> n35
   c33 -- "else" --> n35
   c36{"case"}
   n35 --> c36
   b37(["replace → generic-retry-with-options"])
   class b37 endstep
   c36 -- "normalized_otp_code.length !== 6 && cargo.otpFormatMisses #gt;= 3" --> b37
   c38{"case"}
   c36 -- "else" --> c38
   b39(["replace → get-and-validate-otp-code"])
   class b39 endstep
   c38 -- "normalized_otp_code.length !== 6" --> b39
   n40["set noop"]
   c38 -- "else" --> n40
   c41{"case"}
   n40 --> c41
   c42{"case"}
   c41 -- "!cargo.otpVerified && cargo.otpFailure === 'mismatch' && cargo.otpMis…" --> c42
   c41 -- "else" --> c42
   b43[["call resend-otp-code"]]
   class b43 flowstep
   c42 -- "cargo.otpFailure === 'expired' #124;#124; cargo.otpFailure === 'missing'" --> b43
   b44(["replace → generic-retry-with-options"])
   class b44 endstep
   c42 -- "cargo.otpFailure === 'mismatch' && cargo.otpMismatches #gt;= 3" --> b44
   b45["say: That code didn't match. Let's try again."]
   c42 -- "else" --> b45
   n46["set invite_text"]
   c42 -- "cargo.otpVerified === true" --> n46
   b43 --> n46
   b45 --> n46
   c47{"case"}
   n46 --> c47
   b48[/"tool: send-whatsapp-invite"/]
   class b48 toolstep
   c47 -- "!cargo.otpVerified && cargo.otpFailure === 'mismatch'" --> b48
   b48f["set whatsapp_invite_sent"]
   b48 -- "fails" --> b48f
   c49{"case"}
   b48 --> c49
   b48f --> c49
   c47 -- "else" --> c49
   b50["say: I texted you a WhatsApp link so you can try again on WhatsA…"]
   c49 -- "whatsapp_invite_sent === true" --> b50
   c51{"case"}
   b50 --> c51
   c49 -- "else" --> c51
   b52(["replace → get-and-validate-otp-code"])
   class b52 endstep
   c51 -- "cargo.otpVerified !== true" --> b52
   DONE(["end (back to caller)"])
   class DONE endstep
   c51 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
