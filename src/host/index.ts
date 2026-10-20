/**
 * jsfe/host — pure helpers for the HOST side of aiCallback, so a production host and a local
 * test harness share one implementation instead of copying it. Zero runtime imports: loading
 * `jsfe/host` never loads the engine.
 *
 *   import { buildAiRequest, isDetectFlowRequest, toFlowRequest } from 'jsfe/host';
 */
export * from './request.js';
export * from './systemone-intent.js';
export * from './intent-stages.js';

export {createActionJournal,createMemoryActionStorage,ActionJournalError} from './action-journal.js';
export {actionSessionSnapshot,checkpointActionSession} from './action-session.js';

export {retainRecoveryState,applyRecoveryStatePolicy} from './recovery-policy.js';

export {CheckpointCodecError} from './checkpoint-codec-error.js';

export {createActionRecoveryIdentity,assertActionRecoveryIdentity,actionRecoveryIdentityMatches} from './recovery-identity.js';

export {assertFlowHostCapabilities,JSFEHostCapabilityError,actionPersistenceMode} from './capabilities.js';
