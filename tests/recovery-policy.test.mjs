import assert from 'node:assert/strict';
import {retainRecoveryState,applyRecoveryStatePolicy} from '../dist/host/index.js';
let count=0;const equal=(a,b)=>{assert.deepEqual(a,b);count++;};
const current={cargo:{verified:false,other:1}};
retainRecoveryState(current,['cargo.verified','cargo.private']);
const old={cargo:{verified:true,private:{balance:25},unrelated:'kept'}};
applyRecoveryStatePolicy(old,current);
equal(old.cargo,{verified:false,unrelated:'kept'});
equal(old.actionRecoveryPolicy.revision,1);
const checkpoint=structuredClone(old);checkpoint.cargo.verified=true;checkpoint.cargo.private={balance:50};
applyRecoveryStatePolicy(checkpoint,current);
equal(checkpoint.cargo.verified,true);equal(checkpoint.cargo.private,{balance:50});
delete current.cargo.other;retainRecoveryState(current,['cargo.other']);
const next={...structuredClone(checkpoint),cargo:{...checkpoint.cargo,other:8}};
applyRecoveryStatePolicy(next,current);equal(Object.hasOwn(next.cargo,'other'),false);equal(next.cargo.verified,true);
equal(JSON.parse(JSON.stringify(current)).actionRecoveryPolicy.paths['cargo.other'].present,false);
for(const path of ['constructor.x','cargo.__proto__.x','cargo..x']){assert.throws(()=>retainRecoveryState(current,[path]),/safe cargo path/);count++;}
console.log(`Recovery host policy: all checks passed (${count})`);
