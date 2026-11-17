# CollectInputAccept

<!-- generated:start -->
**CollectInputAccept** · `collect-input-accept` · version 2.0.0 · worker (called by other flows) · steps · isolated scope

> Worker: validate all readings, commit accepted changes once with transitive invalidation, then acknowledge and run declared callbacks.

- **Parameters:** 
  - `hits`: 
- **Calls:** [collect-input-accept](collect-input-accept.md) (call), [disambiguate-input](disambiguate-input.md) (call), [validate-input-batch](validate-input-batch.md) (call), [input-accepted-effects](input-accepted-effects.md) (call)
- **Tools:** none
- **Called by:** [run-form](run-form.md), [collect-input](collect-input.md), [collect-input-accept](collect-input-accept.md), [disambiguate-input](disambiguate-input.md), [collect-address](collect-address.md), [collect-credit-card](collect-credit-card.md), [confirm-form](confirm-form.md), [collect-service-answer](collect-service-answer.md), [collect-geocoded-address](collect-geocoded-address.md), [confirm-input-proposal](confirm-input-proposal.md), [collect-contextual-answer](collect-contextual-answer.md), [read-form-choice](read-form-choice.md), [read-confirm-reply](read-confirm-reply.md), [shopify-ql-get-search-query](../shopify/shopify-ql-get-search-query.md) (shopify), [shopify-ql-product-dialog](../shopify/shopify-ql-product-dialog.md) (shopify), [shopify-ql-product-stores](../shopify/shopify-ql-product-stores.md) (shopify), [shopify-ql-product-variant](../shopify/shopify-ql-product-variant.md) (shopify), [shopify-ql-product-location-retry](../shopify/shopify-ql-product-location-retry.md) (shopify), [shopify-ql-product-links](../shopify/shopify-ql-product-links.md) (shopify), [shopify-ql-order-question](../shopify/shopify-ql-order-question.md) (shopify), [shopify-ql-tracking-inputs](../shopify/shopify-ql-tracking-inputs.md) (shopify), [shopify-ql-policy-question](../shopify/shopify-ql-policy-question.md) (shopify)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set hits, ca_partition, ca_defer"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2["set assignment_side_effect"]
   c1 -- "ca_defer" --> b2
   c3{"case"}
   b2 --> c3
   c1 -- "else" --> c3
   b4[["call collect-input-accept"]]
   class b4 flowstep
   c3 -- "ca_defer && ca_partition.hits.length #gt; 0" --> b4
   c5{"case"}
   b4 --> c5
   c3 -- "else" --> c5
   b6(["end (back to caller)"])
   class b6 endstep
   c5 -- "ca_defer" --> b6
   c7{"case"}
   c5 -- "else" --> c7
   b8[["call disambiguate-input"]]
   class b8 flowstep
   c7 -- "ca_partition.ambiguous.length #gt; 0" --> b8
   c9{"case"}
   b8 --> c9
   c7 -- "else" --> c9
   b10(["end (back to caller)"])
   class b10 endstep
   c9 -- "ca_partition.ambiguous.length #gt; 0" --> b10
   n11["set ca_ordered"]
   c9 -- "else" --> n11
   n12[["call validate-input-batch"]]
   class n12 flowstep
   n11 --> n12
   n13["set assignment_side_effect, ca_results"]
   n12 --> n13
   n14[["call input-accepted-effects"]]
   class n14 flowstep
   n13 --> n14
   DONE(["end (back to caller)"])
   class DONE endstep
   n14 --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
