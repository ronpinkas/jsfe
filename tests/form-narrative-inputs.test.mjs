/** Real FORM ownership and callback behavior for an opted-in narrative; no tools/models/network. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {formFlow,FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={debug(){},info(){},warn(){},error(){}};
const choices=[{key:'verizon',words:['verizon'],neutral:true},{key:'phone',words:['phone','line','teléfono','línea'],neutral:true},{key:'insurance',words:['insurance','seguro'],neutral:true}];
const S=(id,value)=>({id,type:'SET',variable:'noop',value});
let checks=0;
async function test(name,run){await run();checks++;console.log('PASS '+name);}
function fixture(language,voice,contactName='line'){
 const child=formFlow({id:'details',name:'Details',inputs:[{name:'reason',profile:{kind:'text',narrative:true},question:'Why?',question_es:'¿Por qué?',after:'accepted'},{name:contactName,profile:{kind:contactName==='email'?'email':'phone'},question:'Contact?',question_es:'¿Contacto?'}]});
 const owner=formFlow({id:'request',name:'Request',inputs:[{name:'service',profile:{kind:'choice',choices},question:'Which service?',question_es:'¿Qué servicio?'},{name:'details',form:'details',reset_on:['service']}],after:[S('record',"(cargo.records=(cargo.records||[]).concat([{service:cargo.forms[form_instance].values.service,details:cargo.forms[form_instance].values.details}]),true)")]});
 const callback={id:'accepted',name:'Accepted',version:'1',parameters:[{name:'form',type:'string'},{name:'value',type:'string'}],steps:[S('count',"(cargo.acceptedReasons=(cargo.acceptedReasons||[]).concat([value]),true)")]};
 const engine=new WorkflowEngine(quiet,null,linkFormSchemas([...FLOWS,owner,child,callback]),[],{...STANDARD_FUNCTIONS},{});engine.disableCommands();
 let session=engine.initSession('test',crypto.randomUUID(),language);session.cargo.voice=voice;
 return {get session(){return session;},async say(content,start){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'request'}}:{})},session)));return String(session.response||'');},owner(){return session.cargo.forms[session.cargo.formTasks.request];}};
}
for(const language of ['en','es'])for(const voice of [false,true]){
 await test(`${language} ${voice?'voice':'text'} a reason plus line keeps the selected service and invokes callbacks once`,async()=>{
  const t=fixture(language,voice);await t.say('begin',true);await t.say('verizon');assert.equal(t.session.cargo.records,undefined);
  const text=language==='es'?'Cambié de compañía, la línea es 8185551234':'I changed carriers, the line is 8185551234';await t.say(text);
  assert.deepEqual(t.session.cargo.records,[{service:'verizon',details:{reason:text,line:'8185551234'}}]);assert.deepEqual(t.session.cargo.acceptedReasons,[text]);assert.equal(t.session.flowStacks.flat().length,0);
 });
 await test(`${language} ${voice?'voice':'text'} narrative prose cannot alter the exact visible email recipient`,async()=>{
  const t=fixture(language,voice,'email');await t.say('begin',true);await t.say('verizon');
  const text=language==='es'?'La línea cuesta demasiado; contacte owner@example.com.':'The line costs too much; contact owner@example.com.';await t.say(text);
  assert.deepEqual(t.session.cargo.records,[{service:'verizon',details:{reason:text,email:'owner@example.com'}}]);assert.deepEqual(t.session.cargo.acceptedReasons,[text]);
 });
 await test(`${language} ${voice?'voice':'text'} a bare out-of-order number does not prematurely complete the rationale`,async()=>{
  const t=fixture(language,voice);await t.say('begin',true);await t.say('verizon');const response=await t.say('8185551234');assert.match(response,language==='es'?/Por qué/:/Why/);assert.equal(t.session.cargo.records,undefined);assert.equal(t.session.cargo.acceptedReasons,undefined);
  const text=language==='es'?'Ya no necesito esta línea':'I no longer need this line';await t.say(text);assert.deepEqual(t.session.cargo.records,[{service:'verizon',details:{line:'8185551234',reason:text}}]);assert.deepEqual(t.session.cargo.acceptedReasons,[text]);
 });
 await test(`${language} ${voice?'voice':'text'} a whole explicit parent correction changes service without submitting a stale reason`,async()=>{
  const t=fixture(language,voice);await t.say('begin',true);await t.say('verizon');await t.say(language==='es'?'en realidad seguro':'actually insurance');assert.equal(t.owner().values.service,'insurance');assert.equal(t.session.cargo.records,undefined);assert.equal(t.session.cargo.acceptedReasons,undefined);
  const text=language==='es'?'El costo es demasiado alto, 8185551234':'The cost is too high, 8185551234';await t.say(text);assert.deepEqual(t.session.cargo.records,[{service:'insurance',details:{reason:text,line:'8185551234'}}]);assert.deepEqual(t.session.cargo.acceptedReasons,[text]);
 });
}
console.log(`Form narrative inputs: all checks passed (${checks})`);
