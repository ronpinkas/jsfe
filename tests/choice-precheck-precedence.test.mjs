/** A declared safety precheck must win over generic amount recognition on both prompt paths. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
for(const retry of [false,true]){
 const precheck={id:'precheck',name:'Precheck',parameters:[{name:'answer',type:'string'}],variables:{answer_key:{type:'string',value:''}},steps:[{id:'block',type:'SET',variable:'answer_key',value:"String(answer).includes('$') ? 'handoff' : ''"}]};
 const owner={id:'owner',name:'Owner',steps:[{id:'ask',type:'FLOW',value:'ask-choice',callType:'call',parameters:{question:'Amount?',choices:[],amount:true,answer_precheck:'precheck'}},{id:'record',type:'SET',variable:'noop',value:'(cargo.result=cargo.choice,true)'}]};
 const engine=new WorkflowEngine(quiet,null,linkFormSchemas([...FLOWS,precheck,owner]),[],STANDARD_FUNCTIONS,{});engine.disableCommands();
 let session=engine.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 const say=async(content,start=false)=>{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'owner'}}:{})},session)));};
 await say('begin',true);if(retry){await say('');assert.equal(session.cargo.result,undefined);}
 await say('$50');assert.equal(session.cargo.result,'handoff');console.log('PASS precheck precedes amount recognition '+(retry?'after retry':'on first answer'));
}
