# ResumeIdentityCaller

<!-- generated:start -->
**ResumeIdentityCaller** · `resume-identity-caller` · version 1.0.0 · worker (called by other flows) · steps · shared scope

> Resume the caller of an account recovery with its original FORM instance and gate policy.

- **Parameters:** 
  - `retry_flow`: Caller definition to resume
  - `parent_form`: Owning task FORM instance
  - `gate_options`: Gate policy retained across recovery
  - `cell_number`: New phone identifier
  - `email`: New email identifier
  - `acct_number`: New account identifier
- **Calls:** {{retry_flow}} (replace)
- **Tools:** none
- **Called by:** nothing (unreachable)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set resume_context"]
   START --> n0
   n1(["replace → #123;#123;retry_flow#125;#125;"])
   class n1 endstep
   n0 --> n1
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
