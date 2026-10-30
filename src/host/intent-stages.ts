/**
 * Two-stage intent detection — the instructions and the decoders, zero runtime imports.
 *
 *   Stage 1 (task 'detect_flow'):        which primary flow, if any, the latest message starts.
 *   Stage 2 (task 'extract_parameters'): the values the user gave for the SELECTED flow's parameters.
 *
 * For each stage jsfe builds ONE instruction set per executor — `llm` (a text model) and `systemOne`
 * (TypeSafe System One) — from the same rules and the same flow fields, and passes both to aiCallback as
 * its 4th argument. The host is the executor: it runs either, or both as a hedge (the first complete
 * answer wins and the other is cancelled), and returns the CANONICAL reply as a JSON string:
 *   stage 1: { "flowName": "<name>" | "None" }
 *   stage 2: { "parameters": { "<name>": value, … } }
 * The decoders below turn either executor's raw answer into that reply, so the host never interprets one.
 *
 * What each stage reads, and nothing else:
 *   stage 1: each primary flow's `description` (what should trigger it);
 *   stage 2: the selected flow's `parameterInstructions` (optional: rules that span its parameters) and its
 *            parameters — name, type, enum and `description` (that parameter's rule). Parameters marked
 *            `internal: true` (or whose description begins "Internal") are the flow's own, never asked.
 * System One answers only closed values (enum, boolean): its stage-2 instructions cover those parameters,
 * so a flow with any free-text parameter is answered completely only by the LLM.
 */

import type { FlowParameterDefinition } from '../index.js';

/** A noul at or above this is a yes. */
export const STAGE_YES_THRESHOLD = 0.5;
/** Stage 1: a start below this (`any`) whose route gives its top flow less than SPLIT_ROUTE_SHARE is "None" (owner 2026-10-29). */
export const WEAK_START = 0.55;
export const SPLIT_ROUTE_SHARE = 0.7;

export interface StageTurn { role: 'user' | 'assistant'; content: string }
export interface StageFlow { id: string; name: string; description: string }
export interface StageParameter { name: string; type?: string; enum?: string[]; description?: string; internal?: boolean; jsonSchema?: Record<string, unknown> }
export interface StageLlm { system: string; user: string; schema: Record<string, unknown> }
export interface StageSystemOne<I> { state: Record<string, unknown>; questions: Record<string, unknown>; index: I[] }
/** Stage 1, System One: `route` is the choice among the flows, `any` whether the message starts one at all. */
export interface FlowQuestionRef { id: 'route' | 'any' }
export type ParameterQuestionRef =
  | { id: string; kind: 'enum'; param: string; value: string }
  | { id: string; kind: 'boolean'; param: string };

export interface FlowStageRequest {
  task: 'detect_flow';
  stage: 1;
  input: string;
  conversation: StageTurn[];
  flows: StageFlow[];
  llm: StageLlm;
  systemOne: StageSystemOne<FlowQuestionRef>;
}
export interface ParameterStageRequest {
  task: 'extract_parameters';
  stage: 2;
  input: string;
  conversation: StageTurn[];
  flow: { id: string; name: string; parameterInstructions?: string; parameters: StageParameter[] };
  llm: StageLlm;
  /** null when the flow declares no enum or boolean parameter */
  systemOne: StageSystemOne<ParameterQuestionRef> | null;
  /** parameters only a text model can answer (free text) */
  freeText: string[];
}
export type IntentStageRequest = FlowStageRequest | ParameterStageRequest;
/** System One's answers, keyed by question id. */
export type StageSystemOneAnswers = Record<string, { noul?: unknown } | undefined> | undefined;

