# ValidateOtpCode

<!-- generated:start -->
**ValidateOtpCode** · `validate-otp-code` · version 1.0.0 · worker (called by other flows) · steps · shared scope

> Validate a challenge response with explicit bounded retries, alternate-contact handling and tenant callbacks.

- **Parameters:** none
- **Calls:** [contact-support](contact-support.md) (value, by name), {{cargo.authOptions.code_validator}} (call), {{cargo.authOptions.answer_handler}} (call), [get-and-validate-otp-code](get-and-validate-otp-code.md) (replace), [authenticate-user](authenticate-user.md) (replace, retry_flow of generic-retry-with-options, retry_flow, by name), [send-otp-email-too](send-otp-email-too.md) (call), {{otp_cancel}} (reboot), [live-agent-requested](live-agent-requested.md) (reboot), [switch-to-text](switch-to-text.md) (reboot), [resend-otp-code](resend-otp-code.md) (call), [generic-retry-with-options](generic-retry-with-options.md) (replace), [verification-failed](verification-failed.md) (reboot)
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
   c1 -- "cargo.authOptions && cargo.authOptions.code_validator && String(user_…" --> b2
   n3["set other_account_given, wants_other_account"]
   b2 --> n3
   c1 -- "else" --> n3
   c4{"case"}
   n3 --> c4
   b5[["call #123;#123;cargo.authOptions.answer_handler#125;#125;"]]
   class b5 flowstep
   c4 -- "cargo.authOptions && cargo.authOptions.answer_handler && normalized_o…" --> b5
   n6["set otp_where, otp_where_es"]
   b5 --> n6
   c4 -- "else" --> n6
   c7{"case"}
   n6 --> c7
   b8[/"tool: validate-otp"/]
   class b8 toolstep
   c7 -- "normalized_otp_code.length === 6 && answer_key !== 'another_account' …" --> b8
   b8f(["replace → get-and-validate-otp-code"])
   class b8f endstep
   b8 -- "fails" --> b8f
   b9(["replace → authenticate-user"])
   class b9 endstep
   c7 -- "wants_other_account" --> b9
   b10[["call send-otp-email-too"]]
   class b10 flowstep
   c7 -- "email_too && normalized_otp_code.length !== 6 && (matchesChoice(user_…" --> b10
   b11(["replace → authenticate-user"])
   class b11 endstep
   c7 -- "!!cargo.otp_cell_number && normalized_otp_code.length !== 6 && matche…" --> b11
   b12(["reboot → #123;#123;otp_cancel#125;#125;"])
   class b12 endstep
   c7 -- "isExitRequest(user_choice)" --> b12
   b13(["reboot → live-agent-requested"])
   class b13 endstep
   c7 -- "isAgentRequest(user_choice)" --> b13
   b14(["reboot → switch-to-text"])
   class b14 endstep
   c7 -- "isAnswer(user_choice,'text')" --> b14
   b15[["call resend-otp-code"]]
   class b15 flowstep
   c7 -- "matchesChoice(user_choice,otp_phrases.resend)" --> b15
   b16["say: #123;#123;otp_where#125;#125;"]
   c7 -- "matchesChoice(user_choice,otp_phrases.cannot_find)" --> b16
   b17["say: #123;#123;otp_where#125;#125; To reach a person, #123;#123;cargo.verb#125;#125; AGENT."]
   c7 -- "matchesChoice(user_choice,otp_phrases.another_way)" --> b17
   b18["say: No problem. Say TEXT and I'll continue with you by message …"]
   c7 -- "matchesChoice(user_choice,otp_phrases.later)" --> b18
   b19["say: I was expecting a 6-digit code. Let's try again."]
   c7 -- "normalized_otp_code.length #gt; 0 && Number(cargo.otpFormatMisses #124;#124; 0)#lt;2" --> b19
   b20(["replace → generic-retry-with-options"])
   class b20 endstep
   c7 -- "matchesChoice(user_choice,otp_phrases.noPhone) #124;#124; (function otpPhoneU…" --> b20
   b21["set no_code_given"]
   c7 -- "else" --> b21
   n22["set otp_reply, otp_offers"]
   b8 --> n22
   b10 --> n22
   b15 --> n22
   b16 --> n22
   b17 --> n22
   b18 --> n22
   c7 -- "answer_key === 'code_notice'" --> n22
   b19 --> n22
   c7 -- "normalized_otp_code.length #gt; 0" --> n22
   b21 --> n22
   c23{"case"}
   n22 --> c23
   b24(["dispatch: intent detection"])
   class b24 endstep
   c23 -- "no_code_given" --> b24
   n25["set otp_where, otp_where_es, no_code_given"]
   c23 -- "else" --> n25
   c26{"case"}
   n25 --> c26
   b27[["call send-otp-email-too"]]
   class b27 flowstep
   c26 -- "!no_code_given && email_too && otp_reply && ['email','resend','cannot…" --> b27
   b28(["replace → authenticate-user"])
   class b28 endstep
   c26 -- "!no_code_given && otp_reply && otp_reply.key === 'email'" --> b28
   b29(["replace → authenticate-user"])
   class b29 endstep
   c26 -- "!no_code_given && otp_reply && otp_reply.key === 'another_account'" --> b29
   b30["say: #123;#123;otp_where#125;#125;"]
   c26 -- "!no_code_given && otp_reply && (otp_reply.key === 'where' #124;#124; otp_repl…" --> b30
   b31["say: #123;#123;otp_where#125;#125; To reach a person, #123;#123;cargo.verb#125;#125; AGENT."]
   c26 -- "!no_code_given && otp_reply && otp_reply.key === 'another_way'" --> b31
   b32["say: Go ahead. Read me the six digits when you have them."]
   c26 -- "!no_code_given && otp_reply && otp_reply.key === 'has_code'" --> b32
   b33[["call resend-otp-code"]]
   class b33 flowstep
   c26 -- "!no_code_given && otp_reply && otp_reply.key === 'resend'" --> b33
   b34(["replace → generic-retry-with-options"])
   class b34 endstep
   c26 -- "!no_code_given && otp_reply && otp_reply.key === 'no_phone'" --> b34
   b35["say: I understand. We still need to secure access to your accoun…"]
   c26 -- "!no_code_given && otp_reply && otp_reply.key === 'no_other_account'" --> b35
   b36(["reboot → live-agent-requested"])
   class b36 endstep
   c26 -- "!no_code_given && otp_reply && otp_reply.key === '__agent'" --> b36
   n37["set noop"]
   b27 --> n37
   b30 --> n37
   b31 --> n37
   b32 --> n37
   b33 --> n37
   b35 --> n37
   c26 -- "else" --> n37
   c38{"case"}
   n37 --> c38
   b39(["reboot → verification-failed"])
   class b39 endstep
   c38 -- "no_code_given && cargo.otpWordMisses #gt;= 3" --> b39
   c40{"case"}
   c38 -- "else" --> c40
   b41["say: Understood. First we need to finish verifying your identity…"]
   c40 -- "no_code_given && otp_reply && String(otp_reply.key #124;#124; '').indexOf('us…" --> b41
   c42{"case"}
   b41 --> c42
   c40 -- "else" --> c42
   b43["say: Let me explain. I sent you a message with a six-digit code …"]
   c42 -- "no_code_given && !(no_code_given && otp_reply && String(otp_reply.key…" --> b43
   n44["set noop"]
   b43 --> n44
   c42 -- "else" --> n44
   c45{"case"}
   n44 --> c45
   b46(["reboot → verification-failed"])
   class b46 endstep
   c45 -- "normalized_otp_code.length !== 6 && cargo.otpFormatMisses #gt;= 3" --> b46
   c47{"case"}
   c45 -- "else" --> c47
   b48(["replace → get-and-validate-otp-code"])
   class b48 endstep
   c47 -- "normalized_otp_code.length !== 6" --> b48
   n49["set noop"]
   c47 -- "else" --> n49
   c50{"case"}
   n49 --> c50
   c51{"case"}
   c50 -- "!cargo.otpVerified && cargo.otpFailure === 'mismatch' && cargo.otpMis…" --> c51
   c50 -- "else" --> c51
   b52[["call resend-otp-code"]]
   class b52 flowstep
   c51 -- "cargo.otpFailure === 'expired' #124;#124; cargo.otpFailure === 'missing'" --> b52
   b53(["reboot → verification-failed"])
   class b53 endstep
   c51 -- "cargo.otpFailure === 'mismatch' && cargo.otpMismatches #gt;= 3" --> b53
   b54["say: That code didn't match. Let's try again."]
   c51 -- "else" --> b54
   n55["set invite_text"]
   c51 -- "cargo.otpVerified === true" --> n55
   b52 --> n55
   b54 --> n55
   c56{"case"}
   n55 --> c56
   b57[/"tool: send-whatsapp-invite"/]
   class b57 toolstep
   c56 -- "!cargo.otpVerified && cargo.otpFailure === 'mismatch'" --> b57
   b57f["set whatsapp_invite_sent"]
   b57 -- "fails" --> b57f
   c58{"case"}
   b57 --> c58
   b57f --> c58
   c56 -- "else" --> c58
   b59["say: I texted you a WhatsApp link so you can try again on WhatsA…"]
   c58 -- "whatsapp_invite_sent === true" --> b59
   c60{"case"}
   b59 --> c60
   c58 -- "else" --> c60
   b61(["replace → get-and-validate-otp-code"])
   class b61 endstep
   c60 -- "cargo.otpVerified !== true" --> b61
   DONE(["end (back to caller)"])
   class DONE endstep
   c60 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
