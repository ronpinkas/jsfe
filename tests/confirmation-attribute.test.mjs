/** One attribute, `confirmation: 'firm' | 'soft'`, on all three confirmations (owner 2026-11-09): an input's, a form's
 * confirm and an inferred value's descriptor. Declared, it is definite; absent, firm only for a payment. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,definePerformer,formFlow,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {validateFormProposalDescriptor,validateFormProposalPolicy} from '../dist/helpers/proposal-contract.js';
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
const confirmationOf=(flow)=>{const step=(o)=>o&&typeof o==='object'?(o.type==='SET'&&o.variable==='form_confirm_firmness'?o:Object.values(o).map(step).find(Boolean)):null;return step(flow)?.value??null;};
const charge=[{action:'charge',effect:'charge',flow:'charge-effect',confirm:{exact:true,question:'Charge it? YES or NO.'},outcomes:{paid:'resolved'}}];
const performer=(confirm)=>definePerformer({id:'act',name:'Act',description:'An action',inputs:[],contract:{summary:'Act'},performs:charge,prepare:'prepare-act',present:'present-act',...(confirm?{confirm}:{})});
const plain=(confirm)=>defineForm({id:'f',name:'F',description:'F',contract:{summary:'F'},inputs:[{name:'a',profile:{kind:'text'},question:'A?'}],confirm});

await test('form: a declared soft confirmation on a payment is soft',()=>{assert.equal(confirmationOf(plain({question:'OK?',confirmation:'soft'})),'"soft"');});
await test('form: a declared firm confirmation on a plain form is firm',()=>{assert.equal(confirmationOf(plain({question:'OK?',confirmation:'firm'})),'"firm"');});
await test('form: absent, a plain form is soft',()=>{assert.equal(confirmationOf(plain({question:'OK?'})),'"soft"');});
await test('form: absent, a payment is firm',()=>{const f=performer();const find=(o)=>o&&typeof o==='object'?(o.type==='SET'&&o.variable==='form_confirm_firmness'?o:Object.values(o).map(find).find(Boolean)):null;assert.equal(find(f)?.value,'"firm"');});
await test('form: any other value is refused',()=>{assert.throws(()=>plain({question:'OK?',confirmation:'maybe'}),/confirm.confirmation must be "firm" or "soft"/);});
await test('inferred value: the descriptor and the policy accept the attribute',()=>{assert.equal(validateFormProposalDescriptor({question:'Q?',confirmation:'firm'}).confirmation,'firm');assert.equal(validateFormProposalPolicy({question:'Q?',confirmation:'soft'}).confirmation,'soft');});
await test('inferred value: any other value is refused',()=>{assert.throws(()=>validateFormProposalDescriptor({question:'Q?',confirmation:'maybe'}),/confirmation must be "firm" or "soft"/);});

// Live: at an inferred value, a YES the word reader cannot read is offered to the reply ranker unless declared firm.
const kindProfile={kind:'choice',choices:[{key:'lost',words:['lost']},{key:'stolen',words:['stolen']}]};
function fixture(declared,rank='yes'){
 const proposal={question:'Your card was lost. Proceed? Say YES or NO.',origins:['activation'],phrases:['report it'],...(declared?{confirmation:declared}:{})};
 const form=defineForm({id:'claim',name:'claim',primary:true,version:'1',description:'Report a card',contract:{summary:'Report a card'},parameters:[{name:'kind',type:'string'}],
  inputs:[{name:'kind',label:'card condition',profile:kindProfile,question:'What happened?',proposal}],after:[{id:'done',type:'SET',variable:'noop',value:'(cargo.completed=true,true)'}]});
 const offered=[];
 const ai=async(_s,_u,_schema,r)=>{if(r?.task==='rank_reply'){offered.push(r.options);return JSON.stringify({option:rank==='yes'&&r.options.includes('choice:yes')?'choice:yes':'answers'});}return JSON.stringify({});};
 const engine=new WorkflowEngine({info(){},debug(){},warn(){},error(){}},ai,linkFormSchemas([...FLOWS,form]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();
 let session=engine.initSession('t',crypto.randomUUID(),'en');session.cargo.voice=false;
 return {offered,get session(){return session;},async say(content,start){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start}:{})},session)));return session.response||'';}};
}
await test('inferred value: absent, soft: the ranker is offered YES and a free-worded yes is accepted',async()=>{
 const t=fixture();const r=await t.say('my card',{flow:'claim',arguments:{kind:'lost'}});assert.match(r,/Proceed\?/);
 await t.say('yes yes I want to report it');assert.ok(t.offered.some(o=>o.includes('choice:yes')),JSON.stringify(t.offered));assert.equal(t.session.cargo.completed,true,'the yes accepted the value and the form completed');});
await test('inferred value: declared firm: YES is not offered to the ranker',async()=>{
 const t=fixture('firm');await t.say('my card',{flow:'claim',arguments:{kind:'lost'}});await t.say('yes yes I want to report it');
 assert.ok(!t.offered.some(o=>o.includes('choice:yes')),JSON.stringify(t.offered));assert.notEqual(t.session.cargo.completed,true);});
await test('soft: the flow\'s own YES phrase inside a longer sentence does not confirm by itself',async()=>{
 const t=fixture(undefined,'answers');await t.say('my card',{flow:'claim',arguments:{kind:'lost'}});await t.say('report it for the other card, not this one');
 assert.notEqual(t.session.cargo.completed,true);await t.say('report it');assert.equal(t.session.cargo.completed,true,'the phrase as the whole answer confirms');});
console.log(`Confirmation attribute: all checks passed (${checks})`);
