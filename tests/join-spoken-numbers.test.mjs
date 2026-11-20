/** The one number finder (owner 2026-11-19): a value is only a complete number, as said, or a qualified restart. findNumbers
 * finds; assignNumbers applies the caller's tests, one value per kind, ambiguity asked. */
import assert from 'node:assert/strict';
import {findNumbers, assignNumbers, joinSpokenNumbers} from '../dist/helpers/numbers.js';
import {STANDARD_FUNCTIONS} from '../dist/helpers/index.js';
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
// Spans index the answer exactly, words included.
eq(findNumbers('order five 1').map(({said,start,end})=>[said,start,end]),[['five 1',6,12]],'a word number begins at its word');
eq(findNumbers('nine one three zero three').map(({said,start,end})=>[said,start,end]),[['nine one three zero three',0,25]],'digit words: the whole span');
eq(joinSpokenNumbers('I have two hundred 5 here'),'I have 205 here','joined text replaces exactly the number');
// A lone "one" is found as 1 (on a call it may be the digit); a caller reading positions decides what it means.
eq(findNumbers('the second one').map(({value,start,end})=>[value,start,end]),[['1',11,14]],'a lone "one": the digit, spanning the word');
eq(findNumbers('one two three').map((n)=>n.value),['123'],'"one" among number words is a digit');
eq(['findNumbers','assignNumbers','joinSpokenNumbers','addressDraft'].every((f)=>typeof STANDARD_FUNCTIONS[f]==='function'),true,'offered to flows');
console.log(`numbers: ${checks} checks passed`);
