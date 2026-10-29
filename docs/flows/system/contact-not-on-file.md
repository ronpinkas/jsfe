# ContactNotOnFile

<!-- generated:start -->
**ContactNotOnFile** · `contact-not-on-file` · version 1.0.0 · worker (called by other flows) · steps · shared scope

> Re-collect a rejected account contact, then offer the common retry menu at the rejection limit.

- **Parameters:** 
  - `contact_options`: Current contact service options
  - `error_message`: Rejection sentence
  - `error_message_es`: Spanish rejection sentence
- **Calls:** [get-cell-or-email](get-cell-or-email.md) (replace), [generic-retry-with-options](generic-retry-with-options.md) (replace)
- **Tools:** none
- **Called by:** [get-cell-or-email](get-cell-or-email.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set contact_options"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2(["replace → get-cell-or-email"])
   class b2 endstep
   c1 -- "cargo.gceRejects #lt;= 2" --> b2
   n3["set contact_error, contact_error_es"]
   c1 -- "else" --> n3
   n4(["replace → generic-retry-with-options"])
   class n4 endstep
   n3 --> n4
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
