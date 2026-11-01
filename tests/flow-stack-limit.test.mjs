// The flow stack: past 24 frames a WARN names the path, past 32 the engine stops (owner 2026-11-01; prod 2026-10-31
// CAb8305a56a6 hit the former limit of 20 on one re-entry of the identity gate).
//
//   npm run build && node tests/flow-stack-limit.test.mjs
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

function nested(depth) {
   const flows = [];
   for (let i = 1; i <= depth; i++) {
      flows.push({ id: `level-${i}`, name: `Level${i}`, version: '1.0.0', description: `level ${i}`,
         steps: i < depth ? [{ id: `call_${i}`, type: 'FLOW', value: `level-${i + 1}`, callType: 'call' }] : [{ id: 'bottom', type: 'SAY', value: 'bottom reached' }] });
   }
   return flows;
}
async function run(depth) {
   const warns = [], errors = [];
   const logger = { debug() {}, info() {}, warn: (...a) => warns.push(a.join(' ')), error: (...a) => errors.push(a.join(' ')) };
   const engine = new WorkflowEngine(logger, async () => 'None', nested(depth), [], {}, {});
   const session = engine.initSession('fixture', crypto.randomUUID(), 'en');
   let reply = '', thrown = '';
   try {
      const next = await engine.updateActivity({ role: 'user', content: 'go', start: { flow: 'level-1' } }, session);
      reply = String(next?.response ?? '');
   } catch (e) {
      thrown = String(e?.message ?? e);
   }
   return { warns: warns.filter((w) => /Flow stack passed/.test(w)), reply, thrown, errors };
}

let r = await run(24);
assert.equal(r.warns.length, 0, '24 frames: no warning');
assert.match(r.reply, /bottom reached/, `24 frames complete: ${r.reply} ${r.thrown}`);

r = await run(25);
assert.equal(r.warns.length, 1, '25 frames: one warning');
assert.match(r.warns[0], /Flow stack passed 24 frames: level-1>level-2>.*>level-25/);
assert.match(r.reply, /bottom reached/, `25 frames complete: ${r.reply} ${r.thrown}`);

r = await run(32);
assert.equal(r.warns.length, 1, '32 frames: still one warning');
assert.match(r.reply, /bottom reached/, `32 frames complete: ${r.reply} ${r.thrown}`);

r = await run(40);
assert.ok(!/bottom reached/.test(r.reply), 'past 32 frames the engine stops');
assert.ok(/Maximum recursion depth/.test(r.thrown + r.reply + r.errors.join(' ')), `past 32 is the recursion error: ${r.thrown} ${r.reply}`);

console.log('flow-stack-limit: all checks passed');
