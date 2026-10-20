/** Shared FORM semantics. Pure readers plus explicit mutations of the supplied session container; no host I/O. */
import { readInputProfile } from './match-inputs.js';
import {validateMoneyOptions} from './money.js';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export function formValuesEqual(a,b) {
   if(Object.is(a,b))return true;
   if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
   const ak=Object.keys(a),bk=Object.keys(b);
   return ak.length===bk.length&&ak.every(k=>own(b,k)&&formValuesEqual(a[k],b[k]));
}
export const hasFormValue = v => v !== undefined && v !== null && v !== '';
export function formPath(root, path) {
   return String(path || '').split('.').reduce((o, k) => forbidden.has(k) || o === undefined || o === null || !own(o, k) ? undefined : o[k], root);
}

/** Resolve once before the state is used by collection, validation or completion. */
export function resolveFormInputs(inputs, presets = {}) {
   if (!Array.isArray(inputs)) throw new Error('FORM inputs must be an array');
   const names = new Set();
   const resolve = raw => {
      if (!raw || typeof raw !== 'object' || !raw.name || forbidden.has(raw.name)) throw new Error('FORM input needs a safe name');
      if (names.has(raw.name)) throw new Error(`Duplicate FORM input ${raw.name}`);
      names.add(raw.name);
      if (raw.field && !own(presets, raw.field)) throw new Error(`Unknown FORM field preset ${raw.field}`);
      const input = { ...(raw.field ? presets[raw.field] : {}), ...raw };
      if(input.profile?.money!==undefined){if(input.profile.kind!=='amount')throw new Error('FORM money options require amount profile');validateMoneyOptions(input.profile.money);}
      validateFormExhaustion(input.on_exhausted);
      if (input.max_attempts !== undefined && (!Number.isInteger(input.max_attempts) || input.max_attempts < 1)) throw new Error('FORM max_attempts must be a positive integer');
      if (input.any_of) input.any_of = input.any_of.map(member=>resolve({...member,
         depends_on:[...new Set([...(input.depends_on || []),...(member.depends_on || [])])],
         reset_on:[...new Set([...(input.reset_on || []),...(member.reset_on || [])])],
         when:{...(input.when || {}),...(member.when || {})}}));
      if (!input.form && !input.profile && !input.any_of && !input.bind) throw new Error(`FORM input ${input.name} has no reader or worker`);
      return input;
   };
   const resolved=inputs.map(resolve);
   for(const input of resolved)if(input.activate!==undefined||input.activate_on!==undefined)validateFormActivation(input,resolved);
   return resolved;
}

/** Dormant entry is explicit: named descendant fields may propose local controllers, never ambient state. */
function validateFormActivation(input,specs) {
   if(!input.form||!input.activate||typeof input.activate!=='object'||Array.isArray(input.activate)||!Object.keys(input.activate).length||!Array.isArray(input.activate_on)||!input.activate_on.length)
      throw new Error(`FORM activation ${input.name} needs a subform, controllers and activate_on fields`);
   for(const [name,value] of Object.entries(input.activate)) {
      const controller=specs.flatMap(s=>s.any_of||[s]).find(s=>s.name===name);
      if(!controller?.profile||controller.form||controller.bind||name===input.name||!hasFormValue(value)||typeof value==='object')throw new Error(`FORM activation ${input.name} has invalid controller ${name}`);
      const reading=controller.profile.kind==='choice'&&(controller.profile.choices||[]).some(choice=>choice.key===value)?{value}:readInputProfile({...controller.profile,marked:false},value,true);
      if(!reading||!own(reading,'value')||!hasFormValue(reading.value)||!formValuesEqual(reading.value,value))throw new Error(`FORM activation ${input.name} has invalid controller value ${name}`);
   }
   for(const path of input.activate_on) {
      if(typeof path!=='string'||!path||path.split('.').some(name=>!name||forbidden.has(name)))throw new Error(`FORM activation ${input.name} has invalid entry field`);
      if(input.schema){let inputs=input.schema.inputs,entry;
         for(const name of path.split('.')){const group=inputs?.find(s=>s.name===name||s.any_of?.some(i=>i.name===name));entry=group?.any_of?.find(i=>i.name===name)||group;if(entry?.prepare||group?.prepare)throw new Error(`FORM activation ${input.name} entry ${path} requires preparation`);inputs=entry?.schema?.inputs;}
         if(!entry?.profile||entry.form)throw new Error(`FORM activation ${input.name} has unknown entry ${path}`);
      }
   }
}
function dormantActivation(spec,state,cargo) {
   if(spec.activate===undefined&&spec.activate_on===undefined)return null;
   validateFormActivation(spec,state.specs);
   return formCondition(spec,{...state.values,...spec.activate},cargo,state)===true?{form:state.id,input:spec.name,assignments:spec.activate}:null;
}

