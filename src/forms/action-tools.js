/** Internal transport ports. Registered by WorkflowEngine; no network implementation lives in JSFE. */
export const ACTION_TOOLS=['claim','complete'].map(operation=>({
   id:`jsfe:action-${operation}`,name:`JSFE action ${operation}`,description:`Await the configured durable action journal ${operation} port.`,
   parameters:{type:'object',properties:{record:{type:'object'},action:{type:'object'},...(operation==='complete'?{outcome:{type:['object','null']}}:{})},required:['record','action'],additionalProperties:false},
   implementation:{type:'local',function:operation==='claim'?'jsfeClaimAction':'jsfeCompleteAction',retries:0,timeout:10000},
}));