// ── the rules: written once, rendered for both executors ─────────────────────────────────────────────
const FLOW_TRUE = "The latest message, read with the conversation, is what the workflow's description says should start it: the user asks for its action or information, or raises the problem it exists to handle. Also when it accepts the assistant's offer in the conversation to start or resume it (assistant: \"Shall I try the payment again?\" → user: \"yes\").";
const FLOW_FALSE = "It only shares a topic with the workflow, is not what the workflow's description covers, or is a greeting, an acknowledgement or a fragment that asks for nothing.";
/** A question usually asks for information the assistant gives itself; it is weighed before it is taken as a trigger. */
const QUESTION_RULE = "A question usually asks for information the assistant can give itself. Consider it carefully: it starts a workflow only when it asks for that workflow's action or raises the problem it exists to handle, never because it mentions the workflow's subject (\"can I pay with this card at a store?\" asks how the card is used, not to make a payment).";
const PARAMETER_RULES = [
  'Give a value only when the user gave it, in the latest message or earlier in the conversation. Never guess.',
  "Write it as the parameter's rule says; otherwise the value alone, in the user's words (never the whole sentence around it).",
  'A short answer to the assistant\'s last message ("1", "yes", "the first one") chooses what that message offered.',
  'A plain yes to the assistant\'s last message, when it asked the user to confirm values, gives those values as the user\'s own (assistant: "You want to pay $40 to sub account 80?" → user: "yes": 40 and 80; "¿Desea pagar $40 a la subcuenta 80?" → "sí": 40 and 80). A yes to a question that confirmed no value gives none ("Your payment of $40 was successful. Anything else?" → "yes": none).',
  'When the user gave a value more than once, the latest one counts.',
  'A value the user did not give is null.',
];
const ENUM_TRUE = (value: string) => `The parameter's rule makes \`${value}\` its value for what the user said.`;
const ENUM_FALSE = 'Another value, or none, is its value; or the user has not said enough to tell.';
const BOOLEAN_TRUE = "The parameter's rule makes it true for what the user said.";
const BOOLEAN_FALSE = 'The rule does not make it true, or the user has not said enough to tell.';

const isEnum = (p: StageParameter) => Array.isArray(p.enum) && p.enum.length > 0;
const isBoolean = (p: StageParameter) => p.type === 'boolean';
/** The flow's own parameters, never asked of the user. */
export const isInternalParameter = (p: StageParameter | FlowParameterDefinition) =>
  (p as StageParameter).internal === true || /^\s*internal\b/i.test(String(p.description ?? ''));

const conversationText = (conversation: StageTurn[], input: string) =>
  `${conversation.length ? `<conversation>\n${conversation.map(t => `${t.role}: ${t.content}`).join('\n')}\n</conversation>\n` : ''}<latest-message>\n${input}\n</latest-message>`;
const stateOf = (conversation: StageTurn[], input: string, instructions: string) => ({
  assistant_instructions: instructions,
  conversation: conversation.map(t => ({ role: t.role, content: t.content })),
  latest_message: input,
});
const jsonTail = (schema: Record<string, unknown>) =>
  `\n\n<json-schema>\n${JSON.stringify(schema)}\n</json-schema>\n\nRespond ONLY with valid JSON matching the schema. No other text.`;

// ── stage 1 ───────────────────────────────────────────────────────────────────────────────────────────
/**
 * Stage 1's instructions for both executors. `flows` are the primaries offered.
 *
 * System One gets ONE request with two questions over the same list: `route`, a `choice` among the flows (each
 * option's criterion is its description, so every flow is weighed against the others), and `any`, a `noul`
 * asking whether the message starts any of them. TypeSafe documents that a "none of the above" option may not
 * work well and advises the companion noul.
 */
