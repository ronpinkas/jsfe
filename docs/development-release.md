## 1.10.0: context-aware acceptance

An answer given out of order fills another question's field only where it is relevant there (reference §5): a confirmation
(`confirmation:"firm"` or `"soft"` on a choice keyed yes and no) is answered only when asked, firm by the confirm words and
soft by the wider YES vocabulary; a bare number is an amount only at a question that is, invites (`invites`, also on a
read-back's `confirm`) or is paired (`confirm_against`) with one; a number read out of order must be whole, never the
fragment of a longer one; a profile may declare a narrower out-of-order signature (`out_of_order`); and one part of an
answer never fills two fields. `matchInputs` lists `refused` readings and the `decisions` behind out-of-order fills, and
the form workers append them to `cargo.formAcceptance` (`formAcceptanceTrace`, names and rules only) for the host to log.
At the code question, "Otra", "Número de cuenta" and "Account number" mean ANOTHER ACCOUNT.

## 1.9.4: card groups start like a card

`accumulate_first` (a regular expression) limits accumulation to a first group that matches it; the `card_number` preset
uses `^[2-6]` (every card network's first digit), so "1234" or "0729" said at the card question keeps its normal reading
as an expiration date or a security code.

## 1.9.3: a card number said in groups

A digit input may opt in to `accumulate: true`: an answer that is only digits and short of the input's minimum is kept, and
the next question is "Go on." / "Continúe."; the next digits are joined to it, and anything that is not digits drops the
partial. The shared `card_number` preset opts in, so a card read in groups across turns is collected whole instead of each
group being read as another field (an account number, an amount).

## 1.9.2: address city list and part corrections

The shared address form (`collect-geocoded-address`) asks the city when the ZIP code carries several place names (`geocode-zip` returns `localities`, Google's `postcode_localities`; at most 7): "Which city is it: Commerce, East Los Angeles, Los Angeles or Vernon?", by name or key. With one name it is not asked, and a caller who says the city is wrong is asked it plainly and any city is taken. At the read-back, naming one part without a value ("the city is wrong", "la ciudad no") asks only that part again, and a plain NO asks which part is wrong (zip code, city, street, apartment, or ALL to start over) instead of starting over. The part naming is an opt-in form confirmation setting, `confirm.named_fields: true`, read from each input's `names`; other forms keep their behavior. A host whose `geocode-zip` returns no `localities` keeps the one city it returns.

## 1.9.1: stored sessions without definition copies

`engine.storedSession(session)` returns the session as a host should store it: each open form instance's input specs, providers and questions that its loaded definition (or its parent's schema) reproduces exactly are replaced by a named source (`derived`), and continuation revision hashes are kept only for the definitions of open form instances, the only ones read back. Anything a flow built at run time is stored as it is. `updateActivity` restores a stored session from the loaded flows; a source that no longer exists is left absent and the continuation safety check retires it. The session passed in is never changed, and a session never stored this way continues as before. Measured on a production payment call: 182 KB to 110 KB, 245 revision hashes to 5.

## 1.9.0: shared data

A flow set may carry one reserved shared-data entry (`library:"data"`, version 2), read two ways. Expressions read it at run time as `$data.<name>` (`Object.values($data.services)`): one deep-frozen copy per engine, never saved in a session, and every `$data.<name>` an expression reads must exist when the engine is built. A declaration field that is not an expression (a choice's phrases or label) references it by path as `{"$data":"a.b.c"}`, which compiles to a copy. `$data` is a reserved evaluation namespace. Unknown paths and names, duplicate names and reference cycles fail at load. Version 1 is unchanged. JavaScript authoring of flows (the public Form/Provider/Performer/Worker builders and compileExpression) is deprecated: author JSON declarations; the builders leave the public API at 2.0.

## 1.8.1: version 2 fixes found in the first tenant migration

A generated parameter is also a variable of its flow, as an authored one always was, so a flow's expressions can read it by name (without it, removing an authored copy left `service is not defined`). Compiling already compiled version 2 flows again keeps working: a FLOW call may pass a compiled form target's protocol variables, and a shared-functions entry beside compiled flows is accepted.

## 1.8.0: declaration version 2, shared functions, option clarification

`declarationVersion: 2` makes parameters one contract: a primary form's input parameters (sub-forms as object parameters with every nested field) are generated, and writing one of those names in `parameters` is a compile error at any depth. `parameters` holds only entry arguments. An enum value's meaning is read from its choice's `description`, after the input's own `description` as the rule (`enumDescriptions`, and the parameter description `rule: key: meaning; …`); `extract:false` keeps a choice out of the enum and `internal:true` marks an input extraction never fills. A FLOW step may pass only arguments a version 2 target declares. Version 1 is unchanged.

A flow set may carry one reserved shared-functions entry (`library:"functions"`, version 2); every version 2 flow sees those functions, and a redefinition or a name declared twice fails compilation. `functions` on an undeclared flow now fails compilation instead of being silently ignored. A primary `wraps` wrapper may omit its description (it inherits it). When a phrase is shared by two options of ONE input, the clarification names them ("Do you mean Gold Club or Member Benefits?" / "¿Se refiere a … o a …?"); a Spanish option label falls back to its first phrase rather than its key.

## 1.7.9: simpler authoring and DISPATCH ownership of conversational interpretation

The separate input-assessment classifier, model override and ASSESS-INPUT step are removed. Open-ended fields use existing contextual DISPATCH extraction and concise descriptions; an uncertain answer yields to the host with saved progress. Narrative correction phrases and broad payment refusal/tense rules are removed. Strict money reading, exact confirmation, proposal dependencies and action recovery guards remain.

Requires matched shared and tenant definitions. Updated safety revisions retire incompatible saved continuations before consuming input and preserve unknown action holds. Old meaning/assessment declarations fail admission rather than silently bypassing validation. This is an intentional removal of the 1.7.8 assessment extension, not a drop-in runtime-only upgrade. Publish and activate the matched shared/tenant definitions together; the runtime alone is not sufficient.

The Form, Provider, Performer and Worker authoring facades derive conventional metadata, parameter defaults, extraction descriptions and provider questions. Plain synchronous calculations/projections compile into ordinary guarded JSFE steps; compileExpression centralizes existing compound expression serialization. explainSession reads existing session snapshots and diffs without exposing collected values or introducing state. Runtime execution continues to consume JSON flow/tool sets, with the established shared-set composition.

# Reproducible native JSFE development candidate

The native form/performer implementation spans the engine, host and tenant flow generator. Testing an unversioned sibling symlink does not establish that a clean consumer installation will use the same engine.

A local candidate is an unpublished prerelease. Freeze and test its source, run `npm run clean`, `npm run build` and `npm test`, then use `npm pack --ignore-scripts` to create an immutable artifact. Never replace a candidate tarball with different bytes under the same version. If runtime source changes afterward, create the next prerelease version.

Both consumers pin the identical tarball under `vendor/jsfe/` using an exact `file:` dependency and lockfile integrity. Record the tarball SHA-256, package version, engine runtime fingerprint, source revisions and dirty source digest, and Node/npm versions. Verify each installed consumer's bytes with `flow-tests/lib/runtime-build.mjs`; matching package version labels alone are insufficient. Exercise a clean `npm ci` installation before accepting the candidate.

Acceptance includes engine tests, host journal/save-boundary/invalidation tests, tenant `npm run test:accept`, real-engine production-response-shape journeys, the independent designer-skill example and bilingual live intent/parameter probes. Include late completion after newer saved work, versioned receipt acknowledgment races, expiry/reset recovery, strict projector failure, optional follow-up outcomes and explicit confirmation clarification. Exercise the actual storage adapter and conversation helpers with full session checkpoints and high-entropy history, checking exact decoded round trips, complete item bounds and removal of acknowledged checkpoint payloads. Customer/API effects in these checks use local stubs. Model credential access is a separately authorized test operation. Do not retain credentials in reports.

The original `ai-ar` behavioral suites remain runnable in original mode. Native mode declares deliberate interaction changes explicitly and preserves independent payload, consent, subject, failure and retry expectations. There are no blanket exclusions for failed suites. Stale artifacts, crashed or empty selections and failed assertions fail acceptance.

Compatibility remains explicit. The published `amountInAnswer` and `isAmountAnswer` helpers retain their legacy defaults. USD grammar uses `readMoneyAmount`/`isMoneyAmount` with `{currency:'USD',cardinals:true,intent:'payment'}`, or a FORM amount profile with that object under `money`; cardinal parsing and payment intent are optional flags. Shared `FLOW` replacement retains its current variables unless the step declares `initializeDefaults:true`, which fills only undefined target defaults. Native builders opt in; loaded legacy flows are not rewritten. Mutable declared defaults and authored step data are private to each activation, while shared flow variables still use the caller's container. `SET requireTrue:true` requires a literal true result; absent or false retains ordinary SET behavior.

An absent `config.jsfe` group defaults to `{durableActions:false,sessionEncoding:'plain'}`; omitted keys default independently to those values. Unknown keys, invalid types and unsupported encodings reject configuration. `durableActions:true` attaches the action journal; legacy turns otherwise perform no journal reads. `sessionEncoding:'br-v1'` enables encoded conversation writes through Node-only `jsfe/host/node`; keep universal `jsfe/host` free of Node dependencies. Journal-internal encoding is separate from conversation policy. Codec bounds default to 16 MiB decoded JSON and 350 KiB encoded binary; the host additionally rejects complete DynamoDB items above its conservative 400 KiB bound. Unsupported/corrupt envelopes and codec limits raise `CheckpointCodecError`; complete-item overflow raises `JSFEStorageSizeLimit`. A failed decode must not replace the conversation, and a failed save must not acknowledge action receipts.

Deploy compatible readers across the fleet before enabling `br-v1` for a tenant. New readers accept historical plaintext and supported encoded rows; pre-reader hosts cannot read envelopes. Switching back to `plain` converts an existing encoded row only on a successful, size-bounded save, without trimming; dormant rows remain encoded and an oversized plaintext result blocks conversion. Before an older-reader rollback, stop new native starts, keep pending native continuations on capable routing, losslessly CAS-convert every target encoded row and verify none remain. Toggling policy or resetting sessions is not a migration.

Durable restore/project requires an exact identity match for `{protocol:1,runtime:'sha256:...',definitions:'<digest>'}`. Missing, invalid or different identities HOLD recovery: preserve current state, defer new input, and perform no projector, effect or acknowledgment. The definition digest includes canonical flows and nonsecret tool execution declarations; loaded definitions are immutable for an engine instance, so hot reload requires a new engine. This deliberately limits recovery across runtime or definition changes; it is not a production rollout approval.

Native performer declarations from 1.7.1 include `contract.requires: ['guardedActions']`. `assertFlowHostCapabilities` derives this requirement only from explicit `durableActions:true` (the default execution mode) or explicit `actionPersistence:'session-only'`. A bare `guardedActions:true` cannot bypass policy. Additional explicit `durableActions` requirements, including serialized 1.7.0 performers, remain strict; rebuild the set to select the new host policy. Other declared requirements still need an explicitly supplied boolean capability. The check never enables a capability. The host rejects unmet requirements before constructing an engine. Legacy flows without capability declarations keep the default-off behavior. The flow-set switch preflight uses the same helper; an explicit `--jsfe-policy` JSON file can merge approved policy keys in the same tenant configuration write as the flows and tools. Omitting the option preserves the current policy and rejects a native set when its requirements are unmet. Compression remains a separate storage decision.

Session-only opt-out (1.7.1) requires `config.jsfe.actionPersistence:'session-only'`, no attached journal, and `durableActions` absent or false. The engine defaults to durable and missing storage still fails closed. Session-only retains confirmation, subject, revision, gate and session-owned attempted/completed/unknown guards, but cannot recover an effect after its updated conversation save is lost. It creates no durable receipts or journal traffic. Action-enabled conversations pin their mode before the first effect; changing the mode of an existing conversation or abandoning durable recovery metadata is rejected. Apply the new mode to fresh conversations and keep existing conversations on their original routing. See [session-only semantics](copilot-reference.md#action-persistence).

Publishing the package, deploying the host or uploading tenant/system flow sets are separate release actions requiring the owner's authorization. A release should replace local tarball dependencies with the exact published package whose bytes were accepted, and deploy matched host/system/tenant contracts together. No deployment is implied by a passing local candidate.

## 1.7.2 retry/yield/recovery acceptance

Native contextual misses default to one localized re-ask then DISPATCH of the second current utterance. Validation attempts and declared exhaustion callbacks are independent. Dynamic question refresh, explicit localized retries, nested/out-of-order input, provider detours and recognized clarification questions require behavioral assertions. A required draft yields pending; a failed service stays unresolved; a completed optional follow-up stays completed; unknown effects remain held. The host must consume explicit recovery rather than infer restartability from `unresolved`. Unannotated legacy JSON retains its historical path.

Acceptance must include real engine-produced states through the actual host outcome and consume-once guidance adapter, not only helper snapshots. Verify English/Spanish and voice/text, “imposible” never confirms, exact price-reference utterance handoff, same root/accepted values on resume, fresh consent after correction, validator-specific limits, completed receipts, unknown-action holds, matched dispatch suppression and next-turn clearing. Run full engine and tenant matrices and clean consumer installs; Shopify behavior is outside this release and its source/artifact bytes must remain unchanged.

## 1.7.3 input-proposal confirmation

The shared proposal contract is opt-in through input declarations or validator descriptors. It retains candidates before canonical acceptance, uses an owned exact-confirmation context and revalidates proof before commit. No host or website changes are part of this implementation. The contract is included in JSFE 1.7.3. Publishing and pinning the package do not activate regenerated flow definitions or deploy a host.

`contract.requires:['jsfe:input-proposals:v1']` describes intrinsic runtime support, not host configuration. Current JSFE admits that version directly; unknown `jsfe:*` contracts fail closed. Static and linked child declarations derive the requirement and strict entry guard; dynamic proposal workers declare it explicitly. Older runtimes must reject the matched definitions before tenant behavior. Release/pin the accepted runtime before activating regenerated shared and tenant sets. Both consumers must pin the same exact published runtime before the matched shared and tenant flow definitions are activated.

## 1.7.5 input ownership and intent corrections

The local candidate corrects input ownership for incidental known-parent choices, keeps independent structured spans independent, and recognizes text-switch intent only as a complete command. English/Spanish courtesy and explicit continuation commands work; OTP delivery questions, quoted/code/struck-through commands, negation and extra-content sentences do not switch channels. Exact action consent, subject gates, money parsing, durable journal behavior and storage formats are unchanged. Provider terminal phrases retain priority when courtesy also makes them fit a shorter neutral action.

Tenant integration resolves a valid canonical case before compatibility routing, builds CRM verification text from the same contact snapshot as payload flags, and handles account-menu bare NO through the existing provider action contract. Intent probes fail execution errors independently of expected intent, reject malformed/empty runs, and retain a bilingual synthetic corpus. The new corpus is not a reconstruction of the historical uncommitted production replay.

Accept the same immutable tarball in isolated matched host/tenant installs. Run every engine suite and `npm run test:accept`, including the original journeys on both flow sets; `npm test` alone runs the curacao suites in legacy mode. Add host preprocessing end-reason checks to distinguish a closing question from a farewell, and exercise actual tool-call counts, payloads, reentry and fresh consent. Live model probes are separate from hermetic acceptance and retain execution failures as failures. Release authorization was granted after the local review. Publish the accepted runtime as 1.7.5, pin both consumers, deploy the dev host, then activate the matched shared and tenant definitions in the three dev configs. Production deployment remains a separate action.

## 1.7.6 reviewed input recovery and data ownership

The release preserves complete FORM voice answers before profile normalization, adds opt-in narrative evidence ownership and dependency-aware choice handling, and resumes a changed opted-in ancestor through its live owner. Contextual literal email reading remains opt-in. Absent/null named tool argument bags normalize without changing supplied object payloads or nullable roots.

Contextual DISPATCH is opt-in through `onResponse:"continue"` and `responseContext`. A scoped ContinueCurrent decision runs authored bounded recovery without terminating the owner; a registered workflow replaces it once; None hands an unrelated request to the host. Detection precedes termination and outcome/recovery stamping. Model errors do not authorize a switch, reserved disposition names cannot collide with registry names, and ordinary DISPATCH is unchanged. Both the native and canonical legacy contact collectors opt in. Confirmation, action persistence and storage encoding contracts are unchanged.

Reviewed acceptance: all 81 engine test files, 121 legacy and 121 native tenant suites; all 622 deterministic and 622 production-model primary journeys spanning 17 primaries and 166 applicable paths. Full-day replay retains 2,325 conversations and 8,543 original turns with no engine exceptions. Nine extraction deadlines and one empty Shopify cleanup response remain visible in model-health evidence; the extraction cases rechecked cleanly with production model redundancy. Shared Shopify's safe original-input fallback remains separately scoped. Unknown backend fixtures are diagnostic, never customer-success evidence.

Owner authorized publication, exact consumer pins, dev host deployment and matched shared/native flow activation on all three dev configs with session-only action persistence. Production deployment/activation is not part of this release authorization. Publish/install the accepted package before activating its matched definitions.

## 1.7.7 typed contextual responses and explicit registry composition

Typed contextual DISPATCH binds canonical primitive fields only after ContinueCurrent, using the active question in both intent stages. Named/None handoffs do not commit old input. Routing/extraction failures preserve pending ownership; a second incompatible decision in one turn fails closed. The capability and its strict entry guard are explicit; existing ordinary DISPATCH remains unchanged.

`jsfe/host` exports opt-in `composeRegistries` for independently compiled modules. It clones plain JSON declarations, deduplicates identical same-ID definitions, and rejects conflicts and case-insensitive ID/name aliases. Array and object property order remain execution data. Existing engine loaders do not compose implicitly.

Reviewed Shopify acceptance covers 47 native definitions, three primary providers, 639 domain assertions, 88 production-model synthetic journeys (336 turns), both 127-suite tenant modes, and 83 SDK test files. Customer tools remain local stubs. The 12 retained nonprimary legacy definitions serve saved continuations only; native host admission rejects known fresh legacy references and incomplete native bundles.

Owner authorized publication, exact consumer pins, dev host deployment, and matched shared/native Shopify activation for all three dev tenant configurations with explicit session-only action persistence. Production deployment/activation is outside this authorization. Match runtime, system, tenant and Shopify assets; do not enable native Shopify on the older production system registry.

## 1.7.8 explicit intake meaning and continuation safety

Optional declared field meanings use ASSESS-INPUT with a strict accept/retry/cancel/redirect result. This validation never grants action consent. Technical failure leaves input unaccepted and asks for a technical retry; late answers do not commit withdrawn work. Existing unmarked inputs do not invoke an assessment. The matched host qualifies GPT-6 Sol for this task, requires its schema-capable transport, and does not fall back to an unqualified model.

Proposal dependency handling preserves a corrected candidate through its new explicit confirmation. Opted-in continuation safety revisions stop obsolete frames and yielded form continuations before consuming new input. An uncertain prior effect remains held for authoritative reconciliation; no automatic replay or expiry releases it. Session-only mode and its confirmation, subject and attempted/completed/unknown guards remain explicit. Storage encoding and durability defaults do not change.

Payment interpretation rejects partial cents and card references as replacement amounts, distinguishes historical payment reports from new instructions, and keeps balance distinct from amount due. Identity recovery has bounded resend, lost-phone and disambiguation paths. Saved-card profiles deduplicate by stable identity and omit declined profiles.

Reviewed acceptance: 89 SDK test files; 142 legacy and 142 native flow suites; 626 hermetic and 626 real-model primary executions across 17 primaries and 167 applicable paths. Targeted model probes: consent/intake 229/230, payments 16/16 per flow set, routing 132/132. The one consent deadline safely left input unaccepted with no case filed; its late verdict was retry, and bounded same-source rechecks passed in both flow sets. Original observations remain retained. Customer effects use local stubs; these results do not claim a literal replay of the October 21 production day.

Owner authorized publication, exact pins in both consumers, dev host deployment and matching shared/ai-ar-ql activation in all three dev configs with session-only actions. Production deployment and activation are excluded. Shopify Policy remains unchanged with its later review recorded as a tenant TODO. Match runtime, host and regenerated definitions before activation; existing uncertain work must retain its hold.


## 1.7.11 — self-contained JSON authoring

Version-1 JSON flow declarations compile inside JSFE. Tenant JSON contains its forms, providers, performers, workers and ordinary named JavaScript functions; source snapshots remain detached from executable state. Named functions use explicit session arguments and normal JavaScript loops/callbacks. `phrases` and provider `description` are the authoring names; existing executable `words`/`gloss` inputs retain compatibility. Continuation safety revisions are generated internally from source declarations and preserve unknown action holds. The single authoring specification is `docs/copilot-reference.md`, also consumed by the Lambda CoPilot.

Owner authorized publication, exact pins in both consumers, dev host deployment and matching shared/ai-ar-ql activation on all three dev configurations with session-only actions. Native Shopify remains composed and Shopify Policy remains unchanged. Production is outside this authorization. Full execution/model replay follows the matched dev activation; local focused results are not relabelled as full published-runtime acceptance.

The 1.7.10 publication workflow was stopped before publication after the host-composition preflight rejected call-only declarative workers. Its tag is retained unchanged. The corrected 1.7.11 candidate includes actual registry-composition-to-engine execution coverage.

## 1.7.12 — OTP recovery catalog correction

Correct four OTP decision expressions to reference the renamed `otp_phrases` catalog. The incomplete rename in 1.7.11 prevented resend, lost-phone, later and some invalid-code recovery branches from executing correctly. Consent, authentication, action persistence and tool permissions are unchanged. A focused runtime regression executes the actual shared validator for English/Spanish lost-phone answers, resend, later and a short code, requiring no expression failures and no authentication. Tenant execution checks cover the affected account, identity, statement-delivery and proposal paths.

This corrective release follows the same authorized dev-only rollout: exact consumer pins, matched shared and ai-ar-ql definitions in all three session-only dev configurations, and production unchanged. Broader execution and model results are retained separately and must be reported as observed.