/** ONE condition language for selection, matching, unwinding and presentation. */
function formCondition(input, values = {}, cargo = {}, state = {}) {
   const value = key => key.startsWith('cargo.') || key.startsWith('form.') ? formPath({ cargo, form:state }, key) : values[key];
   if ((input.unless || []).some(key => hasFormValue(value(key)) && value(key) !== false)) return false;
   const conditions=Object.entries(input.when || {}).map(([key, wanted]) => {
      const have = String(value(key) ?? '');
      const list = [].concat(wanted).map(String);
      const yes = list.filter(v => !v.startsWith('!'));
      const matches=(!yes.length || yes.includes(have)) && list.filter(v => v.startsWith('!')).every(v => have !== v.slice(1));
      return matches ? true : !hasFormValue(value(key)) ? null : false;
   });
   return conditions.includes(false)?false:conditions.includes(null)?null:true;
}
export function formInputApplies(input, values = {}, cargo = {}, state = {}) {
   return formCondition(input,values,cargo,state)===true;
}
export function formInputFilled(input, state, cargo = {}, checking = new Set()) {
   if(checking.has(input.name))return false;
   checking=new Set(checking);checking.add(input.name);
   for(const name of input.depends_on || []) {
      if(name.startsWith('cargo.')||name.startsWith('form.')){if(!hasFormValue(formPath({cargo,form:state},name)))return false;continue;}
      const dependency=state.specs.find(s=>s.name===name||s.any_of?.some(i=>i.name===name));
      if(!dependency||!formInputFilled(dependency,state,cargo,checking))return false;
   }
   if (input.bind) {
      const v = formPath({ cargo }, input.bind);
      return hasFormValue(v) && v !== false;
   }
   const filled = name => !state.errors?.[name] && !state.pending?.[name] && hasFormValue(state.values[name]);
   return input.any_of ? input.any_of.some(i => formInputApplies(i,state.values,cargo,state)&&formInputFilled(i,state,cargo,checking)) : filled(input.name);
}
export function nextFormInput(state, cargo = {}) {
   if(!state)return '';
   const requirement=input=>input.required_when===undefined?true:formCondition({when:input.required_when},state.values,cargo,state);
   const relevant=(state.specs || []).filter(input=>formCondition(input,state.values,cargo,state)!==false&&requirement(input)!==false);
   const missing=relevant.filter(input=>formInputApplies(input,state.values,cargo,state)&&requirement(input)===true&&!formInputFilled(input,state,cargo));
   const ready=missing.find(input=>(input.depends_on || []).every(name=>name.startsWith('cargo.')||name.startsWith('form.')?hasFormValue(formPath({cargo,form:state},name)):formInputFilled(state.specs.find(s=>s.name===name)||{name},state,cargo)));
   return ready?.name || (missing.length||relevant.some(input=>formCondition(input,state.values,cargo,state)===null||requirement(input)===null)?'__blocked__':'');
}
export function formInputChain(forms, id, cargo = {}) {
   const out = [], seen = new Set();
   const walk=(target,scope,prefix='',prefixEs='',activation=null,entries=null)=>{
      if(!forms[target]||seen.has(target))return;
      seen.add(target);
      const state=forms[target];
      for(const spec of state.specs || []) {
         const condition=formCondition(spec,state.values,cargo,state);
         const dormant=condition!==true&&spec.form&&spec.schema?dormantActivation(spec,state,cargo):null;
         if(condition===false&&!dormant)continue;
         if(entries&&!entries.some(path=>path===spec.name||path.startsWith(spec.name+'.')||spec.any_of?.some(i=>path===i.name)))continue;
         if(spec.form&&spec.schema) {
            // A dormant ancestor nominates only these entries; nested inactive branches need their own contract.
            if(activation&&condition===false)continue;
            const child=openFormInstance(cargo,spec.form,spec.schema.inputs,{parent:target,input:spec.name,providers:spec.schema.provides,questions:spec.schema.questions,on_exhausted:spec.schema.on_exhausted});
            const childState=forms[child];
            if(state.values[spec.name]&&typeof state.values[spec.name]==='object'&&!Object.keys(childState.values).length) {
               childState.values=structuredClone(state.values[spec.name]);
               const snapshot=state.childResults?.[spec.name];
               childState.data=structuredClone(snapshot?.data || {});childState.prepared=structuredClone(snapshot?.prepared || {});childState.revision=Number(snapshot?.revision || 0);
               childState.accepted=structuredClone(snapshot?.accepted || Object.fromEntries(Object.keys(childState.values).map(name=>[name,{origin:'child',revision:0}])));
            }
            const childEntries=entries?entries.filter(path=>path.startsWith(spec.name+'.')).map(path=>path.slice(spec.name.length+1)):null;
            walk(child,scope,spec.label || prefix,spec.label_es || spec.label || prefixEs,activation||dormant,dormant?spec.activate_on:childEntries);
         } else for(const input of spec.any_of || [spec]) {
            if(entries&&!entries.includes(input.name))continue;
            if(formCondition(input,state.values,cargo,state)!==false&&!input.form&&input.profile)out.push({...input,
               ...(prefix?{label:`${prefix}: ${input.label || input.name}`,label_es:`${prefixEs || prefix}: ${input.label_es || input.label || input.name}`} : {}),
               ...(input.choices_from&&Array.isArray(state.data?.[input.choices_from])?{profile:{...input.profile,choices:state.data[input.choices_from]}}:{}),
               ...(activation?{activation}:{}),form:target,scope,...(spec.any_of?{group:spec.name,exclusive:spec.exclusive===true}:{}),value:state.values[input.name]});
         }
      }
   };
   while (id && forms[id] && !seen.has(id)) {
      const state = forms[id];
      walk(id,id);
      id = state.parent;
   }
   return out;
}

