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
console.log(`Reply rank: all checks passed (${checks})`);
