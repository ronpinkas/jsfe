# ConfirmInputProposalDeclined

<!-- generated:start -->
**ConfirmInputProposalDeclined** · `confirm-input-proposal-declined` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Reject an owned input proposal without accepting its candidate or handing incomplete data to its parent.

- **Parameters:** 
  - `form_instance`: 
- **Calls:** {{proposal.descriptor.on_declined}} (call)
- **Tools:** none
- **Called by:** [confirm-input-proposal](confirm-input-proposal.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set owner, input, proposal, assignment_side_effect"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2[["call #123;#123;proposal.descriptor.on_declined#125;#125;"]]
   class b2 flowstep
   c1 -- "proposal.descriptor.on_declined" --> b2
   DONE(["end (back to caller)"])
   class DONE endstep
   b2 --> DONE
   c1 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
