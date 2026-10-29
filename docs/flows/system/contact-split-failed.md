# ContactSplitFailed

<!-- generated:start -->
**ContactSplitFailed** · `contact-split-failed` · version 1.0.0 · worker (called by other flows) · steps · shared scope

> Restart a split identifier after too many digits.

- **Parameters:** 
  - `contact_options`: Current contact service options
- **Calls:** [get-cell-or-email](get-cell-or-email.md) (replace)
- **Tools:** none
- **Called by:** [get-cell-or-email](get-cell-or-email.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set contact_options"]
   START --> n0
   n1(["replace → get-cell-or-email"])
   class n1 endstep
   n0 --> n1
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
