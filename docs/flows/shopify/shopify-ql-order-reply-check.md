# ShopifyQLOrderReplyCheck

<!-- generated:start -->
**ShopifyQLOrderReplyCheck** · `shopify-ql-order-reply-check` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Read a contextual order question or selection, using typed semantic continuation only when local field ownership cannot decide. A question about the order that its status, delivery, tracking and items cannot answer (a refund, cancellation, change or complaint) is picked as `other` by the reply ranker and returns '' so the Guru answers from the tenant's knowledge (owner 2026-11-19; prod 15:27 'If it doesn't arrive today can I get my money back?' was given the delivery line a third time). An apology like the Curacao account menu's (account-unanswerable) is the alternative, to be decided from how this works.

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
   c7{"case"}
   c5 -- "else" --> c7
   b8(["return to host / AI"])
   class b8 endstep
   c7 -- "!!response && response.key === 'other'" --> b8
   n9[["call shopify-ql-order-gate"]]
   class n9 flowstep
   c7 -- "else" --> n9
   c10{"case"}
   n9 --> c10
   b11(["reboot → shopify-ql-order-desk"])
   class b11 endstep
   c10 -- "subject !== cargo.shopifyOrderIdentity #124;#124; !cargo.forms[form] #124;#124; cargo…" --> b11
   n12["set read"]
   c10 -- "else" --> n12
   DONE(["end (back to caller)"])
   class DONE endstep
   n12 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
