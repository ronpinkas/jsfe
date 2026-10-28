/** Preferred phrase declarations execute through the same guards as legacy word aliases. */
import assert from 'node:assert/strict';
import {WorkflowEngine} from '../dist/index.js';
import {FLOWS,defineForm,linkFormSchemas,providerQuestions,providerParameter} from '../dist/forms/index.js';
import {STANDARD_FUNCTIONS,pickChoice,readInputProfile,pickProviderQuestion} from '../dist/helpers/index.js';
import {validateFormProposalDescriptor} from '../dist/helpers/proposal-contract.js';
let checks=0;
const check=(label,fn)=>{fn();checks++;console.log('PASS '+label);};
check('preferred phrases never union legacy aliases or loosen exact consent',()=>{
 const choices=[{key:'pay',phrases:['pay here'],words:['obsolete'],exact:true}];
 assert.equal(pickChoice('pay here',choices,false),'pay');assert.equal(pickChoice('obsolete',choices,false),'');assert.equal(pickChoice('I do not want to pay here',choices,false),'');
 assert.equal(pickChoice('legacy',[{key:'old',words:['legacy']}],false),'old');
 assert.equal(readInputProfile({kind:'choice',choices:[{key:'saved',phrases:['9552']}]},'95 52').value,'saved');
 assert.equal(readInputProfile({kind:'choice',choices:[{key:'pay',phrases:['pay here'],words:['obsolete']}]},'obsolete'),null);
});
check('provider descriptions and phrase specificity use preferred declarations with fallback',()=>{
 const provides={facts:[{key:'balance',description:'Total outstanding debt',gloss:'obsolete description',path:'balance',phrases:['balance'],words:['obsolete']},{key:'statement',path:'statement',description:'Statement debt',phrases:['statement balance']}]};
 assert.deepEqual(providerQuestions(provides),[{key:'balance',phrases:['balance']},{key:'statement',phrases:['statement balance']}]);
 assert.match(providerParameter(provides).description,/Total outstanding debt/);assert.doesNotMatch(providerParameter(provides).description,/obsolete/);
 assert.equal(pickProviderQuestion('statement balance',providerQuestions(provides)),'statement');
 assert.equal(pickProviderQuestion('obsolete',providerQuestions(provides)),'');
 assert.match(providerParameter({facts:[{key:'old',gloss:'Legacy description'}]}).description,/Legacy description/);
 assert.deepEqual(validateFormProposalDescriptor({question:'Confirm?',phrases:['proceed'],interrupts:[{key:'change',phrases:['another'],flow:'change'}]}).phrases,['proceed']);
});
const S=(id,value)=>({id,type:'SET',variable:'noop',value});
const W=(id,steps)=>({id,name:id,version:'1',description:'Phrase runtime fixture',scope:'isolated',steps});
const owner=defineForm({id:'phrase-owner',name:'PhraseOwner',description:'Confirm the chosen route',contract:{summary:'Exact phrase confirmation'},inputs:[{name:'route',profile:{kind:'choice',choices:[{key:'here',phrases:['pay here'],words:['obsolete']}]},question:'Choose route.'}],confirm:{question:'Confirm route?',phrases:['proceed'],words:['obsolete'],interrupts:[{key:'another',phrases:['another method'],flow:'changed'}]},after:[S('effect','(cargo.effects=Number(cargo.effects||0)+1,true)')]});
const quiet={info(){},debug(){},warn(){},error(){}};
function fixture(){const engine=new WorkflowEngine(quiet,async(s,u,sc,r)=>r&&r.task==='rank_reply'?JSON.stringify({option:'new_request'}):JSON.stringify({flowName:'None',parameters:{}}),linkFormSchemas([...FLOWS,owner,W('changed',[S('changed','(cargo.changed=true,true)')])]),[],STANDARD_FUNCTIONS,{},false,'en');engine.disableCommands();let session=engine.initSession('phrases',crypto.randomUUID(),'en');return {get session(){return session;},async say(content,start,cargo){Object.assign(session.cargo,cargo);session=JSON.parse(JSON.stringify(await engine.updateActivity({role:'user',content,...(start?{start}: {})},session)));return session.response||'';}};}
for(const answer of ['proceed','obsolete','I do not want to proceed','another method']){
 const t=fixture();await t.say('start',{flow:'phrase-owner'});assert.match(await t.say('pay here'),/Confirm route/);await t.say(answer);
 check('actual form confirmation '+answer,()=>{assert.equal(t.session.cargo.effects,answer==='proceed'?1:undefined);assert.equal(t.session.cargo.changed,answer==='another method'?true:undefined);});
}
for(const key of ['phrases','words']){
 const t=fixture();await t.say('start',{flow:'ask-choice',arguments:{question:'Choose route.',choices:[{key:'here',[key]:['pay here']},{key:'no',[key]:['decline'],exact:true}],accept_other:true}},{switchOffer:{flow:'changed',[key]:['another method']}});await t.say('another method');
 check('actual switch offer '+key,()=>assert.equal(t.session.cargo.changed,true));
}
console.log(`Phrase runtime: all ${checks} checks passed`);
