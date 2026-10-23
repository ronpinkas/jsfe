/** Compound contextual collection uses one routing decision. Fixture decisions measure orchestration, not accuracy. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS as SYSTEM,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const SYSTEM_FLOWS=SYSTEM;
const response={description:'The date or date period of the payment in the caller’s words, including unknown.'};
const inputs=[{name:'date',profile:{kind:'text',narrative:true},response,question:'What date did you pay?',validator:'validate-date'},
 {name:'method',profile:{kind:'choice',narrative:true,accept_other:true,choices:[{key:'Online',words:['online'],neutral:true},{key:'Phone',words:['phone'],neutral:true}]},response:{description:'How the payment was made.'},question:'How did you pay?',validator:'validate-method'}];
const noop=(id,value)=>({id,type:'SET',variable:'noop',value});
const workers=['date','method'].map(field=>({id:'validate-'+field,name:'Validate'+field,parameters:[{name:'form',type:'string'},{name:'value',type:'string'}],steps:[noop('validate',`(cargo.checked=(cargo.checked||[]).concat([{field:'${field}',value:value,committed:structuredClone(cargo.forms[form].values)}]),cargo.inputCheck={ok:${field==='method'?'cargo.rejectMethod !== true':'true'},value:value},true)`)]}));
const quiet={info(){},warn(){},error(){},debug(){}};
function fixture({choice='ContinueCurrent',reject=false}={}){
 const form=defineForm({id:'payment-report',name:'PaymentReport',description:'Synthetic payment report',contract:{summary:'Synthetic report'},inputs,after:[noop('complete','(cargo.completed=structuredClone(cargo.forms[form_instance].values),true)')]});
 const calls=[];
 const engine=new WorkflowEngine(quiet,async(_s,_u,_schema,request)=>{calls.push(request);return JSON.stringify(request.task==='detect_flow'?{flowName:choice}:{parameters:{answer:request.input}});},linkFormSchemas([...SYSTEM_FLOWS,form,...workers]),[],STANDARD_FUNCTIONS,{});engine.disableCommands();engine.intentDetection='two-stage';
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;session.cargo.rejectMethod=reject;
 return {calls,get session(){return session;},state(){return session.cargo.forms[session.cargo.formTasks['payment-report']];},async say(content,start=false){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'payment-report'}}:{})},session)));return session.response||'';}};
}
{
 const t=fixture();assert.match(await t.say('begin',true),/What date/);const raw='October 12, I paid online';await t.say(raw);
 assert.deepEqual(t.session.cargo.completed,{date:raw,method:'Online'});assert.equal(t.calls.filter(c=>c.task==='detect_flow').length,1);assert.equal(t.calls.filter(c=>c.task==='extract_parameters').length,1);
 assert.deepEqual(t.session.cargo.checked.map(c=>[c.field,c.value,c.committed]),[['date',raw,{}],['method','Online',{}]],'Both validators run before the atomic commit');
 console.log('PASS compound requested narrative and shaped sibling share one contextual decision and normal validation/commit');
}
{
 const t=fixture();await t.say('begin',true);const r=await t.say('online');assert.match(r,/What date/);assert.equal(t.state().values.method,'Online');assert.equal(t.state().values.date,undefined);assert.equal(t.calls.length,0);assert.equal(t.session.cargo.completed,undefined);
 console.log('PASS standalone out-of-order shaped sibling is collected without classifying it as the requested date');
}
{
 const t=fixture({choice:'None'});await t.say('begin',true);await t.say('Explain online security');assert.equal(t.state().values.date,undefined);assert.equal(t.state().values.method,undefined);assert.equal(t.session.cargo.checked,undefined);assert.equal(t.session.cargo.completed,undefined);assert.equal(t.session.lastTurnDispatch.matchedFlow,null);assert.equal(t.session.lastFlowRecovery.mode,'resume');assert.equal(t.calls.length,1);
 console.log('PASS uncertain compound yields actual DISPATCH before either field is committed');
}
{
 const t=fixture({reject:true});await t.say('begin',true);await t.say('October 12, I paid online');assert.equal(t.state().values.date,'October 12, I paid online');assert.equal(t.state().values.method,undefined);assert.equal(t.session.cargo.completed,undefined);assert.deepEqual(t.session.cargo.checked.map(c=>c.field),['date','method']);assert.equal(t.calls.filter(c=>c.task==='detect_flow').length,1);
 console.log('PASS independently matched sibling still runs its validator and a rejection prevents completion');
}
