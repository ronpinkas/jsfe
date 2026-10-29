# ShopifyQLProductDialogValidate

<!-- generated:start -->
**ShopifyQLProductDialogValidate** · `shopify-ql-product-dialog-validate` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Distinguish a question about shown results from a new product request before accepting it.

- **Parameters:** 
  - `value`: Candidate product response
  - `form`: Owning form
- **Calls:** no other flow
- **Tools:** none
- **Called by:** [shopify-ql-product-dialog](shopify-ql-product-dialog.md) (validator)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set response, candidate"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2(["dispatch: intent detection"])
   class b2 endstep
   c1 -- "!candidate.invalidSelection && !/^(?:[1-5](?: please)?#124;yes#124;si#124;sí#124;stoc…" --> b2
   n3["set noop"]
   c1 -- "else" --> n3
   DONE(["end (back to caller)"])
   class DONE endstep
   n3 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
