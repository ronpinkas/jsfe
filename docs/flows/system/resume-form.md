# ResumeForm

<!-- generated:start -->
**ResumeForm** · `resume-form` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Resume an owned form instance with its validated progress and saved arguments.

- **Parameters:** 
  - `form`: 
- **Calls:** {{target}} (replace)
- **Tools:** none
- **Called by:** [run-form](run-form.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set target, parent, slot"]
   START --> n0
   n1(["replace → #123;#123;target#125;#125;"])
   class n1 endstep
   n0 --> n1
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
