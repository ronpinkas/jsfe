/** Declared terminal phrases retain meaning when courtesy also makes them fit a shorter neutral action. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,linkFormSchemas} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
let checks=0;const check=(label,fn)=>{fn();checks++;console.log('PASS '+label);};
const S=(id,value)=>({id,type:'SET',variable:'noop',value});
const W=(id,steps,parameters=[])=>({id,name:id,description:'Provider menu behavioral fixture '+id,version:'1',scope:'isolated',parameters,steps});
const action=W('neutral-action',[S('neutral',"(cargo.actions=Number(cargo.actions||0)+1,true)"),{id:'neutral_reply',type:'SAY',value:'FOLLOW UP',value_es:'MÁS AYUDA'}]);
const loader=W('load-fact',[S('loaded',"(cargo.info={balance:17},true)")]);
const catalog={subject:'test',source:{flow:'load-fact',result:'cargo.info',refresh:'per_turn'},facts:[],menu:{question:'Choose NO, PAY or a fact.',question_es:'Diga NO, PAGAR o un dato.',choices:[{key:'more_help',words:['no'],exact:true,flow:'neutral-action'},{key:'pay',words:['pay','pagar'],exact:true,flow:'neutral-action'}],done:{words:['no thanks','no gracias','done','nada'],say:'TERMINAL',say_es:'TERMINADO'}}};
async function run(answers,provides,language='en'){
 const warnings=[],logger={info(){},debug(){},error(){},warn(...args){warnings.push(args.join(' '));}};
 const engine=new WorkflowEngine(logger,async()=>JSON.stringify({flowName:'None',parameters:{}}),linkFormSchemas([...FLOWS,action,loader]),[],STANDARD_FUNCTIONS,{},false,language);engine.disableCommands();
 let session=engine.initSession('provider-menu',crypto.randomUUID(),language);session.cargo.info={balance:17};session.cargo.verb='type';session.cargo.verb_es='escriba';
 session=await engine.updateActivity({role:'user',content:'begin',start:{flow:'provider-menu',arguments:{provides}}},session);
 const responses=[];for(const content of answers){session=structuredClone(await engine.updateActivity({role:'user',content},structuredClone(session)));responses.push(session.response||'');}
 return {session,warnings,response:responses.join(' ')};
}
for(const language of ['en','es']) {
 for(const answer of ['no','No.','NO!','no please','no por favor']) {
  const t=await run([answer],catalog,language);check(language+' neutral '+answer+' stays an action',()=>{assert.equal(t.session.cargo.actions,1);assert.match(t.response,language==='es'?/MÁS AYUDA/:/FOLLOW UP/);});
 }
 for(const answer of ['no thanks','no gracias','no thanks please','done']) {
  const t=await run([answer],catalog,language);check(language+' explicit terminal '+answer+' cannot become an action',()=>{assert.equal(t.session.cargo.actions,undefined);assert.match(t.response,language==='es'?/TERMINADO/:/TERMINAL/);});
 }
 const fallback=await run(['nope'],catalog,language);check(language+' undeclared negative yields without fabricating a terminal selection',()=>{assert.equal(fallback.session.cargo.actions,undefined);assert.doesNotMatch(fallback.response,/TERMINAL|TERMINADO/);assert.equal(fallback.session.cargo.choice,'other');assert.equal(fallback.session.lastTurnDispatch?.fromFlow,'ProviderMenu');});
 const none=structuredClone(catalog);delete none.menu.done;const neutral=await run(['no'],none,language);check(language+' a menu without done declarations still accepts its action',()=>assert.equal(neutral.session.cargo.actions,1));
 const facts=structuredClone(catalog);facts.facts=[{key:'balance',words:['no thanks'],path:'balance',say:'BALANCE {value}',say_es:'SALDO {value}',public:true}];
 const provided=await run(['no thanks','done'],facts,language);check(language+' fact claims retain priority over menu actions and terminal preselection',()=>{assert.equal(provided.session.cargo.actions,undefined);assert.match(provided.response,language==='es'?/SALDO 17/:/BALANCE 17/);assert.match(provided.response,language==='es'?/TERMINADO/:/TERMINAL/);assert.deepEqual(provided.warnings,[]);});
}
console.log(`Provider terminal precedence: all checks passed (${checks})`);
