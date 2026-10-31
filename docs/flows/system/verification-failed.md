# VerificationFailed

<!-- generated:start -->
**VerificationFailed** · `verification-failed` · version 1.0.0 · worker (called by other flows) · steps · shared scope

> End a verification that ran out of attempts: retire the owning task, set cargo.verificationFailed, report it unresolved (verification_failed), say so, run the failed_flow given to authenticate-user, then offer an agent.

- **Parameters:** 
  - `form`: Owning task FORM instance
- **Calls:** {{cargo.authOptions.failed_flow}} (call)
- **Tools:** none
- **Called by:** [validate-otp-code](validate-otp-code.md), [resend-otp-code](resend-otp-code.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set ended, vf_text, vf_text_es"]
   START --> n0
   n1["say: #123;#123;vf_text#125;#125;"]
   n0 --> n1
   c2{"case"}
   n1 --> c2
   b3[["call #123;#123;cargo.authOptions.failed_flow#125;#125;"]]
   class b3 flowstep
   c2 -- "!(ended && ended.recovery && ended.recovery.mode === 'hold') && !!(ca…" --> b3
   n4["set vf_agent, vf_agent_es"]
   b3 --> n4
   c2 -- "else" --> n4
   c5{"case"}
   n4 --> c5
   b6["say: #123;#123;vf_agent#125;#125;"]
   c5 -- "!!vf_agent" --> b6
   n7(["end (back to caller)"])
   class n7 endstep
   b6 --> n7
   c5 -- "else" --> n7
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
