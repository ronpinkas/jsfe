# Native forms, providers and performers

Implemented locally on 2026-10-19 in `jsfe/src/forms` and `jsfe/src/helpers`. These changes are a local, unpublished development candidate. Record the package version and runtime byte fingerprint; a matching version string alone does not identify a build. No production deployment is implied.

This is the current authoring reference. Earlier `collect-input-pattern.md` and `manifests.md` preserve the original design discussion; their carry/lift migration recipe and definition-keyed state examples are superseded.

## Ownership

- JSFE owns generic matching, input validation protocol, form instances/dependencies, provider retrieval, confirmation, action identity and durable recovery policy. Import builders and shared declarations from `jsfe/forms`; expression helpers come from `jsfe/helpers`.
- The host owns credentialed transport, storage adapters and persistence acknowledgments. Shared behavior does not belong in tenant-local or host-local support copies.
- Tenant modules own catalogs, API payloads, business eligibility and presentation. Pure domain rules may be authored as source functions and embedded at build time. Do not read legacy generators or snapshots to construct runtime steps.
- `defineForm`, `defineProvider`, `definePerformer`, `defineWorker`, `operationWorkers` and `linkFormSchemas` compile native declarations. `validateFlowContracts` checks contracts and references; it does not prove behavioral parity.

## One instance per owned task

`cargo.forms[instance]` contains `definition`, `task`, `parent`, `result_input`, canonical `specs`, `values`, accepted proofs, pending readings, errors, preparation state, `data`, saved arguments and child instances. Instance IDs are opaque. `cargo.formTasks[definition]` identifies an active root; nested ownership is `(parent instance, input slot)`, allowing two address slots or independent tasks to coexist.

Use the supplied `form_instance` only for internal reentry. A form resumes its saved arguments and validated progress. A sub-form returns through the same acceptance/invalidation transition as a field. Context service forms use `parent_form` with no `result_input`; they inherit the owner’s task without fabricating a value slot.

Never mutate accepted values directly for ordinary input. Use the common acceptance protocol. Explicit business-derived values and service results must have declared owning paths and dependencies.

## Input declarations

Use presets (`field`), an owned sub-form (`form`), or a narrow inline `profile`. Include labels and prompts in both languages. Relevant attributes:

- `when` / `unless`: relevance and readability. Conditions can reference sibling values, `cargo.*`, or `form.data.*`. Unknown conditions wait; they do not silently count as false.
- `required_when`: whether a relevant field must be collected. False makes the field optional while retaining voluntary recognition. Unknown blocks completion until its premise is known. Omit for required fields.
- `depends_on`: preparation/validation waits for committed prerequisite evidence; changing the prerequisite invalidates the dependent transitively.
- `reset_on`: invalidation only. It does not add a validation prerequisite.
- `validator`: receives `{form,input,value,values,reading}` and writes `cargo.inputCheck={ok,value?,message?,message_es?}`. Missing result fails closed. Activation and conversational answers use this same path.
- `prepare`: runs once before first validation or prompt; `refresh` runs before each prompt. `choices_from` / `question_from` read owner `data`. Use `compileFormPrompts` for contextual template prompts; it preserves declarations and generates workers.
- `activate` / `activate_on`: nominate dormant child entry fields that may propose controller assignments, such as a card number selecting a new-card branch. The controller and nominated entry validate as one atomic group; rejection cannot flip the controller. Use narrow descendant paths, never broad matching of every child field.
- `validate_always:true`: revalidate even an unchanged value when its business assumptions must be refreshed. Validator `revalidate:true` provides the same explicit cache bypass at validator declaration.
- `after`: post-commit callback. `any_of` groups can be `exclusive`; conflicting members require clarification.
- `confirm_against`: explicitly requires clarification when two field interpretations overlap, including current-field priority exceptions.
- `choices[].keys`: whole-answer keypad aliases, recognized only for the current field. An explicit current keypad key wins an overlapping current-field claim, including an `any_of` group; `confirm_against` can still require clarification. Keys never become aliases for noncurrent fields. `words` are semantic aliases; `current_only` restricts a choice. Grouped digit aliases and marked currency must not steal each other’s spans. English and Spanish word amounts require explicit currency and follow the shared cardinal grammar; sequential card digits are not money.

A batch retains independent valid fields if another field fails. Dependent early values remain pending until prerequisites validate. An invalid prerequisite cannot authorize an effect. Structured submissions are read leaf by leaf; objects are never coerced into scalar values. Primary nested extraction schemas derive from the same input declarations.

## Resolution and reentry

