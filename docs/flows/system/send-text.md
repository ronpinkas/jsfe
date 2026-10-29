# SendText

<!-- generated:start -->
**SendText** · `send-text` · version 1.0.0 · worker (called by other flows) · steps

> Worker: texts `message` to cargo.textTo (call text-destination first). Sets cargo.textSent.

- **Parameters:** 
  - `message`: The text to send
- **Calls:** no other flow
- **Tools:** `send-twilio-sms`
- **Called by:** [send-text-action](send-text-action.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set assignment_side_effect"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2[/"tool: send-twilio-sms"/]
   class b2 toolstep
   c1 -- "cargo.textTo" --> b2
   b2f["set text_result"]
   b2 -- "fails" --> b2f
   b3["set text_result"]
   c1 -- "else" --> b3
   n4["set assignment_side_effect"]
   b2 --> n4
   b2f --> n4
   b3 --> n4
   DONE(["end (back to caller)"])
   class DONE endstep
   n4 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