/** Attach the canonical field contract to every claim, including independent ambiguity groups. */
export function enrichFormMatches(matches,chain,form,names=[],asked='') {
   const enrich=h=>{
      const spec=chain.find(c=>c.form===h.form&&c.name===h.name)||{};
      return {...h,label:h.option_label||spec.label||h.name,label_es:h.option_label_es||spec.label_es||spec.label||h.name,
         validator:spec.validator||'',after:spec.after||'',validate_always:spec.validate_always===true,...(spec.activation?{activation:spec.activation}:{}),pii:spec.pii===true,current:h.form===form&&names.includes(h.name),asked};
   };
   return {...matches,hits:matches.hits.map(enrich),ambiguous:matches.ambiguous.map(enrich),remaining:(matches.remaining||[]).map(group=>group.map(enrich))};
}
/** Expand inferred controllers before normal ordering/validation. A slot's entry and controllers form one commit unit. */
export function expandFormActivations(cargo,hits=[]) {
   const result=hits.map(h=>({...h})),groups=new Map();
   for(const hit of result)if(hit.activation&&!hit.activation_group){const a=hit.activation,key=`${a.form}/${a.input}`;
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(hit);
   }
   for(const [key,entries] of groups){
      const a=entries[0].activation,state=cargo.forms?.[a.form],slot=state?.specs.find(s=>s.name===a.input);
      if(!state||!slot)throw new Error('FORM activation owner no longer exists');
      validateFormActivation(slot,state.specs);
      const controllers=[];let conflict=false;
      for(const [name,value] of Object.entries(slot.activate)){
         let hit=result.find(h=>h.form===state.id&&h.name===name&&!h.activation_inferred);
         if(hit&&!formValuesEqual(hit.value,value)){conflict=true;break;}
         if(!hit){const spec=state.specs.flatMap(s=>s.any_of||[s]).find(s=>s.name===name);
            hit={...spec,form:state.id,value,raw:String(value),utterance:entries[0].utterance,origin:'inferred',activation_inferred:true,current:false,silent:true};
            controllers.push(hit);
         }else controllers.push(hit);
      }
      if(conflict){for(const hit of entries){hit.invalid=true;hit.activation_conflict=true;}continue;}
      const members=entries.concat(controllers).map(h=>`${h.form}/${h.name}`);
      for(const hit of entries.concat(controllers)){hit.activation_group=key;hit.activation_members=members;if(hit.activation_inferred)hit.activation_entry={form:entries[0].form,name:entries[0].name,label:entries[0].label,label_es:entries[0].label_es,asked:entries[0].asked};}
      for(const hit of controllers)if(!result.includes(hit))result.push(hit);
   }
   return result;
}
/** No partial activation: validation failure suppresses inferred changes; pending prerequisites retain the complete group. */
export function settleFormActivations(batch={},cargo=null) {
   const accepted=[...(batch.accepted||[])],rejected=[...(batch.rejected||[])],pending=[...(batch.pending||[])];
   const all=accepted.concat(rejected,pending),keys=new Set(all.map(h=>h.activation_group).filter(Boolean));
   const held=new Set(),discarded=new Set();
   for(const key of keys){const group=all.filter(h=>h.activation_group===key),members=new Set(group.map(h=>`${h.form}/${h.name}`));
      if(rejected.some(h=>h.activation_group===key)||(group[0].activation_members||[]).some(name=>!members.has(name)))discarded.add(key);
      else if(pending.some(h=>h.activation_group===key))held.add(key);
   }
   if(cargo&&discarded.size)for(const state of Object.values(cargo.forms||{}))for(const [name,hit] of Object.entries(state.pending||{}))if(discarded.has(hit.activation_group))delete state.pending[name];
   return {accepted:accepted.filter(h=>!held.has(h.activation_group)&&!discarded.has(h.activation_group)),
      rejected:rejected.map(h=>h.activation_inferred?{...h,...h.activation_entry,activation_inferred:false}:h),pending:pending.concat(accepted.filter(h=>held.has(h.activation_group))).filter(h=>!discarded.has(h.activation_group)).map(h=>held.has(h.activation_group)?{...h,ok:undefined,outcome:'pending',silent:true}:h)};
}
/** Explicit ownership: unrelated tasks and sibling inputs never share an instance by definition id. */
export function openFormInstance(cargo, definition, specs, { parent = null, input = '', resume = '', task = '', providers = null, questions = null, context = false, incomplete_outcome = undefined, on_exhausted = undefined } = {}) {
   const incomplete=validateFormIncompleteOutcome(incomplete_outcome);
   validateFormExhaustion(on_exhausted);
   cargo.forms ||= {};
   const existing = resume && cargo.forms[resume];
   if (resume && !existing) throw new Error('FORM resume instance no longer exists');
   if (existing) {
      if (existing.definition !== definition || existing.parent !== parent || existing.result_input !== input || !!existing.context_only !== !!context || (task && existing.task !== task)) throw new Error('FORM resume ownership mismatch');
      if(incomplete_outcome!==undefined)existing.incomplete_outcome=incomplete;
      if(on_exhausted!==undefined)existing.on_exhausted=on_exhausted;
      return resume;
   }
   if (parent && !cargo.forms[parent]) throw new Error('FORM parent does not exist');
   const owner = parent ? cargo.forms[parent] : null;
   if (owner) {
      const child = context ? owner.contexts?.[definition] : owner.children?.[input];
      if (child && cargo.forms[child]) {
         if (cargo.forms[child].definition !== definition) throw new Error('FORM child definition changed without invalidation');
         if(incomplete_outcome!==undefined)cargo.forms[child].incomplete_outcome=incomplete;
         if(on_exhausted!==undefined)cargo.forms[child].on_exhausted=on_exhausted;
         return child;
      }
   }
   cargo.formSequence = Number(cargo.formSequence || 0) + 1;
   const id = `${definition}:${cargo.formSequence}`;
   cargo.forms[id] = { id, definition, task: owner?.task || task || id, parent, result_input: input,
      on_exhausted:on_exhausted || '', incomplete_outcome:incomplete, context_only:!!context, parent_revision:owner?.revision ?? null, specs, values: {}, accepted: {}, errors: {}, pending: {}, seeds:{}, attempts: {}, prepared: {}, data:{}, arguments:{}, contexts:{}, children: {}, childResults:{}, revision: 0,
      providers: providers || owner?.providers || null, questions: questions?.length ? questions : owner?.questions || [], status: 'collecting' };
   if (owner) {if(context){owner.contexts ||= {};owner.contexts[definition]=id;}else owner.children[input]=id;}
   return id;
}

