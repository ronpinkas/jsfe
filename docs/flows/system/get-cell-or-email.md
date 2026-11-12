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
  - `gce_missed`: Internal misread contact continuation
- **Calls:** [authenticate-user](authenticate-user.md) (value, by name), [contact-support](contact-support.md) (value, by name), [collect-service-answer](collect-service-answer.md) (call), [get-cell-or-email](get-cell-or-email.md) (replace), [contact-split-failed](contact-split-failed.md) (replace), [live-agent-requested](live-agent-requested.md) (reboot), {{contact_options.cancel_flow}} (reboot), [contact-caller-declined](contact-caller-declined.md) (replace), [contact-misread](contact-misread.md) (replace), {{contact_options.validate_flow}} (call), [contact-not-on-file](contact-not-on-file.md) (replace)
- **Tools:** none
- **Called by:** [authenticate-user](authenticate-user.md), [get-cell-or-email](get-cell-or-email.md), [contact-caller-declined](contact-caller-declined.md), [contact-split-failed](contact-split-failed.md), [contact-not-on-file](contact-not-on-file.md), [contact-misread](contact-misread.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set contact_options"]
   START --> n0
   c1{"case"}
   n0 --> c1
   c2{"case"}
   c1 -- "!gce_rejected" --> c2
   c1 -- "else" --> c2
   n3["set contact_partial"]
   c2 -- "!gce_missed" --> n3
   c2 -- "else" --> n3
   c4{"case"}
   n3 --> c4
   n5["set contact_allowed, contact_prefill, contact_profiles, contact_keypad, c…"]
   c4 -- "!contact_partial" --> n5
   c4 -- "else" --> n5
   n6[["call collect-service-answer"]]
   class n6 flowstep
   n5 --> n6
   n7["set contact_text, contact_digits"]
   n6 --> n7
   c8{"case"}
   n7 --> c8
   c9{"case"}
   c8 -- "contact_options.merge_partials && contact_digits && (contact_options.…" --> c9
   c8 -- "else" --> c9
   b10(["replace → get-cell-or-email"])
   class b10 endstep
   c9 -- "!!cargo.gcePartial" --> b10
   c11{"case"}
   c9 -- "else" --> c11
   b12(["replace → contact-split-failed"])
   class b12 endstep
   c11 -- "contact_partial && contact_digits.length #gt; (contact_options.account_s…" --> b12
   n13["set contact_id, contact_phone, contact_mail, contact_kind, contact_named_…"]
   c11 -- "else" --> n13
   c14{"case"}
   n13 --> c14
   b15(["reboot → live-agent-requested"])
   class b15 endstep
   c14 -- "contact_kind === 'agent'" --> b15
   b16(["reboot → #123;#123;contact_options.cancel_flow#125;#125;"])
   class b16 endstep
   c14 -- "contact_kind === 'exit'" --> b16
   b17(["replace → contact-caller-declined"])
   class b17 endstep
   c14 -- "contact_kind === 'decline'" --> b17
   b18(["replace → get-cell-or-email"])
   class b18 endstep
   c14 -- "contact_kind === 'names_account'" --> b18
   b19(["replace → contact-misread"])
   class b19 endstep
   c14 -- "contact_kind === 'international'" --> b19
   b20(["replace → contact-misread"])
   class b20 endstep
   c14 -- "contact_kind === 'invalid_phone'" --> b20
   b21(["dispatch: intent detection"])
   class b21 endstep
   c14 -- "contact_kind === 'unmapped'" --> b21
   b22(["replace → contact-misread"])
   class b22 endstep
   c14 -- "contact_kind === 'invalid'" --> b22
   c23{"case"}
   c14 -- "else" --> c23
   b24(["replace → contact-misread"])
   class b24 endstep
   c23 -- "contact_kind === 'unmapped'" --> b24
   n25["set acct_number, cell_number, email, contact_check_key"]
   c23 -- "else" --> n25
   c26{"case"}
   n25 --> c26
   b27[["call #123;#123;contact_options.validate_flow#125;#125;"]]
   class b27 flowstep
   c26 -- "contact_check_key && !cargo.contactCheck" --> b27
   n28["set contact_error, contact_error_es"]
   b27 --> n28
   c26 -- "else" --> n28
   c29{"case"}
   n28 --> c29
   b30(["replace → contact-not-on-file"])
   class b30 endstep
   c29 -- "cargo.contactCheck === #quot;none#quot;" --> b30
   DONE(["end (back to caller)"])
   class DONE endstep
   c29 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
