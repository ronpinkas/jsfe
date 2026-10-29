# LateCodeReask

<!-- generated:start -->
**LateCodeReask** · `late-code-reask` · version 1.0.0 · worker (called by other flows) · steps

> Worker (ask-choice, at the first question after a code was accepted): says the code was already verified and asks the question again, for as long as the answer is only digits found, in a row, in that code; leaves the first other answer in cargo.lateCodeAnswer.

- **Parameters:** 
  - `question`: 
  - `question_es`: 
  - `code`: 
- **Calls:** [late-code-reask](late-code-reask.md) (replace)
- **Tools:** none
- **Called by:** [ask-choice](ask-choice.md), [late-code-reask](late-code-reask.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["ask: Your code was already verified. #123;#123;question#125;#125;"]
   START --> n0
   n1["set lc_late"]
   n0 --> n1
   c2{"case"}
   n1 --> c2
   b3(["replace → late-code-reask"])
   class b3 endstep
   c2 -- "lc_late" --> b3
   b4["set assignment_side_effect"]
   c2 -- "else" --> b4
   DONE(["end (back to caller)"])
   class DONE endstep
   b4 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
