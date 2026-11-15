# JSFE engine internals

A guide for people who change JSFE itself: what the engine does on one turn, where state lives, how messages reach the
caller, and how the form engine is built from shared worker flows. Flow authors want the
[architecture guide](architecture-guide.md) and the [user guide](../user-guide.md) instead; this document assumes them.

Code references name the file and the function or step id, which survive edits better than line numbers. `index.ts` is
`src/index.ts`; `flows.js` is `src/forms/flows.js`; `form-state.js`, `form-conversation.js` and `match-inputs.js` are in
`src/helpers/`; `choice-flow.js` (the `ask-choice` worker) is in `src/forms/`.

---

## 1. The model in one page

A host calls the engine once per caller turn. The engine owns no storage: everything it needs between turns travels in
the session object the host saves and passes back.

```
host                                  engine (WorkflowEngine)
 │  updateActivity({role:'user', content}, session)
 │ ───────────────────────────────────────────────►  processActivity(input)
 │                                                     ├─ a flow is waiting at a SAY-GET → feed it the input, run steps
 │                                                     └─ no flow (or a DISPATCH) → intent detection → start a flow, or nothing
 │  session.response: string | '' | null
 │ ◄───────────────────────────────────────────────
 │  null  = "no flow handled this turn; you (the host) answer it"
```

Three facts explain most of the engine's behaviour:

1. **A turn ends at a SAY-GET, a RETURN, a plain DISPATCH, or when every flow has finished** (section 7). Every other step runs and
   the loop continues in the same turn.
2. **Text is queued, not sent.** SAY steps append to a session-wide queue. The queue becomes the reply when the turn ends at
   a SAY-GET (queued text first, then the question) or when the last flow completes. Some exits discard it (section 5).
3. **`null` hands the turn to the host.** When no flow handles the input, the engine returns `null` and the host answers.
   Nothing the flows queued can travel with a `null`: the host's answer is the whole reply.

---

## 2. Host API and session state

| Method | Purpose |
|---|---|
| `new WorkflowEngine(logger, aiCallback, flowsMenu, toolsRegistry, APPROVED_FUNCTIONS, globalVariables?, validateOnInit?, language?, aiTimeOut?, messageRegistry?, guidanceConfig?)` | Compiles declarations, applies `wraps`, compiles named functions, validates the set. Validation errors are logged; the engine still starts. |
| `initSession(userId, sessionId, language?)` | A fresh session: one empty stack, empty queue, empty `cargo`. |
| `updateActivity(entry, session)` | The per-turn entry point. Mutates and returns the same session. |
| `restatePendingQuestion(session)` | Re-renders the waiting SAY-GET (used after a language switch). Runs no steps. |
| `storedSession(session)` | A copy for persistence; `updateActivity` restores it. |

Session fields (`EngineSessionContext` in `index.ts`):

| Field | Kind | Meaning |
|---|---|---|
| `flowStacks` | persisted | Array of stacks of frames; the last stack is current. |
| `globalAccumulatedMessages` | persisted | The message queue (section 5). |
| `hasTentativeFlowInit` | persisted | Whether the queue's first entry is the "Processing …" placeholder (section 5.2). |
| `cargo` | persisted | The bag shared by every flow and the host. The only state that survives DISPATCH and reboot; all form state lives here. |
| `lastChatTurn` | persisted | The previous user/assistant exchange, given to intent detection and the reply ranker as conversation. |
| `response` | out | The turn's reply: text, `''`, or `null`. |
| `lastFlowOutcome`, `lastFlowRecovery` | out, one turn | The declared outcome and recovery stamp of flows that ended this turn (section 9). |
| `lastTurnToolCalls` | out, one turn | Every CALL-TOOL attempted this turn, recorded before the call is sent. |
| `lastTurnDispatch` | out, one turn | `{fromFlow, matchedFlow}` when a DISPATCH routed this turn's input. |

A host may also pass `entry.start = {flow}` to start a flow by name this turn; intent detection honours it first.

---

## 3. One turn: `processActivity`

The input is trimmed once (`sanitizedInput`); every routing decision below uses that string, never a flow variable a step
rewrote.

