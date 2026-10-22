/** FORM profile readers receive the original answer before typed spans are extracted. No network calls. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
let checks=0;
const S=(id,value)=>({id,type:'SET',variable:'noop',value});
const component=(long_name,short_name,types)=>({long_name,short_name,types});
const tools=['geocode-zip','geocode-street'].map(id=>({id,name:id,description:'Synthetic geocoder',parameters:{type:'object',properties:{components:{type:'string'},address:{type:'string'}}},implementation:{type:'local',function:id,retries:0}}));
function setup(flow,{language='en',voice=true,functions={},toolDefs=[]}={}){
 const warnings=[],ai=[];const engine=new WorkflowEngine({info(){},debug(){},error(){},warn(...args){warnings.push(args.join(' '));}},async(system,user)=>{ai.push({system,user});return /voice input cleaner/.test(system)?'90015':'{"flowName":"None"}';},linkFormSchemas([...FLOWS,flow]),toolDefs,{...STANDARD_FUNCTIONS,...functions},{},false,language);engine.disableCommands();
 let session=engine.initSession('test',crypto.randomUUID(),language);session.cargo.voice=voice;
 return {ai,warnings,get session(){return session;},say:async(content,start=false)=>{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:flow.id}}:{})},JSON.parse(JSON.stringify(session)))));return String(session.response||'');}};
}
for(const language of ['en','es'])for(const voice of [true,false]){
 const calls=[];const owner=defineForm({id:'address-owner',name:'AddressOwner',description:'Collect a complete mailing address.',contract:{summary:'Owned address input'},inputs:[{name:'address',form:'collect-geocoded-address'}],after:[S('completed','(cargo.completedAddress=cargo.forms[form_instance].values.address,true)')]});
 const t=setup(owner,{language,voice,toolDefs:tools,functions:{
  'geocode-zip':async args=>{calls.push(['zip',args]);return{status:'OK',results:[{address_components:[component('90015','90015',['postal_code']),component('Los Angeles','Los Angeles',['locality']),component('California','CA',['administrative_area_level_1']),component('United States','US',['country'])]}]};},
  'geocode-street':async args=>{calls.push(['street',args]);return{status:'OK',results:[{address_components:[component('22','22',['street_number']),component('Elm Street','Elm St',['route']),component('90015','90015',['postal_code'])],types:['street_address'],geometry:{location_type:'ROOFTOP'},partial_match:false,formatted_address:'22 Elm St, Los Angeles, CA 90015, USA'}]};}
 }});
 assert.match(await t.say('begin',true),language==='es'?/código postal/i:/zip code/i);
 const readback=await t.say('22 Elm St Apt 4B, Los Angeles CA 90015');
 const address=Object.values(t.session.cargo.forms).find(state=>state.definition==='collect-geocoded-address');
 assert.deepEqual({zip:address.values.zip,street:address.values.street,unit:address.values.unit},{zip:'90015',street:'22 Elm St',unit:'4B'},'A compound answer at the ZIP prompt retains street, unit and ZIP');
 assert.match(readback,/22 Elm Street Apt 4B, Los Angeles, CA 90015/);assert.match(readback,language==='es'?/correcta/i:/correct/i);
 assert.doesNotMatch(readback,/What is the street address|Is there an apartment|¿Cuál es la dirección\?|¿Hay un apartamento/i,'Collected address fields are not asked again');
 assert.equal(t.session.cargo.completedAddress,undefined,'The complete address still needs its own readback consent');
 assert.equal(t.ai.length,0,'The destructive AI cleaner is never called before span matching');
 assert.equal(calls.filter(([kind])=>kind==='zip').length,1);assert.equal(calls.filter(([kind])=>kind==='street').length,1);
 assert.equal(calls.find(([kind])=>kind==='street')[1].address,'22 Elm St');
 await t.say(language==='es'?'sí':'yes');assert.match(t.session.cargo.completedAddress.resolved.line,/22 Elm Street Apt 4B, Los Angeles, CA 90015/);assert.equal(t.ai.length,0);assert.deepEqual(t.warnings,[]);checks++;
}
for(const cleanup of [false,true]){
 const owner=defineForm({id:'text-owner',name:'TextOwner',description:'Collect one text answer.',contract:{summary:'Original answer policy'},inputs:[{name:'answer',profile:{kind:'text'},...(cleanup?{as_spoken:false}:{}),question:'Your answer?'}],after:[S('capture','(cargo.finalAnswer=cargo.forms[form_instance].values.answer,true)')]});
 const t=setup(owner);await t.say('begin',true);await t.say('um it is Ron');assert.equal(t.session.cargo.finalAnswer,cleanup?'90015':'um it is Ron');assert.equal(t.ai.length,cleanup?1:0,'Only an explicit FORM opt-out requests legacy voice cleanup');assert.deepEqual(t.warnings,[]);checks++;
}
console.log(`FORM original answer: all ${checks} checks passed`);
