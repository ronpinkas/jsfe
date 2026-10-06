// An engine AI call that fails is ONE event, and the host reports it — the engine does not.
//
//   npm run build && node tests/ai-failure-logging.test.mjs
//
// The defect this pins (jsfe ≤ 0.9.93): one intent-detection timeout wrote six lines on its way to
// the host — fetchAiResponse (warn, twice: message and stack), fetchAiTask, "Flow activation error",
// "Error processing activity" and "Error in updateActivity" (all four at error) — and the host then
// reported the same error itself. Every one of those layers re-throws, so the host owns the event.
//
// Hermetic: the aiCallback rejects or outlives aiTimeOut; no network.
import assert from 'node:assert/strict';
import { WorkflowEngine } from '../dist/index.js';

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };

function recordingLogger() {
  const lines = [];
  const at = (level) => (...args) => lines.push({ level, text: args.map(String).join(' ') });
  return { lines, logger: { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') } };
}

const flow = { id: 'pay', name: 'PayBill', description: 'Pay a bill', version: '1.0.0', primary: true,
  steps: [{ id: 's', type: 'SAY', value: 'paying' }] };

async function failingTurn(aiCallback, aiTimeOut) {
  const { lines, logger } = recordingLogger();
  const e = new WorkflowEngine(logger, aiCallback, [flow], [], {}, {}, false, 'en', aiTimeOut);
  let s = e.initSession('u', `t-${Math.random()}`);
  let thrown = null;
  try {
    s = await e.updateActivity({ role: 'user', content: 'I would like to settle what I owe', timestamp: Date.now() }, s);
  } catch (error) {
    thrown = error;
  }
  const loud = lines.filter((l) => l.level === 'warn' || l.level === 'error');
  return { thrown, loud, lines };
}

// ── a vendor error: re-thrown to the host with its cause, and no warn/error line from the engine ──
{
  const r = await failingTurn(async () => { throw new Error('vendor 503 system_overloaded'); }, 1000);
  ok(r.thrown, 'the failure reaches the host');
  ok(/AI task processing failed: AI communication failed: vendor 503 system_overloaded/.test(r.thrown.message),
    `the host receives the cause (${r.thrown?.message})`);
  ok(r.loud.length === 0, `the engine logs no warn/error line for it: ${JSON.stringify(r.loud)}`);
  ok(r.lines.some((l) => l.level === 'debug' && /fetchAiTask error/.test(l.text)), 'the layers still trace it at debug');
}

// ── an AI timeout: the same ─────────────────────────────────────────────────────────────────────
{
  const r = await failingTurn(() => new Promise((resolve) => setTimeout(() => resolve('{}'), 400)), 50);
  ok(r.thrown, 'the timeout reaches the host');
  ok(/AI task processing failed/.test(r.thrown.message), `the host receives an AI failure (${r.thrown?.message})`);
  ok(r.loud.length === 0, `the engine logs no warn/error line for it: ${JSON.stringify(r.loud)}`);
}

console.log(`ai-failure-logging: ${checks} checks passed`);
