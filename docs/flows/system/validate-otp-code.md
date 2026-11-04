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
   c1 -- "cargo.authOptions && cargo.authOptions.code_validator && normalized_o…" --> b2
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
   c7 -- "normalized_otp_code.length === 6" --> b8
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
   c7 -- "isAnswer(user_choice,'agent')" --> b13
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
   b32[["call resend-otp-code"]]
   class b32 flowstep
   c26 -- "!no_code_given && otp_reply && otp_reply.key === 'resend'" --> b32
   b33(["replace → generic-retry-with-options"])
   class b33 endstep
   c26 -- "!no_code_given && otp_reply && otp_reply.key === 'no_phone'" --> b33
   b34["say: I understand. We still need to secure access to your accoun…"]
   c26 -- "!no_code_given && otp_reply && otp_reply.key === 'no_other_account'" --> b34
   b35(["reboot → live-agent-requested"])
   class b35 endstep
   c26 -- "!no_code_given && otp_reply && otp_reply.key === '__agent'" --> b35
   n36["set noop"]
   b27 --> n36
   b30 --> n36
   b31 --> n36
   b32 --> n36
   b34 --> n36
   c26 -- "else" --> n36
   c37{"case"}
   n36 --> c37
   b38(["reboot → verification-failed"])
   class b38 endstep
   c37 -- "no_code_given && cargo.otpWordMisses #gt;= 3" --> b38
   c39{"case"}
   c37 -- "else" --> c39
   b40["say: Understood. First we need to finish verifying your identity…"]
   c39 -- "no_code_given && otp_reply && String(otp_reply.key #124;#124; '').indexOf('us…" --> b40
   c41{"case"}
   b40 --> c41
   c39 -- "else" --> c41
   b42["say: Let me explain. I sent you a message with a six-digit code …"]
   c41 -- "no_code_given && !(no_code_given && otp_reply && String(otp_reply.key…" --> b42
   n43["set noop"]
   b42 --> n43
   c41 -- "else" --> n43
   c44{"case"}
   n43 --> c44
   b45(["reboot → verification-failed"])
   class b45 endstep
   c44 -- "normalized_otp_code.length !== 6 && cargo.otpFormatMisses #gt;= 3" --> b45
   c46{"case"}
   c44 -- "else" --> c46
   b47(["replace → get-and-validate-otp-code"])
   class b47 endstep
   c46 -- "normalized_otp_code.length !== 6" --> b47
   n48["set noop"]
   c46 -- "else" --> n48
   c49{"case"}
   n48 --> c49
   c50{"case"}
   c49 -- "!cargo.otpVerified && cargo.otpFailure === 'mismatch' && cargo.otpMis…" --> c50
   c49 -- "else" --> c50
   b51[["call resend-otp-code"]]
   class b51 flowstep
   c50 -- "cargo.otpFailure === 'expired' #124;#124; cargo.otpFailure === 'missing'" --> b51
   b52(["reboot → verification-failed"])
   class b52 endstep
   c50 -- "cargo.otpFailure === 'mismatch' && cargo.otpMismatches #gt;= 3" --> b52
   b53["say: That code didn't match. Let's try again."]
   c50 -- "else" --> b53
   n54["set invite_text"]
   c50 -- "cargo.otpVerified === true" --> n54
   b51 --> n54
   b53 --> n54
   c55{"case"}
   n54 --> c55
   b56[/"tool: send-whatsapp-invite"/]
   class b56 toolstep
   c55 -- "!cargo.otpVerified && cargo.otpFailure === 'mismatch'" --> b56
   b56f["set whatsapp_invite_sent"]
   b56 -- "fails" --> b56f
   c57{"case"}
   b56 --> c57
   b56f --> c57
   c55 -- "else" --> c57
   b58["say: I texted you a WhatsApp link so you can try again on WhatsA…"]
   c57 -- "whatsapp_invite_sent === true" --> b58
   c59{"case"}
   b58 --> c59
   c57 -- "else" --> c59
   b60(["replace → get-and-validate-otp-code"])
   class b60 endstep
   c59 -- "cargo.otpVerified !== true" --> b60
   DONE(["end (back to caller)"])
   class DONE endstep
   c59 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