Resolve overlapping evidence in this order: current field, one matching field at the nearest owning scope, then ancestors. Multiple competing claims at the same applicable scope are clarified. Independent spans fill independent fields. Typed evidence beats an unconstrained text fallback. `confirm_against` deliberately overrides ordinary priority.

The common loop asks the first ready missing required input, skips accepted data, unwinds inapplicable children and blocks unresolved prerequisites. A context service may use `stop` and `close_on_stop:true` to close itself without handing a value to its parent. With `resume_on_parent_change:true`, an accepted owner correction closes the stale context service and resumes the same owned form with its retained progress, requiring a fresh confirmation. `RETURN` ends the entire engine transaction; ordinary worker completion uses `END`.

Optional follow-ups may declare `incomplete_outcome:{outcome:'resolved',reason:'payment_made'}` to preserve an already completed task’s outcome when collection cannot finish or the user leaves. Accepted outcome values are `resolved`, `unresolved` and `deflected`, with a nonempty reason. A reusable form may instead use `incomplete_outcome:{from:'completed_outcome'}` with a declared object parameter; its runtime value must pass the same validation. The nearest actual owned ancestor supplies a fallback to a child. Another task’s outcome never does. The policy covers missing input specifications, blocked dependencies, exhausted validation/retries and unmatched collection/confirmation dispatch; it does not complete missing inputs or authorize effects. Omit it for ordinary required forms, which retain their existing unresolved outcomes and reasons.

For bounded collection recovery, declare `on_exhausted:'recovery-worker'` on an input or FORM. On attempt exhaustion, the resolver checks the failed input/member, its group, then its containing form before walking actual owned ancestors. The worker receives `{form,failed_form,input,failed_input,reason:'attempts_exhausted'}`: `form` and `input` identify the selected policy’s owner, while `failed_form` and `failed_input` identify the original failure. Shared recovery resets only the selected input branch, closes its child without handing off an incomplete value, withdraws confirmation and reboots to that worker. Independent draft fields remain. The callback must deliberately collect a new choice and obtain any required fresh confirmation before an effect; exhaustion is not consent. Worker names and references are validated. With no callback, the existing incomplete-outcome or give-up path applies.

The common collector passes `form_context:{form,current,names,questions}` to `ask-choice`. The reader checks declared current-field or unique same-scope form readings before classifying an answer as a stale verification-code echo. A valid ZIP, amount or current menu key must not be discarded merely because its digits occur in the prior OTP. Use this shared context instead of a tenant-specific code filter.

Private provider questions during collection preserve the owner and pending verification. Repeated questions join the pending provider request instead of stacking another authentication flow. Independent field clauses are accepted before a provider suspends for verification. Questions cannot become invalid OTP attempts or arbitrary text answers.

## Providers

Declare a `provides` catalog: subject, gate (`flow`, verified paths), source (`flow`, result path, subject/freshness policy), facts and fact sets. Each fact has a key, phrasings, source path or dedicated worker, rendering rules and explicit missing-data text. A private catalog requires an explicit gate. Derive `asked` and mid-form question choices with the builder; do not maintain another list.

`provide-data`, `load-source` and `answer-facts` retrieve and answer requested facts. An explicit fact request does not require a generic account summary. Source refresh clears old results first and records freshness only after success. Subject changes invalidate incompatible data and verification. `no_gate` may skip rerunning a gate only when its declared verification paths hold; it never bypasses their check.

## Performers

Declare each action’s name, effect, subject, gate, execution worker/tool, idempotency or reconciliation policy, exact confirmation where applicable, and outcomes. `definePerformer` gathers inputs, prepares an immutable request, selects one applicable action, confirms it, calls `perform-action`, runs its required pure projector, consumes the exact durable receipt, then presents the stored result. Presenter arguments are `{form,request,result}`; retain that explicit result across nested performers rather than rereading the shared last-result cargo slot.

Declare `project:[SET steps]` for deterministic session updates such as payment and case ledgers. Its expression locals are `{form,formSnapshot,request,result,key}`: `form` is the owned instance ID and `formSnapshot` is its state at the recorded action. Projection writes target current `cargo`; detached recovery does not replace current forms with that snapshot. Use the durable key for idempotence, the original result timestamp for ordering and explicit ownership guards to preserve newer task drafts or facts. The compiler accepts only SET expressions with local temporary variables and rejects flow/tool/message orchestration. Projectors must be effect-free; expression failure prevents receipt consumption. Presenters own conversation and optional subsequent performers. Ledger updates belong in `project`, because detached late recovery runs this projector without replaying the presenter, `after` steps or caller continuation.

