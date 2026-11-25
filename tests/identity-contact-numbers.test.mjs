/** A number at the contact question that fits no identifier (owner 2026-11-25; prod 2026-11-24: 36 replies in 22 conversations
 * heard "the phone number you provided isn't valid"). Said alone, or with only filler: named an account number, the tenant's
 * account shape is said; otherwise "not a valid phone or account number". In a sentence, the reply ranker reads it, with its
 * options and a phone, email or account number extracted from the caller's words ("Compré dos camas…" was refused). No network. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {contactError} from '../dist/forms/identity-flows.js';
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;const ok=(cond,msg)=>{assert.ok(cond,msg);checks++;console.log('PASS '+msg);};
const SHAPE=[{first:'5',lengths:[7,8]}];
const lookup={id:'lookup',name:'Lookup',version:'1',primary:true,description:'Look up an account',steps:[{id:'gce',type:'FLOW',value:'get-cell-or-email',callType:'call',parameters:{retry_flow:'lookup',cancel_flow:'contact-support',account_pattern:'^5\\d{6,7}$',account_shape:SHAPE,account_name:'your account number',account_name_es:'su número de cuenta'}},{id:'done',type:'SAY',value:'FOUND {{acct_number}}{{cell_number}}{{email}}'}]};
const plain={id:'plain',name:'Plain',version:'1',primary:true,description:'Look up by phone or email',steps:[{id:'gce',type:'FLOW',value:'get-cell-or-email',callType:'call',parameters:{retry_flow:'plain',cancel_flow:'contact-support'}},{id:'done',type:'SAY',value:'FOUND {{cell_number}}{{email}}'}]};
const support={id:'contact-support',name:'ContactSupport',description:'Support closing',steps:[{id:'cs',type:'SAY',value:'Closing.',value_es:'Cierre.'}]};
// the stand-in ranker and extractor answer from these tables, never from understanding
const RANKED={'Estoy preguntando si solo tengo un saldo en la cuenta 62.':'new_request','Compré dos camas pero no me salió el recibo ni la fecha de entrega':'new_request','sure, it should be 5603 5214 I think':'choice:gives_contact','my number is like 818 555 1234 or something':'choice:gives_contact','I think it is 8 1 2 3 something':'choice:gives_contact'};
const EXTRACTED={'sure, it should be 5603 5214 I think':{account_number:'56035214'},'my number is like 818 555 1234 or something':{phone:'818 555 1234'},'I think it is 8 1 2 3 something':{phone:'8185551234'}};
const ranked=[];
function fixture(language='en'){
 let lastInput='';
 const engine=new WorkflowEngine(quiet,async(s,u,schema,r)=>{
  if(r && r.task==='rank_reply'){ranked.push(r);lastInput=r.input;return JSON.stringify({option:RANKED[r.input] || 'answers'});}
  if(String(schema || '').includes('extract_parameters'))return JSON.stringify({parameters:EXTRACTED[lastInput] || {}});
  return '{"flowName":"None"}';},[...FLOWS,lookup,plain,support],[],STANDARD_FUNCTIONS,{},false,language);engine.disableCommands();
 let s=engine.initSession('u','numbers',language);Object.assign(s.cargo,{voice:false,verb:'type',verb_es:'escriba'});
 return {get s(){return s;},async start(flow){s=await engine.updateActivity({role:'user',content:'go',start:{flow,arguments:{}}},JSON.parse(JSON.stringify(s)));return String(s.response||'');},
  async say(content){s=await engine.updateActivity({role:'user',content},JSON.parse(JSON.stringify(s)));return String(s.response||'').replace(/\s+/g,' ');}};
}
// the lines, as approved
ok(contactError('invalid_account',{account_shape:SHAPE})==="That isn't a valid account number. Account numbers start with 5 and are 7 or 8 digits long.",'account line (en)');
ok(contactError('invalid_account',{account_shape:SHAPE},true)==='Ese no es un número de cuenta válido. Los números de cuenta empiezan con 5 y tienen 7 u 8 dígitos.','account line (es)');
ok(contactError('invalid_number',{account_pattern:'^5'})==="This doesn't seem to be a valid phone or account number. Please check it and try again.",'number line (en)');
ok(contactError('invalid_number',{account_pattern:'^5'},true)==='Esto no parece ser un número de teléfono o de cuenta válido. Por favor revíselo e intente de nuevo.','number line (es)');
ok(contactError('invalid_number',{})==="This doesn't seem to be a valid phone number. Please check it and try again.",'number line, a tenant with no account number');
// prod's lone numbers
for(const [said,line] of [['86247207',/^This doesn't seem to be a valid phone or account number\. Please check it and try again\. Please type the phone or email/],
   ['34930173 Yes.',/^This doesn't seem to be a valid phone or account number\./],
   ['my account number is 34930173',/^That isn't a valid account number\. Account numbers start with 5 and are 7 or 8 digits long\. Please type the phone or email/]]){
 const t=fixture();await t.start('lookup');ranked.length=0;
 const r=await t.say(said);ok(line.test(r)&&!ranked.length,`"${said}": ${r.slice(0,90)}`);
}
{const t=fixture('es');await t.start('lookup');const r=await t.say('mi número de cuenta es 34930173');ok(/^Ese no es un número de cuenta válido\. Los números de cuenta empiezan con 5 y tienen 7 u 8 dígitos\./.test(r),`es account: ${r.slice(0,90)}`);}
{const t=fixture();await t.start('plain');const r=await t.say('my account number is 34930173');ok(/^This doesn't seem to be a valid phone number\./.test(r),`no account at this tenant: the phone line [${r.slice(0,70)}]`);}
// prod's sentences go to the reply ranker
for(const said of ['Estoy preguntando si solo tengo un saldo en la cuenta 62.','Compré dos camas pero no me salió el recibo ni la fecha de entrega']){
 const t=fixture('es');await t.start('lookup');ranked.length=0;
 const r=await t.say(said);
 ok(ranked.length===1&&!/no es válido|no parece ser/.test(r),`"${said.slice(0,40)}…": ranked, no invalid line [${r.slice(0,60)}]`);
 ok(['choice:__agent','choice:exit','choice:gives_contact','choice:no_identifier','choice:other_contact'].every(o=>ranked[0].options.includes(o)),'offered gives_contact, no_identifier, other_contact, agent, exit');
}
// a valid identifier the ranker extracts from the caller's words is the answer
{const t=fixture();await t.start('lookup');const r=await t.say('sure, it should be 5603 5214 I think');ok(/FOUND 56035214/.test(r),`extracted account [${r.slice(0,60)}]`);}
{const t=fixture();await t.start('lookup');const r=await t.say('my number is like 818 555 1234 or something');ok(/FOUND 8185551234/.test(r),`extracted phone [${r.slice(0,60)}]`);}
// an extraction the caller did not say is refused, with why
{const t=fixture();await t.start('lookup');const r=await t.say('I think it is 8 1 2 3 something');ok(/^This doesn't seem to be a valid phone or account number\./.test(r)&&!/FOUND/.test(r),`ungrounded extraction refused [${r.slice(0,70)}]`);}
console.log(`identity-contact-numbers: ${checks} checks passed`);
