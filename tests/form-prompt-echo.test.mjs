/** On the real engine, an answer that repeats the confirmation's offered option ("Sí para cancelar" to "diga SÍ para cancelar")
 * is that option (owner 2026-10-31; prod 10-31 11:15). A form's firm confirmation and a plain ask-choice, English and
 * Spanish, voice and text; the partial echo, the echo of another option and a question never confirm. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
function fixture(lang,voice){
 const form=defineForm({id:'cancel-sub',name:'CancelSub',primary:true,description:'Cancel a subscription',contract:{summary:'Cancel a subscription'},
  inputs:[{name:'reason',label:'reason',profile:{kind:'text'},question:'Why?',question_es:'¿Por qué?'}],
  confirm:{question:"Just to confirm: you want to cancel your Credit Monitor. {{cargo.voice ? 'Press 1 or say' : 'Type'}} YES to cancel, or {{cargo.voice ? 'press 2 or say' : 'type'}} NO to keep it.",
   question_es:"Solo para confirmar: desea cancelar su suscripción a Monitoreo de Crédito. {{cargo.voice ? 'Presione 1 o diga' : 'Escriba'}} SÍ para cancelar, o {{cargo.voice ? 'presione 2 o diga' : 'escriba'}} NO para no cancelar.",
   phrases:['yes cancel','sí cancelar','si cancelar','quiero cancelar'],no:['keep it','no cancelar','mejor no']},
  after:[{id:'effect',type:'SET',variable:'noop',value:'(cargo.cancelled=true,true)'}]});
 const ask={id:'pick',name:'Pick',primary:true,description:'Pick',steps:[
  {id:'ask',type:'FLOW',value:'ask-choice',callType:'call',parameters:{question:'Type YES to submit it, or type NO.',question_es:'Escriba SÍ para enviarla, o escriba NO.',choices:[{key:'yes',exact:true,phrases:['submit']},{key:'no',phrases:[]}]}},
  {id:'keep',type:'SET',variable:'noop',value:'(cargo.picked=cargo.choice,true)'}]};
 const giveUp={id:'give-up',name:'GiveUp',description:'A person takes over',parameters:[{name:'context',type:'string'},{name:'context_es',type:'string'}],steps:[{id:'gave-up',type:'SET',variable:'noop',value:'(cargo.gaveUp=true,true)'}]};
 const ai=async(system,user,schema,r)=>{if(r.task==='rank_reply')return JSON.stringify({option:'answers'});if(r.task==='detect_flow')return JSON.stringify({flowName:''});return JSON.stringify({parameters:{}});};
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,form,ask,giveUp]),[],STANDARD_FUNCTIONS,{},false,lang);engine.disableCommands();engine.intentDetection='two-stage';
 let session=engine.initSession('synthetic',crypto.randomUUID(),lang);session.cargo.voice=voice;
 return {get session(){return session;},async say(content,flow){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(flow?{start:{flow,arguments:{}}}:{})},session)));return session.response||'';}};
}
async function atConfirm(lang,voice){const t=fixture(lang,voice);await t.say('start','cancel-sub');const r=await t.say(lang==='es'?'Ya no la uso':'I do not use it');assert.match(r,lang==='es'?/SÍ para cancelar/:/YES to cancel/);return t;}
for(const voice of [true,false]){
 await test(`es ${voice?'voice':'text'}: "Sí para cancelar" cancels`,async()=>{const t=await atConfirm('es',voice);await t.say('Sí para cancelar');assert.equal(t.session.cargo.cancelled,true);});
 await test(`en ${voice?'voice':'text'}: "Yes to cancel." cancels`,async()=>{const t=await atConfirm('en',voice);await t.say('Yes to cancel.');assert.equal(t.session.cargo.cancelled,true);});
 await test(`es ${voice?'voice':'text'}: "No para no cancelar" keeps it`,async()=>{const t=await atConfirm('es',voice);await t.say('No para no cancelar');assert.equal(t.session.cargo.cancelled,undefined);assert.deepEqual(Object.values(t.session.cargo.formConfirm||{}),['no']);});
}
for(const said of ['Sí para cancelar la cuenta de mi hermano','Sí para pagar','¿Sí para cancelar?']){
 await test(`es: "${said}" does not cancel`,async()=>{const t=await atConfirm('es',true);await t.say(said);assert.equal(t.session.cargo.cancelled,undefined);});
}
await test('the plain words still work: "Sí" cancels',async()=>{const t=await atConfirm('es',true);await t.say('Sí');assert.equal(t.session.cargo.cancelled,true);});
await test('ask-choice es: "Sí para enviarla" is YES',async()=>{const t=fixture('es',false);await t.say('start','pick');await t.say('Sí para enviarla');assert.equal(t.session.cargo.picked,'yes');});
await test('ask-choice en: "yes to submit it please" is YES',async()=>{const t=fixture('en',false);await t.say('start','pick');await t.say('yes to submit it please');assert.equal(t.session.cargo.picked,'yes');});
await test('ask-choice en: "Yes to submit" (partial) is not YES',async()=>{const t=fixture('en',false);await t.say('start','pick');await t.say('Yes to submit');assert.notEqual(t.session.cargo.picked,'yes');});
console.log(`form prompt echo: all ${checks} checks passed`);
