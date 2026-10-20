/** Run after tsc; immutable runtime identity remains available after bundling. */
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {calculateRuntimeFingerprint,verifyRuntimeFingerprint} from '../src/host/runtime-manifest.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=process.argv.find(x=>x.startsWith('--dir='))?.slice(6)||path.join(root,'dist');
if(process.argv.includes('--check'))console.log(await verifyRuntimeFingerprint(directory));
else {const fingerprint=await calculateRuntimeFingerprint(directory);await writeFile(path.join(directory,'runtime-identity.js'),`export const JSFE_RUNTIME_FINGERPRINT = ${JSON.stringify(fingerprint)};\n`);console.log(await verifyRuntimeFingerprint(directory));}
