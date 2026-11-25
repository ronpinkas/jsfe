/** Flow expressions and named functions run in QuickJS (WebAssembly), never in the host's realm.
 *
 * Flow text is untrusted. The sandbox holds stand-ins (Proxies) for the host objects an expression is given; every
 * property read, write, delete and key listing is a call to host code that returns only a primitive or another
 * stand-in's id. No host object or host function ever enters the sandbox, so neither the host's globals nor its Function
 * constructor are reachable. Only OWN properties cross; inherited members come from the sandbox's own prototypes.
 *
 * One sandbox per process (`sharedSandbox()`), shared by every engine: its globals and built-ins are frozen once set up,
 * so no evaluation can leave state for a later one, and per evaluation the host's object table and the guest's stand-in
 * cache are cleared: a stand-in never outlives its evaluation. Named functions are compiled once per process and call
 * approved functions by name, from the table of the engine evaluating.
 *
 * Host functions (approved functions, and any function the host itself placed in data: JSON flow text cannot hold one)
 * are called on the host; only their arguments and result cross, through the same bridge.
 * Design and measurements: docs/expression-sandbox-design.md.
 */
import {QuickJS} from '../vendor/quickjs.js';

const MARK = '';
const OBJ = MARK + 'o:', FUN = MARK + 'f:', EFUN = MARK + 'h:', GFUN = MARK + 'g:', STR = MARK + 's:', NUM = MARK + 'n:', DATE = MARK + 'd:';
const UNDEF = MARK + 'u', ABSENT = MARK + 'a';
const BUILTINS = new Set(['Object', 'Date', 'Math', 'String', 'Number', 'Boolean', 'Array', 'JSON']);
const identifier = /^[A-Za-z_$][\w$]*$/;
const COMPILED_CACHE = 1000;

// steps: the interrupt handler's calls in one evaluation, which QuickJS makes at a fixed count of executed bytecode, so the
// limit is the expression's own work: the same verdict on any machine, under any load, and a trusted helper the expression
// calls (readFormAnswer, matchInputs) is not counted. Measured 2026-11-24 over 7.29 M evaluations (all AIDevelopment flow
// suites and jsfe's): at most 6 steps, 99.99% at 3 or fewer; a runaway loop makes 1.7-30 steps per ms, so 1,000 stops one
// within ~30-600 ms.
export const EXPRESSION_LIMITS = Object.freeze({memoryBytes: 256 * 1024 * 1024, stackBytes: 1024 * 1024, steps: 1000});

