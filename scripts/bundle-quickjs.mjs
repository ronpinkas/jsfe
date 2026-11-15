/** Run after tsc: QuickJS (WebAssembly embedded) as ONE relative ES module, dist/vendor/quickjs.js. The Flow Designer
 * imports dist/ straight from a CDN with no bundler, so dist/ may hold no bare package import. */
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await build({
   stdin:{contents:`import {newQuickJSWASMModuleFromVariant} from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-singlefile-mjs-release-sync';
export const QuickJS = await newQuickJSWASMModuleFromVariant(variant);`,resolveDir:root,loader:'js'},
   bundle:true,format:'esm',platform:'neutral',target:'es2022',outfile:path.join(root,'dist/vendor/quickjs.js'),
   external:['module'],mainFields:['module','main'],conditions:['import','default'],legalComments:'eof',logLevel:'warning'
});
console.log('dist/vendor/quickjs.js written');
