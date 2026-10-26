# JSFE reference

This is the self-contained authoring reference for JSFE and the Flow Designer's backend CoPilot. Use the actual installed flow/tool registries and host instructions for available business services, approved functions, configuration and credentials. Do not invent a tool, shared flow, model role or business capability. This reference describes engine behavior; it does not activate or deploy definitions.

## 1. Runtime documents and ownership

A flow set is a JSON array, conventionally `tenant.flows`, accompanied by a JSON tool array, `tenant.tools`. These are the editable runtime sources. Include all tenant workers, catalogs, forms, action declarations and named JavaScript functions in those documents. They must not import tenant JavaScript modules or require a generator to reconstruct their definitions. The host may compose multiple matched pairs, such as system, Shopify and tenant sets. Reference installed shared workers by ID instead of copying them. Resolve conflicting IDs deliberately; never rely on a later duplicate silently shadowing a definition.

JSFE owns collection state, nested ownership, validation transitions, confirmation invalidation, action guards and recovery. The host owns approved transport functions, credentials, storage, turn serialization and model configuration. Tenant definitions own intent descriptions, business rules, API payloads and presentation. Keep generic collection/retrieval/action bookkeeping in JSFE.

There are four authoring concepts:

| Concept | JSON declaration | Purpose |
| --- | --- | --- |
| Form | `form` | Collect and validate a reentrant task, accepting independently valid inputs out of order. |
| Provider | `provides` | Retrieve declared facts or fact sets, with authentication where required. |
| Performer | `form` and `performs`, with `prepare` and `present` | Collect, prepare, confirm and execute a guarded action. |
| Worker | `steps`, or `call` | Perform a small explicit calculation or orchestration task. |

A versioned entry has `declarationVersion: 2` (new authoring) or `1` (earlier sets, unchanged). JSFE lowers it at engine construction, compiles contextual question workers, links installed child schemas and validates the new declarations. Ordinary executable entries without that marker retain their existing meaning; `functions` on such an entry is a compile error. Generated steps and schemas are execution output, not a second editable source.

**Version 2: one parameter contract.** A primary form's parameters are GENERATED, never written: one per input that has a profile or sub-form, and a sub-form input becomes an object parameter carrying every nested field (`card_info{card_number, card_expiration, …}`). An enum's values come from the input's choices, and each value's meaning from that choice's `description`; write the meaning there, once, next to its phrases. The input's own `description` is the rule read before the meanings (`rule: key: meaning; …`, plus `enumDescriptions`). A choice the form offers but extraction must never set carries `extract:false`; an input callers may set but extraction never fills carries `internal:true`. `parameters` holds only entry arguments: values a calling flow passes (`owner`, `question`) and values a caller may say up front that the form does not ask under that name. Authoring a name the form generates, at any depth, is a compile error. A FLOW step may pass only arguments its version 2 target declares.