/** An incomplete optional follow-up may preserve an explicitly completed task outcome. */
export function validateFormIncompleteOutcome(value) {
   if(value===undefined||value===null)return null;
   if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['outcome','reason'].includes(key))||!['resolved','unresolved','deflected'].includes(value.outcome)||typeof value.reason!=='string'||!value.reason.trim())throw new Error('FORM incomplete_outcome requires a valid outcome and a nonempty reason');
   return {outcome:value.outcome,reason:value.reason.trim()};
}
/** Only actual owned ancestors may provide a fallback; another task's outcome is irrelevant. */
export function formIncompleteOutcome(cargo,id,fallback={outcome:'unresolved',reason:'form_incomplete'}) {
   const seen=new Set();
   while(id&&cargo.forms?.[id]&&!seen.has(id)) {
      seen.add(id);const state=cargo.forms[id],declared=validateFormIncompleteOutcome(state.incomplete_outcome);
      if(declared)return {...declared,owner:id};
      id=state.parent;
   }
   return {...validateFormIncompleteOutcome(fallback),owner:''};
}

/** Explicit worker references only; recovery cannot contain an inline effect or caller expression. */
export function validateFormExhaustion(value) {
   if(value===undefined||value===null||value==='')return '';
   if(typeof value!=='string'||! /^[A-Za-z][A-Za-z0-9_-]*$/.test(value))throw new Error('FORM on_exhausted must name a worker');
   return value;
}
/** Resolve nearest declared owner, release only its exhausted input branch, and withdraw old consent.
 * A reboot to this worker unwinds the collector; no incomplete value is handed to an ancestor.
 * Recovery must deliberately collect another choice before resuming the preserved owning draft.
 */
export function exhaustFormInput(cargo,failed_form,failed_input='') {
   const seen=new Set();let id=failed_form,input=failed_input;
   while(id&&cargo.forms?.[id]&&!seen.has(id)) {
      seen.add(id);const state=cargo.forms[id];
      const group=(state.specs||[]).find(s=>s.name===input||s.any_of?.some(i=>i.name===input));
      const member=group?.any_of?.find(i=>i.name===input);
      const flow=validateFormExhaustion(member?.on_exhausted||group?.on_exhausted||state.on_exhausted);
      if(flow) {
         const result={flow,form:id,failed_form,input,failed_input,reason:'attempts_exhausted'};
         if(input){resetFormInputs(cargo,id,[input]);delete state.attempts[input];for(const member of group?.any_of||[])delete state.attempts[member.name];}
         else {resetFormInputs(cargo,id,state.specs.map(spec=>spec.name));state.attempts={};}
         state.validationAttempts=0;state.confirmation=null;
         delete cargo.formConfirm?.[id];
         return result;
      }
      input=state.context_only?'':state.result_input;id=state.parent;
   }
   return null;
}

