/**
 * A form submission is judged by what the caller submitted, never by its marker (owner 2026-11-19). Prod 2026-11-19 09:13 PT,
 * myaccount web: "Busco GTA" sent from the product card fell to the reply ranker, which read only "[form submission]" and
 * ranked it irrelevant 0.78, so the question was asked again and no new search started. The reply ranker, argument
 * extraction and intent detection read the host's masked text of the submission (formSubmissionText, installed with the
 * readers); everything else still reads the marker. No network.
 */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {formSubmissionReaders} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
const MARKER='[form submission]';
const products={id:'Products',name:'Products',description:'Product search',primary:true,version:'1.0.0',variables:{response:{type:'object',value:{}},answer:{type:'string',value:''}},steps:[
 {id:'list',type:'SAY-GET',variable:'answer',value:'1. Sackboy. Ask about the shown products, or say DONE.',as_spoken:true},
 {id:'list_read',type:'DISPATCH',onResponse:'continue',responseContext:'Products were shown.',responseParameters:[{name:'asked',type:'string',description:'What the caller asks about the shown products'}],responseVariable:'response'},
 {id:'end',type:'SAY',value:'[asked {{response.asked}}]'}]};
const search={id:'Search',name:'Search',description:'Search for a product',primary:true,version:'1.0.0',parameters:[{name:'query',type:'string',description:'The product'}],steps:[{id:'s',type:'SAY',value:'[search]'}]};
function setup(rank,said){
 const calls=[];
 const callback=async(system,user,schema,request)=>{
  calls.push(structuredClone(request));
  if(request?.task==='rank_reply')return JSON.stringify({option:rank});
  if(request?.stage===1)return JSON.stringify({flowName:'Search'});
  return JSON.stringify({parameters:{}});
 };
 const engine=new WorkflowEngine(quiet,callback,[products,search],[],{...STANDARD_FUNCTIONS},{},false,'en');
 const functions=engine.APPROVED_FUNCTIONS; // what the host overrides for the turn (hy-rag-lambdas updateFormActivity)
 engine.disableCommands();engine.intentDetection='two-stage';
 let session=engine.initSession('test',crypto.randomUUID(),'en');
 const say=async(content,start)=>{session=await engine.updateActivity({role:'user',content,...(start?{start:{flow:start}}:{})},JSON.parse(JSON.stringify(session)));return session.response;};
 // the host installs the readers for the submission turn only and restores every one of them afterwards
 const submit=async()=>{const readers=formSubmissionReaders({prompt:MARKER,form:'products',values:{},...(said===undefined?{}:{said})},()=>engine.getSessionContext());const original=Object.fromEntries(Object.keys(readers).map(n=>[n,functions[n]]));Object.assign(functions,readers);try{return await say(MARKER);}finally{Object.assign(functions,original);}};
 return {calls,say,submit,functions};
}
let checks=0;async function test(name,fn){await fn();checks++;console.log('PASS '+name);}

await test('the reply ranker reads what was submitted, and a new request is detected and extracted from it',async()=>{
 const t=setup('new_request','Busco GTA');
 await t.say('products','Products');
 t.calls.length=0;
 assert.match(await t.submit(),/\[search\]/);
 const rank=t.calls.find(c=>c?.task==='rank_reply'),stage1=t.calls.find(c=>c?.stage===1),stage2=t.calls.find(c=>c?.stage===2);
 assert.equal(rank.input,'Busco GTA','the ranker reads the submitted text, not the marker');
 assert.equal(stage1.input,'Busco GTA','stage 1 reads the submitted text');
 assert.equal(stage2.input,'Busco GTA','stage 2 reads the submitted text');
 assert.equal(t.functions.formSubmissionText,undefined,'the host restored the reader after the turn');
});

await test('an answer\'s arguments are extracted from what was submitted',async()=>{
 const t=setup('answers','cuánto cuesta');
 await t.say('products','Products');
 t.calls.length=0;
 await t.submit();
 const extract=t.calls.find(c=>c?.stage===2);
 assert.equal(extract.input,'cuánto cuesta','extraction reads the submitted text');
});

await test('without the host\'s text the marker is judged, as before',async()=>{
 const t=setup('irrelevant',undefined);
 await t.say('products','Products');
 t.calls.length=0;
 await t.submit();
 assert.equal(t.calls.find(c=>c?.task==='rank_reply').input,MARKER);
});

await test('an ordinary reply is judged as typed, even with the reader installed',async()=>{
 const readers=formSubmissionReaders({prompt:MARKER,form:'products',values:{},said:'Busco GTA'},()=>({cargo:{forms:{}}}));
 assert.equal(readers.formSubmissionText('Busco GTA'),undefined,'not the marker: nothing replaces it');
 assert.equal(readers.formSubmissionText(MARKER),'Busco GTA');
 const t=setup('answers','unused');
 await t.say('products','Products');
 t.calls.length=0;
 await t.say('how much is it');
 assert.equal(t.calls.find(c=>c?.task==='rank_reply').input,'how much is it');
});
console.log(`form submission judged input: all ${checks} checks passed`);