// Guest runtime. The host functions it is given are captured and removed from the global object before anything else
// runs; its API is the script's completion value, never a global.
const GUEST = String.raw`(function () {
  'use strict';
  var G = globalThis, hostGet = G.__get, hostSet = G.__set, hostHas = G.__has, hostDel = G.__del, hostKeys = G.__keys,
      hostCall = G.__call, hostFormat = G.__format;
  ['__get', '__set', '__has', '__del', '__keys', '__call', '__format'].forEach(function (k) { delete G[k]; });
  var M = '\uE000', byId, ids, gfuns, assigned, evalFns, hostFns = Object.create(null), hostIds = new WeakMap();
  function reset() { byId = Object.create(null); ids = new WeakMap(); gfuns = []; assigned = []; evalFns = Object.create(null); }
  reset();
  function dec(v) {
    if (typeof v !== 'string' || v.charCodeAt(0) !== 0xE000) return v;
    var tag = v.slice(0, 3);
    if (tag === M + 'o:') { var p = v.slice(3).split(':'); return standIn(+p[0], p[1] === 'a'); }
    if (tag === M + 'f:' || tag === M + 'h:') return hostFunction(v);
    if (tag === M + 's:') return v.slice(3);
    if (tag === M + 'n:') return Number(v.slice(3));
    if (tag === M + 'd:') return new Date(Number(v.slice(3)));
    if (v === M + 'u') return undefined;
    return v;
  }
  function enc(v) {
    if (v === undefined) return M + 'u';
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return isFinite(v) && !(v === 0 && 1 / v < 0) ? v : M + 'n:' + (v === 0 ? '-0' : String(v));
    if (typeof v === 'string') return v.charCodeAt(0) === 0xE000 ? M + 's:' + v : v;
    if (typeof v !== 'object' && typeof v !== 'function') throw new TypeError('a ' + typeof v + ' cannot leave an expression');
    if (ids.has(v)) return M + 'o:' + ids.get(v);
    if (typeof v === 'function') { var hid = hostIds.get(v); if (hid !== undefined) return hid; gfuns.push(v); return M + 'g:' + (gfuns.length - 1); }
    if (v instanceof Date) return M + 'd:' + v.getTime();
    if (Array.isArray(v)) { var a = []; for (var i = 0; i < v.length; i++) a.push(enc(v[i])); return a; }
    var o = {};
    Object.keys(v).forEach(function (k) { Object.defineProperty(o, k, {value: enc(v[k]), enumerable: true, writable: true, configurable: true}); });
    return o;
  }
  // f:<name> an approved function by name (named functions hold it), h:<id> a host function for this evaluation only
  function hostFunction(tag) {
    var cache = tag.charAt(1) === 'f' ? hostFns : evalFns;
    if (cache[tag]) return cache[tag];
    var f = function () { resync(); return dec(hostCall(tag, JSON.stringify(enc(Array.prototype.slice.call(arguments))))); };
    hostIds.set(f, tag); cache[tag] = Object.freeze(f); return f;
  }
  function standIn(id, isArr) {
    if (byId[id]) return byId[id];
    var proto = isArr ? Array.prototype : Object.prototype;
    var p = new Proxy(isArr ? [] : {}, {
      get: function (t, k) { if (typeof k === 'symbol') return proto[k]; var v = hostGet(id, k); return v === M + 'a' ? proto[k] : dec(v); },
      set: function (t, k, v) {
        if (typeof k === 'symbol') return false;
        var j = JSON.stringify(enc(v));
        if (!hostSet(id, k, j)) return false;
        if (v && typeof v === 'object' && !ids.has(v) && !(v instanceof Date)) assigned.push([id, k, v, j]);
        return true;
      },
      has: function (t, k) { return typeof k !== 'symbol' && hostHas(id, k); },
      deleteProperty: function (t, k) { return typeof k !== 'symbol' && hostDel(id, k); },
      ownKeys: function () { var ks = JSON.parse(hostKeys(id)); if (isArr && ks.indexOf('length') < 0) ks.push('length'); return ks; },
      getOwnPropertyDescriptor: function (t, k) {
        if (isArr && k === 'length') return {value: dec(hostGet(id, 'length')), writable: true, enumerable: false, configurable: false};
        if (typeof k === 'symbol' || !hostHas(id, k)) return undefined;
        return {value: dec(hostGet(id, k)), writable: true, enumerable: true, configurable: true};
      },
      defineProperty: function (t, k, d) { if (typeof k === 'symbol' || !('value' in d)) return false; return hostSet(id, k, JSON.stringify(enc(d.value))); },
      getPrototypeOf: function () { return proto; },
      setPrototypeOf: function () { return false; },
      preventExtensions: function () { return false; }
    });
    ids.set(p, id); byId[id] = p; return p;
  }
  // A plain object stored into a host object is re-sent before any host call and at the end, only if it changed since.
  function resync() {
    for (var i = 0; i < assigned.length; i++) {
      var a = assigned[i], j = JSON.stringify(enc(a[2]));
      if (j !== a[3]) { hostSet(a[0], a[1], j); a[3] = j; }
    }
  }
  // QuickJS has no Intl: locale formatting (and the zone name in Date#toString) is the host's; only primitives cross.
  function fmt(kind) { return function (locales, options) { return hostFormat(kind, kind === 'number' ? Number(this) : this.getTime(), JSON.stringify(locales === undefined ? null : locales), JSON.stringify(options === undefined ? null : options)); }; }
  ['toLocaleDateString', 'toLocaleString', 'toLocaleTimeString', 'toString', 'toTimeString'].forEach(function (m) { Date.prototype[m] = fmt('date:' + m); });
  Number.prototype.toLocaleString = fmt('number');
  // Intl.DateTimeFormat and Intl.NumberFormat, formatted by the host: the formatter keeps its locales and options, and
  // each call sends them with the value.
  function formatter(kind, valueOf) {
    function F(locales, options) {
      if (!(this instanceof F)) return new F(locales, options);
      this.l = JSON.stringify(locales === undefined ? null : locales);
      this.o = JSON.stringify(options === undefined ? null : options);
    }
    function call(op, self, v) { return hostFormat(kind + ':' + op, valueOf(v), self.l, self.o); }
    F.prototype.format = function (v) { return call('format', this, v); };
    F.prototype.formatToParts = function (v) { return JSON.parse(call('formatToParts', this, v)); };
    F.prototype.resolvedOptions = function () { return JSON.parse(call('resolvedOptions', this, 0)); };
    return F;
  }
  G.Intl = {
    DateTimeFormat: formatter('dtf', function (v) { return v === undefined ? Date.now() : (v instanceof Date ? v.getTime() : Number(v)); }),
    NumberFormat: formatter('nf', function (v) { return Number(v); })
  };
  // structuredClone for data (QuickJS has none): plain objects, arrays, Date, Map, Set and RegExp, cycles kept; a
  // function cannot be cloned, as in the platform's own.
  G.structuredClone = function structuredClone(value) {
    var seen = new Map();
    function clone(v) {
      if (v === null || typeof v !== 'object') {
        if (typeof v === 'function' || typeof v === 'symbol') throw new TypeError('structuredClone: a ' + typeof v + ' could not be cloned');
        return v;
      }
      if (seen.has(v)) return seen.get(v);
      var c;
      if (v instanceof Date) { c = new Date(v.getTime()); seen.set(v, c); return c; }
      if (v instanceof RegExp) { c = new RegExp(v.source, v.flags); seen.set(v, c); return c; }
      if (v instanceof Map) { c = new Map(); seen.set(v, c); v.forEach(function (x, k) { c.set(clone(k), clone(x)); }); return c; }
      if (v instanceof Set) { c = new Set(); seen.set(v, c); v.forEach(function (x) { c.add(clone(x)); }); return c; }
      c = Array.isArray(v) ? [] : {}; seen.set(v, c);
      Object.keys(v).forEach(function (k) { Object.defineProperty(c, k, {value: clone(v[k]), enumerable: true, writable: true, configurable: true}); });
      if (Array.isArray(v)) c.length = v.length;
      return c;
    }
    return clone(value);
  };
  function harden(root) {
    var seen = new WeakSet(), stack = [root];
    while (stack.length) {
      var o = stack.pop();
      if (o === null || (typeof o !== 'object' && typeof o !== 'function') || seen.has(o)) continue;
      seen.add(o); Object.freeze(o); stack.push(Object.getPrototypeOf(o));
      Reflect.ownKeys(o).forEach(function (k) {
        var d = Reflect.getOwnPropertyDescriptor(o, k);
        if (!d) return;
        if ('value' in d) stack.push(d.value); else { stack.push(d.get); stack.push(d.set); }
      });
    }
  }
  return Object.freeze({
    dec: dec, enc: function (v) { return JSON.stringify(enc(v)); }, gfun: function (i) { return gfuns[i]; }, resync: resync,
    reset: reset, harden: function () { harden(G); }, namespace: function () { return Object.create(null); },
    freeze: function (o) { Object.freeze(o); return o; },
    // A host error as a sandbox error. Built by the constructor (and defineProperty), never by assignment: an inherited
    // frozen property cannot be assigned, so the library's own copy would lose the message.
    error: function (name, message) {
      var C = {TypeError: TypeError, RangeError: RangeError, SyntaxError: SyntaxError, ReferenceError: ReferenceError}[name] || Error;
      var e = new C(message);
      if (e.name !== name) Object.defineProperty(e, 'name', {value: name, writable: true, configurable: true});
      return e;
    },
    fill: function (ns, names, values) { for (var i = 0; i < names.length; i++) ns[names[i]] = Object.freeze(values[i]); return Object.freeze(ns); }
  });
})()`;

