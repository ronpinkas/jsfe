# SendCopy

<!-- generated:start -->
**SendCopy** · `send-copy` · version 1.1.0 · **entry point** (intent detection can start it) · steps · isolated scope

> Asks to be sent, by text or email, something the assistant said in this conversation, or a copy of the whole conversation ('text me that', 'send me that by email', 'email me a copy of this chat', 'mándame eso por mensaje', 'envíeme toda la conversación al correo'). Not: continuing the conversation by text (SwitchToText); a person (LiveAgentRequested).

- **Parameters:** 
  - `item`: What the user asks to have sent: the reply or document they name or point to. 'That', 'it', 'this', 'eso' or 'lo que me dijo' is the latest reply; the whole chat, conversation or transcript ('toda la conversación') is the whole conversation.
  - `medium` (text / email): How the user asks to have it sent: text for a text message or SMS ('mensaje', 'texto'), email for an email ('correo').
  - `destination`: The phone number or email address the user gave to send it to, as given.
- **Calls:** [ask-choice](ask-choice.md) (call), {{sc_item.sender}} (call), [ask-email](ask-email.md) (call), [send-text](send-text.md) (call), [send-email-message](send-email-message.md) (call)
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
   n22["set sc_email, sc_phone, sc_medium, sc_media, sc_forced"]
   c20 -- "else" --> n22
   c23{"case"}
   n22 --> c23
   b24["say: I can only send that by email, so I'll email it."]
   c23 -- "sc_forced === 'email'" --> b24
   c25{"case"}
   b24 --> c25
   c23 -- "else" --> c25
   b26["say: I can only send that by text, so I'll text it."]
   c25 -- "sc_forced === 'text'" --> b26
   n27["set sc_medium, sc_medium_q, sc_medium_q_es"]
   b26 --> n27
   c25 -- "else" --> n27
   c28{"case"}
   n27 --> c28
   b29[["call ask-choice sc_medium_q"]]
   class b29 flowstep
   c28 -- "!sc_medium" --> b29
   c30{"case"}
   b29 --> c30
   c28 -- "else" --> c30
   b31["set sc_medium"]
   c30 -- "!sc_medium" --> b31
   c32{"case"}
   b31 --> c32
   c30 -- "else" --> c32
   b33(["end (back to caller)"])
   class b33 endstep
   c32 -- "!sc_medium" --> b33
   n34["set sc_given"]
   c32 -- "else" --> n34
   c35{"case"}
   n34 --> c35
   b36["set assignment_side_effect"]
   c35 -- "!!sc_item.sender" --> b36
   c37{"case"}
   b36 --> c37
   c35 -- "else" --> c37
   b38[["call #123;#123;sc_item.sender#125;#125;"]]
   class b38 flowstep
   c37 -- "!!sc_item.sender" --> b38
   c39{"case"}
   b38 --> c39
   c37 -- "else" --> c39
   b40["say: Sorry, I couldn't send it. Is there anything else I can hel…"]
   c39 -- "!!sc_item.sender && cargo.copyHandled !== true" --> b40
   c41{"case"}
   b40 --> c41
   c39 -- "else" --> c41
   b42(["end (back to caller)"])
   class b42 endstep
   c41 -- "!!sc_item.sender && cargo.copyHandled !== true" --> b42
   c43{"case"}
   c41 -- "else" --> c43
   b44(["end (back to caller)"])
   class b44 endstep
   c43 -- "!!sc_item.sender" --> b44
   c45{"case"}
   c43 -- "else" --> c45
   b46["set assignment_side_effect"]
   c45 -- "sc_medium === 'text'" --> b46
   c47{"case"}
   b46 --> c47
   c45 -- "else" --> c47
   b48[["call ask-choice What phone number should I text it to?"]]
   class b48 flowstep
   c47 -- "sc_medium === 'text' && !cargo.textTo" --> b48
   c49{"case"}
   b48 --> c49
   c47 -- "else" --> c49
   b50["set assignment_side_effect"]
   c49 -- "sc_medium === 'text' && !cargo.textTo" --> b50
   c51{"case"}
   b50 --> c51
   c49 -- "else" --> c51
   b52["say: Sorry, I couldn't read that phone number. Is there anything…"]
   c51 -- "sc_medium === 'text' && !cargo.textTo" --> b52
   c53{"case"}
   b52 --> c53
   c51 -- "else" --> c53
   b54(["end (back to caller)"])
   class b54 endstep
   c53 -- "sc_medium === 'text' && !cargo.textTo" --> b54
   c55{"case"}
   c53 -- "else" --> c55
   b56["set assignment_side_effect"]
   c55 -- "sc_medium === 'text'" --> b56
   n57["set sc_to"]
   b56 --> n57
   c55 -- "else" --> n57
   c58{"case"}
   n57 --> c58
   b59["set assignment_side_effect"]
   c58 -- "sc_medium === 'email' && !sc_to" --> b59
   c60{"case"}
   b59 --> c60
   c58 -- "else" --> c60
   b61[["call ask-email"]]
   class b61 flowstep
   c60 -- "sc_medium === 'email' && !sc_to" --> b61
   c62{"case"}
   b61 --> c62
   c60 -- "else" --> c62
   b63["set sc_to"]
   c62 -- "sc_medium === 'email' && !sc_to" --> b63
   c64{"case"}
   b63 --> c64
   c62 -- "else" --> c64
   b65(["end (back to caller)"])
   class b65 endstep
   c64 -- "sc_medium === 'email' && !sc_to" --> b65
   n66["set sc_subject, sc_content"]
   c64 -- "else" --> n66
   c67{"case"}
   n66 --> c67
   b68[["call send-text"]]
   class b68 flowstep
   c67 -- "sc_medium === 'text'" --> b68
   c69{"case"}
   b68 --> c69
   c67 -- "else" --> c69
   b70[["call send-email-message"]]
   class b70 flowstep
   c69 -- "sc_medium === 'email'" --> b70
   n71["set sc_sent"]
   b70 --> n71
   c69 -- "else" --> n71
   c72{"case"}
   n71 --> c72
   b73["say: Done. I texted it to the number ending in #123;#123;cargo.textTo4#125;#125;…"]
   c72 -- "sc_sent && sc_medium === 'text'" --> b73
   c74{"case"}
   b73 --> c74
   c72 -- "else" --> c74
   b75["say: Done. I emailed it to #123;#123;sc_to#125;#125;. Is there anything else I c…"]
   c74 -- "sc_sent && sc_medium === 'email'" --> b75
   c76{"case"}
   b75 --> c76
   c74 -- "else" --> c76
   b77["say: Sorry, I couldn't send it. Is there anything else I can hel…"]
   c76 -- "!sc_sent" --> b77
   c78{"case"}
   b77 --> c78
   c76 -- "else" --> c78
   b79(["end (back to caller)"])
   class b79 endstep
   c78 -- "!sc_sent" --> b79
   DONE(["end (back to caller)"])
   class DONE endstep
   c78 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
