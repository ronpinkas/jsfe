/**
 * A session as it is stored (jsfe 1.9.1). An open form instance carries its input specs, providers and questions, and
 * they are copies of what its definition (or its parent's schema) declares. Stored, each one that is an exact copy is
 * replaced by a named source (`derived`) and restored from the loaded flows on the next turn; anything else (a spec
 * built at run time) is stored as it is. Revision hashes are stored only for the definitions of open form instances,
 * the only ones read back (retireUnsafeContinuation). The session in memory is never changed.
 */
const FIELDS = { specs: 'inputs', providers: 'provides', questions: 'questions' };

/** Canonical JSON: key order is not part of a value (DynamoDB does not keep it). */
function canonical(value) {
   if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
   if (value && typeof value === 'object' && !(value instanceof Date)) return '{' + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
   return JSON.stringify(value === undefined ? null : value);
}

const parentSpec = (parent, input) => (Array.isArray(parent?.specs) ? parent.specs : []).flatMap(spec => spec?.any_of || [spec]).find(spec => spec?.name === input);

/** Where an instance's field comes from: 'definition' or 'parent' (a sub-form's schema, or an inherited value). */
function candidates(field, state, forms, definitionOf) {
   const definition = definitionOf(state.definition), parent = state.parent ? forms[state.parent] : null;
   const own = definition?.variables?.[FIELDS[field]]?.value;
   const inherited = field === 'specs' ? parentSpec(parent, state.result_input)?.schema?.inputs : parent?.[field];
   return [['definition', own], ['parent', inherited]];
}

export function storedSession(session, flows) {
   const forms = session?.cargo?.forms;
   if (!forms || typeof forms !== 'object' || !Object.keys(forms).length) return pruneRevisions(session, forms);
   const byId = new Map((flows || []).map(flow => [flow.id, flow]));
   const definitionOf = id => byId.get(id);
   const stored = {};
   for (const [id, state] of Object.entries(forms)) {
      if (!state || typeof state !== 'object') { stored[id] = state; continue; }
      const copy = { ...state }, derived = { ...(state.derived || {}) };
      for (const field of Object.keys(FIELDS)) {
         if (state[field] === undefined) continue;
         const value = canonical(state[field]);
         const hit = candidates(field, state, forms, definitionOf).find(([, source]) => source !== undefined && canonical(source) === value);
         if (hit) { derived[field] = hit[0]; delete copy[field]; } else { delete derived[field]; }
      }
      if (Object.keys(derived).length) copy.derived = derived; else delete copy.derived;
      stored[id] = copy;
   }
   return pruneRevisions({ ...session, cargo: { ...session.cargo, forms: stored } }, forms);
}

function pruneRevisions(session, forms) {
   const revisions = session?.continuationSafetyRevisions;
   if (!revisions || typeof revisions !== 'object') return session;
   const open = new Set(Object.values(forms || {}).map(state => state?.definition).filter(Boolean));
   return { ...session, continuationSafetyRevisions: Object.fromEntries(Object.entries(revisions).filter(([id]) => open.has(id))) };
}

/** Restore what storedSession replaced, in place, parents first. A source that no longer exists is left absent:
 * the definition changed or is gone, which the continuation safety check retires. */
export function restoreStoredSession(session, flows) {
   const forms = session?.cargo?.forms;
   if (!forms || typeof forms !== 'object') return session;
   const byId = new Map((flows || []).map(flow => [flow.id, flow]));
   const done = new Set();
   const restore = (id, trail = new Set()) => {
      const state = forms[id];
      if (done.has(id) || !state || typeof state !== 'object' || trail.has(id)) return;
      trail.add(id);
      if (state.parent) restore(state.parent, trail);
      const derived = state.derived;
      if (derived && typeof derived === 'object') {
         for (const [field, source] of Object.entries(derived)) {
            if (!(field in FIELDS) || state[field] !== undefined) continue;
            const value = candidates(field, state, forms, flowId => byId.get(flowId)).find(([name]) => name === source)?.[1];
            if (value !== undefined) state[field] = JSON.parse(JSON.stringify(value));
         }
         delete state.derived;
      }
      done.add(id);
   };
   for (const id of Object.keys(forms)) restore(id);
   return session;
}
