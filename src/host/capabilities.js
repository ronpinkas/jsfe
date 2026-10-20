/** Declarative flow admission. No engine imports, I/O, or implicit host capability activation. */
export class JSFEHostCapabilityError extends Error {
   constructor(flowId, capability, reason) {
      super(`Flow ${flowId || '<unknown>'} host capability ${capability || '<declaration>'}: ${reason}`);
      this.name = 'JSFEHostCapabilityError';
      this.code = 'JSFE_HOST_CAPABILITY_REQUIRED';
      this.flowId = flowId || '';
      this.capability = capability || '';
   }
}

/** Copy/normalize declaration data so subsequent caller mutations cannot change admission. */
export function normalizeHostRequirements(requirements, flowId) {
   if (requirements === undefined) return Object.freeze([]);
   if (!Array.isArray(requirements)) throw new JSFEHostCapabilityError(flowId, '', 'contract.requires must be an array of nonempty capability names');
   for (const name of requirements) {
      if (typeof name !== 'string' || !name || name.trim() !== name) {
         throw new JSFEHostCapabilityError(flowId, '', 'contract.requires must contain nonempty, unpadded strings');
      }
   }
   return Object.freeze([...new Set(requirements)]);
}

/** Durable is the native default; session-only must be selected explicitly by the host. */
export function actionPersistenceMode(mode = 'durable') {
   if (mode !== 'durable' && mode !== 'session-only') {
      throw new JSFEHostCapabilityError('', 'actionPersistence', "must be 'durable' or 'session-only'");
   }
   return mode;
}

/** Boolean requirements remain strict. guardedActions additionally accepts the explicit session-only policy. */
export function assertFlowHostCapabilities(flows, capabilities = {}) {
   if (!Array.isArray(flows)) throw new JSFEHostCapabilityError('', '', 'flows must be an array');
   const own = key => Object.prototype.hasOwnProperty.call(capabilities || {}, key);
   const mode = actionPersistenceMode(own('actionPersistence') ? capabilities.actionPersistence : undefined);
   if (mode === 'session-only' && capabilities?.durableActions === true) {
      throw new JSFEHostCapabilityError('', 'actionPersistence', 'session-only conflicts with durableActions:true');
   }
   for (const flow of flows) {
      const requirements = normalizeHostRequirements(flow?.variables?.contract?.value?.requires, flow?.id);
      for (const capability of requirements) {
         if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
            throw new JSFEHostCapabilityError(flow?.id, capability, 'explicit host capabilities must be an object');
         }
         if (capability === 'guardedActions') {
            if (own('durableActions') && capabilities.durableActions === true || own('actionPersistence') && mode === 'session-only') continue;
            throw new JSFEHostCapabilityError(flow?.id, capability, 'requires explicit boolean true for durableActions or explicit actionPersistence:session-only');
         }
         if (!Object.prototype.hasOwnProperty.call(capabilities, capability)) {
            throw new JSFEHostCapabilityError(flow?.id, capability, 'requires explicit boolean true; capability is missing');
         }
         if (capabilities[capability] !== true) {
            throw new JSFEHostCapabilityError(flow?.id, capability, `requires explicit boolean true; received ${typeof capabilities[capability]}`);
         }
      }
   }
   return true;
}