| Order | Stage | What happens |
|---|---|---|
| 1 | Install `dispatchIfMatched` | The closure a contextual DISPATCH calls this turn (section 8.2). Removed at the end of the turn. |
| 2 | Global exit | A flow is active and the whole answer is `*`, EXIT, QUIT or SALIR (`isGlobalExit`, `src/helpers/answer.js`), and the waiting question declares no choice for it: every flow ends, then the `global-exit` flow (or a tenant flow that `wraps` it) starts. |
| 3 | Keypad 9 | On a call, the whole answer `9`, a caller number that takes texts, a set with `switch-to-text`, and a question that neither asks for an amount nor declares 9: every flow ends and `switch-to-text` starts. |
| 4 | Active flow | Flow-control commands (`cancel`, `help`, `status`); then interruption, only when every frame on the stack is `interruptable`; then the input is fed to the waiting SAY-GET and `playFlowFrame` runs. If no DISPATCH routed the turn, its result is the reply. |
| 5 | No active flow, or a DISPATCH routed | Intent detection (`isFlowActivated`). A matched flow starts and runs this turn. Nothing matched: return `null`. |

The deterministic readers and the reply ranker are not stages here. They are ordinary steps in the shared worker flows
(section 12), which run after the SAY-GET has stored the answer.

---

## 4. Stacks, frames and the step loop

### 4.1 Frames

A frame is one running flow. `flowStepsStack` holds its remaining steps reversed, so the next step is the last element.
Other fields: `variables`, `contextStack` (the frame's conversation), `inputStack` (the turn's input, replaced each turn,
plus tool results), `transaction`, `declaredOutcome`, and the SAY-GET wait state `pendingVariable` and friends.

A new stack is created only by intent interruption. When the current stack empties and an older one exists, the engine
switches back to it, queues `flow_resumed_with_guidance`, and re-asks the older flow's waiting question in the same turn.

### 4.2 FLOW call types

| `callType` | Stack | Variables | Queue |
|---|---|---|---|
| `call` (default) | Pushes a frame. | Shared: the caller's object, by reference. `scope:'isolated'`: a fresh scope from engine globals, the flow's defaults and the passed parameters; nothing returns to the caller. | Untouched. |
| `replace` | Rewrites the top frame in place. With `toParent`, first removes the frames above the nearest waiting frame of the target. | As above for the new flow. | Untouched. |
| `reboot` | Empties every stack and pushes the target as the only frame. | Fresh. | **Kept**: queued text is delivered with the target's first output. `discardSay: true` drops it. |

Reboot fails the ended frames' transactions directly, so an outcome they declared is not stamped; authors pass `$outcome`
to the target when it matters.

### 4.3 The loop (`playFlowFrame`)

While the current stack has frames:

1. If the top frame waits at a SAY-GET and this turn brought input, store it in the waiting variable and pop the SAY-GET.
2. If the top frame has no steps left, it completes: pop it, finalize its transaction, and either hand its queued text to
   the parent and continue, resume an older stack, or return the queued text as the reply.
3. Otherwise run the top step (`playStep`).
4. End the turn after a SAY-GET, a RETURN, a plain DISPATCH, or a contextual DISPATCH that routed; otherwise continue.

| Step | Ends the turn | Behaviour |
|---|---|---|
| `SAY` | no | Renders `value` / `value_<lang>`, queues it. |
| `SAY-GET` | yes | Delivers the queue plus the question; waits (section 6). |
| `SET` | no | Evaluates `value` as an expression into `variable`. Errors throw. `requireTrue` throws unless the result is `true`. |
| `CASE` | no | Runs the first `condition:` branch that is true, else `default`. A condition that throws is skipped. The branch is one step. |
| `SWITCH` | no | Runs the branch whose key equals the value, else `default`. |
| `CALL-TOOL` | no | Records the attempt, calls the tool, stores the result. On failure: retries, then `onFail`. |
| `FLOW` | no | Section 4.2. |
| `END` | no | Clears the frame's steps, so it completes and the parent resumes: a function return. |
| `RETURN` | yes | Ends every flow on every stack and returns `value` to the host. Queued text is dropped unless `keepSay: true`. |
| `DISPATCH` | plain: yes | Section 8. |

### 4.4 Expressions and named functions

`SET` values, `CASE` conditions and `{{…}}` interpolations are JavaScript in strict mode, evaluated in the engine's
QuickJS sandbox (`src/helpers/expression-sandbox.js`; design: `docs/expression-sandbox-design.md`). Flow text is
untrusted: an expression reaches only what is in scope, never the host's globals (`process`, `fetch`, `require`) or its
`Function` constructor. In scope: the frame's variables, session variables (`cargo`, `language`, `$outcome`, the engine
globals and others), every `APPROVED_FUNCTIONS` entry by name, `fn` (named functions), and the sandbox's own standard
built-ins (no `Intl`; locale formatting and `structuredClone` are provided). Host objects are passed as live stand-ins:
reads and writes reach the host object itself, which is how worker flows write `cargo.inputCheck` and other cargo state;
only own properties cross. Host functions run on the host, with only their arguments and result crossing. Each
evaluation has a 500 ms deadline; the sandbox (one per process, shared by every engine) has a 256 MB cap, and its
globals and built-ins are frozen, so no evaluation leaves state for another.

