/** jsfe/host reply-rank: both executors' instructions from one set of criteria, and their decoders. No network. */
import assert from 'node:assert/strict';
import {buildReplyRank,decodeReplyRankLlm,decodeReplyRankSystemOne,isReplyRankRequest,REPLY_OPTIONS,REPLY_DEFAULT} from '../dist/host/index.js';
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
const conversation=[{role:'user',content:'cancel my service'},{role:'assistant',content:'Why do you want to cancel?'}];
const r=buildReplyRank('I picked the wrong item.',conversation,'Current question: Why do you want to cancel? Requested answer: the reason.');
test('the request carries the question, the input and three options for both executors',()=>{
 assert.equal(r.task,'rank_reply');assert.deepEqual(r.options,['answers','abort','new_request']);assert.deepEqual([...REPLY_OPTIONS],r.options);assert.equal(REPLY_DEFAULT,'answers');
 assert.match(r.llm.system,/<current-question>\nCurrent question: Why do you want to cancel\?/);assert.match(r.llm.user,/<latest-message>\nI picked the wrong item\.\n<\/latest-message>/);assert.match(r.llm.user,/assistant: Why do you want to cancel\?/);
 assert.deepEqual(r.llm.schema.properties.option.enum,r.options);
 assert.equal(r.systemOne.state.latest_message,'I picked the wrong item.');assert.match(r.systemOne.state.assistant_instructions,/Why do you want to cancel/);assert.deepEqual(r.systemOne.state.conversation,conversation);
 assert.deepEqual(r.systemOne.index.map(q=>q.option),r.options);for(const q of r.systemOne.index){assert.equal(r.systemOne.questions[q.id].type,'noul');assert.ok(r.systemOne.questions[q.id].criteria.true);assert.ok(r.systemOne.questions[q.id].criteria.false);}
 assert.ok(isReplyRankRequest(r));assert.ok(!isReplyRankRequest({task:'detect_flow'}));assert.ok(!isReplyRankRequest(null));
});
test('the LLM criteria and the System One criteria are the same words',()=>{for(const q of r.systemOne.index)assert.ok(r.llm.system.includes(`- ${q.option}: ${r.systemOne.questions[q.id].criteria.true}`));});
test('the LLM decoder accepts an offered option and rejects anything else',()=>{
 assert.deepEqual(decodeReplyRankLlm('{"option":"abort"}',r),{option:'abort'});assert.deepEqual(decodeReplyRankLlm('```json\n{"option":" New_Request "}\n```',r),{option:'new_request'});
 assert.throws(()=>decodeReplyRankLlm('{"option":"ContinueCurrent"}',r),/not an offered option/);assert.throws(()=>decodeReplyRankLlm('no',r),/not JSON/);
});
const answers=(a,b,c)=>({r0:{noul:a},r1:{noul:b},r2:{noul:c}});
test('System One: the highest option that clears 0.5 wins',()=>{
 assert.deepEqual(decodeReplyRankSystemOne(answers(.2,.1,.9),r),{option:'new_request',scores:{answers:.2,abort:.1,new_request:.9},fallback:false});
 assert.equal(decodeReplyRankSystemOne(answers(.6,.7,.1),r).option,'abort');
});
test('System One: nothing clears the cut is an answer (the default)',()=>{const d=decodeReplyRankSystemOne(answers(.3,.2,.4),r);assert.equal(d.option,'answers');assert.equal(d.fallback,true);});
test('System One: an unanswered question fails the call',()=>{assert.throws(()=>decodeReplyRankSystemOne({r0:{noul:.9},r1:{noul:.1}},r),/r2 unanswered/);});
const c=buildReplyRank('the bottom one',conversation,'Current question: Which account?',[{key:'1',label:'First account'},{key:'2',label:'Second account'}]);
test('declared choices are options before the fixed three, with their own criteria in both executors',()=>{
 assert.deepEqual(c.options,['choice:1','choice:2','answers','abort','new_request']);assert.deepEqual(c.llm.schema.properties.option.enum,c.options);assert.deepEqual(c.choices,[{key:'1',label:'First account'},{key:'2',label:'Second account'}]);
 assert.match(c.llm.system,/- choice:2: The latest message picks the option "Second account"/);assert.match(c.llm.system,/- answers: The latest message responds to the current question but picks none of the offered options\./);
 for(const q of c.systemOne.index)assert.ok(c.llm.system.includes(`- ${q.option}: ${c.systemOne.questions[q.id].criteria.true}`));
 assert.deepEqual(decodeReplyRankLlm('{"option":"choice:2"}',c),{option:'choice:2'});assert.throws(()=>decodeReplyRankLlm('{"option":"choice:3"}',c),/not an offered option/);
 assert.equal(decodeReplyRankSystemOne({r0:{noul:.2},r1:{noul:.8},r2:{noul:.3},r3:{noul:.1},r4:{noul:.1}},c).option,'choice:2');
 assert.equal(r.choices,undefined,'no choices, no field');
});
console.log(`Reply rank: all checks passed (${checks})`);
