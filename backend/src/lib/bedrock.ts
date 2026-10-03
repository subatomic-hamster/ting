import { BedrockRuntimeClient, ConverseCommand, type Tool } from '@aws-sdk/client-bedrock-runtime';
import type { CallModel } from '../ai/model';

const client = new BedrockRuntimeClient({});

/** Inference profiles; the stack sets these from its config. */
const MODELS = {
  fast: process.env.MODEL_FAST ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  smart: process.env.MODEL_SMART ?? 'us.anthropic.claude-sonnet-5',
};

/** Forces the model to answer through one tool and returns that tool's input. */
export const callBedrock: CallModel = async ({ model, system, prompt, tool, maxTokens }) => {
  const toolSpec: Tool = {
    toolSpec: { name: tool.name, description: tool.description, inputSchema: { json: tool.schema as never } },
  };
  const res = await client.send(
    new ConverseCommand({
      modelId: MODELS[model],
      system: [{ text: system }],
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      toolConfig: { tools: [toolSpec], toolChoice: { tool: { name: tool.name } } },
      inferenceConfig: { maxTokens },
    }),
  );
  const use = res.output?.message?.content?.find((c) => c.toolUse)?.toolUse;
  if (!use) throw new Error(`${MODELS[model]} returned no ${tool.name} (stop: ${res.stopReason})`);
  return use.input;
};
