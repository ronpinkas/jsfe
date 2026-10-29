# ShopifyQLOrderReplyCheck

<!-- generated:start -->
**ShopifyQLOrderReplyCheck** · `shopify-ql-order-reply-check` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Read a contextual order question or selection, using typed semantic continuation only when local field ownership cannot decide.

- **Parameters:** 
  - `value`: Original order question or selection
  - `form`: Owning FORM instance
- **Calls:** [shopify-ql-order-gate](shopify-ql-order-gate.md) (call), [shopify-ql-order-desk](shopify-ql-order-desk.md) (reboot), [shopify-ql-order-question](shopify-ql-order-question.md) (call)
- **Tools:** none
- **Called by:** [shopify-ql-order-question](shopify-ql-order-question.md) (validator)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   n1[["call shopify-ql-order-gate"]]
   class n1 flowstep
   n0 --> n1
   c2{"case"}
   n1 --> c2
   b3(["reboot → shopify-ql-order-desk"])
   class b3 endstep
   c2 -- "cargo.forms[form] && cargo.forms[form].context.subject !== cargo.shop…" --> b3
   n4["set subject, read, response, shown"]
   c2 -- "else" --> n4
   c5{"case"}
   n4 --> c5
   b6(["dispatch: intent detection"])
   class b6 endstep
   c5 -- "!read.invalid && !read.ambiguous && !read.ask && read.index #lt; 0 && !r…" --> b6
   n7[["call shopify-ql-order-gate"]]
   class n7 flowstep
   c5 -- "else" --> n7
   c8{"case"}
   n7 --> c8
   b9(["reboot → shopify-ql-order-desk"])
   class b9 endstep
   c8 -- "subject !== cargo.shopifyOrderIdentity #124;#124; !cargo.forms[form] #124;#124; cargo…" --> b9
   n10["set read"]
   c8 -- "else" --> n10
   DONE(["end (back to caller)"])
   class DONE endstep
   n10 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
