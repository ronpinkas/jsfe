// DISPATCH — the step that ends every flow and routes THIS turn's input through intent detection,
// exactly as if no flow had been active when the user spoke.
//
//   npm run build && node tests/dispatch.test.mjs
//
// The contract pinned here:
// - A matched flow starts in the same turn; its output is the whole reply.
// - No match: the engine returns no response (null) and leaves no flow active — the host answers.
// - Everything is reset: nothing the ended flows queued is delivered. Tool calls attempted this
//   turn stay recorded — the host's "never roll back a turn that attempted a tool" depends on them.
// - Outcome: the ended flows finalize like any terminating flow (endedBy 'dispatch'), including an
//   `outcome`/`reason` on the DISPATCH step itself (interpolated). No match: that outcome reaches
//   the host. A match: it is swallowed — the user is being served.
// - The input routed is the one the turn started with, never a flow variable a step rewrote.
// - The input is routed once per turn: a started flow reaching DISPATCH before any SAY-GET (with no
//   question in between) is not routed again — the host answers that turn. Across turns there is no
//   limit: each answer to a question may start another flow.
//
// Hermetic: aiCallback is null, so intent detection matches a flow by its exact name or id.
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

let checks = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const ok = (v, what) => { assert.ok(v, what); checks++; };

const errors = [];
const quiet = { info() {}, debug() {}, warn() {}, error(...a) { errors.push(a.join(' ')); } };
let toolCalls = 0;
const APPROVED_FUNCTIONS = { fine: async () => { toolCalls++; return { success: true }; } };
const tools = [{ id: 'fine', name: 'fine', description: 'fine',
  parameters: { type: 'object', properties: {}, additionalProperties: true },
  implementation: { type: 'local', function: 'fine', timeout: 2000 } }];

const flow = (id, steps, extra = {}) => ({ id, name: id, description: id, version: '1.0.0', primary: true, steps, ...extra });
const markers = (s) => String(s ?? '').match(/\[[^\]]+\]/g) || [];
const active = (s) => (s.flowStacks || []).flat().filter(Boolean).map((f) => f.flowName);

// The retry menu's shape: ask, then dispatch an answer that matches no choice.
const menu = (before = []) => flow('Menu', [
  { id: 'ask', type: 'SAY-GET', variable: 'choice', value: '[menu prompt]' },
  ...before,
  { id: 'route', type: 'CASE', branches: {
    "condition: choice === 'yes'": { id: 'again', type: 'SAY-GET', variable: 'x', value: '[retried]' },
    default: { id: 'dispatch_unrecognised', type: 'DISPATCH' } } },
]);
const pay = flow('Pay', [
  { id: 'intro', type: 'SAY', value: '[pay intro]' },
  { id: 'amount', type: 'SAY-GET', variable: 'amount', value: '[pay prompt]' },
]);
const sub = flow('Sub', [{ id: 's', type: 'SAY', value: '[sub said]', outcome: 'unresolved', reason: 'r' }], { primary: false });

async function session(flows) {
  const e = new WorkflowEngine(quiet, null, flows, tools, APPROVED_FUNCTIONS, {}, false, 'en');
  let s = e.initSession('u', `t-${Math.random()}`);
  const say = async (content) => (s = await e.updateActivity({ role: 'user', content, timestamp: Date.now() }, s));
  return { e, say, get s() { return s; } };
}

// ── A matched flow starts in the same turn ──────────────────────────────────────────────────────
{
  const t = await session([menu(), pay]);
  await t.say('Menu');
  eq(markers(t.s.response), ['[menu prompt]'], 'the menu asks');
  await t.say('Pay');
  eq(markers(t.s.response), ['[pay intro]', '[pay prompt]'], 'DISPATCH: the matched flow starts this turn and is the whole reply');
  eq(active(t.s), ['Pay'], 'only the dispatched-to flow is active');
  eq(t.s.lastTurnDispatch, { fromFlow: 'Menu', matchedFlow: 'Pay' }, 'the turn records the dispatch');
  const direct = await session([menu(), pay]);
  await direct.say('Pay');
  eq(t.s.response, direct.s.response, 'a dispatched start replies exactly as starting the flow directly does');
  await t.say('42');
  eq(t.s.lastTurnDispatch, undefined, 'the dispatch record is one-shot');
}

// ── No match: the host answers ──────────────────────────────────────────────────────────────────
{
  const t = await session([menu(), pay]);
  await t.say('Menu');
  await t.say('something else entirely');
  eq(t.s.response, null, 'no flow matched: the engine returns no response');
  eq(active(t.s), [], 'and leaves no flow active');
  eq(t.s.lastTurnDispatch, { fromFlow: 'Menu', matchedFlow: null }, 'the dispatch is recorded with no match');
  eq(t.s.globalAccumulatedMessages, [], 'nothing is left queued');
}

