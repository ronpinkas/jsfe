/** Save-boundary helpers. A receipt acknowledges only the exact action version consumed by the saved session. */
export function actionSessionSnapshot(session) {
   const keys=[...new Set(session?.cargo?.actionJournalReceipts || [])];
   const revisions=session?.cargo?.actionJournalReceiptRevisions || {};
   const receipts=keys.filter(key=>Number.isSafeInteger(revisions[key])&&revisions[key]>0).map(key=>({key,sequence:revisions[key]}));
   return {keys,receipts,session};
}
/** String keys resolve through the consumed-revision map; explicit receipt objects freeze the host's save boundary. */
export async function checkpointActionSession(journal,session,keys=[]) {
   if(!keys.length)return 0;
   const revisions=session?.cargo?.actionJournalReceiptRevisions || {};
   const selected=new Map(keys.map(item=>typeof item==='string'?[item,revisions[item]]:[item.key,item.sequence]));
   const receipts=[...selected].filter(([,sequence])=>Number.isSafeInteger(sequence)&&sequence>0).map(([key,sequence])=>({key,sequence}));
   if(!receipts.length)return 0;
   if(!journal)throw new Error('Cannot checkpoint action receipts without a durable journal');
   const count=await journal.checkpoint({sessionId:session.sessionId,receipts});
   if(count===selected.size&&receipts.length===selected.size) {
      const acknowledged=new Map(receipts.map(item=>[item.key,item.sequence]));
      const current=session.cargo.actionJournalReceiptRevisions || {};
      session.cargo.actionJournalReceipts=(session.cargo.actionJournalReceipts || []).filter(key=>!acknowledged.has(key)||current[key]!==acknowledged.get(key));
      for(const {key,sequence} of receipts)if(current[key]===sequence)delete current[key];
   }
   return count;
}
