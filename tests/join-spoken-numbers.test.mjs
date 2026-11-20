/** The one number finder (owner 2026-11-19): a value is only a complete number, as said, or a qualified restart. findNumbers
 * finds; assignNumbers applies the caller's tests, one value per kind, ambiguity asked. */
import assert from 'node:assert/strict';
import {findNumbers, assignNumbers, joinSpokenNumbers} from '../dist/helpers/numbers.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
import {FIELD_PRESETS} from '../dist/forms/flows.js';
let checks=0;const eq=(a,b,why)=>{assert.deepEqual(a,b,why);checks++;};
const values=(s)=>findNumbers(s).map((n)=>n.value);

// Complete numbers, as said.
eq(values('323 5713211'),['3235713211'],'a phone typed with a space (prod 11-17): one number, never a 7-digit account');
eq(values('323-571-3211'),['3235713211'],'dashes');
eq(values('mi cuenta es 56, 0 8 17 58.'),['56081758'],'pauses after short groups');
eq(values('92610, 56035214'),['92610','56035214'],'a comma after a longer number separates two numbers');
eq(values('07131964 y 6119'),['07131964','6119'],'a word separates two numbers');
eq(values('5603 y 5214'),['5603','5214'],'never joined across a word');
eq(values('6 11 1987\n56235163'),['6111987','56235163'],'a line break separates two numbers (prod WhatsApp 10-18)');
// Number words.
eq(values('one thousand and 3'),['1003'],'a digit completes a scale word');
eq(values('mil 3'),['1003'],'Spanish too');
eq(values('two hundred fifty'),['250'],'a cardinal');
eq(values('cinco cinco cinco 1212'),['5551212'],'digits said as words join the run');
eq(values('una cuenta y a payment'),[],'an article alone is not a number');
eq(values('the one ending in 4532'),['1','4532'],'a word separates them; a lone "one" may be the digit 1 on a call (owner 2026-11-19), the caller decides');
// Restarts.
eq(findNumbers('seguro social 6119 6119')[0].restarts,['6119'],'the same number said twice');
eq(findNumbers('04 13 1955 04 13 1955')[0].restarts,['04131955'],'a date said twice');
eq(findNumbers('323 571 3211 3211')[0].restarts,['3235713211'],'the last part said again');
eq(findNumbers('5 6 0 3 3')[0].restarts,[],'one repeated digit is no restart');
eq(findNumbers('57. 57, 21, 80.')[0].restarts,['572180'],'a false start at a marked pause (the OTP rule)');
eq(findNumbers('57 572180')[0].restarts,[],'no marked pause: no false start');
eq(findNumbers('12 12')[0].restarts,[],'short groups are no restart');
eq(assignNumbers(findNumbers('323 571 3211 3211'),{phone:(v)=>/^[2-9]\d{9}$/.test(v)}).values,{phone:'3235713211'},'an echoed last part: the number once');
eq(assignNumbers(findNumbers('56035214, digo, 56035214'),{account:(v)=>/^5\d{7}$/.test(v)}).values,{account:'56035214'},'the same number twice across a word: one value');
eq(joinSpokenNumbers('seguro social 6119 6119'),'seguro social 6119','joined text takes the restart');
eq(joinSpokenNumbers('seguro social 6119 6119',{restarts:false}),'seguro social 61196119','or the whole number');
// The caller's tests decide.
const kinds={account:(v)=>/^5\d{6,7}$/.test(v),ssn:(v)=>v.length===4};
eq(assignNumbers(findNumbers('6119 6119'),kinds).values,{ssn:'6119'},'a restart whose whole number fits nothing');
eq(assignNumbers(findNumbers('5603 5603'),kinds),{values:{},ambiguous:['account','ssn'],unread:[]},'longer match too: ambiguous');
eq(assignNumbers(findNumbers('120 not 124'),{amount:(v)=>v.length===3}).ambiguous,['amount'],'two values for one kind: asked, never the last');
eq(assignNumbers(findNumbers('323 5713211'),kinds).values,{},'a phone fits no kind: nothing taken');
eq(assignNumbers(findNumbers('56035214, 6119'),kinds).values,{account:'56035214',ssn:'6119'},'one per kind, several kinds');
eq(assignNumbers(findNumbers('6119'),{ssn:(v)=>v.length===4&&'ssn-'+v}).values,{ssn:'ssn-6119'},'a test may normalize');
// Spanish "y" inside a number (owner 2026-11-19; prod 11-19 17:10 "9 y 5, 55, 31" verified as 955531).
eq(values('9 y 5, 55, 31'),['955531'],'two single digits join across y');
eq(values('68, 92, 40 y 3'),['689243'],'tens and a digit add up: cuarenta y tres');
eq(values('1382 y 5603'),['1382','5603'],'y between longer groups separates');
eq(values('15 y 3'),['15','3'],'a teen and a digit stay two numbers');
eq(values('1 2 3 4 y 0 5 1 2 1 9 8 0'),['1234','05121980'],'y after a number said digit by digit separates two numbers');
eq(values('90 y... 97, 26 7 6'),['90','972676'],'a pause after y is a restart, not a join');
eq(values('mil y 3'),['1003'],'a scale word still takes its digit');
eq(findNumbers('código 40 y 3').map(({said})=>said),['40 y 3'],'the span covers the whole spoken number');
// Spans index the answer exactly, words included.
eq(findNumbers('order five 1').map(({said,start,end})=>[said,start,end]),[['five 1',6,12]],'a word number begins at its word');
eq(findNumbers('nine one three zero three').map(({said,start,end})=>[said,start,end]),[['nine one three zero three',0,25]],'digit words: the whole span');
eq(joinSpokenNumbers('I have two hundred 5 here'),'I have 205 here','joined text replaces exactly the number');
// A lone "one" is found as 1 (on a call it may be the digit); a caller reading positions decides what it means.
eq(findNumbers('the second one').map(({value,start,end})=>[value,start,end]),[['1',11,14]],'a lone "one": the digit, spanning the word');
eq(findNumbers('one two three').map((n)=>n.value),['123'],'"one" among number words is a digit');
// Specs: known kinds and described custom kinds, no code (owner 2026-11-20).
const id=[{name:'dob',kind:'date',past:true},{name:'ssn',kind:'ssn_last4'},{name:'account',kind:'pattern',regex:'^5\\d{6,7}$'}];
const many={multiple:true};
eq(findNumbers('07 10 1972 9238')[0].groups,['07','10','1972','9238'],'groups as the caller separated them');
eq(assignNumbers(findNumbers('07101972'),id).values,{dob:'1972-07-10'},'a date: its value is YYYY-MM-DD');
eq(assignNumbers(findNumbers('17101981'),id).values,{dob:'1981-10-17'},'day first only when it cannot be month first');
eq(assignNumbers(findNumbers('071072'),id).values,{dob:'1972-07-10'},'a two-digit year in the past');
eq(assignNumbers(findNumbers('11220005'),id).values,{},'a four-digit year as typed: 0005 is no year');
eq(assignNumbers(findNumbers('13452000'),id).values,{},'no 13th month, no 45th day');
eq(assignNumbers(findNumbers('56035214'),id).values,{account:'56035214'},'a custom pattern');
eq(assignNumbers(findNumbers('07 10 1972 9238'),id).values,{},'without multiple: one number, one spec, nothing taken');
eq(assignNumbers(findNumbers('07 10 1972 9238'),id,many),{values:{dob:'1972-07-10',ssn:'9238'},ambiguous:[],unread:[]},'multiple: a date then the last four, the only reading');
eq(assignNumbers(findNumbers('07 10 1972 9238'),id,{split:true}).values,{dob:'1972-07-10',ssn:'9238'},'split: true, the 1.83.0 name, still works');
eq(assignNumbers(findNumbers('9238 07 10 1972'),id,many).values,{ssn:'9238',dob:'1972-07-10'},'either order');
eq(assignNumbers(findNumbers('07101972 9238'),id,many).values,{dob:'1972-07-10',ssn:'9238'},'a date typed as one group');
eq(assignNumbers(findNumbers('17 10 1981 9238'),id,many).values,{dob:'1981-10-17',ssn:'9238'},'a day-first date in parts');
eq(assignNumbers(findNumbers('56035214 9238'),id,many).values,{account:'56035214',ssn:'9238'},'two numbers, two specs');
eq(assignNumbers(findNumbers('323 5713211'),id,many).values,{},'a phone: 323 is no value, never a piece taken (prod 11-17)');
eq(assignNumbers(findNumbers('1 12 2000 5'),id,many).values,{},'a stray digit fits nothing: every digit must be consumed');
eq(assignNumbers(findNumbers('1972 9238'),id,many).values,{},'two last-fours: one spec cannot take both');
eq(assignNumbers(findNumbers('5603 5214'),id,many).values,{account:'56035214'},'a whole number that fits is never cut');
eq(assignNumbers(findNumbers('1234 5678'),[{name:'a',kind:'digits',min:4},{name:'b',kind:'digits',min:4}],many).ambiguous,['a','b'],'two readings: ambiguous, asked');
eq(assignNumbers(findNumbers('7 10 1972 9238'),id,many).values,{},'a part no spec reads (a 7-digit date): nothing taken');
eq(assignNumbers(findNumbers('1 2 3 4 5 6 7 8 9 0 1 2 3'),[{name:'d',kind:'digits',min:1}],many).values,{},'a run of more than 12 groups is never cut');
// Card kinds: the card's own checks separate what lengths cannot.
const card=[{name:'number',kind:'card_number'},{name:'exp',kind:'card_expiration'},{name:'cvv',kind:'card_cvv'},{name:'zip',kind:'card_zip'}];
eq(assignNumbers(findNumbers('4111 1111 1111 1111 123'),card,many).values,{number:'4111111111111111',cvv:'123'},'a card, then its security code (Luhn)');
eq(assignNumbers(findNumbers('4111 1111 1111 1111 0930 123 92610'),card,many).values,{number:'4111111111111111',exp:'0930',cvv:'123',zip:'92610'},'the whole card in one line');
eq(assignNumbers(findNumbers('4111 1111 1111 1112'),card,many).values,{},'a number failing Luhn is no card');
eq(assignNumbers(findNumbers('1320'),[{name:'exp',kind:'card_expiration'}]).values,{},'no 13th month');
// A spec declared wrong fails where it is declared.
const throws=(f,rx,why)=>{assert.throws(f,rx,why);checks++;};
throws(()=>assignNumbers([],[{name:'x',kind:'amount'}]),/kind "amount"/,'amount is the money reader\'s, not a kind here');
throws(()=>assignNumbers([],[{name:'x',kind:'pattern'}]),/without its regex/,'a pattern needs its regex');
throws(()=>assignNumbers([],[{name:'x',kind:'digits'}]),/without min/,'digits needs min');
throws(()=>assignNumbers([],[{name:'x',kind:'zip'},{name:'x',kind:'zip'}]),/repeated/,'names are unique');
// The preset lengths are FIELD_PRESETS' (a fact stated twice is pinned).
for (const [kind,[min,max]] of Object.entries({zip:[5,5],card_zip:[5,5],ssn_last4:[4,4],account_number:[6,12],phone:[10,11],card_cvv:[3,4],card_number:[13,19]})) {
   eq([FIELD_PRESETS[kind].digits.min,FIELD_PRESETS[kind].digits.max],[min,max],`${kind}: the preset's own lengths`);
}
eq(assignNumbers(findNumbers('92610'),[{name:'z',kind:'zip'}]).values,{z:'92610'},'a preset kind reads its length');
eq(['findNumbers','assignNumbers','joinSpokenNumbers','addressDraft'].every((f)=>typeof STANDARD_FUNCTIONS[f]==='function'),true,'offered to flows');
console.log(`numbers: ${checks} checks passed`);
