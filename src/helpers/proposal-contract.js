export const formProposalProtocol = () => 1;
/** Data-only authoring and runtime contract for input proposal confirmation. */
const safeName=value=>typeof value==='string'&&/^[A-Za-z0-9][\w.:-]*$/.test(value);
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const string=value=>typeof value==='string'&&!!value.trim();
const fail=message=>{throw new Error('FORM proposal '+message);};
export function validateProposalData(value,seen=new Set()) {
   if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
   if(!value||typeof value!=='object'||seen.has(value)||!Array.isArray(value)&&!plain(value))fail('binding must be finite, acyclic JSON data');
   seen.add(value);
   const array=Array.isArray(value),keys=Reflect.ownKeys(value);
   for(const key of keys){
      const property=Object.getOwnPropertyDescriptor(value,key);
      if(typeof key!=='string'||!Object.hasOwn(property,'value')||!property.enumerable&&!(array&&key==='length'))fail('must contain only enumerable JSON data properties');
      if(array&&key==='length')continue;
      if(['__proto__','prototype','constructor'].includes(key)||array&&!/^(0|[1-9]\d*)$/.test(key))fail('binding contains an unsafe key');
      validateProposalData(property.value,seen);
   }
   if(array&&keys.length!==value.length+1)fail('binding cannot contain array holes');
   seen.delete(value);return value;
}
const confirmationKeys=['question','question_es','binding','phrases','words','interrupts','no_keys','clarifications','on_declined'];
function confirmation(value,required) {
   if(required&&!string(value.question))fail('needs a nonempty question');
   for(const key of ['question','question_es'])if(value[key]!==undefined&&!string(value[key]))fail(key+' must be nonempty text');
   if(value.on_declined!==undefined&&!safeName(value.on_declined))fail('on_declined needs a static worker id');
   for(const key of ['phrases','words','no_keys','clarifications'])if(value[key]!==undefined&&(!Array.isArray(value[key])||!value[key].every(string)))fail(key+' must be an array of nonempty phrases');
   if(value.interrupts!==undefined){if(!Array.isArray(value.interrupts))fail('interrupts must be an array');const keys=new Set();for(const event of value.interrupts){if(!plain(event)||Object.keys(event).some(k=>!['key','phrases','words','flow','exact'].includes(k))||!safeName(event.key)||keys.has(event.key)||!safeName(event.flow)||!Array.isArray(event.phrases ?? event.words)||!(event.phrases ?? event.words).length||!(event.phrases ?? event.words).every(string)||event.exact!==undefined&&typeof event.exact!=='boolean')fail('invalid interrupt declaration');keys.add(event.key);}}
   if(value.binding!==undefined)validateProposalData(value.binding);
}
export function validateFormProposalPolicy(value) {
   validateProposalData(value);
   if(!plain(value)||Object.keys(value).some(key=>!['prepare','origins','when','unless',...confirmationKeys].includes(key)))fail('invalid input policy');
   if(value.prepare!==undefined&&!safeName(value.prepare))fail('prepare needs a static worker id');
   if(!value.prepare&&!string(value.question))fail('policy needs a prepare worker or question');
   if(value.origins!==undefined&&(!Array.isArray(value.origins)||!value.origins.length||new Set(value.origins).size!==value.origins.length||!value.origins.every(origin=>['activation','answer'].includes(origin))))fail('invalid origins');
   const path=key=>typeof key==='string'&&key.split('.').every(part=>/^[A-Za-z_$][\w$-]*$/.test(part)&&!['__proto__','prototype','constructor'].includes(part));
   const scalar=item=>item===null||typeof item==='string'||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item);
   if(value.when!==undefined&&(!plain(value.when)||Object.entries(value.when).some(([key,wanted])=>!path(key)||!(Array.isArray(wanted)?wanted.length&&wanted.every(scalar):scalar(wanted)))))fail('when must map safe paths to scalar conditions or nonempty scalar arrays');
   if(value.unless!==undefined&&(!Array.isArray(value.unless)||!value.unless.every(path)))fail('unless must be an array of safe paths');
   confirmation(value,false);return structuredClone(value);
}
export function validateFormProposalDescriptor(value) {
   validateProposalData(value);
   if(!plain(value)||Object.keys(value).some(key=>!confirmationKeys.includes(key)))fail('invalid decision descriptor');
   confirmation(value,true);return structuredClone(value);
}
/** Keep policy selectors out of the runtime decision descriptor; null is an explicit opt-out. */
export function formProposalDescriptor(policy,prepared=undefined) {
   if(!policy)return null;
   validateFormProposalPolicy(policy);
   if(policy.prepare && prepared===undefined)fail('prepare must explicitly return a descriptor or null');
   if(prepared===null)return null;
   if(prepared!==undefined)validateProposalData(prepared);
   if(prepared!==undefined&&(!prepared||typeof prepared!=='object'||Array.isArray(prepared)))fail('prepare must return a descriptor or null');
   const base=Object.fromEntries(confirmationKeys.filter(key=>policy[key]!==undefined).map(key=>[key,policy[key]]));
   return validateFormProposalDescriptor({...base,...prepared});
}
