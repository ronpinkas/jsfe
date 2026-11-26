# SendCopy

<!-- generated:start -->
**SendCopy** · `send-copy` · version 1.2.0 · **entry point** (intent detection can start it) · steps · isolated scope

> Asks to be sent something by text or email, whatever it is ('email me that', 'text me the case number', 'send me the receipt', 'can I have that emailed to me', 'send me a copy of this chat', 'mándame eso por mensaje', 'me lo puede mandar por correo'), or asks to continue this conversation on the web or another device ('can I continue this on my computer?', 'send me a link to continue on the web', '¿puedo seguir esto en mi computadora?'). Not: continuing the conversation by text (SwitchToText).

- **Parameters:** 
  - `item`: What the user asks to have sent: the reply or document they name or point to. 'That', 'it', 'this', 'eso' or 'lo que me dijo' is the latest reply; the whole chat, conversation or transcript ('toda la conversación') is the whole conversation; continuing on the web, a computer or another device is the link to continue on the web.
  - `medium` (text / email): How the user asks to have it sent: text for a text message or SMS ('mensaje', 'texto'), email for an email ('correo').
  - `destination`: The phone number or email address the user gave to send it to, as given.
  - `other_destination`: true when the user asks to send it to a different, new or other phone number or email than their own, without saying what it is ('another number', 'a different email', 'otro número', 'a mi otro correo'); false when they give the number or email, or name none.
