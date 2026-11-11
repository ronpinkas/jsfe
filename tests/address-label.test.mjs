/** The shared address form names what is being changed with the calling form's label for its input. No network calls. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
let checks=0;
const component=(long_name,short_name,types)=>({long_name,short_name,types});
const tools=['geocode-zip','geocode-street'].map(id=>({id,name:id,description:'Synthetic geocoder',parameters:{type:'object',properties:{components:{type:'string'},address:{type:'string'}}},implementation:{type:'local',function:id,retries:0}}));
const functions={
 'geocode-zip':async()=>({status:'OK',results:[{address_components:[component('90015','90015',['postal_code']),component('Los Angeles','Los Angeles',['locality']),component('California','CA',['administrative_area_level_1']),component('United States','US',['country'])]}]}),
 'geocode-street':async()=>({status:'OK',results:[{address_components:[component('22','22',['street_number']),component('Elm Street','Elm St',['route']),component('90015','90015',['postal_code'])],types:['street_address'],geometry:{location_type:'ROOFTOP'},partial_match:false,formatted_address:'22 Elm St, Los Angeles, CA 90015, USA'}]})
};
function setup(flows,startId,{language,voice,fns=functions}){
 const warnings=[];const engine=new WorkflowEngine({info(){},debug(){},error(){},warn(...args){warnings.push(args.join(' '));}},async(system,user)=>/voice input cleaner/.test(system)?String(user):'{"flowName":"None"}',linkFormSchemas([...FLOWS,...flows]),tools,{...STANDARD_FUNCTIONS,...fns},{},false,language);engine.disableCommands();
 let session=engine.initSession('test',crypto.randomUUID(),language);session.cargo.voice=voice;
 return {warnings,say:async(content,start=false)=>{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:startId}}:{})},JSON.parse(JSON.stringify(session)))));return String(session.response||'');}};
}
const owner=(id,input)=>defineForm({id,name:id.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(''),description:'Collect an address.',contract:{summary:'Owned address input'},inputs:[{name:'address',form:'collect-geocoded-address',...input}]});
const cases=[
 {name:'labelled owner',flows:[owner('delivery-owner',{label:'new delivery address',label_es:'nueva dirección de entrega'})],start:'delivery-owner',en:'new delivery address',es:'nueva dirección de entrega'},
 {name:'owner without a label',flows:[owner('plain-owner',{})],start:'plain-owner',en:'new address',es:'nueva dirección'},
 {name:'English label only',flows:[owner('en-owner',{label:'new mailing address'})],start:'en-owner',en:'new mailing address',es:'nueva dirección'},
 {name:'started alone',flows:[],start:'collect-geocoded-address',en:'new address',es:'nueva dirección'}
];
for(const c of cases)for(const language of ['en','es'])for(const voice of [true,false]){
 const label=c[language],t=setup(c.flows,c.start,{language,voice}),esc=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const zipQ=language==='es'?new RegExp(`código postal de 5 dígitos de su ${esc}\\?`):new RegExp(`zip code of your ${esc}\\?`);
 assert.match(await t.say('begin',true),zipQ,`${c.name} ${language} voice=${voice}: ZIP question`);
 const readback=await t.say('22 Elm St Apt 4B, Los Angeles CA 90015');
 assert.match(readback,language==='es'?new RegExp(`Su ${esc} es 22 Elm Street`):new RegExp(`Your ${esc} is 22 Elm Street`),`${c.name} ${language}: read-back`);
 assert.match(await t.say(language==='es'?'incorrecta':'wrong'),/Which part is wrong|Qué parte está mal/);
 assert.match(await t.say(language==='es'?'todo':'all'),zipQ,`${c.name} ${language}: ZIP question after starting over keeps the label`);
 assert.deepEqual(t.warnings,[]);checks++;
}
// Every field question names the label, asked one at a time; without one, today's wording.
const multi={...functions,'geocode-zip':async()=>({status:'OK',results:[{postcode_localities:['Commerce','Los Angeles'],address_components:[component('90015','90015',['postal_code']),component('Los Angeles','Los Angeles',['locality']),component('California','CA',['administrative_area_level_1']),component('United States','US',['country'])]}]})};
const none={...functions,'geocode-zip':async()=>null};
const Q={
 labelled:{en:{street:/Got it, Los Angeles, CA\. What is the street of your new delivery address\?$/,unit:/^Is there an apartment or unit number in your new delivery address\? Type the number, or NONE\.$/,city:/^Which city is your new delivery address in: Commerce or Los Angeles\? /,cityState:/^What city and state is your new delivery address in\?$/},
  es:{street:/Entendido, Los Angeles, CA\. ¿Cuál es la calle de su nueva dirección de entrega\?$/,unit:/^¿Hay un número de apartamento o unidad en su nueva dirección de entrega\? Escriba el número, o NINGUNO\.$/,city:/^¿En qué ciudad está su nueva dirección de entrega: Commerce o Los Angeles\? /,cityState:/^¿En qué ciudad y estado está su nueva dirección de entrega\?$/}},
 plain:{en:{street:/Got it, Los Angeles, CA\. What is the street address\?$/,unit:/^Is there an apartment or unit number\? Type the number, or NONE\.$/,city:/^Which city is it: Commerce or Los Angeles\? /,cityState:/^What city and state is that in\?$/},
  es:{street:/Entendido, Los Angeles, CA\. ¿Cuál es la dirección\?$/,unit:/^¿Hay un número de apartamento o unidad\? Escriba el número, o NINGUNO\.$/,city:/^¿Qué ciudad es: Commerce o Los Angeles\? /,cityState:/^¿En qué ciudad y estado está\?$/}}
};
for(const [kind,flows,start] of [['labelled',[owner('delivery-owner2',{label:'new delivery address',label_es:'nueva dirección de entrega'})],'delivery-owner2'],['plain',[owner('plain-owner2',{})],'plain-owner2']])for(const language of ['en','es'])for(const voice of [true,false]){
 const q=Q[kind][language];
 let t=setup(flows,start,{language,voice});await t.say('begin',true);
 assert.match(await t.say('90015'),q.street,`${kind} ${language} voice=${voice}: street`);
 assert.match(await t.say('22 Elm St'),q.unit,`${kind} ${language}: unit`);assert.deepEqual(t.warnings,[]);checks++;
 t=setup(flows,start,{language,voice,fns:multi});await t.say('begin',true);
 assert.match(await t.say('90015'),q.city,`${kind} ${language} voice=${voice}: city choice`);checks++;
 t=setup(flows,start,{language,voice,fns:none});await t.say('begin',true);
 assert.match(await t.say('90015'),q.cityState,`${kind} ${language}: city and state`);checks++;
}
console.log(`Address label: all ${checks} checks passed`);
