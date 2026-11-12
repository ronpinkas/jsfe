/** A scheduled outage (engine.scheduledOutage, owner 2026-11-11): while a window is open a flow it names never starts and a
 * tool it names is never called; every flow ends and the window's message answers (message_es in Spanish). Outside every
 * window nothing changes, and a malformed outage is refused when assigned. No network calls. */
import assert from 'node:assert/strict';
import {WorkflowEngine, validateScheduledOutage, openOutageWindow} from '../dist/index.js';
const quiet={info(){},debug(){},warn(){},error(){}};
let checks=0;const test=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
const iso=ms=>new Date(Date.now()+ms).toISOString();
const MSG='Our account services are down for scheduled maintenance until 1:00 AM Pacific time.';
const MSG_ES='Nuestros servicios de cuenta están en mantenimiento programado hasta la 1:00 AM, hora del Pacífico.';
const open={windows:[{start:iso(-60000),end:iso(3600000),message:MSG,message_es:MSG_ES}],flows:['pay'],tools:['charge']};
const pay={id:'pay',name:'Pay',version:'1',primary:true,description:'Make a payment',steps:[{id:'charge',type:'CALL-TOOL',tool:'charge',variable:'r'},{id:'done',type:'SAY',value:'PAID'}]};
const card={id:'card',name:'Card',version:'1',primary:true,description:'Pay by card',steps:[{id:'ask',type:'SAY-GET',variable:'n',value:'Card number?',value_es:'¿Número?'},{id:'charge',type:'CALL-TOOL',tool:'charge',variable:'r'},{id:'done',type:'SAY',value:'PAID'}]};
const hours={id:'hours',name:'Hours',version:'1',primary:true,description:'Store hours',steps:[{id:'say',type:'SAY',value:'OPEN 9-9'}]};
const tools=[{id:'charge',name:'Charge',description:'Charge',parameters:{type:'object',properties:{}},implementation:{type:'local',function:'charge',retries:0}}];
function fixture(outage,language='en'){
 const calls=[];
 const engine=new WorkflowEngine(quiet,async()=>'{"flowName":"None"}',[pay,card,hours],tools,{charge:async()=>{calls.push('charge');return {success:true};}},{},false,language);engine.disableCommands();
 if(outage)engine.scheduledOutage=outage;
 let s=engine.initSession('u','outage',language);
 return {engine,calls,get s(){return s;},async start(flow){s=await engine.updateActivity({role:'user',content:'go',start:{flow,arguments:{}}},JSON.parse(JSON.stringify(s)));return s.response;},
  async say(content){s=await engine.updateActivity({role:'user',content},JSON.parse(JSON.stringify(s)));return s.response;}};
}
const flows=s=>(s.flowStacks||[]).flat().map(f=>f.flowName);
await test('a flow the open window names does not start; the message answers and no tool is called',async()=>{
 const t=fixture(open);assert.equal(await t.start('pay'),MSG);assert.deepEqual(t.calls,[]);assert.equal(flows(t.s).length,0);
});
await test('Spanish sessions hear message_es',async()=>{
 const t=fixture(open,'es');assert.equal(await t.start('pay'),MSG_ES);
});
await test('a flow the window does not name runs as before',async()=>{
 const t=fixture(open);assert.equal(await t.start('hours'),'OPEN 9-9');
});
await test('a flow already running when the window opens: its named tool is not called, every flow ends, the message answers',async()=>{
 const t=fixture(null);assert.match(await t.start('card'),/Card number/);
 t.engine.scheduledOutage={...open,flows:[]};
 assert.equal(await t.say('4111'),MSG);assert.deepEqual(t.calls,[]);assert.equal(flows(t.s).length,0);
});
await test('outside every window nothing changes',async()=>{
 const t=fixture({...open,windows:[{start:iso(3600000),end:iso(7200000),message:MSG}]});assert.equal(await t.start('pay'),'PAID');assert.deepEqual(t.calls,['charge']);
 const past=fixture({...open,windows:[{start:iso(-7200000),end:iso(-1000),message:MSG}]});assert.equal(await past.start('pay'),'PAID');
});
await test('a malformed outage is refused when assigned (a time without its offset, an end before its start, no message)',async()=>{
 assert.throws(()=>validateScheduledOutage({...open,windows:[{start:'2026-11-11T22:30:00',end:'2026-11-12T01:00:00-08:00',message:MSG}]}),/offset/);
 assert.throws(()=>validateScheduledOutage({...open,windows:[{start:'2026-11-12T01:00:00-08:00',end:'2026-11-11T22:30:00-08:00',message:MSG}]}),/ends before/);
 assert.throws(()=>validateScheduledOutage({...open,windows:[{start:'2026-11-11T22:30:00-08:00',end:'2026-11-12T01:00:00-08:00',message:' '}]}),/message/);
 const t=fixture(null);assert.throws(()=>{t.engine.scheduledOutage={windows:[]};},/windows/);
});
await test('window bounds: open at start, closed at end',async()=>{
 const o=validateScheduledOutage({windows:[{start:'2026-11-11T22:30:00-08:00',end:'2026-11-12T01:00:00-08:00',message:MSG}],flows:[],tools:[]});
 assert.ok(openOutageWindow(o,Date.parse('2026-11-12T06:30:00Z')));assert.equal(openOutageWindow(o,Date.parse('2026-11-12T09:00:00Z')),null);assert.equal(openOutageWindow(o,Date.parse('2026-11-12T06:29:59Z')),null);
});
console.log(`scheduled outage: all ${checks} checks passed`);