- **Calls:** [ask-choice](ask-choice.md) (call), [ask-email](ask-email.md) (call), {{sc_item.sender}} (call), [send-text](send-text.md) (call), [send-email-message](send-email-message.md) (call)
- **Tools:** `get-web-chat-link`
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
   n22["set sc_email, sc_phone, sc_medium"]
   c20 -- "else" --> n22
   c23{"case"}
   n22 --> c23
   b24["set sc_medium"]
   c23 -- "sc_item.kind === 'web_link' && !sc_medium && !!cargo.twilioNumber && …" --> b24
   c25{"case"}
   b24 --> c25
   c23 -- "else" --> c25
   b26["set sc_email"]
   c25 -- "sc_item.kind === 'web_link' && !sc_medium && validateEmail(String(car…" --> b26
   c27{"case"}
   b26 --> c27
   c25 -- "else" --> c27
   b28["set sc_medium"]
   c27 -- "sc_item.kind === 'web_link' && !sc_medium && !!sc_email" --> b28
   c29{"case"}
   b28 --> c29
   c27 -- "else" --> c29
   b30[/"tool: get-web-chat-link"/]
   class b30 toolstep
   c29 -- "sc_item.kind === 'web_link'" --> b30
   b30f["set sc_link"]
   b30 -- "fails" --> b30f
   c31{"case"}
   b30 --> c31
   b30f --> c31
   c29 -- "else" --> c31
   b32["say: Sorry, I couldn't make a link to continue on the web. Is th…"]
   c31 -- "sc_item.kind === 'web_link' && !sc_link" --> b32
   c33{"case"}
   b32 --> c33
   c31 -- "else" --> c33
   b34(["end (back to caller)"])
   class b34 endstep
   c33 -- "sc_item.kind === 'web_link' && !sc_link" --> b34
   n35["set sc_content, sc_too_long, sc_media, sc_forced"]
   c33 -- "else" --> n35
   c36{"case"}
   n35 --> c36
   b37["say: That's too long for a text message, so I'll email it."]
   c36 -- "sc_forced === 'email' && sc_too_long" --> b37
   c38{"case"}
   b37 --> c38
   c36 -- "else" --> c38
   b39["say: I can only send that by email, so I'll email it."]
   c38 -- "sc_forced === 'email' && !sc_too_long" --> b39
   c40{"case"}
   b39 --> c40
   c38 -- "else" --> c40
   b41["say: I can only send that by text, so I'll text it."]
   c40 -- "sc_forced === 'text'" --> b41
   n42["set sc_medium, sc_medium_q, sc_medium_q_es"]
   b41 --> n42
   c40 -- "else" --> n42
   c43{"case"}
   n42 --> c43
   b44[["call ask-choice sc_medium_q"]]
   class b44 flowstep
   c43 -- "!sc_medium" --> b44
   c45{"case"}
   b44 --> c45
   c43 -- "else" --> c45
   b46["set sc_medium"]
   c45 -- "!sc_medium" --> b46
   c47{"case"}
   b46 --> c47
   c45 -- "else" --> c47
   b48(["end (back to caller)"])
   class b48 endstep
   c47 -- "!sc_medium" --> b48
   n49["set sc_other"]
   c47 -- "else" --> n49
   c50{"case"}
   n49 --> c50
   b51[["call ask-choice What phone number should I text it to?"]]
   class b51 flowstep
   c50 -- "sc_other && sc_medium === 'text'" --> b51
   c52{"case"}
   b51 --> c52
   c50 -- "else" --> c52
   b53["set sc_phone"]
   c52 -- "sc_other && sc_medium === 'text'" --> b53
   c54{"case"}
   b53 --> c54
   c52 -- "else" --> c54
   b55["say: Sorry, I couldn't read that phone number. Is there anything…"]
   c54 -- "sc_other && sc_medium === 'text' && !sc_phone" --> b55
   c56{"case"}
   b55 --> c56
   c54 -- "else" --> c56
   b57(["end (back to caller)"])
   class b57 endstep
   c56 -- "sc_other && sc_medium === 'text' && !sc_phone" --> b57
   c58{"case"}
   c56 -- "else" --> c58
   b59["set assignment_side_effect"]
   c58 -- "sc_other && sc_medium === 'email'" --> b59
   c60{"case"}
   b59 --> c60
   c58 -- "else" --> c60
   b61[["call ask-email"]]
   class b61 flowstep
   c60 -- "sc_other && sc_medium === 'email'" --> b61
   c62{"case"}
   b61 --> c62
   c60 -- "else" --> c62
   b63["set sc_email"]
   c62 -- "sc_other && sc_medium === 'email'" --> b63
   c64{"case"}
   b63 --> c64
   c62 -- "else" --> c64
   b65(["end (back to caller)"])
   class b65 endstep
   c64 -- "sc_other && sc_medium === 'email' && !sc_email" --> b65
   n66["set sc_given"]
   c64 -- "else" --> n66
   c67{"case"}
   n66 --> c67
   b68["set assignment_side_effect"]
   c67 -- "!!sc_item.sender" --> b68
   c69{"case"}
   b68 --> c69
   c67 -- "else" --> c69
   b70[["call #123;#123;sc_item.sender#125;#125;"]]
   class b70 flowstep
   c69 -- "!!sc_item.sender" --> b70
   c71{"case"}
   b70 --> c71
   c69 -- "else" --> c71
   b72["say: Sorry, I couldn't send it. Is there anything else I can hel…"]
   c71 -- "!!sc_item.sender && cargo.copyHandled !== true" --> b72
   c73{"case"}
   b72 --> c73
   c71 -- "else" --> c73
   b74(["end (back to caller)"])
   class b74 endstep
   c73 -- "!!sc_item.sender && cargo.copyHandled !== true" --> b74
   c75{"case"}
   c73 -- "else" --> c75
   b76(["end (back to caller)"])
   class b76 endstep
   c75 -- "!!sc_item.sender" --> b76
   c77{"case"}
   c75 -- "else" --> c77
   b78["set assignment_side_effect"]
   c77 -- "sc_medium === 'text'" --> b78
   c79{"case"}
   b78 --> c79
   c77 -- "else" --> c79
   b80[["call ask-choice What phone number should I text it to?"]]
   class b80 flowstep
   c79 -- "sc_medium === 'text' && !cargo.textTo" --> b80
   c81{"case"}
   b80 --> c81
   c79 -- "else" --> c81
   b82["set assignment_side_effect"]
   c81 -- "sc_medium === 'text' && !cargo.textTo" --> b82
   c83{"case"}
   b82 --> c83
   c81 -- "else" --> c83
   b84["say: Sorry, I couldn't read that phone number. Is there anything…"]
   c83 -- "sc_medium === 'text' && !cargo.textTo" --> b84
   c85{"case"}
   b84 --> c85
   c83 -- "else" --> c85
   b86(["end (back to caller)"])
   class b86 endstep
   c85 -- "sc_medium === 'text' && !cargo.textTo" --> b86
   c87{"case"}
   c85 -- "else" --> c87
   b88["set assignment_side_effect"]
   c87 -- "sc_medium === 'text'" --> b88
   n89["set sc_to"]
   b88 --> n89
   c87 -- "else" --> n89
   c90{"case"}
   n89 --> c90
   b91["set assignment_side_effect"]
   c90 -- "sc_medium === 'email' && !sc_to" --> b91
   c92{"case"}
   b91 --> c92
   c90 -- "else" --> c92
   b93[["call ask-email"]]
   class b93 flowstep
   c92 -- "sc_medium === 'email' && !sc_to" --> b93
   c94{"case"}
   b93 --> c94
   c92 -- "else" --> c94
   b95["set sc_to"]
   c94 -- "sc_medium === 'email' && !sc_to" --> b95
   c96{"case"}
   b95 --> c96
   c94 -- "else" --> c96
   b97(["end (back to caller)"])
   class b97 endstep
   c96 -- "sc_medium === 'email' && !sc_to" --> b97
   n98["set sc_trusted"]
   c96 -- "else" --> n98
   c99{"case"}
   n98 --> c99
   b100["set sc_warning"]
   c99 -- "!sc_trusted" --> b100
   c101{"case"}
   b100 --> c101
   c99 -- "else" --> c101
   b102["set sc_warning_es"]
   c101 -- "!sc_trusted" --> b102
   c103{"case"}
   b102 --> c103
   c101 -- "else" --> c103
   b104["set sc_target"]
   c103 -- "!sc_trusted" --> b104
   c105{"case"}
   b104 --> c105
   c103 -- "else" --> c105
   b106["set sc_confirm_q"]
   c105 -- "!sc_trusted" --> b106
   c107{"case"}
   b106 --> c107
   c105 -- "else" --> c107
   b108["set sc_confirm_q_es"]
   c107 -- "!sc_trusted" --> b108
   c109{"case"}
   b108 --> c109
   c107 -- "else" --> c109
   b110[["call ask-choice sc_confirm_q"]]
   class b110 flowstep
   c109 -- "!sc_trusted" --> b110
   c111{"case"}
   b110 --> c111
   c109 -- "else" --> c111
   b112["say: Okay, I didn't send it. Is there anything else I can help y…"]
   c111 -- "!sc_trusted && cargo.choice !== 'yes'" --> b112
   c113{"case"}
   b112 --> c113
   c111 -- "else" --> c113
   b114(["end (back to caller)"])
   class b114 endstep
   c113 -- "!sc_trusted && cargo.choice !== 'yes'" --> b114
   n115["set sc_subject"]
   c113 -- "else" --> n115
   c116{"case"}
   n115 --> c116
   b117[["call send-text"]]
   class b117 flowstep
   c116 -- "sc_medium === 'text'" --> b117
   c118{"case"}
   b117 --> c118
   c116 -- "else" --> c118
   b119[["call send-email-message"]]
   class b119 flowstep
   c118 -- "sc_medium === 'email'" --> b119
   n120["set sc_sent"]
   b119 --> n120
   c118 -- "else" --> n120
   c121{"case"}
   n120 --> c121
   b122["say: Done. I texted it to the number ending in #123;#123;cargo.textTo4#125;#125;…"]
   c121 -- "sc_sent && sc_medium === 'text'" --> b122
   c123{"case"}
   b122 --> c123
   c121 -- "else" --> c123
   b124["say: Done. I emailed it to #123;#123;sc_to#125;#125;. Is there anything else I c…"]
   c123 -- "sc_sent && sc_medium === 'email'" --> b124
   c125{"case"}
   b124 --> c125
   c123 -- "else" --> c125
   b126["say: Sorry, I couldn't send it. Is there anything else I can hel…"]
   c125 -- "!sc_sent" --> b126
   c127{"case"}
   b126 --> c127
   c125 -- "else" --> c127
   b128(["end (back to caller)"])
   class b128 endstep
   c127 -- "!sc_sent" --> b128
   DONE(["end (back to caller)"])
   class DONE endstep
   c127 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
