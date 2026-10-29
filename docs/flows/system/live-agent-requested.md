# LiveAgentRequested

<!-- generated:start -->
**LiveAgentRequested** · `live-agent-requested` · version 1.8.0 · **entry point** (intent detection can start it) · steps

> Customer wants to talk to a person, or says just 'agent' / 'AGENT': a live agent, a representative, customer service ('agent', 'speak to an agent', 'customer service representative', 'transfer me', 'I need to talk to someone', 'can I talk to a human', 'agente', 'representante', 'servicio al cliente', 'atención al cliente', 'transfiéreme', 'hablar con una persona', 'comunicarme con alguien', 'operator', 'manager', 'supervisor'), including a cut-off 'service' or 'al cliente' said alone. Not: continuing by text (SwitchToText); only asking for a phone number, email or hours (None). Transfers at once: no offer to continue with the assistant (the tenant's own interception covers it; owner 2026-10-28).

- **Parameters:** none
- **Calls:** no other flow
- **Tools:** `get-live-connect-link`
- **Called by:** intent detection, [get-cell-or-email](get-cell-or-email.md), [validate-otp-code](validate-otp-code.md), [generic-retry-with-options](generic-retry-with-options.md), [otp-text-undeliverable](otp-text-undeliverable.md), [give-up](give-up.md), [ask-choice](ask-choice.md), [ask-email](ask-email.md), [0](0.md), [read-form-reply](read-form-reply.md), [read-form-choice](read-form-choice.md), [read-confirm-reply](read-confirm-reply.md), [shopify-ql-order-desk](../shopify/shopify-ql-order-desk.md) (shopify)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set after_give_up"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2[/"tool: get-live-connect-link"/]
   class b2 toolstep
   c1 -- "!cargo.voice" --> b2
   b2f["set live_connect_link"]
   b2 -- "fails" --> b2f
   b3["set live_connect_link"]
   c1 -- "else" --> b3
   c4{"case"}
   b2 --> c4
   b2f --> c4
   b3 --> c4
   b5(["return to host / AI"])
   class b5 endstep
   c4 -- "!cargo.voice && live_connect_link" --> b5
   b6["set user_choice"]
   c4 -- "else" --> b6
   c7{"case"}
   b6 --> c7
   b8(["return to host / AI"])
   class b8 endstep
   c7 -- "!cargo.voice #124;#124; (!cargo.agentPhoneNumber && !cargo.agentHours)" --> b8
   b9["set user_choice"]
   c7 -- "else" --> b9
   c10{"case"}
   b9 --> c10
   b11(["return to host / AI"])
   class b11 endstep
   c10 -- "!cargo.agentPhoneNumber" --> b11
   b12["set user_choice"]
   c10 -- "else" --> b12
   c13{"case"}
   b12 --> c13
   b14(["return to host / AI"])
   class b14 endstep
   c13 -- "cargo.agentPhoneNumber" --> b14
   b15(["return to host / AI"])
   class b15 endstep
   c13 -- "else" --> b15
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
