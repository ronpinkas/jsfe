/** Flow expressions reach only what jsfe gives them: never the host's globals, never its Function constructor. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {ExpressionSandbox} from '../dist/helpers/expression-sandbox.js';
import {compileNamedFunctions} from '../dist/helpers/named-functions.js';

let checks = 0;
const test = (name, run) => { run(); checks++; };
const sb = new ExpressionSandbox();
const ev = (expression, vars = {}, approved = {}) => sb.evaluate(expression, Object.keys(vars), Object.values(vars), approved);
const cargo = () => ({secret: undefined, list: [1, 2], nested: {a: 1}});
process.env.JSFE_SANDBOX_PROBE = 'host-secret';

test('no host global is reachable by name', () => {
   for (const name of ['process', 'require', 'module', 'fetch', 'setTimeout', 'Buffer', 'global', 'WebAssembly']) assert.equal(ev(`typeof ${name}`), 'undefined', name);
   assert.equal(ev("Object.keys(globalThis).includes('process')"), false);
});

test('no path to a host Function constructor', () => {
   const c = {cargo: cargo(), Math, matches: (a) => a === 1};
   const probes = [
      "Math.constructor.constructor('return typeof process')()",
      "''.constructor.constructor('return typeof process')()",
      "cargo.constructor.constructor('return typeof process')()",
      "cargo.list.constructor.constructor('return typeof process')()",
      "matches.constructor('return typeof process')()",
      "(function*(){}).constructor('return typeof process')().next().value",
      "Object.getPrototypeOf(cargo).constructor.constructor('return typeof process')()",
      "cargo.__proto__.constructor.constructor('return typeof process')()",
      "Reflect.getPrototypeOf(cargo.nested).constructor.constructor('return typeof process')()",
      "Function('return typeof process')()",
      "eval('typeof process')",
   ];
   for (const p of probes) {
      let out;
      try { out = ev(p, c); } catch (e) { out = 'threw: ' + e.message; }
      assert.ok(out !== 'object' && out !== 'function', `${p} reached the host: ${out}`);
   }
});

test('the host environment cannot be read', () => {
   assert.equal(ev("typeof process === 'undefined' ? 'none' : process.env.JSFE_SANDBOX_PROBE"), 'none');
   assert.equal(ev("Math.constructor.constructor('try { return process.env.JSFE_SANDBOX_PROBE } catch (e) { return \"blocked\" }')()"), 'blocked');
});

test('a host object gives no inherited member and no prototype write', () => {
   const c = cargo();
   assert.throws(() => ev("(cargo.__proto__ = {polluted: true}, 1)", {cargo: c}));
   assert.equal(Object.getPrototypeOf(c), Object.prototype);
   assert.equal(({}).polluted, undefined);
   assert.equal(ev("cargo.hasOwnProperty('list')", {cargo: c}), true, 'inherited methods are the sandbox\'s own');
});

test('a callback receives stand-ins; a returned host object is the host\'s own', () => {
   const c = cargo(), seen = [];
   const each = (list, f) => list.forEach((x) => seen.push(f(x)));
   ev('each(cargo.list, (x) => x * 10)', {cargo: c, each});
   assert.deepEqual(seen, [10, 20]);
   assert.equal(sb.evaluate('cargo.nested', ['cargo'], [c]), c.nested, 'identity preserved');
});

test('a host error keeps its message; a thrown host value never enters as an object', () => {
   const fail = () => { throw new TypeError('bad input'); };
   assert.throws(() => ev('fail()', {fail}), /bad input/);
   const frozen = Object.freeze({a: 1});
   assert.throws(() => ev('(f.a = 2, 1)', {f: frozen}), /read only property/);
});

test('writes, aliases and pushes land on the host objects', () => {
   const c = cargo();
   ev('(cargo.x = {y: 1}, cargo.x.y = 2, cargo.list.push(3), cargo.arr = [], cargo.arr.push(4), delete cargo.nested, true)', {cargo: c});
   assert.deepEqual(c, {secret: undefined, list: [1, 2, 3], x: {y: 2}, arr: [4]});
});

test('values that JSON would lose survive the bridge', () => {
   const c = {};
   ev("(c.nan = NaN, c.inf = -Infinity, c.negZero = -0, c.u = undefined, c.d = new Date(0), c.mark = '\\uE000o:0', true)", {c});
   assert.ok(Number.isNaN(c.nan)); assert.equal(c.inf, -Infinity); assert.ok(Object.is(c.negZero, -0));
   assert.ok('u' in c && c.u === undefined); assert.equal(c.d.getTime(), 0); assert.equal(c.mark, 'o:0');
   assert.equal(ev('s.length', {s: '\uE000o:0'}), 4, 'a host string never decodes as a reference');
});

test('no state survives an evaluation', () => {
   assert.throws(() => ev('(globalThis.leak = 1, 1)'));
   assert.throws(() => ev('(Array.prototype.leak = 1, 1)'));
   assert.throws(() => ev('(Object.prototype.toString = null, 1)'));
   assert.equal(ev('typeof leak'), 'undefined');
   let saved;
   ev('keep(cargo)', {cargo: cargo(), keep: (x) => { saved = x; }});
   assert.equal(typeof saved, 'object', 'the host keeps the host object, never a stand-in');
   let fnOut;
   ev('keep(() => 1)', {keep: (f) => { fnOut = f; }});
   assert.throws(() => fnOut(), /after the expression ends/);
});

test('the limit is the expression\'s own work, never the clock: a slow helper or a loaded machine does not stop it', () => {
   const busy = (ms) => { const end = Date.now() + ms; while (Date.now() < end) { /* a slow host helper, or a starved CPU */ } return 1; };
   assert.equal(ev('slow(800) + slow(800)', {slow: busy}), 2, '1.6 s in a helper: answered');
   assert.equal(ev('[1, 2, 3].map(function (x) { return x * 2; }).join(",")'), '2,4,6', 'ordinary work: answered');
});

