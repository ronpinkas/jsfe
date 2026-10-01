// DISPATCH — the step that ends every flow and routes THIS turn's input through intent detection,
// exactly as if no flow had been active when the user spoke.
//
//   npm run build && node tests/dispatch.test.mjs
//
// The contract pinned here:
// - A matched flow starts in the same turn; its output is the whole reply.
// - No match: the engine returns no response (null) and leaves no flow active — the host answers.
// - Everything is reset: nothing the ended flows queued is delivered, and DISPATCH declares no
//   outcome (an outcome stamped earlier this turn is cleared). Tool calls attempted this turn stay
//   recorded — the host's "never roll back a turn that attempted a tool" depends on them.
// - The input routed is the one the turn started with, never a flow variable a step rewrote.
// - The input is routed once per turn: a started flow reaching DISPATCH before any SAY-GET is an
//   invalid flow (the validator rejects it); at runtime the host answers that turn.
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
{
  const t = await session([menu([{ id: 'call', type: 'FLOW', value: 'Sub', callType: 'call' }]), pay, sub]);
  await t.say('Menu');
  await t.say('nothing matches this');
  eq(t.s.lastFlowOutcome, undefined, 'DISPATCH clears an outcome stamped earlier this turn and declares none');
  eq(markers(t.s.response), [], 'and the sub-flow\'s SAY is not delivered');
}
{
  const t = await session([menu([{ id: 'tool', type: 'CALL-TOOL', tool: 'fine', variable: 'r' }]), pay]);
  await t.say('Menu');
  const before = toolCalls;
  await t.say('Pay');
  eq(toolCalls - before, 1, 'the tool ran');
  eq((t.s.lastTurnToolCalls || []).map((c) => c.tool), ['fine'], 'a tool attempted before DISPATCH stays recorded for the host');
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
  const bad = flow('Bad', [{ id: 'early', type: 'DISPATCH' }]);
  const e = new WorkflowEngine(quiet, null, [bad], tools, APPROVED_FUNCTIONS, {}, false, 'en');
  ok(e.validateFlow('Bad').errors.some((m) => /"early".*before any SAY-GET/.test(m)), 'DISPATCH before any SAY-GET in a primary flow is an error');
}
{
  const inner = flow('Inner', [{ id: 'deep', type: 'DISPATCH' }], { primary: false });
  for (const callType of ['call', 'replace', 'reboot']) {
    const outer = flow('Outer', [{ id: 'go', type: 'FLOW', value: 'Inner', callType }]);
    const e = new WorkflowEngine(quiet, null, [outer, inner], tools, APPROVED_FUNCTIONS, {}, false, 'en');
    ok(e.validateFlow('Outer').errors.some((m) => /"deep" in flow "Inner".*"Outer"/.test(m)), `a DISPATCH reached through a ${callType} before any SAY-GET is an error`);
  }
}
{
  const inner = flow('Inner', [{ id: 'deep', type: 'DISPATCH' }], { primary: false });
  const e = new WorkflowEngine(quiet, null, [inner], tools, APPROVED_FUNCTIONS, {}, false, 'en');
  const outer = flow('Outer', [{ id: 'go', type: 'FLOW', value: 'Inner', callType: 'call' }]);
  e.flowsMenu.push(outer);
  ok(e.validateFlow('Inner').errors.every((m) => !/before any SAY-GET/.test(m)), 'a non-primary flow is not itself an entry point');
}
{
  const branchy = flow('Branchy', [
    { id: 'c', type: 'CASE', branches: {
      'condition: cargo.x': { id: 'ask', type: 'SAY-GET', variable: 'y', value: '[ask]' },
      default: { id: 'say', type: 'SAY', value: '[say]' } } },
    { id: 'late', type: 'DISPATCH' },
  ]);
  const e = new WorkflowEngine(quiet, null, [branchy], tools, APPROVED_FUNCTIONS, {}, false, 'en');
  ok(e.validateFlow('Branchy').errors.some((m) => /"late"/.test(m)), 'a branch that skips the SAY-GET reaches DISPATCH: error');
}
{
  const withOutcome = flow('WithOutcome', [
    { id: 'ask', type: 'SAY-GET', variable: 'y', value: '[ask]' },
    { id: 'd', type: 'DISPATCH', outcome: 'unresolved' },
  ]);
  const e = new WorkflowEngine(quiet, null, [withOutcome], tools, APPROVED_FUNCTIONS, {}, false, 'en');
  ok(e.validateFlow('WithOutcome').errors.some((m) => /DISPATCH step "d".*"outcome"/.test(m)), 'DISPATCH never takes an outcome (or any attribute)');
}

console.log(`dispatch: ${checks} checks passed`);
