# ShopifyQLProductSelectionAnswer

<!-- generated:start -->
**ShopifyQLProductSelectionAnswer** · `shopify-ql-product-selection-answer` · version 3.0.0 · worker (called by other flows) · steps · shared scope

> ask-choice's answer_validator at the store product question: an answer the keys did not read is read by the shown-product reader, and a product it names is the answer's key (answer_key); anything else goes on to the reply ranker.

- **Parameters:** 
  - `answer`: The caller's answer
- **Calls:** [shopify-ql-shown-product-read](shopify-ql-shown-product-read.md) (call)
- **Tools:** none
- **Called by:** [shopify-ql-product-stores](shopify-ql-product-stores.md) (answer_validator)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0[["call shopify-ql-shown-product-read"]]
   class n0 flowstep
   START --> n0
   n1["set answer_key"]
   n0 --> n1
   DONE(["end (back to caller)"])
   class DONE endstep
   n1 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
