# ProvideQueuedData

<!-- generated:start -->
**ProvideQueuedData** · `provide-queued-data` · version 1.0.0 · worker (called by other flows) · steps · isolated scope

> Worker: answer the deduplicated private questions deferred during one owning task gate, checking each catalog before retrieval.

- **Parameters:** 
  - `form`: 
  - `requests`: 
- **Calls:** [provide-data](provide-data.md) (call), [provide-queued-data](provide-queued-data.md) (replace)
- **Tools:** none
- **Called by:** [run-form](run-form.md), [provide-data](provide-data.md), [provide-queued-data](provide-queued-data.md)

### Steps

```mermaid
flowchart TD
   START(("start"))
   n0["set pqd_first"]
   START --> n0
   c1{"case"}
   n0 --> c1
   b2(["end (back to caller)"])
   class b2 endstep
   c1 -- "!pqd_first" --> b2
   n3["set pqd_rest, pqd_verified"]
   c1 -- "else" --> n3
   n4[["call provide-data"]]
   class n4 flowstep
   n3 --> n4
   c5{"case"}
   n4 --> c5
   b6(["replace → provide-queued-data"])
   class b6 endstep
   c5 -- "pqd_rest.length #gt; 0" --> b6
   DONE(["end (back to caller)"])
   class DONE endstep
   c5 -- "else" --> DONE
   classDef endstep fill:#eef,stroke:#669
   classDef toolstep fill:#efe,stroke:#696
   classDef flowstep fill:#fef6e0,stroke:#b80
   classDef inputstep fill:#f3eefc,stroke:#75a
```
<!-- generated:end -->
