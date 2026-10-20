/** Node-only opaque JSON storage codec. Universal jsfe/host never imports this entry. */
export {verifyRuntimeFingerprint} from './runtime-manifest.js';
import {brotliCompress as compress,brotliDecompress as decompress,constants} from 'node:zlib';
import {promisify} from 'node:util';
import {CheckpointCodecError} from './checkpoint-codec-error.js';
export {CheckpointCodecError} from './checkpoint-codec-error.js';
export const CHECKPOINT_CODEC_LIMITS=Object.freeze({maxEncodedBytes:350*1024,maxDecodedBytes:16*1024*1024});
const FORMAT='jsfe-checkpoint',brotliCompress=promisify(compress),brotliDecompress=promisify(decompress);
const options=overrides=>{const limits={...CHECKPOINT_CODEC_LIMITS,...overrides};for(const name of ['maxEncodedBytes','maxDecodedBytes'])if(!Number.isSafeInteger(limits[name])||limits[name]<1)throw new CheckpointCodecError('invalid_'+name);return limits;};
const hash=async bytes=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export function isEncodedCheckpoint(value){return !!value&&typeof value==='object'&&(Object.hasOwn(value,'format')||Object.hasOwn(value,'encoding')||Object.hasOwn(value,'sha256')||value.data instanceof Uint8Array);}
export async function encodeCheckpoint(value,overrides={}) {
 const limits=options(overrides);let json;
 try{json=JSON.stringify(value);}catch{throw new CheckpointCodecError('invalid_json_value');}
 if(typeof json!=='string')throw new CheckpointCodecError('invalid_json_value');
 const raw=new TextEncoder().encode(json);if(raw.byteLength>limits.maxDecodedBytes)throw new CheckpointCodecError('decoded_size_limit');
 let data;
 try{data=await brotliCompress(raw,{maxOutputLength:limits.maxEncodedBytes,params:{[constants.BROTLI_PARAM_QUALITY]:4,[constants.BROTLI_PARAM_LGWIN]:24,[constants.BROTLI_PARAM_SIZE_HINT]:raw.byteLength}});}
 catch(error){throw new CheckpointCodecError(error.code==='ERR_BUFFER_TOO_LARGE'?'encoded_size_limit':'compression_failed');}
 if(data.byteLength>limits.maxEncodedBytes)throw new CheckpointCodecError('encoded_size_limit');
 return {format:FORMAT,version:1,encoding:'br',decodedBytes:raw.byteLength,sha256:await hash(raw),data};
}
export async function decodeCheckpoint(envelope,overrides={}) {
 const limits=options(overrides);
 if(!envelope||envelope.format!==FORMAT||envelope.version!==1||envelope.encoding!=='br')throw new CheckpointCodecError('unsupported_format');
 if(!(envelope.data instanceof Uint8Array)||!Number.isSafeInteger(envelope.decodedBytes)||envelope.decodedBytes<1||typeof envelope.sha256!=='string'||!/^[a-f0-9]{64}$/.test(envelope.sha256))throw new CheckpointCodecError('invalid_envelope');
 if(envelope.data.byteLength>limits.maxEncodedBytes)throw new CheckpointCodecError('encoded_size_limit');
 if(envelope.decodedBytes>limits.maxDecodedBytes)throw new CheckpointCodecError('decoded_size_limit');
 let raw;
 try{raw=await brotliDecompress(envelope.data,{maxOutputLength:Math.min(limits.maxDecodedBytes,envelope.decodedBytes)});}
 catch(error){throw new CheckpointCodecError(error.code==='ERR_BUFFER_TOO_LARGE'?'decoded_size_limit':'corrupt_payload');}
 if(raw.byteLength!==envelope.decodedBytes||await hash(raw)!==envelope.sha256)throw new CheckpointCodecError('integrity_mismatch');
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw new CheckpointCodecError('invalid_json_payload');}
}
