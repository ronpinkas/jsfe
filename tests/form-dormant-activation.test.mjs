import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,formFlow,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {resolveFormInputs,openFormInstance,closeFormInstance,acceptFormReadings,formInputChain,enrichFormMatches,expandFormActivations,settleFormActivations,orderFormReadings,formReadingReady,formReadingRelevant,queueFormReadings,pendingFormReadings,formInitialReadings} from '../dist/helpers/form-state.js';
import {prepareFormAction,beginFormAction,finishFormAction,confirmFormRevision} from '../dist/helpers/form-actions.js';
import {matchInputs} from '../dist/helpers/match-inputs.js';
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const choice=keys=>({kind:'choice',choices:keys.map(key=>({key,words:[key]}))});
const cardInputs=[{name:'card_number',profile:{kind:'digits',min:16,max:16},validator:'check-pan'},{name:'cvv',profile:{kind:'digits',min:3,max:3}}];
const specs=()=>resolveFormInputs([{name:'route',profile:choice(['pay','link'])},{name:'account',profile:{kind:'digits',min:8,max:8}},
   {name:'method',profile:choice(['saved','new']),validator:'check-method',validate_always:true},
   {name:'card',form:'card',when:{route:'pay',method:'new'},depends_on:['account','method'],reset_on:['method'],activate:{method:'new'},activate_on:['card_number'],schema:{inputs:cardInputs}}]);