export function buildFlowStage(input: string, conversation: StageTurn[], flows: StageFlow[]): FlowStageRequest {
  const names = flows.map(f => f.name);
  const schema = {
    type: 'object', additionalProperties: false, required: ['flowName'],
    properties: { flowName: { type: 'string', enum: [...names, 'None'] } },
  };
  const list = flows.map(f => `- ${f.name}: ${f.description}`);
  const system = [
    'Decide which workflow, if any, the latest message starts.',
    `A workflow is chosen when: ${FLOW_TRUE}`,
    `"None" when: ${FLOW_FALSE}`,
    QUESTION_RULE,
    'Answer with the exact workflow name, or "None".',
    '',
    '<workflows>',
    ...list,
    '</workflows>',
  ].join('\n') + jsonTail(schema);
  const workflows = Object.fromEntries(flows.map(f => [f.name, f.description]));
  const questions: Record<string, unknown> = {
    any: {
      type: 'noul',
      criteria: { true: `${FLOW_TRUE} The workflow is one of \`workflows\`.`, false: `${FLOW_FALSE} ${QUESTION_RULE}` },
      instructions: { workflows, question: 'Should the latest message start one of the workflows in `workflows`?' },
    },
  };
  questions.route = {
    type: 'choice', criteria: workflows,
    instructions: 'Which workflow does the latest message, read with the conversation, come closest to starting?',
  };
  const index: FlowQuestionRef[] = [{ id: 'any' }, { id: 'route' }];
  return {
    task: 'detect_flow', stage: 1, input, conversation, flows,
    llm: { system, user: conversationText(conversation, input), schema },
    systemOne: { state: stateOf(conversation, input, 'Decide which workflow, if any, the latest message starts.'), questions, index },
  };
}

/** A text model's stage-1 answer as the canonical reply; throws when it names no offered flow. */
export function decodeFlowLlm(text: string, stage: FlowStageRequest): { flowName: string } {
  const parsed = parseJsonObject(text);
  const said = String(parsed.flowName ?? '').trim();
  if (/^(none|null)$/i.test(said)) {
    return { flowName: 'None' };
  } else {
    const flow = stage.flows.find(f => f.name.toLowerCase() === said.toLowerCase());
    if (!flow) throw new Error(`stage 1: "${said.slice(0, 60)}" is not an offered workflow`);
    return { flowName: flow.name };
  }
}

/**
 * System One's stage-1 answers as the canonical reply. `any` at or above the threshold starts the flow `route`
 * chose; below it, "None". A weak start (`any` below WEAK_START) is "None" too when the route is split, its top flow
 * under SPLIT_ROUTE_SHARE: unsure a flow is wanted and unsure which, the Guru answers (prod 2026-10-29: 'Esta
 * cancelación afecta mi crédito?' after a cancellation, any 0.51, restarted CancelService). `scores` are the top three flows by the chance that each is the one started,
 * any × its route probability (for logs and the host's near-miss hedge); `any` is logged with them. Throws when
 * either answer is missing or names no offered flow.
 */
export function decodeFlowSystemOne(
  answers: StageSystemOneAnswers,
  stage: FlowStageRequest,
  { threshold = STAGE_YES_THRESHOLD } = {}
): { flowName: string; scores: { name: string; p: number }[]; any: number } {
  const any = Number((answers?.any as { noul?: unknown } | undefined)?.noul);
  if (!Number.isFinite(any)) throw new Error('System One: question any unanswered');
  const names = stage.flows.map(f => f.name);
  const route = answers?.route as { choice?: unknown; probabilities?: Record<string, unknown> } | undefined;
  const raw = route?.probabilities;
  if (!raw || typeof raw !== 'object') throw new Error('System One: question route unanswered');
  if (!names.includes(String(route?.choice))) throw new Error(`System One: route chose "${String(route?.choice).slice(0, 60)}", not an offered workflow`);
  const probabilities: Record<string, number> = Object.fromEntries(names.map(n => [n, Number(raw[n]) || 0]));
  const ranked = names.map(n => ({ name: n, p: any * probabilities[n] })).sort((a, b) => b.p - a.p);
  const scores = ranked.slice(0, 3);
  const split = any < WEAK_START && !!ranked[0] && probabilities[ranked[0].name] < SPLIT_ROUTE_SHARE;
  const flowName = any >= threshold && ranked[0] && !split ? ranked[0].name : 'None';
  return { flowName, scores, any };
}

