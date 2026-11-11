/** CONCERN (owner 2026-11-11): a form that declares user_description offers the reply ranker `concern`; a concern says the
 * description, how to cancel (the global exit) and the question again, with no attempt counted. Without a description the
 * option is never offered. The nearest form in the chain that declares one is used. No network calls. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {buildReplyRank,decodeReplyRankSystemOne} from '../dist/host/index.js';
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
const DESC={user_description:'This will update the delivery address on order {{order}}.',user_description_es:'Esto actualizará la dirección de entrega del pedido {{order}}.'};
function fixture({describe=true,option='concern',language='en',voice=false,confirm=false,choice=false,nested=false}={}){
 const zip={name:'zip',label:'ZIP code',profile:{kind:'digits',min:5,max:5},question:'What is the ZIP code?',question_es:'¿Cuál es el código postal?'};
 const pick={name:'speed',label:'speed',profile:{kind:'choice',choices:[{key:'1',phrases:['standard']},{key:'2',phrases:['express']}]},question:'Standard or express?',question_es:'¿Normal o exprés?'};
 const sub=defineForm({id:'zip-form',name:'ZipForm',description:'Collect a ZIP code.',contract:{summary:'ZIP'},inputs:[zip]});
 const forms=[sub];
 const main=defineForm({id:'change',name:'Change',primary:true,description:'Change the delivery address',contract:{summary:'Change'},...(describe?DESC:{}),
  inputs:[{name:'order',label:'order',profile:{kind:'digits',min:3,max:3},question:'Order?'},nested?{name:'zip',form:'zip-form'}:choice?pick:zip],
  ...(confirm?{confirm:{question:'Change it now? Say YES or NO.',question_es:'¿Cambiarla ahora? Diga SÍ o NO.'}}:{}),
  after:[{id:'done',type:'SET',variable:'noop',value:'(cargo.changed=true,true)'}]});
 const giveUp={id:'give-up',name:'GiveUp',description:'A person takes over',parameters:[{name:'context',type:'string'},{name:'context_es',type:'string'}],steps:[{id:'gave-up',type:'SET',variable:'noop',value:'(cargo.gaveUp=true,true)'}]};
 const ranks=[];
 const ai=async(system,user,schema,r)=>{if(r && r.task==='rank_reply'){ranks.push(r);return JSON.stringify({option:r.options.includes(option)?option:'answers'});}if(/voice input cleaner/.test(system))return (String(user).match(/voice response: "([\s\S]*)"\n/)||[,String(user)])[1];return JSON.stringify({flowName:'None'});};
 const engine=new WorkflowEngine({info(){},debug(){},warn(){},error(){}},ai,linkFormSchemas([...FLOWS,...forms,main,giveUp]),[],STANDARD_FUNCTIONS,{},false,language);engine.disableCommands();
 let session=engine.initSession('synthetic',crypto.randomUUID(),language);session.cargo.voice=voice;
 return {ranks,get session(){return session;},async say(content,start){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'change',arguments:{}}}:{})},session)));return String(session.response||'');}};
}
const attempts=s=>Object.values(s.cargo.forms||{}).reduce((n,f)=>n+Object.values(f.attempts||{}).reduce((a,b)=>a+Number(b||0),0),0);
const CONCERN_EN_TEXT=/^This will update the delivery address on order 123\. To cancel, type EXIT\. /;
await test('the ranker is offered concern, and a concern explains, says how to cancel and asks again with no attempt',async()=>{
 const t=fixture();await t.say('go',true);assert.match(await t.say('123'),/ZIP code\?/);
 const r=await t.say("Not change address. It's delivery address I wanna change.");
 assert.match(r,CONCERN_EN_TEXT);assert.match(r,/What is the ZIP code\?$/);assert.doesNotMatch(r,/Sorry/);
 assert.ok(t.ranks.at(-1).options.includes('concern'));assert.equal(t.ranks.at(-1).concern,'This will update the delivery address on order 123.');
 assert.equal(attempts(t.session),0);
 assert.match(await t.say('90015'),/^$|.*/);assert.equal(t.session.cargo.changed,true,'the next answer still completes the form');
});
await test('voice and Spanish wording',async()=>{
 let t=fixture({voice:true});await t.say('go',true);await t.say('123');
 assert.match(await t.say('that is not what I asked for'),/^This will update the delivery address on order 123\. To cancel, press the asterisk key or say EXIT\. What is the ZIP code\?$/);
 t=fixture({language:'es',voice:true});await t.say('empezar',true);await t.say('123');
 assert.match(await t.say('no es una dirección nueva'),/^Esto actualizará la dirección de entrega del pedido 123\. Para cancelar, presione la tecla de asterisco o diga SALIR\. ¿Cuál es el código postal\?$/);
 t=fixture({language:'es'});await t.say('empezar',true);await t.say('123');
 assert.match(await t.say('no es una dirección nueva'),/Para cancelar, escriba SALIR\. ¿Cuál/);
});
await test('without user_description concern is never offered',async()=>{
 const t=fixture({describe:false});await t.say('go',true);await t.say('123');const r=await t.say('that is not what I asked for');
 assert.ok(!t.ranks.at(-1).options.includes('concern'));assert.match(r,/Sorry/);assert.equal(attempts(t.session),1);
});
await test('a sub-form without a description uses its parent form\'s',async()=>{
 const t=fixture({nested:true});await t.say('go',true);await t.say('123');
 assert.match(await t.say('that is not what I asked for'),CONCERN_EN_TEXT);
});
await test('at a choice question',async()=>{
 const t=fixture({choice:true});await t.say('go',true);await t.say('123');
 const r=await t.say('why are you asking me this, it is not a new address');
 assert.match(r,CONCERN_EN_TEXT);assert.match(r,/Standard or express\?$/);assert.equal(attempts(t.session),0);
});
await test('at the confirmation: explained, asked again, never confirmed, and never a step toward give-up',async()=>{
 const t=fixture({confirm:true});await t.say('go',true);await t.say('123');assert.match(await t.say('90015'),/Change it now/);
 for(let i=0;i<3;i++){const r=await t.say("It's not a new address. I'm just changing the delivery address.");
  assert.match(r,CONCERN_EN_TEXT);assert.match(r,/Change it now\? Say YES or NO\.$/);}
 assert.equal(t.session.cargo.changed,undefined);assert.equal(t.session.cargo.gaveUp,undefined);
 await t.say('yes');assert.equal(t.session.cargo.changed,true);
});
// The request and decoder: offered only with a description and never at a reason question; a top-scoring concern wins over a cleared choice.
{
 const choices=[{key:'1',label:'standard'}];
 assert.ok(!buildReplyRank('x',[],'Q?',choices).options.includes('concern'));
 const req=buildReplyRank('x',[],'Q?',choices,{concern:'This changes your address.'});assert.ok(req.options.includes('concern'));
 assert.ok(!buildReplyRank('x',[],'Q?',[],{concern:'This changes your address.',reasonFor:'the plan'}).options.includes('concern'));
 const answers=Object.fromEntries(req.systemOne.index.map(q=>[q.id,{noul:q.option==='concern'?0.8:q.option==='choice:1'?0.7:0.1}]));
 assert.equal(decodeReplyRankSystemOne(answers,req).option,'concern');
 const low=Object.fromEntries(req.systemOne.index.map(q=>[q.id,{noul:q.option==='concern'?0.55:0.1}]));
 assert.equal(decodeReplyRankSystemOne(low,req).option,'answers','below its 0.6 cut');checks++;
}
console.log(`Form concern: all ${checks} checks passed`);
