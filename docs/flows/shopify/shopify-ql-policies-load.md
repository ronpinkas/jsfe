# ShopifyQLPoliciesLoad

<!-- generated:start -->
**ShopifyQLPoliciesLoad** · `shopify-ql-policies-load` · version 3.0.0 · worker (called by other flows) · steps · isolated scope

> Retrieve policy matches for the current question; only nonempty textual FAQ answers can become provider evidence.

- **Parameters:** none
- **Calls:** [operation:shopify-search-policies](operation:shopify-search-policies.md) (call), [no-action-needed](../system/no-action-needed.md) (system) (reboot)
- **Tools:** none
- **Called by:** [shopify-ql-store-policies](shopify-ql-store-policies.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set request"]
   START --> n0
   n1[["call operation:shopify-search-policies"]]
   class n1 flowstep
   n0 --> n1
   n2["set answers"]
   n1 --> n2
   c3{"case"}
   n2 --> c3
   b4(["reboot → no-action-needed"])
   class b4 endstep
   c3 -- "!answers.length" --> b4
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
