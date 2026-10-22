/** A pending ancestor input proposal owns consent before any nested recovery menu can act. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const S=(id,value)=>({id,type:'SET',variable:'noop',value});
const F=(id,value,parameters)=>({id,type:'FLOW',value,parameters});
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;
for(const depth of [1,2])for(const answer of ['2','no','yes']){
 const inner=defineForm({id:'inner-recovery',name:'InnerRecovery',description:'An unrelated method menu',contract:{summary:'Collect a deliberate recovery choice'},inputs:[{name:'next',profile:{kind:'choice',choices:[{key:'link',words:['2','link'],exact:true},{key:'done',words:['3','done'],exact:true}]},question:'Press2 for LINK or3 for DONE.'}],after:[S('send-link',"(cargo.links=Number(cargo.links||0)+(cargo.forms[form_instance].values.next==='link'?1:0),true)")]});
 const outer=defineForm({id:'outer-recovery',name:'OuterRecovery',description:'A recovery context owning a nested wrapper',contract:{summary:'Own a recovery wrapper'},resume_on_parent_change:true,inputs:[],before:[F('nested-menu','inner-recovery',{parent_form:'{{form_instance}}'})]});
 const amount=defineForm({id:'payment-owner',name:'PaymentOwner',description:'A synthetic confirmed payment',contract:{summary:'Collect and confirm the exact synthetic payment'},inputs:[{name:'amount',profile:{kind:'amount'},validator:'decimal-amount',question:'What amount?'}],confirm:{question:'CHARGE THIS AMOUNT?'},before:[{id:'open-recovery-once',type:'CASE',branches:{'condition: !form_internal_resume':F('open-recovery',depth===2?'outer-recovery':'inner-recovery',{parent_form:'{{form_instance}}'}),default:S('already-recovered','true')}}],after:[S('effect',"(cargo.charges=Number(cargo.charges||0)+1,true)")]});
 if(depth===1)inner.steps.find(s=>s.id==='inner-recovery_run').parameters.rf_resume_parent=true;
 const validator={id:'decimal-amount',name:'DecimalAmount',scope:'isolated',parameters:[{name:'value',type:'string'},{name:'reading',type:'object'}],steps:[S('candidate',"(function(){var raw=String(reading.raw||value),n=Number(raw)/100;cargo.inputCheck={ok:true,value:n.toFixed(2),proposal:{question:'Did you mean $'+n.toFixed(2)+'? Press1 for YES or2 for NO.',binding:{amount:n.toFixed(2),raw:raw}}};return true;})()") ]};
 const engine=new WorkflowEngine(quiet,async()=>JSON.stringify({flowName:'None',parameters:{}}),linkFormSchemas([...FLOWS,inner,outer,amount,validator]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=true;
 const say=async(content,start)=>{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'payment-owner'}}:{})},session)));return session.response||'';};
 assert.match(await say('begin',true),/Press2 for LINK/);
 const quote=await say('25820');assert.match(quote,/Did you mean \$258\.20/);assert.doesNotMatch(quote,/Press2 for LINK/);
 const id=session.cargo.formTasks['payment-owner'];assert.equal(session.cargo.forms[id].values.amount,undefined);assert.equal(session.cargo.links,undefined);assert.equal(session.cargo.charges,undefined);
 const reply=await say(answer);assert.equal(session.cargo.links,undefined,'proposal NO is never child LINK');assert.equal(session.cargo.charges,undefined,'input consent never charges');
 if(answer==='yes'){assert.match(reply,/CHARGE THIS AMOUNT/);assert.equal(session.cargo.forms[id].values.amount,'258.20');await say('yes');assert.equal(session.cargo.charges,1);assert.equal(session.cargo.links,undefined);}else{assert.match(reply,/What amount/);assert.equal(session.cargo.forms[id].values.amount,undefined);}
 checks++;
}
console.log(`Ancestor proposal conversation: all checks passed (${checks})`);
