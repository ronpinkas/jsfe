/** jsfe/host reply-rank: both executors' instructions from one set of criteria, and their decoders. No network. */
import assert from 'node:assert/strict';
import {buildReplyRank,decodeReplyRankLlm,decodeReplyRankSystemOne,isReplyRankRequest,REPLY_OPTIONS,REPLY_DEFAULT} from '../dist/host/index.js';
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
const conversation=[{role:'user',content:'cancel my service'},{role:'assistant',content:'Why do you want to cancel?'}];
const r=buildReplyRank('I picked the wrong item.',conversation,'Current question: Why do you want to cancel? Requested answer: the reason.');
test('the request carries the question, the input and three options for both executors',()=>{
 assert.equal(r.task,'rank_reply');assert.deepEqual(r.options,['answers','abort','new_request','irrelevant']);assert.deepEqual([...REPLY_OPTIONS],r.options);assert.equal(REPLY_DEFAULT,'answers');
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
const answers=(a,b,c,d=.1)=>({r0:{noul:a},r1:{noul:b},r2:{noul:c},r3:{noul:d}});
test('System One: the highest option that clears 0.5 wins',()=>{
 assert.deepEqual(decodeReplyRankSystemOne(answers(.2,.1,.9),r),{option:'new_request',scores:{answers:.2,abort:.1,new_request:.9,irrelevant:.1},fallback:false});
 assert.equal(decodeReplyRankSystemOne(answers(.6,.7,.1),r).option,'abort');
});
test('System One: nothing clears the cut is an answer (the default)',()=>{const d=decodeReplyRankSystemOne(answers(.3,.2,.4),r);assert.equal(d.option,'answers');assert.equal(d.fallback,true);});
test('System One: an unanswered question fails the call',()=>{assert.throws(()=>decodeReplyRankSystemOne({r0:{noul:.9},r1:{noul:.1}},r),/r2 unanswered/);});
const c=buildReplyRank('the bottom one',conversation,'Current question: Which account?',[{key:'1',label:'First account'},{key:'2',label:'Second account'}]);
test('declared choices are options before the fixed three, with their own criteria in both executors',()=>{
 assert.deepEqual(c.options,['choice:1','choice:2','answers','abort','new_request','irrelevant']);assert.deepEqual(c.llm.schema.properties.option.enum,c.options);assert.deepEqual(c.choices,[{key:'1',label:'First account'},{key:'2',label:'Second account'}]);
 assert.match(c.llm.system,/- choice:2: The latest message picks the option "Second account"/);assert.match(c.llm.system,/- answers: The latest message responds to the current question but picks none of the offered options\./);
 for(const q of c.systemOne.index)assert.ok(c.llm.system.includes(`- ${q.option}: ${c.systemOne.questions[q.id].criteria.true}`));
 assert.deepEqual(decodeReplyRankLlm('{"option":"choice:2"}',c),{option:'choice:2'});assert.throws(()=>decodeReplyRankLlm('{"option":"choice:3"}',c),/not an offered option/);
 // with choices, System One is not asked `answers` ("picks none of them"): it is what is left when nothing clears its cut
 assert.deepEqual(c.systemOne.index.map(q=>q.option),['choice:1','choice:2','abort','new_request','irrelevant']);
 assert.deepEqual(r.systemOne.index.map(q=>q.option),['answers','abort','new_request','irrelevant'],'an open question still asks it');
 const jev=(c1,c2,abort,nr,opts)=>decodeReplyRankSystemOne({r0:{noul:c1},r1:{noul:c2},r2:{noul:abort},r3:{noul:nr},r4:{noul:.05}},c,opts);
 assert.equal(jev(.2,.65,.1,.47).option,'choice:2','a choice that clears the cut is taken');
 assert.deepEqual([jev(.2,.45,.1,.3).option,jev(.2,.45,.1,.3).fallback],['answers',true],'nothing clears: asked again');
 assert.equal(jev(.1,.6,.9,.1).option,'abort','the highest cleared option wins');
 assert.equal(jev(.1,.88,.02,.93).option,'choice:2','a cleared choice is taken over a higher new_request ("Representative." at a menu is the agent)');
 assert.equal(jev(.1,.3,.02,.93).option,'new_request','new_request wins when no choice clears');
 assert.equal(jev(.2,.63,.1,.1,{cuts:{'choice:2':.7}}).option,'answers','an option below its own cut is not taken');
 assert.equal(jev(.2,.71,.1,.1,{cuts:{'choice:2':.7}}).option,'choice:2','and above it is');
 assert.equal(r.choices,undefined,'no choices, no field');
 // the measured cuts: a NO and a new request must each clear more than the threshold
 const yn=buildReplyRank('imposible',conversation,'Current question: Shall I file it?',[{key:'no',label:'no'},{key:'__agent',label:'a live agent'}]);
 const ynj=(no,agent,abort,nr)=>decodeReplyRankSystemOne({r0:{noul:no},r1:{noul:agent},r2:{noul:abort},r3:{noul:nr},r4:{noul:.05}},yn);
 assert.deepEqual([ynj(.57,.05,.1,.1).option,ynj(.57,.05,.1,.1).fallback],['answers',true],'"imposible" at NO 0.57: asked again');
 assert.equal(ynj(.67,.05,.1,.1).option,'choice:no','"No me interesa" at NO 0.67: a NO');
 assert.equal(ynj(.15,.05,.1,.53).option,'answers','a new request at 0.53 is asked again');
 assert.equal(ynj(.15,.05,.1,.61).option,'new_request','and at 0.61 it is a new request');
 // an escape is not the question's own choice: offering only `__agent` leaves it an open question, `answers` still asked
 const open=buildReplyRank('chino',conversation,'Current question: Say the product number to check nearby stores.',[{key:'__agent',label:'a live agent'}]);
 assert.deepEqual(open.systemOne.index.map(q=>q.option),['choice:__agent','answers','abort','new_request','irrelevant']);
});
test('irrelevant: its own cut, and it takes a choice only from the higher one',()=>{
 const open=(ans,ab,nr,irr)=>decodeReplyRankSystemOne({r0:{noul:ans},r1:{noul:ab},r2:{noul:nr},r3:{noul:irr}},r).option;
 assert.equal(open(.2,.1,.1,.71),'irrelevant','a stray word');assert.equal(open(.3,.1,.1,.69),'answers','below its cut the default stands');
 assert.equal(open(.9,.1,.1,.75),'answers','an answer rated higher stays an answer');assert.equal(open(.1,.1,.8,.75),'new_request','a request rated higher stays a request');
 const pick=(ch,irr)=>decodeReplyRankSystemOne({r0:{noul:ch},r1:{noul:.1},r2:{noul:.1},r3:{noul:.1},r4:{noul:irr}},c).option;
 assert.equal(pick(.7,.78),'choice:1','below 0.8 a cleared choice stands ("Operator.")');assert.equal(pick(.7,.86),'irrelevant','from 0.8 a stray word is not a pick ("You.")');
 assert.equal(pick(.9,.85),'choice:1','a choice rated higher stands');
});
test('a cleared new_request outranks irrelevant, on an open question and never over a cleared choice',()=>{
 const r=buildReplyRank('x',conversation,'Q?');const noul=v=>Object.fromEntries(r.systemOne.index.map(q=>[q.id,{noul:v[q.option]??.05}]));
 assert.equal(decodeReplyRankSystemOne(noul({irrelevant:.85,new_request:.72}),r).option,'new_request');
 assert.equal(decodeReplyRankSystemOne(noul({irrelevant:.85,new_request:.59}),r).option,'irrelevant');
 const c=buildReplyRank('x',conversation,'Q?',[{key:'1',label:'one'}]);const n=v=>Object.fromEntries(c.systemOne.index.map(q=>[q.id,{noul:v[q.option]??.05}]));
 assert.equal(decodeReplyRankSystemOne(n({'choice:1':.7,irrelevant:.86,new_request:.7}),c).option,'irrelevant','a stray word is still not a pick');
});
test('a reason question offers no irrelevant: a reason is never thrown away',()=>{assert.ok(!buildReplyRank('x',conversation,'Why?',[],{reasonFor:'the club'}).options.includes('irrelevant'));});
test('a refusal that names another offered choice is that choice; a plain NO stays the NO',()=>{
 const k=buildReplyRank('no era membresía, es monitor',conversation,'Current question: Cancel your Club membership? YES or NO.',[{key:'yes',label:'YES'},{key:'no',label:'NO'},{key:'mcm',label:'Credit Monitor'},{key:'__agent',label:'a person'}]);
 const idx=Object.fromEntries(k.systemOne.index.map(q=>[q.option,q.id]));
 const jev=(sc)=>decodeReplyRankSystemOne(Object.fromEntries(k.systemOne.index.map(q=>[q.id,{noul:sc[q.option] ?? .05}])),k);
 assert.equal(jev({'choice:no':.94,'choice:mcm':.57,new_request:.39}).option,'choice:mcm','the named service, not the NO (prod CAc00caf)');
 assert.equal(jev({'choice:no':.94,'choice:mcm':.3}).option,'choice:no','a service below its cut leaves the NO');
 assert.equal(jev({'choice:no':.94,'choice:__agent':.7}).option,'choice:no','an escape never takes the NO');
 assert.equal(jev({'choice:no':.7,'choice:yes':.55}).option,'choice:no','YES never takes the NO');
 assert.ok(idx['choice:mcm']);
});
console.log(`Reply rank: all checks passed (${checks})`);
