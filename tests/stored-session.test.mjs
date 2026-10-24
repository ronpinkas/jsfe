/** storedSession (1.9.1): a stored session drops form-instance definition copies the loaded flows reproduce, keeps what they do not, and continues identically. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {FLOWS} from '../dist/forms/index.js';
let count=0;const test=async(name,body)=>{await body();console.log('PASS '+name);count++;};
const quiet={info(){},debug(){},warn(){},error(){}};
const ADDRESS={declarationVersion:2,id:'address-form',form:{inputs:[{name:'zip',label:'ZIP code',label_es:'código postal',question:'ZIP code?',question_es:'¿Código postal?',profile:{kind:'digits',min:5,max:5}}]}};
const ORDER={declarationVersion:2,id:'order-form',description:'The caller wants to order a plan.',primary:true,form:{inputs:[
   {name:'plan',label:'plan',label_es:'plan',question:'Which plan?',question_es:'¿Qué plan?',profile:{kind:'choice',choices:[{key:'gold',label:'Gold',label_es:'Oro',phrases:['gold']},{key:'basic',label:'Basic',label_es:'Básico',phrases:['basic']}]}},
   {name:'address',form:'address-form'},
   {name:'note',label:'note',label_es:'nota',question:'Any note?',question_es:'¿Alguna nota?',profile:{kind:'text'}}]},
   steps:undefined};
delete ORDER.steps;
const make=(flows=[ADDRESS,ORDER])=>{const e=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',[...FLOWS,...flows],[],STANDARD_FUNCTIONS,{},false,'en');e.disableCommands();return e;};
/** What DynamoDB hands back: the same values with every object's keys in a different order. */
const shuffled=v=>Array.isArray(v)?v.map(shuffled):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).reverse().map(k=>[k,shuffled(v[k])])):v;
const canon=v=>JSON.stringify(v,(k,val)=>val&&typeof val==='object'&&!Array.isArray(val)?Object.fromEntries(Object.keys(val).sort().map(key=>[key,val[key]])):val);
const stripDerived=s=>JSON.parse(JSON.stringify(s,(k,v)=>k==='derived'?undefined:v));

await test('a stored session holds no copies the flows reproduce, and a turn after storing answers as one that was never stored',async()=>{
   const a=make(),b=make();
   let mem=a.initSession('u','s1','en');
   const turn=async(engine,session,content,start)=>JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'order-form'}}:{})},session)));
   mem=await turn(a,mem,'order',true);
   mem=await turn(a,mem,'gold');
   const stored=shuffled(JSON.parse(JSON.stringify(a.storedSession(mem))));
   const states=Object.values(stored.cargo.forms);
   assert.ok(states.length>=2,'the form and its sub-form are open');
   for(const st of states){for(const f of ['specs','providers','questions'])assert.equal(st[f],undefined,`${st.id} stores no ${f}`);assert.ok(st.derived,'and names where they come from');}
   assert.deepEqual(Object.keys(stored.continuationSafetyRevisions).sort(),[...new Set(states.map(s=>s.definition))].sort(),'revision hashes only for open forms');
   console.log(`  stored ${JSON.stringify(stored).length} bytes, in memory ${JSON.stringify(mem).length}`);
   assert.ok(JSON.stringify(stored).length<JSON.stringify(mem).length,'smaller');
   assert.ok(mem.cargo.forms[states[0].id].specs,'the session in memory is unchanged');
   // Continue both: from memory, and from what was stored
   let x=JSON.parse(JSON.stringify(mem)),y=stored;
   for(const said of ['12345','no note']){x=await turn(a,x,said);y=await turn(b,y,said);assert.equal(y.response,x.response,'same answer to: '+said);}
   assert.equal(canon(stripDerived(y.cargo)),canon(stripDerived(x.cargo)),'same state after the turns');
});

await test('a value the flows do not reproduce is stored as it is',async()=>{
   const a=make();let s=a.initSession('u','s2','en');
   s=JSON.parse(JSON.stringify(await a.updateActivity({role:'user',content:'order',start:{flow:'order-form'}},s)));
   const id=Object.keys(s.cargo.forms).find(k=>s.cargo.forms[k].definition==='order-form');
   s.cargo.forms[id].specs=[...s.cargo.forms[id].specs,{name:'extra',label:'extra',question:'Extra?',profile:{kind:'text'}}];
   const stored=a.storedSession(s);
   assert.equal(stored.cargo.forms[id].specs.length,s.cargo.forms[id].specs.length);
   assert.equal(stored.cargo.forms[id].derived?.specs,undefined);
});

await test('a source that no longer exists is left absent, and the continuation is retired, not run on a guess',async()=>{
   const a=make();let s=a.initSession('u','s3','en');
   s=JSON.parse(JSON.stringify(await a.updateActivity({role:'user',content:'order',start:{flow:'order-form'}},s)));
   const stored=JSON.parse(JSON.stringify(a.storedSession(s)));
   const changed=make([ADDRESS,{...ORDER,description:'Changed: the caller orders a plan.'}]);
   const after=await changed.updateActivity({role:'user',content:'gold'},stored);
   assert.match(String(after.response||''),/changed|cambió/i,'the changed definition retires the continuation');
});

await test('a session never stored (older hosts) continues as before',async()=>{
   const a=make();let s=a.initSession('u','s4','en');
   s=JSON.parse(JSON.stringify(await a.updateActivity({role:'user',content:'order',start:{flow:'order-form'}},s)));
   const next=await a.updateActivity({role:'user',content:'gold'},shuffled(s));
   assert.ok(next.response);
});
console.log(`stored session: all ${count} checks passed`);
