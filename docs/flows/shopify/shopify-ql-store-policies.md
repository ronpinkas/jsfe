# ShopifyQLStorePolicies

<!-- generated:start -->
**ShopifyQLStorePolicies** · `shopify-ql-store-policies` · version 3.0.0 · **entry point** (intent detection can start it) · steps · isolated scope

> Asks a general store policy or FAQ rule: returns, refunds, exchanges, shipping or delivery ('do you ship to Canada', '¿cuál es su política de devoluciones?'). Not: a missing refund on their own purchase, tracking a placed order, or finding a product.

- **Parameters:** 
  - `policy_query`: The actual general store policy or FAQ question or topic supplied by the customer, preserving qualifiers such as destination and purchase date. Extract a concrete return, refund, exchange, shipping or other store-rule question/topic. Leave absent for an unknown/unavailable answer, confusion, inability to name a question, or unreadable input; do not turn these into a policy query.
  - `asked` (answer): answer: the store policy or FAQ answer to the customer’s question, including returns, exchanges, refund terms and shipping
- **Calls:** [shopify-ql-policies-load](shopify-ql-policies-load.md) (call), [no-action-needed](../system/no-action-needed.md) (system) (reboot), [shopify-ql-policy-question](shopify-ql-policy-question.md) (call), [provide-data](../system/provide-data.md) (system) (call)
- **Tools:** none
- **Called by:** intent detection

### Steps

```mermaid
flowchart TD
   START(("start"))
   c0{"case"}
   START --> c0
   b1(["reboot → no-action-needed"])
   class b1 endstep
   c0 -- "!(typeof global_shopify_policy !== 'undefined' && !!global_shopify_po…" --> b1
   n2["set policy_query"]
   c0 -- "else" --> n2
   c3{"case"}
   n2 --> c3
   b4[["call shopify-ql-policy-question"]]
   class b4 flowstep
   c3 -- "!policy_query" --> b4
   n5[["call provide-data"]]
   class n5 flowstep
   b4 --> n5
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
