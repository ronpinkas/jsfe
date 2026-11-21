# SendCopy

<!-- generated:start -->
**SendCopy** · `send-copy` · version 1.1.0 · **entry point** (intent detection can start it) · steps · isolated scope

> Asks to be sent something by text or email, whatever it is ('email me that', 'text me the case number', 'send me the receipt', 'can I have that emailed to me', 'send me a copy of this chat', 'mándame eso por mensaje', 'me lo puede mandar por correo'). Not: continuing the conversation by text (SwitchToText).

- **Parameters:** 
  - `item`: What the user asks to have sent: the reply or document they name or point to. 'That', 'it', 'this', 'eso' or 'lo que me dijo' is the latest reply; the whole chat, conversation or transcript ('toda la conversación') is the whole conversation.
  - `medium` (text / email): How the user asks to have it sent: text for a text message or SMS ('mensaje', 'texto'), email for an email ('correo').
  - `destination`: The phone number or email address the user gave to send it to, as given.
  - `other_destination`: true when the user asks to send it to a different, new or other phone number or email than their own, without saying what it is ('another number', 'a different email', 'otro número', 'a mi otro correo'); false when they give the number or email, or name none.
- **Calls:** [ask-choice](ask-choice.md) (call), [ask-email](ask-email.md) (call), {{sc_item.sender}} (call), [send-text](send-text.md) (call), [send-email-message](send-email-message.md) (call)
- **Tools:** none
- **Called by:** intent detection

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set sc_items"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2["say: I don't have anything to send yet. Is there anything else I…"]
   c1 -- "!sc_items.length" --> b2
   c3{"case"}
   b2 --> c3
   c1 -- "else" --> c3
   b4(["end (back to caller)"])
   class b4 endstep
   c3 -- "!sc_items.length" --> b4
   n5["set sc_key, sc_item, sc_last, sc_last_head, sc_doc_list"]
   c3 -- "else" --> n5
   c6{"case"}
   n5 --> c6
   b7["say: I can send you: #123;#123;sc_doc_list#125;#125;. Tell me which one, and whe…"]
   c6 -- "!sc_item && !sc_last" --> b7
   c8{"case"}
   b7 --> c8
   c6 -- "else" --> c8
   b9(["end (back to caller)"])
   class b9 endstep
   c8 -- "!sc_item && !sc_last" --> b9
   c10{"case"}
   c8 -- "else" --> c10
   b11["set sc_offer_q"]
   c10 -- "!sc_item" --> b11
   c12{"case"}
   b11 --> c12
   c10 -- "else" --> c12
   b13["set sc_offer_q_es"]
   c12 -- "!sc_item" --> b13
   c14{"case"}
   b13 --> c14
   c12 -- "else" --> c14
   b15[["call ask-choice sc_offer_q"]]
   class b15 flowstep
   c14 -- "!sc_item" --> b15
   c16{"case"}
   b15 --> c16
   c14 -- "else" --> c16
   b17["set sc_item"]
   c16 -- "!sc_item" --> b17
   c18{"case"}
   b17 --> c18
   c16 -- "else" --> c18
   b19["say: Okay. Tell me what you'd like me to send, for example: text…"]
   c18 -- "!sc_item" --> b19
   c20{"case"}
   b19 --> c20
   c18 -- "else" --> c20
   b21(["end (back to caller)"])
   class b21 endstep
   c20 -- "!sc_item" --> b21
   n22["set sc_email, sc_phone, sc_medium, sc_content, sc_too_long, sc_media, sc_…"]
   c20 -- "else" --> n22
   c23{"case"}
   n22 --> c23
   b24["say: That's too long for a text message, so I'll email it."]
   c23 -- "sc_forced === 'email' && sc_too_long" --> b24
   c25{"case"}
   b24 --> c25
   c23 -- "else" --> c25
   b26["say: I can only send that by email, so I'll email it."]
   c25 -- "sc_forced === 'email' && !sc_too_long" --> b26
   c27{"case"}
   b26 --> c27
   c25 -- "else" --> c27
   b28["say: I can only send that by text, so I'll text it."]
   c27 -- "sc_forced === 'text'" --> b28
   n29["set sc_medium, sc_medium_q, sc_medium_q_es"]
   b28 --> n29
   c27 -- "else" --> n29
   c30{"case"}
   n29 --> c30
   b31[["call ask-choice sc_medium_q"]]
   class b31 flowstep
   c30 -- "!sc_medium" --> b31
   c32{"case"}
   b31 --> c32
   c30 -- "else" --> c32
   b33["set sc_medium"]
   c32 -- "!sc_medium" --> b33
   c34{"case"}
   b33 --> c34
   c32 -- "else" --> c34
   b35(["end (back to caller)"])
   class b35 endstep
   c34 -- "!sc_medium" --> b35
   n36["set sc_other"]
   c34 -- "else" --> n36
   c37{"case"}
   n36 --> c37
   b38[["call ask-choice What phone number should I text it to?"]]
   class b38 flowstep
   c37 -- "sc_other && sc_medium === 'text'" --> b38
   c39{"case"}
   b38 --> c39
   c37 -- "else" --> c39
   b40["set sc_phone"]
   c39 -- "sc_other && sc_medium === 'text'" --> b40
   c41{"case"}
   b40 --> c41
   c39 -- "else" --> c41
   b42["say: Sorry, I couldn't read that phone number. Is there anything…"]
   c41 -- "sc_other && sc_medium === 'text' && !sc_phone" --> b42
   c43{"case"}
   b42 --> c43
   c41 -- "else" --> c43
   b44(["end (back to caller)"])
   class b44 endstep
   c43 -- "sc_other && sc_medium === 'text' && !sc_phone" --> b44
   c45{"case"}
   c43 -- "else" --> c45
   b46["set assignment_side_effect"]
   c45 -- "sc_other && sc_medium === 'email'" --> b46
   c47{"case"}
   b46 --> c47
   c45 -- "else" --> c47
   b48[["call ask-email"]]
   class b48 flowstep
   c47 -- "sc_other && sc_medium === 'email'" --> b48
   c49{"case"}
   b48 --> c49
   c47 -- "else" --> c49
   b50["set sc_email"]
   c49 -- "sc_other && sc_medium === 'email'" --> b50
   c51{"case"}
   b50 --> c51
   c49 -- "else" --> c51
   b52(["end (back to caller)"])
   class b52 endstep
   c51 -- "sc_other && sc_medium === 'email' && !sc_email" --> b52
   n53["set sc_given"]
   c51 -- "else" --> n53
   c54{"case"}
   n53 --> c54
   b55["set assignment_side_effect"]
   c54 -- "!!sc_item.sender" --> b55
   c56{"case"}
   b55 --> c56
   c54 -- "else" --> c56
   b57[["call #123;#123;sc_item.sender#125;#125;"]]
   class b57 flowstep
   c56 -- "!!sc_item.sender" --> b57
   c58{"case"}
   b57 --> c58
   c56 -- "else" --> c58
   b59["say: Sorry, I couldn't send it. Is there anything else I can hel…"]
   c58 -- "!!sc_item.sender && cargo.copyHandled !== true" --> b59
   c60{"case"}
   b59 --> c60
   c58 -- "else" --> c60
   b61(["end (back to caller)"])
   class b61 endstep
   c60 -- "!!sc_item.sender && cargo.copyHandled !== true" --> b61
   c62{"case"}
   c60 -- "else" --> c62
   b63(["end (back to caller)"])
   class b63 endstep
   c62 -- "!!sc_item.sender" --> b63
   c64{"case"}
   c62 -- "else" --> c64
   b65["set assignment_side_effect"]
   c64 -- "sc_medium === 'text'" --> b65
   c66{"case"}
   b65 --> c66
   c64 -- "else" --> c66
   b67[["call ask-choice What phone number should I text it to?"]]
   class b67 flowstep
   c66 -- "sc_medium === 'text' && !cargo.textTo" --> b67
   c68{"case"}
   b67 --> c68
   c66 -- "else" --> c68
   b69["set assignment_side_effect"]
   c68 -- "sc_medium === 'text' && !cargo.textTo" --> b69
   c70{"case"}
   b69 --> c70
   c68 -- "else" --> c70
   b71["say: Sorry, I couldn't read that phone number. Is there anything…"]
   c70 -- "sc_medium === 'text' && !cargo.textTo" --> b71
   c72{"case"}
   b71 --> c72
   c70 -- "else" --> c72
   b73(["end (back to caller)"])
   class b73 endstep
   c72 -- "sc_medium === 'text' && !cargo.textTo" --> b73
   c74{"case"}
   c72 -- "else" --> c74
   b75["set assignment_side_effect"]
   c74 -- "sc_medium === 'text'" --> b75
   n76["set sc_to"]
   b75 --> n76
   c74 -- "else" --> n76
   c77{"case"}
   n76 --> c77
   b78["set assignment_side_effect"]
   c77 -- "sc_medium === 'email' && !sc_to" --> b78
   c79{"case"}
   b78 --> c79
   c77 -- "else" --> c79
   b80[["call ask-email"]]
   class b80 flowstep
   c79 -- "sc_medium === 'email' && !sc_to" --> b80
   c81{"case"}
   b80 --> c81
   c79 -- "else" --> c81
   b82["set sc_to"]
   c81 -- "sc_medium === 'email' && !sc_to" --> b82
   c83{"case"}
   b82 --> c83
   c81 -- "else" --> c83
   b84(["end (back to caller)"])
   class b84 endstep
   c83 -- "sc_medium === 'email' && !sc_to" --> b84
   n85["set sc_subject"]
   c83 -- "else" --> n85
   c86{"case"}
   n85 --> c86
   b87[["call send-text"]]
   class b87 flowstep
   c86 -- "sc_medium === 'text'" --> b87
   c88{"case"}
   b87 --> c88
   c86 -- "else" --> c88
   b89[["call send-email-message"]]
   class b89 flowstep
   c88 -- "sc_medium === 'email'" --> b89
   n90["set sc_sent"]
   b89 --> n90
   c88 -- "else" --> n90
   c91{"case"}
   n90 --> c91
   b92["say: Done. I texted it to the number ending in #123;#123;cargo.textTo4#125;#125;…"]
   c91 -- "sc_sent && sc_medium === 'text'" --> b92
   c93{"case"}
   b92 --> c93
   c91 -- "else" --> c93
   b94["say: Done. I emailed it to #123;#123;sc_to#125;#125;. Is there anything else I c…"]
   c93 -- "sc_sent && sc_medium === 'email'" --> b94
   c95{"case"}
   b94 --> c95
   c93 -- "else" --> c95
   b96["say: Sorry, I couldn't send it. Is there anything else I can hel…"]
   c95 -- "!sc_sent" --> b96
   c97{"case"}
   b96 --> c97
   c95 -- "else" --> c97
   b98(["end (back to caller)"])
   class b98 endstep
   c97 -- "!sc_sent" --> b98
   DONE(["end (back to caller)"])
   class DONE endstep
   c97 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
