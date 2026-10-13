# System Flows Library

This document details the standard system flows in `flows/system.flows.json` and the tools they call in `flows/system.tools.json`. These flows handle common utility tasks such as authentication, error recovery, live-agent requests and channel switching.

Everything below is read from the JSON. Where a flow's `description` text and its steps disagree, the steps are what runs, and the difference is called out.

## Table of Contents
- [Conventions Used by These Flows](#conventions-used-by-these-flows)
- [Flows](#flows)
  - [NoActionNeeded](#noactionneeded)
  - [CancelProcess](#cancelprocess)
  - [ContactSupport](#contactsupport)
  - [SwitchToText](#switchtotext)
  - [AuthenticateUser](#authenticateuser)
  - [GetCellOrEmail](#getcelloremail)
  - [GetAndValidateOtpCode](#getandvalidateotpcode)
  - [ValidateOtpCode](#validateotpcode)
  - [ResendOtpCode](#resendotpcode)
  - [GenericRetryWithOptions](#genericretrywithoptions)
  - [OtpSendFailed](#otpsendfailed)
  - [TextDestination](#textdestination)
  - [SendText](#sendtext)
  - [SendOtpCode](#sendotpcode)
  - [OtpTextUndeliverable](#otptextundeliverable)
  - [LiveAgentRequested](#liveagentrequested)
- [Tools](#tools)
  - [send-sms-otp](#send-sms-otp)
  - [send-email-otp](#send-email-otp)
  - [send-whatsapp-invite](#send-whatsapp-invite)
  - [validate-otp](#validate-otp)
  - [set-user-name](#set-user-name)
  - [switch-to-sms](#switch-to-sms)
  - [send-twilio-sms](#send-twilio-sms)
  - [get-live-connect-link](#get-live-connect-link)

---

## Conventions Used by These Flows

**Primary vs. sub-flow.** Two system flows are `primary: true`, so intent detection can start them: `switch-to-text` and `live-agent-requested`. The others omit `primary` and are reached from a `FLOW` step or an `onFail`. Both primary flows are also reached that way (the retry menu reboots into `switch-to-text`, and every "agent" answer reboots into `live-agent-requested`).

**Call types** (as used here):
- `call`: run the sub-flow, then resume the caller. The sub-flow works on the caller's variables (the same object), so what it sets (`cell_number`, `email`, `contact_valid`, `auth_result`…) is visible to the caller. Any `value` the sub-flow's `variables` block declares is written into that shared object when it starts.
- `replace`: the current frame becomes the target. Its remaining steps are dropped, and its variables are kept with the FLOW step's `parameters` merged in. The target's declared variable defaults are **not** applied.
- `reboot`: clear every active flow and start the target as the only flow, with fresh variables (the global variables, the target's declared defaults, then the `parameters`). SAY output accumulated before the reboot is kept and delivered with the target's output.

**Ending a flow.**
- `RETURN` terminates **all** flows and makes its value the response. `RETURN ''` (used by `no-action-needed`) produces an empty response, so the host handles the user's message itself.
- `END` returns from the current flow only, resuming its caller.
- `DISPATCH` terminates **all** flows (queued SAYs included) and routes the turn's input through intent detection; with no match the response is empty and the host answers. The ended flows' declared outcome is kept only on a no-match. Used by `get-cell-or-email` for an off-topic answer and by `generic-retry-with-options` for an unrecognised one.
- A terminal step may declare `outcome` / `reason` (both may be `{{…}}` templates; an outcome that interpolates to empty declares nothing). The engine reports a declared outcome once in `sessionContext.lastFlowOutcome`, and `unresolved` also fails that flow's transaction. The system flows declare:

| Flow | Step | `outcome` / `reason` |
|---|---|---|
| contact-support | `say_support_message` (SAY) | `support_outcome` or `unresolved` / `support_reason` or `contact_support_fallback` |
| get-cell-or-email | `off_topic_handoff` (DISPATCH) | `unresolved` / `auth_prompt_off_topic` (kept only when no flow matches) |
| generic-retry-with-options | `dispatch_unrecognised` (DISPATCH) | `caller_outcome` / `caller_reason` (empty = none) |
| live-agent-requested | `say_live_connect` (RETURN) | `resolved` / `live_connect_link` |
| live-agent-requested | `say_cannot_connect` (RETURN) | `resolved` / `no_agent_reachable` |
| live-agent-requested | `no_agent_available`, `no_agents_available` (RETURN) | `unresolved` / `agent_unavailable` |

**`onFail` on a CALL-TOOL.** A `FLOW` `onFail` runs with its `callType` (default `replace`): `replace` / `reboot` leave the failed flow, `call` runs the handler and then resumes the failed flow at its next step. A non-FLOW `onFail` (SAY / SET / RETURN) runs **immediately** after the failed tool step; a SAY or SET then lets the flow continue with its remaining steps, a RETURN ends it. Before the onFail runs, the CALL-TOOL `variable` holds the error text (a truthy string with no `.success`), so a SET `onFail` that writes a `{ success: false }`-style value is the safest pattern, and a SAY `onFail` is followed by the flow's remaining steps, which may contradict it. This behaviour needs jsfe 0.9.89 or later.

**Cargo the flows read or write** (`sessionContext.cargo`, set by the host unless noted):

| Field | Used by | Meaning |
|---|---|---|
| `cargo.voice` | most flows | truthy on a voice call. Adds keypad wording ("press 1", "the asterisk key") to prompts, and turns on the engine's AI voice-input cleanup for SAY-GET answers |
| `cargo.verb` / `cargo.verb_es` | most prompts | the verb inserted into prompts ("Please {{cargo.verb}} …") |
| `cargo.callerId` | get-cell-or-email, switch-to-text, generic-retry-with-options, text-destination | the caller's number, offered as the contact. Without it `switch-to-text` cannot text, and the retry menu does not offer TEXT |
| `cargo.twilioNumber` | send-otp-code, switch-to-text, validate-otp-code, text-destination, send-text | the `from` number for SMS. text-destination sets no destination without it |
| `cargo.agentPhoneNumber` | live-agent-requested | a transfer number for this turn; absent when no agent can take a transfer now |
| `cargo.agentHours` / `cargo.agentHours_es` | live-agent-requested | the agent hours of the phone number's schedule, as a sentence (in or out of hours). Empty when the number has no agent schedule; absent on every non-phone channel |
| `cargo.agentUnavailableMessage` | live-agent-requested | the phone number's own "no agent available" wording (a voice setting); empty = the flow's default |
| `cargo.contact_info` | contact-support, live-agent-requested | the support contact text (one value for both languages) |
| `cargo.support_context` / `_es` | contact-support | topic phrase, e.g. set to `orders` / `pedidos` by `shopify-track-order`, or written by contact-support from its `support_context` / `support_context_es` parameters |
| `cargo.sessionResolved` | contact-support | truthy when something was resolved earlier in the session; contact-support then thanks instead of apologizing. The reference host sets it when a flow declares outcome `resolved` |
| `cargo.otpVerified` | authenticate-user, validate-otp-code, generic-retry-with-options | written by the `validate-otp` tool on success |
| `cargo.authOptions` | written by authenticate-user; read by authenticate-user when `retrying` | `{ retry_flow, cancel_flow, email_validator, cell_validator }` of the authentication in progress, written at its start. A retry from the menu (`retrying: true`) restores all four from it |
| `cargo.authCancelFlow` | written by authenticate-user; read by validate-otp-code, otp-text-undeliverable and the code-failure menus (`cancel_flow` of the [authentication retry parameters](#genericretrywithoptions)) | the authentication's `cancel_flow` (default `contact-support`), so EXIT goes to the same flow at every step. Readers fall back to `contact-support` when it is empty |
| `cargo.otp_cell_number` / `cargo.otp_email` | written by authenticate-user; read by send-otp-code, get-and-validate-otp-code, validate-otp-code, text-destination | where the OTP is sent |
| `cargo.otpSendFailure` | written by send-otp-code; read by authenticate-user, resend-otp-code, otp-send-failed | why the last send did not go out: `''` (sent), `undeliverable` (the line cannot receive texts), `sms`, `email` (that send failed) or `none` (no destination). Cleared at the start of every send |
| `cargo.otpSentOn` | get-and-validate-otp-code | how the code went out (`sms`, `email`, `whatsapp`), written by the host's send functions. `whatsapp` = the code was sent in this WhatsApp chat |
| `cargo.otpFailure` | validate-otp-code | why `validate-otp` refused a code: `missing`, `expired` or `mismatch`. Written by the host's `validate-otp`; cleared by a successful check and by every new send |
| `cargo.otpMismatches` | authenticate-user (reset to 0), validate-otp-code (counts, caps at 3) | wrong codes in this authentication |
| `cargo.otpResends` | authenticate-user (reset to 0), resend-otp-code (counts, caps at 2) | fresh codes sent in this authentication |
| `cargo.otpHash` | validate-otp-code | the pending code's hash (written by the send tools). validate-otp-code sets it to `null` at the wrong-code cap, which withdraws the code |
| `cargo.otpUndeliverableTo` | send-otp-code, otp-text-undeliverable, text-destination | the last 10 digits of a number that cannot receive texts (landline, toll-free, invalid). Written by the host's `send-sms-otp` when the destination refuses the text, and cleared by its next send |
| `cargo.textTo` / `cargo.textTo4` | written by text-destination; read by send-text and its callers | where a text to the customer can go: 10 digits, `''` when none; and its last four, comma-spaced on voice |
| `cargo.textSent` | written by send-text; read by its callers | true when `send-twilio-sms` returned a status for the text; false when there was no destination or the send failed |

**Global variables** (tenant-level, optional): `global_whatsapp_invite` / `global_whatsapp_invite_es` (validate-otp-code; empty or absent = the WhatsApp invite is off), `global_live_agents_comment` / `global_live_agents_comment_es` (live-agent-requested: on non-phone channels, and on the phone when the number's schedule gives no hours).

**Host functions called in expressions.** The flows call `isAnswer`, `isAgentRequest`, `matchesChoice`, `validatePhone`, `validateEmail`, `normalizeAndFindCapture` and `textWithUrlToSpeech` inside conditions and SET values. The engine does not provide them: the host must register them in `APPROVED_FUNCTIONS`. `demos/make-payment.js` has reference implementations of `matchesChoice` (exact word / word-sequence membership, not substring matching), `validatePhone`, `validateEmail` and `textWithUrlToSpeech`.

`normalizeAndFindCapture(answer, patterns)` is the retry menu's smart capture (in the reference host, hy-rag-lambdas, `foundation/text/capture.js`). `patterns` is `[{ variable, regex, normalizer? }]`. For each pattern in order, the `normalizer` regex (global) is removed from the answer first, then `regex` is run on the result; the first pattern that matches returns `{ variable, value }`, where `value` is **the matched part only**, trimmed ("my email is a@b.com" captures `a@b.com`). No match, or `patterns` not an array, returns `null`. A pattern whose regex is invalid is skipped with a warning. The copy in `demos/make-payment.js` returns the whole normalized answer instead of the matched part.

**Answer vocabulary.** The YES / NO / AGENT / EXIT / TEXT words are not in the flows. They live in the host's answer module (in the reference host, hy-rag-lambdas, `foundation/text/answer.js`), one list per kind shared by every flow set. Words match whole words or word runs, never substrings.
- `isAnswer(input, kind, extra?)` returns whether the answer is a `kind` answer, `kind` being one of `yes`, `no`, `agent`, `exit`, `text`, with the caller's `extra` words added to that kind's list. `0` is AGENT and `*` is EXIT. A negated answer ("not sure", "I don't want an agent") never matches YES, AGENT or TEXT.
- `isAgentRequest(input)` returns whether the whole answer asks for a person ("agent", "I want to talk to a representative", "hablar con una persona") or is `0`. A negated answer never does. Used at free-text prompts, where an AGENT word inside a longer answer is not a request.
- `pickChoice(answer, choices, acceptOther)` is the ask-choice matcher of the ai-ar flow set: it returns the key of the choice the answer picks, `__agent`, `__exit`, or `''` for no choice.

**`digits`** on a SAY-GET (`{ min, max, autoSubmitChars?, autoSubmitMs? }`) is copied by the engine to `cargo.digits` while the answer is awaited, for the host's keypad handling (e.g. Twilio ConversationRelay). The engine removes it once the input is collected.

---

## Flows

## NoActionNeeded
**ID**: `no-action-needed` · **Version**: 1.0.0 · **Sub-flow**  
**Description**: Handle case where no action is needed like when user is already authenticated.

A single `RETURN ''`. Returning an empty string terminates all flows and leaves the response empty, so the host answers the user's original message itself (usually with its conversational AI). Other flows use it as a clean hand-off, for example `shopify-product-search` when a search fails or returns nothing, and `shopify-store-policies` when the tenant has not opted in. Callers invoke it with `callType: "reboot"`. (The "already verified" and "already in text mode" branches of the system flows use `END` instead.)

### Flowchart
```mermaid
graph TD
    start((Start)) --> no_action_needed["RETURN: ''"]
    no_action_needed --> stop((End: host answers))
```

---

## CancelProcess
**ID**: `cancel-process` · **Version**: 1.0.0 · **Sub-flow**  
**Description**: Handle flow cancellation by user.

A single `RETURN` of a localized message: "The process has been cancelled. Anything else I can help with?" (Spanish when `language == 'es'`). Terminates all flows. Used with `callType: "reboot"`, e.g. by `get-search-query` on EXIT.

### Flowchart
```mermaid
graph TD
    start((Start)) --> process_cancel_flow[RETURN: cancellation message]
    process_cancel_flow --> stop((End: all flows))
```

---

## ContactSupport
**ID**: `contact-support` · **Version**: 1.2.0 · **Sub-flow**  
**Description**: Provide customer service contact information. Optional `support_context` / `support_context_es` name what the caller needed help with (else `cargo.support_context`); optional `closing_prompt` / `closing_prompt_es` are spoken after the contact info.

### Parameters
*   `support_context` (string): What the caller needed help with (English), e.g. `payment`.
*   `support_context_es` (string): The same in Spanish, e.g. `pago`.
*   `closing_prompt` (string): Optional English sentence spoken after the contact info, e.g. a follow-up question.
*   `closing_prompt_es` (string): Optional Spanish sentence spoken after the contact info.

The SAY also reads `support_outcome` / `support_reason` when a caller passes them. They are not declared parameters, and no flow in this library passes them.

### Steps
1. `take_context_parameters` (SET, side effect) - when `support_context` is passed: `cargo.support_context = support_context` and `cargo.support_context_es = support_context_es || support_context`. Otherwise the cargo is left as it is.
2. `set_contact_info` / `set_contact_info_es` - `contact_info` = `cargo.contact_info`, or "please contact Customer Support" / "por favor contacte a Servicio al Cliente" when unset. On voice (`cargo.voice`) it is passed through `textWithUrlToSpeech(…, language)` so URLs are spoken.
3. `set_support_message` / `set_support_message_es` (SET) - "{opening}[For assistance with your {cargo.support_context}, ]{contact_info}.[ {closing_prompt}]". The opening is "Thank you for contacting us! " when `cargo.sessionResolved`, else "Sorry I couldn't help! ". The Spanish text ("¡Gracias por comunicarte con nosotros! " / "¡Lo siento, no pude ayudar! ", "Para asistencia con tu …") uses `cargo.support_context_es`, falling back to `support_context`.
4. `say_support_message` (SAY) - `{{support_message}}` / `{{support_message_es}}`.

### Ends
By completion. The SAY declares **`outcome`: `support_outcome` or `"unresolved"`, `reason`: `support_reason` or `"contact_support_fallback"`**. With no `support_outcome` passed (every path in this library), ContactSupport fails the transaction and sets `sessionContext.lastFlowOutcome`. Every caller in the library uses `callType: "reboot"`.

### Flowchart
```mermaid
graph TD
    start((Start)) --> take_context[SET: cargo.support_context from parameters]
    take_context --> set_contact_info[SET: contact_info / contact_info_es]
    set_contact_info --> set_support_message["SET: support_message / _es<br/>thank you if sessionResolved, else sorry"]
    set_support_message --> say_support_message["SAY: opening + context + contact + closing_prompt<br/>outcome: support_outcome or unresolved"]
    say_support_message --> stop((End))
```

---

## SwitchToText
**ID**: `switch-to-text` · **Version**: 1.1.0 · **Primary** (prompt "Switch to text" / "Cambiar a texto")  
**Description**: Used when the user explicitly asks to switch the chat to text/SMS. It must never be used when the user asks for a live agent, human or manager. It forwards the chat context to SMS and sends a welcome message.

### Variables
*   `sms_result` (object): result of the SMS send.

The welcome text also reads `text_starter` / `text_starter_es` when a caller passes them as FLOW parameters (they are not declared here).

### Steps
1. `check_already_text` (CASE) - not on voice (`!cargo.voice`) → **END** (nothing to switch). Otherwise continue.
2. `check_can_text` (CASE) - no `cargo.callerId` → SAY "I can't send a text message to the number you're calling from."
3. `route_cannot_text` (CASE) - no `cargo.callerId` → FLOW `contact-support` (`reboot`). The SAY from step 2 is delivered with ContactSupport's output.
4. `set_welcome_message` (SET) - "Hi, I remember our phone conversation and can continue to help you here via text. You can also continue on WhatsApp: https://wa.me/18184162641?text=Hi" (Spanish variant when `language === 'es'`), followed by a blank line and `text_starter` when one was passed (Spanish: `text_starter_es`, else `text_starter`). **The WhatsApp number is hard-coded in the flow.**
5. `set_switch_user_turn` (SET) - `switch_user_turn` = "Switch to text" / "Cambiar a texto".
6. `send_welcome_sms` (CALL-TOOL [`switch-to-sms`](#switch-to-sms)) - args `accountSid: null`, `threadId: {{sessionId}}`, `from: {{cargo.twilioNumber}}`, `to: {{cargo.callerId}}`, `message: {{welcome_message}}`, `userTurn: {{switch_user_turn}}`; result in `sms_result`. `onFail` → FLOW `contact-support`, `reboot`.
7. `confirm_sms_sent` (SAY) - "I've sent you a text message. Please check your phone and reply via text. Goodbye and take care!"

### Ends
By completion after the confirmation, `END` when not on voice, or `reboot` into `contact-support` when there is no caller ID or the send fails. Besides intent detection, other flows reach it with `callType: "reboot"` (keypad 9 / "TEXT" in the retry menu, text words in validate-otp-code).

### Flowchart
```mermaid
graph TD
    start((Start)) --> check_already_text{cargo.voice?}
    check_already_text -->|not voice| already_text_mode[END]
    check_already_text -->|voice| check_can_text{cargo.callerId?}
    check_can_text -->|missing| say_cannot_text[SAY: can't text the number you're calling from]
    say_cannot_text --> cannot_text_contact_support[FLOW reboot: contact-support]
    check_can_text -->|set| set_welcome_message[SET: welcome_message + text_starter]
    set_welcome_message --> set_switch_user_turn[SET: switch_user_turn]
    set_switch_user_turn --> send_welcome_sms[TOOL: switch-to-sms]
    send_welcome_sms --> confirm_sms_sent[SAY: text sent, goodbye]
    send_welcome_sms -.->|onFail, reboot| sms_failed_flow[FLOW: contact-support]
    confirm_sms_sent --> stop((End))
    already_text_mode --> stop
```

---

## AuthenticateUser
**ID**: `authenticate-user` · **Version**: 1.4.0 · **Sub-flow**  
**Description**: Generic flow to authenticate user via OTP sent to cell or email.

The gatekeeper. It records its options in `cargo.authOptions` / `cargo.authCancelFlow`, collects a phone or email (via `get-cell-or-email`), optionally lets a tenant-supplied validator flow approve the contact, records the destination in `cargo.otp_cell_number` / `cargo.otp_email`, sends the code through [`send-otp-code`](#sendotpcode), hands any send failure to [`otp-send-failed`](#otpsendfailed), and hands off to `get-and-validate-otp-code`. On success it sets `auth_result = true` and returns to its caller, with `cargo.otpVerified` set by the `validate-otp` tool.

### Parameters
*   `retry_flow` (string): Flow a failed contact step retries. Defaults to `authenticate-user` (step `default_retry_flow`). It is passed to `get-cell-or-email` and to the menu for a contact the validator rejected. The code-failure menus always retry `authenticate-user` itself.
*   `cancel_flow` (string): Flow EXIT goes to anywhere in this authentication. Defaults to `contact-support` (step `default_cancel_flow`), and is kept in `cargo.authCancelFlow` for the flows that do not receive it as a variable.
*   `cell_number` (string): Phone already supplied by the caller. Forwarded so `get-cell-or-email` skips the contact prompt.
*   `email` (string): Email already supplied by the caller. Forwarded the same way.
*   `email_validator` (string, optional flow name): When supplied, it is called with `{email}` before an email OTP is sent, and it MUST set `contact_valid = true` to allow the send. **Fail-closed.** The validator must end by completion, because a `RETURN` in it terminates all flows.
*   `cell_validator` (string, optional flow name): Same contract, called with `{cell_number}` before an SMS OTP.
*   `retrying` (boolean): Set by the retry menu. When true and `cargo.authOptions` exists, `retry_flow`, `cancel_flow`, `email_validator` and `cell_validator` are restored from `cargo.authOptions` and the values passed with the retry are ignored, so a retry keeps the options of the authentication being retried.

### Variables
`cell_or_email`, `cell_number`, `email`, `contact_valid` (true when no validator applies), `unverified_contact` / `unverified_contact_es` (the rejected contact phrased for the retry message: "the number 555…" / "the email a@b.c").

### Steps
1. `check_already_verified` (CASE) - `cargo.otpVerified` → **END** (return to the caller at once). Otherwise continue.
2. `remember_or_restore_retry_flow` / `_cancel_flow` / `_email_validator` / `_cell_validator` (SET) - with `retrying` and a `cargo.authOptions`: each option = its value in `cargo.authOptions` (`''` when absent there). Otherwise: each option = the passed value, `''` when undefined or empty.
3. `default_retry_flow` / `default_cancel_flow` (SET) - `retry_flow ||= 'authenticate-user'`, `cancel_flow ||= 'contact-support'`.
4. `remember_options` (SET, side effect) - `cargo.authOptions = { retry_flow, cancel_flow, email_validator, cell_validator }` and `cargo.authCancelFlow = cancel_flow`.
5. `get_contact_info` (FLOW `get-cell-or-email`, `call`) - passes `retry_flow`, `cancel_flow`, `cell_number`, `email`. Sets `cell_number` or `email`, or leaves the flow stack via one of its own exits.
6. `init_contact_valid` (SET) - `contact_valid` = false when a validator applies to the collected contact (`cell_validator` with a `cell_number`, or `email_validator` with an `email`); true otherwise.
7. `validate_contact` (CASE) - runs `{{cell_validator}}` with `{cell_number}` or `{{email_validator}}` with `{email}` (`call`). The cell validator is checked first.
8. `describe_unverified_contact` / `_es` (SET) - builds the phrase used below.
9. `gate_otp_on_contact_valid` (CASE) - `!contact_valid` → FLOW [`generic-retry-with-options`](#genericretrywithoptions) (`replace`) with "Sorry, I could not verify {{unverified_contact}}.", `retry_flow`, `cancel_flow`, and `capture_patterns` for `cell_number` (`[0-9\-\(\)\.\s]{10,}`, normalizer `[^0-9]`) and `email` (`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`). No `retry_call_type`, `allow_code_entry` or `question`.
10. `reset_resend_count` / `reset_mismatch_count` (SET, side effect) - `cargo.otpResends = 0`, `cargo.otpMismatches = 0`.
11. `set_cell_number_to_cargo` / `set_email_to_cargo` (SET, side effect) - `cargo.otp_cell_number = cell_number || ''`, `cargo.otp_email = email || ''`. This is the destination `send-otp-code` reads.
12. `send_code` (FLOW [`send-otp-code`](#sendotpcode), `call`) - sends the code by SMS to `cargo.otp_cell_number` or by email to `cargo.otp_email`, and records `cargo.otpSendFailure` (`''` when the code went out). A number already refused for texts (`cargo.otpUndeliverableTo`) is not texted again.
13. `auth_check_sent` (CASE) - `cargo.otpSendFailure` → FLOW [`otp-send-failed`](#otpsendfailed) (`replace`). Otherwise continue.
14. `get_and_validate_otp_code` (FLOW `get-and-validate-otp-code`, `call`).
15. `check_validation_result` (CASE) - `cargo.otpVerified` → SET `auth_result = true`. Otherwise → FLOW `generic-retry-with-options` (`replace`), "Sorry, the code you entered was invalid or expired.", with the [authentication retry parameters](#genericretrywithoptions) and `allow_code_entry: true`.

### Ends
Success returns to the caller (by completion) with `auth_result = true` and `cargo.otpVerified` set. Already verified → `END`. Failures leave through `generic-retry-with-options`, `otp-send-failed` (which goes on to `otp-text-undeliverable` or `generic-retry-with-options`), or through `get-cell-or-email`'s own exits (cancel, live agent, off-topic hand-off). `otp-send-failed` and the flow it replaces itself with keep this frame's variables (`retry_flow`, `cancel_flow`, the validators) because they are reached by `replace`, and `otp-text-undeliverable` returns here by `replace`. EXIT at any step goes to the authentication's `cancel_flow`: `get-cell-or-email` and the contact menu receive it as a variable, the other steps read `cargo.authCancelFlow`.

### Flowchart
```mermaid
graph TD
    start((Start)) --> check_already_verified{cargo.otpVerified?}
    check_already_verified -->|yes| already_verified[END]
    check_already_verified -->|no| options["SET: options from cargo.authOptions when retrying, else the parameters; defaults authenticate-user / contact-support"]
    options --> remember_options[SET: cargo.authOptions, cargo.authCancelFlow]
    remember_options --> get_contact_info[FLOW call: get-cell-or-email]
    get_contact_info --> init_contact_valid[SET: contact_valid]
    init_contact_valid --> validate_contact{validator for this contact?}
    validate_contact -->|cell_validator + cell_number| run_cell_validator["FLOW call: {{cell_validator}}"]
    validate_contact -->|email_validator + email| run_email_validator["FLOW call: {{email_validator}}"]
    validate_contact -->|none| describe[SET: unverified_contact / _es]
    run_cell_validator --> describe
    run_email_validator --> describe
    describe --> gate{contact_valid?}
    gate -->|no| contact_not_verified[FLOW replace: generic-retry-with-options]
    gate -->|yes| reset_counts[SET: cargo.otpResends = 0, cargo.otpMismatches = 0]
    reset_counts --> set_cargo[SET: cargo.otp_cell_number, cargo.otp_email]
    set_cargo --> send_code[FLOW call: send-otp-code]
    send_code --> auth_check_sent{cargo.otpSendFailure?}
    auth_check_sent -->|set| auth_send_failed[FLOW replace: otp-send-failed]
    auth_check_sent -->|empty| get_and_validate[FLOW call: get-and-validate-otp-code]
    get_and_validate --> check_result{cargo.otpVerified?}
    check_result -->|yes| auth_success[SET: auth_result = true]
    check_result -->|no| auth_failed["FLOW replace: generic-retry-with-options, code entry allowed"]
    auth_success --> stop((Return to caller))
    already_verified --> stop
```

---
---

## GetCellOrEmail
**ID**: `get-cell-or-email` · **Version**: 1.1.2 · **Sub-flow**  
**Description**: Prompt user to provide either their cell phone number or email address for account lookup.

### Parameters
*   `retry_flow` (string): Flow to reboot if the user wants to retry.
*   `cancel_flow` (string): Flow to reboot if the user cancels. Empty falls back to `contact-support`.
*   Also reads `cell_number` / `email` when the caller passes them (`authenticate-user` does). These are not declared as parameters here.

### Steps
1. Guard `cell_number` and `email` to `''` when undefined.
2. `ask_cell_or_email_if_no_param` (CASE):
   - nothing supplied and `cargo.callerId` → SAY-GET `cell_or_email`: "To authenticate using your caller id, please {verb} yes. Otherwise, please {verb}[ or enter] the phone or email associated with your account[ followed by the pound key]. To exit anytime you can [press the asterisk key or ]{verb} EXIT." `digits: {min 7, max 12, autoSubmitChars ["1"], autoSubmitMs 2500}` (a single keypad "1" auto-submits).
   - nothing supplied → SAY-GET `cell_or_email`: "Please {verb} [or enter] the phone or email associated with your account[ followed by the pound key if entered using the dial pad]. To exit anytime …", `digits: {min 7, max 12}`.
   - otherwise → `cell_or_email = cell_number || email` (no prompt).
3. Normalization (SET) - `prospective_cell_number` = digits only. `prospective_email` = the first email-shaped match, or failing that `email` or a match that allows spaces, with the spaces removed. `cell_or_email` is trimmed, lower-cased and stripped of punctuation.
4. `branch_on_cell_or_email` (CASE, first match wins):
   1. `validatePhone(prospective_cell_number)` → `cell_number` = those digits.
   2. `validateEmail(prospective_email)` → `email` = it.
   3. `cargo.callerId` and the answer is `1`, or `isAnswer(…, 'yes', ['thanks', 'thank you', 'gracias'])` with no digit and no `@`, or `matchesChoice` phone words (`phone, cell, caller id, number, numero, teléfono, celular, identificador de llamadas`…) → `cell_number = cargo.callerId`.
   4. `isAnswer(…, 'exit')` (EXIT words or `*`) in an answer of at most two words → FLOW `{{cancel_flow || 'contact-support'}}` (`reboot`).
   5. `isAgentRequest` (the whole answer asks for a person, or is `0`) → FLOW `live-agent-requested` (`reboot`).
   6. `cargo.callerId` and digits that are not a valid phone → `cell_number = cargo.callerId`.
   7. digits that are not a valid phone (no caller ID) → FLOW `generic-retry-with-options` (`replace`): "Sorry, the phone number you provided isn't valid.", with `retry_flow`, `cancel_flow` and the cell/email `capture_patterns` (no `retry_call_type`, so a retry by `1` reboots).
   8. `cargo.callerId` (anything else) → `cell_number = cargo.callerId`.
   9. the question was asked (`!cell_number && !email`) and the answer is three or more words containing no digit and no `@` → **`DISPATCH`** with **`outcome: "unresolved"`, `reason: "auth_prompt_off_topic"`**. The answer goes to intent detection: a matching flow starts at once (the outcome is dropped); otherwise the host answers with the outcome.
   10. default → FLOW `generic-retry-with-options` (`replace`): "Sorry, I do need the the phone or email associated with your account to proceed.", same parameters.

   Because branch 8 comes before branch 9, a caller with caller ID who says something off-topic is authenticated against the caller ID, not handed off.

### Ends
By completion (returning to `authenticate-user` with `cell_number` or `email` set), or through one of the exits above.

### Flowchart
```mermaid
graph TD
    start((Start)) --> guards[SET: cell_number/email default '']
    guards --> ask{contact supplied?}
    ask -->|no + callerId| ask_with_caller_id[SAY-GET: say yes for caller id, or phone/email]
    ask -->|no| ask_plain[SAY-GET: phone or email]
    ask -->|yes| use_provided[SET: cell_or_email]
    ask_with_caller_id --> normalize[SET: prospective_cell_number / prospective_email / cell_or_email]
    ask_plain --> normalize
    use_provided --> normalize
    normalize --> branch{first match}
    branch -->|valid phone| valid_phone[SET: cell_number]
    branch -->|valid email| valid_email[SET: email]
    branch -->|callerId + yes / phone words| use_caller_id[SET: cell_number = callerId]
    branch -->|EXIT or *, at most 2 words| abort_process["FLOW reboot: cancel_flow or contact-support"]
    branch -->|agent request or 0| goto_live_agent[FLOW reboot: live-agent-requested]
    branch -->|callerId + invalid digits| fallback_invalid[SET: cell_number = callerId]
    branch -->|invalid digits| invalid_phone[FLOW replace: generic-retry-with-options]
    branch -->|callerId| fallback_unrecognized[SET: cell_number = callerId]
    branch -->|asked, 3+ words, no digit or @| off_topic["DISPATCH: outcome unresolved"]
    branch -->|default| retry[FLOW replace: generic-retry-with-options]
    valid_phone --> stop((Return to caller))
    valid_email --> stop
    use_caller_id --> stop
    fallback_invalid --> stop
    fallback_unrecognized --> stop
```

---

## GetAndValidateOtpCode
**ID**: `get-and-validate-otp-code` · **Version**: 1.0.2 · **Sub-flow**  
**Description**: Get and validate OTP code from user.

### Variables
`otp_code`, `normalized_otp_code`, `otp_destination`, `user_choice` (initial `""`), `otp_where` / `otp_where_es` (where the code is, for the prompt).

### Steps
1. `set_otp_destination` - `cargo.otp_cell_number` if set, else `cargo.otp_email`.
2. `formatted_otp_destination` - "cell ending with 1234" (the last four digits; on voice comma-separated, "1, 2, 3, 4") or "email: a@b.c". Spanish wording when `language == 'es'`.
3. `set_otp_where` / `set_otp_where_es` - `cargo.otpSentOn === 'whatsapp'` → "I just sent you here in this chat" / "que le acabo de enviar aquí en este chat". Otherwise "you received at {formatted destination}" / "que recibió en …".
4. `get_otp_from_user` (SAY-GET `otp_code`, `digits: {min 6, max 6}`) - "Please {verb} [or enter ]the 6-digit verification code {otp_where}. You can also [press * or ]{verb} EXIT to cancel." The Spanish exit sentence is "También puede presionar * o decir SALIR para cancelar." on voice and "También puede escribir SALIR para cancelar." otherwise.
5. `set_user_choice` - `user_choice` = the answer trimmed and lower-cased (for word matching).
6. `set_otp_code` - `normalized_otp_code` = digits only.
7. `proceed_to_validation` (FLOW `validate-otp-code`, `call`).

### Ends
By completion once `validate-otp-code` returns. Retries happen inside `validate-otp-code`, which replaces itself with this flow to prompt again.

### Flowchart
```mermaid
graph TD
    start((Start)) --> set_otp_destination[SET: otp_destination]
    set_otp_destination --> formatted[SET: formatted_otp_destination]
    formatted --> set_otp_where[SET: otp_where / _es, this chat or the destination]
    set_otp_where --> get_otp[SAY-GET: 6-digit code, digits 6..6]
    get_otp --> set_user_choice[SET: user_choice]
    set_user_choice --> set_otp_code[SET: normalized_otp_code]
    set_otp_code --> validate[FLOW call: validate-otp-code]
    validate --> stop((Return to caller))
```

---

## ValidateOtpCode
**ID**: `validate-otp-code` · **Version**: 1.1.3 · **Sub-flow**  
**Description**: Validate OTP code entered by user; sets `cargo.otpVerified` on success. Capped at 3 wrong codes per authentication (`cargo.otpMismatches`, reset by authenticate-user): the code is withdrawn and the retry/agent/exit choice follows, where retry sends a fresh code.

Reads `normalized_otp_code` and `user_choice` from `get-and-validate-otp-code`. An expired or missing code is answered with a fresh one (via `resend-otp-code`), not with "didn't match".

### Variables
`otp_validation_result` (boolean), `invite_text` (WhatsApp invite wording for this session's language; empty means the feature is off), `whatsapp_invite_sent` (initial `false`; true only if an invite was actually sent).

### Steps
1. `validate_otp_and_lookup` (CASE, first match wins):
   - `normalized_otp_code.length === 6` → CALL-TOOL [`validate-otp`](#validate-otp) `{otp: normalized_otp_code, container: cargo}` into `otp_validation_result`. `onFail` → FLOW `get-and-validate-otp-code` (`replace`).
   - `isAnswer(…, 'exit')` (EXIT words or `*`) → FLOW `{{cargo.authCancelFlow || 'contact-support'}}` (`reboot`).
   - `isAnswer(…, 'agent')` (an AGENT word anywhere in the answer, or `0`) → FLOW `live-agent-requested` (`reboot`).
   - `isAnswer(…, 'text')` (TEXT words) → FLOW `switch-to-text` (`reboot`).
   - "didn't receive / resend" phrases (`resend, send again, not received, didn t get, no code, no llegó, no recibí, reenviar`…) → FLOW [`resend-otp-code`](#resendotpcode) (`call`) with `resend_reason: "requested"`.
   - "I'm driving / busy / later" phrases → SAY "No problem. Say TEXT and I'll continue with you by message so you can do this when you are free, or {verb} the code whenever you are ready."
   - some digits, but not 6 → SAY "I was expecting a 6-digit code. Let's try again. You can also [press * or ]{verb} EXIT to cancel." (Spanish exit sentence as in GetAndValidateOtpCode.)
   - default (no digits) → SAY "Let me explain. I sent you a message with a six-digit code in it. Read those six digits back to me. You can also {verb} AGENT to reach a person, or EXIT to cancel."
2. `retry_if_bad_format` (CASE) - not 6 digits → FLOW `get-and-validate-otp-code` (`replace`), which prompts again after the SAY or the fresh code above.
3. `count_wrong_code` (SET, side effect) - `cargo.otpMismatches` + 1 when not verified and `cargo.otpFailure === 'mismatch'`.
4. `withdraw_code_at_cap` (CASE) - a mismatch with `cargo.otpMismatches >= 3` → `cargo.otpHash = null`, so the code can no longer be accepted.
5. `check_validation_result` (CASE, first match wins):
   - `cargo.otpVerified` → SET `otp_validated = true`.
   - `cargo.otpFailure === 'expired'` → FLOW `resend-otp-code` (`call`), `resend_reason: "expired"`.
   - `cargo.otpFailure === 'missing'` → FLOW `resend-otp-code` (`call`), `resend_reason: "missing"`.
   - a mismatch at the cap → FLOW `generic-retry-with-options` (`replace`): "That code didn't match three times, so I can't accept another try with it. To reach a person, {verb} AGENT.", with the [authentication retry parameters](#genericretrywithoptions) and `allow_code_entry: false`.
   - default → SAY "That code didn't match. Let's try again."
6. `set_invite_text` - `global_whatsapp_invite_es` (Spanish) or `global_whatsapp_invite`, `''` when undefined.
7. `invite_if_wrong_code` (CASE) - verified, or `cargo.otpFailure` is not `mismatch` → no invite. Otherwise → CALL-TOOL [`send-whatsapp-invite`](#send-whatsapp-invite) `{accountSid: null, from: cargo.twilioNumber, to: cargo.otp_cell_number, inviteText, language, container: cargo}` into `whatsapp_invite_sent`. `onFail` → SET `whatsapp_invite_sent = false`. Per the tool's contract it returns `false` when `inviteText` is empty, when it already invited on this call, or when `to` is missing. `to` is `''` when the code went by email.
8. `mention_whatsapp_invite` (CASE) - `whatsapp_invite_sent` → SAY "I texted you a WhatsApp link so you can try again on WhatsApp to help overcome voice limitations."
9. `retry_if_wrong_code` (CASE) - not verified → FLOW `get-and-validate-otp-code` (`replace`).

### Ends
Verified → completion (the caller chain returns to `authenticate-user` or `generic-retry-with-options`). A wrong code loops back to the prompt until the third mismatch, which leaves through `generic-retry-with-options`. An expired or missing code gets a fresh one and loops back, until `resend-otp-code`'s own cap. The exits in step 1 leave at any time.

### Flowchart
```mermaid
graph TD
    start((Start)) --> route{input}
    route -->|6 digits| validate_otp[TOOL: validate-otp]
    route -->|EXIT or *| abort_process[FLOW reboot: cargo.authCancelFlow or contact-support]
    route -->|AGENT words or 0| goto_live_agent[FLOW reboot: live-agent-requested]
    route -->|TEXT words| goto_text[FLOW reboot: switch-to-text]
    route -->|not received / resend| code_not_arrived[FLOW call: resend-otp-code, requested]
    route -->|busy / driving| cannot_now[SAY: say TEXT or send code later]
    route -->|other digits| invalid_format[SAY: expecting 6 digits]
    route -->|no digits| explain[SAY: let me explain]
    validate_otp -.->|onFail| otp_tool_error[FLOW replace: get-and-validate-otp-code]
    validate_otp --> fmt{6 digits?}
    code_not_arrived --> fmt
    cannot_now --> fmt
    invalid_format --> fmt
    explain --> fmt
    fmt -->|no| loop_back_for_code[FLOW replace: get-and-validate-otp-code]
    fmt -->|yes| count[SET: count mismatch, withdraw code at 3]
    count --> check{result}
    check -->|verified| otp_success[SET: otp_validated]
    check -->|expired| expired_fresh[FLOW call: resend-otp-code, expired]
    check -->|missing| missing_fresh[FLOW call: resend-otp-code, missing]
    check -->|3rd mismatch| cap_reached[FLOW replace: generic-retry-with-options]
    check -->|mismatch| wrong_code[SAY: code didn't match]
    otp_success --> invite_text[SET: invite_text]
    expired_fresh --> invite_text
    missing_fresh --> invite_text
    wrong_code --> invite_text
    invite_text --> invite{mismatch?}
    invite -->|yes| invite_whatsapp[TOOL: send-whatsapp-invite]
    invite -->|no| mention{whatsapp_invite_sent?}
    invite_whatsapp --> mention
    mention -->|yes| say_invite[SAY: texted you a WhatsApp link]
    mention -->|no| retry{verified?}
    say_invite --> retry
    retry -->|no| loop_back_for_new_code[FLOW replace: get-and-validate-otp-code]
    retry -->|yes| stop((Return to caller))
```

---

## ResendOtpCode
**ID**: `resend-otp-code` · **Version**: 1.1.1 · **Sub-flow**  
**Description**: Worker: sends a fresh code to the destination authenticate-user used (`cargo.otp_cell_number` / `cargo.otp_email`) and says why (`expired`, `missing` or `requested`). At most 2 per authentication (`cargo.otpResends`), then the retry menu.

Called by `validate-otp-code` with `callType: "call"`.

### Parameters
*   `resend_reason` (string): `expired`, `missing` or `requested`. Also declared as a variable with the default `"requested"`.

### Variables
`resend_reason`.

### Steps
1. `check_resend_cap` (CASE) - `cargo.otpResends >= 2` → FLOW `generic-retry-with-options` (`replace`): "I've already sent you new codes and still couldn't verify you. To reach a person, {verb} AGENT.", with the [authentication retry parameters](#genericretrywithoptions) and `allow_code_entry: true`.
2. `count_resend` (SET, side effect) - `cargo.otpResends` + 1.
3. `send_fresh_code` (FLOW [`send-otp-code`](#sendotpcode), `call`) - sends to `cargo.otp_cell_number` or `cargo.otp_email` and records `cargo.otpSendFailure`.
4. `resend_check_sent` (CASE) - `cargo.otpSendFailure` → FLOW [`otp-send-failed`](#otpsendfailed) (`replace`). Otherwise continue.
5. `say_why_fresh_code` (CASE) - `expired` → SAY "Your code expired, so I've sent you a new one." `missing` → SAY "I don't have an active code for you, so I've sent you a new one." Otherwise → SAY "I've sent you a new code."

### Ends
By completion, returning to `validate-otp-code`, which loops back to the code prompt. At the cap, by `replace` into `generic-retry-with-options`; on a failed send, by `replace` into `otp-send-failed`.

### Flowchart
```mermaid
graph TD
    start((Start)) --> check_resend_cap{cargo.otpResends >= 2?}
    check_resend_cap -->|yes| resend_cap_reached[FLOW replace: generic-retry-with-options]
    check_resend_cap -->|no| count_resend[SET: cargo.otpResends + 1]
    count_resend --> send_fresh_code[FLOW call: send-otp-code]
    send_fresh_code --> resend_check_sent{cargo.otpSendFailure?}
    resend_check_sent -->|set| resend_send_failed[FLOW replace: otp-send-failed]
    resend_check_sent -->|empty| say_why{resend_reason}
    say_why -->|expired| say_code_expired[SAY: your code expired]
    say_why -->|missing| say_no_active_code[SAY: no active code]
    say_why -->|requested| say_new_code_sent[SAY: sent a new code]
    say_code_expired --> stop((Return to caller))
    say_no_active_code --> stop
    say_new_code_sent --> stop
```

---
---

## GenericRetryWithOptions
**ID**: `generic-retry-with-options` · **Version**: 1.3.0 · **Sub-flow**  
**Description**: Worker: says what failed and offers retry (YES / 1), switch to text (TEXT / 9, voice with caller ID), an agent (AGENT / 0) or exit (EXIT / *). A contact in the answer retries with it; with allow_code_entry a 6-digit code is checked on the spot; anything else goes back to intent detection.

The library's only retry menu: the authentication flows and the Shopify lookups offer their retry through it.

### Parameters
*   `error_message` / `error_message_es` (string): What failed, spoken first.
*   `question` / `question_es` (string): The question after the error. Empty or absent = "Would you like to try again?" / "¿Le gustaría intentar nuevamente?".
*   `retry_flow` (string): Flow to run again on YES / `1` or a captured contact.
*   `retry_call_type` (string): `'reboot'` (the default: start `retry_flow` afresh, alone) or `'replace'` (re-enter it in this frame, e.g. `authenticate-user` inside its caller).
*   `cancel_flow` (string): Flow to reboot on EXIT. Empty or absent = `contact-support`.
*   `capture_patterns` (array): Optional `[{variable, regex, normalizer?}]` for [`normalizeAndFindCapture`](#conventions-used-by-these-flows). Absent = no smart capture.
*   `allow_code_entry` (boolean): A 6-digit answer is a verification code, checked with `validate-otp-code`.
*   `caller_outcome`, `caller_reason` (string): Optional. The caller's declared outcome (usually `unresolved`) and reason for the failure that led here. The `DISPATCH` of an unrecognised answer declares them, so they reach the host only when intent detection matches no flow. Omitted = no outcome.

**Authentication retry parameters.** `authenticate-user` (wrong code), `validate-otp-code` (wrong-code cap), `resend-otp-code` (resend cap) and `otp-send-failed` (failed send) all pass the same set besides their own message and `allow_code_entry`:

| Parameter | Value |
|---|---|
| `retry_flow` | `authenticate-user` |
| `retry_call_type` | `replace` |
| `cancel_flow` | `{{cargo.authCancelFlow}}` |
| `capture_patterns` | `cell_number`: `[0-9\-\(\)\.\s]{10,}`, normalizer `[^0-9]`; `email`: `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}` |
| `question` / `question_es` | "Would you like to try again to get access to your account?" / "¿Le gustaría intentar nuevamente obtener acceso a su cuenta?" |

`allow_code_entry` is `true` after a wrong code (authenticate-user) and at the resend cap, `false` at the wrong-code cap (the code was withdrawn) and after a failed send. `authenticate-user`'s rejected-contact menu and `get-cell-or-email`'s menus pass only `retry_flow`, `cancel_flow` and the cell/email `capture_patterns`.

### Variables
`user_choice`, `smart_capture_result`, `normalized_otp_code` (a 6-digit code typed at the menu, when `allow_code_entry`).

### Steps
1. `say_error_and_prompt` (SAY-GET `user_choice`, `digits: {min 1, max 1}`) - "{error_message} {question} To retry [Press 1 or ]{verb} YES. [To switch to text press 9 or {verb} TEXT. ]To abort [press the asterisk key or ]{verb} EXIT." The keypad wording appears on voice only, and the TEXT option only on voice with a `cargo.callerId`. This prompt does not name the AGENT option; the error messages of the two cap menus do.
2. `reprompt_on_unknown_key` (CASE) - a single key `2` to `8` → SAY-GET `user_choice` again: "Sorry, that is not an option. To retry … [For an agent press 0. ]To abort …" (the agent sentence on voice only; same `digits`). One re-prompt only; its answer goes on to step 3.
3. `check_smart_capture` (SET) - `smart_capture_result = normalizeAndFindCapture(user_choice, capture_patterns)` when patterns were passed, else `null`.
4. `handle_smart_capture` (CASE, first match wins):
   - a capture and `retry_call_type === 'replace'` → FLOW `{{retry_flow}}` (`replace`) with `cell_number: ''`, `email: ''`, `[captured variable]: captured value`, `retry_flow`, `cancel_flow`, `retrying: true`.
   - a capture → FLOW `{{retry_flow}}` (`reboot`) with `[captured variable]: captured value`, `retry_flow`, `cancel_flow`.

   So an answer that contains a phone or email goes straight back in with that value (the matched part of the answer).
5. `read_typed_code` (SET) - with `allow_code_entry`, `normalized_otp_code` = the answer's digits when there are exactly 6; else `''`.
6. `check_typed_code` (CASE) - `normalized_otp_code` → FLOW [`validate-otp-code`](#validateotpcode) (`call`).
7. `normalize_choice` (SET) - trim, lower-case, strip punctuation.
8. `handle_choice` (CASE, first match wins):
   - `normalized_otp_code` and `cargo.otpVerified` → SET `auth_result = true` (the flow then ends by completion).
   - `normalized_otp_code` → FLOW `generic-retry-with-options` (`replace`): "Sorry, the code you entered was invalid or expired.", passing on `retry_flow`, `retry_call_type`, `cancel_flow`, `capture_patterns`, `question`, `question_es`, with `allow_code_entry: true`. By the steps of `validate-otp-code`, it returns only once the code is verified (a wrong code loops to its own code prompt), so this branch is a guard.
   - `isAnswer(…, 'yes', [phone, email, cell, mobile, teléfono, telefono, celular, móvil, movil, correo electrónico, correo]) || user_choice === '1' && retry_call_type === 'replace'` (`retry_in_place`) → FLOW `{{retry_flow}}` (`replace`) with `retrying: true`, `cell_number: ''`, `email: ''`. **`&&` binds before `||`**, so a YES or contact word takes this branch whatever `retry_call_type` is; only the keypad `1` checks for `'replace'`.
   - the same YES test, or `1` (`retry_from_start`) → FLOW `{{retry_flow}}` (`reboot`) with `retrying: true`. Reached only by `1` without `retry_call_type: 'replace'`.
   - `isAnswer(…, 'text')` (TEXT words) or `9` → FLOW `switch-to-text` (`reboot`).
   - `isAnswer(…, 'agent')` (an AGENT word anywhere in the answer, or `0`) → FLOW `live-agent-requested` (`reboot`).
   - `isAnswer(…, 'exit')` (EXIT words or `*`) → FLOW `cancel_flow`, else `contact-support` (`reboot`).
   - empty input or a lone digit (no intent to detect) → the same cancel target (`reboot`).
   - default → `DISPATCH` (outcome/reason = `caller_outcome`/`caller_reason`): the answer is routed through intent detection. A matching flow starts in the same turn, otherwise the host answers.

`retrying: true` makes an `authenticate-user` that the retry reaches restore the options of the authentication being retried from `cargo.authOptions` (see [AuthenticateUser](#authenticateuser)).

### Ends
By completion after a typed code was verified (with `auth_result = true`, returning to whichever flow called the frame this menu replaced), by a `replace` / `reboot` into another flow, or by `DISPATCH` (default branch).

### Flowchart
```mermaid
graph TD
    start((Start)) --> say_error_and_prompt[SAY-GET: error + question + retry / text / exit]
    say_error_and_prompt --> reprompt{key 2-8?}
    reprompt -->|yes| say_not_an_option[SAY-GET: not an option, same choices + agent on voice]
    reprompt -->|no| check_smart_capture[SET: normalizeAndFindCapture]
    say_not_an_option --> check_smart_capture
    check_smart_capture --> handle_smart_capture{captured?}
    handle_smart_capture -->|yes, retry_call_type replace| replace_with_captured_value["FLOW replace: {{retry_flow}} + captured value, retrying"]
    handle_smart_capture -->|yes| reboot_with_captured_value["FLOW reboot: {{retry_flow}} + captured value"]
    handle_smart_capture -->|no| read_typed_code[SET: normalized_otp_code when allow_code_entry]
    read_typed_code --> check_typed_code{6-digit code?}
    check_typed_code -->|yes| validate_typed_code[FLOW call: validate-otp-code]
    check_typed_code -->|no| normalize_choice[SET: normalize]
    validate_typed_code --> normalize_choice
    normalize_choice --> handle_choice{choice}
    handle_choice -->|code verified| typed_code_verified[SET: auth_result = true]
    handle_choice -->|code not verified| typed_code_wrong[FLOW replace: generic-retry-with-options]
    handle_choice -->|YES / contact words, or 1 with replace| retry_in_place["FLOW replace: {{retry_flow}}, retrying"]
    handle_choice -->|1| retry_from_start["FLOW reboot: {{retry_flow}}, retrying"]
    handle_choice -->|TEXT / 9| do_switch_text[FLOW reboot: switch-to-text]
    handle_choice -->|AGENT / 0| do_agent[FLOW reboot: live-agent-requested]
    handle_choice -->|EXIT / *| do_abort["FLOW reboot: cancel_flow or contact-support"]
    handle_choice -->|empty / lone digit| do_cancel_no_intent["FLOW reboot: cancel_flow or contact-support"]
    handle_choice -->|default| dispatch_unrecognised["DISPATCH: intent detection, else host"]
    typed_code_verified --> stop((Return to caller))
```

---

## OtpSendFailed
**ID**: `otp-send-failed` · **Version**: 1.0.1 · **Sub-flow**  
**Description**: Worker: a code could not be sent (`cargo.otpSendFailure`). A line that cannot receive texts goes to otp-text-undeliverable; any other failure offers the retry.

Reached by `replace` from `authenticate-user` (`auth_check_sent`) and from `resend-otp-code` (`resend_check_sent`) when [`send-otp-code`](#sendotpcode) recorded a failure, so it keeps the replaced frame's variables.

### Steps
1. `branch_on_failure` (CASE):
   - `cargo.otpSendFailure === 'undeliverable'` → FLOW [`otp-text-undeliverable`](#otptextundeliverable) (`replace`).
   Each retry branch passes the [authentication retry parameters](#genericretrywithoptions) with `allow_code_entry: false`.
   - `'sms'` → FLOW `generic-retry-with-options` (`replace`): "Sorry, text message delivery failed."
   - `'email'` → FLOW `generic-retry-with-options` (`replace`): "Sorry, email delivery failed."
   - default (`'none'`) → FLOW `generic-retry-with-options` (`replace`): "Sorry, there was an unexpected error."

### Ends
Always by `replace` into one of the two flows.

### Flowchart
```mermaid
graph TD
    start((Start)) --> branch_on_failure{cargo.otpSendFailure}
    branch_on_failure -->|undeliverable| line_cannot_text[FLOW replace: otp-text-undeliverable]
    branch_on_failure -->|sms| sms_retry[FLOW replace: generic-retry-with-options, text failed]
    branch_on_failure -->|email| email_retry[FLOW replace: generic-retry-with-options, email failed]
    branch_on_failure -->|other| unexpected_retry[FLOW replace: generic-retry-with-options, unexpected error]
```

---

## TextDestination
**ID**: `text-destination` · **Version**: 1.0.0 · **Sub-flow**  
**Description**: Worker: where a text to the customer can go. Sets `cargo.textTo` (10 digits: the verified cell, else the caller's phone on a call; `''` when there is none, no sender, or the line cannot receive texts) and `cargo.textTo4` (its last four, spaced on voice).

No flow in this library calls it. A caller runs it (`call`) before [`send-text`](#sendtext), and can use `cargo.textTo4` to tell the customer where the text went.

The "verified cell" of the description is `cargo.otp_cell_number`, the number `authenticate-user` sent the code to. The step does not check `cargo.otpVerified`.

### Steps
1. `pick_destination` (SET, side effect) - `cargo.textTo` = the last 10 digits of `cargo.otp_cell_number`, or, when that is empty and `cargo.voice`, of `cargo.callerId`. It is `''` when there is no `cargo.twilioNumber`, when the result is not 10 digits, or when it equals `cargo.otpUndeliverableTo`. A set `cargo.otp_cell_number` is used even when it is the refused number; the caller ID is then not tried.
2. `say_last_four` (SET, side effect) - `cargo.textTo4` = the last four digits of `cargo.textTo`, comma-spaced on voice ("1, 2, 3, 4"); `''` when `cargo.textTo` is empty.

### Ends
By completion.

### Flowchart
```mermaid
graph TD
    start((Start)) --> pick_destination["SET: cargo.textTo = otp_cell_number, else callerId on voice; '' if no sender, not 10 digits or undeliverable"]
    pick_destination --> say_last_four[SET: cargo.textTo4]
    say_last_four --> stop((Return to caller))
```

---

## SendText
**ID**: `send-text` · **Version**: 1.0.0 · **Sub-flow**  
**Description**: Worker: texts `message` to `cargo.textTo` (call text-destination first). Sets `cargo.textSent`.

No flow in this library calls it.

### Parameters
*   `message` (string): The text to send.

### Variables
`text_result` (string): what the send tool returned; `''` when it failed.

### Steps
1. `text_not_sent_yet` (SET, side effect) - `cargo.textSent = false`.
2. `send_when_possible` (CASE):
   - `cargo.textTo` → CALL-TOOL [`send-twilio-sms`](#send-twilio-sms) `{from: cargo.twilioNumber, to: "+1" + cargo.textTo, message}` into `text_result`. `accountSid` is not passed, so the function receives it as `undefined`. `onFail` → SET `text_result = ''`.
   - default → SET `text_result = ''`.
3. `record_sent` (SET, side effect) - `cargo.textSent = !!(cargo.textTo && text_result)`.

### Ends
By completion. It never leaves the flow stack; the caller reads `cargo.textSent`.

### Flowchart
```mermaid
graph TD
    start((Start)) --> text_not_sent_yet[SET: cargo.textSent = false]
    text_not_sent_yet --> send_when_possible{cargo.textTo?}
    send_when_possible -->|set| send_sms[TOOL: send-twilio-sms]
    send_when_possible -->|empty| no_destination["SET: text_result = ''"]
    send_sms -.->|onFail| send_failed["SET: text_result = ''"]
    send_sms --> record_sent[SET: cargo.textSent]
    send_failed --> record_sent
    no_destination --> record_sent
    record_sent --> stop((Return to caller))
```

---

## SendOtpCode
**ID**: `send-otp-code` · **Version**: 1.0.0 · **Sub-flow**  
**Description**: Worker: sends a one-time code to `cargo.otp_cell_number` (SMS) or `cargo.otp_email`. Never texts a number that cannot receive texts (`cargo.otpUndeliverableTo`). Sets `cargo.otpSendFailure` (`''`, `'undeliverable'`, `'sms'`, `'email'` or `'none'`); the caller hands a failure to otp-send-failed.

Called with `callType: "call"` by `authenticate-user` (`send_code`) and `resend-otp-code` (`send_fresh_code`). Each caller checks `cargo.otpSendFailure` in its next step and, when set, replaces itself with [`otp-send-failed`](#otpsendfailed).

**Why the worker records the failure instead of handing it off itself.** An `onFail` FLOW with `callType: "replace"` replaces only the frame that holds the failed CALL-TOOL. Inside a called worker that frame is the worker, so the replacement would run in its place and, when it finished, the caller would continue to its next step (the code prompt) as if the code had been sent (jsfe `src/index.ts`, CALL-TOOL `onFail` handling). Recording the failure and letting the caller branch on it leaves the caller's own frame, the one that should end.

### Steps
1. `clear_send_failure` (SET, side effect) - `cargo.otpSendFailure = ''`.
2. `skip_line_that_cannot_text` (CASE) - `cargo.otp_cell_number` whose last 10 digits equal `cargo.otpUndeliverableTo` → `cargo.otpSendFailure = 'undeliverable'`. A number already refused for texts is never texted again in the same session. Otherwise continue.
3. `send_code` (CASE, first match wins):
   - no failure and `cargo.otp_cell_number` → CALL-TOOL [`send-sms-otp`](#send-sms-otp) `{accountSid: null, from: cargo.twilioNumber, to: cargo.otp_cell_number, container: cargo, language}`. `onFail` → SET `cargo.otpSendFailure = cargo.otpUndeliverableTo ? 'undeliverable' : 'sms'` (the host's `send-sms-otp` sets `cargo.otpUndeliverableTo` when the line refuses the text, and clears it at the start of every send, so a value here describes this failure).
   - no failure and `cargo.otp_email` → CALL-TOOL [`send-email-otp`](#send-email-otp) `{to: cargo.otp_email, container: cargo, language}`. `onFail` → SET `cargo.otpSendFailure = 'email'`.
   - no failure (no destination) → `cargo.otpSendFailure = 'none'`.
   - default (already `'undeliverable'`) → nothing is sent.

### Ends
By completion, always. The outcome is in `cargo.otpSendFailure`.

### Flowchart
```mermaid
graph TD
    start((Start)) --> clear_send_failure["SET: cargo.otpSendFailure = ''"]
    clear_send_failure --> skip_line{otp_cell_number = cargo.otpUndeliverableTo?}
    skip_line -->|yes| cell_cannot_text["SET: cargo.otpSendFailure = 'undeliverable'"]
    skip_line -->|no| send_code{destination}
    cell_cannot_text --> send_code
    send_code -->|otp_cell_number| send_sms_otp[TOOL: send-sms-otp]
    send_code -->|otp_email| send_email_otp[TOOL: send-email-otp]
    send_code -->|neither| no_destination["SET: cargo.otpSendFailure = 'none'"]
    send_code -->|already undeliverable| not_sent[nothing sent]
    send_sms_otp -.->|onFail| sms_failed["SET: cargo.otpSendFailure = 'undeliverable' or 'sms'"]
    send_email_otp -.->|onFail| email_failed["SET: cargo.otpSendFailure = 'email'"]
    send_sms_otp --> stop((Return to caller))
    send_email_otp --> stop
    sms_failed --> stop
    email_failed --> stop
    no_destination --> stop
    not_sent --> stop
```

---
---

## OtpTextUndeliverable
**ID**: `otp-text-undeliverable` · **Version**: 1.0.3 · **Sub-flow**  
**Description**: Worker for authenticate-user: the number for the code cannot receive texts (landline, toll-free, invalid). Says so and asks for the account's email or a mobile number; never offers to text the same number again.

Reached by `replace` from [`otp-send-failed`](#otpsendfailed) when `cargo.otpSendFailure` is `undeliverable`, so it keeps `authenticate-user`'s variables (`retry_flow`, `cancel_flow`, the validators) and returns to it by `replace`.

### Variables
`user_choice` (the answer), `undeliverable_last4` (last four digits of the refused number; comma-spaced on voice), `choice_digits` (digits in the answer), `choice_email` (an email address in the answer, if any).

### Steps
1. `describe_number` (SET) - `undeliverable_last4` from `cargo.otpUndeliverableTo`: "1, 2, 3, 4" on voice, "1234" otherwise.
2. `ask_other_contact` (SAY-GET `user_choice`, `digits: {min 1, max 12, autoSubmitChars ["0"], autoSubmitMs 2500}`) - "The number ending with {undeliverable_last4} can't receive text messages, so I can't text it a code. Please {verb} the email address on your account, or {voice ? 'say or enter' : verb} a mobile number that can receive texts. To talk to an agent [press 0 or ]{verb} AGENT. To exit [press the asterisk key or ]{verb} EXIT."
3. `read_digits` (SET) - `choice_digits` = the answer's digits.
4. `read_email` (SET) - `choice_email` = the first email address in the answer (`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`); failing that, the first match that allows spaces, with the spaces removed; else `''`.
5. `clear_cell` / `clear_email` (SET) - `cell_number = ''`, `email = ''`.
6. `handle_choice` (CASE, first match wins):
   - `choice_email` and `validateEmail(choice_email)` → FLOW `authenticate-user` (`replace`) with `email: {{choice_email}}`.
   - `validatePhone(choice_digits)` → FLOW `authenticate-user` (`replace`) with `cell_number: {{choice_digits}}`.
   - `isAgentRequest` (the whole answer asks for a person, or is `0`) → FLOW `live-agent-requested` (`reboot`).
   - `isAnswer(…, 'exit')` (EXIT words or `*`) in an answer of at most two words → FLOW `{{cargo.authCancelFlow || 'contact-support'}}` (`reboot`).
   - default → FLOW `authenticate-user` (`replace`) with no contact, so `get-cell-or-email` asks again.

If the caller gives the same number again (or accepts the caller ID that is that number), `send-otp-code`'s `skip_line_that_cannot_text` records `undeliverable` without texting it, and `otp-send-failed` brings the caller back here.

### Ends
By `replace` into `authenticate-user`, or `reboot` into `live-agent-requested` or the authentication's cancel flow (`cargo.authCancelFlow`, else `contact-support`).

### Flowchart
```mermaid
graph TD
    start((Start)) --> describe_number[SET: undeliverable_last4]
    describe_number --> ask_other_contact[SAY-GET: can't text that number, email, mobile, AGENT or EXIT]
    ask_other_contact --> read[SET: choice_digits, choice_email]
    read --> clear[SET: cell_number = '', email = '']
    clear --> handle_choice{answer}
    handle_choice -->|valid email| try_email[FLOW replace: authenticate-user + email]
    handle_choice -->|valid phone| try_other_cell[FLOW replace: authenticate-user + cell_number]
    handle_choice -->|agent request or 0| goto_live_agent[FLOW reboot: live-agent-requested]
    handle_choice -->|EXIT or *, at most 2 words| abort_process[FLOW reboot: cargo.authCancelFlow or contact-support]
    handle_choice -->|default| ask_contact_again[FLOW replace: authenticate-user]
```

---

## LiveAgentRequested
**ID**: `live-agent-requested` · **Version**: 1.6.1 · **Primary** (prompt "live agent confirmation" / "confirmación de agente en vivo")  
**Description**: The customer's primary intent is to reach a human: live agent, representative, "customer service", "servicio al cliente", "I need to talk to someone", "speak to a person", "comunicarme con alguien", "hablar con una persona". On the phone it offers the transfer when an agent is scheduled (`cargo.agentPhoneNumber`); on every other channel it sends the Live Connect link when the tenant runs Live Connect and an agent is reachable. On the phone after hours (no agent number this turn, the number has a schedule) it says so, states the agent hours and offers to help, ending `unresolved` (`agent_unavailable`). Otherwise (any non-phone channel without a Live Connect link, or a phone number with no agents at all) it says it cannot connect the customer with a live agent and gives the tenant's contact information, ending `resolved` (`no_agent_reachable`).

The description also says "Contact information is given when the customer asks for it". No step of the after-hours path gives it; a later request reaches the host or another flow.

### Variables
*   `user_choice` (string): continue with AI or transfer.
*   `live_connect_link` (string): the Live Connect guest link on non-phone channels; `''` when not available.

### Steps
1. `get_live_connect` (CASE) - not on voice → CALL-TOOL [`get-live-connect-link`](#get-live-connect-link) `{container: cargo}` into `live_connect_link`; `onFail` → SET `live_connect_link = ''`. On voice → `live_connect_link = ''`.
2. `offer_live_connect` (CASE) - not on voice and a link → **`RETURN`** "You can talk to a live agent now, by audio or video, here: {live_connect_link}" (Spanish: "Puede hablar ahora con un agente en vivo, por audio o video, aquí: …"), **`outcome: "resolved"`, `reason: "live_connect_link"`**.
3. `cannot_connect` (CASE) - not on voice, or on voice with neither `cargo.agentPhoneNumber` nor `cargo.agentHours` (a number with no agents) → **`RETURN`**, sentences joined with spaces, **`outcome: "resolved"`, `reason: "no_agent_reachable"`**:
   - "I can't connect you with a live agent here." (Spanish: "No puedo comunicarle con un agente en vivo por aquí.");
   - not on voice: `global_live_agents_comment` / `_es`, when set;
   - `cargo.contact_info` set: "Here is how to reach Customer Support: {contact_info}." (on voice through `textWithUrlToSpeech`); otherwise "Please contact Customer Support."
4. `check_agent_available` (CASE) - no `cargo.agentPhoneNumber` (on voice, after hours) → **`RETURN`**, sentences joined with spaces, **`outcome: "unresolved"`, `reason: "agent_unavailable"`**:
   - "Our live agent team isn't available right now." (Spanish: "Nuestro equipo de agentes no está disponible en este momento.");
   - `cargo.agentHours` / `cargo.agentHours_es`, else `global_live_agents_comment` / `_es` when set;
   - `cargo.agentUnavailableMessage`, else "I can still help with many questions. Just tell me what you need." (Spanish: "Aún puedo ayudarle con muchas preguntas. Solo dígame qué necesita." on voice, "… Solo escríbame qué necesita." otherwise).
5. `ask_user_choice` (SAY-GET `user_choice`, `digits: {min 1, max 1}`) - the deflection pitch ("Before I try to transfer you, I want you to know that I can help you faster with many inquiries…"), then "To have me help you now [Press 1 or] {verb} YES. For a live agent [Press 0 or] {verb} LIVE AGENT."
6. `normalize_choice` - trim, lower-case, strip punctuation.
7. `handle_choice` (CASE):
   - **anything that is not** `isAnswer(…, 'yes', ['continue', 'thanks', 'gracias'])` and not `1` (so a negated answer such as "not sure" transfers) → nested CASE: `cargo.agentPhoneNumber` → **`RETURN`** "Understood. Let me transfer you to a live agent." (Spanish: "Entendido. Te transfiero a un agente en vivo."). Otherwise (the agent number is gone when the answer arrives) → **`RETURN`** the same "not available" text as step 4, `outcome: "unresolved"`, `reason: "agent_unavailable"`.
   - YES / `1` → SAY "Great! I'm glad to help. What would you like assistance with today?"

The flow only returns the transfer sentence. **Performing the transfer is the host's job**; no tool is called.

### Ends
`RETURN` (Live Connect link, cannot connect, not available, or transfer), or completion after the "Great!" SAY.

### Flowchart
```mermaid
graph TD
    start((Start)) --> get_live_connect{cargo.voice?}
    get_live_connect -->|not voice| fetch_live_connect_link[TOOL: get-live-connect-link]
    get_live_connect -->|voice| phone_channel[SET: live_connect_link = '']
    fetch_live_connect_link -.->|onFail| live_connect_unavailable[SET: live_connect_link = '']
    fetch_live_connect_link --> offer_live_connect{not voice + link?}
    live_connect_unavailable --> offer_live_connect
    phone_channel --> offer_live_connect
    offer_live_connect -->|yes| say_live_connect["RETURN: Live Connect link<br/>outcome: resolved"]
    offer_live_connect -->|no| cannot_connect{not voice, or no agent number and no agentHours?}
    cannot_connect -->|yes| say_cannot_connect["RETURN: can't connect + contact info<br/>outcome: resolved"]
    cannot_connect -->|no| check_agent_available{cargo.agentPhoneNumber?}
    check_agent_available -->|missing| no_agent_available["RETURN: not available + hours + offer to help<br/>outcome: unresolved"]
    check_agent_available -->|set| ask_user_choice[SAY-GET: 1 = stay with AI, 0 = agent]
    ask_user_choice --> normalize_choice[SET: normalize]
    normalize_choice --> handle_choice{YES or 1?}
    handle_choice -->|yes| continue_with_ai[SAY: Great, what can I help with]
    handle_choice -->|anything else| transfer{cargo.agentPhoneNumber?}
    transfer -->|set| confirm_transfer[RETURN: transferring you]
    transfer -->|missing| no_agents_available["RETURN: not available + hours + offer to help<br/>outcome: unresolved"]
    continue_with_ai --> stop((End))
```

---

## Tools

All eight are `local` tools. The host supplies the function named in `implementation.function` through `APPROVED_FUNCTIONS`. Their `parameters` use the flat form (a map of properties with no top-level `type`), so the engine calls the function with **positional arguments: the `required` names in order, then the remaining properties in definition order**. For these eight tools that order matches the `implementation.args` list shown; the engine itself does not read `implementation.args`.

Each tool declares `returns`, a JSON Schema of the value the CALL-TOOL `variable` receives. It is documentation, plus an optional warning when the host sets `engine.validateToolReturns = true`. The summaries below paraphrase each `returns`. Cargo fields the reference host (hy-rag) writes beyond what `returns` describes are noted as such.

`security.requiresAuth`, `auditLevel` and `dataClassification` are declarative. The engine enforces `security.rateLimit`.

### send-sms-otp
**Name**: Send SMS OTP - send an OTP code via SMS for authentication.  
**Implementation**: local `sendSMSOTP(accountSid, from, to, container, language)`, timeout 5000 ms. Rate limit: 5 per 300 s.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `accountSid` | string | yes | Twilio Account SID (the flows pass `null`) |
| `from` | string | yes | From phone number |
| `to` | string | yes | To phone number |
| `container` | object | yes | session cargo, where the OTP hash is stored |
| `language` | string | no | message language, e.g. `es`; omitted or unrecognised → English |

**Returns** a string: the lowercase hex SHA-256 (64 chars) of the 6-digit code, which is also written to `container.otpHash` along with `container.otpTimestamp`. The plaintext code is never returned. On the test-number path (`to` normalizes to `0000000000` or `+10000000000`) it is the hash of the fixed code `123456`. The flows do not store the result, and they detect failure through `onFail`.

Reference host: every send first clears `container.otpFailure` and `container.otpUndeliverableTo`, and records `container.otpSentOn` (`sms`, or `whatsapp` when the code went into the customer's WhatsApp chat). When the destination cannot receive a text, it sets `container.otpUndeliverableTo` to the number's last 10 digits and throws.

### send-email-otp
**Name**: Send Email OTP - send an OTP code via email for authentication.  
**Implementation**: local `sendEmailOTP(to, container, language)`, timeout 5000 ms. Rate limit: 5 per 300 s.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `to` | string | yes | email address |
| `container` | object | yes | session cargo, where the OTP hash is stored |
| `language` | string | no | as above |

**Returns** `undefined` on every real send (the function has no return statement). Only for the test account (`test@instantaiguru.com`, case-insensitive) does it return the 64-char hex SHA-256 of the fixed code `123456`, also stored in `container.otpHash`. It never returns an object. Treat the result as absent; the flows do not store it.

Reference host: records `container.otpSentOn = 'email'` and clears `container.otpFailure`.

### send-whatsapp-invite
**Name**: Send WhatsApp Invite - text the caller a wa.me link so they can finish authenticating on WhatsApp.  
**Implementation**: local `sendWhatsAppInvite(accountSid, from, to, inviteText, language, container)`, timeout 5000 ms. Rate limit: 5 per 300 s.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `accountSid` | string | yes | Twilio Account SID |
| `from` | string | yes | From phone number |
| `to` | string | yes | the caller's mobile that already received the OTP text |
| `inviteText` | string | no | wording from `global_whatsapp_invite` / `_es`. **Empty means the feature is off for this tenant**; there is no separate flag |
| `language` | string | no | session language |
| `container` | object | no | session cargo, used ONLY for the once-per-call latch `container.whatsappInvited` |

**Returns** a boolean. `true` only when the invite SMS was handed to Twilio. `false` on every skip and every error; the function never throws. It skips when: the latch `container.whatsappInvited` is already set; `inviteText` is empty or whitespace; `from` or `to` is missing; the tenant has no `config.wa-*` alias config, or that config has no usable `phone_number`. Any exception (e.g. a non-SMS line) also returns `false`.

### validate-otp
**Name**: Validate OTP - validate the OTP code entered by the user.  
**Implementation**: local `validateOTP(otp, container)`, timeout 5000 ms. Rate limit: 10 per 60 s.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `otp` | string | yes | the code |
| `container` | object | yes | session cargo holding `otpHash` / `otpTimestamp` |

**Returns** a boolean.
- `true` when `sha256(otp)` equals `container.otpHash` and the code is at most 10 minutes old. It then clears `otpHash` / `otpTimestamp` and sets `container.otpVerified = true` and `container.otpVerifiedAt`. **The flows read `cargo.otpVerified`, not the return value.**
- `false` when no code is stored.
- `false` when the code expired (the container is cleared and `otpVerified = false`).
- `false` on a hash mismatch (the container is left untouched, so the same code can be retried until validate-otp-code withdraws it at the cap).

Reference host: a refusal also sets `container.otpFailure` to `missing`, `expired` or `mismatch`, and a success clears it. validate-otp-code branches on it.

### set-user-name
**Name**: Set User Name - name the person in the conversation, e.g. the account holder's first name once a lookup found the account. From the next reply on, every message addresses them by it, on every channel, and the name is returned to the caller in `context.display_name`; a name a flow set outranks whatever the channel re-sends. An empty name clears it. No flow in this library calls it.  
**Implementation**: local `setUserName(name, container)`, timeout 5000 ms. No rate limit.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | the name to address the person by (a first name), or empty for none |
| `container` | object | yes | session cargo |

**Returns** a string: the name as stored, trimmed; `''` when none. Also sets `container.displayName` and `container.displayNameSetBy = 'flow'`.

### switch-to-sms
**Name**: Switch to SMS - switch communication to SMS and send a confirmation message.  
**Implementation**: local `switchToSMS(accountSid, threadId, from, to, message, userTurn)`, timeout 10000 ms. Rate limit: 10 per 60 s.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `accountSid` | string | yes | Twilio Account SID |
| `threadId` | string | yes | the thread to switch (the flow passes `{{sessionId}}`) |
| `from` | string | yes | From phone number |
| `to` | string | yes | To phone number |
| `message` | string | yes | SMS text |
| `userTurn` | string | no | the user side of the switch as the text thread records it ("Switch to text" / "Cambiar a texto"), written with `message` as one history pair |

**Returns** always the literal `true`. The chat context is re-saved under `<toNumber>-<dbPrefix>` with a fresh engine session carrying the old cargo, and the SMS is sent. Every failure (loading or saving the context, initializing the session, sending the SMS) is thrown, so `onFail` runs.

### send-twilio-sms
**Name**: Send Twilio SMS - send an SMS via Twilio. Called by [`send-text`](#sendtext), with `from`, `to` and `message` only.  
**Implementation**: local `sendTwilioSMS(accountSid, from, to, message, messageSid)`, timeout 10000 ms. Rate limit: 10 per 60 s.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `accountSid` | string | yes | Twilio Account SID |
| `from` | string | yes | From phone number |
| `to` | string | yes | To phone number |
| `message` | string | yes | SMS text |
| `messageSid` | string | no | optional message SID for tracking (default `""`) |

**Returns** a string: the Twilio Message `status` of the **last** part sent (a long message is split and the parts are sent in sequence). The value comes from Twilio, typically `queued`, or `accepted` via a Messaging Service. Failure: throws.

### get-live-connect-link
**Name**: Get Live Connect Link - the tenant's Live Connect guest link when Live Connect is enabled and an agent is online or reachable; `''` otherwise. Never throws.  
**Implementation**: local `getLiveConnectLink(container)`, timeout 5000 ms. Rate limit: 10 per 300 s.

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `container` | object | no | session cargo; annotated with `liveConnectOffered` when a link is returned |

**Returns** a string: the guest link (`{url}/?ref=<dbPrefix>`), or `''` when Live Connect is off, no agent is reachable, or the presence check fails.
