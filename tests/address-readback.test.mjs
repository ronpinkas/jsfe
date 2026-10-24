import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const warnings=[];const tools=['geocode-zip','geocode-street'].map(id=>({id,name:id,description:'Synthetic geocoder',parameters:{type:'object',properties:{components:{type:'string'},address:{type:'string'}}},implementation:{type:'local',function:id,retries:0}}));
const engine=new WorkflowEngine({info(){},debug(){},error(){},warn:m=>warnings.push(String(m))},async()=>'{"flowName":"None"}',linkFormSchemas(FLOWS),tools,{...STANDARD_FUNCTIONS,'geocode-zip':async()=>null,'geocode-street':async()=>null},{},false,'en');engine.disableCommands();
let session;const say=async(content,start)=>{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'collect-geocoded-address'}}:{})},JSON.parse(JSON.stringify(session)))));return String(session.response||'');};
let checks=0;
for(const [language,phrases] of [['en',['not right','not correct','incorrect','wrong']],['es',['no es correcto','no es correcta','incorrecta']]])for(const phrase of phrases){
 session=engine.initSession('test',crypto.randomUUID(),language);session.cargo.voice=false;
 await say('start',true);await say('90001');await say('Los Angeles CA');await say('100 Main Street');const readback=await say('NONE');assert.match(readback,/100 Main/);
 let reply=await say(phrase);assert.match(reply,/Which part is wrong|Qué parte está mal/);reply=await say(language==='es'?'todo':'all');assert.match(reply,/5-digit zip|postal de 5/);assert.equal(session.cargo.address,undefined);assert.equal(Object.values(session.cargo.forms).some(s=>s.values.street==='100 Main Street'),false);checks++;
}
assert.deepEqual(warnings,[]);checks++;console.log(`Address readback: all ${checks} checks passed`);