/** Activation values are queued for the same validator flow as conversational readings. */
export function rememberFormArguments(state,supplied,names,resume=false) {
   state.arguments ||= {};
   if(!resume)for(const name of names)if(hasFormValue(supplied[name]))state.arguments[name]=structuredClone(supplied[name]);
   return state.arguments;
}
export function formInitialReadings(state, supplied = {},cargo={}) {
   const hits = [];
   // Named initial fields have no ambiguity to resolve. Conditions are evaluated against validated
   // predecessors by the common batch, so a new controller is never hidden by its old committed value.
   for (const group of state.specs || []) for (const input of group.any_of || [group]) {
      if (!own(supplied,input.name)||!hasFormValue(supplied[input.name])||!input.profile)continue;
      const value=supplied[input.name];
      const reading=typeof value==='object'?null:input.profile.kind==='choice'&&(input.profile.choices||[]).some(c=>c.key===String(value))
         ?{value:String(value)}:readInputProfile({...input.profile,marked:false},value,true);
      const valid=reading&&own(reading,'value')&&hasFormValue(reading.value);
      hits.push({...input,label:input.label||input.name,label_es:input.label_es||input.label||input.name,form:state.id,
         value:valid?reading.value:value,...(reading?.refused===true?{refused:true}:{}),invalid:!valid,known:false,current:true,origin:'activation',raw:String(value),utterance:String(supplied.userInput||'')});
   }
   const projected=proposedFormValues(cargo,state.id,hits.filter(h=>!h.invalid));
   for(const group of state.specs||[]){
      const nested=supplied[group.name];
      if(!group.form||!nested||typeof nested!=='object'||Array.isArray(nested))continue;
      const condition=formCondition(group,projected,cargo,state),inactive=formCondition(group,state.values,cargo,state)!==true;
      const nominated=group.activate_on?.some(path=>hasFormValue(formPath(nested,path)));
      const activation=inactive&&nominated?dormantActivation(group,{...state,values:projected},cargo):null;
      if(!group.schema||condition===false&&!activation||inactive&&group.activate&&!activation&&condition!==true){state.seeds[group.name]=nested;continue;}
      const child=openFormInstance(cargo,group.form,group.schema.inputs,{parent:state.id,input:group.name,providers:group.schema.provides,questions:group.schema.questions,on_exhausted:group.schema.on_exhausted});
      const readings=formInitialReadings(cargo.forms[child],{...nested,userInput:supplied.userInput||nested.userInput||''},cargo);
      // Every explicitly supplied descendant participates in the same atomic subform change. A
      // nominated entry is still required to propose controllers; bare ancillary values cannot do so.
      hits.push(...readings.map(hit=>activation?{...hit,activation}:hit));
   }
   return hits;
}

