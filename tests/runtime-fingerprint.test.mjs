import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {calculateRuntimeFingerprint,verifyRuntimeFingerprint} from '../dist/host/runtime-manifest.js';
import {JSFE_RUNTIME_FINGERPRINT} from '../dist/runtime-identity.js';
const dist=path.resolve(new URL('../dist/',import.meta.url).pathname);let checks=0;
assert.match(JSFE_RUNTIME_FINGERPRINT,/^sha256:[a-f0-9]{64}$/);assert.equal(await verifyRuntimeFingerprint(dist),JSFE_RUNTIME_FINGERPRINT);checks++;
const root=await fs.mkdtemp(path.join(os.tmpdir(),'jsfe-runtime-stamp-'));
try {
 const copy=path.join(root,'dist');await fs.cp(dist,copy,{recursive:true});assert.equal(await verifyRuntimeFingerprint(copy),JSFE_RUNTIME_FINGERPRINT);checks++;
 const file=path.join(copy,'helpers/answer.js');const original=await fs.readFile(file,'utf8');await fs.writeFile(file,original+'\n// changed installed bytes\n');await assert.rejects(verifyRuntimeFingerprint(copy),/do not match/);checks++;
 await fs.writeFile(file,original);assert.equal(await verifyRuntimeFingerprint(copy),JSFE_RUNTIME_FINGERPRINT);checks++;
 await fs.writeFile(path.join(copy,'runtime-identity.js'),'export const JSFE_RUNTIME_FINGERPRINT = "unbuilt";\n');await assert.rejects(verifyRuntimeFingerprint(copy),/absent or unbuilt/);assert.equal(await calculateRuntimeFingerprint(copy),JSFE_RUNTIME_FINGERPRINT);checks++;
 await fs.writeFile(path.join(copy,'runtime-identity.js'),`export const JSFE_RUNTIME_FINGERPRINT = ${JSON.stringify(JSFE_RUNTIME_FINGERPRINT)};\n`);await fs.writeFile(path.join(copy,'added-runtime.js'),'export const behavior=1;\n');await assert.rejects(verifyRuntimeFingerprint(copy),/do not match/);checks++;
} finally {await fs.rm(root,{recursive:true,force:true});}
console.log(`Runtime build fingerprint: all ${checks} checks passed`);
