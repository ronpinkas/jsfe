# Optional form client adapter

The adapter exported by `jsfe/forms` adds presentation and strict named answer reading. It changes no engine step, session format, form worker, validation transition, confirmation or lifecycle. Hosts that do not use it retain their existing helpers and behavior. No new model or AI role is involved.

## Host contract

The host owns the `formClient: 1` capability; `initSession` and `updateActivity` are unchanged. After a normal engine turn, `projectForm(session)` returns a read-only view of the pending collection request, or `null`. For a compact stored session, pass the loaded definitions as `projectForm(session, engine.flowsMenu)`. A host sends `{answer: session.response, form: view, context}` only to capable clients. The ordinary answer remains intact. Return `form: null` at confirmation, completion or a detour so the UI removes the previous card.

The view has `version: 1`, the owning root instance `form`, `language`, and recursive `fields`. A field has `name`, qualified `path`, `kind`, localized `label`, `required`, `sensitive`, `filled`, optional primitive `value`, optional `error`, and safe numeric `constraints`. A field, group or alternatives the conversation is asking for now carries `current: true` (absent on every other), so a client can point at it when a partly answered form is drawn again. Choice fields have `choices: [{key,label}]`. Nested forms have `kind: 'group'` and `fields`; alternatives have `kind: 'alternatives'`, `required`, `exclusive` and `fields`. Alternative member paths remain relative to their actual form; the group does not introduce a submission object.

Projection reads resolved presets, linked schemas, existing child instances/results and prepared choice data. It does not open child instances or run preparation/tools. Inapplicable, internal, bound and confirmation fields are omitted; dynamic choices without prepared data wait for the ordinary flow. A sensitive field exposes presence (`filled`) but never its accepted value. Field questions and unsupported shapes continue to work conversationally.

## Strict prompt convention

```text
JSFE_FORM_V1:{"form":"opaque-instance","values":{"amount":"50.00","card":{"card_number":"…"}}}
```

All leaves are strings. Enumeration values are canonical keys. Omitted/empty values leave existing accepted data intact; there is no explicit clear operation. The submission names the actual root instance, not a flow definition. Protocol versions, envelope properties, field paths, nesting and size are checked by `parseFormSubmission(prompt, projectForm(session))` **before** engine execution. A protocol error leaves the saved session untouched. Unknown enum/invalid field values enter normal field validation and produce field errors.

For a successfully preflighted submission, install `formSubmissionReaders(submission, () => engine.getSessionContext())` over the host's `readFormAnswer` and `enrichFormMatches` approved functions for that turn, and restore them in `finally`. These overrides handle only the exact preflighted prompt. They reuse `formInitialReadings`, field profiles and the installed `collect-input-accept` worker; they never write accepted values or approval evidence. Explicit named answers bypass conversational extraction while keeping validators, dependencies, callbacks and proposals. Other answers delegate to the ordinary helpers.

Keep the raw envelope out of language preprocessing, Guru requests and chat logs. The host can use a fixed activity marker by setting the same marker as the preflighted submission’s `prompt` in the readers and as the engine activity content. The local mock performs no AI calls or external business actions. The widget submits through POST `/ask`, and normal conversation can continue through `/askStream`.

## Scope

The adapter preserves existing reentry, partial acceptance, corrections and confirmation. It adds no submission receipts, view revisions, cross-save deduplication or new effect guarantees. A host must still serialize its turns and retain the engine's action/recovery guarantees. Browser drafts are in memory; sensitive edits are not retained across view replacement, and no editable form view is restored from chat history.

Run `npm run build`, `node tests/form-client.test.mjs`, and `npm test` from the JSFE checkout. Since jsfe 1.39.0. In hy-rag-lambdas the widget is capable and the tenant turns form cards on (`formRendering`, user-admin → JSFE Workflows); the mock host for local HTTP/browser tests is AIDevelopment `jsfe-flows/dev/`.
