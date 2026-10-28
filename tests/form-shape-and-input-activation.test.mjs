import assert from 'node:assert/strict';
import {resolveFormInputs,openFormInstance,acceptFormReadings,formInputChain,enrichFormMatches,expandFormActivations,settleFormActivations} from '../dist/helpers/form-state.js';
import {matchInputs} from '../dist/helpers/match-inputs.js';
import {FLOWS} from '../dist/forms/index.js';
import {amountInAnswer} from '../dist/helpers/answer.js';
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const read=(cargo,id,text,current)=>{const chain=formInputChain(cargo.forms,id,cargo);return enrichFormMatches(matchInputs(text,chain,{form:id,name:current}),chain,id,[current],current);};

// Rule 1 by shape: a bare number of the asked question's keypad length answers that question, even when its reader
// rejects it; it is never read out of order as another field.
{
   const expiry={name:'card_expiration',profile:{kind:'pattern',regex:'\\b(0?[1-9]|1[0-2])\\s*(?:/|-|\\s|de)?\\s*(?:20)?(\\d{2})\\b'},digits:{min:3,max:6},validator:'validate-card-expiration'};
   const cvv={name:'card_cvv',profile:{kind:'digits',min:3,max:4},digits:{min:3,max:4},validator:'validate-card-cvv'};
   const cargo={},id=openFormInstance(cargo,'card',resolveFormInputs([expiry,cvv]));
   const m=read(cargo,id,'1320','card_expiration');
   eq(m.hits.map(h=>[h.name,h.value]),[['card_expiration','1320']],'month 13 is the expiration asked, for its validator to reject, not the security code');
   eq(m.hits[0].current,true,'the shape reading is the current answer');
   eq(read(cargo,id,'1230','card_expiration').hits.map(h=>[h.name,h.value]),[['card_expiration','1230']],'a valid expiration is read as before');
   eq(read(cargo,id,'1320','card_cvv').hits.map(h=>h.name),['card_cvv'],'at the security code question the same digits are the security code');
   eq(read(cargo,id,'1320 dollars','card_expiration').hits.some(h=>h.name==='card_expiration'),false,'a money-marked answer is not a bare number of that shape');
}
{
   // No validator: the shape reading is rejected outright, so the question is asked again.
   const zip={name:'zip',profile:{kind:'pattern',regex:'\\b9\\d{4}\\b'},digits:{min:5,max:5}};
   const phone={name:'phone_tail',profile:{kind:'digits',min:5,max:5}};
   const cargo={},id=openFormInstance(cargo,'addr',resolveFormInputs([zip,phone]));
   const m=read(cargo,id,'12345','zip');
   eq(m.hits.map(h=>[h.name,h.invalid===true]),[['zip',true]],'without a validator the shape reading is invalid, never another field');
}
{
   // A choice keeps rule 4: a digit it does not offer reaches the invited amount.
   const menu={name:'next',invites:['amount'],digits:{min:1,max:1},profile:{kind:'choice',choices:[{key:'link',words:['link'],keys:['1']}]}};
   const amount={name:'amount',profile:{kind:'amount',min:0.5}};
   const cargo={},id=openFormInstance(cargo,'menu',resolveFormInputs([menu,amount]));
   eq(read(cargo,id,'3','next').hits.map(h=>[h.name,h.value]),[['amount','3']],'a choice question is unchanged by the shape rule');
}

