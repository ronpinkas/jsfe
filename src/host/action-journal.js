/** Durable action policy. The injected storage adapter owns atomic I/O, never conversational decisions. */
const STATES=new Set(['attempted','unknown','completed','superseded']);
const text=(value,name,max=4096)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new ActionJournalError('invalid_'+name);return value;};
const clone=value=>JSON.parse(JSON.stringify(value));
const hash=async value=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export class ActionJournalError extends Error {
   constructor(code){super(`Action journal: ${code}`);this.name='ActionJournalError';this.code=code;}
}
/**
 * Storage contract (all writes are compare-and-swap, false means the comparison lost):
 * readAttempt(attemptId), readScope(scopeId) -> record|null
 * readPending(sessionId) -> {version:1,sessionId,sequence,revision,attempts:{[attemptId]:sequence}}|null
 * claim({attempt,expectedGuard,superseded?,index,expectedIndex}) -> boolean; atomic attempt + guard + session index
 * complete({attempt,expected,index,expectedIndex}) -> boolean; atomic matching attempt + owned guard + session index
 * An unresolved claim has no lease expiry. A timeout cannot establish whether an external effect ran.
 */
export function createActionJournal({storage,namespace,now=Date.now}) {
   text(namespace,'namespace');
   for(const method of ['readAttempt','readScope','readPending','claim','complete'])if(typeof storage?.[method]!=='function')throw new ActionJournalError('missing_storage_'+method);
   const sessionHash=sessionId=>hash(JSON.stringify([namespace,text(sessionId,'session')]));
   const tick=()=>{const stamp=now();if(!Number.isFinite(stamp)||stamp<0)throw new ActionJournalError('invalid_clock');return stamp;};
   const attemptId=async(sessionId,key)=>hash(JSON.stringify([await sessionHash(sessionId),text(key,'key')]));
   const scopeId=async(sessionId,scope)=>hash(JSON.stringify([await sessionHash(sessionId),text(scope,'scope')]));
   const receipt=row=>({key:row.key,attemptId:row.attemptId,scopeId:row.scopeId,signature:row.signature,sequence:row.sequence});
   const check=(row,{scope,attempt,signature}={})=>{
      if(!row)return null;
      if(row.version!==1||!STATES.has(row.status)||typeof row.revision!=='string'||typeof row.key!=='string'||typeof row.scopeId!=='string'||typeof row.attemptId!=='string'||typeof row.signature!=='string'||!Number.isFinite(row.createdAt)||!Number.isFinite(row.updatedAt)||(['completed','unknown'].includes(row.status)&&(!row.result||typeof row.result.status!=='string')))throw new ActionJournalError('invalid_stored_record');
      if(scope&&row.scopeId!==scope||attempt&&row.attemptId!==attempt)throw new ActionJournalError('stored_identity_mismatch');
      if(signature&&row.signature!==signature)throw new ActionJournalError('key_reused_for_different_request');
      return row;
   };
   const checkIndex=(row,session)=>{
      if(!row)return null;
      if(row.version!==1||row.sessionId!==session||!Number.isSafeInteger(row.sequence)||row.sequence<1||typeof row.revision!=='string'||!row.attempts||typeof row.attempts!=='object'||Array.isArray(row.attempts))throw new ActionJournalError('invalid_session_index');
      return row;
   };
   const nextIndex=(previous,session)=>({version:1,sessionId:session,sequence:Number(previous?.sequence || 0)+1,revision:globalThis.crypto.randomUUID(),attempts:{...previous?.attempts}});
   async function identity({sessionId,record,action}) {
      if(!record||!action||typeof action.action!=='string'||record.action!==action.action||!action.effect)throw new ActionJournalError('invalid_action');
      return {session:await sessionHash(sessionId),attempt:await attemptId(sessionId,record.key),scope:await scopeId(sessionId,record.scope),signature:await hash(text(record.signature,'signature',1048576))};
   }
   const replay=row=>({status:'replay',outcome:clone(row.result),receipt:receipt(row)});
   const hold=(row,reason)=>({status:'hold',outcome:{status:'unknown',reason},receipt:row?receipt(row):null});
   function retryAllowed(guard,record,action) {
      const retry=record.retryAuthorization,proof=retry?.authorization;
      return ['attempted','unknown'].includes(guard.status)&&action.effect==='send'&&action.retry?.unknown==='explicit'&&retry?.previousKey===guard.key&&proof&&typeof proof.form==='string'&&!!proof.form&&typeof proof.input==='string'&&!!proof.input&&Object.hasOwn(proof,'value')&&Number.isInteger(proof.revision)&&proof.revision>=0&&Number.isFinite(proof.at)&&proof.at>=guard.createdAt;
   }
   async function claim(input) {
      const {sessionId,record,action}=input,id=await identity(input);
      for(let race=0;race<3;race++) {
         const [prior,guard,indexBefore]=await Promise.all([storage.readAttempt(id.attempt),storage.readScope(id.scope),storage.readPending(id.session)]);
         check(prior,{scope:id.scope,attempt:id.attempt,signature:id.signature});check(guard,{scope:id.scope});
         checkIndex(indexBefore,id.session);
         if(prior)return prior.status==='completed'?replay(prior):hold(prior,prior.status==='superseded'?'action_superseded':'action_result_unresolved');
         if(guard?.status==='completed'&&!guard.checkpointed)return guard.signature===id.signature?replay(guard):hold(guard,'completed_action_not_checkpointed');
         let superseded=null,consentFingerprint='';
         if(guard&&['attempted','unknown'].includes(guard.status)) {
            if(!retryAllowed(guard,record,action))return hold(guard,'action_result_unresolved');
            const proof=record.retryAuthorization.authorization;
            consentFingerprint=await hash(JSON.stringify([proof.form,proof.input,proof.sequence ?? null,proof.revision,proof.at,proof.value]));
            if(consentFingerprint===guard.consentFingerprint)return hold(guard,'retry_consent_already_used');
            const previous=check(await storage.readAttempt(guard.attemptId),{scope:id.scope,attempt:guard.attemptId});
            if(!previous||previous.revision!==guard.revision||previous.status!==guard.status)return hold(guard,'retry_history_changed');
            superseded={expected:previous,attempt:{...previous,status:'superseded',retryAuthorization:clone(record.retryAuthorization),revision:globalThis.crypto.randomUUID(),updatedAt:tick()}};
            delete superseded.attempt.checkpoint;
         } else if(guard&&guard.status!=='completed')return hold(guard,'invalid_scope_state');
         const stamp=tick();
         const index=nextIndex(indexBefore,id.session);
         if(superseded)delete index.attempts[superseded.expected.attemptId];
         index.attempts[id.attempt]=index.sequence;
         const attempt={version:1,sessionId:id.session,sequence:index.sequence,attemptId:id.attempt,scopeId:id.scope,key:record.key,action:action.action,effect:action.effect,signature:id.signature,
            revision:globalThis.crypto.randomUUID(),status:'attempted',checkpointed:false,createdAt:stamp,updatedAt:stamp,
            ...(input.checkpoint!==undefined?{checkpoint:clone(input.checkpoint)}:{}),
            ...(superseded?{retryAuthorization:clone(record.retryAuthorization),consentFingerprint}:{})};
         if(await storage.claim({attempt,expectedGuard:guard || null,superseded,index,expectedIndex:indexBefore || null}))return {status:'execute',receipt:receipt(attempt)};
      }
      return hold(null,'claim_contended');
   }
   async function complete(input) {
      const {record,action,outcome}=input,id=await identity(input);
      const candidate=outcome&&typeof outcome==='object'&&Object.hasOwn(action.outcomes || {},outcome.status)?clone(outcome):{status:'unknown',reason:'invalid_action_result'};
      for(let race=0;race<3;race++) {
         const [stored,indexBefore]=await Promise.all([storage.readAttempt(id.attempt),storage.readPending(id.session)]);
         const prior=check(stored,{scope:id.scope,attempt:id.attempt,signature:id.signature});checkIndex(indexBefore,id.session);
         if(!prior)throw new ActionJournalError('completion_without_claim');
         if(prior.status==='completed')return {status:'completed',outcome:clone(prior.result),receipt:receipt(prior)};
         if(prior.status==='superseded')throw new ActionJournalError('completion_after_supersession');
         const guard=check(await storage.readScope(id.scope),{scope:id.scope});
         if(!guard||guard.key!==record.key||guard.revision!==prior.revision)throw new ActionJournalError('completion_ownership_lost');
         if(!indexBefore||!Object.hasOwn(indexBefore.attempts,id.attempt)&&!prior.checkpointed)throw new ActionJournalError('missing_pending_action');
         const index=nextIndex(indexBefore,id.session);index.attempts[id.attempt]=index.sequence;
         const attempt={...prior,checkpointed:false,sequence:index.sequence,status:candidate.status==='unknown'?'unknown':'completed',result:candidate,revision:globalThis.crypto.randomUUID(),updatedAt:tick(),...(input.checkpoint!==undefined?{checkpoint:clone(input.checkpoint)}:{})};
         if(await storage.complete({attempt,expected:prior,index,expectedIndex:indexBefore}))return {status:attempt.status,outcome:clone(candidate),receipt:receipt(attempt)};
      }
      throw new ActionJournalError('completion_contended');
   }
   async function checkpoint({sessionId,keys=[],receipts}) {
      let count=0;
      const versioned=receipts!==undefined;
      if(versioned&&(!Array.isArray(receipts)||receipts.some(item=>!item||typeof item.key!=='string'||!Number.isSafeInteger(item.sequence)||item.sequence<1)))throw new ActionJournalError('invalid_checkpoint_receipt');
      const expected=new Map(versioned?receipts.map(item=>[item.key,item.sequence]):keys.map(key=>[key,null]));
      const session=await sessionHash(sessionId);
      for(const [key,sequence] of expected) {
         const id=await attemptId(sessionId,key);
         for(let race=0;race<3;race++) {
            const [stored,indexBefore]=await Promise.all([storage.readAttempt(id),storage.readPending(session)]);
            const prior=check(stored,{attempt:id});checkIndex(indexBefore,session);
            if(!prior||versioned&&prior.sequence!==sequence)break;
            if(prior.status==='superseded'){count++;break;}
            if(prior.checkpointed){count++;break;}
            const guard=check(await storage.readScope(prior.scopeId),{scope:prior.scopeId});
            if(!guard||guard.key!==prior.key||guard.revision!==prior.revision)break;
            if(!indexBefore||!Object.hasOwn(indexBefore.attempts,id))throw new ActionJournalError('missing_pending_action');
            const index=nextIndex(indexBefore,session);delete index.attempts[id];
            const attempt={...prior,checkpointed:true,revision:globalThis.crypto.randomUUID(),updatedAt:tick()};
            delete attempt.checkpoint;
            if(await storage.complete({attempt,expected:prior,index,expectedIndex:indexBefore})){count++;break;}
            if(race===2)throw new ActionJournalError('checkpoint_contended');
         }
      }
      return count;
   }
   async function pending({sessionId}) {
      const session=await sessionHash(sessionId);
      for(let race=0;race<3;race++) {
         const index=checkIndex(await storage.readPending(session),session);
         if(!index)return {records:[],checkpoint:null};
         const records=await Promise.all(Object.keys(index.attempts).map(async id=>check(await storage.readAttempt(id),{attempt:id})));
         const after=checkIndex(await storage.readPending(session),session);
         if(after?.revision!==index.revision)continue;
         if(records.some(row=>!row||row.sessionId!==session||row.sequence!==index.attempts[row.attemptId]))throw new ActionJournalError('pending_index_mismatch');
         records.sort((a,b)=>a.sequence-b.sequence||a.updatedAt-b.updatedAt||a.key.localeCompare(b.key));
         const latest=records.filter(row=>row.checkpoint!==undefined).at(-1);
         return {records:clone(records),checkpoint:latest?{key:latest.key,sequence:latest.sequence,status:latest.status,session:clone(latest.checkpoint)}:null};
      }
      throw new ActionJournalError('pending_read_contended');
   }
   return Object.freeze({claim,complete,checkpoint,pending});
}

