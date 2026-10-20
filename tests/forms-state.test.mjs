import assert from 'node:assert/strict';
import { resolveFormInputs, formInputApplies, nextFormInput, formInputChain, openFormInstance,
   formInitialReadings, acceptFormReadings, formInstanceApplies, closeFormInstance } from '../dist/helpers/form-state.js';
import {FIELD_PRESETS} from '../dist/forms/index.js';
import { matchInputs } from '../dist/helpers/match-inputs.js';

let checks = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const names = result => result.hits.map(h => `${h.name}=${h.value}`).sort();
const presets = {
   zip: { label: 'ZIP', profile: { kind: 'digits', min: 5, max: 5 } },
   code: { profile: { kind: 'digits', min: 6, max: 6 }, validator: 'check-code' },
};
const specs = resolveFormInputs([{ name: 'method', profile: { kind: 'choice', choices: [{key:'card',words:['card']},{key:'bank',words:['bank']}] } },
   { name: 'zip', field: 'zip', when: { method: ['card','bank'], 'cargo.ready': ['!no','!'] } }], presets);
eq(specs[1].profile.kind, 'digits', 'preset resolved before storage');
assert.throws(() => resolveFormInputs([{name:'x',field:'missing'}],presets), /Unknown/); checks++;
assert.throws(() => resolveFormInputs([{name:'x',profile:{}},{name:'x',profile:{}}],presets), /Duplicate/); checks++;
eq(formInputApplies(specs[1], {method:'card'}, {ready:true}), true, 'list and cargo negation apply');
eq(formInputApplies(specs[1], {method:'card'}, {ready:'no'}), false, 'negation excludes');
eq(formInputApplies({unless:['cargo.done']},{},{done:true}), false, 'unless uses the same path reader');

const cargo = {};
const id = openFormInstance(cargo,'checkout',specs);
eq(nextFormInput(cargo.forms[id], {ready:true}), 'method', 'first missing field');
acceptFormReadings(cargo,[{form:id,name:'method',value:'card',ok:true}]);
cargo.ready=true;
eq(nextFormInput(cargo.forms[id],cargo), 'zip', 'applicable input selected');
eq(formInputChain(cargo.forms,id,cargo).some(i=>i.name==='zip'),true,'same field is eligible for matching');

const codeId = openFormInstance(cargo,'verification',resolveFormInputs([{name:'code',field:'code'}],presets));
eq(formInitialReadings(cargo.forms[codeId],{code:'garbage'})[0].invalid,true,'malformed activation is queued as rejected rather than accepted');
const initial = formInitialReadings(cargo.forms[codeId],{code:'123456'});
eq(initial[0].validator,'check-code','valid-shaped activation retains its validator');
eq(cargo.forms[codeId].values,{},'reading an activation never accepts it');
eq(nextFormInput(cargo.forms[codeId],cargo),'code','unvalidated activation remains missing');
assert.throws(()=>acceptFormReadings(cargo,[{form:codeId,name:'code',value:'123456',ok:false}]),/validated/);checks++;
eq(cargo.forms[codeId].values,{},'rejected commit leaves values intact');
acceptFormReadings(cargo,[{...initial[0],ok:true}]);
eq(nextFormInput(cargo.forms[codeId],cargo),'','validated activation completes field');

// Instance ownership survives a JSON round trip, and repeat uses of a collector stay independent.
const cardSpec = resolveFormInputs([{name:'number',profile:{kind:'digits',min:16,max:16}}]);
const rootSpecs=resolveFormInputs([{name:'billing',form:'card'},{name:'shipping',form:'card'}]);
const a=openFormInstance(cargo,'payment',rootSpecs);
const b=openFormInstance(cargo,'payment',rootSpecs);
const ab=openFormInstance(cargo,'card',cardSpec,{parent:a,input:'billing'});
const as=openFormInstance(cargo,'card',cardSpec,{parent:a,input:'shipping'});
const bb=openFormInstance(cargo,'card',cardSpec,{parent:b,input:'billing'});
eq(new Set([a,b,ab,as,bb]).size,5,'tasks and sibling inputs each own an instance');
acceptFormReadings(cargo,[{form:ab,name:'number',value:'4111111111111111',ok:true}]);
eq(cargo.forms[bb].values,{},'another task does not inherit unfinished values');
const restored=JSON.parse(JSON.stringify(cargo));
eq(openFormInstance(restored,'card',cardSpec,{parent:a,input:'billing'}),ab,'same owning input resumes its child');
assert.throws(()=>openFormInstance(restored,'card',cardSpec,{resume:ab,parent:b,input:'billing'}),/ownership/);checks++;
eq(formInstanceApplies(restored,ab),true,'owned child is applicable');
closeFormInstance(restored,ab);
eq(restored.forms[a].values.billing.number,'4111111111111111','completion returns to the owning slot');
eq(restored.forms[b].values,{},'unrelated task remains intact');

