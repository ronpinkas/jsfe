// Queued SAY text across a reboot and at a RETURN. Defaults are unchanged; each alternate is an explicit attribute:
// - reboot keeps the text queued before it (delivered with the new flow's output); `discardSay: true` drops it.
// - RETURN does not deliver queued text; `keepSay: true` delivers it ahead of the value. RETURN '' always hands
//   the turn to the host.
//
//   npm run build && node tests/return-queued.test.mjs
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

let checks = 0;
const eq = (a, b, what) => { assert.deepEqual(a, b, what); checks++; };
const quiet = { info() {}, debug() {}, warn() {}, error() {} };
const flow = (id, steps, extra = {}) => ({ id, name: id, description: id, version: '1.0.0', primary: true, steps, ...extra });
const tools = [{ id: 'boom', name: 'boom', description: 'boom', parameters: { type: 'object', properties: {} },
  implementation: { type: 'local', function: 'boom', timeout: 2000 } }];
const APPROVED = { boom: async () => { throw new Error('down'); } };

const flows = [
  flow('Own', [{ id: 's', type: 'SAY', value: '[said]' }, { id: 'r', type: 'RETURN', value: "'[returned]'" }]),
  flow('OwnKeep', [{ id: 's', type: 'SAY', value: '[said]' }, { id: 'r', type: 'RETURN', value: "'[returned]'", keepSay: true }]),
  flow('EmptyKeep', [{ id: 's', type: 'SAY', value: '[said]' }, { id: 'r', type: 'RETURN', value: "''", keepSay: true }]),
  flow('ToAsk', [{ id: 's', type: 'SAY', value: '[before reboot]' }, { id: 'f', type: 'FLOW', value: 'Ask', callType: 'reboot' }]),
  flow('ToAskDiscard', [{ id: 's', type: 'SAY', value: '[before reboot]' }, { id: 'f', type: 'FLOW', value: 'Ask', callType: 'reboot', discardSay: true }]),
  flow('ToKeep', [{ id: 's', type: 'SAY', value: '[before reboot]' }, { id: 'f', type: 'FLOW', value: 'Keep', callType: 'reboot' }]),
  flow('ToPlain', [{ id: 's', type: 'SAY', value: '[before reboot]' }, { id: 'f', type: 'FLOW', value: 'Plain', callType: 'reboot' }]),
  flow('ToolFails', [{ id: 's', type: 'SAY', value: '[before failure]' },
    { id: 't', type: 'CALL-TOOL', tool: 'boom', variable: 'x', onFail: { id: 'of', type: 'FLOW', value: 'Ask', callType: 'reboot' } }]),
  flow('ToolFailsDiscard', [{ id: 's', type: 'SAY', value: '[before failure]' },
    { id: 't', type: 'CALL-TOOL', tool: 'boom', variable: 'x', onFail: { id: 'of', type: 'FLOW', value: 'Ask', callType: 'reboot', discardSay: true } }]),
  flow('Ask', [{ id: 'a', type: 'SAY-GET', variable: 'v', value: '[asked]' }], { primary: false }),
  flow('Keep', [{ id: 'r', type: 'RETURN', value: "'[target returned]'", keepSay: true }], { primary: false }),
  flow('Plain', [{ id: 'r', type: 'RETURN', value: "'[target returned]'" }], { primary: false }),
];

async function turn(content) {
  const e = new WorkflowEngine(quiet, null, flows, tools, APPROVED, {}, false, 'en');
  let s = e.initSession('u', `t-${Math.random()}`);
  s = await e.updateActivity({ role: 'user', content, timestamp: Date.now() }, s);
  return s.response ?? null;
}
const has = (r, m) => String(r ?? '').includes(m);

// RETURN
eq(await turn('Own'), '[returned]', 'RETURN default: queued text not delivered (unchanged)');
eq(await turn('OwnKeep'), '[said]\n\n[returned]', 'RETURN keepSay: queued text ahead of the value');
const empty = await turn('EmptyKeep');
eq(empty === null || empty === '', true, "RETURN '' hands the turn to the host, keepSay or not");
eq(await turn('ToKeep'), '[before reboot]\n\n[target returned]', 'keepSay delivers text queued before a reboot into its flow');
eq(await turn('ToPlain'), '[target returned]', 'without keepSay the rebooted-into RETURN delivers its value only (unchanged)');

// reboot
let r = await turn('ToAsk');
eq(has(r, '[before reboot]') && has(r, '[asked]'), true, 'reboot default: queued text delivered with the new flow (unchanged)');
r = await turn('ToAskDiscard');
eq(!has(r, '[before reboot]') && has(r, '[asked]'), true, 'reboot discardSay: the new flow starts with nothing queued');
r = await turn('ToolFails');
eq(has(r, '[before failure]') && has(r, '[asked]'), true, 'onFail reboot default: queued text delivered (unchanged)');
r = await turn('ToolFailsDiscard');
eq(!has(r, '[before failure]') && has(r, '[asked]'), true, 'onFail reboot discardSay: dropped');
console.log(`queued-say: ${checks} checks passed`);
