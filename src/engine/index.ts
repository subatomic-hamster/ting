// THE ENGINE SEAM. Every dollar on screen comes from here.
//
// To plug in the real engine, change the export below to point at it.
// The contract is `runEngine(input: EngineInput): EngineResult` (see ../contracts.ts).
// It must be a pure, synchronous function: the timeline calls it on every drag.

export { runMockEngine as runEngine } from './mockEngine';
export { memberTotalDelta, priceDentists } from './helpers';
export type { DentistQuote } from './helpers';