**Shared data.** One reserved entry per flow set holds values several flows use: `{"id":"<set>-data","library":"data","declarationVersion":2,"data":{"services":{…},…}}`. Expressions read it at run time as `$data.<name>` (for example `Object.values($data.services).find(s=>s.key===service)`); it is frozen and never saved in the session, so never copy it into a variable or cargo. A declaration field that is not an expression (a choice's phrases or label) references it as `{"$data":"services.bc.phrases"}` (a dotted path), compiled to a copy. An unknown name or path, a name declared twice, or a reference cycle fails at load. Write a catalog, phrase list or label once there, never as copies.

**Shared functions.** One reserved entry per flow set: `{"id":"<set>-functions","library":"functions","declarationVersion":2,"functions":{…}}`. Every version 2 flow can call them as `fn.name(…)`; a flow redefining a shared name, or a name declared twice, is a compile error. Put a function used by more than one flow there, never in copies.

`compileFlowDeclarations(flows, {tools?, externalFlows?, validate?})` is the tooling accessor; validation defaults to true. External flow objects support child-schema linking; external IDs alone support reference checking. A runtime engine must receive the actual complete composed registry. Compilation/contract validation is not behavioral testing.

## 2. Common flow fields

| Field | Meaning |
| --- | --- |
| `id` | Stable unique identifier, conventionally kebab-case. |
| `name` | Activation name, conventionally PascalCase; derived from `id` for declarations when omitted. |
| `description` | Intent boundary: what should activate the primary and which neighboring requests belong elsewhere. Stage-one intent selection reads this description. |
| `primary` | Whether intent detection may activate this entry. Ordinary flows default false; Provider defaults true unless overridden. |
| `version` | Informational flow version; not a saved-session migration or hot-reload instruction. |
| `scope` | `isolated` or `shared`. Prefer isolated reusable workers. Versioned builders default isolated. |
| `parameters` | Entry arguments: what a caller passes, or what may be said up front that no input asks. On a version 2 form, input parameters are generated and may not be written. Declare meaning precisely; never infer consent from extraction. |
| `parameterInstructions` | Cross-parameter extraction guidance for stage two; not stage-one intent selection. |
| `variables` | Initial local variables, preferably `{ "name": {"type":"string","value":""} }`. Object/array defaults are cloned per activation. |
| `functions` | Named ordinary JavaScript bodies, described below. |
| `contract` | Business summary, role, requirements, tool references and result metadata; builders supply normal protocol details. |
| `wraps` | Ordinary thin wrapper over an installed shared flow, by ID/name. The shared target becomes non-primary; omitted wrapper description, parameters, prompts and primary flag inherit from it (a primary wrapper needs no description of its own). |

For an ordinary executable flow, `prompt` / `prompt_es` are short UI labels, not intent instructions. For a Form/Performer declaration put them inside `form`. Other supported language variants use the corresponding language suffix.

A parameter descriptor has `name`, optional `type`, `description`, optional `enum`, `jsonSchema`, `internal`, and declaration-only `default`. Types are `string` (default), `boolean`, `number`, `integer`, `object`, `array`. A parameter map is also supported: a string value is a string parameter description; an object is its descriptor. `default` initializes its local variable and is omitted from extraction metadata. Preserve meaningful defaults such as an explicit confirmation-policy boolean. Do not copy generated `form_instance` bookkeeping into public parameters.

String `enum` values must be nonempty, trimmed and unique ignoring case. Extraction normalizes a case-insensitive match to the declared spelling and drops other values. An absent/invalid extracted parameter must still be collected. `internal:true` excludes a parameter from two-stage user extraction. `jsonSchema` supplies structured extraction shape; a form still validates its individual leaves. Public primary form fields with descriptions derive missing extraction parameters, including nested child schemas; declare aliases or narrower extraction enums explicitly.

Descriptions identify services and facts; caller-facing wording belongs in questions, SAY steps and fact renderers. Prefer focused handlers for distinct questions instead of one generic summary.

## 3. Expressions, variables and named JavaScript

Step expression strings are ordinary JavaScript expressions. `{{expression}}` interpolates a value into a message template. In a SET expression use the comma operator for multiple assignments, or call a named function; do not place bare semicolon-separated statements in an expression. Host-approved helpers and current flow variables are available in expressions. `cargo` is session-persistent state shared across flow boundaries, reboots and returns. It does not replace authentication or input validation.

An isolated flow receives its own declared variables/defaults and explicitly passed parameters, not arbitrary caller locals. Its local writes do not return to the caller; return domain results through declared cargo paths. Ordinary shared flow calls share the caller context by reference. Do not use `parameter || cargo.value` where false, zero or an empty value has a distinct business meaning; check the intended absence condition explicitly.

A function declaration is:

```json
{
  "declarationVersion": 1,
  "id": "calculate-total",
  "description": "Calculate the sum of the supplied item amounts.",
  "functions": {
    "total": {
      "description": "Sum the supplied item amounts without changing them",
      "parameters": [{"name":"items","type":"array"}],
      "body": [
        "let sum = 0;",
        "for (const item of items) sum += Number(item.amount);",
        "return sum;"
      ]
    }
  },
  "steps": [{
    "id":"calculate", "type":"SET", "variable":"noop",
    "value":"(cargo.total = fn.total(cargo.items), true)", "requireTrue":true
  }]
}
```

`functions` maps safe JavaScript identifiers to `{parameters, body}`. Each parameter has `name`, optional descriptive `type` / `description`, and optional `rest:true` on a rest parameter. `body` is an array of ordinary JavaScript source lines. Optional function `name` preserves its own recursion name when the registry key is an alias. Argument type annotations are descriptive; business validation remains explicit.

Use ordinary `if`, loops, local variables, arrays, objects, callbacks, `map`, `filter`, `reduce` and sibling function calls. This is not a restricted calculation DSL. Bodies are synchronous trusted developer code, compiled once for the loaded owner definition. Expressions call `fn.name(args)`; bodies can call siblings directly or through `fn`. Registered approved platform helpers are lexically available; callbacks may also be explicit parameters. Pass `cargo`, form state, request, result and other session values explicitly: functions do not capture a live session, caller variables or module imports. Function names are scoped to their declaring flow, plus the set's shared functions on version 2 flows. `fn` is reserved; do not declare a variable, parameter, global or approved helper with that name.

Use functions for pure business calculations and guarded session projections. External effects must use registered tools/action workers. Do not hide transport calls, new model selection or action authorization in a helper.

## 4. Ordinary executable steps

Each step has `type`, a stable `id`, and the applicable fields below. CASE/SWITCH branches and `onFail` contain one step object, never an array. Use a named worker when a branch needs several steps. Executing a branch does not terminate the following step sequence.

| Type | Fields and behavior |
| --- | --- |
| `SAY` | `value`, optional `value_es` etc.; append localized text until the next wait/return boundary. |
| `SAY-GET` | Same message fields plus `variable`; deliver accumulated text and wait for the next answer. Optional `digits`, `asSpoken`, `pii`. |
| `SET` | Evaluate `value`, assign to `variable`. `requireTrue:true` requires the result to be exactly true; expression failure must not be treated as success. |
| `CASE` | Ordered `branches` keys `condition: expression`, with optional `default`; first matching condition wins. |
| `SWITCH` | Evaluate `variable` once; select its value's branch, otherwise `default`. |
| `FLOW` | `value` target ID/name, `callType`, optional `parameters`; see control semantics below. |
| `CALL-TOOL` | Registered `tool`, `args`, result `variable`, and explicit `onFail`. |
| `END` | End only this flow; resume its caller after the FLOW call. A root simply finishes. |
| `RETURN` | End all stacks and return the evaluated `value` to the host. Empty string forwards this turn's original input to host AI/RAG. Queued SAY text is dropped unless `keepSay:true`. |
| `DISPATCH` | End all stacks, drop undelivered SAY text, and reroute this turn's input through primary intent detection. A match starts in the same turn; otherwise the host handles it with its conversation context. |

`FLOW.call` runs the child and returns to the next caller step. `FLOW.replace` replaces only the current frame; when the replacement ends, it returns to the original caller. A shared replace preserves existing variables; `initializeDefaults:true` fills declared target defaults only where a value is undefined. Versioned native builders set this explicitly. An isolated target always has its own declared context. `FLOW.reboot` clears all stacks and starts a new execution context with explicit parameters, preserving cargo. Queued SAY text normally travels with the reboot; `discardSay:true` drops it.

For validated native `FLOW.parameters` and `CALL-TOOL.args`, interpolation references must be dotted paths such as `{{request.account}}`, not arbitrary expressions. Compute expressions in a preceding SET or named worker. Provider `gateParameters` is an authoring convenience that lowers whole-expression templates to SET steps before the call.

`digits` on SAY-GET has `min`, `max`, optional `autoSubmitChars`, `autoSubmitMs`, and host-supported completion hints. A one-key answer must be exactly that key, not digits found inside a sentence. Direct `asSpoken:true` (or a condition string) preserves the original voice answer instead of digit reduction/AI cleanup. Use it for meaning-sensitive answers such as amounts; do not disable normal number/email cleanup indiscriminately. `pii:true` (or a condition) marks sensitive input for engine/host logging safeguards. FORM field spelling is `as_spoken`, not `asSpoken`.

An `onFail` SAY alone continues into the next step; route to an explicit terminating/recovery worker when continuation would be unsafe. The same is true of a SAY-only CASE branch. Transport retries must not repeat a charge or cancellation merely because a response was lost.

## 5. Forms and inputs

A form declaration has top-level common fields and `form:{inputs:[...]}`. Do not combine `form` with top-level executable `steps`. Form-specific options belong inside `form`:

| Option | Meaning |
| --- | --- |
| `inputs` | Ordered field/group/sub-form declarations. Order controls which ready missing field is asked next, not which fields may be accepted. |
| `before`, `after` | Ordinary step arrays before collection and after completed collection/confirmation. |
| `validator` | Whole-form validation worker, called with `{form,values}`. |
| `confirm`, `before_confirm`, `declined` | Confirmation descriptor, preceding steps and declined step array. |
| `confirmation_condition` | JavaScript expression deciding whether declared confirmation applies; default true. |
| `stop` | Internal condition used by the collection loop to stop a context service. |
| `close_on_stop` | Close that stopped service without returning an incomplete child value. |
| `resume_on_parent_change` | Owner corrections unwind a stale opted-in context and resume the changed ancestor. |
| `done` | Default true: complete through the shared form-done transition. False leaves deliberate orchestration to the author. |
| `prompt`, `prompt_es` | UI labels. |
| `incomplete_outcome` | Explicit business outcome fallback for incomplete optional followups; see recovery. |
| `on_exhausted` | Bounded recovery worker after validation attempts are exhausted. |

Top-level `variables` provides extra form locals. JSFE creates instance IDs, saved arguments, values, validation and confirmation state; do not author copies of these bookkeeping fields.

A minimal collecting flow is:

```json
{
  "declarationVersion":1, "id":"collect-postal-code", "primary":true,
  "description":"Collect the caller's postal code for the requested service.",
  "form":{"inputs":[{"name":"zip","field":"zip","description":"The caller's postal code"}]}
}
```

Use one of these input shapes:

| Shape | Fields |
| --- | --- |
| Preset field | `name`, `field`; optional overrides. Presets: `phone`, `email`, `zip`, `account_number`, `ssn_last4`, `amount`, `street_address`, `city`, `state`, `card_number`, `card_expiration`, `card_cvv`, `card_zip`. |
| Inline field | `name`, `profile`, questions and business validation. |
| Child form | `name`, `form:"installed-child-id"`, optional `parameters`. JSFE links its schema; do not copy the derived `schema` into editable source. |
| Alternative group | `name`, `any_of:[leaf-or-child declarations]`; optional `exclusive:true`. At least one applicable member satisfies the group; exclusive competing answers require clarification. |
| Bound requirement | `name`, `bind:"cargo.someVerifiedValue"`; a nonempty, non-false bound value satisfies it. A bound requirement is not a general text collector. |

Field options:

| Fields | Meaning |
| --- | --- |
| `label`, `label_es`; `question`, `question_es`; `retry`, `retry_es` | Names, first prompt and explicit retry wording. Contextual question templates compile to workers automatically. |
| `description` | Public extraction guidance; `response.description`, when used, describes an open answer. |
| `when` | Map paths to desired scalar values or arrays; siblings use field names, session paths use `cargo.*`, owner data uses `form.*`. Values prefixed `!` exclude that value. |
| `unless` | Paths whose populated, non-false value makes the field inapplicable. |
| `required_when` | Same condition map; a false evaluated condition makes a relevant field optional but still recognizable. Unknown dependencies block completion. |
| `depends_on` | Committed prerequisites for validation/preparation; their changes invalidate dependents transitively. |
| `reset_on` | Invalidate when these fields change, without creating a validation prerequisite. |
| `validator`, `validate_always` | Field validation worker; true explicitly revalidates unchanged values. A validator declaration may use `revalidate:true`. |
| `prepare`, `refresh`, `after` | Worker before initial validation/prompt, before each prompt, and after acceptance. |
| `choices_from`, `question_from` | Read prepared choices/question from the owner's `data`; corresponding localized question storage is handled by shared workers. |
| `digits`, `pii`, `as_spoken` | Collection hints. FORM preserves original speech by default; false explicitly opts into cleanup. |
| `confirm_against` | Declare overlapping field interpretations that require clarification even when normal current-field priority applies. |
| `activate`, `activate_on` | Narrow dormant-child activation: proposed controller assignments plus nominated descendant entry paths. Controller and entry validate atomically; a rejected entry must not flip a controller. |
| `response` | `{description}` on a readable leaf; use existing contextual DISPATCH extraction before accepting an open-ended answer. |
| `proposal` | Optional approval of an inferred field candidate, independent of final action consent. |
| `max_misses`, `max_attempts`, `on_exhausted` | Bounds for unreadable responses, validator rejections and deliberate branch recovery. |

Profiles:

| `profile.kind` | Options |
| --- | --- |
| `choice` | `choices:[{key,phrases,label?,label_es?,keys?,exact?,neutral?,negative?,current_only?}]`; optional `accept_other`, `numeric_values`, `narrative`. |
| `digits` | `min`, `max`: one unambiguous digit run of that length. |
| `identifier` | `pattern`: permitted account identifier shape. |
| `pattern` | `regex`, optional `flags`, `group`; optional `accept_other` for the current field only. |
| `phone`, `email` | Typed readers; email `literal:true` preserves an explicit visible address token in surrounding prose. |
| `amount` | `min`, `max`, optional `marked:true` or `marked:"out_of_order"`; optional `money:{currency:"USD",cardinals:true,intent:"payment"}`. |
| `text` | Current-field text fallback; `narrative:true` retains a substantive answer alongside independent structured fields. |

`phrases` is the authoring name for matching aliases; `description` explains their meaning. Do not duplicate `words` / `gloss` aliases in new source. Historical executable definitions remain readable with those old keys; new names take precedence.

Matching depends on policy. With `exact:true`, a phrase must form the whole normalized answer, allowing the engine's bounded courtesy/affirmation wrappers; questions and additional substantive corrections do not consent. Thus exact `here` does not accept `pay here`. Without exact, ordinary positive named choices may match within an unnegated clause: do not assume whole-answer matching. Keypad aliases, YES and NO-type answers have stricter rules regardless. `keys` are current-field-only whole-answer keypad aliases; they must not steal a monetary answer or identify a different field. `neutral` is not consent. Use exact choices for sensitive finite decisions.

JSFE resolves valid current-field evidence first, then a unique match in the nearest owning form, then ancestors; genuine competing claims are clarified. Independent spans can fill independent fields. Typed evidence outranks arbitrary text. `confirm_against` deliberately retains ambiguity. A child result uses the same acceptance/invalidation transition as a leaf. Pending dependent candidates wait for valid prerequisites; invalid data cannot authorize an action. Narrative mode does not turn fragments or bare structured identifiers into business explanations.

### Context-aware acceptance

A caller answers out of order, often several fields at once. That ability is kept, and every out-of-order answer is
validated against its context: an answer fills another question's field only where it is relevant there. These are the
standard rules for every form; the declarations below tell the engine what each field is.

Declarations:

| Declaration | Meaning |
| --- | --- |
| input `confirmation:"firm"` / `"soft"` | A yes/no decision. Firm (consent to a charge, a cancellation, storing a card, filing): YES only by `CONFIRM_WORDS` or the option's own exact phrases. Soft (an offer): the wider YES vocabulary. NO by the NO vocabulary or the option's own phrases. |
| input `invites:[names]`, `form.confirm.invites` | The other inputs this question (or the read-back) also asks for ("NEW CARD, LINK, or a different amount" invites `amount`), in its form or an enclosing one; read as in order while it is asked. |
| profile `out_of_order:{…}` | A narrower signature for out-of-order reading: the payment card takes a bare last four when asked, but out of order only a card word or "ending in 4242". |
| input `choices_from` | The choice's values come from prepared data (the caller's saved cards), so its signature is those values. |
| `form.compound:"worker"` | A parser that reads several of the form's fields from one answer (an address said in one breath). |

