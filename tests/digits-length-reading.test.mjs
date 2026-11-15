/** A number of the wrong length at its own question is a reading of that field, rejected by its validation with the count
 * heard and the count it takes; the message rides with the question that re-asks (owner 2026-11-15; prod 2026-11-14: "Sí, el
 * número es 4 8 1 5 8 2 0 3" at the card number was asked again with no reason). Also the pause-join pieces (a ZIP "44. 9 0 0 4
 * 4." is 90044) and four single spoken expiration digits with words around them ("0 6 3 0 30 se vence"). */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,formFlow,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const S=(id,value,variable='noop')=>({id,type:'SET',variable,value});
let checks=0;const failures=[];
async function test(name,run){try{await run();checks++;console.log('PASS '+name);}catch(error){failures.push({name,error});console.error('FAIL '+name+'\n'+error.stack);}}
function fixture(flows,{language='en'}={}){
 const ranked=[];const quiet={info(){},debug(){},error(){},warn(){}};
 const ai=async(_s,_m,_schema,request)=>{if(request?.task==='rank_reply'){ranked.push(request.input||'');return JSON.stringify({option:'answers'});}if(request?.task==='detect_flow')return JSON.stringify({flowName:'None',parameters:{}});throw new Error('Unexpected model task');};
 const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,...flows]),[],{...STANDARD_FUNCTIONS},{},false,language);engine.disableCommands();
 let session=engine.initSession('fixture',crypto.randomUUID(),language);Object.assign(session.cargo,{voice:true});
 return {ranked,get session(){return session;},async say(content,start){session=clone(await engine.updateActivity({role:'user',content,...(start?{start:{flow:start}}:{})},clone(session)));return String(session.response||'').replace(/\s+/g,' ');}};
}
const commit=S('commit',"(cargo.done=(cargo.done||[]).concat([cargo.forms[form_instance].values]),true)");
const form=(id,inputs,extra={})=>formFlow({id,name:id,version:'1',inputs,after:[commit],...extra});