/** One exclusive group is clarified at a time; independent readings continue through the same protocol. */
export function exclusiveFormReadings(cargo,hits=[]) {
   for(const hit of hits){
      const group=cargo.forms?.[hit.form]?.specs.find(s=>s.exclusive&&s.any_of?.some(i=>i.name===hit.name));
      if(!group)continue;
      const members=new Set(group.any_of.map(i=>i.name));
      const ambiguous=hits.filter(h=>h.form===hit.form&&members.has(h.name));
      if(new Set(ambiguous.map(h=>h.name)).size>1)return {ambiguous,hits:hits.filter(h=>!ambiguous.includes(h))};
   }
   return {ambiguous:[],hits};
}
export function orderFormReadings(cargo, hits = []) {
   const result = [], pending = hits.slice();
   const dependencies = h => {
      const spec=cargo.forms?.[h.form]?.specs.flatMap(s=>s.any_of||[s]).find(s=>s.name===h.name)||{};
      return [...formReadingDependencies(cargo,h),...(spec.reset_on||[]),...Object.keys(spec.when||{}).filter(k=>!k.startsWith('cargo.')&&!k.startsWith('form.'))];
   };
   const blocks=(h,other)=>{
      if(other.form===h.form&&other.name!==h.name&&dependencies(h).includes(other.name))return true;
      let state=cargo.forms?.[h.form];const seen=new Set();
      while(state?.parent&&!seen.has(state.parent)){seen.add(state.parent);const parent=cargo.forms[state.parent];const spec=parent?.specs.find(s=>s.name===state.result_input);
         if(parent&&other.form===parent.id&&[...(spec?.depends_on||[]),...(spec?.reset_on||[]),...Object.keys(spec?.when||{})].includes(other.name))return true;
         state=parent;
      }return false;
   };
   while (pending.length) {
      const i = pending.findIndex(h => !pending.some(other => blocks(h,other)));
      if (i < 0) throw new Error('FORM candidate dependencies contain a cycle');
      result.push(pending.splice(i, 1)[0]);
   }
   return result;
}
export function formReadingDependencies(cargo, hit) {
   const spec = cargo.forms?.[hit.form]?.specs.flatMap(s => s.any_of || [s]).find(s => s.name === hit.name) || {};
   return spec.depends_on || [];
}
export function rejectFormReadings(cargo, hits = []) {
   for (const hit of hits) {
      const state = cargo.forms?.[hit.form];
      if (!state) throw new Error('FORM rejection requires an existing instance');
      state.errors ||= {};
      state.errors[hit.name] = hit.message || 'invalid';
      delete state.pending[hit.name];
      state.confirmation = null;
   }
   return true;
}
export function proposedFormValues(cargo, id, accepted = []) {
   return Object.assign({}, cargo.forms?.[id]?.values, ...accepted.filter(h => h.form === id).map(h => ({ [h.name]: h.value })));
}
export function formReadingRelevant(cargo,hit,accepted=[]) {
   let state=cargo.forms?.[hit.form];if(!state)return false;
   const input=state.specs.flatMap(s=>s.any_of||[s]).find(s=>s.name===hit.name);
   if(!input||formCondition(input,proposedFormValues(cargo,state.id,accepted),cargo,state)===false)return false;
   const seen=new Set();while(state.parent&&!seen.has(state.parent)){
      seen.add(state.parent);const parent=cargo.forms[state.parent];if(state.context_only){if(!parent)return false;state=parent;continue;}const slot=parent?.specs.find(s=>s.name===state.result_input);
      if(!parent||!slot||formCondition(slot,proposedFormValues(cargo,parent.id,accepted),cargo,parent)===false)return false;
      state=parent;
   }return true;
}
export function formReadingReady(cargo,hit,accepted=[],rejected=[]) {
   const state=cargo.forms?.[hit.form];if(!state)return false;
   const spec=state.specs.flatMap(s=>s.any_of||[s]).find(s=>s.name===hit.name);if(!spec)return false;
   const values=proposedFormValues(cargo,hit.form,accepted);
   const errors={...state.errors},pending={...state.pending};
   for(const h of accepted.filter(h=>h.form===hit.form)){delete errors[h.name];delete pending[h.name];}
   for(const h of rejected.filter(h=>h.form===hit.form))errors[h.name]='invalid';
   const projected={...state,values,errors,pending};
   const dependencies=spec.depends_on || [];
   const ready=(input,owner)=>formInputApplies(input,owner.values,cargo,owner)&&(input.depends_on||[]).every(name=>{
      if(name.startsWith('cargo.')||name.startsWith('form.'))return hasFormValue(formPath({cargo,form:owner},name));
      const dependency=owner.specs.find(s=>s.name===name||s.any_of?.some(i=>i.name===name));
      return !!dependency&&formInputFilled(dependency,owner,cargo);
   });
   if(!ready(spec,projected))return false;
   // Preparations (for example sending an OTP) observe committed prerequisites only.
   const group=state.specs.find(s=>s.any_of?.some(i=>i.name===hit.name));
   if(spec.prepare||group?.prepare){
      if(!ready(spec,state))return false;
      const context=[...dependencies,...(spec.reset_on||[]),...Object.keys(spec.when||{})];
      if(accepted.some(h=>h.form===state.id&&context.includes(h.name)&&!formValuesEqual(state.values[h.name],h.value)))return false;
   }
   let ancestor=state;const seen=new Set();
   while(ancestor.parent&&!seen.has(ancestor.parent)){
      seen.add(ancestor.parent);const parent=cargo.forms[ancestor.parent];if(!parent)return false;
      if(ancestor.context_only){ancestor=parent;continue;}
      const parentSpec=parent.specs.find(s=>s.name===ancestor.result_input);if(!parentSpec)return false;
      const activation=hit.activation_group===`${parent.id}/${parentSpec.name}`;
      const projectedParent=activation?{...parent,values:proposedFormValues(cargo,parent.id,accepted),errors:{...parent.errors},pending:{...parent.pending}}:parent;
      if(activation)for(const h of accepted.filter(h=>h.form===parent.id&&h.activation_group===hit.activation_group)){delete projectedParent.errors[h.name];delete projectedParent.pending[h.name];}
      if(!ready(parentSpec,projectedParent)||activation&&(parentSpec.prepare&&!parent.prepared[parentSpec.name]||(spec.prepare||group?.prepare)&&accepted.some(h=>h.form===parent.id&&h.activation_group===hit.activation_group&&!formValuesEqual(parent.values[h.name],h.value))))return false;
      const context=[...(parentSpec.depends_on||[]),...(parentSpec.reset_on||[]),...Object.keys(parentSpec.when||{})];
      if(accepted.concat(rejected).some(h=>h.form===parent.id&&context.includes(h.name)&&(!h.ok||!formValuesEqual(parent.values[h.name],h.value))&&!(activation&&h.ok&&h.activation_group===hit.activation_group&&own(parentSpec.activate,h.name))))return false;
      ancestor=parent;
   }
   return true;
}
export function formPreparation(cargo,id,input) {
   const state=cargo.forms?.[id],group=state?.specs.find(s=>s.name===input||s.any_of?.some(i=>i.name===input));
   const member=group?.any_of?.find(i=>i.name===input);
   const spec=member?.prepare?member:group;
   return spec?.prepare&&!state.prepared[spec.name]?{flow:spec.prepare,input:spec.name}:null;
}
export function queueFormReadings(cargo,hits=[]) {
   for(const hit of hits){const state=cargo.forms?.[hit.form];if(!state)throw new Error('Pending candidate has no owning form');state.pending[hit.name]={...hit,outcome:'pending'};}
   return true;
}
export function pendingFormReadings(cargo,id) {
   const out=[],seen=new Set();
   const walk=key=>{const state=cargo.forms?.[key];if(!state||seen.has(key))return;seen.add(key);
      for(const [slot,seed] of Object.entries(state.seeds||{})){
         const spec=state.specs.find(s=>s.name===slot);
         if(spec?.schema){const readings=formInitialReadings(state,{[slot]:seed},cargo);
            if(readings.length){queueFormReadings(cargo,expandFormActivations(cargo,readings));delete state.seeds[slot];}}
      }
      for(const h of Object.values(state.pending||{}))if(!h.activation_group&&formReadingReady(cargo,h))out.push({...h,fromPending:true});
      for(const child of Object.values(state.children||{}).concat(Object.values(state.contexts||{})))walk(child);
   };walk(id);
   const task=cargo.forms?.[id]?.task,groups=new Map();
   for(const state of Object.values(cargo.forms||{}))if(state.task===task)for(const h of Object.values(state.pending||{}))if(h.activation_group){if(!groups.has(h.activation_group))groups.set(h.activation_group,[]);groups.get(h.activation_group).push(h);}
   for(const group of groups.values()){const proposed=group.filter(h=>h.activation_inferred).map(h=>({...h,ok:true}));
      if(group.every(h=>formReadingReady(cargo,h,proposed)))out.push(...group.map(h=>({...h,fromPending:true})));}
   return orderFormReadings(cargo,out);
}
export function formWorkLimit(cargo,id) {
   const ancestors=new Set();while(cargo.forms?.[id]?.parent&&!ancestors.has(id)){ancestors.add(id);id=cargo.forms[id].parent;}
   const seen=new Set();let fields=0;
   const count=specs=>{for(const spec of specs||[]){fields+=(spec.any_of||[spec]).length;if(spec.schema)count(spec.schema.inputs);}};
   const walk=key=>{const state=cargo.forms?.[key];if(!state||seen.has(key))return;seen.add(key);
      for(const spec of state.specs){fields+=(spec.any_of||[spec]).length;const child=state.children[spec.name];if(child)walk(child);else if(spec.schema)count(spec.schema.inputs);}
      for(const context of Object.values(state.contexts || {}))walk(context);
   };walk(id);return 3*Math.max(1,fields)+3;
}
export function applyFormValidation(cargo,id,result) {
   const state=cargo.forms?.[id];
   if(!state)return 'failed';
   if(result?.ok===true){state.validationAttempts=0;return 'valid';}
   if(result?.ok!==false||!Array.isArray(result.invalid)||!result.invalid.length)return 'failed';
   const names=new Set(state.specs.flatMap(s=>s.any_of||[s]).map(s=>s.name));
   if(result.invalid.some(i=>!names.has(i.name)))return 'failed';
   rejectFormReadings(cargo,result.invalid.map(i=>({...i,form:id})));
   state.validationAttempts=Number(state.validationAttempts||0)+1;
   return state.validationAttempts>3?'failed':'retry';
}