// Dependency invalidation must not depend on field ordering and compound updates preserve new dependent values.
for (const reverse of [false,true]) {
   const rows=[{name:'account',profile:{kind:'text'}},{name:'amount',profile:{kind:'amount'},reset_on:['account']},{name:'quote',profile:{kind:'text'},reset_on:['amount']}];
   const f=openFormInstance(cargo,'dependent',resolveFormInputs(reverse?rows.reverse():rows));
   acceptFormReadings(cargo,[{form:f,name:'account',value:'A',ok:true},{form:f,name:'amount',value:'20',ok:true},{form:f,name:'quote',value:'old',ok:true}]);
   cargo.forms[f].confirmation={revision:0};
   acceptFormReadings(cargo,[{form:f,name:'account',value:'B',ok:true},{form:f,name:'amount',value:'30',ok:true}]);
   eq(cargo.forms[f].values,{account:'B',amount:'30'},'compound change keeps supplied dependent value and invalidates its descendants');
   eq(cargo.forms[f].confirmation,null,'a changed premise invalidates confirmation');
}

const method={form:'pay',name:'method',profile:{kind:'choice',choices:[{key:'bank',words:['bank']}]}};
const amount={form:'pay',name:'amount',profile:{kind:'amount',marked:true}};
eq(names(matchInputs('bank and $40',[method,amount],{form:'pay',name:'method'},'bank')),['amount=40','method=bank'],'current choice preserves independent amount');
const expiration={form:'card',name:'expiration',profile:{kind:'pattern',regex:'\\b(0?[1-9]|1[0-2])\\s*[/ -]?\\s*(\\d{2})\\b'}};
const cvv={form:'card',name:'cvv',profile:{kind:'digits',min:3,max:4}};
eq(names(matchInputs('0930',[expiration,cvv],{form:'card',name:'expiration'})),['expiration=0930'],'pattern and digits share evidence');
const street={form:'address',name:'street',profile:{kind:'text'}};
eq(names(matchInputs('90001',[street,{form:'address',name:'zip',profile:presets.zip.profile}],{form:'address',name:'street'})),['zip=90001'],'typed evidence is not also accepted as unqualified text');
{
   const bag={};
   const key=openFormInstance(bag,'optional-scope',[
      {name:'plan',profile:{kind:'choice',choices:[{key:'due',words:['due']},{key:'custom',words:['custom']}]}},
      {name:'sub',profile:{kind:'choice',choices:[{key:'80',words:['80']}]},required_when:{plan:'custom'}}]);
   eq(nextFormInput(bag.forms[key],bag),'plan','required condition waits for its controlling input');
   acceptFormReadings(bag,[{form:key,name:'plan',value:'due',ok:true}]);
   eq(nextFormInput(bag.forms[key],bag),'','an optional missing field does not prevent completion');
   eq(formInputChain(bag.forms,key,bag).some(i=>i.name==='sub'),true,'optional fields remain readable for voluntary input');
   acceptFormReadings(bag,[{form:key,name:'plan',value:'custom',ok:true}]);
   eq(nextFormInput(bag.forms[key],bag),'sub','required condition schedules the same field when needed');
   const choices=[{form:key,name:'menu',profile:{kind:'choice',choices:[{key:'link',words:['link'],keys:['12']}]}}];
   eq(names(matchInputs('12',choices,{form:key,name:'menu'})),['menu=link'],'multi-digit menu aliases work for the current field');
   eq(names(matchInputs('12',choices,{form:key,name:'other'})),[],'multi-digit keypad aliases cannot claim another field answer');
}
{
   const address=[{form:'address',name:'street',profile:FIELD_PRESETS.street_address.profile},
      {form:'address',name:'city',profile:FIELD_PRESETS.city.profile,confirm_against:['state']},
      {form:'address',name:'state',profile:FIELD_PRESETS.state.profile}];
   eq(names(matchInputs('123 Main Street',address,{form:'address',name:'street'})),['street=123 Main Street'],'state preset does not consume a street address');
   eq(names(matchInputs('Los Angeles',address,{form:'address',name:'city'})),['city=Los Angeles'],'state preset does not consume arbitrary city names');
   eq(names(matchInputs('CA',address,{form:'address',name:'state'})),['state=CA'],'state preset accepts the declared region code');
   eq(matchInputs('Washington',address,{form:'address',name:'city'}).ambiguous.map(h=>h.name).sort(),['city','state'],'declared city/state homonyms are clarified even against text fallback');
}
console.log(`forms-state: ${checks} checks passed`);
