# ProvideData

<!-- generated:start -->
**ProvideData** · `provide-data` · version 1.1.0 · worker (called by other flows) · steps · isolated scope

> Worker: answer a question about a provider catalog. Resolves `asked` (a fact or set key; empty = ask which), passes the catalog's gate for non-public facts (gate.flow, called with gate_params; then every path in gate.verified must be truthy), loads the source (load-source), says the facts (answer-facts). Params: provides, asked.

- **Parameters:** 
  - `form`: Originating FORM instance for task-owned deferred questions
  - `provides`: The provider catalog
  - `asked`: Fact or set key
  - `reply`: The words that started the provider, this turn: tells a question back from its own menu from a later one
  - `asked_keys`: Independent requested facts or sets
  - `no_menu`: 'true': answer only (a question asked inside a form)
  - `gate_params`: Identifiers the caller already gave, passed to the gate flow as gate_params
  - `no_gate`: 'true': the caller is inside a task on the verified account; the gate flow is not run (the verified paths are still checked)
- **Calls:** [provider-unanswered](provider-unanswered.md) (replace), [ask-choice](ask-choice.md) (call), {{provides.gate.flow}} (call), [load-source](load-source.md) (call), [answer-facts](answer-facts.md) (call), [provide-queued-data](provide-queued-data.md) (call), [provider-menu](provider-menu.md) (call)
- **Tools:** none
- **Called by:** [collect-input](collect-input.md), [confirm-form](confirm-form.md), [provide-queued-data](provide-queued-data.md), [shopify-ql-product-search](../shopify/shopify-ql-product-search.md) (shopify), [shopify-ql-order-pickup](../shopify/shopify-ql-order-pickup.md) (shopify), [shopify-ql-order-track](../shopify/shopify-ql-order-track.md) (shopify), [shopify-ql-order-delivery](../shopify/shopify-ql-order-delivery.md) (shopify), [shopify-ql-order-items](../shopify/shopify-ql-order-items.md) (shopify), [shopify-ql-order-details](../shopify/shopify-ql-order-details.md) (shopify), [shopify-ql-store-policies](../shopify/shopify-ql-store-policies.md) (shopify)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set noop"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2(["end (back to caller)"])
   class b2 endstep
   c1 -- "!provides #124;#124; typeof provides !== 'object' #124;#124; !Array.isArray(provides.…" --> b2
   n3["set pd_keys, pd_unanswered"]
   c1 -- "else" --> n3
   c4{"case"}
   n3 --> c4
   b5(["replace → provider-unanswered"])
   class b5 endstep
   c4 -- "pd_unanswered" --> b5
   n6["set pd_menu, pd_mkeys, pd_menu_choices, pd_q, pd_q_es"]
   c4 -- "else" --> n6
   c7{"case"}
   n6 --> c7
   b8[["call ask-choice pd_q"]]
   class b8 flowstep
   c7 -- "!pd_keys.length" --> b8
   n9["set pd_keys"]
   b8 --> n9
   c7 -- "else" --> n9
   c10{"case"}
   n9 --> c10
   b11(["end (back to caller)"])
   class b11 endstep
   c10 -- "!pd_keys.length" --> b11
   n12["set pd_gated, pd_request"]
   c10 -- "else" --> n12
   c13{"case"}
   n12 --> c13
   b14(["end (back to caller)"])
   class b14 endstep
   c13 -- "pd_request.queued" --> b14
   c15{"case"}
   c13 -- "else" --> c15
   b16[["call #123;#123;provides.gate.flow#125;#125;"]]
   class b16 flowstep
   c15 -- "pd_gated && no_gate !== 'true'" --> b16
   n17["set pd_deferred, pd_keys, pd_ok"]
   b16 --> n17
   c15 -- "else" --> n17
   c18{"case"}
   n17 --> c18
   b19(["end (back to caller)"])
   class b19 endstep
   c18 -- "!pd_ok" --> b19
   c20{"case"}
   c18 -- "else" --> c20
   b21[["call load-source"]]
   class b21 flowstep
   c20 -- "provides.source && provides.source.flow" --> b21
   n22[["call answer-facts"]]
   class n22 flowstep
   b21 --> n22
   c20 -- "else" --> n22
   c23{"case"}
   n22 --> c23
   b24[["call provide-queued-data"]]
   class b24 flowstep
   c23 -- "pd_deferred.remaining.length #gt; 0" --> b24
   n25["set pd_ready"]
   b24 --> n25
   c23 -- "else" --> n25
   c26{"case"}
   n25 --> c26
   b27[["call provide-queued-data"]]
   class b27 flowstep
   c26 -- "pd_ready.length #gt; 0" --> b27
   n28["set pd_close, pd_who"]
   b27 --> n28
   c26 -- "else" --> n28
   c29{"case"}
   n28 --> c29
   b30["say: #123;#123;anythingElse('en', pd_who)#125;#125;"]
   c29 -- "pd_close" --> b30
   c31{"case"}
   b30 --> c31
   c29 -- "else" --> c31
   b32[["call provider-menu"]]
   class b32 flowstep
   c31 -- "provides.menu && no_menu !== 'true' && !pd_close" --> b32
   DONE(["end (back to caller)"])
   class DONE endstep
   b32 --> DONE
   c31 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