/** Invalidation is transitive and independent of declaration order. */
export function invalidateFormInputs(cargo, id, changed, preserve = [], preserveNodes = []) {
   const state = cargo.forms?.[id];
   if (!state) return [];
   const invalid = new Set(), pending = new Set(changed), kept = new Set(preserve);
   for (;;) {
      let added = false;
      for (const spec of state.specs || []) {
         if (!invalid.has(spec.name) && [...(spec.reset_on || []),...(spec.depends_on || [])].some(name => pending.has(name))) {
            invalid.add(spec.name); pending.add(spec.name); added = true;
         }
      }
      if (!added) break;
   }
   for (const name of invalid) {
      if (kept.has(name)) continue;
      const spec = state.specs.find(s => s.name === name);
      for (const input of spec?.any_of || [{ name }]) { delete state.values[input.name]; delete state.accepted[input.name]; delete state.prepared[input.name]; delete state.pending[input.name]; }
      delete state.prepared[name];
      delete state.pending[name];delete state.seeds[name];delete state.childResults[name];
      const child = state.children[name];
      if (child) {
         const ownsCandidate=key=>preserveNodes.some(target=>{let s=cargo.forms[target],seen=new Set();while(s&&!seen.has(s.id)){seen.add(s.id);if(s.id===key)return true;s=cargo.forms[s.parent];}return false;});
         const reset=key=>{const childState=cargo.forms[key];if(!childState)return;
            for(const nested of Object.values(childState.children||{}))if(ownsCandidate(nested))reset(nested);else closeFormInstance(cargo,nested,false);
            Object.assign(childState,{values:{},accepted:{},errors:{},pending:{},seeds:{},prepared:{},data:{},childResults:{},confirmation:null,revision:childState.revision+1});
         };
         if(ownsCandidate(child))reset(child);else closeFormInstance(cargo, child, false);
      }
   }
   if (changed.length) { state.revision++; state.confirmation = null; }
   return [...invalid];
}