// ── An explicit choice still takes its branch ───────────────────────────────────────────────────
{
  const t = await session([menu(), pay]);
  await t.say('Menu');
  await t.say('yes');
  eq(markers(t.s.response), ['[retried]'], 'a recognised answer never dispatches');
  eq(t.s.lastTurnDispatch, undefined, 'and records no dispatch');
}

// ── Everything is reset ─────────────────────────────────────────────────────────────────────────
{
  const t = await session([menu([{ id: 'stale', type: 'SAY', value: '[stale]' }]), pay]);
  await t.say('Menu');
  await t.say('Pay');
  const direct = await session([pay]);
  await direct.say('Pay');
  eq(t.s.response, direct.s.response, 'a SAY queued before DISPATCH is dropped: the reply is exactly a direct start\'s');
}
{
  const t = await session([menu([{ id: 'stale', type: 'SAY', value: '[stale]' }]), pay]);
  await t.say('Menu');
  await t.say('nothing matches this');
  eq(t.s.response, null, 'and with no match it is dropped too — the host answers alone');
  eq(t.s.globalAccumulatedMessages, [], 'with nothing left queued for a later turn');
}
// ── Outcome: kept when nothing matches, swallowed when a flow matches ───────────────────────────
{
  const t = await session([menu([{ id: 'call', type: 'FLOW', value: 'Sub', callType: 'call' }]), pay, sub]);
  await t.say('Menu');
  await t.say('nothing matches this');
  eq(t.s.lastFlowOutcome?.outcome, 'unresolved', 'no match: an outcome declared earlier this turn reaches the host');
  eq(markers(t.s.response), [], 'and the sub-flow\'s SAY is still not delivered');
}
{
  const t = await session([menu([{ id: 'call', type: 'FLOW', value: 'Sub', callType: 'call' }]), pay, sub]);
  await t.say('Menu');
  await t.say('Pay');
  eq(t.s.lastFlowOutcome, undefined, 'a match swallows the ended flows\' outcome');
}
const declaring = (outcome, reason) => flow('Menu', [
  { id: 'ask', type: 'SAY-GET', variable: 'choice', value: '[menu prompt]' },
  { id: 'route', type: 'CASE', branches: {
    "condition: choice === 'yes'": { id: 'again', type: 'SAY-GET', variable: 'x', value: '[retried]' },
    default: { id: 'dispatch_unrecognised', type: 'DISPATCH', outcome, ...(reason !== undefined ? { reason } : {}) } } },
], { variables: { why: { type: 'string', value: 'lookup_failed' }, none: { type: 'string', value: '' } } });
{
  const t = await session([declaring('unresolved', 'retry_declined'), pay]);
  await t.say('Menu');
  await t.say('nothing matches this');
  eq(t.s.lastFlowOutcome, { flowName: 'Menu', outcome: 'unresolved', reason: 'retry_declined', endedBy: 'dispatch' },
    'no match: the DISPATCH step\'s own outcome is stamped, endedBy dispatch');
}
{
  const t = await session([declaring('unresolved', 'retry_declined'), pay]);
  await t.say('Menu');
  await t.say('Pay');
  eq(t.s.lastFlowOutcome, undefined, 'a match swallows the DISPATCH step\'s own outcome too');
}
{
  const t = await session([declaring('unresolved', '{{why}}'), pay]);
  await t.say('Menu');
  await t.say('nothing matches this');
  eq(t.s.lastFlowOutcome?.reason, 'lookup_failed', 'reason interpolates flow variables (a caller can pass its failure reason in)');
}
{
  const t = await session([declaring('{{none}}', 'x'), pay]);
  await t.say('Menu');
  await t.say('nothing matches this');
  eq(t.s.lastFlowOutcome, undefined, 'an outcome that interpolates to empty is no declaration');
}
{
  const t = await session([menu([{ id: 'tool', type: 'CALL-TOOL', tool: 'fine', variable: 'r' }]), pay]);
  await t.say('Menu');
  const before = toolCalls;
  await t.say('Pay');
  eq(toolCalls - before, 1, 'the tool ran');
  eq((t.s.lastTurnToolCalls || []).map((c) => c.tool), ['fine'], 'a tool attempted before DISPATCH stays recorded for the host');
}

// ── outcome/reason interpolation is shared by every terminal step ───────────────────────────────
{
  const giveUp = flow('GiveUp', [
    { id: 'set', type: 'SET', variable: 'why', value: "'otp_retries_exhausted'" },
    { id: 'r', type: 'RETURN', value: "''", outcome: 'unresolved', reason: '{{why}}' },
  ]);
  const t = await session([giveUp]);
  await t.say('GiveUp');
  eq(t.s.lastFlowOutcome?.reason, 'otp_retries_exhausted', 'a RETURN\'s reason interpolates too');
  const literal = flow('Literal', [{ id: 'r', type: 'RETURN', value: "''", outcome: 'unresolved', reason: 'auth_prompt_off_topic' }]);
  const u = await session([literal]);
  await u.say('Literal');
  eq(u.s.lastFlowOutcome, { flowName: 'Literal', outcome: 'unresolved', reason: 'auth_prompt_off_topic', endedBy: 'return' }, 'a literal outcome is unchanged');
}

