# SendTextAction

<!-- generated:start -->
**SendTextAction** · `send-text-action` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Worker: send the explicitly prepared text through the platform transport; sent or unknown result, with no automatic resend.

- **Parameters:** 
  - `request`: 
  - `key`: 
- **Calls:** [send-text](send-text.md) (call)
- **Tools:** none
- **Called by:** [shopify-ql-product-links](../shopify/shopify-ql-product-links.md) (shopify)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2["set assignment_side_effect"]
   c1 -- "!readPhone(request.to)" --> b2
   c3{"case"}
   b2 --> c3
   c1 -- "else" --> c3
   b4(["end (back to caller)"])
   class b4 endstep
   c3 -- "!readPhone(request.to)" --> b4
   n5["set assignment_side_effect"]
   c3 -- "else" --> n5
   n6[["call send-text"]]
   class n6 flowstep
   n5 --> n6
   n7["set assignment_side_effect"]
   n6 --> n7
   DONE(["end (back to caller)"])
   class DONE endstep
   n7 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
