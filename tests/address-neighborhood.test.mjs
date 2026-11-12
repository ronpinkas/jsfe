import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {zipLocation,streetLocation} from '../dist/helpers/address.js';
// Inside a city Google splits into named areas it returns no locality: a ZIP code (synthetic 90777) is a neighborhood
// (Upperdale), and an exact street match names its own neighborhood (Lowerdale). The neighborhood is the place name; the
// street's corrects the ZIP code's, as a locality does. A locality, when there is one, still wins.
const STATE={long_name:'California',short_name:'CA',types:['administrative_area_level_1','political']};
const hood=name=>({long_name:name,short_name:name,types:['neighborhood','political']});
const ZIP={'90777':{status:'OK',components:[{long_name:'90777',types:['postal_code']},hood('Upperdale'),STATE],localities:[]}};
const street={status:'OK',results:[{types:['premise','street_address'],geometry:{location_type:'ROOFTOP'},address_components:[{long_name:'12',types:['street_number']},{long_name:'Oak Road',types:['route']},hood('Lowerdale'),{long_name:'Lake County',types:['administrative_area_level_2','political']},STATE,{long_name:'90777',types:['postal_code']}]}]};
let checks=0;const check=(ok,label)=>{assert.ok(ok,label);checks++;};

check(JSON.stringify(zipLocation(ZIP['90777']))===JSON.stringify({city:'Upperdale',state:'CA',line:'Upperdale, CA',cities:[]}),'a ZIP code with a neighborhood and no locality names the neighborhood');
check(zipLocation({status:'OK',components:[{long_name:'Bigtown',types:['locality']},hood('Upperdale'),STATE]}).city==='Bigtown','a locality still wins');
check(streetLocation(street,'12 Oak Rd','90777').city==='Lowerdale','an exact street names its neighborhood');
check(streetLocation({status:'OK',results:[{...street.results[0],address_components:[...street.results[0].address_components,{long_name:'Bigtown',types:['locality']}]}]},'12 Oak Rd','90777').city==='Bigtown','a street locality still wins');

const tools=['geocode-zip','geocode-street'].map(id=>({id,name:id,description:'Synthetic geocoder',parameters:{type:'object',properties:{components:{type:'string'},address:{type:'string'}}},implementation:{type:'local',function:id,retries:0}}));
const engine=new WorkflowEngine({info(){},debug(){},error(){},warn(){}},async()=>'{"flowName":"None"}',linkFormSchemas(FLOWS),tools,{...STANDARD_FUNCTIONS,'geocode-zip':async a=>ZIP[(String((a&&a.components)||a).match(/\d{5}/)||[])[0]]||null,'geocode-street':async()=>street},{},false,'en');
engine.disableCommands();
let session;const say=async(content,start)=>{session=await engine.updateActivity({role:'user',content,...(start?{start:{flow:'collect-geocoded-address'}}:{})},session);return String(session.response||'').replace(/\s+/g,' ');};
for(const [lang,voice] of [['en',false],['es',true]]){
   session=engine.initSession('test',crypto.randomUUID(),lang);session.cargo.voice=voice;await say('start',true);
   let r=await say('90777');check(/^(Got it|Entendido), Upperdale, CA\./.test(r),`${lang}: the ZIP code's neighborhood is its city, nothing asked [${r}]`);
   await say('12 Oak Road');r=await say(lang==='es'?'ninguno':'none');
   check(/12 Oak Road, Lowerdale, CA 90777\./.test(r),`${lang}: the exact street's neighborhood corrects it in the read-back [${r}]`);
}
console.log(`Address neighborhood: all ${checks} checks passed`);