// activate on a plain input: an answer to a dormant input proposes its controller, validated as one unit.
{
   const menu={name:'next',invites:['revised_amount'],profile:{kind:'choice',choices:[{key:'new',words:['new card']},{key:'amount',words:['different amount']},{key:'done',words:['no']}]}};
   const amount={name:'revised_amount',when:{next:'amount'},activate:{next:'amount'},profile:{kind:'amount',min:0.5,marked:'out_of_order',money:{currency:'USD',cardinals:true,intent:'payment'}}};
   const cargo={},id=openFormInstance(cargo,'recovery',resolveFormInputs([menu,amount]));
   const chain=formInputChain(cargo.forms,id,cargo);
   eq(chain.filter(c=>c.activation).map(c=>c.name),['revised_amount'],'the dormant amount carries its activation');
   for(const text of ['40 dollars','40','cuarenta dólares']){
      const hits=expandFormActivations(cargo,read(cargo,id,text,'next').hits);
      eq(hits.map(h=>[h.name,h.value]).sort(),[['next','amount'],['revised_amount','40']],`"${text}" answers the menu as its amount option`);
   }
   const hits=expandFormActivations(cargo,read(cargo,id,'40 dollars','next').hits);
   acceptFormReadings(cargo,settleFormActivations({accepted:hits.map(h=>({...h,ok:true}))}).accepted);
   eq([cargo.forms[id].values.next,cargo.forms[id].values.revised_amount],['amount','40'],'controller and amount commit together');
   const cargo2={},id2=openFormInstance(cargo2,'recovery',resolveFormInputs([menu,amount]));
   const h2=expandFormActivations(cargo2,read(cargo2,id2,'40 dollars','next').hits);
   const settled=settleFormActivations({accepted:h2.filter(h=>h.name==='next').map(h=>({...h,ok:true})),rejected:h2.filter(h=>h.name==='revised_amount').map(h=>({...h,outcome:'rejected'}))});
   eq(settled.accepted,[],'a rejected amount never flips the menu');
   eq(expandFormActivations(cargo2,read(cargo2,id2,'new card','next').hits).map(h=>[h.name,h.value]),[['next','new']],'a menu word is read as before');
}
{
   // The declaration is explicit: a plain input names controllers and no activate_on; a subform still needs both.
   assert.throws(()=>resolveFormInputs([{name:'next',profile:{kind:'choice',choices:[{key:'amount',words:['amount']}]}},{name:'x',profile:{kind:'amount'},activate:{next:'amount'},activate_on:['x']}]),/activation/);checks++;
   assert.throws(()=>resolveFormInputs([{name:'next',profile:{kind:'choice',choices:[{key:'amount',words:['amount']}]}},{name:'x',profile:{kind:'amount'},activate:{nope:'amount'}}]),/controller/);checks++;
}

// silent: a carrier input's accepted answer is not acknowledged; the input it hands on to speaks.
{
   const menu={name:'next',invites:['revised_amount'],profile:{kind:'choice',choices:[{key:'amount',words:['different amount']}]}};
   const amount={name:'revised_amount',when:{next:'amount'},activate:{next:'amount'},silent:true,profile:{kind:'amount',min:0.5,money:{currency:'USD',cardinals:true,intent:'payment'}}};
   const cargo={},id=openFormInstance(cargo,'recovery',resolveFormInputs([menu,amount]));
   eq(read(cargo,id,'40 dollars','next').hits.find(h=>h.name==='revised_amount').silent,true,'the carrier reading is silent');
}

// validate-card-cvv: the security code has its brand's length.
{
   const flow=FLOWS.find(f=>f.id==='validate-card-cvv');
   assert(flow,'validate-card-cvv is a system worker');checks++;
   const expr=flow.steps.find(step=>step.id==='vcc_check').value;
   const run=(value,values)=>{const cargo={};new Function('cargo','value','values',`return ${expr}`)(cargo,value,values);return cargo.inputCheck;};
   eq(run('123',{card_number:'4111111111111111'}).ok,true,'Visa takes 3 digits');
   eq(run('1320',{card_number:'4111111111111111'}).ok,false,'Visa refuses 4 digits');
   eq(run('1234',{card_number:'371449635398431'}).ok,true,'American Express takes 4 digits');
   eq(run('123',{card_number:'371449635398431'}).ok,false,'American Express refuses 3 digits');
   eq(run('1234',{}).ok,true,'no card number yet: 3 or 4 digits');
   eq(/front/.test(run('123',{card_number:'341111111111111'}).message),true,'the American Express message names the front');
}
// Dot-grouped thousands: three digits after a dot are never cents.
for(const [text,value] of [['1.500',1500],['1.500 dólares',1500],['2.000.000',2000000],['1.50',1.5],['$12.50',12.5],['1.234,56',1234.56]])eq(amountInAnswer(text),value,text);
console.log(`form-shape-and-input-activation: ${checks} checks passed`);
