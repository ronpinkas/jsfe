# ShopifyQLProductDialogValidate

<!-- generated:start -->
**ShopifyQLProductDialogValidate** · `shopify-ql-product-dialog-validate` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Distinguish a question about shown results from a new product request before accepting it.

- **Parameters:** 
  - `value`: Candidate product response
  - `form`: Owning form
- **Calls:** [shopify-ql-shown-product-read](shopify-ql-shown-product-read.md) (call)
- **Tools:** none
- **Called by:** [shopify-ql-product-dialog](shopify-ql-product-dialog.md) (validator)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set response"]
   START --> n0
   n1[["call shopify-ql-shown-product-read"]]
   class n1 flowstep
   n0 --> n1
   n2["set candidate"]
   n1 --> n2
   c3{"case"}
   n2 --> c3
   b4(["dispatch: intent detection"])
   class b4 endstep
   c3 -- "!candidate.invalidSelection && !/^(?:[1-5](?: please)?#124;yes#124;si#124;sí#124;stoc…" --> b4
   n5["set noop"]
   c3 -- "else" --> n5
   DONE(["end (back to caller)"])
   class DONE endstep
   n5 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
