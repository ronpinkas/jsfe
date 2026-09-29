/**
 * Intent detection (`detect_flow`) ⇄ TypeSafe System One — mapping only, zero imports.
 *
 * jsfe hands aiCallback a 4th argument on intent detection: the call in structured form,
 * `{ task: 'detect_flow', input, conversation, flows }`, each flow with its parameters and any
 * declared `enum`. That is what a classifier needs, so this module maps it to System One questions
 * and the answers back to the reply jsfe expects: `{ flowName, parameters }`. Two stages:
 *
 *   1. one noul per flow: "should `latest_message` start this workflow?" — argmax, if it clears
 *      INTENT_YES_THRESHOLD, else "None".
 *   2. only for the chosen flow, and only if it declares one: a noul per ENUM value and per
 *      BOOLEAN parameter.
 *   Every other parameter (free text: a city, an account number…) is not the classifier's; the
 *   host decides whether to take it from a text model — see freeTextParameters().
 *
 * The host sends the bodies (POST …/v1/systemone) and owns the HTTP, the key and the timeouts.
 *
 * A question that comes back without a usable answer FAILS the call, so the host can fall back
 * to a text model. A missing flow answer read as "no" would silently send the turn nowhere.
 */

// Type-only: erased at compile time, so importing jsfe/host never loads the engine.
import type { DetectFlowRequest } from '../index.js';

/** One flow entry of the structured intent-detection request. */
export type DetectFlowRequestFlow = DetectFlowRequest['flows'][number];

/** A noul at or above this is a yes. */
export const INTENT_YES_THRESHOLD = 0.5;

const FLOW_QUESTION = 'Should `latest_message` start the workflow described in `flow`?';
const FLOW_CRITERIA = {
  true: "`latest_message`, read with `conversation`, is what `flow`'s description says should trigger it: the user asks for its action or information, or raises the problem it exists to handle.",
  false: "It only shares a topic with `flow`, is something `flow`'s description does not cover, or is a greeting, acknowledgement or fragment that asks for nothing. A question about an available balance or credit is not a request to pay, and a complaint about a charge is not a request to pay.",
};
const ENUM_CRITERIA = (value: string) => ({
  true: `The rules for \`parameter\` make \`${value}\` the correct value for what the customer said.`,
  false: 'Another value, or none, is correct; or the customer has not said enough to tell.',
});
const BOOLEAN_CRITERIA = {
  true: 'The rules for `parameter` make it true for what the customer said.',
  false: 'The rules do not make it true, or the customer has not said enough to tell.',
};

type Param = NonNullable<DetectFlowRequestFlow['parameters']>[number];

const isEnum = (p: Param) => Array.isArray(p.enum) && p.enum.length > 0;
const isBoolean = (p: Param) => p.type === 'boolean';

/** One System One request body plus the index that maps each question id back to what it asks. */
export interface SystemOneCall<I> {
  body: { model: string; state: Record<string, unknown>; questions: Record<string, unknown> };
  index: I[];
}
export interface FlowQuestion { id: string; flow: number }
export type ParameterQuestion =
  | { id: string; kind: 'enum'; param: string; value: string }
  | { id: string; kind: 'boolean'; param: string };
/** System One's answers, keyed by question id. */
export type SystemOneAnswers = Record<string, { noul?: unknown } | undefined> | undefined;
export interface IntentReply { flowName: string; parameters: Record<string, unknown> }
export interface MapOptions { model: string; assistantInstructions: string }

/** Is this a jsfe intent-detection request this module can map? */
export function isDetectFlowRequest(request: unknown): request is DetectFlowRequest {
  const r = request as DetectFlowRequest | null | undefined;
  return !!r && r.task === 'detect_flow' && Array.isArray(r.flows) && r.flows.length > 0;
}

/** Parameters of `flow` the classifier does not answer: neither an enum nor a boolean. */
export function freeTextParameters(flow: DetectFlowRequestFlow | null | undefined): string[] {
  return (flow?.parameters || []).filter(p => !isEnum(p) && !isBoolean(p)).map(p => p.name);
}

const stateOf = (request: DetectFlowRequest, assistantInstructions: string) => ({
  assistant_instructions: assistantInstructions,
  conversation: (request.conversation || []).map(t => ({ role: t.role, content: t.content })),
  latest_message: request.input,
});

function answersOf(answers: SystemOneAnswers, index: { id: string }[]): Map<string, number> {
  const p = new Map<string, number>();
  for (const q of index) {
    const noul = Number(answers?.[q.id]?.noul);
    if (!Number.isFinite(noul)) {
      throw new Error(`System One intent: question ${q.id} unanswered`);
    } else {
      p.set(q.id, noul);
    }
  }
  return p;
}

/**
 * STAGE 1 — which flow. One noul per flow. `assistantInstructions` is jsfe's own task + rules (the
 * text prompt's system instruction without its JSON-schema tail), so a classifier and a text model
 * judge by one rule set.
 */
export function toFlowRequest(request: DetectFlowRequest, { model, assistantInstructions }: MapOptions): SystemOneCall<FlowQuestion> {
  const questions: Record<string, unknown> = {};
  const index: FlowQuestion[] = [];
  request.flows.forEach((flow, f) => {
    const id = `f${f}`;
    questions[id] = {
      type: 'noul', criteria: FLOW_CRITERIA,
      instructions: { flow: { name: flow.name, description: String(flow.description ?? '') }, question: FLOW_QUESTION },
    };
    index.push({ id, flow: f });
  });
  return { body: { model, state: stateOf(request, assistantInstructions), questions }, index };
}