Bind subjects to owner data, including composite identities where necessary: `{account,service}` for cancellation or `{contact,type,reason}` for CRM filing. Compare the prepared subject to the current verification evidence before execution. An old unknown result holds that action scope; it cannot capture unrelated requests.

Confirmation is separate from fields. It binds the current form revision, values and prepared request. A correction invalidates that binding. Use `confirm.no_keys` only when a declared menu needs different keypad semantics; default `2` remains NO. Confirmation events receive `{form,event,text}` and reenter through ordinary validation. A YES embedded in other content is not consent. `confirm.clarifications` may list exact whole-answer clarification phrases in both languages, such as `['what does that mean','qué significa eso']`. Matching ignores question punctuation and uses the bounded ordinary unclear-answer retry path. These phrases neither consent nor change the request; other unrelated requests still dispatch normally.

## Durable actions and host save boundary

Hosts inject `createActionJournal({storage,namespace})` from `jsfe/host`; storage implements atomic attempt/scope/session-index compare-and-swap. A journal must expose claim, complete, checkpoint and pending recovery. The built-in `jsfe:action-claim` and `jsfe:action-complete` ports are reserved. Missing storage fails closed before native effects. In hy-rag-lambdas, `config.jsfe.durableActions` defaults to false: the journal stays unattached, and ordinary legacy turns make no journal reads or add native recovery progress. Only an explicitly opted-in tenant activates this policy.

`engine.getActionRecoveryIdentity()` privately caches a verified build stamp and a canonical digest of the loaded compiled flow and tool execution contracts. The stamp is verified before bundling and remains available inside the bundle; production recovery performs no runtime filesystem scan. Checkpoints carry `{protocol:1,runtime,definitions}`. Before full restoration or pure projection, JSFE requires an exact identity match. Missing, unsupported or different identities hold the pending outcome, preserve current task state, defer the incoming message and run no effect, projector or acknowledgment. A package version label is not a compatibility identity. Loaded definitions are immutable after activation; hot reload constructs a new engine, and execution counters/default data belong to individual frames.

The journal records a resumable engine checkpoint before an effect and the result afterward. For an opted-in native tenant, JSFE examines unconsumed versions per action key before consuming a new user message. Only an exact compatible recovery identity proceeds to continuation selection. A storage sequence orders journal writes, not workflow progress. A checkpoint from progress absent in the saved session restores its continuation; a late completion after saved progress runs only its pure projector against the current session, preserving current tasks and never replaying its presenter or caller tail. The arriving input is recorded as deferred recovery metadata. It never treats that message as retroactive consent. A higher journal sequence alone cannot justify restoring an older workflow; per-key applied versions, saved workflow progress, recovery epoch and host invalidation revision determine whether continuation restore is safe.

The host saves the resulting session first, then awaits `checkpointActionSession`. Failed or rejected saves never release action scopes. Versioned `{key,sequence}` receipts stay persisted for acknowledgment retry. Freeze those versions at the successful save boundary: an older attempted/unknown receipt must never acknowledge a later completion. Late tool callbacks return results without advancing the active session’s applied watermark. The performer advances it only after consuming and projecting the durable result. Acknowledging an unknown outcome clears its recovery checkpoint but retains its scope hold. No elapsed timeout resolves an uncertain financial action; a balance change alone is not transaction identity evidence. Explicit fresh consent may supersede an uncertain SEND only under a declared send retry policy.

Host invalidations use `retainRecoveryState(session,paths)` after changing or deleting host-owned cargo. Newer invalidations, including deletion tombstones, select pure result projection against the current session instead of restoring the older workflow or its private presenter. Explicit conversation resets rotate the persisted recovery epoch: old outcomes can be projected, but discarded workflows cannot resume. Before every fresh effect, `perform-action` reruns the declared `gate.flow` and checks current verification paths; a stale derived permission flag cannot replace that gate.

The host’s DynamoDB adapter shares the configured chats table with reserved internal keys. Chat entry points reject those keys. Do not deploy a new durable performer without configuring this port and testing the actual save boundary.

## Checkpoint storage codec

The Node host storage boundary imports `encodeCheckpoint`, `decodeCheckpoint` and `isEncodedCheckpoint` from `jsfe/host/node`. This Node-only entry uses asynchronous Brotli; the universal `jsfe/host` entry remains free of Node imports. The version-1 envelope stores binary `Uint8Array` data, the original UTF-8 JSON byte count and a SHA-256 integrity digest. It losslessly round-trips JSON-compatible session data without trimming history, forms or action records.

