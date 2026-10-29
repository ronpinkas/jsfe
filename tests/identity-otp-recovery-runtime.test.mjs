/** Execute OTP recovery decisions; matching catalogs must resolve inside the actual shared worker. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const warnings=[];const log={info(){},debug(){},warn(...x){warnings.push(x.join(' '));},error(...x){warnings.push(x.join(' '));}};
const variable=value=>({type:typeof value,value});
const probe={id:'otp-probe',name:'OtpProbe',version:'1',description:'Enter the actual OTP validator with a caller answer.',parameters:[{name:'answer',type:'string'},{name:'digits',type:'string'}],variables:{answer:variable(''),digits:variable(''),otp_code:variable(''),normalized_otp_code:variable(''),user_choice:variable('')},steps:[{id:'ask',type:'SAY-GET',variable:'answer',value:'Code?'},{id:'raw',type:'SET',variable:'user_choice',value:'answer'},{id:'otp',type:'SET',variable:'otp_code',value:'answer'},{id:'digits',type:'SET',variable:'normalized_otp_code',value:"/^[\\d\\s]+$/.test(answer) ? answer.replace(/\\D/g,'') : ''"},{id:'validate',type:'FLOW',value:'validate-otp-code',callType:'replace',initializeDefaults:true}]};
const support={id:'contact-support',name:'ContactSupport',version:'1',description:'Stand-in for the cancel flow.',steps:[{id:'said',type:'SAY',value:'TEST cancel flow'}]};
const resend={id:'resend-otp-code',name:'ResendOtpCode',version:'1',description:'Count resends without sending anything.',steps:[{id:'record',type:'SET',variable:'noop',value:'(cargo.testResends=Number(cargo.testResends||0)+1,true)'}]};
for(const [answer,digits,es,kind] of [["I don't have that phone number anymore",'',false,'no-phone'],['ya no tengo ese teléfono','',true,'no-phone'],['resend','',false,'resend'],['later','',false,'later'],['Cancelar el pedido','',true,'worded'],['Cancelar','',true,'exit'],['0931','0931',false,'short']]){
 const engine=new WorkflowEngine(log,async(system,user,schema,r)=>r && r.task==='rank_reply'?'{"option":"answers"}':'{"flowName":"None"}',[...FLOWS,probe,resend,support],[],STANDARD_FUNCTIONS,{},false,es?'es':'en');engine.disableCommands();
 let s=engine.initSession('u','otp-recovery',es?'es':'en');Object.assign(s.cargo,{voice:false,verb:'type',verb_es:'escriba',authOptions:{parent_form:''},authCancelFlow:'contact-support',otpVerified:false,otpFailure:'mismatch',otp_cell_number:'8185550000',otpSentOn:'cell'});
 s=await engine.updateActivity({role:'user',content:'start',start:{flow:'otp-probe',arguments:{}}},JSON.parse(JSON.stringify(s)));
 s=await engine.updateActivity({role:'user',content:answer},JSON.parse(JSON.stringify(s)));
 if(kind==='no-phone')assert.match(s.response,es?/el código no le puede llegar ahí.*AGENTE/s:/the code can't reach you there.*AGENT/s);
 if(kind==='resend')assert.equal(s.cargo.testResends,1);
 if(kind==='later')assert.match(s.response,/when you are free/);
 if(kind==='worded')assert.match(s.response,/Le explico\. Le envié un mensaje con un código de seis dígitos/);
 if(kind==='exit')assert.match(s.response,/TEST cancel flow/);
 if(kind==='worded')assert.doesNotMatch(s.response,/TEST cancel flow/);
 if(kind==='short')assert.match(s.response,/expecting a 6-digit code/);
 assert.notEqual(s.cargo.otpVerified,true);console.log('PASS OTP recovery '+kind+' '+(es?'ES':'EN'));
}
assert.deepEqual(warnings.filter(x=>/not defined|evaluation failed|expression.*fail/i.test(x)),[]);
console.log('OTP recovery runtime: every case passed without expression failures or authentication');
