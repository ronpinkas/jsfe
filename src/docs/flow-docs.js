/**
 * Flow docs: one Markdown page per flow (its facts: parameters, calls, tools, callers; and a Mermaid chart of each
 * declaration: provider, form or compiled form inputs, performer, step list) and a README per set (its call graph and flow
 * tables), written from the flow JSON itself so a chart can never disagree with a flow. Only the text between
 * <!-- generated:start --> and <!-- generated:end --> is rewritten; anything else in a page is written by hand and kept.
 *
 *   generateFlowDocs({ sets, root, check, hostRun, log }) → { failed }
 *     sets     [{ key, title, flows, tools, source, how?, skeleton? }]: each set's pages go to <root>/<key>/; pages link
 *              across sets. skeleton: an entry point's page gets a "What it does" section to write by hand.
 *     check    write nothing; count a stale page, a page with no flow (orphan) or a broken link as a failure.
 *     hostRun  { flowId: 'who runs it' } for flows the host starts by id, outside any flow.
 * A wrapper whose wrapped flow is an entry point inherits that role (the sets are composed that way).
 * Node only (fs).
 */
import fs from 'fs';
import path from 'path';
import { resolveSetDataReferences } from '../forms/declarations.js';

export function generateFlowDocs({ sets, root, check = false, hostRun = {}, log = console.log }) {
   // A catalog or value written as {"$data": path} is documented as compilation resolves it.
   const SETS = sets.map((s) => ({ ...s, flows: resolveSetDataReferences(s.flows) }));
   // Which set holds a flow id; a page links to a flow in its own set, or in another set's folder.
   const setOf = new Map(), flowOf = new Map();
   for (const s of SETS) { for (const f of s.flows) { if (!setOf.has(f.id)) { setOf.set(f.id, s.key); flowOf.set(f.id, f); } else { /* the first set that defines it */ } } }
   const known = (id) => setOf.has(id);
   for (const s of SETS) { for (const f of s.flows) { const w = typeof f.wraps === 'string' ? flowOf.get(f.wraps) : null; if (w && w !== f && w.primary && f.primary === undefined) { f.primary = true; f.inherited = f.wraps; } else { /* own role */ } } }
   const START = '<!-- generated:start -->', END = '<!-- generated:end -->';
   // The set whose page is being written: links are relative to its folder.
   let current = SETS[0] ? SETS[0].key : '';
   const href = (id) => (setOf.get(id) === current ? `${id}.md` : `../${setOf.get(id)}/${id}.md`);
   const link = (id) => (known(id) ? `[${id}](${href(id)})${setOf.get(id) === current ? '' : ' (' + setOf.get(id) + ')'}` : id);

   const esc = (s) => String(s).replace(/"/g, '#quot;').replace(/[\r\n]+/g, ' ').replace(/[<>]/g, (c) => (c === '<' ? '#lt;' : '#gt;')).replace(/[{}]/g, (c) => (c === '{' ? '#123;' : '#125;')).replace(/\|/g, '#124;').replace(/`/g, "'");
   const cut = (s, n) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
   const cond = (k) => cut(k.replace(/^condition:\s*/, ''), 70);
   const safe = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '_');

   function walk(o, fn) { if (Array.isArray(o)) { o.forEach((x) => walk(x, fn)); } else if (o && typeof o === 'object') { fn(o); Object.values(o).forEach((v) => walk(v, fn)); } else { /* scalar */ } }
   const CALL_TYPES = new Set(['call', 'replace', 'reboot']);
   // Keys of a declaration that name a flow by id: a provider's gate, source and menu flows, a performer's flow, prepare
   // and present, a form input's sub-form, a call's flow, a wrapper's wrapped flow.
   const FLOW_KEYS = { flow: 'declared', prepare: 'prepare', present: 'present', form: 'sub-form', wraps: 'wraps' };

   // A flow is reached by a FLOW step, by a declaration key that names it, by its id passed as a FLOW step's parameter (a
   // hook run by the flow it is passed to), or by its id written in a SET expression (a default target).
   function callsOf(flow) {
      const flows = new Map(), tools = new Set(), add = (id, how) => flows.set(id, (flows.get(id) || new Set()).add(how));
      const { functions, provides, ...rest } = flow;
      // A provider's gate and source are called; a menu choice's flow replaces the provider.
      if (provides) {
         if (provides.gate && provides.gate.flow) { add(provides.gate.flow, 'call'); } else { /* ungated */ }
         if (provides.source && provides.source.flow) { add(provides.source.flow, 'call'); } else { /* no source */ }
         for (const ch of (provides.menu && provides.menu.choices) || []) { if (ch.flow) { add(ch.flow, 'replace'); } else { /* answers in place */ } }
      } else { /* not a provider */ }
      if (typeof flow.wraps === 'string') { add(flow.wraps, 'wraps'); } else { /* not a wrapper */ }
      walk(rest, (s) => {
         if (s.type === 'FLOW' && typeof s.value === 'string') {
            add(s.value, s.callType || 'call');
            for (const [k, v] of Object.entries(s.parameters || {})) { if (typeof v === 'string' && v !== s.value && known(v)) { add(v, `${k} of ${s.value}`); } else { /* not a flow name */ } }
         } else if (s.type === 'SET' && typeof s.value === 'string') {
            for (const m of s.value.matchAll(/'([a-z0-9]+(?:-[a-z0-9]+)+)'/g)) { if (known(m[1]) && m[1] !== flow.id) { add(m[1], 'by name'); } else { /* not a flow id */ } }
         } else if (!s.type) {
            for (const [k, how] of Object.entries(FLOW_KEYS)) { if (typeof s[k] === 'string' && known(s[k])) { add(s[k], how === 'declared' ? 'call' : how); } else { /* not a flow reference */ } }
         } else { /* not a flow reference */ }
         // Any other key whose value is a flow id names that flow (a form's or input's validator, an input's after hook,
         // a confirmation's on_declined).
         for (const [k, v] of Object.entries(s)) { if (typeof v === 'string' && v !== flow.id && known(v) && !(k in FLOW_KEYS) && !(s.type === 'FLOW' && k === 'value')) { add(v, k); } else { /* not a flow id */ } }
         if (s.type === 'CALL-TOOL' && s.tool) { tools.add(s.tool); } else if (!s.type && typeof s.tool === 'string' && s.action) { tools.add(s.tool); } else { /* not a tool */ }
      });
      // The engine compiles a form's declined steps into its companion flow <id>-declined.
      if (flow.form && Array.isArray(flow.form.declined) && flow.form.declined.length && known(flow.id + '-declined')) { add(flow.id + '-declined', 'declined'); } else { /* no companion */ }
      // A function body names a flow by its quoted id (a proposal's on_declined, a default target).
      for (const body of Object.values(functions || {})) { for (const m of [].concat(body.body || body).join('\n').matchAll(/'([a-z0-9]+(?:-[a-z0-9]+)+)'/g)) { if (known(m[1]) && m[1] !== flow.id) { add(m[1], 'by name'); } else { /* not a flow id */ } } }
      return { flows, tools };
   }
   const callers = new Map();
   for (const f of SETS.flatMap((s) => s.flows)) { for (const [target, hows] of callsOf(f).flows) { const m = callers.get(target) || new Map(); for (const h of hows) { m.set(f.id, (m.get(f.id) || new Set()).add(h)); } callers.set(target, m); } }

   function kindOf(flow) {
      const k = [];
      if (flow.provides) { k.push('provider'); } else { /* none */ }
      if (flow.form || (flow.metadata && flow.metadata.formProtocol)) { k.push('form'); } else { /* none */ }
      if (flow.performs) { k.push('performer'); } else { /* none */ }
      if (flow.call) { k.push('call'); } else { /* none */ }
      if (flow.wraps) { k.push('wrapper'); } else { /* none */ }
      if (flow.steps && flow.steps.length) { k.push('steps'); } else { /* none */ }
      if (flow.functions && !k.length) { k.push('function library'); } else { /* none */ }
      if (flow.data && !k.length) { k.push('data'); } else { /* none */ }
      return k;
   }

   // A step as a node label; terminal = control leaves this flow there.
   function describe(s) {
      const t = s.type;
      if (t === 'SET') { return { label: 'set ' + s.variable, kind: 'set' }; }
      if (t === 'SAY') { return { label: 'say: ' + cut(s.value || '', 60), kind: 'say' }; }
      if (t === 'SAY-GET') { return { label: 'ask: ' + cut(s.value || '', 60), kind: 'ask' }; }
      if (t === 'CALL-TOOL') { return { label: 'tool: ' + s.tool, kind: 'tool' }; }
      if (t === 'FLOW') {
         const ct = s.callType || 'call';
         const q = s.value === 'ask-choice' && s.parameters && typeof s.parameters.question === 'string' ? ' ' + cut(s.parameters.question.replace(/^\{\{(.*)\}\}$/, '$1'), 50) : '';
         return { label: (ct === 'call' ? 'call ' : ct + ' → ') + s.value + q, kind: ct === 'call' ? 'call' : 'exit' };
      }
      if (t === 'END') { return { label: 'end (back to caller)', kind: 'exit' }; }
      if (t === 'RETURN') { return { label: 'return to host / AI', kind: 'exit' }; }
      if (t === 'DISPATCH') { return { label: 'dispatch: intent detection', kind: 'exit' }; }
      return { label: t, kind: 'other' };
   }

   // One chart builder for every shape: nodes and edges, with the open ends ("pending") joined to whatever comes next.
   function builder() {
      const lines = ['flowchart TD', '   START(("start"))'];
      let pending = [['START', null]], seq = 0;
      const id = (p) => `${p}${seq++}`;
      const node = (nid, d) => {
         const shape = d.kind === 'exit' ? [`(["`, `"])`] : d.kind === 'tool' ? [`[/"`, `"/]`] : d.kind === 'call' ? [`[["`, `"]]`] : d.kind === 'input' ? [`[/"`, `"\\]`] : d.kind === 'decision' ? [`{"`, `"}`] : [`["`, `"]`];
         lines.push(`   ${nid}${shape[0]}${esc(d.label)}${shape[1]}`);
         const cls = { exit: 'endstep', tool: 'toolstep', call: 'flowstep', input: 'inputstep' }[d.kind];
         if (cls) { lines.push(`   class ${nid} ${cls}`); } else { /* plain */ }
      };
      const join = (nid) => { for (const [from, label] of pending.splice(0)) { lines.push(label ? `   ${from} -- "${esc(label)}" --> ${nid}` : `   ${from} --> ${nid}`); } };
      // Chain one plain node after the open ends.
      const then = (d) => { const nid = id('n'); node(nid, d); join(nid); if (d.kind !== 'exit') { pending.push([nid, null]); } else { /* leaves */ } return nid; };
      // A fan: one decision, one labelled branch per entry, each branch's end left open (or closed when it leaves).
      const fan = (label, branches) => {
         const did = id('d'); node(did, { label, kind: 'decision' }); join(did);
         for (const [edge, d] of branches) { const bid = id('b'); node(bid, d); lines.push(`   ${did} -- "${esc(edge)}" --> ${bid}`); if (d.kind !== 'exit') { pending.push([bid, null]); } else { /* leaves */ } }
      };
      // A step list: consecutive SETs collapse into one node; a CASE is a diamond with one edge per branch.
      const steps = (list) => {
         const groups = [];
         for (const s of list || []) {
            const last = groups[groups.length - 1];
            if (s.type === 'SET' && last && last.set) { last.vars.push(s.variable); } else if (s.type === 'SET') { groups.push({ set: true, vars: [s.variable] }); } else { groups.push({ step: s }); }
         }
         const onFail = (nid, s) => {
            if (s.type !== 'CALL-TOOL' || !s.onFail) { return; } else { /* a failure path */ }
            const fid = nid + 'f', d = describe(s.onFail);
            node(fid, d); lines.push(`   ${nid} -- "fails" --> ${fid}`);
            if (d.kind !== 'exit') { pending.push([fid, null]); } else { /* leaves the flow */ }
         };
         for (const g of groups) {
            if (g.set) { then({ label: 'set ' + cut([...new Set(g.vars)].filter((v) => v !== 'noop').join(', ') || 'noop', 70), kind: 'set' }); continue; } else { /* a step */ }
            const s = g.step;
            if (s.type === 'CASE') {
               const cid = id('c'); lines.push(`   ${cid}{"case"}`); join(cid);
               Object.entries(s.branches || {}).forEach(([k, b]) => {
                  const edge = k === 'default' ? 'else' : cond(k);
                  const noop = b.type === 'SET' && /^noop/.test(b.variable || '');
                  if (noop) { pending.push([cid, edge]); return; } else { /* a real branch */ }
                  const bid = id('b'), d = describe(b);
                  node(bid, d); lines.push(`   ${cid} -- "${esc(edge)}" --> ${bid}`);
                  if (d.kind !== 'exit') { pending.push([bid, null]); } else { /* leaves the flow */ }
                  onFail(bid, b);
               });
            } else { const nid = then(describe(s)); onFail(nid, s); }
         }
      };
      const done = () => {
         if (pending.length) { lines.push('   DONE(["end (back to caller)"])', '   class DONE endstep'); join('DONE'); } else { /* every path leaves explicitly */ }
         lines.push('   classDef endstep fill:#eef,stroke:#669', '   classDef toolstep fill:#efe,stroke:#696', '   classDef flowstep fill:#fef6e0,stroke:#b80', '   classDef inputstep fill:#f3eefc,stroke:#75a');
         return '```mermaid\n' + lines.join('\n') + '\n```';
      };
      return { then, fan, steps, done };
   }

   function providerChart(p) {
      const c = builder();
      if (p.gate && p.gate.flow) { c.then({ label: `gate: call ${p.gate.flow} unless ${(p.gate.verified || []).join(' and ')}`, kind: 'call' }); } else { /* ungated */ }
      if (p.source && p.source.flow) { c.then({ label: `source: call ${p.source.flow} → ${p.source.result || ''}${p.source.refresh ? ' (' + p.source.refresh + ')' : ''}`, kind: 'call' }); } else { /* no source */ }
      const facts = (p.facts || []).map((f) => f.key);
      c.then({ label: `say facts: ${cut(facts.join(', '), 80)}${p.default ? ' (default ' + p.default + ')' : ''}`, kind: 'say' });
      if (p.menu && (p.menu.choices || []).length) {
         c.fan('menu', [...p.menu.choices.map((ch) => [cut((ch.phrases || []).slice(0, 3).join(' / ') || ch.key, 40), { label: `${ch.key} → ${ch.flow || ''}`, kind: ch.flow ? 'exit' : 'say' }]),
            ...(p.menu.done ? [[cut((p.menu.done.phrases || []).slice(0, 3).join(' / '), 40), { label: 'done', kind: 'exit' }]] : [])]);
      } else { /* no menu */ }
      return c.done();
   }

   function formChart(fm) {
      const c = builder();
      if (fm.before && fm.before.length) { c.steps(fm.before); } else { /* nothing before */ }
      for (const i of fm.inputs || []) {
         const extra = [i.when ? 'when ' + cut(i.when, 40) : '', i.form ? 'form ' + i.form : '', i.profile && i.profile.kind ? i.profile.kind : ''].filter(Boolean).join(' · ');
         c.then({ label: `${i.name}${i.label ? ' (' + i.label + ')' : ''}${extra ? ': ' + extra : ''}`, kind: 'input' });
      }
      if (fm.confirm) { c.then({ label: 'confirm', kind: 'decision' }); } else { /* no confirmation */ }
      if (fm.after && fm.after.length) { c.steps(fm.after); } else { /* nothing after */ }
      return c.done();
   }

   function performsChart(flow) {
      const c = builder();
      if (flow.prepare) { c.then({ label: 'prepare: call ' + flow.prepare, kind: 'call' }); } else { /* none */ }
      if (flow.present) { c.then({ label: 'present: call ' + flow.present, kind: 'call' }); } else { /* none */ }
      c.fan('action', flow.performs.map((a) => [cut(a.when || a.action, 50), { label: `${a.action} (${a.effect}${a.confirm ? ', confirmed' : ''}): ${a.flow ? 'flow ' + a.flow : ''}${a.tool ? ' tool ' + a.tool : ''}`, kind: a.tool ? 'tool' : 'call' }]));
      if (flow.project && flow.project.length) { c.steps(flow.project); } else { /* no projection */ }
      return c.done();
   }

   function stepsChart(list) { const c = builder(); c.steps(list); return c.done(); }

   function facts(flow) {
      const { flows, tools } = callsOf(flow);
      const params = (flow.parameters || []).map((p) => `\`${p.name}\`${p.enum ? ' (' + p.enum.join(' / ') + ')' : ''}: ${p.description || ''}`);
      const out = [
         `**${flow.name || flow.id}** · \`${flow.id}\`${flow.version ? ' · version ' + flow.version : ''}${flow.primary ? ' · **entry point** (intent detection can start it' + (flow.inherited ? '; primary inherited from ' + flow.inherited : '') + ')' : ' · worker (called by other flows)'} · ${kindOf(flow).join(' + ')}${flow.scope ? ' · ' + flow.scope + ' scope' : ''}`,
         '',
         `> ${flow.description || ''}`,
         '',
         `- **Parameters:** ${params.length ? '\n  - ' + params.join('\n  - ') : 'none'}`,
         `- **Calls:** ${flows.size ? [...flows].map(([id, cts]) => `${link(id)} (${[...cts].join(', ')})`).join(', ') : 'no other flow'}`,
         `- **Tools:** ${tools.size ? [...tools].map((t) => '`' + t + '`').join(', ') : 'none'}`,
         `- **Called by:** ${[...(flow.primary ? ['intent detection'] : []), ...(hostRun[flow.id] ? [hostRun[flow.id]] : []), ...[...(callers.get(flow.id) || new Map())].map(([id, hows]) => link(id) + ([...hows].some((h) => !CALL_TYPES.has(h)) ? ` (${[...hows].filter((h) => !CALL_TYPES.has(h)).join(', ')})` : ''))].join(', ') || 'nothing (unreachable)'}`,
      ];
      if (flow.functions) { out.push(`- **Functions:** ${Object.keys(flow.functions).map((n) => '`' + n + '`').join(', ')}`); } else { /* none */ }
      if (flow.provides) {
         out.push('', '### Provider', '', ...(flow.provides.facts || []).map((f) => `- fact \`${f.key}\`: ${f.description || ''}${f.path ? ' (from `' + f.path + '`)' : ''}`), '', providerChart(flow.provides));
      } else { /* not a provider */ }
      if (flow.form) { out.push('', '### Form', '', formChart(flow.form)); } else { /* not a form */ }
      // A form the jsfe SDK compiled (the system set) carries its inputs as a variable; its steps are the engine's run-form loop.
      const compiled = flow.metadata && flow.metadata.formProtocol && flow.variables && flow.variables.inputs && Array.isArray(flow.variables.inputs.value) ? flow.variables.inputs.value : null;
      if (!flow.form && compiled && compiled.length) { out.push('', '### Form inputs', '', formChart({ inputs: compiled })); } else { /* not a compiled form */ }
      if (flow.performs) { out.push('', '### Performs', '', ...flow.performs.map((a) => `- \`${a.action}\` (${a.effect}): ${a.reconcile && a.reconcile.policy ? cut(a.reconcile.policy, 300) : ''}`), '', performsChart(flow)); } else { /* not a performer */ }
      if (flow.call) { out.push('', '### Call', '', `Runs ${link(flow.call.flow)} with its parameters.`); } else { /* not a call */ }
      if (flow.wraps) { out.push('', '### Wraps', '', `Runs ${link(flow.wraps)} with this set's wording.`); } else { /* not a wrapper */ }
      if (flow.steps && flow.steps.length) { out.push('', '### Steps', '', stepsChart(flow.steps)); } else { /* no steps */ }
      return out.join('\n');
   }

   function upsert(file, title, generated, skeleton) {
      const block = `${START}\n${generated}\n${END}`;
      const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      const next = old && old.includes(START) && old.includes(END)
         ? old.slice(0, old.indexOf(START)) + block + old.slice(old.indexOf(END) + END.length)
         : `# ${title}\n\n${block}\n${skeleton ? '\n' + skeleton : ''}`;
      if (next === old) {
         return false;
      } else if (check) {
         log(`STALE  ${path.relative(root, file)}`);
         return true;
      } else {
         fs.writeFileSync(file, next);
         return true;
      }
   }

   let failed = 0;
   for (const set of SETS) {
      current = set.key;
      const dir = path.join(root, set.key), ids = new Set(set.flows.map((f) => f.id));
      fs.mkdirSync(dir, { recursive: true });
      let changed = 0;
      // ai-ar-ql's entry points carry a written part; elsewhere a flow's generated facts are its documentation.
      const SKELETON = '## What it does\n\n_To be written._\n';
      for (const f of set.flows) { if (upsert(path.join(dir, f.id + '.md'), f.name || f.id, facts(f), set.skeleton && f.primary ? SKELETON : '')) { changed++; } else { /* unchanged */ } }

      const entries = set.flows.filter((f) => f.primary), workers = set.flows.filter((f) => !f.primary);
      // The README's graph shows what intent detection can start and the flows each entry point reaches directly.
      const graph = ['flowchart LR'];
      for (const f of entries) {
         graph.push(`   ${safe(f.id)}(["${esc(f.name || f.id)} · ${f.id}"])`);
         for (const [t, hows] of callsOf(f).flows) {
            const target = ids.has(t) ? `${safe(t)}["${esc(t)}"]` : `x_${safe(t)}[("${esc(t)} (${setOf.get(t) || 'not in this checkout'})")]`;
            graph.push(`   ${safe(f.id)} ${[...hows].some((h) => CALL_TYPES.has(h)) ? '-->' : '-.->'} ${target}`);
         }
      }
      const table = (list) => ['| flow | kind | what it is |', '|---|---|---|', ...list.map((f) => `| [${f.id}](${f.id}.md) | ${kindOf(f).join(' + ')} | ${cut(f.description || '', 140).replace(/\|/g, '/')} |`)].join('\n');
      const index = [`${set.flows.length} flows (${entries.length} entry points), ${set.tools.length} tools. The graph shows each entry point and the flows it reaches directly; a dotted arrow is a flow named rather than called (a hook, a prepare or present step, a default target). Each flow page charts its declarations: a provider (gate, source, facts, menu), a form (inputs in order, then its after steps), a performer (prepare, present, action) and any step list.`, '', '```mermaid', graph.join('\n'), '```', '', '## Entry points', '', entries.length ? table(entries) : 'None: intent detection starts no flow of this set directly.', '', '## Workers', '', table(workers)].join('\n');
      const others = SETS.filter((s) => s !== set);
      const readme = `## How to read these docs\n\nEach flow page has a generated part (facts and charts, rewritten from ${set.source})${set.skeleton ? ' and, for entry points, a written part' : ''}.${set.how ? ' ' + set.how : ''}${others.length ? ' The other sets: ' + others.map((s) => `[${s.key}](../${s.key}/README.md)`).join(', ') + '.' : ''}\n`;
      if (upsert(path.join(dir, 'README.md'), set.title, index, readme)) { changed++; } else { /* unchanged */ }
      // A page whose flow is gone (renamed, deleted) is wrong about the flow set: it must go too.
      const orphans = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md' && !ids.has(f.slice(0, -3)));
      for (const o of orphans) { log(`ORPHAN ${set.key}/${o}: no ${set.key} flow '${o.slice(0, -3)}'`); }
      if (check) {
         log(changed || orphans.length ? `${path.relative(process.cwd(), dir) || set.key}: ${changed} stale, ${orphans.length} orphan: run the generator` : `${path.relative(process.cwd(), dir) || set.key}: ${set.flows.length} flow docs + README current`);
      } else {
         log(`${path.relative(process.cwd(), dir) || set.key}: ${set.flows.length} flow docs + README, ${changed} written${orphans.length ? `; ${orphans.length} orphan page(s) to delete` : ''}`);
      }
      failed += check ? changed + orphans.length : orphans.length;
   }
   // Links are checked once every set's pages exist: a page links into the other sets' folders.
   for (const set of SETS) {
      const dir = path.join(root, set.key);
      const broken = [];
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
         for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/\]\(((?:\.\.\/[a-z0-9-]+\/)?[a-z0-9:-]+\.md)(?:#[^)]*)?\)/gi)) {
            if (!fs.existsSync(path.join(dir, m[1]))) { broken.push(`${set.key}/${f} → ${m[1]}`); } else { /* exists */ }
         }
      }
      for (const b of broken) { log(`BROKEN ${b}`); }
      failed += broken.length;
   }

   return { failed };
}
