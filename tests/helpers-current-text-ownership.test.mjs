/** A known business choice mentioned as context cannot consume a valid current text answer. */
import assert from 'node:assert/strict';
import {matchInputs,readFormAnswer} from '../src/helpers/match-inputs.js';
let checks=0;const test=(name,run)=>{run();checks++;console.log('PASS '+name);};
const current={form:'details',name:'reason',profile:{kind:'text'}};
const subject=(form='request',options={})=>({form,name:'service',value:'membership',profile:{kind:'choice',choices:[{key:'membership',words:['membership','membresía','membresia'],...options},{key:'insurance',words:['insurance','seguro','póliza'],neutral:true}]}});
const compact=result=>({hits:result.hits.map(({form,name,value,known})=>({form,name,value,known})),ambiguous:result.ambiguous.map(({name,value})=>({name,value}))});
const match=(text,parent=subject(),field=current)=>matchInputs(text,[field,parent],{form:field.form,name:field.name});
for(const scope of ['details','request'])for(const option of [{neutral:true},{neutral:false},{exact:true,neutral:true}])for(const text of ['The cost of the membership is too high','El costo de la membresía es demasiado alto'])test('current text owns incidental known choice: '+scope+' '+JSON.stringify(option)+' '+text,()=>{
 assert.deepEqual(compact(match(text,subject(scope,option))),{hits:[{form:'details',name:'reason',value:text,known:false}],ambiguous:[]});
});
for(const text of ['I no longer want the membership','Ya no quiero seguir pagando mi membresía'])test('an incidental known choice cannot replace a negated current reason: '+text,()=>{
 const result=match(text,subject('request',{neutral:true}));assert.deepEqual(result.hits,[{form:'details',name:'reason',value:text,known:false}]);assert.deepEqual(result.ambiguous,[]);
});
for(const text of ['membership','the membership please','membresía','mi membresía por favor'])test('whole known parent choice still belongs to the parent: '+text,()=>{
 assert.deepEqual(match(text,subject('request',{neutral:true})).hits,[{form:'request',name:'service',value:'membership',known:true}]);
});
for(const text of ['insurance','switch to insurance instead','cambiar a póliza'])test('new explicit parent choice remains a correction: '+text,()=>{
 assert.deepEqual(match(text).hits,[{form:'request',name:'service',value:'insurance',known:false}]);
});
test('a known current answer remains known while incidental accepted parent data stays unchanged',()=>{
 const text='The cost of the membership is too high',parent=subject(),field={...current,value:text};
 assert.deepEqual(match(text,parent,field).hits,[{form:'details',name:'reason',value:text,known:true}]);assert.equal(parent.value,'membership');
});
test('a structured current choice keeps priority over a repeated ancestor choice',()=>{
 const field={...current,profile:{kind:'choice',choices:[{key:'expensive',words:['membership'],neutral:true}]}};
 assert.deepEqual(match('membership',subject(),field).hits,[{form:'details',name:'reason',value:'expensive',known:false}]);
});
test('explicit confirm_against ambiguity remains even for a known incidental parent',()=>{
 const result=match('The cost of membership is too high',subject(),{...current,confirm_against:['service']});
 assert.deepEqual(result.hits,[]);assert.deepEqual(result.ambiguous.map(item=>item.name).sort(),['reason','service']);
});
for(const [text,field,value] of [
 ['juan@example.com',{name:'email',profile:{kind:'email'}},'juan@example.com'],
 ['818 555 0147',{name:'phone',profile:{kind:'phone'}},'8185550147'],
 ['$50',{name:'amount',profile:{kind:'amount'}},'50'],
 ['56035214',{name:'account',profile:{kind:'identifier',pattern:'^5\\d{6,7}$'}},'56035214'],
])test('structured out-of-order evidence still outranks free text: '+field.name,()=>{
 const candidate={form:'request',...field};assert.deepEqual(matchInputs(text,[current,candidate,subject()],{form:'details',name:'reason'}).hits,[{form:'request',name:field.name,value,known:false}]);
});
test('a compound answer still collects independent structured inputs',()=>{
 const fields=[current,subject(),{form:'request',name:'email',profile:{kind:'email'}},{form:'request',name:'phone',profile:{kind:'phone'}}];
 const result=matchInputs('email juan@example.com and phone 818 555 0147',fields,{form:'details',name:'reason'});
 assert.deepEqual(result.hits.map(hit=>[hit.name,hit.value]).sort(),[['email','juan@example.com'],['phone','8185550147']]);assert.deepEqual(result.ambiguous,[]);
});
for(const text of ['95 52','95 52 please'])test('grouped semantic digits remain a whole known choice: '+text,()=>{
 const card={form:'request',name:'card',value:'card',profile:{kind:'choice',choices:[{key:'card',words:['9552'],neutral:true}]}};
 assert.deepEqual(matchInputs(text,[current,card],{form:'details',name:'reason'}).hits,[{form:'request',name:'card',value:'card',known:true}]);
});
test('a declared pattern fallback also owns text context but preserves an actual structured match',()=>{
 const field={...current,profile:{kind:'pattern',regex:'^\\d{5}$',accept_other:true}};
 assert.equal(match('The cost of membership is too high',subject(),field).hits[0].name,'reason');assert.equal(match('85001',subject(),field).hits[0].value,'85001');
});
test('provider questions remain questions rather than accepted text',()=>{
 const answer=readFormAnswer('what is the membership price?', [current,subject()],{form:'details',name:'reason'},'',[{key:'price',words:['price']}]);
 assert.deepEqual(answer.hits,[]);assert.deepEqual(answer.questions,['price']);
});
test("nested free-text fields cannot take each other's current answer",()=>{
 const ancestor={form:'request',name:'notes',profile:{kind:'text'}};
 const result=matchInputs('The cost of membership is too high',[current,ancestor,subject()],{form:'details',name:'reason'});
 assert.deepEqual(result.hits,[{form:'details',name:'reason',value:'The cost of membership is too high',known:false}]);
});
test('multiple current fallback fields retain group ambiguity',()=>{
 const second={...current,name:'comments'};const result=matchInputs('The cost of membership is too high',[current,second,subject()],{form:'details',names:['reason','comments']});
 assert.deepEqual(result.hits,[]);assert.deepEqual(result.ambiguous.map(hit=>hit.name).sort(),['comments','reason']);
});
test('disjoint structured inputs stay exclusive when their group explicitly requires it',()=>{
 const email={form:'request',name:'email',group:'contact',exclusive:true,profile:{kind:'email'}},phone={form:'request',name:'phone',group:'contact',exclusive:true,profile:{kind:'phone'}};
 const result=matchInputs('juan@example.com and 818 555 0147',[current,email,phone],{form:'details',name:'reason'});
 assert.deepEqual(result.hits,[]);assert.deepEqual(result.ambiguous.map(hit=>hit.name).sort(),['email','phone']);
});
test('overlapping structured shapes still require disambiguation at the same scope',()=>{
 const first={form:'request',name:'code',profile:{kind:'digits',min:4,max:4}},second={...first,name:'pin'};
 const result=matchInputs('1234',[current,first,second],{form:'details',name:'reason'});
 assert.deepEqual(result.hits,[]);assert.deepEqual(result.ambiguous.map(hit=>hit.name).sort(),['code','pin']);
});
test('a declared confirmation pair does not absorb independent structured data',()=>{
 const field={...current,confirm_against:['service']},phone={form:'request',name:'phone',profile:{kind:'phone'}};
 const result=matchInputs('membership and 818 555 0147',[field,subject(),phone],{form:'details',name:'reason'});
 assert.deepEqual(result.hits,[{form:'request',name:'phone',value:'8185550147',known:false}]);assert.deepEqual(result.ambiguous.map(hit=>hit.name).sort(),['reason','service']);
});
test('current keypad selection remains stronger than current free text',()=>{
 const route={form:'details',name:'route',profile:{kind:'choice',choices:[{key:'link',keys:['1'],words:['link']}]}};
 const result=matchInputs('1',[current,route],{form:'details',names:['reason','route']});
 assert.deepEqual(result.hits,[{form:'details',name:'route',value:'link',known:false}]);assert.deepEqual(result.ambiguous,[]);
});
console.log(`Current text ownership: all checks passed (${checks})`);
