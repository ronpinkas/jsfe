# ShopifyQLPolicyQuestionValidate

<!-- generated:start -->
**ShopifyQLPolicyQuestionValidate** · `shopify-ql-policy-question-validate` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Classify a proposed policy question before accepting it; preserve the live collector when it remains a policy response.

- **Parameters:** 
  - `value`: Candidate policy question
  - `form`: Owning policy question form
- **Calls:** [shopify-ql-policy-question](shopify-ql-policy-question.md) (call)
- **Tools:** none
- **Called by:** [shopify-ql-policy-question](shopify-ql-policy-question.md) (validator)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set response"]
   START --> n0
   n1(["dispatch: intent detection"])
   class n1 endstep
   n0 --> n1
   n2["set noop"]
   DONE(["end (back to caller)"])
   class DONE endstep
   n2 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
