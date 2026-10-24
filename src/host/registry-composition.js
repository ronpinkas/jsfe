/** Explicit registry composition for hosts that activate independently compiled native modules. No engine imports. */
export class JSFERegistryCompositionError extends Error {
   constructor(message) { super('Registry composition: '+message);this.name='JSFERegistryCompositionError';this.code='JSFE_REGISTRY_COMPOSITION'; }
}
const fail=message=>{throw new JSFERegistryCompositionError(message);};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);

/** Clone only declaration data. Do not invoke accessors, toJSON, custom iterators or user code. */
function cloneData(value,active=new Set()) {
   if(value===null||typeof value==='string'||typeof value==='boolean')return value;
   if(typeof value==='number'){if(!Number.isFinite(value))fail('declarations require finite JSON numbers');return value;}
   if(typeof value!=='object')fail('declarations require JSON data only');
   if(active.has(value))fail('declarations must be acyclic JSON data');
   if(!Array.isArray(value)&&!plain(value))fail('declarations require plain JSON objects');
   if(Array.isArray(value)&&Object.getPrototypeOf(value)!==Array.prototype)fail('declarations require plain JSON arrays');
   active.add(value);
   const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
   for(const key of keys){
      if(Array.isArray(value)&&key==='length')continue;
      const descriptor=descriptors[key];
      if(typeof key!=='string'||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail('declarations require enumerable JSON data properties');
      if(Array.isArray(value)&&(!/^(?:0|[1-9]\d*)$/.test(key)||Number(key)>=value.length))fail('JSON arrays cannot carry extra properties');
   }
   let result;
   if(Array.isArray(value)){
      result=[];
      for(let i=0;i<value.length;i++){if(!Object.hasOwn(descriptors,String(i)))fail('JSON arrays cannot be sparse');result.push(cloneData(descriptors[i].value,active));}
   }else result=Object.fromEntries(keys.map(key=>[key,cloneData(descriptors[key].value,active)]));
   active.delete(value);return result;
}

// All property order is conservative execution data: CASE branches and local-tool schema.properties use it.
// Tags distinguish actual arrays/objects/primitive values, including the executable difference between 0 and -0.
const canonical=value=>{
   if(value===null)return ['null'];
   if(Array.isArray(value))return ['array',value.map(canonical)];
   if(typeof value==='object')return ['object',Object.keys(value).map(key=>[key,canonical(value[key])])];
   return [typeof value,typeof value==='number'?(Object.is(value,-0)?'-0':String(value)):value];
};
const identity=(value,label)=>{if(typeof value!=='string'||!value||value.trim()!==value)fail(label+' must be a nonempty unpadded string');return value;};
function compose(registries,kind) {
   if(!Array.isArray(registries))fail(kind+' must be an array of registries');
   const definitions=new Map(),aliases=new Map(),result=[];
   for(const registry of registries){
      if(!Array.isArray(registry))fail(kind+' registry must be an array');
      for(const declaration of registry){
         const entry=declaration;
         if(!plain(entry))fail(kind+' entries must be declaration objects');
         const id=identity(entry.id,kind+' ID');
         const authored=kind==='flows'&&Object.hasOwn(entry,'declarationVersion');
         if(authored&&entry.declarationVersion!==1&&entry.declarationVersion!==2)fail('flow '+id+' has unsupported declarationVersion');
         // Composition preserves authored JSON; the engine compiles only after
         // all selected sets are available. Mirror the builder's conventional alias.
         const name=identity(authored&&entry.name===undefined?id.split(/[-:]/).map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(''):entry.name,kind+' name');
         if(kind==='flows'&&!Array.isArray(entry.steps)&&!(authored&&(entry.library==='functions'||entry.library==='data'||entry.form||entry.provides||entry.performs||entry.call||Array.isArray(entry.before)&&entry.before.length)))fail('flow '+id+' needs steps or a declarative form/provider/performer/worker');
         const bytes=JSON.stringify(canonical(entry));
         if(definitions.has(id)){if(definitions.get(id)!==bytes)fail('conflicting '+kind+' ID '+id);continue;}
         for(const alias of [id,name]){
            const owner=aliases.get(alias.toLowerCase());
            if(owner!==undefined&&owner!==id)fail('ambiguous '+kind+' ID/name alias '+alias+' between '+owner+' and '+id);
         }
         definitions.set(id,bytes);aliases.set(id.toLowerCase(),id);aliases.set(name.toLowerCase(),id);result.push(entry);
      }
   }
   return result;
}

/**
 * Explicit opt-in. composeRegistries({flows:[system,tenant,shared],tools:[systemTools,tenantTools,sharedTools]}).
 * Returns deep-cloned {flows,tools} in first-encounter order. Only identical canonical data under the same ID dedups;
 * different property/array order is a conservative conflict. Flow and tool resolution remain separate namespaces.
 * Declaration execution/schema validation remains the engine's responsibility. No existing loader calls this implicitly.
 */
export function composeRegistries(options) {
   if(!plain(options))fail('expected {flows:[registries],tools:[registries]}');
   const descriptors=Object.getOwnPropertyDescriptors(options);
   if(Reflect.ownKeys(descriptors).some(key=>!['flows','tools'].includes(key))||!descriptors.flows||!descriptors.tools||!Object.hasOwn(descriptors.flows,'value')||!Object.hasOwn(descriptors.tools,'value'))fail('expected flows and tools registry lists only');
   const data=cloneData(options);
   return {flows:compose(data.flows,'flows'),tools:compose(data.tools,'tools')};
}
