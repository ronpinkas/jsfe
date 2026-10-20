/** Versioned engine support; declaring proposal consent must never become a no-op on older runtimes. */
export const INPUT_PROPOSALS_REQUIREMENT = 'jsfe:input-proposals:v1';
export function proposalRuntimeSteps(id, steps, requirements = []) {
   if (!requirements.includes(INPUT_PROPOSALS_REQUIREMENT)) return steps;
   const guard = {id:id+'_proposal_protocol',type:'SET',variable:'noop',value:'formProposalProtocol() === 1',requireTrue:true};
   return steps[0]?.type === 'SET' && steps[0]?.value === guard.value && steps[0]?.requireTrue === true ? steps : [guard,...steps];
}
export const hasInputProposals = inputs => (inputs || []).some(input => input.proposal !== undefined || hasInputProposals(input.any_of) || hasInputProposals(input.schema?.inputs));