A flow may carry a `functions` section: named functions compiled once per process, in the same sandbox
(`src/helpers/named-functions.js`), and called from expressions as `fn.<name>(…)`. They run inside the step that calls
them and see only their arguments and the approved functions, which they call by name from the evaluating engine's table.

An expression cannot run a step. SAY, SAY-GET, DISPATCH, FLOW and every other step type run only from the step loop.
A function called from an expression is not recorded as a tool call; a side effect a flow must account for belongs in a
CALL-TOOL step.

---

## 5. The message queue

### 5.1 Delivery and discard

The queue is `session.globalAccumulatedMessages`. SAY appends; completion of a frame with a parent hands the frame's text
on to the parent.

**Delivered** when:

| Path | Result |
|---|---|
| A SAY-GET runs | Queued text, then the question, is the reply. |
| The last flow completes | Queued text is the reply (`flow_completed_generic` when empty). |
| A stack resumes | Queued text plus `flow_resumed_with_guidance`. |
| `RETURN` with `keepSay: true` and a non-empty value | Queued text, then the value. |
| `reboot` without `discardSay` | Carried into the target flow and delivered with its output. |

**Discarded** when:

| Path | Why |
|---|---|
| Plain DISPATCH, and contextual DISPATCH that routes (`new_request`) | `terminateForDispatch` resets all flow state. When a flow matches, it starts as if started directly; when none matches, the reply is `null` and the host answers alone. |
| Contextual DISPATCH `abort` | Every flow ends; the reply is `cmd_request_aborted`. |
| RETURN without `keepSay` | The value is the whole reply. |
| Global exit, keypad 9, `cancel` | Every flow ends; the exit flow or the command answers. |
| `reboot` / `onFail` reboot with `discardSay: true` | Declared by the author. |
| A scheduled outage | The outage message is the reply. |
| A failing expression in a SET | Every flow ends; the error goes to the host. |

**Rule that follows: no SAY between the last SAY-GET and a DISPATCH.** Text queued before a DISPATCH never reaches the
caller. When it is a question, delivering it would also be wrong: the routed input starts a new answer immediately after
it. Anything a flow needs to say before leaving must be said by the flow that takes over, or by a step that ends the turn.

### 5.2 The "Processing …" placeholder

When intent detection starts a flow, the engine queues `flow_init` ("Processing {{flowPrompt}}") and sets
`hasTentativeFlowInit`. The first SAY-GET drops it. Completion drops it only when something else is queued, so a primary
flow that says nothing answers with the placeholder. DISPATCH discards it with the rest of the queue; that discard is
required, since the placeholder is engine text, not the flow's.

---

## 6. SAY-GET: asking and resuming

Asking (`handleSayGetStep`): the step stays on the stack. The engine renders the question, prefixes the queue, and records
the wait state: `pendingVariable`, `pendingVariableContext` (the whole rendered turn, used for voice cleanup),
`pendingVariableAsSpoken`, `pendingVariablePii`. A step `digits` is exposed to the host as `cargo.digits` (keypad
completion metadata for the voice relay).

Resuming: the next turn's input is stored by `setUserInputVariable`:

- Voice, `as_spoken`: kept as given.
- Voice, a one-key question: the key, when the whole answer is one of `0-9 * #`.
- Voice, a digit count within the question's `digits` range: the digits only.
- Voice, otherwise: a voice-cleanup model call.
- Every string is stored escaped (backslash, quotes, newline, carriage return, tab) inside a `{__userInput, value}`
  wrapper. Expressions see the unwrapped value, still escaped.

The SAY-GET is popped and the loop continues with the flow's next step, typically a reader in a worker flow.

---

## 7. How flows end: the four endings

Apart from a SAY-GET (which pauses a flow, it does not end it), a turn in which the flows end closes in exactly one of four
ways. Each decides what happens to the caller's last input and to the queued text.

| Ending | The caller's last input | Queued SAY text | `session.response` |
|---|---|---|---|
| **1. Completion**: the primary flow runs out of steps, or reaches `END` | consumed by the flow | delivered | the queued text |
| **2. `DISPATCH`** | handed on: intent detection reads it as if no flow had been active | discarded | the matched flow's reply, or `null` (the host answers the input) |
| **3. `RETURN` with a value** | consumed (swallowed): intent detection never reads it | discarded, unless `keepSay: true` | the value |
| **4. `RETURN ''`**: the fake flow | handed to the host; intent detection does not read it again | discarded | `''` (the host answers the input) |