// Releases a sandbox's QuickJS resources once its engine is unreachable. The held value never references the sandbox
// (the host functions reach it through a WeakRef), so the engine can be collected.
const registry = typeof FinalizationRegistry === 'function' ? new FinalizationRegistry(release) : null;
function release(res) {
   if (res.released) return;
   res.released = true;
   for (const h of res.handles) if (h.alive) h.dispose();
   for (const h of res.compiled.values()) if (h.alive) h.dispose();
   res.compiled.clear();
   res.ctx.dispose();
   res.rt.dispose();
}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const guestError = (ctx, handle) => {
   const e = ctx.dump(handle);
   handle.dispose();
   const message = e && typeof e === 'object' ? (e.message || e.name || JSON.stringify(e)) : String(e);
   return new Error(message);
};

export class ExpressionSandbox {
   constructor(limits = {}) {
      const {memoryBytes, stackBytes, steps} = {...EXPRESSION_LIMITS, ...limits};
      const rt = QuickJS.newRuntime();
      rt.setMemoryLimit(memoryBytes);
      rt.setMaxStackSize(stackBytes);
      const res = {rt, ctx: null, handles: [], compiled: new Map(), released: false};
      this.res = res;
      this.stepLimit = steps;
      this.steps = -1;                          // -1 outside an evaluation: nothing is counted or interrupted
      this.depth = 0;
      this.generation = 0;
      this.owned = [];
      this.approved = null;                     // the evaluating engine's approved functions (named functions call by name)
      this.evalFuns = []; this.evalFunId = new Map(); // any other host function: per evaluation
      this.objs = []; this.objId = new Map();   // host objects: per evaluation
      this.namespaces = new WeakMap();          // a named-function namespace -> its guest object
      this.namespaceCache = new Map();          // compiled once per source (see defineNamespace)
      const self = new WeakRef(this);
      rt.setInterruptHandler(() => { const s = self.deref(); if (!s) { return true; } else if (s.steps < 0) { return false; } else { s.steps++; return s.steps > s.stepLimit; } });
      const ctx = rt.newContext();
      res.ctx = ctx;
      this.ctx = ctx;
      const install = (name, method) => {
         const h = ctx.newFunction(name, (...args) => {
            const s = self.deref();
            if (!s) throw new Error('expression sandbox released');
            try { return s[method](...args); } catch (error) { throw s.errorHandle(error); }
         });
         ctx.setProp(ctx.global, name, h);
         h.dispose();
      };
      install('__get', 'hostGet'); install('__set', 'hostSet'); install('__has', 'hostHas'); install('__del', 'hostDel');
      install('__keys', 'hostKeys'); install('__call', 'hostCall'); install('__format', 'hostFormat');
      const api = ctx.evalCode(GUEST);
      if (api.error) throw guestError(ctx, api.error);
      this.api = api.value;
      res.handles.push(api.value);
      this.guest('harden').dispose();
      registry?.register(this, res);
   }

