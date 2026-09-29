/**
 * aiCallback request shaping for an OpenAI-compatible host — pure, zero imports.
 *
 * jsfe calls the host's aiCallback(systemInstruction, userMessage, jsonSchema, request?). These
 * helpers turn that call into a chat-completions request body, so a production host and a local
 * test harness build byte-identical requests from one implementation.
 */

/**
 * The request-relevant description of one model. Every field but `name` is optional:
 *   tokenParam     — 'max_completion_tokens' for models that reject `max_tokens` (GPT-5 family).
 *   reservedReplySize — the reply's token cap.
 *   supportsSchema — the model honours a json_schema `response_format`.
 *   fixedSampling  — the model rejects any non-default temperature/top_p/penalties.
 *   extraParams    — raw body pass-through (e.g. `reasoning_effort`, `thinking`).
 */
export interface HostModel {
  name: string;
  tokenParam?: string;
  reservedReplySize?: number;
  supportsSchema?: boolean;
  fixedSampling?: boolean;
  extraParams?: Record<string, unknown>;
}

export interface ResponseFormatWrapper {
  type?: string;
  json_schema?: { name?: string; strict?: boolean; schema?: unknown };
  [key: string]: unknown;
}

/**
 * Parse aiCallback's `jsonSchema` argument, which is NOT always JSON. jsfe passes:
 *   - a JSON `response_format` wrapper, e.g. {type:'json_schema', json_schema:{name:'detect_flow',…}}
 *   - a PLAIN-TEXT schema description ("city: string (required) - …") on the tool-argument path
 *   - nothing at all (voice cleanup, language detection)
 * Returns null for the last two.
 */
export function parseSchemaArg(jsonSchema: unknown): ResponseFormatWrapper | null {
  if (!jsonSchema) {
    return null;
  } else {
    // a schema argument was supplied — it may still not be JSON
  }
  try {
    const parsed = JSON.parse(String(jsonSchema));
    return parsed && typeof parsed === 'object' ? (parsed as ResponseFormatWrapper) : null;
  } catch {
    return null; // plain-text schema description — an instruction for the prompt, not a response_format
  }
}

/** The schema's name, or null. `detect_flow` and `intent_analysis` are the two jsfe uses. */
export function schemaName(jsonSchema: unknown): string | null {
  return parseSchemaArg(jsonSchema)?.json_schema?.name ?? null;
}

/**
 * Build the chat-completions request body for one model.
 *
 * `response_format` rules:
 *   - detect_flow: omitted. Its schema carries dynamic per-flow parameters that json mode
 *     rejects; the host still has the schema to validate the answer.
 *   - a response_format wrapper + a model that supports schemas: sent as-is.
 *   - any other JSON schema, or a model without schema support: `{type:'json_object'}`.
 *   - NOT parseable as JSON (the plain-text description): omitted entirely — never
 *     `response_format: null`, whose handling is undefined across vendors.
 *
 * Sampling is deterministic (temperature 0, a fixed seed) unless the model is `fixedSampling`.
 */
export function buildAiRequest(
  model: HostModel,
  systemInstruction: string,
  userMessage: string,
  jsonSchema?: unknown
): Record<string, unknown> {
  const parsedSchema = parseSchemaArg(jsonSchema);
  const useResponseFormat = parsedSchema !== null && parsedSchema.json_schema?.name !== 'detect_flow';
  const tokenParam = model.tokenParam || 'max_tokens';

  return {
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userMessage },
    ],
    model: model.name,
    [tokenParam]: model.reservedReplySize,
    stream: false,
    ...(model.extraParams || {}),
    ...(model.fixedSampling ? {} : {
      top_p: 0.000000001,
      seed: 1024,
      temperature: 0,
      n: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
      logit_bias: {},
    }),
    ...(useResponseFormat
      ? (model.supportsSchema && parsedSchema.json_schema
        ? { response_format: parsedSchema }
        : { response_format: { type: 'json_object' } })
      : {}),
  };
}
