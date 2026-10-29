import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
// The flow docs in docs/flows describe flows/ as it is: no stale page, no page without a flow, no broken link.
const r=spawnSync(process.execPath,['scripts/flow-docs.mjs','--check'],{encoding:'utf8'});
assert.equal(r.status,0,`docs/flows is stale: run node scripts/flow-docs.mjs\n${r.stdout}${r.stderr}`);
console.log(`flow-docs-current: ${r.stdout.trim().split('\n').join('; ')}`);
