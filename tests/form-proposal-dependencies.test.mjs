/** Synthetic real-engine controller proposal dependency tests; semantic callback is a fixture oracle. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const S=(id,value)=>({id,type:'SET',variable:'noop',value});
const meaning={purpose:'Collect details for the confirmed request kind.',acceptance:'A concrete description for the selected kind.'};
const quiet={info(){},warn(){},error(){},debug(){}};
let checks=0;
for(const placement of ['direct','ancestor','group'])for(const answer of ['yes','no']){
 const nested=placement==='ancestor',grouped=placement==='group';
 const detail={name:'detail',profile:{kind:'text'},meaning,prepare:'prepare-detail',question_from:'detail_question',question:'DETAIL?',...(!nested?{depends_on:[grouped?'kind_group':'kind'],reset_on:['kind']}: {})};
 const child=defineForm({id:'detail-child',name:'DetailChild',description:'Synthetic child',contract:{summary:'Synthetic child'},parameters:[{name:'detail',type:'string'}],inputs:[detail]});
 const controller={name:'kind',profile:{kind:'choice',choices:[{key:'old',words:['old']},{key:'new',words:['new']}]},proposal:{question:'CONFIRM NEW?'},question:'KIND?'};
 const root=defineForm({id:'request-owner',name:'RequestOwner',description:'Synthetic request',contract:{summary:'Synthetic request'},parameters:[{name:'kind',type:'string'},{name:'detail',type:'string'},{name:'zip',type:'string'},{name:'child',type:'object'},{name:'new_detail',type:'string'}],
 before:[S('initial_old',"(cargo.seeded || (cargo.forms[form_instance].values.kind='old',cargo.seeded=true),true)")],
 inputs:[...(grouped?[{name:'kind_group',exclusive:true,any_of:[controller],question:'KIND?'}]:[controller]),nested?{name:'child',form:'detail-child',depends_on:['kind'],reset_on:['kind']}:detail,...(!nested?[{...detail,name:'new_detail',when:{kind:'new'}}]:[]),{name:'zip',field:'zip'}],
 after:[S('done',"(cargo.done=structuredClone(cargo.forms[form_instance].values),true)")]});
 const prep={id:'prepare-detail',name:'PrepareDetail',description:'Synthetic contextual prompt',scope:'isolated',parameters:[{name:'form',type:'string'}],steps:[S('prompt',"(function(){var state=cargo.forms[form],owner=state.parent?cargo.forms[state.parent]:state;state.data.detail_question='DETAIL FOR '+owner.values.kind;return true;})()") ]};
 const assessed=[],errors=[];
 const engine=new WorkflowEngine({...quiet,error(...args){errors.push(args.join(' '));}},async(_s,_u,_schema,r)=>{if(r?.task==='assess_input'){assessed.push(r);return JSON.stringify({ok:true,disposition:'accept'});}return JSON.stringify({flowName:'None',parameters:{}});},linkFormSchemas([...FLOWS,child,root,prep]),[],STANDARD_FUNCTIONS,{});engine.disableCommands();errors.length=0;
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 const say=async(content,start)=>{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'request-owner',arguments:start===true?{}:start}}:{})},session)));return session.response||'';};
 assert.match(await say('begin',true),/DETAIL FOR old/);
 const seed={kind:'new',zip:'90001',...(nested?{child:{detail:'New request details.'}}:{detail:'New request details.',new_detail:'New-only request details.'})};
 session.flowStacks=[];const proposal=await say('new request and details',seed);assert.match(proposal,/CONFIRM NEW/);assert.equal(assessed.length,0,'never assess new task seed against old context');
 const id=session.cargo.formTasks['request-owner'];assert.equal(session.cargo.forms[id].values.kind,'old');assert.equal(session.cargo.forms[id].values.zip,'90001','independent seed is accepted');
 const reply=await say(answer);
 if(answer==='yes'){assert.equal(assessed.length,nested?1:2);assert.ok(assessed.every(r=>r.question==='DETAIL FOR new'));if(!nested)assert.equal(session.cargo.done.new_detail,'New-only request details.');assert.equal(assessed[0].question,'DETAIL FOR new');assert.equal(assessed[0].input,'New request details.');assert.equal(session.cargo.done.kind,'new');assert.equal(nested?session.cargo.done.child.detail:session.cargo.done.detail,'New request details.');}
 else{assert.equal(assessed.length,0,'declined seed never reinterpreted as old request');assert.equal(session.cargo.done,undefined);assert.match(reply,/DETAIL FOR old|KIND/);const all=Object.values(session.cargo.forms);assert.ok(all.every(s=>!Object.values(s.pending||{}).some(h=>h.value==='New request details.')));}
 assert.deepEqual(errors,[]);checks++;console.log('PASS '+placement+' dependency proposal '+answer);
}
console.log('Proposal dependencies: all checks passed ('+checks+')');
