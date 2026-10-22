/** Nested context correction must abandon stale worker tails and ask fresh owner confirmation. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {formFlow,FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
let checks=0;const test=async(name,run)=>{await run();checks++;console.log('PASS '+name);};
const S=(id,value)=>({id,type:'SET',variable:'noop',value});
const F=(id,value,parameters)=>({id,type:'FLOW',value,callType:'call',parameters});
function fixture(language,voice,opted=true){
 const warnings=[];const root=formFlow({id:'owner',name:'Owner',inputs:[{name:'property',profile:{kind:'choice',choices:[{key:'email',words:['email','correo']},{key:'phone',words:['phone','teléfono']}]},question:'Which contact?',question_es:'¿Qué contacto?'}],confirm:{question:'CONFIRM {{cargo.forms[form_instance].values.property}}? YES or NO.',question_es:'CONFIRME {{cargo.forms[form_instance].values.property}}. SÍ o NO.'},after:[F('context','outer',{parent_form:'{{form_instance}}'}),S('owner_tail','(cargo.ownerTail=Number(cargo.ownerTail||0)+1,true)')]});
 const outer=formFlow({id:'outer',name:'Outer',resume_on_parent_change:opted,before:[F('bridge_context','bridge',{form:'{{form_instance}}'})],inputs:[{name:'collected',profile:{kind:'text'},question:'Unexpected missing value',question_es:'Valor inesperado'}],after:[S('outer_tail','(cargo.outerTail=Number(cargo.outerTail||0)+1,true)')]});
 const bridge={id:'bridge',name:'Bridge',version:'1',parameters:[{name:'form',type:'string'}],steps:[F('inner','wrapper',{parent_form:'{{form}}'}),S('bridge_tail','(cargo.bridgeTail=Number(cargo.bridgeTail||0)+1,true)')]};
 const wrapper=formFlow({id:'wrapper',name:'Wrapper',before:[S('profile',"(cargo.forms[form_instance].specs[0].profile={kind:cargo.forms[cargo.forms[parent_form].parent].values.property==='phone'?'phone':'email'},true)")],inputs:[{name:'entry',profile:{kind:'email'},question:'New contact value?',question_es:'¿Nuevo contacto?'}],after:[S('handoff',"(acceptFormReadings(cargo,[{form:parent_form,name:'collected',value:cargo.forms[form_instance].values.entry,ok:true}]),cargo.wrapperTail=Number(cargo.wrapperTail||0)+1,true)")]});
 let lastInput='';
 const engine=new WorkflowEngine({debug(){},info(){},warn(...args){warnings.push(args.join(' '));},error(...args){warnings.push(args.join(' '));}},async()=>lastInput,linkFormSchemas([...FLOWS,root,outer,bridge,wrapper]),[],STANDARD_FUNCTIONS,{},false,language);engine.disableCommands();
 let session=engine.initSession('fixture',crypto.randomUUID(),language);session.cargo.voice=voice;
 return {warnings,get session(){return session;},async say(content,start){lastInput=content;session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'owner'}}:{})},session)));return String(session.response||'');}};
}
for(const language of ['en','es'])for(const voice of [false,true])await test(`${language} ${voice?'voice':'text'} root correction escapes an unflagged inner collector and requires fresh consent`,async()=>{
 const t=fixture(language,voice);await t.say('begin',true);await t.say('email');const owner=t.session.cargo.formTasks.owner;await t.say(language==='es'?'sí':'yes');
 const outer=Object.values(t.session.cargo.forms).find(f=>f.definition==='outer'),inner=Object.values(t.session.cargo.forms).find(f=>f.definition==='wrapper');assert.ok(outer&&inner);assert.equal(inner.resume_on_parent_change,false);
 // Independent owner progress and an audit record may not be replaced by an old worker snapshot.
 t.session.cargo.forms[owner].data.independent='preserved';t.session.cargo.audit={key:'newest',status:'unknown'};
 const r=await t.say(language==='es'?'teléfono':'phone');assert.match(r,/CONFIRM(?:E)? phone/);assert.equal(t.session.cargo.formTasks.owner,owner);assert.equal(t.session.cargo.forms[owner].values.property,'phone');assert.equal(t.session.cargo.forms[owner].data.independent,'preserved');assert.deepEqual(t.session.cargo.audit,{key:'newest',status:'unknown'});
 assert.equal(t.session.cargo.forms[outer.id],undefined);assert.equal(t.session.cargo.forms[inner.id],undefined);for(const key of ['wrapperTail','bridgeTail','outerTail','ownerTail'])assert.equal(t.session.cargo[key],undefined,'No stale '+key+' may execute');
 await t.say(language==='es'?'sí':'yes');const fresh=Object.values(t.session.cargo.forms).find(f=>f.definition==='wrapper');assert.ok(fresh);assert.notEqual(fresh.id,inner.id);assert.equal(fresh.specs[0].profile.kind,'phone');assert.equal(t.session.cargo.ownerTail,undefined);
 await t.say('8185551234');for(const key of ['wrapperTail','bridgeTail','outerTail','ownerTail'])assert.equal(t.session.cargo[key],1,'Only the newly confirmed branch may execute '+key);assert.equal(t.session.flowStacks.flat().length,0);assert.equal(t.warnings.length,0);
});
await test('unopted contexts keep existing collection behavior rather than acquiring implicit owner reboot',async()=>{
 const t=fixture('en',false,false);await t.say('begin',true);await t.say('email');await t.say('yes');const wrapper=Object.values(t.session.cargo.forms).find(f=>f.definition==='wrapper');const r=await t.say('phone');assert.doesNotMatch(r,/CONFIRM phone/);assert.equal(t.session.cargo.forms[wrapper.id].specs[0].profile.kind,'email');assert.equal(t.session.cargo.ownerTail,undefined);
});
console.log(`Nested ancestor resume: all checks passed (${checks})`);
