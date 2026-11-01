/**
 * Flow traps: the flow-graph defects that are real (owner 2026-11-01). A call on a loop grows the stack every lap; a
 * loop of replaces with no question in reach spins inside one turn. Not traps: a flow replacing itself (the frame is
 * reused and a question is in reach), reboot and DISPATCH (both clear the stack), a `toParent` REPLACE of a
 * `replaceTarget` flow with a question in reach (it returns to the waiting frame), a loop whose flow declares `loopBound`, and a worker in the path (it runs whichever
 * form asked, so two forms sharing run-form are nesting, not a loop). A worker's own loops are not read here.
 *
 * Targets named in a declaration count like the FLOW step that will run them: form input callbacks and validators,
 * gates, sources, actions, and a flow passed by name as a parameter a worker or identity flow invokes (a retry only when it returns).
 */
import { FLOWS } from './flows.js';

const WORKER_FLOW_IDS = new Set(FLOWS.map((flow) => flow.id));

// Declared flow references, by how the runtime invokes them. `on_exhausted`, cancel flows and offers reboot.
const CALLED_INPUT_KEYS = ['form', 'validator', 'prepare', 'refresh', 'after', 'answer_precheck', 'answer_validator', 'on_no', 'on_declined'];
const CALLED_PARAMETERS = ['validate_flow', 'code_validator', 'answer_handler', 'failed_flow', 'cell_validator', 'email_validator', 'switch_reset'];
const REPLACED_PARAMETERS = ['restart'];
const CALLED_HOLDERS = ['gate', 'source', 'action'];
const ASKING_WORKERS = new Set(['run-form', 'collect-input', 'ask-choice', 'confirm-form', 'collect-contextual-answer']);

const isTarget = (value) => typeof value === 'string' && value !== '' && !value.includes('{{');

function walk(node, visit) {
   if (Array.isArray(node)) { node.forEach((item) => walk(item, visit)); return; }
   if (!node || typeof node !== 'object') return;
   visit(node);
   Object.values(node).forEach((value) => walk(value, visit));
}

/** Every edge of one flow: { to, kind: 'call'|'replace'|'return', via } and whether the flow itself can put a question. */
function flowEdges(flow, resolve, returning, isReplaceTarget) {
   const edges = [];
   let asks = false;
   const add = (target, kind, via, toParent = false) => {
      const id = resolve(target);
      if (!id || WORKER_FLOW_IDS.has(id)) return;
      if (kind === 'replace' && toParent && isReplaceTarget(id)) kind = 'return';   // to the waiting frame: no growth, still a lap
      if (!edges.some((edge) => edge.to === id && edge.kind === kind)) edges.push({ to: id, kind, via });
   };
   walk(flow.steps || [], (step) => {
      if (step.type === 'SAY-GET') asks = true;
      if (step.type === 'FLOW' && isTarget(step.value)) {
         if (ASKING_WORKERS.has(step.value)) asks = true;
         if ((step.callType || 'call') !== 'reboot') add(step.value, step.callType || 'call', 'step', step.toParent === true);
      }
      if (step.onFail && step.onFail.type === 'FLOW' && !step.onFail.callType && isTarget(step.onFail.value)) add(step.onFail.value, 'replace', 'onFail');
   });
   walk(flow, (node) => {
      if (typeof node.name === 'string' && (node.profile || node.form || node.after)) {
         for (const key of CALLED_INPUT_KEYS) if (isTarget(node[key])) add(node[key], 'call', key);
      }
      if (node.proposal && typeof node.proposal === 'object') {
         for (const key of ['prepare', 'on_declined']) if (isTarget(node.proposal[key])) add(node.proposal[key], 'call', 'proposal.' + key);
      }
      for (const key of CALLED_HOLDERS) if (node[key] && typeof node[key] === 'object' && isTarget(node[key].flow)) add(node[key].flow, 'call', key + '.flow');
      if (node.type === 'FLOW' && (node.callType || 'call') !== 'reboot' && node.parameters && typeof node.parameters === 'object') {
         for (const key of CALLED_PARAMETERS) if (isTarget(node.parameters[key])) add(node.parameters[key], 'call', key);
         for (const key of REPLACED_PARAMETERS) if (isTarget(node.parameters[key])) add(node.parameters[key], 'replace', key);
         // A retry reboots unless the caller asks for it to return: then the callee replaces its frame with the retry flow.
         if (node.parameters.retry_returns === true && isTarget(node.parameters.retry_flow) && isTarget(node.value) && resolve(node.value)) returning.push({ from: resolve(node.value), to: node.parameters.retry_flow });
      }
   });
   return { edges, asks };
}

