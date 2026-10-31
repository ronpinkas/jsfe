/** A verification that runs out of attempts ends cleanly (owner 2026-10-30, prod voice call of 10-30: the give-up asked
 * "Would you like to try again…?", the next turn did not answer it, and the payment was lost). verification-failed says
 * the task it was for and that the caller can try again once the code can reach them, leaves no flow and no question open,
 * clears the code and reports unresolved / verification_failed. Synthetic caller and codes. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
const sha=v=>createHash('sha256').update(v).digest('hex');
const probe={id:'otp-probe',name:'OtpProbe',version:'1',description:'Ask for the code through the actual collector and validator.',steps:[{id:'ask',type:'FLOW',value:'get-and-validate-otp-code',callType:'call'},{id:'done',type:'SAY',value:'TEST verified',value_es:'TEST verificado'}]};
const linkWorker={id:'test-link',name:'TestLink',version:'1',description:'A tenant failed_flow.',steps:[{id:'note',type:'SAY',value:'TEST just in case, a link.',value_es:'TEST por si acaso, un enlace.'}]};
const resend={id:'resend-otp-code',name:'ResendOtpCode',version:'1',description:'Count resends.',steps:[{id:'record',type:'SET',variable:'noop',value:'(cargo.testResends=Number(cargo.testResends||0)+1,true)'}]};
const tool=(id,properties)=>({id,name:id,description:'Synthetic '+id,parameters:{type:'object',properties},implementation:{type:'local',function:id,retries:0}});
const tools=[tool('validate-otp',{otp:{type:'string'},container:{type:'object'}})];
const functions={...STANDARD_FUNCTIONS,'validate-otp':async({otp,container})=>STANDARD_FUNCTIONS.validateOTP(otp,container)};
const ai=async(system,user,schema,r)=>r?.task==='rank_reply'?JSON.stringify({option:'answers'}):'{"flowName":"None"}';
const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,probe,resend,linkWorker]),tools,functions,{},false,'en');engine.disableCommands();
let s,checks=0;
const ok=(cond,msg)=>{assert.ok(cond,msg);checks++;};
const say=async content=>{s=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content},JSON.parse(JSON.stringify(s)))));return String(s.response||'').replace(/\s+/g,' ');};
async function begin(language,voice,task){
   s=engine.initSession('u','verification-failed-'+Math.random(),language);
   Object.assign(s.cargo,{voice,verb:voice?'say':'type',verb_es:voice?'diga':'escriba',authOptions:{parent_form:'',...task},authCancelFlow:'contact-support',otpVerified:false,otp_cell_number:'8185550000',otp_email:'',otpSentOn:'sms',otpHash:sha('111111'),otpTimestamp:Date.now(),otpAltEmail:'',otpAltSent:false});
   s=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content:'start',start:{flow:'otp-probe',arguments:{}}},s)));
}
const TASK={task:'make your payment',task_es:'hacer su pago'};
const WANT={en:v=>`I wasn't able to verify your account, so I can't make your payment right now. Whenever you have access to receive the code for this account, we can try again. To reach a person, ${v?'say':'type'} AGENT.`,
   es:v=>`No pude verificar su cuenta, así que no puedo hacer su pago en este momento. Cuando pueda recibir el código para esta cuenta, podemos intentarlo de nuevo. Para hablar con una persona, ${v?'diga':'escriba'} AGENTE.`};
const open=()=>(s.flowStacks||[]).some(stack=>stack.length);
for(const lang of ['en','es'])for(const voice of [false,true]){
   const tag=`${lang} ${voice?'call':'text'}`;
   // three codes that do not match
   await begin(lang,voice,TASK);
   let r='';for(let i=0;i<3;i++)r=await say('999999');
   ok(r.endsWith(WANT[lang](voice)),`${tag}: three mismatches end with the closing [${r}]`);
   ok(!/try again to get access|intentar nuevamente obtener acceso|press 1|presione 1/i.test(r),`${tag}: no retry question is left open`);
   ok(!open(),`${tag}: no flow is left on the stack`);
   ok(s.cargo.otpHash===null&&s.cargo.otpVerified!==true,`${tag}: the code is cleared`);
   ok(s.cargo.verificationFailed===true,`${tag}: the failure is reported in cargo.verificationFailed`);
   r=await say('111111');
   ok(s.cargo.otpVerified!==true&&!/TEST verified|TEST verificado/.test(r),`${tag}: a late code after the end verifies nothing [${r}]`);
   // three answers that are not a six-digit code
   await begin(lang,voice,TASK);
   r='';for(let i=0;i<3;i++)r=await say('12345');
   ok(r.endsWith(WANT[lang](voice))&&!open(),`${tag}: three malformed codes end with the closing [${r}]`);
}
// a tenant failed_flow runs after the closing's first sentences and before the agent sentence (owner 2026-10-30: the payment
// link "Just in case")
for(const lang of ['en','es']){
   await begin(lang,true,{...TASK,failed_flow:'test-link'});
   let r='';for(let i=0;i<3;i++)r=await say('999999');
   const [head,agent]=lang==='es'?[WANT.es(true).replace(/ Para hablar.*$/,''),'Para hablar con una persona, diga AGENTE.']:[WANT.en(true).replace(/ To reach.*$/,''),'To reach a person, say AGENT.'];
   ok(r.endsWith(`${head} ${lang==='es'?'TEST por si acaso, un enlace.':'TEST just in case, a link.'} ${agent}`),`${lang}: failed_flow between the closing and the agent sentence [${r}]`);
   ok(!open(),`${lang}: failed_flow leaves no flow open`);
}
// no task given (a tenant that passes none): the closing still reads
await begin('en',false,{});
let r='';for(let i=0;i<3;i++)r=await say('999999');
ok(/^.*I wasn't able to verify your account, so I can't continue right now\. Whenever you have access to receive the code for this account, we can try again\./.test(r),`no task: generic closing [${r}]`);
console.log(`Verification failed: ${checks} checks passed`);
