/** Provider freshness is tied to the subject and to a successful write by the loader. */
import { formPath } from './form-state.js';
import { pickChoice } from './answer.js';
const present = value => value !== undefined && value !== null;
const subject = (cargo, source) => source.subject ? JSON.stringify(formPath({cargo}, source.subject) ?? null) : '';
export function sourceNeedsLoad(cargo, source, now = Date.now()) {
   if (!source?.result || !source.flow) throw new Error('Provider source needs a result path and loader');
   const have=formPath({cargo},source.result), at=cargo.sourceLoadedAt?.[source.result];
   if (!present(have)||!at||cargo.sourceLoadedFor?.[source.result]!==subject(cargo,source)) return true;
   return source.refresh==='per_turn'||(source.max_age_ms!==undefined&&now-at>=Number(source.max_age_ms));
}
export function beginSourceRefresh(cargo, source) {
   const keys=String(source.result || '').split('.');
   if(keys.shift()!=='cargo'||!keys.length||keys.some(k=>!k||['__proto__','constructor','prototype'].includes(k)))throw new Error('Provider result must be a safe cargo path');
   let target=cargo;
   for(const key of keys.slice(0,-1)){if(!target[key]||typeof target[key]!=='object')target[key]={};target=target[key];}
   delete target[keys[keys.length-1]];
   if(cargo.sourceLoadedAt)delete cargo.sourceLoadedAt[source.result];
   if(cargo.sourceLoadedFor)delete cargo.sourceLoadedFor[source.result];
   return true;
}
export function completeSourceRefresh(cargo, source, now = Date.now()) {
   if(!present(formPath({cargo},source.result)))return false;
   cargo.sourceLoadedAt ||= {};cargo.sourceLoadedFor ||= {};
   cargo.sourceLoadedAt[source.result]=now;cargo.sourceLoadedFor[source.result]=subject(cargo,source);
   return true;
}

/** Prefer the most specific positively matched catalog phrase over a contained broad fact alias.
 * Ordinary menu actions retain their own exact-choice rules. No match returns no fact. */
export function pickProviderQuestion(answer,questions=[]) {
   const matches=questions.flatMap((question,index)=>(question.phrases ?? question.words ?? []).flatMap(word=>
      pickChoice(answer,[{...question,phrases:[word]}],false)===question.key
         ? [{key:question.key,length:String(word).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().length,index}] : []));
   matches.sort((a,b)=>b.length-a.length||a.index-b.index);
   return matches[0]?.key || '';
}
