/** Engine expression errors are printable results unless a safety step requires literal success. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,defineWorker,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const S=(id,value)=>({id,type:'SET',variable:'noop',value});
const clone=value=>JSON.parse(JSON.stringify(value));
let checks=0;
function fixture({override={},missing=false,staticQuestion=false}={}){
 const effects=[];
 const owner=defineForm({id:'owner',name:'Owner',description:'Failure fixture',contract:{summary:'Failure fixture'},parameters:[{name:'kind',type:'string'}],inputs:[{name:'kind',profile:{kind:'choice',choices:[{key:'lost',words:['lost']}]},proposal:{prepare:'prepare',...(staticQuestion?{question:'Fallback must not waive formatter output?'}:{})},after:'accepted'}],after:[S('effect','markEffect("performed")')]});
 const worker=(id,steps,parameters=[])=>defineWorker({id,name:id,description:id,contract:{role:'worker',summary:id},parameters,steps});
 const workers=[worker('prepare',missing?[S('missing','true')]:[S('describe',"(cargo.proposalCheck={question:'Confirm lost?',on_declined:'declined'},true)")]),worker('accepted',[S('accepted','markEffect("accepted")')]),worker('declined',[S('declined','markEffect("declined")')])];
 const quiet={info(){},warn(){},error(){},debug(){}};
 const engine=new WorkflowEngine(quiet,async()=>'{"flowName":"None","parameters":{}}',linkFormSchemas([...FLOWS,owner,...workers]),[],{...STANDARD_FUNCTIONS,markEffect:kind=>{effects.push(kind);return true;},...override},{},false,'en');engine.disableCommands();let session=engine.initSession('failure',crypto.randomUUID(),'en');
 return {effects,get session(){return session;},async say(content,start=false){session=await engine.updateActivity({role:'user',content,...(start?{start:{flow:'owner',arguments:{kind:'lost'}}}:{})},clone(session));return session;}};
}
for(const staticQuestion of [false,true]){
 const t=fixture({missing:true,staticQuestion});await assert.rejects(t.say('lost',true),/Required SET step vb_proposal_gate_valid/);assert.deepEqual(t.effects,[]);checks++;
}
for(const helper of ['formProposalPolicy','stageFormProposal','settleFormProposalValidation','bindFormProposal']){
 const t=fixture({override:{[helper]:()=>{throw new Error('injected contract failure');}}});await assert.rejects(t.say('lost',true),/Required SET step/);assert.deepEqual(t.effects,[]);checks++;
}
{
 let fail=false;const t=fixture({override:{commitFormProposals:(...args)=>{if(fail)throw new Error('stale approval');return STANDARD_FUNCTIONS.commitFormProposals(...args);}}});await t.say('lost',true);fail=true;await assert.rejects(t.say('yes'),/Required SET step ca_proposal_commit/);assert.deepEqual(t.effects,[]);checks++;
}
for(const decision of ['yes','no']){
 const t=fixture({override:{decideFormProposal:()=>false}});await t.say('lost',true);await assert.rejects(t.say(decision),/Required SET step proposal_(?:confirmed|decline_decision)/);assert.deepEqual(t.effects,[]);checks++;
}
console.log(`Proposal failure enforcement: all ${checks} checks passed`);