   /** Releases the QuickJS runtime now (otherwise when the sandbox is collected). */
   dispose() { registry?.unregister(this); release(this.res); }

   guest(name, ...args) {
      const f = this.ctx.getProp(this.api, name);
      try {
         const r = this.ctx.callFunction(f, this.api, ...args);
         if (r.error) throw guestError(this.ctx, r.error);
         return r.value;
      } finally { f.dispose(); }
   }

   own(h) { this.owned.push(h); return h; }

   /** A host error as a sandbox error handle (the library throws a handle as is). */
   errorHandle(error) {
      const name = this.ctx.newString(String(error?.name || 'Error')), message = this.ctx.newString(String(error?.message ?? error));
      try { return this.guest('error', name, message); } finally { name.dispose(); message.dispose(); }
   }

   // ── what crosses into the sandbox ────────────────────────────────────────────────────────────────────────────────
   out(v) {
      const ctx = this.ctx;
      if (v === undefined) return ctx.undefined;
      if (v === null) return ctx.null;
      if (typeof v === 'boolean') return v ? ctx.true : ctx.false;
      if (typeof v === 'number') return ctx.newNumber(v);
      if (typeof v === 'string') return ctx.newString(v.charCodeAt(0) === 0xE000 ? STR + v : v);
      if (typeof v === 'bigint') return ctx.newNumber(Number(v));
      if (typeof v === 'function') {
         let id = this.evalFunId.get(v);
         if (id === undefined) { id = this.evalFuns.length; this.evalFuns.push(v); this.evalFunId.set(v, id); }
         return ctx.newString(EFUN + id);
      }
      if (typeof v === 'object') {
         const ns = this.namespaces.get(v);
         if (ns) return ns.dup();
         if (v instanceof Date) return ctx.newString(DATE + v.getTime());
         let id = this.objId.get(v);
         if (id === undefined) { id = this.objs.length; this.objs.push(v); this.objId.set(v, id); }
         return ctx.newString(OBJ + id + (Array.isArray(v) ? ':a' : ''));
      }
      return ctx.undefined;
   }

   /** A host value as a sandbox value (a stand-in for an object). */
   toGuest(v) {
      const h = this.own(this.out(v));
      const tagged = (typeof v === 'object' && v !== null && !this.namespaces.has(v)) || typeof v === 'function' || (typeof v === 'string' && v.charCodeAt(0) === 0xE000);
      return tagged ? this.own(this.guest('dec', h)) : h;
   }

