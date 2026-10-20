/** Node-only build/CI verification. Runtime recovery uses the bundled stamp, never a filesystem scan. */
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export async function calculateRuntimeFingerprint(distDirectory) {
   const root=path.resolve(distDirectory),files=[];
   async function visit(directory) {
      for(const entry of await readdir(directory,{withFileTypes:true})) {
         const file=path.join(directory,entry.name);
         if(entry.isDirectory())await visit(file);
         else if(entry.isFile()&&entry.name.endsWith('.js')&&file!==path.join(root,'runtime-identity.js'))files.push(file);
      }
   }
   await visit(root);
   if(!files.length)throw new Error('No compiled JSFE runtime files to fingerprint');
   files.sort((a,b)=>a<b?-1:a>b?1:0);
   const hash=createHash('sha256').update('jsfe-runtime-v1\0');
   for(const file of files){hash.update(path.relative(root,file).split(path.sep).join('/'));hash.update('\0');hash.update(await readFile(file));hash.update('\0');}
   return 'sha256:'+hash.digest('hex');
}

export async function verifyRuntimeFingerprint(distDirectory) {
   const source=await readFile(path.join(distDirectory,'runtime-identity.js'),'utf8');
   const match=/^export const JSFE_RUNTIME_FINGERPRINT = "(sha256:[a-f0-9]{64})";\s*$/m.exec(source);
   if(!match)throw new Error('JSFE runtime stamp is absent or unbuilt');
   const actual=await calculateRuntimeFingerprint(distDirectory);
   if(actual!==match[1])throw new Error('JSFE runtime files do not match the build stamp');
   return actual;
}