Rules, in order:

1. **The current question first.** The whole answer is read against the current input's signature and the inputs it
   invites. A match is that answer.
2. **A confirmation is answered only when it is asked.** Out of order it never makes sense, so no words, YES, NO or the
   option's own phrases, fill a confirmation that is not the current question.
3. **Out of order requires a ready field and the whole signature.** A bare number never fills, out of order, a field whose
   `depends_on` prerequisites are not filled yet (the sub-account before the account is known); a named answer ("50
   dollars") still waits as a pending value. **The whole signature:** A digit field takes a number only when the whole number fits its
   length; a pattern only when it covers the whole number; a choice only its declared or prepared values. A fragment of
   a longer number (the last four of "88 91 7112") fills nothing.
4. **A bare number** (no money mark, no word naming a field) is an amount only at a question that is, invites or is
   declared `confirm_against` an amount. A single digit the question offers as a key is that key; one it does not offer reaches the invited amount,
   whose validation decides (Curacao asks for it in dollars). A bare number that does not fit the current question is
   read out of order under rule 3.
5. **Compound answers.** Several fields fill from one answer only through the form's compound parser, or when every
   part of the answer fits exactly one field. **One part of an answer never fills two fields**; the engine refuses that
   reading and records the refusal.
6. **Scope.** Across forms the nearest form wins; two fields of the same form that fit the same part are asked about,
   never ranked.

Every result records why: `decisions` lists each field filled other than as the current answer with its rule (`invited`, `out_of_order`, `compound`), and every
refused reading is listed with its rule, so hosts can log what was filled out of order and what was refused.

## 6. Validation, reentry and contextual uncertainty

A field validator receives `{form,input,value,values,reading}` and writes `cargo.inputCheck={ok:true,value?}` or `{ok:false,message?,message_es?}`. Missing/malformed results fail closed. Activation values and conversational answers use the same validation path. `value` may normalize a valid input; never return success for a refusal to satisfy an effect's prerequisites.

A whole-form validator writes `cargo.formCheck={ok:true}` or `{ok:false,invalid:[{name,message?,message_es?}],message?,message_es?}`. Only declared fields may be rejected. The shared loop invalidates the affected branch and reasks; it does not discard independent valid fields.

State lives in `cargo.forms[opaqueInstance]`, owned by a root task or `(parent instance,input slot)`. JSFE maintains values, accepted proofs, pending candidates, dependencies, revisions, attempts, children and confirmation. `cargo.formTasks` identifies active root tasks. Internal `form_instance` resumes saved arguments and progress; context services use `parent_form` without a result slot. Do not write accepted values, approval tokens, revision counters or stack snapshots directly. Use business callback outputs and the shared acceptance path.

The loop skips accepted data and asks the first ready missing required field. Corrections invalidate dependent evidence and confirmation. With nested tasks, preserve the actual parent/slot rather than using a definition ID as an instance. Do not fabricate a completed child value when it stops, fails or yields.

### Retry, yield and recovery

`max_misses` defaults to two consecutive unreadable answers: clarify the first with explicit retry text or a localized “Sorry, I didn't catch that.” prefix; yield the second utterance to DISPATCH while preserving the draft. Deterministic uncertainty may yield earlier, especially unrecognized monetary instructions. Validator failures use a separate `max_attempts` budget. An out-of-order accepted answer is not a miss. On exhaustion the nearest declared `on_exhausted` receives `{form,input,failed_form,failed_input,reason:"attempts_exhausted"}` and must deliberately recover that branch; it does not receive consent.

`must_complete:true` on a form (inherited by every field of it and of the forms nested in it) or on one field (`false` on a field opts out): an unreadable answer is never yielded to DISPATCH, however long, and neither is a confirmation miss or an unresolved ambiguity — the question is asked again, acknowledged. Use it where leaving would strand an effect in progress (a payment's card, its billing-ZIP correction). Exits stay explicit: the form's stop words, `max_attempts` with `on_exhausted`, and whatever the host intercepts before the engine. The form runaway guard counts passes without a caller answer only.

Use `response:{description}` for open descriptions that need the existing intent/extraction model's interpretation. The prepared question and field description become contextual DISPATCH context. An extracted answer still passes deterministic validation; missing usable data yields with progress saved. A supported different intent routes to that flow; otherwise the host can answer with its full context. No separate field classifier/model role is needed. Do not attempt exhaustive conversational inference with keyword lists.

Ordinary DISPATCH is the default uncertainty escape. An explicit contextual DISPATCH may additionally declare the following step fragment (its surrounding flow must declare the response object and supply its own input/recovery steps):

```json
{
  "id":"interpret-reply", "type":"DISPATCH", "onResponse":"continue",
  "responseContext":"Ask about the shown products or describe a different product.",
  "responseParameters":[{"name":"asked","type":"string","enum":["stock","price","search"],"description":"The requested operation"}],
  "responseVariable":"response"
}
```

Declare `response` as a local object variable. Contextual routing offers `ContinueCurrent` along with primaries and `None`. ContinueCurrent retains the live continuation and runs following recovery steps; an optional typed response writes a cloned normalized object before continuing. A named primary replaces the continuation; None hands off. Neither writes that response object. Typed contextual v1 permits primitive string/boolean/number/integer fields, not object/array/jsonSchema. Missing fields remain missing. Errors preserve the pending step and prior object. Context is supplied to that decision without overwriting saved conversation history. This is existing configured intent/extraction, not authorization and not a snapshot restore.

## 7. Providers

Declare a catalog once in top-level `provides`, including on a Form/Performer that answers related questions. JSFE derives the public `asked` parameter and mid-form question catalog. Do not maintain a second vocabulary.

| Catalog field | Meaning |
| --- | --- |
| `subject`, `subject_es`, `name_path` | Human subject and optional cargo path for the person's display name. |
| `default` | Fact/set key when no explicit question was supplied. |
| `gate:{flow,verified:[paths]}` | Authentication worker and truthy verification paths required before private facts. |
| `source:{flow,result,subject?,refresh?}` | Retrieval worker, cargo result path, optional owner identity path; `refresh:"per_turn"` requests refresh on each turn. |
| `facts` | Nonempty list of fact definitions. |
| `sets` | `{key,description?,phrases?,facts:[factKeys]}` for related groups of facts. |
| `menu` | Optional post-answer menu with localized questions, choices and done policy. |

A fact has unique `key`, `description`, optional `phrases`, and a `path` within the loaded source or a dedicated `flow`. Optional `public:true` marks genuinely public data; private catalogs need an explicit gate. Presentation uses `label`/`label_es`, `say`/`say_es`, `missing`/`missing_es`, and `format`. Never invent a source value when absent. Money, date, digit and last-four renderers are presentation, not validation or permission.

Supported simple `format` names include `money`, `money_nonzero`, `date`, `date_no_year`, `last4`, `digits`. An object format maps result properties to format names. List format uses `{type:"list",item,item_es?,fields?,join?,join_es?}` with `{items}` / `{count}` in the outer template; optional `say_one` / `say_one_es` handles one item. Templates use `{value}`, named result properties and supplied `{name}` / `{label}`. Bracketed optional segments can provide alternatives separated by `|`.

`menu` supports `question`, `question_es`, optional voice variants, and `choices:[{key,phrases,exact?,flow?,set?}]`. `set` applies declared cargo assignments before an action route. `done` supports `phrases`, `say`, `say_es`. Keep whole-answer terminal phrases such as “no thanks” separate from a neutral “no” that offers further help. Facts take priority; a declared terminal answer must not be shortened into a different action. Test following-turn choices and facts, not just direct `asked` activations.

The shared `provide-data`, `load-source`, `answer-facts` and provider-menu workers gate, load and answer only the requested facts. Top-level `gateParameters` may pass literal data or whole-expression templates to the gate. Refresh clears old results before loading and records freshness only on success. `no_gate` may avoid rerunning a gate only while all declared verification paths still hold. It cannot grant access. Mid-form provider questions preserve the owner and pending verification instead of stacking repeated authentication tasks.

### Provider example: account-info

This reduced **composed-registry fragment** uses the existing account-info worker contract: the source produces `cargo.accountInfo.due.amount`. It is not a standalone flow set. Include the real `account-info-gate` and `account-info-load` definitions and their tool dependencies in the installed sets or final output; use a different source path only when its actual output contract declares it.

```json
{
  "declarationVersion":1, "id":"account-info", "name":"AccountInfo", "primary":true,
  "description":"Answer questions about the verified account amount due; not an instruction to make a payment.",
  "provides":{
    "subject":"account", "default":"due",
    "gate":{"flow":"account-info-gate","verified":["cargo.otpVerified","cargo.authenticatedAccount"]},
    "source":{"flow":"account-info-load","result":"cargo.accountInfo","subject":"cargo.accountNumber","refresh":"per_turn"},
    "facts":[{
      "key":"due", "description":"The payment currently required, not the entire remaining balance",
      "phrases":["amount due","monto por pagar"], "path":"due", "format":{"amount":"money"},
      "say":"The amount due is {amount}.", "say_es":"Lo que tiene por pagar es {amount}."
    }]
  }
}
```

## 8. Performers, confirmation and results

A Performer requires `form`, nonempty `performs`, `prepare` worker and `present` worker; optional `project` is a SET-step array. Each action declaration supports:

| Action field | Meaning |
| --- | --- |
| `action` | Stable business operation name. |
| `effect` | `read`, `send`, `write`, `charge`, `cancel`, `handoff`. |
| `when`, `unless` | Applicable action conditions; more than one selected action is an error. |
| `subject` | Ownership path such as `form.data.account` or `form.data.subject`; bind account/service identity, not an unrelated session flag. |
| `gate:{flow?,verified:[paths]}` | Execution-time verification; rerun the declared flow before each fresh effect. |
| `flow`, `tool` | Installed executor worker and/or registered tool identity. |
| `idempotency`, `reconcile` | Explicit backend policy. Charge/write/send/cancel require at least one; declaring prose alone does not implement backend idempotency. |
| `confirm:{exact:true}` | Required for charge, cancel or `reversible:false`. This requires a real form confirmation question. |
| `outcomes` | Map declared executor statuses to business outcomes, including unknown results. |
| `retry` | Explicit policies: `after:[knownStatuses]`; unknown retry only for SEND with `unknown:"explicit"` and a new accepted recovery choice. |

The prepare worker receives `{form}` and writes `cargo.actionRequest` with the exact request. JSFE selects the applicable action, binds request/subject/current input revision, obtains required confirmation and guards execution. An executor returns its normalized business result through `cargo.operationResult`; transport adapters use `{transport:"ok",value}` or the declared failure path. Native execution must distinguish success, explicit refusal/failure and unknown completion. Do not claim success from a timeout, a missing status or a later balance change.

`form.confirm` contains localized `question`, `question_es`, optional additional affirmative `phrases`, `clarifications`, `no_keys`, and `interrupts:[{key,phrases,flow,exact?}]`. The default NO key is `2`; override only for a deliberately declared menu. Clarifications ask for explanation without consenting. Interrupt workers receive `{form,event,text}` and must reenter ordinary validation after corrections. An answer containing YES plus a correction or unrelated request is not approval of the old request.

An input `proposal` separately asks whether an inferred field value is correct. It is legal only on readable leaves, not group/child/bind nodes. Options are static confirmation fields, `prepare`, `origins:["activation","answer"]`, `when`, `unless`. Its prepare worker receives `{form,input,value,values,reading}` and writes `cargo.proposalCheck` to a confirmation descriptor or explicitly null. A validator may instead return `proposal` inside a successful input check. A descriptor supports question(s), `binding`, affirmative `phrases`, NO keys, clarifications, interrupts and `on_declined`. Missing or malformed decisions fail closed. Field approval is bound to owner, revision, value and business binding; validation reruns before acceptance. It never authorizes the final action. NO cannot commit the candidate; yield cannot be treated as NO.

Projectors update session facts/ledgers after execution and during late-result recovery. `project` allows only SET expressions with local temporary destinations; no tool, FLOW or message steps. Available expression locals are `form` (instance ID), `formSnapshot`, `request`, `result`, `key` and current `cargo`. Use named functions, preserve ownership, return true where your projection wrapper requires it, and make ledger changes idempotent by action key. A detached recovery projector receives the recorded snapshot but writes current cargo; it must not replace newer tasks with old state. Projection failure prevents receipt consumption. The presenter receives `{form,request,result}` and owns customer wording and optional next steps. Do not reread an unrelated nested performer's shared last result.

Use the same generic registered execution adapters across performers. Generated `operation:<tool-id>` workers are ordinary executable definitions: include them in the tenant/shared JSON set when referenced. Do not generate missing executors from a guessed tool name at runtime.

### Performer example: make-payment

This reduced **composed-registry fragment** illustrates action authoring, not a replacement payment implementation. Its real `payment-prepare` worker must set `form.data.account`, build the validated complete request in `cargo.actionRequest`, and prepare the confirmation question. `payment-execute` and `payment-present` must be supplied with their actual registered payment tools and normalized outcome contracts. A complete payment form also declares its account, method, card and other required inputs; do not infer those values or tool result paths from this example. `get-account` is the existing verification worker.

```json
{
  "declarationVersion":1, "id":"make-payment", "name":"MakePayment", "primary":true,
  "description":"Make a requested account payment after verification and exact confirmation; not a report of an earlier payment.",
  "form":{
    "inputs":[{"name":"amount","profile":{"kind":"amount","min":0.5,"money":{"currency":"USD","cardinals":true,"intent":"payment"}},"question":"How much would you like to pay?"}],
    "confirm":{"question":"{{cargo.paymentConfirmation.question}}","question_es":"{{cargo.paymentConfirmation.question_es}}"}
  },
  "performs":[{
    "action":"curacao_payment", "effect":"charge", "subject":"form.data.account",
    "gate":{"flow":"get-account","verified":["cargo.otpVerified","cargo.authenticatedAccount"]},
    "flow":"payment-execute", "confirm":{"exact":true},
    "reconcile":{"policy":"Hold unknown results for reconciliation; never automatically repeat a charge."},
    "outcomes":{"ok":"resolved","failed":"unresolved","unknown":"unresolved"}
  }],
  "prepare":"payment-prepare", "present":"payment-present",
  "functions":{
    "recordOutcome":{
      "parameters":[{"name":"cargo"},{"name":"result"},{"name":"key"}],
      "body":[
        "if (!key) throw new Error('Missing action key');",
        "cargo.paymentOutcomes ||= {};",
        "if (!Object.hasOwn(cargo.paymentOutcomes, key)) cargo.paymentOutcomes[key] = result.status;",
        "return true;"
      ]
    }
  },
  "project":[{"id":"record-outcome","type":"SET","variable":"noop","value":"fn.recordOutcome(cargo,result,key)","requireTrue":true}]
}
```

The action key makes this session projection idempotent; it does not make the payment API idempotent. Declare backend `idempotency` only when the actual API supports the stated key/policy. Otherwise implement and test the declared reconciliation/unknown-result hold. Neither policy wording nor a recorded ledger entry proves a charge succeeded.

## 9. Outcomes, recovery and persistence

A terminating step may declare interpolated `outcome` / `reason`: `resolved`, `unresolved`, `deflected`; shared contextual yields use `pending`. Empty interpolation declares nothing. Outcome is business status, not automatic permission or proof of an external effect. Ordinary uncertainty must not be falsely declared “failed; start over.” Optional post-completion forms can retain completion with `incomplete_outcome:{outcome:"resolved",reason:"payment_made"}` or `{from:"declaredObjectParameter"}`. This cannot complete required inputs or authorize effects.

Optional step `recovery:{version:1,mode,reason,form?,flow?}` gives host guidance. Modes are `resume`, `restart`, `hold`, `none`; resume requires a real retained owned form and its definition. The engine validates it and exposes a one-turn `lastFlowRecovery`. A matched DISPATCH consumes the old outcome/recovery; a no-match handoff preserves it. Only explicit restart promises starting over. An attempted/unknown effect needs hold, never retry advice. Metadata does not execute recovery by itself.

### Action persistence

Durable is the default native action persistence mode. The host must provide its journal/storage and pass `assertFlowHostCapabilities`. A host may explicitly choose `engine.actionPersistence="session-only"`; both modes retain confirmation, ownership, revision, subject and session action guards. A separate `durableActions` requirement cannot be satisfied by session-only. Missing required support rejects activation; intrinsic `jsfe:*` protocols cannot be enabled by arbitrary host booleans.

Session-only protects persisted, serialized session progress from reentry/repetition. It does not protect against a successful external effect followed by loss of the updated session, or concurrent forks of an older snapshot. Durable storage and/or recoverable backend idempotency is needed for that failure boundary. Unknown charges/cancellations must never be automatically repeated in either mode.

With a durable journal, the host saves the returned full session before acknowledging exact versioned action receipts with `checkpointActionSession`. Failed saves do not release scopes. Compatible late results project into current state without replaying presenters or restoring an old workflow merely because their storage sequence is larger. Recovery identity binds verified runtime bytes and actual flow/tool contracts; a version string alone is insufficient. Identity mismatch, unresolved effects or failed projections preserve holds. Do not change persistence mode for a live conversation or clear holds to manufacture compatibility.

For versioned JSON, JSFE generates internal continuation revisions from the entire ordered declaration and named function bodies. Do not author `safetyRevision`. A source change retires obsolete unexecuted continuations before new input; uncertain effects remain preserved/quarantined. This is change detection, not authentication or automatic hot reload. Ordinary executable flows can explicitly use the SDK's revision helper when their host owns that policy.

## 10. Matching tools JSON

Every CALL-TOOL/action tool ID must exist in the composed tools array. A tool declares `id`, `name`, `description`, its input `parameters` JSON Schema (or supported `schema` form), and `implementation`.

| Tool field | Meaning |
| --- | --- |
| `parameters` | `{type:"object",properties,required?,additionalProperties?}`; properties describe actual arguments. |
| `implementation.type:"local"` | `function` names a host-approved function; no arbitrary function imports. |
| `implementation.type:"http"` | `url`, `method`, optional `headers`, `contentType`, `pathParams`, `queryParams`, `authentication`, `timeout`, `retries`, `responseMapping`. Credentials belong to approved host configuration. |
| `implementation.acceptStatus` | Listed non-2xx statuses are business answers: parse/map their body and let the flow inspect it. Other failed statuses follow onFail. |
| `returns` | JSON Schema of the value delivered after responseMapping. Read it to use real result paths. Optional host validation warns on mismatch without rewriting the result. |
| `security.rateLimit` | `{requests,window}` when supplied by the host contract. |

`responseMapping` supports `jsonPath` (`mappings` of target names to `{path,transform?,fallback?}`), `object` (`mappings`), `array` (`source`, optional `filter`, `itemMapping`, `sort`, `offset`, `limit`, `fallback`), `template` (`template`, optional `dataPath`) and `conditional` (`conditions:[{if,then}]`, optional `else`). Use the actual tool schema/mapping supplied by the host; do not guess backend result fields or invent transform functions. Preserve explicit failure and unknown-result behavior. Native contract validation requires CALL-TOOL to have an onFail route.

## Reference delivery

The canonical package file is `jsfe/docs/copilot-reference.md`. In hy-rag-lambdas, `foundation/copilot-reference.js` caches the reference for ten minutes, resolves the latest published JSFE version through npm, retrieves that version's immutable jsDelivr file, and retains the last successful copy in S3 as fallback. A local documentation edit is not active in the backend until JSFE is published and the loader retrieves it. Changes to the backend CoPilot output schema separately require a host deployment. Match generated definitions to the runtime and shared sets actually installed; publication of this reference does not upgrade them.

## 11. Authoring and debugging checklist

1. Specify the primary's intent boundary and extraction semantics, using supplied host/tool contracts. Keep authentication distinct from website login and requested facts distinct from actions.
2. Compose an existing shared field/sub-form/provider/executor before adding a tenant copy. Put the complete new tenant definitions and functions in its JSON pair.
3. Declare dependencies, ownership, business validators, refusal handling and exact action consent. Keep uncertain conversation with DISPATCH and the host's full context.
4. Test actual loaded JSON: happy path, following-turn menus, out-of-order fields, corrections, wrong input, decline, provider/authentication detours, duplicate requests and unknown effects. Assert tool calls and zero unintended effects, not just wording or inventory counts. Use focused tests for a scoped change; broader acceptance must be explicit and source-bound.
5. Validate composed references/tools and execute with matching runtime/helpers/shared sets. A successful compiler or exported function unit test does not prove the deployed prompt or journey uses that definition.

For debugging, `explainSession(session,{flows,previous?})` reads existing state and identifies the author component, active worker/step, missing input, confirmation, handoff and action hold. An optional previous snapshot adds changed field names without collected values. It is a snapshot/difference, not an event log, authorization decision or extra model role. An empty stack does not prove success. Keep source definitions editable, loaded definitions immutable, and session bookkeeping inside JSFE.