/**
 * A System One "None" that is a near miss: the chance that at least one of its two top flows applies,
 * 1 − (1 − p1)(1 − p2), clears the threshold — a flow is wanted and the doubt is which. A host hedge waits
 * for the other executor on it rather than accepting "None".
 */
export function isNearMiss(scores: { p: number }[], threshold: number = STAGE_YES_THRESHOLD): boolean {
  const [a = 0, b = 0] = (scores || []).map(s => Number(s?.p) || 0).sort((x, y) => y - x);
  return a > 0 && 1 - (1 - a) * (1 - b) >= threshold;
}

// ── stage 2 ───────────────────────────────────────────────────────────────────────────────────────────
/** Does `parameters` hold anything stage 2 asks (a parameter that is not internal)? */
export function hasStageParameters(parameters: (StageParameter | FlowParameterDefinition)[] | undefined): boolean {
  return (parameters || []).some(p => p && p.name && !isInternalParameter(p));
}

/** Stage 2's instructions for the selected flow, for both executors. */
export function buildParameterStage(
  input: string,
  conversation: StageTurn[],
  flow: { id: string; name: string; parameterInstructions?: string; parameters?: (StageParameter | FlowParameterDefinition)[] }
): ParameterStageRequest {
  const params: StageParameter[] = (flow.parameters || []).filter(p => p && p.name && !isInternalParameter(p))
    .map(p => ({ name: p.name, ...(p.type ? { type: p.type } : {}), ...(Array.isArray(p.enum) ? { enum: [...p.enum] } : {}), description: String(p.description ?? ''), ...(p.jsonSchema ? {jsonSchema:structuredClone(p.jsonSchema)} : {}) }));
  const typeOf = (p: StageParameter) => (p.type === 'boolean' ? 'boolean' : p.type === 'number' || p.type === 'integer' ? 'number' : 'string');
  const schema = {
    type: 'object', additionalProperties: false, required: params.map(p => p.name),
    properties: Object.fromEntries(params.map(p => [p.name, p.jsonSchema ? {anyOf:[p.jsonSchema,{type:'null'}]} : isEnum(p) ? { type: ['string', 'null'], enum: [...(p.enum as string[]), null] } : { type: [typeOf(p), 'null'] }])),
  };
  const line = (p: StageParameter) => `- ${p.name} (${isEnum(p) ? `one of: ${(p.enum as string[]).join(' | ')}` : p.jsonSchema ? p.type || 'object' : typeOf(p)}): ${p.description}`;
  const instructions = String(flow.parameterInstructions ?? '').trim();
  const rules = [
    `The workflow ${flow.name} was chosen. Extract the values the user gave for its parameters.`,
    ...PARAMETER_RULES.map(r => `- ${r}`),
    ...(instructions ? ['', instructions] : []),
  ].join('\n');
  const system = `${rules}\n\n<parameters>\n${params.map(line).join('\n')}\n</parameters>` + jsonTail(schema);

  const closed = params.filter(p => isEnum(p) || isBoolean(p));
  let systemOne: StageSystemOne<ParameterQuestionRef> | null = null;
  if (closed.length) {
    const questions: Record<string, unknown> = {};
    const index: ParameterQuestionRef[] = [];
    closed.forEach((p, k) => {
      if (isEnum(p)) {
        (p.enum as string[]).forEach((value, v) => {
          const id = `p${k}v${v}`;
          questions[id] = { type: 'noul', criteria: { true: ENUM_TRUE(value), false: ENUM_FALSE }, instructions: { parameter: { name: p.name }, candidate_value: value, question: `Is \`${value}\` the value of \`${p.name}\`?` } };
          index.push({ id, kind: 'enum', param: p.name, value });
        });
      } else {
        const id = `p${k}`;
        questions[id] = { type: 'noul', criteria: { true: BOOLEAN_TRUE, false: BOOLEAN_FALSE }, instructions: { parameter: { name: p.name }, question: `Is \`${p.name}\` true?` } };
        index.push({ id, kind: 'boolean', param: p.name });
      }
    });
    const ruleSet = Object.fromEntries(closed.map(p => [p.name, p.description]));
    systemOne = { state: stateOf(conversation, input, `${rules}\n\nEach question asks for one parameter. The rule of each parameter, by name:\n${JSON.stringify(ruleSet, null, 1)}`), questions, index };
  } else {
    // no closed value to classify
  }
  return {
    task: 'extract_parameters', stage: 2, input, conversation,
    flow: { id: flow.id, name: flow.name, ...(instructions ? { parameterInstructions: instructions } : {}), parameters: params },
    llm: { system, user: conversationText(conversation, input), schema },
    systemOne,
    freeText: params.filter(p => !isEnum(p) && !isBoolean(p)).map(p => p.name),
  };
}

