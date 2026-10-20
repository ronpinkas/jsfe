/** Stable codec errors are safe to inspect without loading a Node-only storage implementation. */
export class CheckpointCodecError extends Error {
 constructor(code){super('JSFE checkpoint codec: '+code);this.name='CheckpointCodecError';this.code=code;}
}