await test('es: eight digits in a sentence at the card number say the count with the card question, never the first-task line',async()=>{
 const t=fixture([],{language:'es'});await t.say('start','collect-credit-card');
 const reply=await t.say('Sí, el número es 4 8 1 5 8 2 0 3.');
 assert.match(reply,/Escuché 8 dígitos; el número de la tarjeta tiene 16, o 15 si es American Express\./,reply);
 assert.match(reply,/número (completo )?de su tarjeta/,reply);
 assert.doesNotMatch(reply,/primero vamos a/,reply);
 assert.equal(t.ranked.length,0,'the reading is the field\'s: the ranker is not asked');
 assert.doesNotMatch(JSON.stringify(t.session.cargo),/"card_number":"48158203"/);
});
await test('en: a digits-only number of the wrong length (no partial is held for it) says the count',async()=>{
 const t=fixture([]);await t.say('start','collect-credit-card');
 const reply=await t.say('91234567890');
 assert.match(reply,/I heard 11 digits; a card number has 16, or 15 for American Express\./,reply);
});
await test('a keyed partial that starts like a card is still held (accumulate unchanged)',async()=>{
 const t=fixture([]);await t.say('start','collect-credit-card');
 const reply=await t.say('4111 1111');
 assert.doesNotMatch(reply,/I heard/,reply);
 await t.say('1111 1111');assert.match(JSON.stringify(t.session.cargo),/"card_number":"4111111111111111"/);
});
await test('a must_complete ZIP: three digits in a sentence are rejected with the count, not the first-task line, and the ZIP is taken after',async()=>{
 const t=fixture([form('pay',[{name:'zip',field:'zip',question:'ZIP?'}],{must_complete:true})]);await t.say('begin','pay');
 const reply=await t.say('the code is 3 3 2');
 assert.match(reply,/I heard 3 digits; a ZIP code has 5\./,reply);assert.doesNotMatch(reply,/first let's/,reply);
 await t.say('92507');assert.deepEqual(t.session.cargo.done,[{zip:'92507'}]);
});
await test('an amount said at the card number is read as the amount, not a wrong-length card number',async()=>{
 const t=fixture([form('buy',[{name:'card',field:'card_number'},{name:'amount',field:'amount'}])],{language:'es'});await t.say('begin','buy');
 const reply=await t.say('a pagar 100 dólares');
 assert.doesNotMatch(reply,/Escuché/,reply);
 assert.match(JSON.stringify(t.session.cargo.forms),/"amount":(100|"100(\.00)?")/);
});
await test('a field without a declared length is unchanged',async()=>{
 const t=fixture([form('plain',[{name:'code',label:'code',profile:{kind:'pattern',regex:'^[A-Z]{3}$'},question:'Code?'}])]);await t.say('begin','plain');
 const reply=await t.say('it is 12345');assert.doesNotMatch(reply,/I heard/,reply);
});
await test('a pattern field with a declared length reads only its pattern (a tracking number): no length message',async()=>{
 const t=fixture([form('track',[{name:'tracking_number',label:'tracking number',profile:{kind:'pattern',regex:'\\b(?=[A-Za-z0-9]*[0-9])[A-Za-z0-9]{8,40}\\b'},digits:{min:8,max:40},question:'Tracking number?'}])]);await t.say('begin','track');
 const reply=await t.say('My invoice number is 4455667');assert.doesNotMatch(reply,/I heard/,reply);
});
for(const [said,zip] of [['Nuevecientos 44. 9 0 0 4 4.','90044'],['926, 1 0.','92610'],['92, 507.','92507'],['7, 9, 984. 5.',null]]){
 await test(`ZIP "${said}"`,async()=>{
  const t=fixture([form('z',[{name:'zip',field:'zip',question:'ZIP?'}])]);await t.say('begin','z');await t.say(said);
  if(zip)assert.deepEqual(t.session.cargo.done,[{zip}]);else assert.equal(t.session.cargo.done,undefined);
 });
}
for(const [said,mmyy] of [['0 6 3 0 30 se vence.','0630'],['1 2 2 9, ya','1229']]){
 await test(`expiration "${said}"`,async()=>{
  const t=fixture([],{language:'es'});await t.say('start','collect-credit-card');await t.say('4111111111111111');
  const reply=await t.say(said);assert.match(reply,/código de seguridad/,reply);
  assert.match(JSON.stringify(t.session.cargo),new RegExp(`"card_expiration":"${mmyy}"`));
 });
}
await test('four single digits out of order are not an expiration: at the billing ZIP, "1 2 3 6 Avenue ... 8 9 3 0 1" keeps its ZIP and asks no expiration-or-code question',async()=>{
 const t=fixture([]);await t.say('start','collect-credit-card');await t.say('4111111111111111');await t.say('0929');await t.say('123');
 const reply=await t.say('1 2 3 6 Avenue, g Nevada 8 9 3 0 1.');
 assert.doesNotMatch(reply,/expiration/i,reply);
 assert.match(JSON.stringify(t.session.cargo),/"card_zip":"89301"/);
 assert.doesNotMatch(JSON.stringify(t.session.cargo),/"card_expiration":"1 ?2 ?3 ?6"/);
});
await test('a spoken expiration with no words is stored as its four digits, never with spaces',async()=>{
 const t=fixture([]);await t.say('start','collect-credit-card');await t.say('4111111111111111');await t.say('0 5 2 9.');
 assert.match(JSON.stringify(t.session.cargo),/"card_expiration":"0529"/);
});
await test('the must_complete first-task line names the exit (SALIR / EXIT) and not an agent',async()=>{
 const es=fixture([form('pay',[{name:'zip',field:'zip',question:'ZIP?',question_es:'¿CÓDIGO?'}],{must_complete:true})],{language:'es'});await es.say('begin','pay');
 const reply=await es.say('la verdad no me acuerdo cuál es');
 assert.match(reply,/Entiendo, primero vamos a .*Para cancelar, presione la tecla de asterisco o diga SALIR\./,reply);assert.doesNotMatch(reply,/AGENTE/,reply);
 const en=fixture([form('pay',[{name:'zip',field:'zip',question:'ZIP?'}],{must_complete:true})]);en.session.cargo.voice=false;await en.say('begin','pay');
 const text=await en.say('I am not sure what you mean by that');assert.match(text,/first let's .*To cancel, type EXIT\./,text);
});
if(failures.length){console.error(`digits-length-reading: ${failures.length} failed`);process.exit(1);}else console.log(`digits-length-reading: ${checks} checks passed`);
