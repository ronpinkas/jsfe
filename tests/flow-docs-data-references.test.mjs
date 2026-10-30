// A catalog written once as shared data and referenced as {"$data": path} is documented as compilation resolves it: its
// facts and its menu flows appear on the page, exactly as for a catalog written in place. Synthetic set.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateFlowDocs} from '../src/docs/flow-docs.js';

const catalog={subject:'your account',facts:[{key:'balance',description:'the current balance',path:'balance'}],menu:{choices:[{key:'statement',flow:'send-statement'}]}};
const flows=[
 {id:'example-data',name:'example-data',library:'data',declarationVersion:2,data:{catalog}},
 {id:'in-place',name:'InPlace',declarationVersion:2,description:'x',provides:catalog,steps:[{id:'s',type:'SAY',value:'x'}]},
 {id:'referenced',name:'Referenced',declarationVersion:2,description:'x',provides:{$data:'catalog'},steps:[{id:'s',type:'SAY',value:'x'}]},
 {id:'send-statement',name:'SendStatement',steps:[{id:'s',type:'SAY',value:'x'}]},
];
const root=fs.mkdtempSync(path.join(os.tmpdir(),'flow-docs-data-'));
generateFlowDocs({root,sets:[{key:'example',title:'Example',flows,tools:[],source:'test'}],log:()=>{}});
const page=id=>fs.readFileSync(path.join(root,'example',id+'.md'),'utf8');
const facts=id=>page(id).split('\n').filter(line=>line.startsWith('- fact ')||line.startsWith('- **Calls:**'));
assert.ok(facts('referenced').some(line=>line.startsWith('- fact `balance`')),'the referenced catalog lists its fact');
assert.ok(facts('referenced').some(line=>line.includes('send-statement')),'the referenced catalog lists its menu flow');
assert.deepEqual(facts('referenced'),facts('in-place'),'a referenced catalog documents like one written in place');
assert.equal(flows[2].provides.$data,'catalog','the caller\'s flows are not changed');
fs.rmSync(root,{recursive:true,force:true});
console.log('flow docs data references: 4 checks passed');
