// A card re-sends every field it shows: a field sent back unchanged is not an answer (no acknowledgement, no re-check);
// a changed one is a correction; a submission that changes nothing keeps its readings.
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS, projectForm, parseFormSubmission, formSubmissionReaders} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';

const root={declarationVersion:2,id:'demo',primary:true,description:'Demo',form:{inputs:[
  {name:'email',field:'email'},
  {name:'service',profile:{kind:'choice',choices:[{key:'a',label:'First',phrases:['first']},{key:'b',label:'Second',phrases:['second']}]},question:'Which service?'},
  {name:'note',profile:{kind:'text'},question:'Note?'}
],confirm:{question:'Confirm?',confirmation:'firm'},after:[{id:'effect',type:'SET',variable:'noop',value:'(cargo.completed=Number(cargo.completed || 0)+1,true)'}]}};
const quiet={info(){},warn(){},debug(){},error(){}};
let checks=0;const check=(x,m)=>{assert(x,m);checks++;};
async function journey(){
  const engine=new WorkflowEngine(quiet,async()=>'{"option":"new_request","flowName":"None"}',[...FLOWS,root],[],STANDARD_FUNCTIONS,{},false,'en');
  engine.disableCommands();
  let session=engine.initSession('test','forms','en');session.cargo.voice=false;
  const say=async(content,start)=>{const old={readFormAnswer:engine.APPROVED_FUNCTIONS.readFormAnswer,enrichFormMatches:engine.APPROVED_FUNCTIONS.enrichFormMatches};
    const submission=parseFormSubmission(content,projectForm(session));
    if(submission)Object.assign(engine.APPROVED_FUNCTIONS,formSubmissionReaders({...submission,prompt:content},()=>engine.getSessionContext()));
    try{session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start:{flow:'demo'}}:{})},JSON.parse(JSON.stringify(engine.storedSession(session))))));}
    finally{Object.assign(engine.APPROVED_FUNCTIONS,old);}
    return session.response||'';};
  const encode=values=>'JSFE_FORM_V1:'+JSON.stringify({form:projectForm(session).form,values});
  await say('begin',true);
  const form=projectForm(session).form;
  return {say,encode,state:()=>session.cargo.forms[form]};
}

{ const j=await journey();
  let r=await j.say(j.encode({service:'a'}));
  check(j.state().values.service==='a'&&/Got it, your service/.test(r),'an out-of-order field is taken and acknowledged');
  r=await j.say(j.encode({email:'owner@example.com',service:'a'}));
  check(j.state().values.email==='owner@example.com','the asked field is taken');
  check(!/already have your service/i.test(r)&&!/service/i.test(r.split(/Note\?/)[0]),'the field sent back unchanged is not acknowledged: '+r);
  check(j.state().values.service==='a','and keeps its value');
}
{ const j=await journey();
  await j.say(j.encode({service:'a'}));
  const r=await j.say(j.encode({email:'owner@example.com',service:'b'}));
  check(j.state().values.service==='b'&&/noted your service/i.test(r),'a changed field is a correction, acknowledged: '+r);
}
{ const j=await journey();
  await j.say(j.encode({service:'a'}));
  const r=await j.say(j.encode({service:'a'}));
  check(/already have your service/i.test(r),'a submission that changes nothing keeps its readings (never an empty turn): '+r);
}
console.log(`form-client-unchanged: ${checks} checks passed`);