/** A text model's stage-2 answer as the canonical reply: declared parameters with a value only. Throws on non-JSON. */
export function decodeParametersLlm(text: string, stage: ParameterStageRequest): { parameters: Record<string, unknown> } {
  const parsed = parseJsonObject(text);
  const out: Record<string, unknown> = {};
  for (const p of stage.flow.parameters) {
    const v = parsed[p.name];
    if (v === null || v === undefined || (typeof v === 'string' && (v.trim() === '' || /^(null|none|n\/a)$/i.test(v.trim())))) {
      continue; // not given
    } else {
      out[p.name] = typeof v === 'string' ? v.trim() : v;
    }
  }
  return { parameters: out };
}

/**
 * System One's stage-2 answers as the canonical reply: an enum takes its argmax value if it clears the cut, a
 * boolean is true if it clears it; otherwise the parameter is omitted (the flow asks), never set false.
 */
export function decodeParametersSystemOne(
  answers: StageSystemOneAnswers,
  stage: ParameterStageRequest,
  { threshold = STAGE_YES_THRESHOLD } = {}
): { parameters: Record<string, unknown> } {
  if (!stage.systemOne) return { parameters: {} };
  const p = answered(answers, stage.systemOne.index);
  const parameters: Record<string, unknown> = {};
  const best = new Map<string, { value: string; p: number }>();
  for (const q of stage.systemOne.index) {
    const prob = p.get(q.id) as number;
    if (q.kind === 'boolean') {
      if (prob >= threshold) parameters[q.param] = true; else { /* omitted */ }
    } else {
      const cur = best.get(q.param);
      if (!cur || prob > cur.p) best.set(q.param, { value: q.value, p: prob }); else { /* lower */ }
    }
  }
  for (const [param, { value, p: prob }] of best) {
    if (prob >= threshold) parameters[param] = value; else { /* omitted: the flow asks */ }
  }
  return { parameters };
}

/** Is this jsfe's stage request (a host's aiCallback receives it as the 4th argument)? */
export function isIntentStageRequest(request: unknown): request is IntentStageRequest {
  const r = request as IntentStageRequest | null | undefined;
  return !!r && ((r.task === 'detect_flow' && (r as FlowStageRequest).stage === 1) || (r.task === 'extract_parameters' && (r as ParameterStageRequest).stage === 2));
}

// ── shared ────────────────────────────────────────────────────────────────────────────────────────────
function parseJsonObject(text: string): Record<string, unknown> {
  const t = String(text ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse((t.match(/\{[\s\S]*\}/) || [t])[0]);
  } catch {
    throw new Error(`not JSON: ${t.slice(0, 60)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not a JSON object');
  return parsed as Record<string, unknown>;
}

function answered(answers: StageSystemOneAnswers, index: { id: string }[]): Map<string, number> {
  const p = new Map<string, number>();
  for (const q of index) {
    const noul = Number(answers?.[q.id]?.noul);
    if (!Number.isFinite(noul)) throw new Error(`System One: question ${q.id} unanswered`);
    p.set(q.id, noul);
  }
  return p;
}