   // ── what crosses back ────────────────────────────────────────────────────────────────────────────────────────────
   inn(v) {
      if (v === UNDEF) return undefined;
      if (typeof v === 'string') {
         if (v.charCodeAt(0) !== 0xE000) return v;
         if (v.startsWith(OBJ)) return this.object(+v.slice(3).split(':')[0]);
         if (v.startsWith(FUN) || v.startsWith(EFUN)) return this.hostFunctionOf(v);
         if (v.startsWith(GFUN)) return this.callback(+v.slice(3));
         if (v.startsWith(STR)) return v.slice(3);
         if (v.startsWith(NUM)) return Number(v.slice(3));
         if (v.startsWith(DATE)) return new Date(Number(v.slice(3)));
         return v;
      }
      if (Array.isArray(v)) return v.map((x) => this.inn(x));
      if (v && typeof v === 'object') {
         const o = {};
         for (const k of Object.keys(v)) Object.defineProperty(o, k, {value: this.inn(v[k]), enumerable: true, writable: true, configurable: true});
         return o;
      }
      return v;
   }

   hostFunctionOf(tag) {
      if (tag.startsWith(FUN)) {
         const name = tag.slice(3), f = this.approved && hasOwn(this.approved, name) ? this.approved[name] : undefined;
         if (typeof f !== 'function') throw new TypeError(`${name} is not a function`);
         return f;
      }
      const f = this.evalFuns[+tag.slice(3)];
      if (typeof f !== 'function') throw new Error('stale function reference');
      return f;
   }

   object(id) {
      if (id >= this.objs.length) throw new Error('stale object reference');
      return this.objs[id];
   }

   /** A sandbox function handed to the host: callable while its evaluation runs. */
   callback(index) {
      const generation = this.generation;
      return (...args) => {
         if (this.depth === 0 || generation !== this.generation) throw new Error('a function created by an expression cannot be called after the expression ends');
         const f = this.own(this.guest('gfun', this.own(this.ctx.newNumber(index))));
         return this.call(f, args);
      };
   }

   /** Calls a sandbox function with host arguments, inside the current evaluation. */
   call(f, args) {
      const handles = args.map((a) => this.toGuest(a));
      const r = this.ctx.callFunction(f, this.ctx.undefined, ...handles);
      if (r.error) throw guestError(this.ctx, r.error);
      this.own(r.value);
      this.guest('resync').dispose();
      const encoded = this.own(this.guest('enc', r.value));
      return this.inn(JSON.parse(this.ctx.getString(encoded)));
   }

   /** One evaluation: a step budget, a fresh object table, every handle released at the end. */
   scope(run, approved) {
      const outer = this.depth === 0;
      const previousApproved = this.approved;
      if (approved) this.approved = approved;
      if (outer) {
         if (this.res.released) throw new Error('expression sandbox released');
         this.generation++;
         this.steps = 0;
      }
      this.depth++;
      try {
         return run();
      } finally {
         this.depth--;
         this.approved = previousApproved;
         if (outer) {
            this.steps = -1;
            for (const h of this.owned) if (h.alive) h.dispose();
            this.owned = [];
            this.objs = []; this.objId.clear(); this.evalFuns = []; this.evalFunId.clear();
            this.guest('reset').dispose();
         }
      }
   }

   compile(source) {
      const cached = this.res.compiled.get(source);
      if (cached) { this.res.compiled.delete(source); this.res.compiled.set(source, cached); return cached; }
      const r = this.ctx.evalCode(source);
      if (r.error) throw guestError(this.ctx, r.error);
      this.res.compiled.set(source, r.value);
      if (this.res.compiled.size > COMPILED_CACHE) {
         const [oldest, h] = this.res.compiled.entries().next().value;
         this.res.compiled.delete(oldest);
         h.dispose();
      }
      return r.value;
   }

