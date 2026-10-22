/** Opt-in narrative ownership: prose and typed evidence coexist; incidental ancestors cannot change intent. */
import assert from 'node:assert/strict';
import {matchInputs,readFormAnswer} from '../src/helpers/match-inputs.js';
let checks=0;const test=(name,run)=>{run();checks++;console.log('PASS '+name);};
const reason={form:'details',name:'reason',profile:{kind:'text',narrative:true}};
const service={form:'request',name:'service',value:'verizon',profile:{kind:'choice',choices:[{key:'verizon',words:['verizon'],neutral:true},{key:'phone',words:['phone','line','teléfono','línea'],neutral:true},{key:'insurance',words:['insurance','seguro'],neutral:true}]}};
const phone={form:'details',name:'line',profile:{kind:'phone'}};
const read=(text,fields=[reason,service])=>matchInputs(text,fields,{form:'details',name:'reason'});
const pairs=r=>r.hits.map(h=>[h.name,h.value]).sort();
const narratives=['I changed carriers, the line is 8185551234','Cambié de compañía, la línea es 8185551234'];
for(const text of narratives){
 test('incidental different ancestor choice is context: '+text,()=>{assert.deepEqual(pairs(read(text)),[['reason',text]]);});
 test('rationale and independently typed phone both accepted: '+text,()=>{const r=read(text,[reason,phone,service]);assert.deepEqual(pairs(r),[['line','8185551234'],['reason',text]]);assert.deepEqual(r.ambiguous,[]);assert.equal(service.value,'verizon');});
}
for(const text of ['phone','the phone please','línea','mi línea por favor'])test('whole parent selection still corrects service: '+text,()=>assert.deepEqual(pairs(read(text)),[['service','phone']]));
for(const text of ['actually insurance','switch to insurance instead','change the service to insurance','insurance instead','en realidad seguro','mejor seguro','cambiar a seguro','cambié a seguro'])test('bounded explicit parent correction: '+text,()=>assert.deepEqual(pairs(read(text)),[['service','insurance']]));
for(const text of ['Actually the phone line no longer works','I changed carriers instead of keeping this line','En realidad la línea ya no funciona'])test('a correction cue without a whole selected choice remains a narrative: '+text,()=>assert.deepEqual(pairs(read(text)),[['reason',text]]));
for(const text of ['8185551234','818 555 1234'])test('typed-only phone does not fill narrative: '+text,()=>assert.deepEqual(pairs(read(text,[reason,phone,service])),[['line','8185551234']]));
test('explicit correction and independent typed field remain a compound',()=>assert.deepEqual(pairs(read('actually insurance, 8185551234',[reason,phone,service])),[['line','8185551234'],['service','insurance']]));
test('a current narrative does not block out-of-order email',()=>{
 const email={form:'request',name:'email',profile:{kind:'email'}};
 assert.deepEqual(pairs(read('owner@example.com',[reason,email,service])),[['email','owner@example.com']]);
 assert.deepEqual(pairs(read('It costs too much, my email is owner@example.com',[reason,email,service])),[['email','owner@example.com'],['reason','It costs too much, my email is owner@example.com']]);
});
test('declared confirmation ambiguity remains explicit',()=>{
 const r=read(narratives[0],[{...reason,confirm_against:['service']},phone,service]);
 assert.deepEqual(pairs(r),[['line','8185551234']]);assert.deepEqual(r.ambiguous.map(h=>h.name).sort(),['reason','service']);
});
test('ordinary text keeps the historical structured precedence',()=>assert.deepEqual(pairs(read(narratives[0],[{...reason,profile:{kind:'text'}},service])),[['service','phone']]));
test('a sibling structured choice remains independently collectable',()=>{
 const delivery={form:'details',name:'delivery',profile:{kind:'choice',choices:[{key:'email',words:['email'],neutral:true}]}};
 assert.deepEqual(pairs(read('email please',[reason,delivery,service])),[['delivery','email']]);
});
test('a provider question is not a narrative answer',()=>{
 const r=readFormAnswer('what is my balance?',[reason,service],{form:'details',name:'reason'},'',[{key:'balance',words:['balance']}]);
 assert.deepEqual(r.hits,[]);assert.deepEqual(r.questions,['balance']);
});
const caseChoice={form:'case',name:'kind',value:'missing_payment',profile:{kind:'choice',choices:[{key:'missing_payment',words:['missing payment','pago faltante'],neutral:true},{key:'credit',words:['credit','crédito'],neutral:true},{key:'refund',words:['refund','reembolso'],neutral:true}]}};
const detail={form:'case',name:'detail',reset_on:['kind'],profile:{kind:'text',narrative:true}};
for(const text of ['October 12, the credit is still missing','El 12 de octubre, todavía falta el crédito','INV-1200, todavía falta el crédito','I paid with a credit card','Pagué con tarjeta de crédito'])test('incidental same-form discriminator is context: '+text,()=>assert.deepEqual(pairs(matchInputs(text,[caseChoice,detail],{form:'case',name:'detail'})),[['detail',text]]));
for(const text of ['credit','crédito','actually credit','en realidad crédito'])test('same-form whole or explicit correction remains authoritative: '+text,()=>assert.deepEqual(pairs(matchInputs(text,[caseChoice,detail],{form:'case',name:'detail'})),[['kind','credit']]));
const channel={form:'case',name:'channel',reset_on:['kind'],profile:{kind:'choice',narrative:true,accept_other:true,choices:[{key:'online',words:['online','en línea'],neutral:true},{key:'store',words:['store','tienda'],neutral:true}]}};
for(const text of ['I paid online and the credit is still missing','Lo hice en línea y todavía falta el crédito'])test('valid current choice owns its narrative context: '+text,()=>assert.deepEqual(pairs(matchInputs(text,[caseChoice,channel],{form:'case',name:'channel'})),[['channel','online']]));
test('choice narrative opt-in preserves declared cross-field ambiguity',()=>{const r=matchInputs('credit',[caseChoice,{...channel,confirm_against:['kind'],profile:{...channel.profile,choices:[{key:'online',words:['credit'],neutral:true}]}}],{form:'case',name:'channel'});assert.deepEqual(r.hits,[]);assert.deepEqual(r.ambiguous.map(x=>x.name).sort(),['channel','kind']);});
for(const text of ['credit','crédito','actually credit','en realidad crédito'])test('a narrative choice fallback yields to whole/explicit discriminator correction: '+text,()=>assert.deepEqual(pairs(matchInputs(text,[caseChoice,channel],{form:'case',name:'channel'})),[['kind','credit']]));
test('choice narrative opt-in still collects an independent phone',()=>{const r=matchInputs('online credit 8185551234',[caseChoice,channel,{form:'case',name:'phone',profile:{kind:'phone'}}],{form:'case',name:'channel'});assert.deepEqual(pairs(r),[['channel','online'],['phone','8185551234']]);});
test('ordinary current choice retains historical independent sibling collection',()=>{const r=matchInputs('online credit',[caseChoice,{...channel,profile:{...channel.profile,narrative:false}}],{form:'case',name:'channel'});assert.deepEqual(pairs(r),[['channel','online'],['kind','credit']]);});
for(const text of ['It was October 12 online, the credit is still missing','Fue el 12 de octubre en línea, todavía falta el crédito'])test('dependent intent is protected while an independent sibling channel is collected: '+text,()=>{
 const date={...detail,name:'date'};const r=matchInputs(text,[caseChoice,date,channel],{form:'case',name:'date'});assert.deepEqual(pairs(r),[['channel','online'],['date',text]]);assert.deepEqual(r.ambiguous,[]);
});
test('a narrative and independent sibling choice keep separate evidence',()=>{const sibling={form:'details',name:'delivery',profile:{kind:'choice',choices:[{key:'email',words:['email'],neutral:true}]}};assert.deepEqual(pairs(read('The cost is too high, email me please',[reason,sibling,service])),[['delivery','email'],['reason','The cost is too high, email me please']]);});
console.log(`Narrative inputs: all checks passed (${checks})`);
