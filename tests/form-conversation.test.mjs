/** Behavioral contract: retries are conversational; yielding never authorizes an effect. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,formFlow,definePerformer,linkFormSchemas,providerQuestions} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {flowHandoffInfo,renderFlowRecovery} from '../dist/host/index.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const S=(id,value,variable='noop')=>({id,type:'SET',variable,value});
const C=(id,value,parameters={},callType='call')=>({id,type:'FLOW',value,parameters,callType});
const W=(id,steps,parameters=[])=>({id,name:id,version:'1',description:'Hermetic behavioral fixture '+id,scope:'isolated',parameters,steps});
const choice={name:'color',label:'color',label_es:'color',profile:{kind:'choice',choices:[{key:'red',words:['red','rojo'],exact:true}]},question_from:'menu',refresh:'refresh-menu'};
const refresh=W('refresh-menu',[S('refresh',"(cargo.forms[form].data.sequence=Number(cargo.forms[form].data.sequence||0)+1,cargo.forms[form].data.menu='MENU '+cargo.forms[form].data.sequence+': choose RED.',cargo.forms[form].data.menu_es='MENÚ '+cargo.forms[form].data.sequence+': diga ROJO.',true)")],[{name:'form',type:'string'}]);
const catalog={source:{flow:'load-fact',result:'cargo.fact',refresh:'per_turn'},facts:[{key:'balance',words:['balance','saldo'],path:'amount',say:'BALANCE {value}',say_es:'SALDO {value}',public:true}]};
const loader=W('load-fact',[S('load',"(cargo.fact={amount:17},cargo.factLoads=Number(cargo.factLoads||0)+1,true)")]);
const acknowledgment=language=>language==='es'?'Disculpe, no le entendí.':"Sorry, I didn't catch that.";
let checks=0;const failures=[];
async function test(name,run){try{await run();checks++;console.log('PASS '+name);}catch(error){failures.push({name,error});console.error('FAIL '+name+'\n'+error.stack);}}
function fixture(flows,{language='en',voice=false,route=()=>null,functions={},tools=[],sessionOnly=false,library=true}={}){
 const calls=[],warnings=[];
 const quiet={info(){},debug(){},error(){},warn(...args){warnings.push(args.join(' '));}};
 const ai=async(_system,_message,_schema,request)=>{if(request?.task==='rank_reply')return JSON.stringify({option:'new_request'});if(request?.task==='detect_flow'){calls.push(request.input);return JSON.stringify({flowName:route(request.input)||'None',parameters:{}});}throw new Error('Unexpected model task in hermetic fixture');};
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...(library?FLOWS:[]),...flows]),tools,{...STANDARD_FUNCTIONS,...functions},{},false,language);engine.disableCommands();if(sessionOnly)engine.actionPersistence='session-only';
 let session=engine.initSession('fixture',crypto.randomUUID(),language),lastInput,lastTransactions=[];Object.assign(session.cargo,{voice,account:'A',verified:true});
 return {engine,calls,warnings,get session(){return session;},get lastInput(){return lastInput;},get lastTransactions(){return lastTransactions;},async say(content,start){lastInput=clone(session);lastTransactions=lastInput.flowStacks.flat().map(frame=>frame.transaction);session=clone(await engine.updateActivity({role:'user',content,...(start?{start:typeof start==='string'?{flow:start}:start}:{})},lastInput));return session.response||'';},owner(id='menu'){return session.cargo.formTasks?.[id];}};
}
function menu(extra={}){return formFlow({id:'menu',name:'Menu',version:'1',inputs:[choice],after:[S('completed',"(cargo.finished=Number(cargo.finished||0)+1,true)")],...extra});}
function assertYield(t,root,mode='resume'){
 assert.equal(t.session.lastFlowOutcome?.outcome,mode==='hold'?'unresolved':'pending');assert.equal(t.session.lastFlowOutcome?.endedBy,'dispatch');
 assert.equal(t.session.lastFlowRecovery?.mode,mode);assert.equal(t.session.lastFlowRecovery?.form,root);assert.equal(t.session.flowStacks.flat().length,0);assert.ok(t.session.cargo.forms[root]);
}
for(const language of ['en','es'])for(const voice of [false,true]){
 await test(`${language} ${voice?'voice':'text'} dynamic menu acknowledges once then yields the exact second utterance`,async()=>{
  const t=fixture([menu(),refresh],{language,voice});let response=await t.say('begin','menu');assert.match(response,language==='es'?/MENÚ 1/:/MENU 1/);const root=t.owner();
  response=await t.say('zqx');assert.ok(response.includes(acknowledgment(language)),response);assert.match(response,language==='es'?/MENÚ 2/:/MENU 2/);assert.equal(response.split(acknowledgment(language)).length-1,1);assert.equal(t.calls.length,0);assert.equal(t.session.cargo.finished,undefined);
  await t.say('qzx');assert.deepEqual(t.calls,['qzx']);assertYield(t,root);assert.equal(t.session.cargo.finished,undefined);assert.equal(t.session.cargo.forms[root].attempts.color,undefined);
  assert.equal(t.lastTransactions[0].state,'yielded');
  await t.say('different');assert.equal(t.session.lastFlowRecovery,undefined);assert.equal(t.session.lastFlowOutcome,undefined);assert.equal(t.session.lastTurnDispatch,undefined);
 });
 await test(`${language} ${voice?'voice':'text'} explicit localized retry overrides the dynamic question`,async()=>{
  const t=fixture([menu({inputs:[{...choice,retry:'Please choose RED from the menu.',retry_es:'Por favor elija ROJO del menú.'}]}),refresh],{language,voice});await t.say('begin','menu');const response=await t.say('zqx');
  assert.equal(response,language==='es'?'Por favor elija ROJO del menú.':'Please choose RED from the menu.');assert.doesNotMatch(response,/MENU|MENÚ|Sorry|Disculpe/);assert.equal(t.calls.length,0);
 });
}
for(const language of ['en','es']){
 await test(`${language} an accepted out-of-order field resets only the contextual miss budget`,async()=>{
  const t=fixture([menu({inputs:[choice,{name:'zip',field:'zip'}]}),refresh],{language});await t.say('begin','menu');const root=t.owner();await t.say('zqx');let response=await t.say('90001');assert.match(response,language==='es'?/MENÚ/:/MENU/);assert.ok(!response.includes(acknowledgment(language)),response);assert.equal(t.session.cargo.forms[root].values.zip,'90001');
  response=await t.say('qzx');assert.ok(response.includes(acknowledgment(language)),response);assert.equal(t.calls.length,0);assert.equal(t.session.cargo.forms[root].values.zip,'90001');await t.say('rojo');assert.equal(t.session.cargo.finished,1);
 });
 await test(`${language} a provider detour resets the miss budget without repeating retry feedback`,async()=>{
  const t=fixture([menu({extraVars:{provides:catalog,questions:providerQuestions(catalog)}}),refresh,loader],{language});await t.say('begin','menu');await t.say('zqx');let response=await t.say(language==='es'?'¿cuál es mi saldo?':"what's my balance?");assert.match(response,language==='es'?/SALDO 17/:/BALANCE 17/);assert.match(response,language==='es'?/MENÚ/:/MENU/);assert.ok(!response.includes(acknowledgment(language)),response);assert.equal(t.session.cargo.factLoads,1);
  response=await t.say('qzx');assert.ok(response.includes(acknowledgment(language)),response);assert.equal(t.calls.length,0);assert.equal(t.session.cargo.finished,undefined);
 });
}
await test('an explicit contextual miss limit does not consume the validation attempt budget',async()=>{
 const t=fixture([menu({inputs:[{...choice,max_misses:3,max_attempts:1}]}),refresh]);await t.say('begin','menu');const root=t.owner();
 for(const text of ['zqx','qzx']){const response=await t.say(text);assert.ok(response.includes(acknowledgment('en')),response);assert.equal(t.calls.length,0);assert.equal(t.session.cargo.forms[root].attempts.color,undefined);}
 await t.say('xqz');assert.deepEqual(t.calls,['xqz']);assertYield(t,root);assert.equal(t.session.cargo.finished,undefined);
});
await test('long unrelated input yields immediately and is routed unchanged once',async()=>{
 const t=fixture([menu(),refresh]);await t.say('begin','menu');const root=t.owner();const utterance='Please explain store hours.';await t.say(utterance);assert.deepEqual(t.calls,[utterance]);assertYield(t,root);assert.equal(t.session.cargo.finished,undefined);
 const handoff=flowHandoffInfo(t.session);assert.equal(handoff.kind,'yield');assert.equal(handoff.recovery.mode,'resume');assert.match(renderFlowRecovery(handoff),/pending and its draft is retained/);
});
const nested=formFlow({id:'details',name:'Details',version:'1',inputs:[{name:'zip',field:'zip'}]});
const draft=formFlow({id:'draft',name:'Draft',version:'1',inputs:[{name:'amount',field:'amount'},{name:'details',form:'details'}],confirm:{question:'QUOTE {{cargo.forms[form_instance].values.amount}} {{cargo.forms[form_instance].values.details.zip}}. YES or NO.',question_es:'COTIZACIÓN {{cargo.forms[form_instance].values.amount}} {{cargo.forms[form_instance].values.details.zip}}. SÍ o NO.'},after:[S('commit',"(cargo.requests=(cargo.requests||[]).concat([{amount:Number(cargo.forms[form_instance].values.amount),zip:cargo.forms[form_instance].values.details.zip}]),true)")]});
for(const language of ['en','es'])for(const voice of [false,true])await test(`${language} ${voice?'voice':'text'} nested yield retains accepted draft and still requires fresh exact confirmation`,async()=>{
 const t=fixture([draft,nested],{language,voice});await t.say('begin','draft');await t.say('$25');const root=t.owner('draft'),child=t.session.cargo.forms[root].children.details;
 await t.say('zqx');await t.say('qzx');assertYield(t,root);assert.equal(t.session.cargo.forms[root].values.amount,'25');assert.equal(t.session.cargo.forms[child].values.zip,undefined);assert.equal(t.session.cargo.requests,undefined);
 let response=await t.say('resume','draft');assert.match(response,/ZIP|postal/i);assert.equal(t.owner('draft'),root);assert.equal(t.session.cargo.forms[root].children.details,child);assert.ok(!response.includes(acknowledgment(language)),response);
 response=await t.say('90001');assert.match(response,language==='es'?/COTIZACIÓN 25 90001/:/QUOTE 25 90001/);assert.equal(t.session.cargo.requests,undefined);
 response=await t.say('no, make it $40');assert.match(response,language==='es'?/COTIZACIÓN 40 90001/:/QUOTE 40 90001/);assert.equal(t.session.cargo.requests,undefined);
 await t.say(language==='es'?'sí':'yes');assert.deepEqual(t.session.cargo.requests,[{amount:40,zip:'90001'}]);
});
// Nonfinancial confirmation retains the bounded short-answer retry. Monetary uncertainty
// yields immediately to contextual DISPATCH instead of inventing a payment interpretation.
const addressDraft=formFlow({id:'address-draft',name:'AddressDraft',version:'1',inputs:[{name:'zip',field:'zip'}],confirm:{question:'ADDRESS {{cargo.forms[form_instance].values.zip}}. YES or NO.',question_es:'DIRECCIÓN {{cargo.forms[form_instance].values.zip}}. SÍ o NO.'},after:[S('address-commit',"(cargo.requests=[{zip:cargo.forms[form_instance].values.zip}],true)")]});
for(const language of ['en','es'])await test(`${language} nonfinancial confirmation misses yield without accepting consent and reentry asks the proposal again`,async()=>{
 const t=fixture([addressDraft],{language});await t.say('begin','address-draft');await t.say('90001');const root=t.owner('address-draft');let response=await t.say('zqx');assert.ok(response.includes(acknowledgment(language)),response);assert.equal(t.session.cargo.requests,undefined);
 await t.say('qzx');assertYield(t,root);assert.equal(t.session.cargo.requests,undefined);assert.deepEqual(t.calls,['qzx']);
 response=await t.say('resume','address-draft');assert.match(response,language==='es'?/DIRECCIÓN 90001/:/ADDRESS 90001/);assert.equal(t.session.cargo.requests,undefined);assert.ok(!response.includes(acknowledgment(language)),response);
 await t.say(language==='es'?'sí':'yes');assert.deepEqual(t.session.cargo.requests,[{zip:'90001'}]);
});
for(const language of ['en','es'])await test(`${language} a YES with an amount correction is not consent to either proposal`,async()=>{
 const t=fixture([draft,nested],{language});await t.say('begin','draft');await t.say('$25');await t.say('90001');const response=await t.say(language==='es'?'sí, cámbielo a $40':'yes, make it $40');assert.match(response,language==='es'?/COTIZACIÓN 40 90001/:/QUOTE 40 90001/);assert.equal(t.session.cargo.requests,undefined);await t.say(language==='es'?'sí':'yes');assert.deepEqual(t.session.cargo.requests,[{amount:40,zip:'90001'}]);
});
await test('YES plus a payment command never becomes exact confirmation',async()=>{
 const t=fixture([draft,nested]);await t.say('begin','draft');await t.say('$25');await t.say('90001');await t.say('yes, pay it');assert.equal(t.session.cargo.requests,undefined);
});
await test('Spanish imposible is an unrecognized menu answer, never an affirmative selection',async()=>{
 const t=fixture([menu(),refresh],{language:'es'});await t.say('empezar','menu');const root=t.owner();const response=await t.say('imposible');assert.ok(response.includes(acknowledgment('es')),response);assert.equal(t.session.cargo.forms[root].values.color,undefined);assert.equal(t.session.cargo.finished,undefined);assert.equal(t.calls.length,0);
});
await test('Spanish imposible is never YES at exact confirmation',async()=>{
 const t=fixture([draft,nested],{language:'es'});await t.say('empezar','draft');await t.say('$25');await t.say('90001');const root=t.owner('draft');await t.say('imposible');assert.deepEqual(t.calls,['imposible']);assertYield(t,root);assert.equal(t.session.cargo.requests,undefined);assert.equal(t.session.cargo.forms[root].values.amount,'25');
 const response=await t.say('reanudar','draft');assert.match(response,/COTIZACIÓN 25 90001/);assert.equal(t.session.cargo.requests,undefined);await t.say('sí');assert.deepEqual(t.session.cargo.requests,[{amount:25,zip:'90001'}]);
});
for(const language of ['en','es'])await test(`${language} an unknown price reference yields unchanged without selecting a service or confirming cancellation`,async()=>{
 const utterance=language==='es'?'el que cuesta 9.99':'the one that costs 9.99';
 const service=formFlow({id:'service',name:'Service',version:'1',inputs:[{name:'service',profile:{kind:'choice',choices:[{key:'cancel',words:['cancel service','cancelar servicio'],keys:['1'],exact:true},{key:'subscribe',words:['subscribe','suscribir'],keys:['2'],exact:true}]},question:'Choose a service by name.',question_es:'Elija un servicio por nombre.'}],after:[S('service-effect',"(cargo.serviceEffect=true,true)")]});
 const t=fixture([service],{language});await t.say('begin','service');const root=t.owner('service');await t.say(utterance);assert.deepEqual(t.calls,[utterance]);assertYield(t,root);assert.equal(t.session.cargo.serviceEffect,undefined);assert.equal(t.session.cargo.forms[root].values.service,undefined);
 const cancellation=formFlow({id:'cancel',name:'Cancel',version:'1',inputs:[],confirm:{question:'Cancel your service? YES or NO.',question_es:'¿Cancelar su servicio? SÍ o NO.'},after:[S('cancel-effect',"(cargo.cancelled=true,true)")]});
 const c=fixture([cancellation],{language});await c.say('begin','cancel');const owner=c.owner('cancel');await c.say(utterance);assert.deepEqual(c.calls,[utterance]);assertYield(c,owner);assert.equal(c.session.cargo.cancelled,undefined);
});
for(const language of ['en','es'])await test(`${language} declared confirmation clarifications do not exhaust the miss budget`,async()=>{
 const clarified={...draft,variables:{...draft.variables,form_confirmation:{...draft.variables.form_confirmation,value:{...draft.variables.form_confirmation.value,clarifications:['how much is it','cuánto cuesta']}}}};
 const t=fixture([clarified,nested],{language});await t.say('begin','draft');await t.say('$25');await t.say('90001');
 for(let i=0;i<4;i++){const response=await t.say(language==='es'?'¿cuánto cuesta?':'how much is it?');assert.match(response,language==='es'?/COTIZACIÓN 25 90001/:/QUOTE 25 90001/);assert.ok(!response.includes(acknowledgment(language)),response);assert.equal(t.session.cargo.requests,undefined);assert.equal(t.calls.length,0);}
 const root=t.owner('draft');await t.say('zqx');assert.deepEqual(t.calls,['zqx']);assertYield(t,root);assert.equal(t.session.cargo.requests,undefined);
});
await test('legacy JSON without FORM workers or recovery attributes retains its own retry behavior and emits no new metadata',async()=>{
 const legacy={id:'legacy',name:'Legacy',version:'1',description:'Existing JSON dialog',variables:{answer:{type:'string',value:''}},steps:[{id:'ask',type:'SAY-GET',value:'LEGACY QUESTION',variable:'answer'},{id:'read',type:'CASE',branches:{"condition: answer === 'yes'":S('legacy-effect',"(cargo.legacyEffects=Number(cargo.legacyEffects||0)+1,true)"),default:C('legacy-retry','legacy',{},'replace')}},{id:'done',type:'SAY',value:'LEGACY DONE'}]};
 const t=fixture([legacy],{library:false});assert.equal(await t.say('begin','legacy'),'LEGACY QUESTION');
 for(const input of ['zqx','qzx','imposible']){assert.equal(await t.say(input),'LEGACY QUESTION');assert.equal(t.session.lastFlowRecovery,undefined);assert.equal(t.session.lastFlowOutcome,undefined);assert.equal(t.session.lastTurnDispatch,undefined);assert.equal(t.session.cargo.legacyEffects,undefined);}
 assert.equal(await t.say('yes'),'LEGACY DONE');assert.equal(t.session.cargo.legacyEffects,1);assert.deepEqual(t.calls,[]);assert.equal(t.session.lastFlowRecovery,undefined);assert.equal(t.session.lastFlowOutcome,undefined);
});
await test('genuine validator rejections retain max_attempts and invoke declared exhaustion exactly once',async()=>{
 const code={name:'code',profile:{kind:'digits',min:3,max:3},question:'Enter the three-digit service code.',validator:'reject-code',max_attempts:2,on_exhausted:'recover-code'};
 const validate=W('reject-code',[S('reject',"(cargo.inputCheck={ok:false,message:'That service code is invalid.',message_es:'Ese código de servicio no es válido.'},true)")],[{name:'value',type:'string'}]);
 const recover=W('recover-code',[S('capture',"(cargo.recoveries=Number(cargo.recoveries||0)+1,cargo.failure={form,failed_form,input,failed_input,reason},true)"),{id:'recovery-message',type:'SAY',value:'SERVICE RECOVERY'}],['form','failed_form','input','failed_input','reason'].map(name=>({name,type:'string'})));
 const t=fixture([formFlow({id:'validate',name:'Validate',version:'1',inputs:[code],after:[S('effect',"(cargo.effect=true,true)")]}),validate,recover]);await t.say('begin','validate');const root=t.owner('validate');await t.say('zqx');let response=await t.say('111');assert.match(response,/invalid/);assert.doesNotMatch(response,/Sorry/);assert.equal(t.session.cargo.forms[root].attempts.code,1);assert.equal(t.calls.length,0);
 response=await t.say('222');assert.match(response,/SERVICE RECOVERY/);assert.equal(t.session.cargo.recoveries,1);assert.equal(t.session.cargo.effect,undefined);assert.deepEqual(t.session.cargo.failure,{form:root,failed_form:root,input:'code',failed_input:'code',reason:'attempts_exhausted'});assert.equal(t.session.cargo.forms[root].values.code,undefined);assert.notEqual(t.session.lastFlowOutcome?.outcome,'pending');
});
function paymentFixture(outcome,completed=false){
 const effects=[];const action={action:'charge',effect:'charge',flow:'charge-effect',subject:'cargo.account',gate:{verified:'cargo.verified'},confirm:{exact:true,question:'Charge $25? YES or NO.'},outcomes:{paid:'resolved',unknown:'unresolved'}};
 const payment=definePerformer({id:'pay',name:'Pay',description:'Confirmed fixture payment',inputs:[],contract:{summary:'Pay once after exact confirmation'},performs:[action],prepare:'prepare-pay',present:'present-pay'});
 const after=formFlow({id:'after-payment',name:'AfterPayment',version:'1',inputs:[{name:'receipt',profile:{kind:'choice',choices:[{key:'receipt',words:['receipt'],exact:true}]},question:'Receipt preference?'}],...(completed?{incomplete_outcome:{outcome:'resolved',reason:'payment_made'}}:{})});
 const prepare=W('prepare-pay',[S('request',"(cargo.actionRequest={account:cargo.account,amount:25},true)")]);
 const effect=W('charge-effect',[{id:'charge-tool',type:'CALL-TOOL',tool:'charge',variable:'answer',args:{request:'{{request}}'}},S('outcome',"(cargo.actionOutcome=answer,true)")],[{name:'request',type:'object'}]);
 const present=W('present-pay',[{id:'status',type:'SAY',value:'PAYMENT {{result.status}} {{result.reference || ""}}'},C('follow-up','after-payment',{parent_form:'{{form}}'})],[{name:'form',type:'string'},{name:'result',type:'object'}]);
 const tools=[{id:'charge',name:'charge',description:'Hermetic charge',parameters:{type:'object',properties:{request:{type:'object'}}},implementation:{type:'local',function:'charge',retries:0}}];
 const t=fixture([payment,after,prepare,effect,present],{sessionOnly:true,tools,functions:{charge:async({request})=>{effects.push(clone(request));return clone(outcome);}}});t.effects=effects;return t;
}
await test('an unknown charge remains held through contextual yield, reentry and renewed YES',async()=>{
 const t=paymentFixture({status:'unknown'});await t.say('begin','pay');assert.equal(t.effects.length,0);await t.say('yes');assert.equal(t.effects.length,1);const root=t.owner('pay');await t.say('zqx');await t.say('qzx');assertYield(t,root,'hold');assert.equal(t.effects.length,1);
 const guidance=renderFlowRecovery(flowHandoffInfo(t.session));assert.match(guidance,/Do not offer to restart/);assert.match(guidance,/not confirmed/);
 await t.say('resume','pay');assert.equal(t.effects.length,1);await t.say('yes');assert.equal(t.effects.length,1);assert.deepEqual(t.effects,[{account:'A',amount:25}]);
});
await test('completed payment survives an optional receipt yield without a repeat charge or failure handoff',async()=>{
 const t=paymentFixture({status:'paid',reference:'P1'},true);await t.say('begin','pay');await t.say('yes');assert.deepEqual(t.effects,[{account:'A',amount:25}]);await t.say('zqx');await t.say('qzx');assert.equal(t.session.lastFlowOutcome?.outcome,'resolved');assert.equal(t.session.lastFlowOutcome?.reason,'payment_made');assert.equal(t.session.lastFlowRecovery?.mode,'none');assert.equal(flowHandoffInfo(t.session),null);assert.equal(t.effects.length,1);
 const records=Object.values(t.session.cargo.forms[t.owner('pay')].actions);assert.equal(records[0].result.reference,'P1');
});
await test('a matched new flow consumes the yielded utterance once and clears the old handoff',async()=>{
 const other={id:'other',name:'Other',primary:true,version:'1',description:'Hermetic different request',steps:[S('other-effect',"(cargo.otherRequests=Number(cargo.otherRequests||0)+1,true)"),{id:'other-message',type:'SAY',value:'OTHER ANSWER'}]};
 const t=fixture([menu(),refresh,other],{route:text=>text==='qzx'?'Other':null});await t.say('begin','menu');const root=t.owner();await t.say('zqx');const response=await t.say('qzx');assert.match(response,/OTHER ANSWER/);assert.deepEqual(t.calls,['qzx']);assert.equal(t.session.cargo.otherRequests,1);assert.equal(t.session.cargo.finished,undefined);assert.ok(t.session.cargo.forms[root]);assert.equal(t.session.lastFlowRecovery,undefined);assert.equal(t.session.lastFlowOutcome,undefined);assert.equal(t.session.lastTurnDispatch.matchedFlow,'Other');
});
console.log(`FORM conversation: ${checks} passed, ${failures.length} failed`);
if(failures.length)process.exitCode=1;else console.log('FORM conversation: all checks passed');
