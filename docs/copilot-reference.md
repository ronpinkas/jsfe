# JSFE reference for flow authors

What a flow author (and the Flow Designer's CoPilot, which reads this file from the published package) needs to know about the engine itself. A host's own platform — its cargo fields, functions and system flows — is described by that host.

## JSFE Architecture

JSFE is a stack-of-stacks interpreter that executes flows as a plugin in its host site, mediating between a User and a Conversational AI. Flows can be marked as PRIMARY, in which case their description is forwarded (in a menu-like form) to an intent-detection AI to determine whether the most recent user prompt should trigger execution of one of them.

## Flow Structure

A flow is a JSON object with:
- id (string): unique kebab-case identifier
- name (string): PascalCase display name
- version (string): semver
- description (string): CRITICAL — the ONLY text the intent-detection AI reads to decide activation. Must clearly state what SHOULD trigger this flow AND what SHOULD NOT. Include trigger phrases and explicitly negate similar-but-wrong intents.
- prompt / prompt_es (string): short UI label (e.g. "Payment"), NOT a trigger phrase. Used for display: "Flow {prompt} completed"
- primary (boolean): if true, the intent-detection AI can directly activate this flow from user input. If false, the flow is a sub-flow only reachable via FLOW steps from other flows.
- parameters (array): values the AI extracts from the user's message on activation, e.g. [{ name: "acct_number", type: "string", description: "..." }]
  - enum (string[], optional, string parameters only): the allowed values, e.g. { name: "ticket_type", type: "string", description: "...", enum: ["Fraud", "Cancellation"] }. A reply matching ignoring case becomes the declared spelling; any other value is dropped, so the flow must still ask for it (keep the SAY-GET). Declare one whenever the values are a closed set. Values: non-empty, no leading/trailing spaces, unique ignoring case.
- variables (object): flow-scoped variables { varName: { type, description, value? } } — local to this flow instance
- scope (string, optional): "isolated" makes the flow a self-contained worker: a call (or replace) starts it with ONLY its declared variables and the parameters actually passed (an omitted parameter is undefined, never the caller's or a previous call's value), and its variables never reach the caller — return results through cargo. Default "shared": the caller's variables, by reference. Use "isolated" for generic workers called from many flows.
- steps (array): ordered list of step objects
- comments (string, optional): NOT a flow property — placed on the response wrapper object only

## Step Types

SAY — Outputs the literal string of its VALUE (English) or the respective VALUE_{language-code} (like value_es), which may include {{}} interpolation placeholders that evaluate any valid JavaScript expression. SAY output messages accumulate until the next wait-state (SAY-GET), which will then relay the combined message to the user.

SAY-GET — Same as SAY, but immediately returns control to the user to collect the next prompt into its named VARIABLE property. May include a digits constraint for DTMF input { min, max, autoSubmitChars?, autoSubmitMs? }; on voice a fitting answer is stored as its digits, and on a one-key question (max 1) only an answer that is exactly one key counts as that key. asSpoken: true (or a condition on the flow's variables) stores a voice answer exactly as heard: never reduced to its digits and never sent to the AI voice cleanup. Use it ONLY where that cleanup would lose meaning, such as an amount ("$1" must not become the keypad key 1). Leave it off for names, emails, phone, card and account numbers, codes and yes/no answers: the cleanup is what removes filler ("um, it's Ron") and writes spoken emails and numbers correctly.

SET — Evaluates the JavaScript expression in its VALUE property and assigns the result to its named VARIABLE. Can also produce side-effects on cargo (session state) via expressions like cargo.accountNumber = acct_number.

CASE — Branching mechanism with multiple CONDITION nodes. Each condition key is prefixed with "condition:" followed by a JavaScript expression. Each condition node contains a SINGLE STEP to execute if its expression evaluates to true. A "default" branch is executed if no conditions match. Branch evaluation order matters — first match wins.

SWITCH — Similar to CASE, but branching is based on the value of a single VARIABLE that is evaluated once, then matched against multiple case values. Each case node contains a SINGLE STEP.

FLOW — A jump/goto-like mechanism that forwards control to another flow using one of three call types:
1. call — Equivalent to a typical function call. The callee runs and then returns control to the caller flow's next step. Variable scope is inherited — the child can read and modify the caller's variables.
2. replace — Replaces the current stack frame, removing the caller flow from the stack and proceeding at the first step of the target flow. Inherits the same scope as the replaced flow. If the caller itself was a callee, then when the replacing flow terminates it returns to the original caller (stack-of-stacks semantics).
3. reboot — Clears the entire stack of stacks and starts the target flow from its first step as a fresh execution context. Only explicitly passed parameters are available; all other state is cleared (except cargo). SAY text queued before the reboot is delivered with the new flow's output; discardSay: true drops it.
FLOW steps may include a parameters object to pass values: { "retry_flow": "{{retry_flow}}" }.

CALL-TOOL — Invokes either a locally defined function (must be in the APPROVED_FUNCTIONS set), or a REST API endpoint. Either must be defined in the toolsRegistry array following the tool definition schema. Includes tool (tool ID), variable (store result), args (template expressions), and an optional onFail node containing a SINGLE STEP to execute if the tool call fails.

RETURN — Unconditionally terminates execution of the entire stack of stacks (full reset), returning control to the JSFE host. The result of evaluating its VALUE expression is returned to the host. If that expression evaluates to '' (empty string), the host will proceed to process the last user prompt that was forwarded to JSFE as input — effectively forwarding to the host AI/RAG. SAY text queued before a RETURN is NOT delivered unless keepSay: true, which delivers it ahead of the value.

END — Returns from the current flow only, resuming its caller at the step after the FLOW call — a functional return, with no value (a callee shares its caller's variables unless it is isolated; results travel through cargo). In a flow nobody called, it simply ends the flow.

DISPATCH — Ends every flow (all stacks, and any SAY output not yet delivered) and routes the user's input for THIS turn through intent detection, exactly as if no flow had been active: a matching flow starts in the same turn, otherwise the host AI/RAG answers. Takes an id and optionally outcome/reason (no value): the ended flows' outcome reaches the host only when no flow matches. Use it right after a SAY-GET whose answer may really be a new request — e.g. the "default" branch of a menu's CASE, or the answer to "Anything else?" — so the user can move from flow to flow.

Declared outcome — the step that ends a flow (RETURN, END, DISPATCH or a final SAY) may carry outcome and reason (both accept {{}}): "unresolved" (the user's need was not met; the flow's transaction is marked failed), "deflected" (a decoy flow absorbed a false-positive intent by design), "resolved" (informational). An outcome that interpolates to empty declares nothing. The host reads it to recover from an unresolved ending.

## Cargo — Session-Persistent State

cargo is a session-level object that persists across ALL flows within a chat session. Unlike flow variables which reset on each flow activation, cargo survives flow boundaries, reboots, and returns.

Cargo side-effect pattern — use SET with a dummy variable:
{ "type": "SET", "variable": "side_effect", "value": "cargo.accountNumber = acct_number" }

Multiple assignments MUST use comma operator, NEVER semicolons (semicolons terminate the expression):
{ "type": "SET", "variable": "side_effect", "value": "cargo.support_context = 'payment', cargo.support_context_es = 'pago'" }

## Variables vs Cargo

- Flow variables are LOCAL to the flow instance, BUT:
  - Can be populated via parameters when activated by AI or called by another flow
  - Are inherited by child flows called with callType "call"
  - Set by SET or SAY-GET in PRECEDING steps of the current flow
- cargo is SESSION-GLOBAL — always available, persists across all flow boundaries
- When a value could come from either source, use: parameterName || cargo.sameName
  Example: "value": "acct_number || cargo.accountNumber"

## Best Practices

1. JSFE is explicitly designed to promote re-use of small worker flows as sub-flows via call/replace/reboot FLOW steps. Prefer composing small, focused flows over building large monolithic ones.
2. JSFE intentionally restricts logical branches (CASE, SWITCH) and onFail handlers to a SINGLE STEP, to encourage composition via named sub-flows instead of long, unnamed step lists.
3. Flows advance to the next STEP unconditionally until the end of the flow; therefore, the only valid ways to terminate a flow early are: an END step (back to the caller), a FLOW step with replace or reboot callType, a RETURN step, or a DISPATCH step.
4. Before asking the user for information, check if it's already available in cargo from a prior interaction. Use CASE at the top of the flow to detect and skip redundant collection.
5. After collecting key info, store it in cargo via SET side-effects so subsequent flows don't re-ask.
6. A menu key counts only as the whole answer: compare it exactly (answer.trim() === '1'), never test for a digit inside the answer ("I want to pay 1" is not a key press). On voice, give a one-key question digits { min: 1, max: 1 } and the engine does the same.
7. FLOW steps must reference flows that EXIST. If your flow needs a sub-flow that doesn't exist yet, include it in your response.

## Patterns to Avoid

1. SAY in an onFail handler — An onFail with a SAY step will display the error message but then continue to the next step, typically leading to unintended behavior. Use FLOW with reboot to a handler, or RETURN.
2. SAY in a CASE/SWITCH branch — A branch whose only step is SAY will continue execution into the following step. If the flow should terminate at that point, follow it with END (back to the caller) or use RETURN (with a language-aware expression), or FLOW with reboot.
3. Referencing non-existent flows — Every FLOW step value must be a flow ID that exists. Return an array of flows if new sub-flows are needed.
