# SwitchToText

<!-- generated:start -->
**SwitchToText** · `switch-to-text` · version 1.2.4 · **entry point** (intent detection can start it) · steps

> Customer explicitly asks to continue this conversation by text message / SMS ('switch to text', 'text me instead', 'can we continue by text', 'pásame a texto', 'seguimos por mensaje de texto'). Not: asking for a live agent or a person (LiveAgentRequested); asking to have one thing texted, such as a link, an address or a statement, a yes or no, or any answer that does not mention text or SMS (None).

- **Parameters:** none
- **Calls:** [give-up](give-up.md) (reboot)
- **Tools:** `get-whatsapp-link`, `switch-to-sms`
- **Called by:** intent detection, [validate-otp-code](validate-otp-code.md), [generic-retry-with-options](generic-retry-with-options.md), [ask-choice](ask-choice.md), [9](9.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   c0{"case"}
   START --> c0
   b1["say: We're already in a text conversation. Type what you need an…"]
   c0 -- "!cargo.voice" --> b1
   b2["set proceed_with_sms"]
   c0 -- "else" --> b2
   c3{"case"}
   b1 --> c3
   b2 --> c3
   b4(["end (back to caller)"])
   class b4 endstep
   c3 -- "!cargo.voice" --> b4
   c5{"case"}
   c3 -- "else" --> c5
   b6["set can_text"]
   c5 -- "!callerTextNumber(cargo)" --> b6
   b7["set can_text"]
   c5 -- "else" --> b7
   c8{"case"}
   b6 --> c8
   b7 --> c8
   b9(["reboot → give-up"])
   class b9 endstep
   c8 -- "!can_text && callerIsInternational(cargo)" --> b9
   b10(["reboot → give-up"])
   class b10 endstep
   c8 -- "!can_text" --> b10
   n11[/"tool: get-whatsapp-link"/]
   class n11 toolstep
   c8 -- "else" --> n11
   n11f["set wa_link"]
   n11 -- "fails" --> n11f
   n12["set welcome_message, switch_user_turn"]
   n11 --> n12
   n11f --> n12
   n13[/"tool: switch-to-sms"/]
   class n13 toolstep
   n12 --> n13
   n13f(["reboot → give-up"])
   class n13f endstep
   n13 -- "fails" --> n13f
   n14["say: I've sent you a text message. Please check your phone and r…"]
   n13 --> n14
   DONE(["end (back to caller)"])
   class DONE endstep
   n14 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
