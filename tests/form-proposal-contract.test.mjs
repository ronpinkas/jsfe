import assert from 'node:assert/strict';
import {validateProposalData,validateFormProposalPolicy,validateFormProposalDescriptor,formProposalDescriptor} from '../dist/helpers/proposal-contract.js';
import {defineForm,validateFlowContracts} from '../dist/forms/index.js';
let calls=0;
const getter={get question(){calls++;return 'Confirm?';}};
for(const candidate of [getter,Object.defineProperty({question:'Confirm?'},'hidden',{value:1}),{question:'Confirm?',[Symbol('extra')]:1}]){
   assert.throws(()=>validateFormProposalDescriptor(candidate),/FORM proposal/);
   assert.throws(()=>formProposalDescriptor({question:'Base?'},candidate),/FORM proposal/);
}
assert.throws(()=>formProposalDescriptor({get prepare(){calls++;return 'prepare';}},null),/FORM proposal/);
assert.equal(calls,0,'contract validation must never execute accessors');
for(const candidate of [new Date(),new Map(),[1,,3],Object.assign([1],{extra:2}),[undefined],{value:Infinity},JSON.parse('{"constructor":1}')])assert.throws(()=>validateProposalData(candidate),/FORM proposal/);
const circular={};circular.self=circular;assert.throws(()=>validateProposalData(circular),/FORM proposal/);
const policy={prepare:'prepare-proposal',origins:['activation'],when:{kind:['lost']},question:'Confirm?',binding:{account:'42',items:[1,true,null]}};
const copy=validateFormProposalPolicy(policy);policy.binding.account='changed';assert.equal(copy.binding.account,'42');
assert.deepEqual(formProposalDescriptor(copy,{question:'Updated?',binding:{account:'43'}}),{question:'Updated?',binding:{account:'43'}});
assert.equal(formProposalDescriptor(copy,null),null);
assert.throws(()=>formProposalDescriptor(copy),/explicitly return/);
for(const candidate of [{question:''},{question:'Confirm?',unknown:true},{question:'Confirm?',when:'kind'},{question:'Confirm?',when:['kind']},{question:'Confirm?',when:{kind:[]}},{question:'Confirm?',when:{kind:{value:'lost'}}},{question:'Confirm?',unless:'kind'},{question:'Confirm?',unless:['cargo.__proto__.bad']},{prepare:'bad {{worker}}'},{question:'Confirm?',origins:['answer','answer']},{question:'Confirm?',interrupts:[{key:'pay',flow:'pay',words:[]}]}])assert.throws(()=>validateFormProposalPolicy(candidate),/FORM proposal/);
assert.deepEqual(validateFormProposalDescriptor({question:'Confirm?',words:['yes'],no_keys:['2']}),{question:'Confirm?',words:['yes'],no_keys:['2']});
for(const input of [{name:'group',any_of:[{name:'kind',profile:{kind:'text'}}],proposal:{question:'Confirm?'}},{name:'child',form:'child-form',proposal:{question:'Confirm?'}},{name:'bound',bind:'cargo.value',proposal:{question:'Confirm?'}}])assert.throws(()=>defineForm({id:'invalid-placement',name:'InvalidPlacement',description:'Invalid proposal placement',contract:{summary:'Invalid placement'},inputs:[input]}),/requires a readable leaf input/);
const make=when=>defineForm({id:'condition-owner',name:'ConditionOwner',description:'Condition fixture',contract:{summary:'Condition fixture'},inputs:[{name:'kind',profile:{kind:'choice',choices:[{key:'lost',words:['lost']}]},proposal:{question:'Confirm?',when}}]});
assert.doesNotThrow(()=>validateFlowContracts([make({kind:'lost'})],[],{externalFlows:['run-form','collect-input-accept','form-done']}));
assert.throws(()=>validateFlowContracts([make({typo:'lost'})],[],{externalFlows:['run-form','collect-input-accept','form-done']}),/unknown proposal condition typo/);
console.log('PASS proposal declarations: data-only validation, immutable copies, exact schema, null opt-out');