test('runaway code is stopped and the sandbox stays usable', () => {
   assert.throws(() => ev('(() => { while (true) {} })()'), /interrupted/);
   assert.throws(() => ev('(() => { const a = []; while (true) a.push(new Array(100000).fill(1)); })()'), /memory|interrupted/);
   assert.throws(() => ev('(function f() { return f() + 1; })()'), /stack|recursion|interrupted/i);
   assert.equal(ev('1 + 1'), 2);
});

test('locale formatting and structuredClone are available', () => {
   assert.equal(ev("(1234.5).toLocaleString('en-US', {style: 'currency', currency: 'USD'})"), '$1,234.50');
   assert.equal(ev("new Date(0).toLocaleDateString('en-US', {timeZone: 'UTC'})"), '1/1/1970');
   assert.equal(ev('new Date(0).toString()'), new Date(0).toString());
   assert.equal(ev("new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Los_Angeles'}).format(new Date(0))"), '1969-12-31');
   assert.equal(ev("Intl.DateTimeFormat('en-US', {timeZone: 'UTC', hour: 'numeric', hourCycle: 'h23'}).formatToParts(new Date(0)).find(p => p.type === 'hour').value"), '00');
   assert.equal(ev("new Intl.NumberFormat('en-US', {style: 'percent'}).format(0.5)"), '50%');
   assert.throws(() => ev("new Intl.DateTimeFormat('en-US').format(new Date('nope'))"), /Invalid time value/);
   const c = {a: {b: [1, 2]}};
   assert.equal(ev('(() => { const x = structuredClone(c.a); x.b.push(3); return c.a.b.length + x.b.length; })()', {c}), 5);
});

test('named functions are compiled once, run in the sandbox and see only what they are given', () => {
   let calls = 0;
   const ns = compileNamedFunctions({
      twice: {parameters: [{name: 'v'}], body: ['return v * 2;']},
      probe: {parameters: [], body: ["return typeof process + ':' + Math.constructor.constructor('return typeof process')();"]},
      label: {parameters: [{name: 'v'}], body: ['return approved(v);']},
   }, {approvedFunctions: {approved: (v) => { calls++; return 'L' + v; }}, sandbox: sb});
   assert.equal(ns.twice(21), 42);
   assert.equal(ns.probe(), 'undefined:undefined');
   assert.equal(ns.label(1), 'L1', 'called from the host: the table it was compiled with');
   assert.equal(ev('fn.label(fn.twice(2))', {fn: ns}, {approved: (v) => 'M' + v}), 'M4', 'in an evaluation: the evaluating engine\'s table');
   assert.throws(() => ev('fn.label(1)', {fn: ns}), /approved is not a function/);
   assert.equal(calls, 1);
   assert.throws(() => compileNamedFunctions({bad: {parameters: [], body: ['return (;']}}, {sandbox: sb}), /invalid JavaScript/);
});

test('engines share the process sandbox', async () => {
   const quiet = {info() {}, debug() {}, warn() {}, error() {}};
   const flow = {id: 'probe', name: 'Probe', version: '1', description: 'probe', steps: [
      {id: 's', type: 'SET', variable: 'v', value: "typeof process + '/' + Math.constructor.constructor('return typeof process')()"},
      {id: 'say', type: 'SAY', value: '{{v}}'}]};
   const e = new WorkflowEngine(quiet, async () => '{}', [flow], [], {}, {}, false, 'en');
   e.disableCommands();
   const s = await e.updateActivity({role: 'user', content: 'go', start: {flow: 'probe'}}, e.initSession('u', 'probe', 'en'));
   assert.equal(s.response, 'undefined/undefined');
   assert.equal(Object.keys(e).includes('expressionSandbox'), false, 'never serialized');
});

test('sandboxes are released', () => {
   for (let i = 0; i < 300; i++) { const s = new ExpressionSandbox(); s.evaluate('x.a + 1', ['x'], [{a: i}]); s.dispose(); }
});

console.log(`expression-sandbox: ${checks} checks passed`);