The default limits are 16 MiB of decoded JSON and 350 KiB of encoded binary. Decompression is bounded before decoding, and the host separately checks the complete DynamoDB item against a conservative 400 KiB bound, including all metadata and other fields. Compression does not guarantee that arbitrary data fits; an oversized item fails before the database write.

The host journal adapter encodes only the attempt checkpoint and decodes it when reading; successful acknowledgment removes that checkpoint payload. Journal-internal storage remains separate from conversation storage. Conversation writers default to `config.jsfe.sessionEncoding:'plain'`; only an explicit `'br-v1'` enables binary `engineSession` writes. This capability is independent of `durableActions`. The configuration group and both keys may be omitted; malformed values and unknown keys reject configuration. Conversation readers always decode supported envelopes before constructing a session, including when writers are disabled. Receipt versions are frozen at the actual save boundary, and other host fields retain their normal representation.

Historical plaintext remains readable. Unsupported envelopes, corrupt data, integrity failures and codec limits raise `CheckpointCodecError`; whole-item overflow raises `JSFEStorageSizeLimit`. A corrupt saved conversation must not become a fresh session or overwrite its stored row. Failed writes never acknowledge action receipts. Disabling encoding converts a decoded row to plaintext only on its next successful size-bounded save; it does not convert dormant rows, and oversized plaintext fails without trimming or modifying the old envelope.

Roll out decoder-capable readers before enabling any tenant’s binary writer. Old workers in a mixed fleet cannot read new envelopes. A pre-reader rollback requires lossless, revision-checked conversion and verification of every affected row; a flag toggle alone is insufficient. Existing native continuations and pending/unknown actions must remain on a compatible recovery service when native starts are disabled. Never hand them to legacy execution or reset them to manufacture rollback compatibility.

## Explicit monetary grammar and compatibility

`amountInAnswer(text)` and `isAmountAnswer(text)` preserve the published JSFE 1.6 behavior. Installing native FORM support does not make existing production flows accept cardinal words or treat pesos as dollar markers.

Native inputs can declare enhanced grammar explicitly:

```js
{ name: 'amount', profile: { kind: 'amount', min: 0.50,
    money: { currency: 'USD', cardinals: true, intent: 'payment' } },
  validator: 'validate-payment-amount' }
```

`readMoneyAmount(text, options)` returns a number or `NaN`; `isMoneyAmount` is true exactly for a finite result, including bare numeric input. Options require `currency: 'USD'`; `cardinals` defaults to false, and `intent` is optional. Currently USD is the only supported currency. Explicit pesos/MXN, euros and other named foreign currencies fail closed; no currency conversion or equivalence is inferred. The optional cardinal grammar supports complete English/Spanish dollar and cents phrases and preserves source spans. Unequal independent amounts, malformed cardinal phrases and signed negative amounts are rejected.

With `intent: 'payment'`, the shared `moneyIntentAllows` policy recognizes explicit English/Spanish payment-refusal, inability and deferral forms while allowing uncertainty followed by a positive correction (for example, “no entiendo, quiero pagar250”). The vocabulary is deterministic, not an exhaustive linguistic classifier. A recognized declined monetary instruction is not accepted as a numeric correction. Matching may pass an uncommittable `refused: true` candidate with raw text to a declared validator so that it can route to domain recovery. The common validation batch withholds that candidate even when a permissive validator returns success; activation and conversational paths use the same rule. Confirmation remains a separate, later action decision.

## Acceptance

Map every original behavior to native definitions or an explicit consolidation. Runtime import graphs must exclude carried JSON, lifted steps, source-renaming adapters and the old generator. Historical fixtures can remain outside the runtime graph. Counts and valid contracts alone do not establish completion.

Run independent rule tests, real-engine journeys with JSON session round trips, original behavioral suites, anonymized production response-shape journeys and intent/parameter probes in English and Spanish. Include nested out-of-order input, optional-field recognition, multiple ambiguity groups, corrections, subject changes, provider questions during OTP, duplicate turns, refused APIs, unknown effects and process loss before host save. Preserve intentional interaction differences explicitly rather than weakening effects or consent assertions.

Generation failures, stale artifacts, empty suite selections, crashed suites and failed expectations must fail acceptance. Record engine/build identity, source revisions, model configuration and exact executed evidence. Production deployment still requires Ron’s explicit authorization.

### Host capability admission

`definePerformer` declares `durableActions` in its contract requirements. A host must call `assertFlowHostCapabilities(flows, capabilities)` from `jsfe/host` before activation and supply `durableActions: true` explicitly for these flows. The check does not enable a journal or choose a conversation encoding. Missing requirements reject activation before customer input or effects. Other flow builders may declare additional boolean host requirements through `contract.requires`.
