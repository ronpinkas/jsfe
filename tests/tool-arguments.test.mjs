/** Shared absent/null argument bags and declared defaults; real local/HTTP execution, no models. */
import assert from 'node:assert/strict';
import http from 'node:http';
import {WorkflowEngine} from '../dist/index.js';
let checks=0;const eq=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const local=(id,parameters,extra={})=>({id,name:id,description:'Hermetic argument contract',parameters,implementation:{type:'local',function:id,retries:0,timeout:1000},...extra});
async function run({previous,target,implementation,args}){
 const calls=[],warnings=[];
 const preceding=local('preceding',{type:'object',properties:{},additionalProperties:true});
 const flow={id:'probe',name:'Probe',version:'1.0.0',description:'Argument contract probe',steps:[{id:'preceding',type:'CALL-TOOL',tool:'preceding',variable:'first',args:{seed:true}},{id:'target',type:'CALL-TOOL',tool:target.id,variable:'result',...(args===undefined?{}:{args}),onFail:{id:'failed',type:'SAY',value:'REJECTED'}},{id:'done',type:'SAY',value:'FINISHED'}]};
 const engine=new WorkflowEngine({debug(){},info(){},warn(...values){warnings.push(values.join(' '));},error(...values){warnings.push(values.join(' '));}},null,[flow],[preceding,target],{preceding:()=>previous,[target.id]:function(first,...rest){const values=Array.from(arguments);calls.push(values);return implementation?implementation(...values):'ok';}},{});
 const session=await engine.updateActivity({role:'user',content:'probe',start:{flow:'probe'}},engine.initSession('test','test','en'));
 return {calls,warnings,session};
}
const flat={flag:{type:'boolean',default:false},labels:{type:'array',default:['initial']},optional:{type:'string'}};
for(const previous of [null,undefined]){
 const f=await run({previous,target:local('flat',flat,{required:[],additionalProperties:false})});
 eq(f.calls,previous===null?[[false,['initial'],undefined]]:[[undefined,undefined,undefined]],'only an actual absent bag supplies defaults; undefined inference retains supplied-object semantics');
 eq(f.warnings.some(x=>/Cannot read properties/.test(x)),false,'no null property dereference');
 eq(String(f.session.response).includes('FINISHED'),true,'flow completes through local adapter');
}
{
 const original={};const target=local('flat',flat,{required:[],additionalProperties:false});
 const f=await run({previous:null,target,implementation:(flag,labels)=>{labels.push('changed');return null;}});
 eq(f.calls[0][1],['initial','changed'],'adapter owns mutable default copy');eq(flat.labels.default,['initial'],'authored default remains unchanged');const empty=await run({previous:original,target});eq(empty.calls,[[undefined,undefined,undefined]],'supplied empty positional bag retains missing values without injecting defaults');eq(original,{},'preceding tool result not mutated');
 const g=await run({previous:{flag:true,labels:[]},target});eq(g.calls,[[true,[],undefined]],'explicit falsey/empty values retained, not overwritten');
 const h=await run({previous:{flag:false},target});eq(h.calls[0][0],false,'explicit false survives');
}
const objectSchema={type:'object',properties:{flag:{type:'boolean',default:false},config:{type:'object',default:{levels:[1]}},optional:{type:'string'},nullable:{type:['string','null'],default:'fallback'}},additionalProperties:false};
{
 const original={nullable:null};const f=await run({previous:original,target:local('object',objectSchema)});
 eq(f.calls,[[{nullable:null}]],'supplied typed object retains only its explicit nullable property without injected defaults');eq(original,{nullable:null},'object input unchanged');
 const g=await run({previous:null,target:local('object',objectSchema)});eq(g.calls[0][0].nullable,'fallback','newly normalized null bag gets declared default');g.calls[0][0].config.levels.push(9);eq(objectSchema.properties.config.default,{levels:[1]},'nested null-bag default is isolated from adapter mutation');
 const h=await run({previous:null,target:local('object',objectSchema)});eq(h.calls[0][0].config,{levels:[1]},'later null-bag invocation receives fresh nested default');
}
for(const previous of [[],[1]]){
 const f=await run({previous,target:local('flat',flat)});eq(f.calls.length,0,'root array never reaches positional adapter');eq(f.warnings.some(x=>/Tool arguments must be an object/.test(x)),true,'root shape rejected as arguments, not an incidental TypeError');
}
{
 const f=await run({target:local('flat',flat),args:'malformed'});eq(f.calls.length,0,'explicit primitive argument bag never reaches adapter');eq(f.warnings.some(x=>/Tool arguments must be an object/.test(x)),true,'primitive bag rejected explicitly');
 const schema={type:'object',properties:{account:{type:'string'},amount:{type:'number'}},required:['account','amount'],additionalProperties:false};
 for(const previous of [null,{account:'test',amount:'15'}]){
  const f=await run({previous,target:local('typed',schema)});eq(f.calls.length,0,'required/type validation still precedes adapter invocation');eq(f.warnings.some(x=>/Tool argument validation failed/.test(x)),true,'typed rejection preserved');
 }
 const f2=await run({previous:{account:'test',amount:0},target:local('typed',schema)});eq(f2.calls,[[{account:'test',amount:0}]],'valid zero remains a supplied numeric value');
}
{
 const array=local('array',{type:'array',items:{type:'integer'}});
 const f=await run({previous:[1,2],target:array});eq(f.calls,[[[1,2]]],'explicit array-root schema retains valid prebuilt arrays');
 const invalid=await run({previous:[1,'wrong'],target:array});eq(invalid.calls.length,0,'array item validation still enforced');
 const text=local('text',{type:'string',minLength:3});const g=await run({target:text,args:'hello'});eq(g.calls,[['hello']],'explicit string-root schema retains valid strings');
 const short=await run({target:text,args:'no'});eq(short.calls.length,0,'string-root schema validation still enforced');
 const nullable=local('nullable',{type:['string','null']});const h=await run({previous:null,target:nullable});eq(h.calls,[[null]],'explicit nullable non-object root retains null rather than inventing an argument bag');
}
{
 // The existing `schema` alias invokes one-argument locals with their root value. Its validation
 // policy remains unchanged; this test proves the bag fix does not newly reject that value.
 const target={id:'alias',name:'Alias',schema:{oneOf:[{type:'string'},{type:'null'}]},implementation:{type:'local',function:'alias',retries:0}};
 const f=await run({target,args:'hello'});eq(f.calls,[['hello']],'typeless schema-alias primitive delivery preserved');
 const g=await run({previous:null,target});eq(g.calls,[[null]],'typeless nullable schema-alias root preserved');
}
const requests=[];
const server=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{requests.push(body?JSON.parse(body):null);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({success:true}));});});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const target={id:'http',name:'Http',parameters:{type:'object',properties:{flag:{type:'boolean',default:false},config:{type:'object',default:{levels:[1]}}},additionalProperties:false},implementation:{type:'http',url:`http://127.0.0.1:${server.address().port}/`,method:'POST',contentType:'application/json',retries:0,timeout:1000}};
 const f=await run({previous:null,target});eq(requests,[{flag:false,config:{levels:[1]}}],'HTTP receives only declared default argument values');eq(f.warnings.length,0,'optional HTTP defaults do not produce validation warnings');
 const g=await run({previous:{flag:'wrong'},target});eq(requests.length,1,'typed invalid HTTP arguments are blocked before network');eq(g.warnings.some(x=>/Tool argument validation failed/.test(x)),true,'HTTP type validation preserved');
 const required={...target,parameters:{type:'object',properties:{account:{type:'string'}},required:['account'],additionalProperties:false}};
 await run({previous:undefined,target:required});eq(requests.length,1,'undefined input never invents required HTTP arguments');
 // Typeless combinators work for HTTP array bodies in the existing transport. Local tools'
 // `parameters` dispatch still treats typeless schemas as positional field maps; this fix does
 // not claim to implement a new calling convention for those already ambiguous declarations.
 for(const keyword of ['oneOf','anyOf']){
  const schema={[keyword]:[{type:'array',items:{type:'integer'}},{type:'null'}]};
  await run({previous:[1,2],target:{...target,parameters:schema}});
  eq(requests.at(-1),[1,2],keyword+' preserves supported typeless array root');
  const count=requests.length;await run({previous:[1,'wrong'],target:{...target,parameters:schema}});
  eq(requests.length,count,keyword+' still validates its array items before transport');
 }
 for(const schema of [{enum:[[1,2]]},{const:[1,2]}]){
  await run({previous:[1,2],target:{...target,parameters:schema}});eq(requests.at(-1),[1,2],'typeless enum/const root array retained');
  const count=requests.length;await run({previous:[2],target:{...target,parameters:schema}});eq(requests.length,count,'typeless enum/const validation unchanged');
 }
 const nullable={...target,parameters:{type:['object','null'],properties:{flag:{type:'boolean',default:false}},additionalProperties:false}};
 await run({previous:{},target:nullable});eq(requests.at(-1),null,'supplied empty nullable object retains the existing empty HTTP body without injected defaults');
 const cancellation={...target,parameters:{type:'object',properties:{service:{type:'string'},account_number:{type:'string'},club_id:{type:'string',default:''}},required:['service','account_number'],additionalProperties:false}};
 await run({previous:{},args:{service:'club',account_number:'fixture-account'},target:cancellation});eq(requests.at(-1),{service:'club',account_number:'fixture-account'},'supplied cancellation payload never gains an omitted default club id');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
console.log(`Tool arguments: all ${checks} checks passed`);