// ── The routed input is the turn's own, not a rewritten variable ────────────────────────────────
{
  const t = await session([menu([{ id: 'rewrite', type: 'SET', variable: 'choice', value: "'zzz'" }]), pay]);
  await t.say('Menu');
  await t.say('Pay');
  eq(t.s.lastTurnDispatch, { fromFlow: 'Menu', matchedFlow: 'Pay' }, 'intent detection sees the turn\'s input even after the flow rewrote its variable');
}

// ── Routed once per turn: an invalid started flow does not dispatch again ───────────────────────
{
  const bad = flow('Bad', [{ id: 'early', type: 'DISPATCH' }]);
  const t = await session([menu(), pay, bad]);
  await t.say('Menu');
  errors.length = 0;
  await t.say('Bad');
  eq(t.s.response, null, 'a started flow reaching DISPATCH before any SAY-GET: the host answers');
  eq(active(t.s), [], 'with no flow left active');
  ok(errors.some((m) => /before any SAY-GET/.test(m)), 'and the invalid flow is logged as an error');
  eq(t.s.lastTurnDispatch, { fromFlow: 'Menu', matchedFlow: 'Bad' }, 'the one routing that happened is recorded');
}

// ── Validator ───────────────────────────────────────────────────────────────────────────────────
{
  const e = new WorkflowEngine(quiet, null, [menu(), pay], tools, APPROVED_FUNCTIONS, {}, false, 'en');
  const errs = e.validateFlow('Menu').errors;
  eq(errs.filter((m) => /DISPATCH/.test(m)), [], 'DISPATCH after a SAY-GET is valid');
}
{
  // The design-time "DISPATCH before any SAY-GET" check was removed (2026-10-01): it reads structure,
  // not conditions, and flagged paths that cannot happen. The runtime rule (one routing per turn,
  // above) is what keeps a turn from re-routing itself.
  const bad = flow('Bad', [{ id: 'early', type: 'DISPATCH' }]);
  const e = new WorkflowEngine(quiet, null, [bad], tools, APPROVED_FUNCTIONS, {}, false, 'en');
  eq(e.validateFlow('Bad').errors.filter((m) => /SAY-GET/.test(m)), [], 'the validator does not judge where a DISPATCH sits');
}

// ── Flows in a row: each answer to "anything else?" starts the next flow ─────────────────────────
{
  const chained = (id) => flow(id, [
    { id: 'work', type: 'SAY', value: `[${id} done]` },
    { id: 'more', type: 'SAY-GET', variable: 'answer', value: '[anything else?]' },
    { id: 'route', type: 'CASE', branches: {
      "condition: answer === 'no'": { id: 'bye', type: 'RETURN', value: "'[bye]'" },
      default: { id: 'next', type: 'DISPATCH' } } },
  ]);
  const t = await session([chained('A'), chained('B'), chained('C')]);
  await t.say('A');
  eq(markers(t.s.response), ['[A done]', '[anything else?]'], 'flow A runs and asks');
  await t.say('B');
  eq([markers(t.s.response), t.s.lastTurnDispatch], [['[B done]', '[anything else?]'], { fromFlow: 'A', matchedFlow: 'B' }], 'its answer starts B, which runs and asks');
  await t.say('C');
  eq([markers(t.s.response), t.s.lastTurnDispatch], [['[C done]', '[anything else?]'], { fromFlow: 'B', matchedFlow: 'C' }], 'and B\'s answer starts C — no limit across turns');
  await t.say('no');
  eq(markers(t.s.response), ['[bye]'], 'until the user is done');
}
{
  const withOutcome = flow('WithOutcome', [
    { id: 'ask', type: 'SAY-GET', variable: 'y', value: '[ask]' },
    { id: 'd', type: 'DISPATCH', outcome: 'unresolved', reason: 'r' },
  ]);
  const e = new WorkflowEngine(quiet, null, [withOutcome], tools, APPROVED_FUNCTIONS, {}, false, 'en');
  eq(e.validateFlow('WithOutcome').errors.filter((m) => /DISPATCH step "d"/.test(m)), [], 'DISPATCH may declare outcome and reason');
}
{
  const withValue = flow('WithValue', [
    { id: 'ask', type: 'SAY-GET', variable: 'y', value: '[ask]' },
    { id: 'd', type: 'DISPATCH', value: "'x'" },
  ]);
  const e = new WorkflowEngine(quiet, null, [withValue], tools, APPROVED_FUNCTIONS, {}, false, 'en');
  ok(e.validateFlow('WithValue').errors.some((m) => /DISPATCH step "d".*"value"/.test(m)), 'any other attribute (e.g. value) is an error');
}

console.log(`dispatch: ${checks} checks passed`);
