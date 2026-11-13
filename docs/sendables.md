# Sendables

What a caller may ask to be sent ("send me that by text", "email me my statement"), offered to a generic sender
(the SendCopy flow) without that sender knowing what any item is. All three functions are in `jsfe/helpers` and in
`STANDARD_FUNCTIONS`, so flows call them from expressions.

## registerSendable(cargo, entry)

The flow that produces a document registers it on the session (`cargo.sendables`); the same `key` replaces the
earlier entry. Exactly one of:

- `content`: the text to send, sent as is by text or email.
- `sender`: a flow id, run with `{medium, destination, ...args}`. Every sender flow takes those three inputs and
  answers "can't" for a medium it cannot do.

```
registerSendable(cargo, {key:'receipt-81909192173', label:'Payment receipt $107.56', label_es:'Recibo de pago $107.56',
                         content:'<receipt text>'})
registerSendable(cargo, {key:'statement', label:'Latest statement', label_es:'Último estado de cuenta',
                         sender:'send-statement', args:{account}})
```

`label` is what the ranker reads; `label_es` is optional. A malformed entry throws where it is registered. Keys
starting with `reply-` are reserved. A document a caller may ask for before seeing it (the statement) is registered
at session start. Returns `true`, so it can stand in a SET.

## Always sendable: a flow's `sendable` declaration

A document the caller may ask for before anything produced it (the statement) is declared on the flow that sends it:

```
{ id:'send-statement', …, sendable:{key:'statement', label:'Your latest statement', label_es:'Su último estado de cuenta', media:['email']} }
```

Each turn the engine brings `cargo.sendables` in line with the declarations (`{kind:'document', sender:<that flow>,
args:{}, declared:true}`), so it is offered from the first turn. A run-time registration with the same key wins (it
carries args). The declaring flow is the sender: it receives `{medium, destination, args}` (destination is only what the
caller gave; the sender collects the rest), sets `cargo.copyHandled = true` as it takes over, and tells the caller every
outcome. `media` (default text and email) is what it can send by: asked for text, an email-only sender is emailed, and
the caller is told. `sendable` takes only `key`, `label`, `label_es` and `media`; `reply-` keys are reserved.

## sendables(cargo)

The registered documents, then the last six non-empty assistant turns of `cargo.chatTurns` (the host's masked
conversation: `[{n, role, text, source?}]`), as `{key:'reply-<n>', label:'Reply <n>: <first 120 characters>',
kind:'reply', content}`. Returns copies.

## chatTranscript(turns)

`cargo.chatTurns` as `role: text` lines, one per turn: the text the host's flat chat history has always carried, so a
note built from it (the live-agent handoff) reads as before.

## Picking from them at intent detection: `enum_from`

A flow parameter `{name:'item', description:'…', enum_from:'sendables'}` (two-stage detection only) is offered
`sendables(cargo)` when its flow is selected: stage 2's enum is their keys, and both executors read each key with its
label (`reply-4 = "Reply 4: Your next payment is due…"`), so one request picks the item and, beside it, any other
closed value (`medium: text | email`). A key not in the list is dropped; with nothing to send the parameter is left
out and the flow asks. `enum_from` replaces `enum` (never both) and names a jsfe source only.

## SendCopy: the system flow that sends them

`send-copy` (src/forms/send-copy-flow.js, built into the system set) is the primary that uses all of the above. Its
parameters are `item` (enum_from sendables), `medium` (text | email) and `destination` (a number or address the caller
gave). With no item it offers the latest one ("Should I send you my last answer: …?"); with no medium it uses the
destination's shape, else asks; an item with one medium (a line with no text sender, an email-only sender) uses it. Content
goes through the system workers (`text-destination` + `send-text`, `ask-email` + `send-email-message`) as is. A **sender
flow** is called with `{medium, destination, args}` before any destination is asked, sets `cargo.copyHandled = true` and
tells the caller every outcome; without that (no such flow), SendCopy says it could not send. There is no authentication gate in SendCopy: a sender flow gates its own document.
