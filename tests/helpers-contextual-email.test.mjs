/** Explicit literal email mode prevents prose becoming an invented recipient; defaults stay compatible. */
import assert from 'node:assert/strict';
import {readEmail} from '../src/helpers/contact.js';
import {matchInputs,readInputProfile} from '../src/helpers/match-inputs.js';
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
for(const text of ['It costs too much, contact owner@example.com','Cambié de compañía, contacte owner@example.com','Please contact Owner@Example.com.','Email <owner@example.com> please','My new address is owner+case@example.co.uk; please use it']){
 const expected=text.includes('+case')?'owner+case@example.co.uk':'owner@example.com';eq(readEmail(text,{literal:true}),expected,'Literal mode retains exact visible address: '+text);
}
for(const [text,expected] of [['Maria jose@gmail.com.','mariajose@gmail.com'],['J. A Garcia at aura.com.','jagarcia@aura.com'],['j u a n arroba gmail punto com','juan@gmail.com'],['mi correo es juan perez arroba gmail punto com','juanperez@gmail.com'],['S o n. N y underscore. L e, o s at gmail dot com','sonny_leos@gmail.com']]){
 eq(readEmail(text),expected,'Existing default name/spelling delivery stays unchanged');
 if(!text.includes('@'))eq(readEmail(text,{literal:true}),expected,'No visible literal address preserves spoken/spelled parsing');
}
eq(readEmail('Maria jose@gmail.com',{literal:true}),'jose@gmail.com','Explicit literal mode uses the complete visible token, not preceding name');
eq(readEmail('owner@example.com and other@example.com',{literal:true}),'','Distinct visible addresses fail closed without selecting a recipient');
eq(readEmail('owner@example.com, owner@example.com',{literal:true}),'owner@example.com','Repeated same literal address is unambiguous');
const text='It costs too much, contact owner@example.com';
const narrative={form:'details',name:'reason',profile:{kind:'text',narrative:true}},email={form:'request',name:'email',profile:{kind:'email'}};
eq(matchInputs(text,[narrative,email],{form:'details',name:'reason'}).hits.map(h=>[h.name,h.value]).sort(),[['email','owner@example.com'],['reason',text]],'Opted-in narrative retains rationale and exact independent recipient');
eq(readInputProfile({kind:'email',literal:true},text).value,'owner@example.com','Email profile may explicitly declare literal mode');
eq(readInputProfile({kind:'email'},'Maria jose@gmail.com').value,'mariajose@gmail.com','Ordinary email profile default remains compatible');
eq(matchInputs('Maria jose@gmail.com',[{...narrative,profile:{kind:'text'}},email],{form:'details',name:'reason'}).hits.map(h=>[h.name,h.value]),[['email','mariajose@gmail.com']],'Ordinary text matching does not silently opt into literal email grammar');
console.log(`Contextual email: all checks passed (${checks})`);