**1. Completion.** `END` clears the frame's remaining steps, so it completes through the same path as running out of
steps (`handleEndStep`). In a called flow that path returns to the parent and the turn goes on; only when no frame is left
does the turn end. The reply is the queued text. When the flow said nothing this turn, the turn that started it answers
with the `flow_init` placeholder ("Processing {{flowPrompt}}", section 5.2); any other turn answers with
`flow_completed_generic`. A flow that ends by completion should say its result before it ends.

**2. DISPATCH.** The flows end and the input is routed again (section 8). The flows' queued text is discarded because
whoever answers next, a matched flow or the host, answers the input itself (section 8.3). A DISPATCH is valid only after a
SAY-GET: on a path that intent detection started with no SAY-GET in between, it would route the same input a second time.
jsfe refuses that (`processActivity` logs an error and returns `null`).

**3. RETURN with a value.** `handleReturnStep` evaluates `value`, finalizes every frame as `return` (a declared
`outcome` is stamped, section 9), and clears the stacks. The value is the whole reply (queued text first with
`keepSay: true`). It is the only ending that swallows the input and still gives the caller explicit feedback, for example
a closing line that depends on what the flow learned.

**4. `RETURN ''` (or no `value`): the fake flow.** The same step with an empty value leaves no frame and an empty
response. The host takes it as "no flow output" and answers the input itself, without intent detection running again. Its
purpose is the fake flow: a primary flow that deliberately does nothing, so that an input which resembles another flow's
trigger is matched here and goes to the host, instead of wrongly starting the similar flow. The fake flow is a primary
whose description claims the input, and whose only step is `RETURN ''`. A DISPATCH cannot replace it, because intent
detection just chose this flow (ending 2).

A frame stays on the stack at the end of a turn only at a SAY-GET, so an empty response with a frame left means a
SAY-GET with nothing to say. The engine resets the stacks and throws `JSFEActiveFlowEmptyResponse`.

Choosing: a finished task ends by **completion**; input that is not the flow's to handle leaves by **DISPATCH**, after a
SAY-GET; input the flow must not pass on, but must answer, ends with **RETURN** and a value; an input that must not start
a similar flow is claimed by a **fake flow** that ends with `RETURN ''`.

---

## 8. DISPATCH

DISPATCH means "this input is not the flow's to handle". It ends every flow and routes the turn's original input through
intent detection, as if no flow had been active.

### 8.1 Plain DISPATCH

`terminateForDispatch`: pop the step; record its `outcome` on the frame if declared; finalize every frame (a declared
outcome is stamped, a `pending` declaration yields, others fail); reset all flow state (stacks, queue, placeholder flag);
remember `pendingDispatchFrom`. `processActivity` then runs intent detection:

| Situation | Result |
|---|---|
| A flow matches | It starts this turn. `lastTurnDispatch = {fromFlow, matchedFlow}`. The ended flows' outcome is cleared: the caller is being served. |
| Nothing matches | `null`: the host answers. The ended flows' outcome stands. |
| The reply ranker already decided this turn (any verdict but `new_request`) | No detection; `null`. |
| A flow started this turn reaches DISPATCH before any SAY-GET | Logged as an error; `null`. One routing per turn. |

### 8.2 Contextual DISPATCH (`onResponse: 'continue'`)

**The problem it solves.** A flow asks a question and the reply is not something its reader can parse. A plain DISPATCH
would assume the caller changed the subject and end the flow. Often they did not: they answered in words the reader does
not handle, asked for one of the options the question implies, or said something that was not meant for us. A contextual
DISPATCH asks the reply ranker (one model call) what the reply does **with this question**, and ends the flow only when
the answer is "it starts something else".

**Example.** The verification-code question is "Please say the 6-digit code I sent you." The flow first tries to read a
code. When there is none, it reaches this step:

```json
{ "type": "DISPATCH", "onResponse": "continue",
  "responseContext": "Please say the 6-digit verification code I sent you.",
  "responseChoices": "otp_offers", "responseVariable": "otp_reply", "onNoIntent": "stay" }
```

`otp_offers` lists what the caller may ask for at that point, such as `resend` or `email` ("send it to my email").
The ranker reads the reply against the question and the choices, and returns one verdict:

| Caller says | Verdict | What happens |
|---|---|---|
| "Send it to my email instead" | the choice `email` | `otp_reply = {key: 'email'}`; the flow goes on to its next step, which acts on the key. |
| "Uh, the one ending in seven?" (a try at answering) | `answers` | `otp_reply = {key: ''}`; the flow goes on and handles it as an unreadable answer (typically asks again). |
| "Hold on, I'm talking to my son" | `irrelevant` | `otp_reply = {key: ''}`; the flow goes on and asks the question again. Nothing ends. |
| "I'm worried this is a scam" | `concern` (offered only when the step declares `responseConcern` or `responseConcernForm`; this one does not) | `otp_reply = {concern: true, concern_text}`; the flow goes on and addresses it. |
| "Never mind, forget it" | `abort` | Every flow ends as withdrawn (`user_aborted`); the reply is the engine's `cmd_request_aborted` line. |
| "What's my balance?" | `new_request` | The flows end and the reply goes to intent detection: a plain DISPATCH (8.1). |

