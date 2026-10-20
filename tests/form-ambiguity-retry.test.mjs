/** An unreadable ambiguity answer follows the same bounded, localized yield contract. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,formFlow,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const form=formFlow({id:'paired',name:'Paired',inputs:[{name:'sub',label:'sub account',label_es:'subcuenta',profile:{kind:'choice',choices:[{key:'62',words:['62']}]},question:'Sub account?',question_es:'¿Subcuenta?'},{name:'amount',field:'amount',confirm_against:['sub']}],after:[{id:'effect',type:'SET',variable:'noop',value:'(cargo.effect=true,true)'}]});
const quiet={info(){},debug(){},warn(){},error(){}};let checks=0;
for(const language of ['en','es']){
 const routed=[];const e=new WorkflowEngine(quiet,async(_s,_u,_j,request)=>{routed.push(request.input);return '{"flowName":"None"}';},linkFormSchemas([...FLOWS,form]),[],STANDARD_FUNCTIONS,{},false,language);e.disableCommands();let s=e.initSession('user',crypto.randomUUID(),language);s.cargo.voice=false;
 const say=async(content,start)=>{s=JSON.parse(JSON.stringify(await e.updateActivity({role:'user',content,...(start?{start:{flow:'paired'}}:{})},JSON.parse(JSON.stringify(s)))));return s.response||'';};
 await say('start',true);const id=s.cargo.formTasks.paired;let r=await say('62');assert.match(r,/62/);assert.equal(s.cargo.forms[id].values.sub,undefined);checks++;
 r=await say('zzz');assert.match(r,language==='es'?/^Disculpe, no le entendí\./:/^Sorry, I didn't catch that\./);assert.match(r,/62/);assert.equal(s.cargo.effect,undefined);checks++;
 await say('qqq');assert.equal(s.lastFlowOutcome.outcome,'pending');assert.equal(s.lastFlowRecovery.mode,'resume');assert.equal(s.lastFlowRecovery.form,id);assert.deepEqual(routed,['qqq']);assert.equal(s.cargo.effect,undefined);checks++;
 await say('start',true);await say('62');r=await say(language==='es'?'subcuenta':'sub account');assert.equal(s.cargo.forms[id].values.sub,'62');assert.doesNotMatch(r,/Disculpe|Sorry/);assert.equal(s.cargo.forms[id].values.amount,undefined);checks++;
 console.log('PASS '+language+' ambiguity retry, exact yield, retained owner and explicit field selection');
}
console.log(`Form ambiguity retry: all ${checks} checks passed`);
