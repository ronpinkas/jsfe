// Speech-to-text writes the pauses between spoken digit groups as commas (prod 2026-10-31: the ZIP 92610 said as
// "926, 1 0." was asked again twice, then lost). Every digits input reads them as one number; a comma after a longer
// number still separates two numbers, and a choice still reads "1, 2" as two keys.
import assert from 'node:assert/strict';
import {readInputProfile,matchInputs} from '../dist/helpers/match-inputs.js';
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const digits=(min,max=min)=>({kind:'digits',min,max});
const value=(profile,said,current=true)=>readInputProfile(profile,said,current)?.value ?? null;
eq(value(digits(5),'926, 1 0.'),'92610','ZIP in spoken groups (prod)');
eq(value(digits(5),'9 2 6, 1 0.'),'92610','ZIP digit by digit with a pause');
eq(value(digits(5),'92, 610'),'92610','ZIP 2 + 3');
eq(value(digits(10),'818, 451, 5475'),'8184515475','phone 3-3-4');
eq(value(digits(6),'7, 9, 984. 5.'),'799845','verification code (prod)');
eq(value(digits(16),'4111, 1111, 1111, 1111'),'4111111111111111','a card in groups of four, at its own question');
eq(value(digits(16),'4111, 1111, 1111, 1111',false),null,'out of order, a comma after four digits separates');
eq(value(digits(8),'560, 352, 14'),'56035214','account number in groups');
eq(value(digits(3),'1, 2, 3'),'123','CVV digit by digit');
eq(value(digits(5),'92610, 56035214'),'92610','a comma after a whole number separates it from the next');
eq(value(digits(5),'my zip is 92610, thanks'),'92610','a comma before words joins nothing');
eq(value(digits(5),'926 10'),'92610','a space still joins');
const choice={kind:'choice',choices:[{key:'1',words:['1']},{key:'2',words:['2']},{key:'12',words:['12']}]};
const picked=matchInputs('1, 2',[{form:'f',name:'pick',profile:choice}],{form:'f',name:'pick'}).hits.map(h=>h.value);
assert.ok(!picked.includes('12'),`a choice reads "1, 2" as keys, not 12: ${JSON.stringify(picked)}`);checks++;
console.log(`helpers-digits-comma-groups: ${checks} checks passed`);
