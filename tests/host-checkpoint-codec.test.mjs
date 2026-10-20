import assert from 'node:assert/strict';
import {encodeCheckpoint,decodeCheckpoint,CheckpointCodecError} from '../src/host/node.js';
let count=0;const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name);};
const rejects=(promise,code)=>assert.rejects(promise,error=>error instanceof CheckpointCodecError&&error.code===code);
await test('versioned binary JSON roundtrip preserves Unicode, arrays, null and numeric values',async()=>{
 const value={sessionId:'s',cargo:{name:'León 東京',valid:false,empty:null,list:[1,2.5,'']},flowStacks:[[]]};const encoded=await encodeCheckpoint(value);
 assert.ok(encoded.data instanceof Uint8Array);assert.equal(encoded.version,1);assert.equal(encoded.encoding,'br');assert.deepEqual(await decodeCheckpoint(encoded),value);
});
await test('a 663-KiB engine-shaped checkpoint roundtrips with its complete history and owned forms',async()=>{
 const history='Customer: Please help me with the requested service. '.repeat(700).slice(0,32768);
 const value={sessionId:'session',userId:'user',cargo:{chatHistory:history,forms:{case:{values:{detail:history},proposal:{request:{description:history}}}}},flowStacks:Array.from({length:18},(_,i)=>[{flowId:'case-'+i,variables:{request:{description:history}},flowStepsStack:[]}])};
 assert.ok(JSON.stringify(value).length>663000);const encoded=await encodeCheckpoint(value);assert.ok(encoded.data.byteLength<350*1024);assert.deepEqual(await decodeCheckpoint(encoded),value);
});
await test('64-KiB high-entropy history is losslessly deduplicated across engine snapshot copies',async()=>{
 const history=Buffer.from(crypto.getRandomValues(new Uint8Array(49152))).toString('base64');const value={history,copies:Array.from({length:12},()=>({request:{description:history}}))};
 const encoded=await encodeCheckpoint(value);assert.ok(encoded.data.byteLength<100000);assert.deepEqual(await decodeCheckpoint(encoded),value);
});
await test('unknown versions, encodings and malformed binary envelopes fail closed',async()=>{
 const original=await encodeCheckpoint({value:'ok'});
 for(const change of [{version:2},{encoding:'unknown'},{format:'unknown'}])await rejects(decodeCheckpoint({...original,...change}),'unsupported_format');
 for(const change of [{data:[1,2]},{decodedBytes:0},{sha256:'bad'}])await rejects(decodeCheckpoint({...original,...change}),'invalid_envelope');
});
await test('truncation, corrupted payloads and mismatched integrity metadata are rejected',async()=>{
 const encoded=await encodeCheckpoint({value:'text'.repeat(100)});
 await rejects(decodeCheckpoint({...encoded,data:encoded.data.slice(0,-3)}),'corrupt_payload');
 await rejects(decodeCheckpoint({...encoded,sha256:'0'.repeat(64)}),'integrity_mismatch');
 await rejects(decodeCheckpoint({...encoded,decodedBytes:encoded.decodedBytes+1}),'integrity_mismatch');
});
await test('encoded and decoded limits are enforced before accepting oversized storage data',async()=>{
 const encoded=await encodeCheckpoint({value:'x'.repeat(1024*1024)});
 await rejects(encodeCheckpoint({large:'x'.repeat(1000)},{maxDecodedBytes:100}),'decoded_size_limit');
 await rejects(encodeCheckpoint({value:'text'},{maxEncodedBytes:4}),'encoded_size_limit');
 await rejects(decodeCheckpoint(encoded,{maxEncodedBytes:4}),'encoded_size_limit');
 await rejects(decodeCheckpoint(encoded,{maxDecodedBytes:100}),'decoded_size_limit');
 await rejects(decodeCheckpoint({...encoded,decodedBytes:16}),'decoded_size_limit');
});
await test('non-JSON values and invalid options produce explicit codec errors',async()=>{
 const circular={};circular.self=circular;await rejects(encodeCheckpoint(circular),'invalid_json_value');await rejects(encodeCheckpoint(undefined),'invalid_json_value');await rejects(encodeCheckpoint({}, {maxDecodedBytes:0}),'invalid_maxDecodedBytes');
});
console.log('Checkpoint codec: all '+count+' checks passed');
