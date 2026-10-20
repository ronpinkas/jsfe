/** Runtime retry bookkeeping belongs to a frame, never the shared authored registry. */
import assert from 'node:assert/strict';
import {fixture} from './fixtures/action-recovery.mjs';
import {createActionRecoveryIdentity} from '../dist/host/index.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const f=fixture('immutable-definitions'),engine=f.engine(),declared=clone(engine.flowsMenu),before=await engine.getActionRecoveryIdentity();
let first=await engine.updateActivity({role:'user',content:'create',start:{flow:'alpha-task'}},engine.initSession('user-a','immutable-a','en'));
assert.equal(first.cargo.projected[0].reference,'alpha-1');
assert.ok(JSON.stringify(clone(engine.flowsMenu))===JSON.stringify(declared),'CALL-TOOL retryCount and nested branch state must not mutate authored definitions');
assert.deepEqual(await createActionRecoveryIdentity({flows:engine.flowsMenu,tools:engine.toolsRegistry}),before,'actual registry remains equal to its activation identity');
assert.deepEqual(await f.engine().getActionRecoveryIdentity(),before,'a fresh engine sees the same immutable imported definitions');
let second=await engine.updateActivity({role:'user',content:'create',start:{flow:'alpha-task'}},engine.initSession('user-b','immutable-b','en'));
assert.equal(second.cargo.projected[0].reference,'alpha-2');assert.deepEqual(f.effects,['alpha','alpha']);
assert.ok(JSON.stringify(clone(engine.flowsMenu))===JSON.stringify(declared),'two sessions do not accumulate runtime fields in a shared registry');
console.log('Flow definition isolation: all 5 checks passed');