In every row but the last two the flow **stays**: the step is consumed, the verdict is written to `responseVariable`, and
the flow's next steps decide what to do with it. That is the "continue" in `onResponse: 'continue'`.

**Changing what `new_request` does.** By default `new_request` ends the flows and sends the reply to intent detection
(the last row above). A step can change that in three ways:

1. **Never leave this question: `responseStay`.** Its value names a variable. When that variable is true, a new request
   cannot take the caller away: it counts as one more reply that picked nothing, and the question is asked again. "Never
   mind" (`abort`) still ends the flows. The form workers set it for a form declared `must_complete`. Example: such a form
   asks for the card number, and the caller says "what's your store address?"; the caller is asked for the card again.
2. **Leave only if another flow takes it: `onNoIntent: 'stay'`.** Intent detection runs at once, inside the step. In the
   code example: "what's my balance?" starts the balance flow, so the code flow ends as with a plain DISPATCH. "I don't
   see any text" starts no flow, so instead of handing the turn to the host (which would drop the code question), the
   flow stays with `otp_reply = {key: ''}` and asks again.
3. **A choice that leaves: `route: 'new_request'` on a choice.** The choice is listed so the ranker can recognise it,
   but picking it leaves like a new request. Example: while a caller is being verified, tasks that need no verification
   are offered as choices marked this way; picking one ends the verification, and intent detection starts that task.

**Other step attributes.** `responseParameters` asks the ranker to extract values (an `answers` verdict then carries
them, and a confident answer also keeps the whole reply as `verbatim`); `responseReasonFor` labels the reply as a
reason for something; `responseConcern` (or `responseConcernForm`, a form whose description is used) tells the ranker what the process does, so it can recognise a concern about it.

**Mechanics.** `dispatchIfMatched` builds the ranker request from the step, `rankReply` makes the call, and the verdict
table above is applied there. Before routing a `new_request`, the step's `recovery` is stamped. A model failure throws;
the step stays on the stack and the host's error policy decides.

### 8.3 Why queued text cannot survive a DISPATCH

When nothing matches, the engine's only answer is `null`, and the host's reply replaces the turn. The engine could keep
the queue when a flow matches (as reboot does), but it deliberately does not: a flow started from a DISPATCH replies
exactly as if it had been started directly (`tests/dispatch.test.mjs`). Either way, the design rule of section 5.1 holds.

---

## 9. Outcomes and recovery

Any step may declare `outcome` and `reason`; the frame keeps the latest. When flows end, `finalizeFlowTransaction` turns
it into the transaction state (`unresolved` and `user_aborted` fail, `pending` yields, others complete) and stamps
`lastFlowOutcome` (last stamp wins). `$outcome` in an expression is the nearest declaration on the stack.

| Path | Stamps a declared outcome |
|---|---|
| Completion, END | yes |
| RETURN, global exit, abort, keypad 9 | yes, every frame |
| DISPATCH | frames that declared one |
| reboot, replace, interruption, `cancel`, outage | no |

A step's `recovery` attribute is stamped into `lastFlowRecovery` before the step runs (for a contextual DISPATCH, only when
it routes). The host uses it to offer to resume a form later.

---

## 10. Load-time validation

`validateAllFlows` checks primaries and every worker reachable from them through a literal FLOW target; a worker reached
only through a `{{…}}` target is not checked. Errors are logged and the engine starts anyway. Main rules: every step has an
`id` and a known type; SAY and SAY-GET need `value`, SAY-GET needs `variable`; CASE takes only `condition:` and `default`;
FLOW needs `value` and a known `callType`; DISPATCH takes only its declared keys, `onResponse` only `continue`, and
`responseContext` / `onNoIntent` only with `continue`; flow traps (`stack_growth`, `spin`) are errors.

The form layer adds its own checks at definition time (`validateFlowContracts` in `src/forms/contracts.js`, `formFlow`,
`resolveFormInputs`): referenced workers exist, dependencies name real fields and do not cycle, FLOW and CALL-TOOL
parameters are paths, CALL-TOOL has `onFail`, and a SAY-GET appears only in a flow whose contract role is `collector`.

---

## 11. The form engine: declaring a form

