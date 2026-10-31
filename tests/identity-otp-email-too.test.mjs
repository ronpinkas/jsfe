/** A caller who cannot find the texted code, or asks for another way, gets a second code at the account's email without a
 * question (owner 2026-10-30, prod voice call of 10-30: seven "I can't find it" and two "another way" each heard "I sent it
 * by text message" again). The texted code stays valid beside the emailed one; one email per challenge; with no email on
 * file, or a refused address, the caller hears where the code went (and, for another way, how to reach a person).
 * Synthetic caller and codes. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
const sha=v=>createHash('sha256').update(v).digest('hex');
const variable=value=>({type:typeof value,value});
const probe={id:'otp-probe',name:'OtpProbe',version:'1',description:'Ask for the code through the actual collector and validator.',steps:[{id:'ask',type:'FLOW',value:'get-and-validate-otp-code',callType:'call'},{id:'done',type:'SAY',value:'TEST verified'}]};
const resend={id:'resend-otp-code',name:'ResendOtpCode',version:'1',description:'Count resends.',steps:[{id:'record',type:'SET',variable:'noop',value:'(cargo.testResends=Number(cargo.testResends||0)+1,true)'}]};
const tool=(id,properties)=>({id,name:id,description:'Synthetic '+id,parameters:{type:'object',properties},implementation:{type:'local',function:id,retries:0}});
const tools=[tool('send-email-otp',{to:{type:'string'},container:{type:'object'},language:{type:'string'},additional:{type:'boolean'}}),tool('validate-otp',{otp:{type:'string'},container:{type:'object'}})];
let emails=[],refuse=false,checks=0;
const functions={...STANDARD_FUNCTIONS,
   'send-email-otp':async({to,container,additional})=>{emails.push({to,additional});if(refuse)throw new Error('Failed to generate OTP: address refused');const h=sha('222222');if(additional){container.otpAltHash=h;container.otpAltTimestamp=Date.now();}return h;},
   'validate-otp':async({otp,container})=>STANDARD_FUNCTIONS.validateOTP(otp,container)};
const ai=async(system,user,schema,r)=>r?.task==='rank_reply'?JSON.stringify({option:'answers'}):'{"flowName":"None"}';
const engine=new WorkflowEngine(quiet,ai,linkFormSchemas([...FLOWS,probe,resend]),tools,functions,{},false,'en');engine.disableCommands();
let s;
const say=async content=>{s=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content},JSON.parse(JSON.stringify(s)))));return String(s.response||'').replace(/\s+/g,' ');};
async function begin(language,voice,altEmail='robin@example.com'){
   emails=[];refuse=false;
   s=engine.initSession('u','otp-email-too-'+Math.random(),language);
   Object.assign(s.cargo,{voice,verb:voice?'say':'type',verb_es:voice?'diga':'escriba',authOptions:{parent_form:''},authCancelFlow:'contact-support',otpVerified:false,otp_cell_number:'8185550000',otp_email:'',otpSentOn:'sms',otpHash:sha('111111'),otpTimestamp:Date.now(),otpAltEmail:altEmail,otpAltSent:false});
   s=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content:'start',start:{flow:'otp-probe',arguments:{}}},s)));
   return String(s.response||'');
}
const ok=(cond,msg)=>{assert.ok(cond,msg);checks++;};
const W={en:{text:'Okay, I also sent a code to your email ro***@example.com.',voice:'Okay, I also sent a code to your email starting with r, o, at example.com.',also:/the 6-digit verification code you received at cell ending with (0000|0, 0, 0, 0) or at your email (ro\*\*\*@example\.com|starting with r, o, at example\.com)\./,where:/^I sent it by text message to the cell ending with (0000|0, 0, 0, 0), and I also sent a code to your email/},
   es:{text:'Muy bien, también le envié un código a su correo ro***@example.com.',voice:'Muy bien, también le envié un código a su correo que empieza con r, o, arroba example.com.',also:/el código de verificación de 6 dígitos que recibió en celular que termina con (0000|0, 0, 0, 0) o en su correo (ro\*\*\*@example\.com|que empieza con r, o, arroba example\.com)\./,where:/^Se lo envié por mensaje de texto al celular que termina con (0000|0, 0, 0, 0), y también le envié un código a su correo/}};
const SAID={en:["I can't find it.","Let's try another way.","Don't have it.","I'm sorry, there's no code."],es:['No lo encuentro.','¿Hay otra forma?','No me llegó.','No lo tengo.']};
for(const lang of ['en','es'])for(const voice of [false,true]){
   const w=W[lang],tag=`${lang} ${voice?'call':'text'}`;
   for(const said of SAID[lang]){
      await begin(lang,voice);
      const r=await say(said);
      ok(r.startsWith(voice?w.voice:w.text)&&w.also.test(r),`${tag}: "${said}" emails a second code and says so, no question [${r}]`);
      ok(emails.length===1&&emails[0].to==='robin@example.com'&&emails[0].additional===true&&!s.cargo.testResends,`${tag}: one email, additional; no text resent (${JSON.stringify(emails)})`);
   }
   // either code works afterwards
   await begin(lang,voice);await say(SAID[lang][0]);
   let r=await say('111111');ok(s.cargo.otpVerified===true&&/TEST verified/.test(r),`${tag}: the texted code still works [${r}]`);
   await begin(lang,voice);await say(SAID[lang][0]);
   r=await say('222222');ok(s.cargo.otpVerified===true&&s.cargo.otpAltHash===null&&s.cargo.otpHash===null,`${tag}: the emailed code works and both are cleared [${r}]`);
   // once per challenge: a second difficulty hears where both went
   await begin(lang,voice);await say(SAID[lang][0]);
   r=await say(SAID[lang][0]);ok(emails.length===1&&w.where.test(r),`${tag}: a second "can't find" sends nothing more and says where both went [${r}]`);
   // no email on file: where the code went; another way adds how to reach a person
   await begin(lang,voice,'');
   r=await say(SAID[lang][0]);ok(!emails.length&&/^(I sent it by text message|Se lo envié por mensaje de texto)/.test(r),`${tag}: no email on file, where the code went [${r}]`);
   r=await say(SAID[lang][1]);ok(!emails.length&&/(To reach a person, (say|type) AGENT\.|Para hablar con una persona, (diga|escriba) AGENTE\.)/.test(r),`${tag}: another way with no email names the agent [${r}]`);
   // an address stored in capitals is masked in lowercase (maskEmail)
   await begin(lang,voice,'ROBIN@EXAMPLE.COM');
   r=await say(SAID[lang][0]);ok(r.startsWith(voice?w.voice:w.text)&&!/EXAMPLE/.test(r)&&emails[0].to==='ROBIN@EXAMPLE.COM',`${tag}: a capitalised address is said in lowercase, sent as stored [${r}]`);
   // a refused address: where the code went, and no second attempt
   await begin(lang,voice);refuse=true;
   r=await say(SAID[lang][0]);ok(emails.length===1&&s.cargo.otpAltSent==='failed'&&/^(I sent it by text message|Se lo envié por mensaje de texto)/.test(r)&&!/also|también/.test(r.split('.')[0]),`${tag}: a refused address says where the code went [${r}]`);
   r=await say(SAID[lang][0]);ok(emails.length===1,`${tag}: and is not tried again`);
}
console.log(`OTP email too: ${checks} checks passed`);
