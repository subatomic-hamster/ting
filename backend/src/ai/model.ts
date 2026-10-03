// One structured call to a model: a system prompt, a user prompt, and a single tool whose input is the answer.
// The Bedrock implementation lives in lib/bedrock.ts; tests pass a fake.

export interface ToolCall {
  model: 'fast' | 'smart';
  system: string;
  prompt: string;
  tool: { name: string; description: string; schema: Record<string, unknown> };
  maxTokens: number;
}

export type CallModel = (call: ToolCall) => Promise<unknown>;

export const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
