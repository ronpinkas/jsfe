/** On the real engine, restatePendingQuestion says the waiting question again in the session's language (owner 2026-10-31:
 * a caller who switches language mid-flow hears the same question in the new language), and the flow still takes the
 * answer to it. A native form's input and a plain ask-choice, both directions; no waiting flow is null. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
function fixture(lang){
 const form=defineForm({id:'pet-name',name:'PetName',primary:true,description:'Name a pet',contract:{summary:'Name a pet'},
  inputs:[{name:'pet',label:'pet name',profile:{kind:'text'},question:'What is your pet called?',question_es:'¿Cómo se llama su mascota?'}],
  after:[{id:'keep',type:'SET',variable:'noop',value:'(cargo.pet=pet,true)'}]});
 const ask={id:'pick',name:'Pick',primary:true,description:'Pick',steps:[
  {id:'ask',type:'FLOW',value:'ask-choice',callType:'call',parameters:{question:'Press 1 or say YES to pay.',question_es:'Presione 1 o diga SÍ para pagar.',choices:[{key:'yes',exact:true,phrases:['pay']},{key:'no',phrases:[]}]}},
  {id:'keep',type:'SET',variable:'noop',value:'(cargo.picked=cargo.choice,true)'}]};
 const ai=async(system,user,schema,r)=>{if(r.task==='rank_reply')return JSON.stringify({option:'answers'});if(r.task==='detect_flow')return JSON.stringify({flowName:''});return JSON.stringify({parameters:{}});};
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,form,ask]),[],STANDARD_FUNCTIONS,{},false,lang);engine.disableCommands();engine.intentDetection='two-stage';
 let session=engine.initSession('synthetic',crypto.randomUUID(),lang);session.cargo.voice=true;
 return {engine,get session(){return session;},async say(content,flow){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(flow?{start:{flow,arguments:{}}}:{})},session)));return session.response||'';}};
}
await test('no flow waiting: null',async()=>{const t=fixture('en');assert.equal(t.engine.restatePendingQuestion(t.session),null);});
await test('form input en → es, then the answer is taken',async()=>{const t=fixture('en');assert.match(await t.say('start','pet-name'),/pet called/);
 t.session.language='es';assert.match(t.engine.restatePendingQuestion(t.session),/Cómo se llama su mascota/);assert.match(await t.say('Firulais'),/completado/);assert.equal(t.session.flowStacks.flat().length,0);});
await test('form input es → en',async()=>{const t=fixture('es');assert.match(await t.say('start','pet-name'),/mascota/);
 t.session.language='en';assert.match(t.engine.restatePendingQuestion(t.session),/What is your pet called/);});
await test('ask-choice es → en, then YES is taken',async()=>{const t=fixture('es');assert.match(await t.say('start','pick'),/SÍ para pagar/);
 t.session.language='en';assert.match(t.engine.restatePendingQuestion(t.session),/say YES to pay/);assert.equal(await t.say('yes'),'Flow completed.');assert.equal(t.session.cargo.picked,'yes');});
console.log(`restate pending question: all ${checks} checks passed`);
