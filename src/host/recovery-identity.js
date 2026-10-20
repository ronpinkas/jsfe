/** Immutable checkpoint compatibility. Browser and bundled Node hosts use the same stamped runtime. */
import {JSFE_RUNTIME_FINGERPRINT} from '../runtime-identity.js';
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const runtimeHash=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
export function assertActionRecoveryIdentity(value) {
   if(!value||value.protocol!==1||!runtimeHash(value.runtime)||!hex(value.definitions)||Object.keys(value).some(key=>!['protocol','runtime','definitions'].includes(key)))throw new Error('Invalid action recovery identity');
   return {protocol:1,runtime:value.runtime,definitions:value.definitions};
}
export function actionRecoveryIdentityMatches(current,stored) {
   try{const a=assertActionRecoveryIdentity(current),b=assertActionRecoveryIdentity(stored);return a.runtime===b.runtime&&a.definitions===b.definitions;}catch{return false;}
}
const canonical=value=>{
   const active=new Set();
   const visit=value=>{
      if(value===null||typeof value==='string'||typeof value==='boolean')return value;
      if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('Recovery contracts require finite JSON values');return value;}
      if(!value||typeof value!=='object'||active.has(value))throw new Error('Recovery contracts require acyclic JSON declarations');
      active.add(value);let result;
      if(Array.isArray(value))result=value.map(item=>item===undefined?null:visit(item));
      else {if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw new Error('Recovery contracts require plain JSON objects');result=Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,visit(value[key])]));}
      active.delete(value);return result;
   };
   return JSON.stringify(visit(value));
};
const registry=(entries,name)=>{
   if(!Array.isArray(entries))throw new Error('Recovery identity requires '+name+' registry');
   const seen=new Set();for(const entry of entries){if(!entry||typeof entry.id!=='string'||!entry.id||seen.has(entry.id))throw new Error('Recovery identity requires unique '+name+' IDs');seen.add(entry.id);}
   return [...entries].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
};
const select=(value,keys)=>Object.fromEntries(keys.filter(key=>value&&value[key]!==undefined).map(key=>[key,value[key]]));
const executionKeys=['type','function','url','method','contentType','pathParams','queryParams','responseMapping','timeout','retries','acceptStatus'];
function toolContract(tool) {
   const result=select(tool,['id','name','description','schema','parameters','returns']);
   if(tool.implementation){
      result.implementation=select(tool.implementation,executionKeys);
   }
   return result;
}
/** Compute once from immutable loaded declarations; callers must not mutate them after activation. */
export async function createActionRecoveryIdentity({flows,tools}) {
   if(!runtimeHash(JSFE_RUNTIME_FINGERPRINT))throw new Error('Durable action recovery requires a verified stamped JSFE build');
   const declarations={flows:registry(flows,'flow'),tools:registry(tools,'tool').map(toolContract)};
   const bytes=new TextEncoder().encode(canonical(declarations));
   const definitions=Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
   return Object.freeze({protocol:1,runtime:JSFE_RUNTIME_FINGERPRINT,definitions});
}
