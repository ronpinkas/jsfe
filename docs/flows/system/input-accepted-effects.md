# InputAcceptedEffects

<!-- generated:start -->
**InputAcceptedEffects** · `input-accepted-effects` · version 2.1.0 · worker (called by other flows) · steps · isolated scope

> Worker: acknowledge accepted or rejected candidates and run their callbacks after the batch commit.

- **Parameters:** 
  - `readings`: 
- **Calls:** {{ca_h.after}} (call), [input-accepted-effects](input-accepted-effects.md) (replace)
- **Tools:** none
- **Called by:** [collect-input-accept](collect-input-accept.md), [input-accepted-effects](input-accepted-effects.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set ca_h"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2(["end (back to caller)"])
   class b2 endstep
   c1 -- "!ca_h" --> b2
   n3["set ca_rest"]
   c1 -- "else" --> n3
   c4{"case"}
   n3 --> c4
   b5["set assignment_side_effect"]
   c4 -- "ca_h.outcome === 'rejected'" --> b5
   n6["set ca_ack, ca_ack_es"]
   b5 --> n6
   c4 -- "else" --> n6
   c7{"case"}
   n6 --> c7
   b8["set assignment_side_effect"]
   c7 -- "ca_h.outcome === 'rejected'" --> b8
   c9{"case"}
   b8 --> c9
   c7 -- "else" --> c9
   b10["say: #123;#123;ca_ack#125;#125;"]
   c9 -- "ca_ack && ca_h.outcome !== 'rejected'" --> b10
   n11["set noop"]
   b10 --> n11
   c9 -- "else" --> n11
   c12{"case"}
   n11 --> c12
   b13[["call #123;#123;ca_h.after#125;#125;"]]
   class b13 flowstep
   c12 -- "ca_h.after && ca_h.outcome !== 'known' && ca_h.outcome !== 'rejected'…" --> b13
   n14["set noop"]
   b13 --> n14
   c12 -- "else" --> n14
   c15{"case"}
   n14 --> c15
   b16(["replace → input-accepted-effects"])
   class b16 endstep
   c15 -- "ca_rest.length #gt; 0" --> b16
   DONE(["end (back to caller)"])
   class DONE endstep
   c15 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
