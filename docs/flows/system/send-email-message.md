# SendEmailMessage

<!-- generated:start -->
**SendEmailMessage** · `send-email-message` · version 1.0.0 · worker (called by other flows) · steps

> Worker: emails `message` with `subject` to `to`, with an optional copy to `cc` (e.g. the account's email on file when the caller chose another address; owner 2026-10-17). Any valid address: sendEmail refuses one that cannot receive mail (mailbox verification). Sets cargo.emailSent; a refused or failed send leaves it false.

- **Parameters:** 
  - `to`: The email address
  - `subject`: The subject line
  - `message`: The email text
  - `cc`: An optional copy address; empty for none
- **Calls:** no other flow
- **Tools:** `send-email`
- **Called by:** nothing (unreachable)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set assignment_side_effect"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2[/"tool: send-email"/]
   class b2 toolstep
   c1 -- "typeof to !== 'undefined' && validateEmail(String(to #124;#124; '').trim())" --> b2
   b2f["set email_result"]
   b2 -- "fails" --> b2f
   b3["set email_result"]
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
