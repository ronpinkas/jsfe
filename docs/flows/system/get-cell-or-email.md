# GetCellOrEmail

<!-- generated:start -->
**GetCellOrEmail** · `get-cell-or-email` · version 1.0.0 · worker (called by other flows) · steps · shared scope

> Identify a supplied contact or account number; collect missing data through a FORM, with caller-ID eligibility and bounded contact validation.

- **Parameters:** 
  - `retry_flow`: Retry destination
  - `cancel_flow`: Exit destination
  - `cell_number`: Phone already supplied
  - `email`: Email already supplied
  - `acct_number`: Account identifier already supplied
  - `account_pattern`: Tenant account identifier pattern
  - `account_name`: English account identifier label
  - `account_name_es`: Spanish account identifier label
  - `account_shape`: Tenant keypad identifier shapes
  - `intro`: English introduction
  - `intro_es`: Spanish introduction
  - `caller_on_file`: yes, no or unknown caller-ID eligibility
  - `retry_call_type`: Retry destination invocation policy
  - `validate_flow`: Contact existence validator
  - `merge_partials`: Allow split account identifiers
  - `parent_form`: Owning task FORM instance
  - `contact_options`: Internal options across protocol transitions
  - `retrying`: Retry-menu continuation
  - `gce_partial`: Internal split identifier continuation
  - `gce_rejected`: Internal rejected contact continuation
- **Calls:** [authenticate-user](authenticate-user.md) (value, by name), [contact-support](contact-support.md) (value, by name), [collect-service-answer](collect-service-answer.md) (call), [get-cell-or-email](get-cell-or-email.md) (replace), [contact-split-failed](contact-split-failed.md) (replace), [live-agent-requested](live-agent-requested.md) (reboot), {{contact_options.cancel_flow}} (reboot), [contact-caller-declined](contact-caller-declined.md) (replace), [generic-retry-with-options](generic-retry-with-options.md) (replace), {{contact_options.validate_flow}} (call), [contact-not-on-file](contact-not-on-file.md) (replace)
- **Tools:** none
- **Called by:** [authenticate-user](authenticate-user.md), [get-cell-or-email](get-cell-or-email.md), [contact-caller-declined](contact-caller-declined.md), [contact-split-failed](contact-split-failed.md), [contact-not-on-file](contact-not-on-file.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set contact_options"]
   START --> n0
   c1{"case"}
   n0 --> c1
   n2["set contact_partial"]
   c1 -- "!gce_rejected" --> n2
   c1 -- "else" --> n2
   c3{"case"}
   n2 --> c3
   n4["set contact_allowed, contact_prefill, contact_profiles, contact_keypad, c…"]
   c3 -- "!contact_partial" --> n4
   c3 -- "else" --> n4
   n5[["call collect-service-answer"]]
   class n5 flowstep
   n4 --> n5
   n6["set contact_text, contact_digits"]
   n5 --> n6
   c7{"case"}
   n6 --> c7
   c8{"case"}
   c7 -- "contact_options.merge_partials && contact_digits && (contact_options.…" --> c8
   c7 -- "else" --> c8
   b9(["replace → get-cell-or-email"])
   class b9 endstep
   c8 -- "!!cargo.gcePartial" --> b9
   c10{"case"}
   c8 -- "else" --> c10
   b11(["replace → contact-split-failed"])
   class b11 endstep
   c10 -- "contact_partial && contact_digits.length #gt; (contact_options.account_s…" --> b11
   n12["set contact_id, contact_phone, contact_mail, contact_kind, contact_named_…"]
   c10 -- "else" --> n12
   c13{"case"}
   n12 --> c13
   b14(["reboot → live-agent-requested"])
   class b14 endstep
   c13 -- "contact_kind === 'agent'" --> b14
   b15(["reboot → #123;#123;contact_options.cancel_flow#125;#125;"])
   class b15 endstep
   c13 -- "contact_kind === 'exit'" --> b15
   b16(["replace → contact-caller-declined"])
   class b16 endstep
   c13 -- "contact_kind === 'decline'" --> b16
   b17(["replace → get-cell-or-email"])
   class b17 endstep
   c13 -- "contact_kind === 'names_account'" --> b17
   b18(["replace → generic-retry-with-options"])
   class b18 endstep
   c13 -- "contact_kind === 'international'" --> b18
   b19(["replace → generic-retry-with-options"])
   class b19 endstep
   c13 -- "contact_kind === 'invalid_phone'" --> b19
   b20(["dispatch: intent detection"])
   class b20 endstep
   c13 -- "contact_kind === 'unmapped'" --> b20
   b21(["replace → generic-retry-with-options"])
   class b21 endstep
   c13 -- "contact_kind === 'invalid'" --> b21
   c22{"case"}
   c13 -- "else" --> c22
   b23(["replace → generic-retry-with-options"])
   class b23 endstep
   c22 -- "contact_kind === 'unmapped'" --> b23
   n24["set acct_number, cell_number, email, contact_check_key"]
   c22 -- "else" --> n24
   c25{"case"}
   n24 --> c25
   b26[["call #123;#123;contact_options.validate_flow#125;#125;"]]
   class b26 flowstep
   c25 -- "contact_check_key && !cargo.contactCheck" --> b26
   n27["set contact_error, contact_error_es"]
   b26 --> n27
   c25 -- "else" --> n27
   c28{"case"}
   n27 --> c28
   b29(["replace → contact-not-on-file"])
   class b29 endstep
   c28 -- "cargo.contactCheck === #quot;none#quot;" --> b29
   DONE(["end (back to caller)"])
   class DONE endstep
   c28 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
