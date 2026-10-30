import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
// The ZIP lookup can name one city for a ZIP code whose streets carry another (synthetic 90999: the lookup says Northvale,
// the street is in Southvale). An exact street match corrects a city read from the ZIP code alone, never one the caller
// chose; and the caller may override the city read back in their own words ('es Southvale'), which asks the city again.
const comp=(city,extra=[])=>[...extra,{long_name:city,short_name:city,types:['locality','political']},{long_name:'California',short_name:'CA',types:['administrative_area_level_1']}];
const ZIP={'90999':{status:'OK',components:comp('Northvale'),localities:[]},'90888':{status:'OK',components:comp('Eastvale'),localities:['Eastvale','Westvale']}};
const exact=(n,route,city,zip)=>({status:'OK',results:[{types:['street_address'],geometry:{location_type:'ROOFTOP'},address_components:comp(city,[{long_name:n,types:['street_number']},{long_name:route,types:['route']},{long_name:zip,types:['postal_code']}])}]});
let streetReply=null,option='answers';const ranked=[];
const tools=['geocode-zip','geocode-street'].map(id=>({id,name:id,description:'Synthetic geocoder',parameters:{type:'object',properties:{components:{type:'string'},address:{type:'string'}}},implementation:{type:'local',function:id,retries:0}}));
const ai=async(system,user,schema,r)=>{if(r?.task==='rank_reply'){ranked.push(r.options);return JSON.stringify({option});}return '{"flowName":"None"}';};
const engine=new WorkflowEngine({info(){},debug(){},error(){},warn(){}},ai,linkFormSchemas(FLOWS),tools,{...STANDARD_FUNCTIONS,'geocode-zip':async(a)=>ZIP[(String((a&&a.components)||a).match(/\d{5}/)||[])[0]]||null,'geocode-street':async()=>streetReply},{},false,'en');engine.disableCommands();
let session,checks=0;const say=async(content,start)=>{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'collect-geocoded-address'}}:{})},JSON.parse(JSON.stringify(session)))));return String(session.response||'').replace(/\s+/g,' ');};
const begin=async(language,voice)=>{session=engine.initSession('test',crypto.randomUUID(),language);session.cargo.voice=voice;streetReply=null;option='answers';ranked.length=0;await say('start',true);};
const check=(ok,label)=>{assert.ok(ok,label);checks++;};

for(const [lang,voice] of [['es',true],['en',false]]){
   const es=lang==='es',tag=lang+(voice?' call':' text');
   // the street's exact match corrects the ZIP code's city
   await begin(lang,voice);
   let r=await say('90999');check(/(Entendido|Got it), Northvale, CA\./.test(r),`${tag}: the ZIP lookup's city [${r}]`);
   streetReply=exact('171','East Elm Street','Southvale','90999');
   await say('171 E Elm Street');r=await say(es?'ninguno':'none');
   check(/171 East Elm Street, Southvale, CA 90999\./.test(r),`${tag}: an exact street match corrects it [${r}]`);
   // the caller overrides the city read back
   await begin(lang,voice);
   await say('90999');await say('171 E Elm Street');r=await say(es?'ninguno':'none');
   check(/171 E Elm Street, Northvale, CA 90999\./.test(r),`${tag}: an unverified street keeps the ZIP code's city [${r}]`);
   option='choice:field:city';
   r=await say(es?'es Southvale':"it's Southvale");
   check(ranked.at(-1).includes('choice:field:city')&&ranked.at(-1).includes('choice:field:street')&&ranked.at(-1).includes('choice:field:zip'),`${tag}: the fields read back are offered [${JSON.stringify(ranked.at(-1))}]`);
   check(r===(es?'¿Qué ciudad es?':'What city is it?'),`${tag}: the city is asked again [${r}]`);
   option='answers';
   r=await say('Southvale');check(/171 E Elm Street, Southvale, CA 90999\./.test(r),`${tag}: the caller's city is read back [${r}]`);
   await say(es?'sí':'yes');check(session.cargo.address?.city==='Southvale, CA',`${tag}: stored [${JSON.stringify(session.cargo.address)}]`);
   // a city the caller chose is never replaced by the street's
   await begin(lang,voice);
   await say('90888');await say('Westvale');streetReply=exact('10','Main Street','Eastvale','90888');
   await say('10 Main Street');r=await say(es?'ninguno':'none');
   check(/10 Main Street, Westvale, CA 90888\./.test(r),`${tag}: the caller's chosen city stands [${r}]`);
   // a request to repeat is not a correction
   option='answers';r=await say(es?'Puede repetir la dirección, por favor?':'Can you repeat the address, please?');
   check(/10 Main Street, Westvale, CA 90888\./.test(r),`${tag}: asked again, nothing reset [${r}]`);
}
console.log(`Address city override: all ${checks} checks passed`);
