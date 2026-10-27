/** A provider keyword inside an uncertain request cannot steal the turn from DISPATCH. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas,providerQuestions} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
const provides={subject:'account',facts:[{key:'balance',public:true,path:'balance',words:['balance','saldo'],format:'money',say:'BALANCE {value}.'}],source:{flow:'facts',result:'cargo.testFacts',subject:'cargo.subject',refresh:'per_turn'}};
for(const [input,question] of [['balance',true],['what is my balance?',true],['Quiero pagar todo el saldo',false]]){
 const owner=defineForm({id:'pay',name:'Pay',description:'Choose an amount',contract:{summary:'Choose an amount'},inputs:[{name:'amount',field:'amount',profile:{kind:'amount',money:{currency:'USD',cardinals:true,intent:'payment'}},question:'AMOUNT?'}],extraVars:{provides,questions:providerQuestions(provides)},after:[{id:'effect',type:'SET',variable:'noop',value:'(cargo.effect=true,true)'}]});
 const loader={id:'facts',name:'Facts',steps:[{id:'load',type:'SET',variable:'noop',value:'(cargo.loaded=true,cargo.testFacts={balance:50},true)'}]};
 const e=new WorkflowEngine(quiet,async(_s,_m,_x,request)=>request?.task==='rank_reply'?JSON.stringify({option:'new_request'}):JSON.stringify({flowName:'None',parameters:{}}),linkFormSchemas([...FLOWS,owner,loader]),[],STANDARD_FUNCTIONS,{});e.disableCommands();let session=e.initSession('synthetic',crypto.randomUUID(),'en');session.cargo.voice=false;
 session=await e.updateActivity({role:'user',content:'start',start:{flow:'pay'}},session);session=await e.updateActivity({role:'user',content:input},session);
 assert.equal(session.cargo.effect,undefined);
 if(question){assert.equal(session.cargo.loaded,true);assert.match(session.response,/BALANCE \$50\.00/);assert.match(session.response,/AMOUNT/);}
 else{assert.equal(session.cargo.loaded,undefined);assert.equal(session.flowStacks.flat().length,0);assert.equal(session.lastTurnDispatch.matchedFlow,null);}
 console.log('PASS provider boundary '+input);
}