/** Hermetic adapter. Share this object across recreated ports to model process loss; never use it as production persistence. */
export function createMemoryActionStorage() {
   const attempts=new Map(),scopes=new Map(),indexes=new Map();
   const read=(rows,id)=>rows.has(id)?clone(rows.get(id)):null;
   const matches=(actual,expected)=>expected?actual?.revision===expected.revision:!actual;
   return Object.freeze({
      async readAttempt(id){return read(attempts,id);},async readScope(id){return read(scopes,id);},async readPending(id){return read(indexes,id);},
      async claim({attempt,expectedGuard,superseded=null,index,expectedIndex}) {
         if(attempts.has(attempt.attemptId)||!matches(scopes.get(attempt.scopeId),expectedGuard)||!matches(indexes.get(index.sessionId),expectedIndex)||superseded&&!matches(attempts.get(superseded.expected.attemptId),superseded.expected))return false;
         const guard=clone(attempt);delete guard.checkpoint;
         attempts.set(attempt.attemptId,clone(attempt));scopes.set(attempt.scopeId,guard);indexes.set(index.sessionId,clone(index));
         if(superseded)attempts.set(superseded.attempt.attemptId,clone(superseded.attempt));
         return true;
      },
      async complete({attempt,expected,index,expectedIndex}) {
         if(!matches(attempts.get(attempt.attemptId),expected)||!matches(scopes.get(attempt.scopeId),expected)||!matches(indexes.get(index.sessionId),expectedIndex))return false;
         const guard=clone(attempt);delete guard.checkpoint;
         attempts.set(attempt.attemptId,clone(attempt));scopes.set(attempt.scopeId,guard);indexes.set(index.sessionId,clone(index));return true;
      },
   });
}
