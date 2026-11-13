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
destination's shape, else asks; a line with no text sender emails instead. Content goes through the system workers
(`text-destination` + `send-text`, `ask-email` + `send-email-message`) as is. A **sender flow** is called with
`{medium, destination, args}`, sends, tells the caller, and sets `cargo.copySent = true`; without that, SendCopy says it
could not send. There is no authentication gate in SendCopy: a sender flow gates its own document.
