// Host contract test: lastTurnToolCalls, and why a host must never roll back a turn that
// attempted a tool. Reproduces the shape of a real production double charge (2026-09-12):
// a caller confirmed a payment, the host abandoned that turn mid-charge and restored the
// pre-turn session, and the caller's repeated "confirm" charged the card again.
//
//   npm run build && node tests/host-tool-calls.test.mjs
//
// Hermetic: aiCallback is null (flows match by id/name), the tool is a local function.
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

const quiet = { info() {}, debug() {}, warn() {}, error() {} };

let charges = 0;
const APPROVED_FUNCTIONS = {
  chargeProfile: async () => {
    charges++;
    return { TransId: `T${charges}` };
  },
};

const toolsRegistry = [{
  id: 'ChargeProfile',
  name: 'Charge Profile',
  description: 'Charges the customer payment profile',
  parameters: { type: 'object', properties: {}, additionalProperties: true },
  implementation: { type: 'local', function: 'chargeProfile', timeout: 5000 },
}];

const flowsMenu = [{
  id: 'PayNow',
  name: 'PayNow',
  description: 'Pay the balance now',
  version: '1.0.0',
  steps: [
    { id: 'ask-confirm', type: 'SAY-GET', value: 'Say CONFIRM to pay now.', variable: 'confirm' },
    { id: 'charge', type: 'CALL-TOOL', tool: 'ChargeProfile', variable: 'charge' },
    { id: 'ask-receipt', type: 'SAY-GET', value: 'Your payment was processed. Would you like a text receipt?', variable: 'receipt' },
    { id: 'done', type: 'SAY', value: 'Thank you.' },
  ],
}];

const engine = new WorkflowEngine(quiet, null, flowsMenu, toolsRegistry, APPROVED_FUNCTIONS, {}, false, 'en');
const user = (content) => ({ role: 'user', content, timestamp: Date.now() });
const clone = (s) => JSON.parse(JSON.stringify(s));

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };
const eq = (a, b, what) => { assert.equal(a, b, what); checks++; };

// ── 1. The field exists, is per-turn, and records attempts ───────────────────
{
  let s = engine.initSession('u1', 'thread-1');
  s = await engine.updateActivity(user('PayNow'), s);
  ok(Array.isArray(s.lastTurnToolCalls), 'lastTurnToolCalls is an array after every updateActivity');
  eq(s.lastTurnToolCalls.length, 0, 'activating the flow and asking to confirm attempts no tool');

  charges = 0;
  s = await engine.updateActivity(user('confirm'), s);
  eq(charges, 1, 'confirm charges once');
  eq(s.lastTurnToolCalls.length, 1, 'the charge is recorded on the turn that attempted it');
  eq(s.lastTurnToolCalls[0].tool, 'Charge Profile', 'the record names the tool');
  eq(s.lastTurnToolCalls[0].implementation, 'local', 'and its implementation type');

  s = await engine.updateActivity(user('no thanks'), s);
  eq(s.lastTurnToolCalls.length, 0, 'the record is one-shot: the next turn starts empty');
}

// ── 2. The defect: restoring a pre-turn snapshot after a tool ran ────────────
{
  let s = engine.initSession('u2', 'thread-2');
  s = await engine.updateActivity(user('PayNow'), s);
  const beforeConfirm = clone(s);            // what a host snapshots before the turn

  charges = 0;
  const afterConfirm = await engine.updateActivity(user('confirm'), s);
  eq(charges, 1, 'turn 1 charged');
  ok(afterConfirm.lastTurnToolCalls.length > 0, 'and says so');

  // WRONG host: the turn was cancelled, so it restores the pre-turn snapshot...
  let restored = clone(beforeConfirm);
  // ...and the caller's repeated "confirm" meets the confirmation question again.
  restored = await engine.updateActivity(user('confirm'), restored);
  eq(charges, 2, 'restoring a snapshot taken before a tool call re-runs the tool: a DOUBLE CHARGE');
}

// ── 3. The contract: keep the session a tool-attempting turn returned ────────
{
  let s = engine.initSession('u3', 'thread-3');
  s = await engine.updateActivity(user('PayNow'), s);

  charges = 0;
  s = await engine.updateActivity(user('confirm'), s);
  const mayRollBack = s.lastTurnToolCalls.length === 0;
  eq(mayRollBack, false, 'a host must not roll back this turn');

  // RIGHT host: keeps the returned session, so the repeated "confirm" answers the receipt question.
  s = await engine.updateActivity(user('confirm'), s);
  eq(charges, 1, 'keeping the returned session charges exactly once');
  eq(s.lastTurnToolCalls.length, 0, 'and the repeated input attempts no tool');
}

console.log(`host-tool-calls: ${checks} checks passed`);
