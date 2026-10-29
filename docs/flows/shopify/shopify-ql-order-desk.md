# ShopifyQLOrderDesk

<!-- generated:start -->
**ShopifyQLOrderDesk** · `shopify-ql-order-desk` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Select a verified order, answer one catalog-declared fact, and transfer each contextual follow-up into its owning FORM.

- **Parameters:** 
  - `answer`: Internal contextual order reply
  - `reply_context`: Accepted FORM reading bound to its exact raw reply and verified subject
- **Calls:** [shopify-ql-order-gate](shopify-ql-order-gate.md) (call), [shopify-ql-orders-fetch](shopify-ql-orders-fetch.md) (call), [live-agent-requested](../system/live-agent-requested.md) (system) (reboot), [contact-support](../system/contact-support.md) (system) (reboot), [shopify-ql-no-orders](shopify-ql-no-orders.md) (replace), [shopify-ql-order-question](shopify-ql-order-question.md) (replace), [shopify-ql-order-detail](shopify-ql-order-detail.md) (call), [shopify-ql-order-desk](shopify-ql-order-desk.md) (replace), [give-up](../system/give-up.md) (system) (reboot), [shopify-ql-order-track](shopify-ql-order-track.md) (call), [shopify-ql-order-delivery](shopify-ql-order-delivery.md) (call), [shopify-ql-order-items](shopify-ql-order-items.md) (call), [shopify-ql-order-pickup](shopify-ql-order-pickup.md) (call), [shopify-ql-order-details](shopify-ql-order-details.md) (call)
- **Tools:** none
- **Called by:** [shopify-ql-track-order](shopify-ql-track-order.md), [shopify-ql-order-desk](shopify-ql-order-desk.md), [shopify-ql-order-reply-check](shopify-ql-order-reply-check.md), [shopify-ql-order-question](shopify-ql-order-question.md), [shopify-ql-tracking-number-check](shopify-ql-tracking-number-check.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   n1[["call shopify-ql-order-gate"]]
   class n1 flowstep
   n0 --> n1
   n2[["call shopify-ql-orders-fetch"]]
   class n2 flowstep
   n1 --> n2
   n3["set read, reply_context, selection, question, question_es"]
   n2 --> n3
   c4{"case"}
   n3 --> c4
   b5(["reboot → live-agent-requested"])
   class b5 endstep
   c4 -- "read.ask==='__agent'" --> b5
   b6(["reboot → contact-support"])
   class b6 endstep
   c4 -- "read.ask==='__exit'" --> b6
   b7["say: Okay. Is there anything else I can help you with?"]
   c4 -- "read.done" --> b7
   b8(["replace → shopify-ql-no-orders"])
   class b8 endstep
   c4 -- "selection.key==='!none'" --> b8
   b9(["dispatch: intent detection"])
   class b9 endstep
   c4 -- "answer && !read.ask && read.index#lt;0 && !read.number" --> b9
   b10(["replace → shopify-ql-order-question"])
   class b10 endstep
   c4 -- "!selection.key" --> b10
   c11{"case"}
   b7 --> c11
   c4 -- "else" --> c11
   b12(["end (back to caller)"])
   class b12 endstep
   c11 -- "read.done" --> b12
   n13[["call shopify-ql-order-detail"]]
   class n13 flowstep
   c11 -- "else" --> n13
   c14{"case"}
   n13 --> c14
   b15(["replace → shopify-ql-order-desk"])
   class b15 endstep
   c14 -- "cargo.orderMissing && cargo.orderFromCaller" --> b15
   c16{"case"}
   c14 -- "else" --> c16
   b17(["reboot → give-up"])
   class b17 endstep
   c16 -- "cargo.orderMissing" --> b17
   n18["set noop"]
   c16 -- "else" --> n18
   c19{"case"}
   n18 --> c19
   b20[["call shopify-ql-order-track"]]
   class b20 flowstep
   c19 -- "cargo.orderAsk==='track'" --> b20
   b21[["call shopify-ql-order-delivery"]]
   class b21 flowstep
   c19 -- "cargo.orderAsk==='delivery'" --> b21
   b22[["call shopify-ql-order-items"]]
   class b22 flowstep
   c19 -- "cargo.orderAsk==='items'" --> b22
   b23[["call shopify-ql-order-pickup"]]
   class b23 flowstep
   c19 -- "cargo.orderAsk==='pickup'" --> b23
   b24[["call shopify-ql-order-details"]]
   class b24 flowstep
   c19 -- "else" --> b24
   n25(["replace → shopify-ql-order-question"])
   class n25 endstep
   b20 --> n25
   b21 --> n25
   b22 --> n25
   b23 --> n25
   b24 --> n25
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
