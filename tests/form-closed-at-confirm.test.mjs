/** A change read at a child form's confirmation that changes its OWNER's input closes the child (invalidateFormInputs);
 * the child's flow returns to the owner, which continues with the new value — it never re-enters the closed instance
 * (owner 2026-11-11; prod 2026-10-24: another service named at a cancel-all confirmation re-entered cancel-api-task by its old
 * instance id and the caller read "[error: 'cancel '+item.name]"). */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {formFlow,FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
let checks=0;const test=async(name,run)=>{await run();checks++;console.log('PASS '+name);};
const S=(id,value)=>({id,type:'SET',variable:'noop',value});
function fixture(language){
 const warnings=[];
 const owner=formFlow({id:'owner',name:'Owner',inputs:[
   {name:'service',profile:{kind:'choice',choices:[{key:'monitor',words:['monitor']},{key:'club',words:['club']}]},question:'Which service?',question_es:'¿Qué servicio?'},
   {name:'task',form:'child',when:{service:'monitor'},depends_on:['service'],question:'unused',question_es:'unused'}],
  after:[S('owner_tail',"(cargo.ownerDone=cargo.forms[form_instance].values.service,true)")]});
 const child=formFlow({id:'child',name:'Child',inputs:[{name:'reason',profile:{kind:'choice',choices:[{key:'price',words:['price','precio']}]},question:'Why?',question_es:'¿Por qué?'}],
  confirm:{question:'Cancel monitor?',question_es:'¿Cancelar monitor?'},after:[S('child_tail','(cargo.childDone=true,true)')]});
 const engine=new WorkflowEngine({debug(){},info(){},warn(...a){warnings.push(a.join(' '));},error(...a){warnings.push(a.join(' '));}},async()=>'{"flowName":"None","parameters":{}}',linkFormSchemas([...FLOWS,owner,child]),[],STANDARD_FUNCTIONS,{},false,language);engine.disableCommands();
 let session=engine.initSession('fixture',crypto.randomUUID(),language);
 return {warnings,get session(){return session;},async say(content,start){session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'owner'}}:{})},session)));return String(session.response||'');}};
}
for(const language of ['en','es'])await test(`${language}: the owner's input changed at the child's confirmation — the owner continues, nothing fails`,async()=>{
 const t=fixture(language);
 assert.match(await t.say('begin',true),language==='es'?/Qué servicio/:/Which service/);
 assert.match(await t.say('monitor'),language==='es'?/Por qué/:/Why/);
 assert.match(await t.say(language==='es'?'precio':'price'),language==='es'?/Cancelar monitor/:/Cancel monitor/);
 const childId=Object.values(t.session.cargo.forms).find(f=>f.definition==='child').id;
 await t.say('club');
 assert.equal(t.session.cargo.forms[childId],undefined,'the change closed the child');
 assert.equal(t.session.cargo.ownerDone,'club','the owner finished with the new value');
 assert.equal(t.session.cargo.childDone,undefined,"the closed child's action never ran");
 assert.equal(t.session.flowStacks.flat().length,0);
 assert.deepEqual(t.warnings.filter(w=>/expression evaluation failed|evaluation error/i.test(w)),[],'no expression failed');
});
console.log(`Form closed at its confirmation: all ${checks} checks passed`);