const setup=()=>{const cargo={};const id=openFormInstance(cargo,'payment',specs());acceptFormReadings(cargo,[{form:id,name:'route',value:'pay',ok:true},{form:id,name:'account',value:'56000001',ok:true},{form:id,name:'method',value:'saved',ok:true}]);return {cargo,id};};
const read=(cargo,id,text,current='method')=>{const chain=formInputChain(cargo.forms,id,cargo);return enrichFormMatches(matchInputs(text,chain,{form:id,name:current}),chain,id,[current],current);};
const ordered=(cargo,hits)=>orderFormReadings(cargo,expandFormActivations(cargo,hits));
{
   const {cargo,id}=setup(),chain=formInputChain(cargo.forms,id,cargo);
   eq(chain.filter(h=>h.activation).map(h=>h.name),['card_number'],'only explicit dormant entry is readable');
   eq(read(cargo,id,'123').hits,[],'unrelated CVV-length digits do not activate the card');
   const hits=ordered(cargo,read(cargo,id,'4111111111111111').hits);
   eq(hits.map(h=>h.name),['method','card_number'],'controller goes through validation before entry');
   const accepted=[];for(const hit of hits){eq(formReadingRelevant(cargo,hit,accepted),true,'projected activation relevant');eq(formReadingReady(cargo,hit,accepted),true,'projected activation prerequisites ready');accepted.push({...hit,ok:true});}
   const action={action:'charge',effect:'charge',subject:'form.values.account',confirm:{exact:true},outcomes:{paid:'resolved',unknown:'unresolved'}};
   const held=prepareFormAction(cargo,id,action,{method:'saved'});confirmFormRevision(cargo,id);eq(beginFormAction(cargo,id,action,held),true,'baseline action starts with exact consent');finishFormAction(cargo,id,action,{status:'unknown'});
   acceptFormReadings(cargo,settleFormActivations({accepted}).accepted);
   eq(cargo.forms[id].values.method,'new','validated entry switches branch through standard acceptance');
   eq(cargo.forms[hits[1].form].values.card_number,'4111111111111111','entry belongs to existing nested instance');
   eq(cargo.forms[id].confirmation,null,'branch correction invalidates prior consent');
   eq(cargo.actionJournal[held.key].status,'unknown','collecting new data cannot release unknown effects');
   acceptFormReadings(cargo,[{form:hits[1].form,name:'cvv',value:'123',ok:true}]);closeFormInstance(cargo,hits[1].form);
   const stillHeld=prepareFormAction(cargo,id,action,{method:'new'});confirmFormRevision(cargo,id);eq(stillHeld.key,held.key,'new card correction retains unresolved effect identity');eq(beginFormAction(cargo,id,action,stillHeld),false,'fresh consent cannot repeat an unresolved charge');
}
{
   const {cargo,id}=setup();acceptFormReadings(cargo,[{form:id,name:'route',value:'link',ok:true}]);
   eq(formInputChain(cargo.forms,id,cargo).some(h=>h.activation),false,'activation cannot infer a different payment route');
   eq(read(cargo,id,'4111111111111111').hits,[],'PAN cannot reopen an unrelated inactive branch');
}
{
   const {cargo,id}=setup(),hits=ordered(cargo,read(cargo,id,'4111111111111112').hits);
   const invalidPan=settleFormActivations({accepted:[{...hits[0],ok:true}],rejected:[{...hits[1],outcome:'rejected'}]});
   eq(invalidPan.accepted,[],'invalid PAN suppresses otherwise valid inferred controller');
   acceptFormReadings(cargo,invalidPan.accepted);eq(cargo.forms[id].values.method,'saved','invalid PAN preserves current method');
   const invalidMethod=settleFormActivations({rejected:[{...hits[0],outcome:'rejected',message:'Method unavailable'}],pending:[hits[1]]});
   eq(invalidMethod.pending,[],'invalid controller discards complete activation group');
   eq(invalidMethod.rejected.map(h=>h.name),['card_number'],'controller error is reported against supplied entry');
}
{
   const {cargo,id}=setup(),hits=ordered(cargo,read(cargo,id,'4111111111111111').hits);
   const held=settleFormActivations({accepted:[{...hits[0],ok:true}],pending:[hits[1]]});
   eq(held.accepted,[],'pending entry holds controller uncommitted');eq(held.pending.length,2,'pending group retains both readings');
   queueFormReadings(cargo,held.pending);
   const pending=pendingFormReadings(cargo,id);eq(pending.map(h=>h.name),['method','card_number'],'ready pending group re-enters complete normal pipeline');
   eq(expandFormActivations(cargo,pending).length,2,'resuming pending group never duplicates controllers');
   delete cargo.forms[id].values.account;eq(pendingFormReadings(cargo,id),[],'unavailable noninferred prerequisite keeps complete group dormant');
   acceptFormReadings(cargo,[{form:id,name:'account',value:'56000001',ok:true}]);eq(pendingFormReadings(cargo,id).length,2,'committed prerequisite releases full group for validation');
   settleFormActivations({accepted:[{...pending[0],ok:true}],rejected:[{...pending[1],outcome:'rejected'}]},cargo);
   eq(Object.values(cargo.forms).flatMap(state=>Object.values(state.pending)),[],'failed pending group removes every retained member');
}
{
   const {cargo,id}=setup(),context=openFormInstance(cargo,'nested-auth',[],{parent:id,context:true});
   const independent=openFormInstance(cargo,'payment',specs());
   const hits=ordered(cargo,read(cargo,context,'4111111111111111').hits);
   eq(hits[0].form,id,'context service routes inferred controller to owning task');
   eq(hits[1].activation.form,id,'nested entry retains actual owner identity');
   eq(cargo.forms[independent].values,{},'unrelated payment instance receives no inference');
   const enriched=read(cargo,id,'new');eq(enriched.hits[0].validate_always,true,'raw-sensitive validation flag survives matching');
}
{
   const {cargo,id}=setup(),chain=formInputChain(cargo.forms,id,cargo),hit=read(cargo,id,'4111111111111111').hits[0];
   const explicit={form:id,name:'method',value:'saved',validator:'check-method'};
   const expanded=expandFormActivations(cargo,[explicit,hit]);
   eq(expanded.length,2,'conflicting explicit controller cannot be overridden by inference');eq(expanded[1].invalid,true,'conflicting dormant claim fails closed');
   const invalid=specs();invalid[3].activate={missing:'new'};assert.throws(()=>resolveFormInputs(invalid),/invalid controller/);checks++;
   invalid[3].activate={method:'not-a-method'};assert.throws(()=>resolveFormInputs(invalid),/invalid controller value/);checks++;
   invalid[3].activate={method:'new'};invalid[3].activate_on=['missing'];assert.throws(()=>resolveFormInputs(invalid),/unknown entry/);checks++;
   invalid[3].activate_on=['card_number'];invalid[3].schema.inputs=cardInputs.map(input=>({...input,...(input.name==='card_number'?{prepare:'send-challenge'}:{})}));assert.throws(()=>resolveFormInputs(invalid),/requires preparation/);checks++;
}
{
   const cargo={},inputs=specs();inputs[3].activate_on=['details.card_number'];inputs[3].schema={inputs:[{name:'details',form:'card-details',schema:{inputs:cardInputs}}]};
   const id=openFormInstance(cargo,'nested-payment',inputs);acceptFormReadings(cargo,[{form:id,name:'route',value:'pay',ok:true},{form:id,name:'account',value:'56000001',ok:true},{form:id,name:'method',value:'saved',ok:true}]);
   const hits=ordered(cargo,read(cargo,id,'4111111111111111').hits);
   eq(hits.map(h=>h.name),['method','card_number'],'explicit dotted entry reaches a nested descendant');
   eq(formReadingReady(cargo,hits[1],[{...hits[0],ok:true}]),true,'deep entry uses nearest actual activation controller');
   inputs[3].activate_on=['card_number'];inputs[3].schema={inputs:[{name:'identity',any_of:cardInputs}]};const grouped= openFormInstance(cargo,'grouped-payment',resolveFormInputs(inputs));acceptFormReadings(cargo,[{form:grouped,name:'route',value:'pay',ok:true},{form:grouped,name:'account',value:'56000001',ok:true},{form:grouped,name:'method',value:'saved',ok:true}]);
   eq(formInputChain(cargo.forms,grouped,cargo).filter(h=>h.activation).map(h=>h.name),['card_number'],'any_of entry whitelist uses canonical member name');
}
{
   for(const explicit of [false,true])for(const valid of [false,true]){
      const {cargo,id}=setup(),supplied={...(explicit?{method:'new'}:{}),card:{card_number:valid?'4111111111111111':'4111111111111112',cvv:'123'},userInput:'replacement card'};
      const hits=ordered(cargo,formInitialReadings(cargo.forms[id],supplied,cargo));
      eq(hits.map(h=>h.name),['method','card_number','cvv'],'structured activation flattens nested values into common atomic pipeline');
      eq(new Set(hits.map(h=>h.activation_group)).size,1,'explicit and inferred controllers join the same initial group');
      const accepted=hits.filter(h=>valid||h.name!=='card_number').map(h=>({...h,ok:true})),rejected=valid?[]:hits.filter(h=>h.name==='card_number').map(h=>({...h,outcome:'rejected'}));
      const batch=settleFormActivations({accepted,rejected},cargo);acceptFormReadings(cargo,batch.accepted);
      eq(cargo.forms[id].values.method,valid?'new':'saved','invalid nested PAN never partially commits explicit or inferred controller');
   }
   const {cargo,id}=setup();delete cargo.forms[id].values.route;
   eq(formInitialReadings(cargo.forms[id],{card:{card_number:'4111111111111111'}},cargo),[],'initial PAN waits while noninferred route is unknown');
   eq(cargo.forms[id].seeds.card.card_number,'4111111111111111','unready structured data is retained without speculative branch selection');
   acceptFormReadings(cargo,[{form:id,name:'route',value:'pay',ok:true}]);
   eq(pendingFormReadings(cargo,id).map(h=>h.name),['method','card_number'],'committed route releases structured data through same activation group');
}
// Actual engine: validators and callbacks run through the shared worker pipeline, before fresh confirmation.
const S=(id,value)=>({id,type:'SET',variable:'noop',value});
const root=formFlow({id:'checkout',name:'Checkout',version:'1',parameters:[{name:'method',type:'string'},{name:'amount',type:'string'},{name:'card',type:'object'}],extraVars:{method:'',amount:'',card:null},inputs:[{name:'route',profile:choice(['pay'])},{name:'method',profile:choice(['saved','new']),validator:'check-method',after:'method-after'},
   {name:'amount',profile:{kind:'pattern',regex:'^\\d{1,4}$'},question:'Amount?'},
   {name:'card',form:'card',when:{route:'pay',method:'new'},depends_on:['method'],reset_on:['method'],activate:{method:'new'},activate_on:['card_number']}],
   before:[S('defaults',"Object.keys(cargo.forms[form_instance].values).length ? true : acceptFormReadings(cargo,[{form:form_instance,name:'route',value:'pay',ok:true},{form:form_instance,name:'method',value:'saved',ok:true}])")],
   confirm:{question:'Confirm payment?'},after:[S('effect','(cargo.effects=Number(cargo.effects || 0)+1,true)')]});