   // ── host functions the guest runtime calls ───────────────────────────────────────────────────────────────────────
   hostGet(idH, kH) {
      const o = this.object(this.ctx.getNumber(idH)), k = this.ctx.getString(kH);
      return hasOwn(o, k) ? this.out(o[k]) : this.ctx.newString(ABSENT);
   }
   hostSet(idH, kH, vH) {
      const k = this.ctx.getString(kH);
      if (k === '__proto__') return this.ctx.false;
      this.object(this.ctx.getNumber(idH))[k] = this.inn(JSON.parse(this.ctx.getString(vH)));
      return this.ctx.true;
   }
   hostHas(idH, kH) { return hasOwn(this.object(this.ctx.getNumber(idH)), this.ctx.getString(kH)) ? this.ctx.true : this.ctx.false; }
   hostDel(idH, kH) { return delete this.object(this.ctx.getNumber(idH))[this.ctx.getString(kH)] ? this.ctx.true : this.ctx.false; }
   hostKeys(idH) { return this.ctx.newString(JSON.stringify(Object.keys(this.object(this.ctx.getNumber(idH))))); }
   hostCall(fH, aH) {
      const f = this.hostFunctionOf(this.ctx.getString(fH));
      const result = f(...this.inn(JSON.parse(this.ctx.getString(aH))));
      if (result && typeof result.then === 'function') throw new Error('an approved function returned a Promise; expressions are synchronous');
      return this.out(result);
   }
   hostFormat(kH, vH, lH, oH) {
      const kind = this.ctx.getString(kH), v = this.ctx.getNumber(vH);
      const locales = JSON.parse(this.ctx.getString(lH)) ?? undefined, options = JSON.parse(this.ctx.getString(oH)) ?? undefined;
      const [family, op] = kind.split(':');
      let s;
      if (family === 'number') s = v.toLocaleString(locales, options);
      else if (family === 'date') s = new Date(v)[op](locales, options);
      else {
         const f = family === 'dtf' ? new Intl.DateTimeFormat(locales, options) : new Intl.NumberFormat(locales, options);
         s = op === 'format' ? f.format(v) : JSON.stringify(op === 'formatToParts' ? f.formatToParts(v) : f.resolvedOptions());
      }
      return this.ctx.newString(String(s));
   }

   // ── the engine's entry points ────────────────────────────────────────────────────────────────────────────────────
   /** Evaluates one expression. Only the names it mentions are passed in; the standard built-ins are the sandbox's own. */
   evaluate(expression, names, values, approvedFunctions) {
      const keep = [], keepValues = [];
      for (let i = 0; i < names.length; i++) {
         const n = names[i];
         if (BUILTINS.has(n) || !identifier.test(n)) continue;
         if (!new RegExp(`(^|[^\\w$])${n.replace(/\$/g, '\\$')}([^\\w$]|$)`).test(expression)) continue;
         keep.push(n); keepValues.push(values[i]);
      }
      return this.scope(() => {
         const f = this.compile(`(function(${keep.join(',')}){"use strict"; return (${expression});})`);
         return this.call(f, keepValues);
      }, approvedFunctions || {});
   }

   /** Compiles named functions once per source; returns a namespace bound to `approvedFunctions` (callable from the
    *  host; an expression's `fn`). Approved functions are called by name, so one compiled copy serves every engine. */
   defineNamespace({names, source, approvedFunctions, label}) {
      const approvedNames = Object.keys(approvedFunctions);
      const key = approvedNames.join(',') + '\n' + names.join(',') + '\n' + source;
      let entry = this.namespaceCache.get(key);
      if (!entry) {
         const factorySource = `(function(fn${approvedNames.map((n) => ',' + n).join('')}){"use strict";\n${source}\nreturn [${names.join(',')}];})`;
         const factory = this.ctx.evalCode(factorySource);
         if (factory.error) throw new Error(`Named functions ${label}: invalid JavaScript: ${guestError(this.ctx, factory.error).message}`);
         this.res.handles.push(factory.value);
         const ns = this.guest('namespace');
         this.res.handles.push(ns);
         const members = [];
         this.scope(() => {
            const args = [ns, ...approvedNames.map((n) => this.own(this.guest('dec', this.own(this.ctx.newString(FUN + n)))))];
            const r = this.ctx.callFunction(factory.value, this.ctx.undefined, ...args);
            if (r.error) throw new Error(`Named functions ${label}: ${guestError(this.ctx, r.error).message}`);
            this.own(r.value);
            for (let i = 0; i < names.length; i++) { const m = this.ctx.getProp(r.value, i); this.res.handles.push(m); members.push(m); }
            const namesH = this.own(this.ctx.newArray());
            const valuesH = this.own(this.ctx.newArray());
            names.forEach((n, i) => { this.ctx.setProp(namesH, i, this.own(this.ctx.newString(n))); this.ctx.setProp(valuesH, i, members[i]); });
            this.guest('fill', ns, namesH, valuesH).dispose();
         }, approvedFunctions);
         entry = {ns, members};
         this.namespaceCache.set(key, entry);
      }
      const namespace = Object.create(null);
      names.forEach((n, i) => { namespace[n] = (...args) => this.scope(() => this.call(entry.members[i], args), approvedFunctions); });
      Object.freeze(namespace);
      this.namespaces.set(namespace, entry.ns);
      return namespace;
   }
}

let shared;
/** The process's sandbox, shared by every engine (created on first use, never released). */
export function sharedSandbox() { return shared ??= new ExpressionSandbox(); }
