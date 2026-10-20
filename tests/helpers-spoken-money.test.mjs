import assert from 'node:assert/strict';
import {readSpokenMoney} from '../src/helpers/spoken-money.js';
import {amountInAnswer} from '../src/helpers/answer.js';
import {readMoneyAmount} from '../src/helpers/money.js';
const USD={currency:'USD',cardinals:true,intent:'payment'};
import {readInputProfile,matchInputs} from '../src/helpers/match-inputs.js';
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
for(const [phrase,expected] of [
 ['fifty dollars',50],['a thousand dollars',1000],['sixty-five dollars and twenty-five cents',65.25],['one hundred and twenty dollars',120],['two thousand three hundred forty five dollars',2345],['one million two hundred thousand five dollars',1200005],
 ['cincuenta dólares',50],['sesenta y cinco dólares con veinticinco centavos',65.25],['quinientos veintidós dólares',522],['veintiún dólares',21],['un centavo',.01],['fifty cents',.5],['cincuenta centavos',.5],['fifty dollars and 25 cents',50.25],['50 dollars and twenty five cents',50.25],
 ])test(phrase,()=>assert.equal(readMoneyAmount(phrase,USD),expected));
for(const phrase of ['fifty','cincuenta','one two three four','one two three four dollars','five six dollars','twenty thirteen dollars','treinta cinco dólares','cien cinco pesos','ciento pesos','two hundred hundred dollars','fifty dollars and one hundred cents','minus fifty dollars','menos cincuenta pesos','fifty dollars and 100 cents','one two 3 dollars','twenty thirteen dollars or $5','one hundred and dollars','one thousand and dollars','one million and dollars'])test('reject malformed/nonmonetary grammar: '+phrase,()=>assert.ok(Number.isNaN(readMoneyAmount(phrase,USD))));
test('currency plus unrelated sequential card words retains only the currency amount',()=>assert.equal(readMoneyAmount('pay fifty dollars with the card ending in nine five five two',USD),50));
test('numeric card digits cannot steal the spoken payment amount',()=>assert.equal(readMoneyAmount('pagar cincuenta dólares con tarjeta terminada en 95 52',USD),50));
test('two spoken monetary amounts remain ambiguous',()=>assert.ok(Number.isNaN(readMoneyAmount('fifty dollars or sixty dollars',USD))));
test('a spoken and numeric monetary alternative remain ambiguous',()=>assert.ok(Number.isNaN(readMoneyAmount('fifty dollars or $60',USD))));
test('existing ambiguous numeric alternatives cannot be overridden by a spoken phrase',()=>assert.ok(Number.isNaN(readMoneyAmount('$20 or $30 or fifty dollars',USD))));
test('money spans retain exact original accents and connected cents words',()=>{const raw='pague sesenta y cinco dólares con veinticinco centavos por favor';assert.deepEqual(readSpokenMoney(raw),[{value:65.25,start:6,end:raw.indexOf(' por favor')}]);});
test('the amount input claims its complete spoken currency evidence',()=>{const raw='pagar cincuenta dólares con tarjeta 9552',reading=readInputProfile({kind:'amount',marked:true,money:USD},raw,false);assert.equal(reading.value,'50');assert.ok(reading.spans.some(([a,b])=>raw.slice(a,b)==='cincuenta dólares'));assert.ok(reading.spans.every(([a,b])=>!raw.slice(a,b).includes('9552')));});
test('spoken amount has normal conflict evidence rather than falling through an unconstrained current text field',()=>{const r=matchInputs('fifty dollars',[{form:'f',name:'notes',profile:{kind:'text'}},{form:'f',name:'amount',profile:{kind:'amount',marked:true,money:USD}}],{form:'f',name:'notes'});assert.deepEqual(r.hits.map(h=>[h.name,h.value]),[['amount','50']]);});
test('USD never treats pesos as dollars',()=>{for(const text of ['50 pesos','cincuenta pesos','15 pesos con 5']){assert.ok(Number.isNaN(readMoneyAmount(text,USD)));assert.equal(readInputProfile({kind:'amount',marked:true,money:USD},text,false),null);}});
test('numeric dollar/cents behavior remains unchanged',()=>{for(const [input,value] of [['$82.50',82.5],['82 con 50',82.5],['50 cents',.5],['1,234.56',1234.56],['pay 50 with card ending in 9552',50]])assert.equal(readMoneyAmount(input,USD),value);});
console.log(`Spoken money: all checks passed (${checks})`);