const card=formFlow({id:'card',name:'Card',version:'1',inputs:cardInputs.map(i=>({...i,question:i.name==='card_number'?'Card number?':'CVV?'}))});
const validators=[{id:'check-method',name:'CheckMethod',version:'1',parameters:[{name:'value',type:'string'}],steps:[S('method-check',"(cargo.methodChecks=Number(cargo.methodChecks||0)+1,cargo.inputCheck=cargo.blockMethod?{ok:false,message:'Method unavailable'}:{ok:true,value:value},true)")]},
{id:'check-pan',name:'CheckPan',version:'1',parameters:[{name:'value',type:'string'}],steps:[S('pan-check',"(cargo.panChecks=Number(cargo.panChecks||0)+1,cargo.inputCheck=validateCardNumber(value)?{ok:true,value:value}:{ok:false,message:'Invalid card'},true)")]},
{id:'method-after',name:'MethodAfter',version:'1',steps:[S('method-after','(cargo.methodCallbacks=Number(cargo.methodCallbacks||0)+1,true)')]}];
const warnings=[],quiet={info(){},debug(){},error(){},warn(...args){warnings.push(args.join(' '));}};
async function runtime(blockMethod=false){const engine=new WorkflowEngine(quiet,async()=>'None',linkFormSchemas([...FLOWS,root,card,...validators]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();let session=engine.initSession('test','dormant-'+String(blockMethod),'en');session.cargo.voice=false;session.cargo.blockMethod=blockMethod;return {say:async(content,start)=>{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:typeof start==='string'?{flow:start}:start}:{})},JSON.parse(JSON.stringify(session)))));return session;}};}
{
   const run=await runtime();let session=await run.say('begin','checkout');assert.match(session.response,/Amount/);checks++;
   session=await run.say('4111111111111112');const id=session.cargo.formTasks.checkout;
   eq(session.cargo.forms[id].values.method,'saved','real invalid PAN preserves selected saved branch');eq(session.cargo.methodCallbacks,undefined,'failed activation runs no method callback');eq(session.cargo.effects,undefined,'failed activation performs no effect');
   session=await run.say('4111111111111111');eq(session.cargo.forms[id].values.method,'new','real valid PAN activates new-card branch');eq(session.cargo.methodCallbacks,1,'controller callback runs only after atomic commit');
   session=await run.say('20');assert.match(session.response,/CVV/);checks++;
   session=await run.say('123');assert.match(session.response,/Confirm payment/);checks++;eq(session.cargo.effects,undefined,'completed fields still require consent');
   session=await run.say('yes');eq(session.cargo.effects,1,'exact confirmation permits one effect');
}
{
   const run=await runtime(true);await run.say('begin','checkout');const session=await run.say('4111111111111111');
   eq(session.cargo.forms[session.cargo.formTasks.checkout].values.method,'saved','real controller validation failure preserves branch');eq(session.cargo.methodCallbacks,undefined,'controller rejection has no callback');eq(session.cargo.effects,undefined,'controller rejection has no effect');
}
{
   for(const explicit of [false,true]){
      const run=await runtime();await run.say('begin','checkout');
      let session=await run.say('please apply these updated details',{flow:'checkout',arguments:{...(explicit?{method:'new'}:{}),card:{card_number:'4111111111111112',cvv:'123'}}});
      eq(session.cargo.forms[session.cargo.formTasks.checkout].values.method,'saved','real initial invalid PAN preserves old branch even with explicit new controller');eq(session.cargo.methodCallbacks,undefined,'initial invalid group executes no callback');
      session=await run.say('please apply these updated details',{flow:'checkout',arguments:{...(explicit?{method:'new'}:{}),card:{card_number:'4111111111111111',cvv:'123'}}});
      eq(session.cargo.forms[session.cargo.formTasks.checkout].values.method,'new','reactivation accepts valid nested PAN through generic activation');eq(session.cargo.methodCallbacks,1,'reactivated group executes controller callback once');
      session=await run.say('20');assert.match(session.response,/Confirm payment/);checks++;eq(session.cargo.effects,undefined,'reactivation still requires fresh confirmation');
      session=await run.say('yes');eq(session.cargo.effects,1,'reactivated complete form performs only after fresh consent');
   }
   const run=await runtime();const session=await run.say('begin',{flow:'checkout',arguments:{amount:'20'}});assert.match(session.response,/Confirm payment/);checks++;eq(session.cargo.effects,undefined,'ordinary initial scalar fields retain confirmation behavior');
}
eq(warnings.filter(w=>/not defined|expression.*fail/i.test(w)),[],'activation expressions produce no runtime evaluation warnings');
console.log(`form dormant activation: all ${checks} checks passed`);