/**
 * Decodes stage 1. Throws if any question is unanswered. Returns `{ flow, scores }` — `flow` is the
 * chosen request entry, or null for "None"; `scores` the top three, for logging.
 */
export function fromFlowAnswers(
  answers: SystemOneAnswers,
  index: FlowQuestion[],
  request: DetectFlowRequest,
  threshold: number = INTENT_YES_THRESHOLD
): { flow: DetectFlowRequestFlow | null; scores: { name: string; p: number }[] } {
  const p = answersOf(answers, index);
  const ranked = index
    .map(q => ({ name: request.flows[q.flow].name, f: q.flow, p: p.get(q.id) as number }))
    .sort((a, b) => b.p - a.p);
  const scores = ranked.slice(0, 3).map(({ name, p: prob }) => ({ name, p: prob }));
  return { flow: ranked[0] && ranked[0].p >= threshold ? request.flows[ranked[0].f] : null, scores };
}

/** Does `flow` declare anything stage 2 answers (an enum or a boolean)? */
export function hasJevParameters(flow: DetectFlowRequestFlow | null | undefined): boolean {
  return (flow?.parameters || []).some(p => isEnum(p) || isBoolean(p));
}

/**
 * STAGE 2 — the chosen flow's enum and boolean parameters: one noul per enum value, one per
 * boolean. Each parameter's description is its rule. Free text is not asked.
 *
 * The flow and the rules are stated ONCE, in `assistant_instructions`; each question names its
 * parameter only. Repeating a long rule in every question of its enum multiplies the body size
 * and the latency for identical answers.
 */
export function toParameterRequest(
  request: DetectFlowRequest,
  flow: DetectFlowRequestFlow,
  { model, assistantInstructions }: MapOptions
): SystemOneCall<ParameterQuestion> {
  const questions: Record<string, unknown> = {};
  const index: ParameterQuestion[] = [];
  const flowRef = { name: flow.name };
  const rules: Record<string, string> = {};
  (flow.parameters || []).forEach((p, k) => {
    const parameter = { name: p.name };
    if (isEnum(p)) {
      (p.enum as string[]).forEach((value, v) => {
        const id = `p${k}v${v}`;
        questions[id] = {
          type: 'noul', criteria: ENUM_CRITERIA(value), instructions: {
            flow: flowRef, parameter, candidate_value: value,
            question: `Is \`${value}\` the correct value of \`${p.name}\` for \`latest_message\`?`,
          },
        };
        index.push({ id, kind: 'enum', param: p.name, value });
      });
    } else if (isBoolean(p)) {
      const id = `p${k}`;
      questions[id] = {
        type: 'noul', criteria: BOOLEAN_CRITERIA, instructions: {
          flow: flowRef, parameter, question: `Should \`${p.name}\` be true for \`latest_message\`?`,
        },
      };
      index.push({ id, kind: 'boolean', param: p.name });
    } else {
      return; // free text — not the classifier's; see freeTextParameters()
    }
    rules[p.name] = String(p.description ?? '');
  });
  const instructions = `${assistantInstructions}\n\nThe workflow \`${flow.name}\` starts for \`latest_message\`: ${String(flow.description ?? '')}\n\n` +
    `Each question asks for one of its parameters. The rules for each parameter, by name:\n${JSON.stringify(rules, null, 1)}`;
  return { body: { model, state: stateOf(request, instructions), questions }, index };
}

/**
 * Decodes stage 2 into parameters: an enum takes its argmax value if it clears the cut, a boolean is
 * true if it clears it; otherwise the parameter is OMITTED (the flow asks / its default applies),
 * never set false. Throws if any question is unanswered.
 */
export function fromParameterAnswers(
  answers: SystemOneAnswers,
  index: ParameterQuestion[],
  threshold: number = INTENT_YES_THRESHOLD
): Record<string, unknown> {
  const p = answersOf(answers, index);
  const parameters: Record<string, unknown> = {};
  const best = new Map<string, { value: string; p: number }>();
  for (const q of index) {
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
  return parameters;
}

/**
 * Merges a text model's free-text parameters into the classifier's reply — only when the text model
 * chose the SAME flow (its parameters were extracted for its own choice), and only the parameters
 * the classifier does not answer. The classifier's enum/boolean values always win.
 */
export function mergeTextParameters(
  jevReply: IntentReply,
  jevFlow: DetectFlowRequestFlow | null | undefined,
  textReply: { flowName?: unknown; parameters?: Record<string, unknown> } | null | undefined
): IntentReply {
  if (!jevFlow || !textReply || String(textReply.flowName).toLowerCase() !== jevFlow.name.toLowerCase()) {
    return jevReply;
  } else {
    const free = new Set(freeTextParameters(jevFlow));
    const extra = Object.fromEntries(Object.entries(textReply.parameters || {}).filter(([k]) => free.has(k)));
    return { flowName: jevReply.flowName, parameters: { ...extra, ...jevReply.parameters } };
  }
}