A form is a flow declared with a `form` section instead of `steps` (`src/forms/declarations.js`), or built with
`defineForm` / `definePerformer` (`src/forms/contracts.js`). Every form compiles through `formFlow` (`flows.js`) into a
shell flow that drives shared worker flows. The workers live in jsfe (`flows.js`, `choice-flow.js`, `identity-flows.js`)
and are written into each deployment's system flow set; `give-up`, `live-agent-requested` and `contact-support` are
written in the system set by hand.

### 11.1 The shell, in step order

1. Open the instance (`openFormInstance`): `cargo.forms[<definition>:<n>]`. A top-level form resumes its task.
2. On a fresh activation, reset `attempts`, `misses` and `feedback`.
3. Remember or restore the authored parameters; run `before`.
4. Turn activation parameters into readings and accept them (`collect-input-accept`).
5. `run-form` collects the inputs (section 12).
6. Unless the form completed: END.
7. Form-level `validator` (section 15.2); `before_confirm`; confirmation (`confirm-form`); `after`; `form-done`.

### 11.2 Input keys that shape the conversation

The full list is in `resolveFormInputs` (`form-state.js`); these matter most when changing the engine:

| Key | Effect |
|---|---|
| `field` | Merges a preset from `FIELD_PRESETS` (`flows.js`) under the input's own keys: phone, email, zip, amounts, card fields and others. |
| `profile` | The reader: `kind` phone, email, digits, identifier, amount, text, pattern, choice and others (`match-inputs.js`). |
| `question`, `retry` (and `_es`, `_text`, `question_from`) | What is asked, and what replaces it on a re-ask (section 14). |
| `validator` | Section 15.1. |
| `prepare`, `refresh`, `after` | Hooks: before the first ask, before every ask, after a value is accepted. |
| `max_attempts` (default 3), `max_misses` (default 4), `must_complete` | Section 13. |
| `on_exhausted`, `on_no` | Recovery workers for exhausted attempts and for a NO the question cannot read. |
| `response` | An open answer gated by the reply ranker (`read-form-response`). |
| `digits`, `amount`, `as_spoken`, `pii` | Passed to `ask-choice` and the voice layer. |
| `depends_on`, `reset_on`, `when`, `required_when`, `any_of` | Which input is asked next, and what an answer invalidates. |

A question containing `{{…}}` is compiled into a generated `prepare` worker (`src/forms/prompt-compiler.js`), so it is
rendered once, when `prepare` runs. Use `refresh` for text that must change between asks.

### 11.3 State: `cargo.forms[instance]`