function stronglyConnected(graph) {
   let index = 0;
   const stack = [], onStack = new Set(), order = new Map(), low = new Map(), groups = [];
   const visit = (v) => {
      order.set(v, index); low.set(v, index); index++; stack.push(v); onStack.add(v);
      for (const { to } of graph.get(v) || []) {
         if (!graph.has(to)) continue;
         if (!order.has(to)) { visit(to); low.set(v, Math.min(low.get(v), low.get(to))); }
         else if (onStack.has(to)) low.set(v, Math.min(low.get(v), order.get(to)));
      }
      if (low.get(v) === order.get(v)) {
         const group = [];
         let w;
         do { w = stack.pop(); onStack.delete(w); group.push(w); } while (w !== v);
         groups.push(group);
      }
   };
   for (const v of graph.keys()) if (!order.has(v)) visit(v);
   return groups;
}

/**
 * The traps of a set of flows: [{ kind: 'stack_growth'|'spin', flows, edges: ['a -call-> b', …] }], each once.
 * `stack_growth`: a loop holding at least one call. `spin`: a loop of replaces, or one closed by a REPLACE of the parent, where no flow can reach a question.
 */
export function findFlowTraps(flows) {
   const byName = new Map();
   for (const flow of flows) { byName.set(flow.id, flow.id); if (flow.name) byName.set(flow.name, flow.id); }
   const graph = new Map(), asks = new Map(), returning = [];
   const markedTargets = new Set(flows.filter((flow) => flow.replaceTarget === true).map((flow) => flow.id));
   const bounded = new Set(flows.filter((flow) => typeof flow.loopBound === 'string' && flow.loopBound.trim()).map((flow) => flow.id));
   for (const flow of flows) {
      if (WORKER_FLOW_IDS.has(flow.id)) continue;
      const read = flowEdges(flow, (target) => byName.get(target), returning, (id) => markedTargets.has(id));
      graph.set(flow.id, read.edges);
      asks.set(flow.id, read.asks);
   }
   for (const { from, to } of returning) {
      const target = byName.get(to), kind = markedTargets.has(target) ? 'return' : 'replace';
      if (target && graph.has(from) && !graph.get(from).some((edge) => edge.to === target && edge.kind === kind)) graph.get(from).push({ to: target, kind, via: 'retry_flow' });
   }
   const reachesQuestion = (start) => {
      const seen = new Set([start]), queue = [start];
      while (queue.length) {
         const v = queue.pop();
         if (asks.get(v)) return true;
         for (const { to } of graph.get(v) || []) if (!seen.has(to)) { seen.add(to); queue.push(to); }
      }
      return false;
   };
   const describe = (edge) => `${edge.from} -${edge.kind === 'call' ? 'call' : edge.kind === 'return' ? 'replace-parent' : 'replace'}${edge.via === 'step' ? '' : `(${edge.via})`}-> ${edge.to}`;
   const innerEdges = (group, edgesOf) => { const members = new Set(group); return group.flatMap((from) => edgesOf(from).filter((edge) => members.has(edge.to)).map((edge) => ({ from, ...edge }))); };
   const framed = (from) => (graph.get(from) || []).filter((edge) => edge.kind !== 'return');
   const traps = [];
   for (const group of stronglyConnected(new Map([...graph.keys()].map((from) => [from, framed(from)])))) {
      const inner = innerEdges(group, framed);
      if (!inner.length) continue;
      if (group.some((flow) => bounded.has(flow))) continue;   // a runtime limit ends this loop, and a test drives it there
      if (inner.some((edge) => edge.kind === 'call')) traps.push({ kind: 'stack_growth', flows: [...group].sort(), edges: inner.map(describe).sort() });
      else if (!group.some(reachesQuestion)) traps.push({ kind: 'spin', flows: [...group].sort(), edges: inner.map(describe).sort() });
   }
   // A REPLACE of the parent keeps the stack flat, but it is still a lap: with no question in reach it never ends.
   for (const group of stronglyConnected(graph)) {
      const inner = innerEdges(group, (from) => graph.get(from) || []);
      if (!inner.some((edge) => edge.kind === 'return') || group.some((flow) => bounded.has(flow)) || group.some(reachesQuestion)) continue;
      if (!traps.some((trap) => trap.kind === 'spin' && trap.flows.some((flow) => group.includes(flow)))) traps.push({ kind: 'spin', flows: [...group].sort(), edges: inner.map(describe).sort() });
   }
   return traps.sort((a, b) => a.flows[0].localeCompare(b.flows[0]));
}

/** One validator line per trap. */
export function formatFlowTrap(trap) {
   const what = trap.kind === 'stack_growth' ? 'grows the stack every lap' : 'loops with no question in reach';
   return `Flow trap: ${trap.flows.join(' + ')} ${what} (${trap.edges.join('; ')})`;
}
