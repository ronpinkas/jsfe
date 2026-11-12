# Optional form client adapter

The adapter exported by `jsfe/forms` adds presentation and strict named answer reading. It changes no engine step, session format, form worker, validation transition, confirmation or lifecycle. Hosts that do not use it retain their existing helpers and behavior. No new model or AI role is involved.

## Host contract

The host owns the `formClient: 1` capability; `initSession` and `updateActivity` are unchanged. After a normal engine turn, `projectForm(session)` returns a read-only view of the pending collection request, or `null`. For a compact stored session, pass the loaded definitions as `projectForm(session, engine.flowsMenu)`. A host sends `{answer: session.response, form: view, context}` only to capable clients. The ordinary answer remains intact. Return `form: null` at confirmation, completion or a detour so the UI removes the previous card.

The view has `version: 1`, the owning root instance `form`, `language`, and recursive `fields`. A field has `name`, qualified `path`, `kind`, localized `label`, `required`, `sensitive`, `filled`, optional primitive `value`, optional `error`, and safe numeric `constraints`. A field, group or alternatives the conversation is asking for now carries `current: true` (absent on every other), so a client can point at it when a partly answered form is drawn again. Choice fields have `choices: [{key,label}]`. Nested forms have `kind: 'group'` and `fields`; alternatives have `kind: 'alternatives'`, `required`, `exclusive` and `fields`. Alternative member paths remain relative to their actual form; the group does not introduce a submission object.

## Controls

An input may name the control a card draws for it with `form_client` (still `false` to keep it off the card). It changes only presentation: the profile, validator and conversational reading are unchanged, and the card submits a string the profile already reads.

| Declaration | View | Card |
|---|---|---|
| `{control: 'date', min?, max?, timezone?}` | `control: 'date'`; `constraints` `{min, max}` as `YYYY-MM-DD` | a date picker submitting `YYYY-MM-DD` |
| `{control: 'date', range_from: '<input>', ...}` | adds `range_from`: the start's `path` | the end of a range: one calendar fills the start and this end |
| `{control: 'number', min?, max?}` | `control: 'number'`; `constraints` `{min, max}` | a − / + stepper submitting a whole number |
| `{control: 'place', types, regions?}` | `control: 'place'`; `place` `{types, regions?}` | a text box with suggestions from the host's place service, submitting the picked place's own name |

A date's `min` and `max` are whole days from today in `timezone` (an IANA zone, required with either), turned into dates at each projection; write them as `{"$data": "path"}` to share the values the validator reads. With a control, its bounds replace the profile's (which for some kinds are lengths). Checked at definition time: a control on a profile kind other than pattern, text, digits, amount or identifier, on a `pii` input, an unknown key, a bound that is not a whole number, `min` above `max`, an unknown time zone, or a `range_from` that is not another date input of the form (itself not an end) fails. The profile must still read the submitted shape (`YYYY-MM-DD`, or digits). A place's `types` is `'cities'` or `'address'`; `regions` (optional) lists up to 15 two-letter country codes, projected lower case. The card shows and submits only the place's own name ("7438 Studebaker Rd", "Orlando"), never parts the form has no field for. A place control needs a pattern or text profile, which reads the picked text like a typed one.

A place control needs a host suggestion service: jsfe calls none and holds no key. The host answers only for a field of the form open now: `formPlaceField(projectForm(session), form, path)` returns the field's `place`, or `null` for any other form, path or control, so the endpoint never becomes a general place lookup. A client without the control draws its ordinary box.

Projection reads resolved presets, linked schemas, existing child instances/results and prepared choice data. It does not open child instances or run preparation/tools. Inapplicable, bound and confirmation fields are omitted (an `internal` input is a question the caller answers when asked, never filled by extraction, so it is drawn); dynamic choices without prepared data wait for the ordinary flow. A sensitive field exposes presence (`filled`) but never its accepted value. `error` carries a worded refusal only; the engine's bare `invalid` flag is not projected. Field questions and unsupported shapes continue to work conversationally; while the field being asked for is one the view omits (`form_client: false`, unprepared choices), `projectForm` returns `null`, so no card stands beside a question it cannot answer.

## Strict prompt convention

```text
JSFE_FORM_V1:{"form":"opaque-instance","values":{"amount":"50.00","card":{"card_number":"…"}}}
```

All leaves are strings. Enumeration values are canonical keys. Omitted/empty values leave existing accepted data intact; there is no explicit clear operation. The submission names the actual root instance, not a flow definition. Protocol versions, envelope properties, field paths, nesting and size are checked by `parseFormSubmission(prompt, projectForm(session))` **before** engine execution. A protocol error leaves the saved session untouched. Unknown enum/invalid field values enter normal field validation and produce field errors.

For a successfully preflighted submission, install `formSubmissionReaders(submission, () => engine.getSessionContext())` over the host's `readFormAnswer` and `enrichFormMatches` approved functions for that turn, and restore them in `finally`. These overrides handle only the exact preflighted prompt. They reuse `formInitialReadings`, field profiles and the installed `collect-input-accept` worker; they never write accepted values or approval evidence. Explicit named answers bypass conversational extraction while keeping validators, dependencies, callbacks and proposals. Other answers delegate to the ordinary helpers.

Keep the raw envelope out of language preprocessing, Guru requests and chat logs. The host can use a fixed activity marker by setting the same marker as the preflighted submission’s `prompt` in the readers and as the engine activity content. The local mock performs no AI calls or external business actions. The widget submits through POST `/ask`, and normal conversation can continue through `/askStream`.

## Scope

The adapter preserves existing reentry, partial acceptance, corrections and confirmation. It adds no submission receipts, view revisions, cross-save deduplication or new effect guarantees. A host must still serialize its turns and retain the engine's action/recovery guarantees. Browser drafts are in memory; sensitive edits are not retained across view replacement, and no editable form view is restored from chat history.

Run `npm run build`, `node tests/form-client.test.mjs`, and `npm test` from the JSFE checkout. Since jsfe 1.39.0; controls since 1.44.0; the place control since 1.46.0 (the system address form's street suggests addresses since 1.47.0). In hy-rag-lambdas the widget is capable and the tenant turns form cards on (`formRendering`, user-admin → JSFE Workflows); the mock host for local HTTP/browser tests is AIDevelopment `jsfe-flows/dev/`.
