/** Host-owned invalidations survive replay of an older engine checkpoint. No domain paths are hard-coded. */
const clone=value=>JSON.parse(JSON.stringify(value));
const parts=path=>{
   const keys=String(path).split('.');
   if(keys[0]!=='cargo'||keys.length<2||keys.some(key=>!key||['__proto__','prototype','constructor'].includes(key)))throw new Error('Recovery policy requires a safe cargo path');
   return keys;
};
/** Call after changing or deleting host-owned state. Old overrides do not override a newer checkpoint. */
export function retainRecoveryState(session,paths) {
   if(!session)return;
   const previous=session.actionRecoveryPolicy || {revision:0,paths:{}};
   const revision=Number(previous.revision || 0)+1;
   const policy={revision,paths:{...previous.paths}};
   for(const path of paths){
      const keys=parts(path);let value=session,present=true;
      for(const key of keys){if(!value||typeof value!=='object'||!Object.hasOwn(value,key)){present=false;break;}value=value[key];}
      present=present&&value!==undefined;
      policy.paths[path]={revision,present,...(present?{value:clone(value)}:{})};
   }
   session.actionRecoveryPolicy=policy;
}
/** Apply only invalidations newer than the checkpoint, preserving JSON deletion tombstones. */
export function applyRecoveryStatePolicy(restored,current) {
   const policy=current?.actionRecoveryPolicy;
   if(!policy)return restored;
   const before=Number(restored.actionRecoveryPolicy?.revision || 0);
   for(const [path,entry] of Object.entries(policy.paths || {})){
      if(Number(entry.revision)<=before)continue;
      const keys=parts(path);let parent=restored;
      for(const key of keys.slice(0,-1)){if(!parent[key]||typeof parent[key]!=='object')parent[key]={};parent=parent[key];}
      if(entry.present)parent[keys.at(-1)]=clone(entry.value);else delete parent[keys.at(-1)];
   }
   restored.actionRecoveryPolicy=clone(policy);
   return restored;
}
