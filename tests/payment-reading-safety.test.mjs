/** Money evidence must not turn card references, partial corrections or past payments into a charge amount. */
import assert from 'node:assert/strict';
import {amountInAnswer} from '../src/helpers/answer.js';
import {readMoneyAmount,moneyIntentAllows} from '../src/helpers/money.js';
import {readInputProfile} from '../src/helpers/match-inputs.js';
const USD={currency:'USD',cardinals:true,intent:'payment'};
let checks=0;
for(const raw of ['con 75 centavos','and 75 cents','y 75 centavos','la 4242 termina 4242','Termina 5555','card ending in 4242','Visa 4242']){
 assert.ok(Number.isNaN(amountInAnswer(raw)),raw);assert.ok(Number.isNaN(readMoneyAmount(raw,USD)),raw);const hit=readInputProfile({kind:'amount',money:USD},raw,true);if(/^(?:con|and|y) /.test(raw)){assert.equal(hit?.incompleteMoney,true,raw);assert.equal(hit.value,raw);}else assert.equal(hit,null,raw);checks++;
}
for(const raw of ['Pague 130','Pagué 130','ya pagué 130','I paid 130','we have paid 130','I just paid $130']){
 assert.equal(moneyIntentAllows(raw,'payment'),false,raw);assert.ok(Number.isNaN(readMoneyAmount(raw,USD)),raw);assert.equal(readInputProfile({kind:'amount',money:USD},raw,true),null,raw);checks++;
}
for(const [raw,amount] of [['75 cents',.75],['75 centavos',.75],['123 con 75 centavos',123.75],['pay 50 with card ending 4242',50],['pagar 50 con tarjeta que termina en 4242',50]]){
 assert.equal(readMoneyAmount(raw,USD),amount,raw);checks++;
}
// No finite grammar needs to infer whether these utterances are a refusal, question or changed task.
for(const raw of ['pay what I paid last month, $50','pagar lo que pagué el mes pasado, $50',"I can't pay $50 today",'no entiendo, quiero pagar50','is $50 enough?','I thought $50 was due','my bill says $50 but I need help','50 dollars tomorrow','no pagar50']){
 assert.equal(moneyIntentAllows(raw,'payment'),false,raw);assert.ok(Number.isNaN(readMoneyAmount(raw,USD)),raw);assert.equal(readInputProfile({kind:'amount',money:USD},raw,true),null,raw);checks++;
}
console.log(`Payment reading safety: all checks passed (${checks})`);
// A permissive domain validator cannot turn a structurally incomplete amount into an accepted value.
const {WorkflowEngine}=await import('../dist/index.js');
const {FLOWS,formFlow,linkFormSchemas}=await import('../dist/forms/index.js');
const {STANDARD_FUNCTIONS}=await import('../dist/helpers/index.js');
const owner=formFlow({id:'partial-money-owner',name:'PartialMoneyOwner',inputs:[{name:'amount',profile:{kind:'amount',money:USD},validator:'accept-any-amount',question:'COMPLETE AMOUNT?'}],confirm:{question:'AUTHORIZE?'},after:[{id:'effect',type:'SET',variable:'noop',value:'(cargo.effects=1,true)'}]});
const permissive={id:'accept-any-amount',name:'AcceptAnyAmount',parameters:[{name:'value',type:'string'}],steps:[{id:'accept',type:'SET',variable:'noop',value:'(cargo.inputCheck={ok:true,value:42},true)'}]};
const quiet={info(){},debug(){},warn(){},error(){}};
const engine=new WorkflowEngine(quiet,async()=>JSON.stringify({flowName:'None'}),linkFormSchemas([...FLOWS,owner,permissive]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();
let session=engine.initSession('synthetic','partial-money','en');
for(const [text,start] of [['begin',true],['con75 centavos',false]])session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content:text,...(start?{start:{flow:'partial-money-owner'}}:{})},session)));
assert.equal(session.cargo.forms[session.cargo.formTasks['partial-money-owner']].values.amount,undefined);assert.equal(session.cargo.effects,undefined);assert.doesNotMatch(session.response,/AUTHORIZE/);checks++;
console.log(`Payment reading withholding: all checks passed (${checks})`);
