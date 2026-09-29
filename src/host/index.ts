/**
 * jsfe/host — pure helpers for the HOST side of aiCallback, so a production host and a local
 * test harness share one implementation instead of copying it. Zero runtime imports: loading
 * `jsfe/host` never loads the engine.
 *
 *   import { buildAiRequest, isDetectFlowRequest, toFlowRequest } from 'jsfe/host';
 */
export * from './request.js';
export * from './systemone-intent.js';