/** An intentional retry resets the named inputs as well as all of their dependent state. Unknown actions stay held. */
export function resetFormInputs(cargo,id,names=[]) {
   const state=cargo.forms?.[id];if(!state)throw new Error('FORM reset requires an instance');
   const changed=[];
   for(const name of [].concat(names)){
      const spec=state.specs.find(s=>s.name===name||s.any_of?.some(member=>member.name===name));
      if(!spec)throw new Error(`Unknown FORM reset input ${name}`);
      const members=spec.name===name?spec.any_of||[spec]:spec.any_of.filter(member=>member.name===name);
      for(const input of members){changed.push(input.name);delete state.values[input.name];delete state.accepted[input.name];delete state.errors[input.name];delete state.pending[input.name];delete state.prepared[input.name];}
      delete state.prepared[spec.name];delete state.seeds[name];delete state.childResults[name];
      if(state.children[name])closeFormInstance(cargo,state.children[name],false);
   }
   invalidateFormInputs(cargo,id,changed);
   return true;
}
/** Commit only validated readings. Callers batch dependency-related candidates before invoking this transition. */
export function acceptFormReadings(cargo, hits, additionalCandidates=[]) {
   const groups = new Map();
   for (const hit of hits || []) {
      const state = cargo.forms?.[hit.form];
      if (!state || hit.ok !== true) throw new Error('FORM acceptance requires an existing instance and a validated value');
      const input = state.specs.flatMap(s => s.any_of || [s]).find(s => s.name === hit.name);
      if (!input || !hasFormValue(hit.value)) throw new Error('FORM acceptance names an unknown input or empty value');
      if (!groups.has(hit.form)) groups.set(hit.form, []);
      groups.get(hit.form).push(hit);
   }
   for (const [id, readings] of groups) {
      const state = cargo.forms[id];
      const cleared=[];
      for(const group of state.specs.filter(s=>s.exclusive&&s.any_of)){
         const selected=readings.filter(h=>group.any_of.some(i=>i.name===h.name));
         if(new Set(selected.map(h=>h.name)).size>1)throw new Error('Exclusive FORM alternatives require clarification');
         if(selected.length)for(const member of group.any_of){if(member.name!==selected[0].name){
            if(hasFormValue(state.values[member.name]))cleared.push(member.name);
            delete state.values[member.name];delete state.accepted[member.name];delete state.pending[member.name];delete state.errors[member.name];
         }}
      }
      const changed = [...cleared,...readings.filter(h => !formValuesEqual(state.values[h.name],h.value)).map(h => h.name)];
      const invalidating=changed.filter(name=>cleared.includes(name)||hasFormValue(state.values[name]));
      invalidateFormInputs(cargo, id, invalidating, readings.map(h => h.name),hits.concat(additionalCandidates).map(h=>h.form));
      if(changed.length&&!invalidating.length){state.revision++;state.confirmation=null;}
      for (const hit of readings) {
         state.values[hit.name] = hit.value;
         if (state.errors) delete state.errors[hit.name];
         delete state.pending[hit.name];
         state.acceptanceSequence=Number(state.acceptanceSequence || 0)+1;
         state.accepted[hit.name] = { revision: state.revision, sequence:state.acceptanceSequence, origin: hit.origin || 'answer' };
      }
      if(changed.length){
         let child=state;const seen=new Set();
         while(child.parent&&cargo.forms[child.parent]&&!seen.has(child.parent)){
            seen.add(child.parent);const parent=cargo.forms[child.parent],slot=child.result_input;
            if(child.context_only){child=parent;continue;}
            delete parent.values[slot];delete parent.accepted[slot];
            invalidateFormInputs(cargo,parent.id,[slot],[],hits.concat(additionalCandidates).map(h=>h.form));
            child=parent;
         }
      }
   }
   return true;
}
export function formInstanceApplies(cargo, id) {
   const state = cargo.forms?.[id];
   if (!state) return false;
   if (!state.parent) return true;
   const parent = cargo.forms[state.parent];
   if(state.context_only)return !!parent&&formInstanceApplies(cargo,parent.id);
   const input = parent?.specs.find(i => i.name === state.result_input);
   return !!input && formInputApplies(input, parent.values, cargo,parent) && !formInputFilled(input, parent, cargo);
}
export function closeFormInstance(cargo, id, handOn = true) {
   const state = cargo.forms?.[id];
   if (!state) return null;
   for (const child of Object.values(state.children || {}).concat(Object.values(state.contexts || {}))) closeFormInstance(cargo, child, false);
   const result = { ...state.values };
   const parent = state.parent && cargo.forms[state.parent];
   if (parent) {
      if(state.context_only)delete parent.contexts?.[state.definition];else delete parent.children[state.result_input];
      if (handOn&&!state.context_only) { acceptFormReadings(cargo,[{form:parent.id,name:state.result_input,value:result,ok:true,origin:'child'}]); parent.childResults[state.result_input]={accepted:structuredClone(state.accepted),data:structuredClone(state.data || {}),prepared:structuredClone(state.prepared || {}),revision:state.revision}; }
   }
   cargo.formResults ||= {};
   if (handOn) cargo.formResults[id] = result;
   if (cargo.formTasks?.[state.definition] === id) delete cargo.formTasks[state.definition];
   delete cargo.forms[id];
   return result;
}