| Field | Holds |
|---|---|
| `specs` | The resolved inputs. |
| `values`, `accepted`, `errors` | Accepted values; their revision and origin; inputs to ask again (a rejected value, or a form validator's verdict). |
| `attempts[input]` | Rejected answers (section 13). |
| `misses[input]` | Unreadable answers (section 13). |
| `feedback[input]` | What the next prompt must say about the last answer (section 14). |
| `data` | Values computed for prompts and choices by `prepare` / `refresh` / `before`. |
| `parent`, `children`, `result_input` | Sub-form links; a finished sub-form hands its values to the parent's `result_input`. |
| `replays` | Passes of `run-form` without a caller answer; bounds runaway loops. |
| `pending`, `seeds`, `prepared`, `confirmation`, `revision` | Readings waiting on prerequisites, activation seeds, prepare markers, the confirmed revision. |

Workers are `scope: 'isolated'`, so nothing but `cargo` connects them; `run-form` alone is shared with its form shell.

---

## 12. One turn through the workers

```
form shell ─► run-form (shared with the shell)
  rf_pass_count     replays++ ; rf_runaway: too many passes without an answer → incomplete DISPATCH
  rf_pending_accept readings whose prerequisites are now ready → collect-input-accept
  rf_find           nextFormInput → the next input; '__blocked__' → incomplete DISPATCH; none → complete, END
  rf_collect        a sub-form, or collect-input
collect-input
  ci_context_yield  misses ≥ max_misses and not must_complete → DISPATCH            (section 13)
  ci_give_up …      attempts ≥ max_attempts → on_exhausted reboot / incomplete DISPATCH / give-up
  ci_prepare, ci_refresh
  ci_question       formInputPrompt: the question, shaped by feedback                (section 14)
  ci_feedback_consumed
  ci_ask ─► ask-choice: SAY-GET (the turn ends here)
  ── next turn ──
  ask-choice        answer_precheck, choices, answer_validator → cargo.choice / cargo.choiceText
  ci_match          readFormAnswer: split the answer, match it against this form and its ancestors
  ci_route          ambiguous → disambiguate-input
                    readings  → collect-input-accept
                    a question about the form's data → provide-data
                    words, no reading → read-form-choice (the reply ranker, a contextual DISPATCH)
                    no words → a miss
collect-input-accept
  validate-input-batch   one reading per pass: prepare, read-form-response, the input's validator
  acceptFormReadings     commit accepted readings (and invalidate dependants)
  input-accepted-effects one reading per pass: count a rejection and keep its line (keepFormLine), or SAY the acknowledgement (ie_ack)
run-form replays (rf_replay) in the same turn until a SAY-GET or an exit
```

Readings: `readFormAnswer` (`match-inputs.js`) splits the answer, takes out questions about the form, and matches the rest
against every input of the asking form and its ancestors, so one answer can fill several fields, in any order.

The reply ranker is reached through four workers, each a contextual DISPATCH: `read-form-choice` (a choice input, or
words no reader understood), `read-confirm-reply` (the confirmation), `read-form-response` (an open answer),
`read-provider-reply` (a provider menu). `new_request` and `abort` leave the form (section 8.2).

---

## 13. Counters and exits

| | `attempts` | `misses` |
|---|---|---|
| Counts | A value rejected by a validator or reader (including a `quiet` rejection), except a number read out of order, which a rejection ignores: no attempt, no line (`settleFormActivations`); an out-of-order hint; a ranker reply that picked nothing (not `must_complete`). | An answer with no words that nothing read; a ranker reply that picked nothing under `must_complete`; no pick at a disambiguation; an unclear confirmation. |
| Limit | `max_attempts`, default 3 | `max_misses`, default 4 |
| Cleared | A fresh activation; exhaustion. Not by a later good answer. | Any answer that was understood; a fresh activation. |
| Under `must_complete` | Still counts and exhausts. | Never yields. |

Both limits are checked at the top of the next `collect-input`, which `run-form` reaches in the same turn, so the exit
happens on the turn that reached the limit, with that turn's input.

| Exit | When | Caller hears | Text queued this turn |
|---|---|---|---|
| Misses yield (`ci_context_yield`) | misses reach the limit | Whatever intent detection or the host answers for this input | discarded (DISPATCH) |
| `on_exhausted` recovery | attempts reach the limit and a recovery worker is declared | The worker's output | kept (reboot) |
| Optional incomplete | attempts reach the limit and a chain form declares `incomplete_outcome` | Intent detection or the host | discarded (DISPATCH) |
| Give-up | attempts reach the limit, otherwise | "Sorry, I wasn't able to help with {context}." then a live agent | kept (reboot) |
| `rf_runaway`, `rf_blocked` | too many passes; inputs that can never be ready | Intent detection or the host | discarded (DISPATCH) |
| Disambiguation yields | no pick with three or more words; two misses (not `must_complete`) | Intent detection or the host | discarded (DISPATCH) |
| Confirmation exhausted | four unclear replies (not `must_complete`) | Optional incomplete, else give-up | as above |
| Ranker `new_request` / `abort` | Section 8.2 | Intent detection / `cmd_request_aborted` | discarded |
| Agent, EXIT, keypad 9, an offer | `ask-choice` keys, global keys | The target flow | kept (reboot) |

The text queued this turn is an acknowledgement (`ie_ack`) or an out-of-order hint. A rejection line is never queued
(section 14.1), so no exit says it.

---

## 14. Prompts, feedback and lines said at once

### 14.1 How the next question is built

`formInputPrompt` (`form-conversation.js`) builds every form question from the input's declarations and
`feedback[input]`, which records what happened to the last answer. `consumeFormFeedback` clears it as soon as the prompt is
built.

| `feedback` | Set when | The next question |
|---|---|---|
| (none) | | `question` |
| `miss` | An unreadable answer | `retry` if declared, else "Sorry, I didn't catch that. " + `question` |
| `first` | A ranker reply under `must_complete` that picked nothing | The form's first-task line + (`retry` or `question`) |
| `concern` | The caller questions what the process does | The form's description and how to cancel + `question` |
| `partial` | Digits still accumulating | "Go on." |
| `invalid` | A rejected value | `retry` if declared, else `question` |

This is the right place for anything that must be said about the last answer: it reaches the caller as part of the
question, and it disappears with the question when the form leaves instead.

**Validator lines.** An input validator's rejection message (or "That {label} doesn't look right." / "No pude usar eso como {label}.") and a form validator's
`message` are not SAYs. `keepFormLine` keeps them on the form (`cargo.forms[instance].lines`), and the next question asked
by any form of the same task (the form, its parent or a sub-form) says them first, each followed by a blank line, then the
question as the table above builds it. `consumeFormFeedback` drops them once said. They live for one turn: at the start of
every user turn the engine drops any that are left (`clearFormLines` in `updateActivity`). So a form that gives up, yields,
exhausts or leaves by DISPATCH never says them, before its exit or later.

### 14.2 Lines said at once, as their own SAY

| Line | Where |
|---|---|
| Acknowledgement of an accepted reading | `ie_ack` in `input-accepted-effects` |
| The out-of-order number hint (`confirm_out_of_order`) | `ci_clarify_line`, `cf_clarify_line` |
| Request cancelled | `cancel_request_notice` |
| Provider answers and menus | the provider workers |

These lines are queued, so they reach the caller only when a SAY-GET, a reboot or the last flow's completion follows in the same turn (section 5.1).

### 14.3 Acknowledgements

`input-accepted-effects` builds one line per accepted reading: "Got it, your {label}." for an input filled out of order
or from a queue, "Okay, I noted your {label}." for a changed value, "Thank you, I already have your {label}." for a value
already held. The answer to the question just asked gets no line. `silent` inputs get none, and a form declaring
`acknowledge: 'data'` acknowledges only caller-supplied data (digits, email, phone, amount, identifier, account, text).

---

## 15. Validator contracts

### 15.1 Input validator (an input's `validator`)

Called by `validate-input-batch` (`vb_validate`) for a reading that is ready, not already known, and not already invalid,
with parameters `{form, input, value, values, reading}`: `values` are the committed values plus earlier readings of the
same answer; `reading` is the whole reading.

The validator answers by writing `cargo.inputCheck`:

| Key | Effect |
|---|---|
| `ok` | Only `true` accepts. A validator that writes nothing rejects. |
| `value` | Replaces the reading's value (normalization: card digits, MMYY). |
| `message`, `message_es` | The rejection line, said with the form's next question (14.1). Also stored in `errors[input]`. |
| `quiet` | Say nothing; the rejection still counts an attempt. |
| `proposal` | A proposal descriptor (`src/helpers/form-proposals.js`). |

A rejection then counts an attempt, sets `feedback = 'invalid'`, and keeps the message (or "That {label} doesn't look
right.") for the form's next question this turn (14.1). If the form asks nothing more this turn, the message is never said.

A validator is a flow, so nothing stops it from running steps of its own. Some validators DISPATCH or start other flows
(a sign-in, a different flow by reboot); those exits take the routing decision away from the form.

### 15.2 Form validator (the form's `validator`)

Runs once every input is collected, with `{form, values}`, and writes `cargo.formCheck`:

- `{ok: true}`: valid.
- `{ok: false, invalid: [{name, message?}], message?}` naming inputs of this form: those inputs are asked again; the
  form-level `message` is kept (`<form>_validation_keep`) and said with the first re-asked question; a fourth invalid verdict
  exhausts the form (the declared `on_exhausted`, else an optional incomplete outcome, else give-up), and the message is
  not said.
- Anything else fails immediately (give-up or the declared recovery).

Per-input `invalid[].message` is shown only on a web form card, never spoken.

### 15.3 `answer_precheck` and `answer_validator` (inside `ask-choice`)

Flow calls with `{answer}` only. They answer by setting `answer_key` in `ask-choice`'s variables, so they must be
shared-scope. The precheck runs before the choices and its key is the answer's key; the validator runs only when no
choice matched, and its key becomes `cargo.choice`.

### 15.4 Hooks

| Hook | Runs | Parameters |
|---|---|---|
| `prepare` | Once per input, before its first ask and before validating a ready reading | `{form, input}` |
| `refresh` | Before every ask | `{form, input}` |
| `after` | Per accepted reading that changed a value | `{form, input, value}` |
| `on_exhausted` | Attempts reached the limit (reboot) | `{form, failed_form, input, failed_input, reason}` |
| `on_no` | A NO the question cannot read (call) | `{form}` |

---

## 16. Rules for contributors

- **The turn ends where the caller can answer.** A SAY-GET, a RETURN, a DISPATCH, or completion. Anything said must be
  in front of one of those that delivers it (section 5.1).
- **No SAY between the last SAY-GET and a DISPATCH.** It is discarded, and a question there would be followed by an
  unrelated answer.
- **Say things about the last answer through `feedback`,** so they reach the caller inside the re-ask and vanish with it.
- **All state that must survive a DISPATCH or reboot lives in `cargo`.** Frames and their variables do not.
- **A DISPATCH routes the turn's original input,** never a variable a step rewrote.
- **One routing per turn.** A flow started by this turn's input never dispatches it again.
- **A side effect is a CALL-TOOL,** so the host sees it in `lastTurnToolCalls`.
- **Change behaviour behind an attribute, not by flipping a default,** unless the owner decides the default itself.
