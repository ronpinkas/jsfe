/**
 * A deploy check: a change that can break a saved session must bump its declaration's major version. A saved session
 * continues across a minor or patch change, so an entry argument or a form input it may still hold must not disappear
 * without a major bump; neither may a shared data or function name without its entry's major bump. Removing a flow needs
 * no bump: a session standing in a flow that no longer exists is retired anyway.
 *
 *   continuationBreaks(previousFlows, nextFlows) → [{ id, removed: { parameters?, inputs?, data?, functions? } }]
 *     both arrays are the authored declarations (a set's .flows file); ordinary executable flows are not compared.
 * It reads names only: a change of meaning under the same name is still the author's to declare with a major bump.
 */
import {majorOf} from './declarations.js';

const parameterNames=parameters=>Array.isArray(parameters)?parameters.map(p=>p?.name).filter(Boolean):Object.keys(parameters||{});
const inputNames=inputs=>(inputs||[]).flatMap(input=>[input?.name,...inputNames(input?.any_of)]).filter(Boolean);
const missing=(before,after)=>{const keep=new Set(after);return [...new Set(before)].filter(name=>!keep.has(name));};

export function continuationBreaks(previousFlows,nextFlows){
 const next=new Map((nextFlows||[]).filter(flow=>flow&&flow.id).map(flow=>[flow.id,flow]));
 const breaks=[];
 for(const before of previousFlows||[]){
  const after=before&&next.get(before.id);
  if(!after||before.declarationVersion===undefined||majorOf(before.version)!==majorOf(after.version))continue;
  const removed={};
  if(before.library==='data'){const names=missing(Object.keys(before.data||{}),Object.keys(after.data||{}));if(names.length)removed.data=names;}
  else if(before.library==='functions'){const names=missing(Object.keys(before.functions||{}),Object.keys(after.functions||{}));if(names.length)removed.functions=names;}
  else{
   const parameters=missing(parameterNames(before.parameters),parameterNames(after.parameters));if(parameters.length)removed.parameters=parameters;
   const inputs=missing(inputNames(before.form?.inputs),inputNames(after.form?.inputs));if(inputs.length)removed.inputs=inputs;
  }
  if(Object.keys(removed).length)breaks.push({id:before.id,removed});
 }
 return breaks;
}
