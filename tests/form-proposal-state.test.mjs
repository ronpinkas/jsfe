/** Pure owned candidate/approval state transitions; no engine, tools or credentials. */
import assert from 'node:assert/strict';
import {openFormInstance,acceptFormReadings,closeFormInstance} from '../dist/helpers/form-state.js';
import {confirmFormRevision,formSignature} from '../dist/helpers/form-actions.js';
import {formProposalPolicy,stageFormProposal,nextFormProposal,formProposalReadings,bindFormProposal,decideFormProposal,commitFormProposals,settleFormProposalValidation} from '../dist/helpers/form-proposals.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const descriptor=(binding={account:'A'})=>({question:'Use this amount?',question_es:'¿Usar este monto?',binding});
let checks=0;const test=(name,run)=>{run();checks++;console.log('PASS '+name);};
function setup(policy={question:'Use this amount?',origins:['activation']}){
 const cargo={},specs=[{name:'amount',label:'amount',profile:{kind:'amount'},proposal:policy},{name:'method',profile:{kind:'text'}}];
 const owner=openFormInstance(cargo,'payment',specs),other=openFormInstance(cargo,'other-payment',specs);
 const hit=(value='50',extra={})=>({form:owner,name:'amount',value,raw:'fifty dollars',utterance:'I will pay fifty dollars',origin:'activation',ok:true,...extra});
 return {cargo,owner,other,hit,state:()=>cargo.forms[owner]};
}
function approve(t){
 const child=openFormInstance(t.cargo,'proposal-confirm',[],{parent:t.owner,context:true});bindFormProposal(t.cargo,t.owner,'amount',child);confirmFormRevision(t.cargo,child);assert.equal(decideFormProposal(t.cargo,t.owner,'amount',child,'confirmed'),true);return child;
}
function replay(t,approve=true){const [hit]=formProposalReadings(t.cargo,t.owner,'amount',approve);return {...hit,ok:true};}
test('static selectors use proposed values and a validator independently requires its declared proposal',()=>{
 const t=setup({question:'Use amount?',origins:['activation'],when:{method:'card',amount:'50'}});
 assert.equal(formProposalPolicy(t.cargo,t.hit(),{ok:true}),null);
 const policy=formProposalPolicy(t.cargo,t.hit(),{ok:true},[{form:t.owner,name:'method',value:'card',ok:true}]);assert.equal(policy.question,'Use amount?');
 assert.equal(formProposalPolicy(t.cargo,t.hit('50',{origin:'answer'}),{ok:true},[{form:t.owner,name:'method',value:'card',ok:true}]),null);
 const dynamic=formProposalPolicy(t.cargo,t.hit('50',{origin:'answer'}),{ok:true,proposal:descriptor()});assert.equal(dynamic.question,'Use this amount?');assert.equal(dynamic.prepare,undefined);
});
test('staged candidates never commit fields and identical pending data retains its owner-scoped id',()=>{
 const t=setup();assert.equal(stageFormProposal(t.cargo,t.hit(),descriptor()),false);const first=nextFormProposal(t.cargo,t.owner);
 assert.equal(t.state().values.amount,undefined);assert.equal(first.status,'pending');assert.equal(first.form,t.owner);assert.equal(first.value,'50');assert.equal(formProposalReadings(t.cargo,t.owner).length,0);
 stageFormProposal(t.cargo,t.hit(),descriptor({account:'A'}));assert.equal(nextFormProposal(t.cargo,t.owner).id,first.id);
 const otherHit=t.hit('50',{form:t.other});stageFormProposal(t.cargo,otherHit,descriptor());assert.notEqual(t.cargo.forms[t.other].inputProposals.amount.id,first.id);
});
test('a pending correction still requires its activation-only policy',()=>{
 const t=setup();stageFormProposal(t.cargo,t.hit(),descriptor());const policy=formProposalPolicy(t.cargo,t.hit('60',{origin:'answer'}),{ok:true});assert.equal(policy.question,'Use this amount?');
 const old=t.state().inputProposals.amount;stageFormProposal(t.cargo,t.hit('60',{origin:'answer'}),descriptor());assert.notEqual(t.state().inputProposals.amount.id,old.id);assert.equal(old.status,'superseded');assert.equal(t.state().values.amount,undefined);
});
test('only an actual owned context child can bind and YES requires its normal form confirmation',()=>{
 const t=setup();stageFormProposal(t.cargo,t.hit(),descriptor());const foreign=openFormInstance(t.cargo,'foreign',[],{parent:t.other,context:true});assert.throws(()=>bindFormProposal(t.cargo,t.owner,'amount',foreign),/foreign/);
 const ordinary=openFormInstance(t.cargo,'ordinary',[],{parent:t.owner,input:'method'});assert.throws(()=>bindFormProposal(t.cargo,t.owner,'amount',ordinary),/foreign/);
 const child=openFormInstance(t.cargo,'proposal-confirm',[],{parent:t.owner,context:true});bindFormProposal(t.cargo,t.owner,'amount',child);assert.equal(t.cargo.forms[child].proposalPrompt.input,'amount');assert.equal(decideFormProposal(t.cargo,t.owner,'amount',child,'confirmed'),false);
 confirmFormRevision(t.cargo,child);assert.equal(decideFormProposal(t.cargo,t.owner,'amount',child,'confirmed'),true);
});
test('confirmed proof survives harmless pre-prompt revalidation but never creates approval itself',()=>{
 const t=setup();stageFormProposal(t.cargo,t.hit(),descriptor());approve(t);const refresh=replay(t,false);assert.equal(refresh.proposalApproval,undefined);assert.equal(stageFormProposal(t.cargo,refresh,descriptor()),false);assert.equal(t.state().inputProposals.amount.status,'confirmed');
 const approved=replay(t);assert.equal(stageFormProposal(t.cargo,approved,descriptor()),true);assert.equal(t.state().values.amount,undefined);
});
test('approved replay uses the current field declaration and retains raw source across JSON persistence',()=>{
 let t=setup();stageFormProposal(t.cargo,t.hit(),descriptor());approve(t);t.cargo=clone(t.cargo);t.state=()=>t.cargo.forms[t.owner];t.state().specs[0].validator='new-validator';
 const reading=replay(t);assert.equal(reading.validator,'new-validator');assert.equal(reading.raw,'fifty dollars');assert.equal(reading.origin,'activation');assert.equal(reading.utterance,'I will pay fifty dollars');assert.equal(stageFormProposal(t.cargo,reading,descriptor()),true);
 commitFormProposals(t.cargo,[reading]);acceptFormReadings(t.cargo,[reading]);assert.equal(t.state().values.amount,'50');assert.equal(t.state().inputProposals.amount.committed,true);assert.equal(formProposalReadings(t.cargo,t.owner).length,0);assert.equal(nextFormProposal(t.cargo,t.owner),null);
 assert.throws(()=>commitFormProposals(t.cargo,[reading]),/unconsumed/);
});
test('a confirmed child may close before its owner consumes the already verified proof',()=>{
 const t=setup();stageFormProposal(t.cargo,t.hit(),descriptor());const child=approve(t);closeFormInstance(t.cargo,child,false);const reading=replay(t);assert.equal(stageFormProposal(t.cargo,reading,descriptor()),true);commitFormProposals(t.cargo,[reading]);acceptFormReadings(t.cargo,[reading]);assert.equal(t.state().values.amount,'50');
});
test('changed binding withdraws the old child confirmation and rejects stale approval tokens',()=>{
 const t=setup();stageFormProposal(t.cargo,t.hit(),descriptor());const child=approve(t),old=replay(t),id=t.state().inputProposals.amount.id;
 assert.equal(stageFormProposal(t.cargo,t.hit(),descriptor({account:'B'})),false);const record=t.state().inputProposals.amount;assert.notEqual(record.id,id);assert.equal(record.status,'pending');assert.equal(t.cargo.forms[child].confirmation,null);assert.equal(decideFormProposal(t.cargo,t.owner,'amount',child,'confirmed'),false);assert.equal(stageFormProposal(t.cargo,old,descriptor({account:'B'})),false);assert.equal(record.status,'pending');
});
test('owner revision and prompt wording changes invalidate old proof even with the same candidate',()=>{
 const t=setup();stageFormProposal(t.cargo,t.hit(),descriptor());const child=approve(t),old=replay(t),id=t.state().inputProposals.amount.id;
 acceptFormReadings(t.cargo,[{form:t.owner,name:'method',value:'card',ok:true}]);assert.equal(decideFormProposal(t.cargo,t.owner,'amount',child,'confirmed'),false);assert.equal(stageFormProposal(t.cargo,old,descriptor()),false);assert.equal(t.state().inputProposals.amount.id,id);assert.equal(t.state().inputProposals.amount.status,'pending');
 bindFormProposal(t.cargo,t.owner,'amount',child);confirmFormRevision(t.cargo,child);decideFormProposal(t.cargo,t.owner,'amount',child,'confirmed');const proof=replay(t);stageFormProposal(t.cargo,t.hit(),{...descriptor(),question:'Confirm the revised explanation?'});assert.equal(stageFormProposal(t.cargo,proof,descriptor()),false);assert.equal(t.state().inputProposals.amount.status,'pending');
});
test('NO keeps a candidate uncommitted on resume but explicit new input may propose it again',()=>{
 const t=setup();stageFormProposal(t.cargo,t.hit(),descriptor());const child=openFormInstance(t.cargo,'proposal-confirm',[],{parent:t.owner,context:true});bindFormProposal(t.cargo,t.owner,'amount',child);assert.equal(decideFormProposal(t.cargo,t.owner,'amount',child,'declined'),true);const id=t.state().inputProposals.amount.id;
 const reading=replay(t,false);assert.equal(stageFormProposal(t.cargo,reading,descriptor()),false);assert.equal(t.state().inputProposals.amount.status,'declined');assert.equal(nextFormProposal(t.cargo,t.owner),null);assert.equal(t.state().values.amount,undefined);
 stageFormProposal(t.cargo,t.hit('50',{origin:'answer'}),descriptor());assert.notEqual(t.state().inputProposals.amount.id,id);assert.equal(t.state().inputProposals.amount.status,'pending');
});
test('a new answer after NO may accept an ordinary value when an activation-only policy no longer applies',()=>{
 const t=setup();stageFormProposal(t.cargo,t.hit(),descriptor());const child=openFormInstance(t.cargo,'proposal-confirm',[],{parent:t.owner,context:true});bindFormProposal(t.cargo,t.owner,'amount',child);decideFormProposal(t.cargo,t.owner,'amount',child,'declined');
 const resumed=replay(t,false);assert.equal(stageFormProposal(t.cargo,resumed,null),false);assert.equal(t.state().inputProposals.amount.status,'declined');
 const explicit=t.hit('50',{origin:'answer',raw:'50'});assert.equal(formProposalPolicy(t.cargo,explicit,{ok:true}),null);assert.equal(stageFormProposal(t.cargo,explicit,null),true);commitFormProposals(t.cargo,[explicit]);acceptFormReadings(t.cargo,[explicit]);assert.equal(t.state().values.amount,'50');assert.equal(t.state().inputProposals.amount.status,'superseded');
});
test('ordinary accepted correction supersedes a pending proposal without consuming fake consent',()=>{
 const t=setup();stageFormProposal(t.cargo,t.hit(),descriptor());assert.equal(stageFormProposal(t.cargo,t.hit('60',{origin:'answer'}),null),true);assert.equal(t.state().inputProposals.amount.status,'superseded');const reading=t.hit('60',{origin:'answer'});commitFormProposals(t.cargo,[reading]);acceptFormReadings(t.cargo,[reading]);assert.equal(t.state().values.amount,'60');
});
test('a waived same-candidate policy withdraws stale guidance while requiring fresh ordinary input',()=>{
 for(const confirmed of [false,true]){
  const t=setup({question:'Use amount?',origins:['activation'],when:{method:'card'}});acceptFormReadings(t.cargo,[{form:t.owner,name:'method',value:'card',ok:true}]);stageFormProposal(t.cargo,t.hit(),descriptor());const child=confirmed?approve(t):null;
  const refreshed=replay(t,false);acceptFormReadings(t.cargo,[{form:t.owner,name:'method',value:'bank',ok:true}]);assert.equal(formProposalPolicy(t.cargo,refreshed,{ok:true}),null);assert.equal(stageFormProposal(t.cargo,refreshed,null),false);assert.equal(t.state().inputProposals.amount.status,'superseded');assert.equal(t.state().values.amount,undefined);assert.equal(nextFormProposal(t.cargo,t.owner),null);if(child)assert.equal(t.cargo.forms[child].confirmation,null);
  const explicit=t.hit('50',{origin:'answer',raw:'50'});assert.equal(stageFormProposal(t.cargo,explicit,null),true);commitFormProposals(t.cargo,[explicit]);acceptFormReadings(t.cargo,[explicit]);assert.equal(t.state().values.amount,'50');
 }
 const t=setup();stageFormProposal(t.cargo,t.hit(),descriptor());approve(t);assert.equal(stageFormProposal(t.cargo,replay(t),null),true,'a current shared approval still permits its confirmed value');
});
test('pending validation defers prompting and a ready revalidation restores it; rejection supersedes it',()=>{
 const t=setup();stageFormProposal(t.cargo,t.hit(),descriptor());const batch={accepted:[],rejected:[],pending:[t.hit()]};assert.equal(settleFormProposalValidation(t.cargo,batch),batch);assert.equal(nextFormProposal(t.cargo,t.owner),null);assert.equal(t.state().inputProposals.amount.deferred,true);
 assert.equal(formProposalPolicy(t.cargo,t.hit('60',{origin:'answer'}),{ok:true}).question,'Use this amount?');stageFormProposal(t.cargo,t.hit(),descriptor());assert(nextFormProposal(t.cargo,t.owner));settleFormProposalValidation(t.cargo,{rejected:[t.hit()]});assert.equal(t.state().inputProposals.amount.status,'superseded');assert.equal(nextFormProposal(t.cargo,t.owner),null);
});
test('an input that becomes irrelevant withdraws both pending and confirmed proposals',()=>{
 for(const confirmed of [false,true]){
  const t=setup();stageFormProposal(t.cargo,t.hit(),descriptor());const child=confirmed?approve(t):null;t.state().specs[0].when={method:'card'};acceptFormReadings(t.cargo,[{form:t.owner,name:'method',value:'bank',ok:true}]);
  const batch={accepted:[],pending:[],rejected:[],ignored:[t.hit()]};assert.equal(settleFormProposalValidation(t.cargo,batch),batch);assert.equal(t.state().inputProposals.amount.status,'superseded');assert.equal(nextFormProposal(t.cargo,t.owner),null);assert.equal(formProposalReadings(t.cargo,t.owner).length,0);assert.equal(t.state().values.amount,undefined);if(child)assert.equal(t.cargo.forms[child].confirmation,null);
 }
});
test('missing, forged or reused approval never commits and batch consumption is atomic',()=>{
 const t=setup();stageFormProposal(t.cargo,t.hit(),descriptor());const pending=replay(t,false);assert.equal(stageFormProposal(t.cargo,{...pending,proposalApproval:{...pending.proposalResume}},descriptor()),false);assert.throws(()=>commitFormProposals(t.cargo,[t.hit()]),/without approval/);
 approve(t);const valid=replay(t);assert.equal(stageFormProposal(t.cargo,{...valid,proposalApproval:{id:valid.proposalApproval.id,signature:'forged'}},descriptor()),false);assert.throws(()=>commitFormProposals(t.cargo,[valid,valid]),/twice/);assert.equal(t.state().inputProposals.amount.committed,false);assert.equal(t.state().values.amount,undefined);
});
test('withdrawing an older input cannot clear another input bound to the same owned context',()=>{
 const t=setup();stageFormProposal(t.cargo,t.hit(),descriptor());const child=openFormInstance(t.cargo,'proposal-confirm',[],{parent:t.owner,context:true});bindFormProposal(t.cargo,t.owner,'amount',child);
 const method=t.hit('card',{name:'method',origin:'answer',raw:'card'}),question={question:'Use this method?'};stageFormProposal(t.cargo,method,question);bindFormProposal(t.cargo,t.owner,'method',child);confirmFormRevision(t.cargo,child);assert.equal(decideFormProposal(t.cargo,t.owner,'method',child,'confirmed'),true);const prompt=clone(t.cargo.forms[child].proposalPrompt),confirmation=clone(t.cargo.forms[child].confirmation);
 stageFormProposal(t.cargo,t.hit('60'),descriptor());assert.deepEqual(t.cargo.forms[child].proposalPrompt,prompt);assert.deepEqual(t.cargo.forms[child].confirmation,confirmation);const [approved]=formProposalReadings(t.cargo,t.owner,'method');assert(approved.proposalApproval);const hit={...approved,ok:true};assert.equal(stageFormProposal(t.cargo,hit,question),true);commitFormProposals(t.cargo,[hit]);acceptFormReadings(t.cargo,[hit]);assert.equal(t.state().values.method,'card');assert.equal(t.state().values.amount,undefined);
});
test('accepted exclusive alternatives withdraw pending or confirmed peer proposals without consuming unrelated proof',()=>{
 for(const confirmed of [false,true]){
  const cargo={},owner=openFormInstance(cargo,'exclusive-owner',[{name:'selection',exclusive:true,any_of:[{name:'option',profile:{kind:'choice',choices:[{key:'monthly',words:['monthly']}]}},{name:'amount',profile:{kind:'amount'}}]},{name:'delivery',profile:{kind:'text'}}]);
  const hit=(name,value)=>({form:owner,name,value,raw:value,origin:'answer',ok:true});stageFormProposal(cargo,hit('option','monthly'),descriptor());const peer=cargo.forms[owner].inputProposals.option,child=openFormInstance(cargo,'option-confirm',[],{parent:owner,context:true});bindFormProposal(cargo,owner,'option',child);if(confirmed){confirmFormRevision(cargo,child);decideFormProposal(cargo,owner,'option',child,'confirmed');}
  stageFormProposal(cargo,hit('delivery','email'),{question:'Use email?'});const otherChild=openFormInstance(cargo,'delivery-confirm',[],{parent:owner,context:true});bindFormProposal(cargo,owner,'delivery',otherChild);confirmFormRevision(cargo,otherChild);decideFormProposal(cargo,owner,'delivery',otherChild,'confirmed');const unrelated=clone(cargo.forms[owner].inputProposals.delivery),otherPrompt=clone(cargo.forms[otherChild].proposalPrompt),otherConfirmation=clone(cargo.forms[otherChild].confirmation);
  const amount=hit('amount','15');assert.equal(commitFormProposals(cargo,[amount]),true);assert.equal(peer.status,'superseded');assert.equal(peer.committed,false);assert.equal(peer.approval,undefined);assert.equal(cargo.forms[child].confirmation,null);assert.equal(cargo.forms[child].proposalPrompt,undefined);assert.deepEqual(cargo.forms[owner].inputProposals.delivery,unrelated);assert.deepEqual(cargo.forms[otherChild].proposalPrompt,otherPrompt);assert.deepEqual(cargo.forms[otherChild].confirmation,otherConfirmation);
  acceptFormReadings(cargo,[amount]);assert.equal(cargo.forms[owner].values.amount,'15');assert.equal(cargo.forms[owner].values.option,undefined);assert.equal(cargo.forms[owner].values.delivery,undefined);assert.equal(cargo.forms[owner].inputProposals.delivery.status,'confirmed');
 }
});
test('exclusive peer invalidation is atomic across invalid and conflicting accepted batches',()=>{
 const cargo={},owner=openFormInstance(cargo,'exclusive-owner',[{name:'selection',exclusive:true,any_of:[{name:'option',profile:{kind:'choice',choices:[{key:'monthly',words:['monthly']}]}},{name:'amount',profile:{kind:'amount'}}]},{name:'delivery',profile:{kind:'text'}}]);const hit=(name,value)=>({form:owner,name,value,raw:value,origin:'answer',ok:true});
 stageFormProposal(cargo,hit('option','monthly'),descriptor());const child=openFormInstance(cargo,'option-confirm',[],{parent:owner,context:true});bindFormProposal(cargo,owner,'option',child);confirmFormRevision(cargo,child);decideFormProposal(cargo,owner,'option',child,'confirmed');stageFormProposal(cargo,hit('delivery','email'),{question:'Use email?'});const before=clone(cargo);
 assert.throws(()=>commitFormProposals(cargo,[hit('amount','15'),hit('delivery','email')]),/without approval/);assert.deepEqual(cargo,before,'a later missing approval cannot withdraw an earlier exclusive peer');
 const approved={...formProposalReadings(cargo,owner,'option')[0],ok:true};assert.throws(()=>commitFormProposals(cargo,[approved,hit('amount','15')]),/exclusive alternatives/);assert.deepEqual(cargo,before,'conflicting alternatives cannot consume an otherwise valid approval');
});
test('a changed live confirmation cannot reuse a previous YES snapshot',()=>{
 const t=setup();stageFormProposal(t.cargo,t.hit(),descriptor());const child=approve(t),reading=replay(t);t.cargo.forms[child].revision++;assert.equal(stageFormProposal(t.cargo,reading,descriptor()),false);assert.throws(()=>commitFormProposals(t.cargo,[reading]),/unconsumed/);
});
test('malformed descriptors, unsafe data and stale ownership fail closed without touching action proposals',()=>{
 const t=setup();t.state().proposal={signature:'separate-action',status:'prepared'};
 for(const invalid of [{},{question:''},{question:'ok',extra:true},{question:'ok',binding:{n:Infinity}},{question:'ok',on_declined:'{{dynamic}}'}])assert.throws(()=>stageFormProposal(t.cargo,t.hit(),invalid),/proposal/);
 const cycle={};cycle.self=cycle;assert.throws(()=>stageFormProposal(t.cargo,t.hit(cycle),descriptor()),/proposal/);assert.throws(()=>stageFormProposal(t.cargo,t.hit('50',{ok:false}),descriptor()),/validated/);
 const dangerous=Object.create(null);Object.defineProperty(dangerous,'constructor',{enumerable:true,value:'bad'});assert.throws(()=>stageFormProposal(t.cargo,t.hit(dangerous),descriptor()),/unsafe/);
 let read=false;const getter={get amount(){read=true;return 50;}};assert.throws(()=>stageFormProposal(t.cargo,t.hit(getter),descriptor()),/JSON data properties/);assert.equal(read,false);
 assert.deepEqual(t.state().proposal,{signature:'separate-action',status:'prepared'});
});
console.log(`Form proposal state: all ${checks} checks passed`);
