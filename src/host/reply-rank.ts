/**
 * The reply ranker: what the caller's latest message does with the question a flow asked — the instructions and the
 * decoders, zero runtime imports. jsfe asks it at a contextual DISPATCH (`onResponse: "continue"`), passing the request
 * below to aiCallback as its 4th argument (task 'rank_reply'). The host is the executor: System One (Jev) answers, a
 * text model covers it (the host's aiCallbackRank), and the CANONICAL reply is a JSON string: { "option": "<name>" }.
 *
 *   answers      the reply answers the question (the default: an open question's reply that clears no option is its answer)
 *   abort        the caller withdraws the request and asks for nothing else
 *   new_request  the caller asks for something else: a different service or an unrelated question
 *
 * Both executors' instructions come from the same criteria. A host that does not know this task answers the `llm`
 * instructions with its text model, which is a complete answer.
 */

export const REPLY_OPTIONS = ['answers', 'abort', 'new_request'] as const;
export type ReplyOption = typeof REPLY_OPTIONS[number];
/** An open question's reply that clears no option is its answer (owner decision 2026-10-26). */
export const REPLY_DEFAULT: ReplyOption = 'answers';
/** A noul at or above this is a yes. */
export const REPLY_YES_THRESHOLD = 0.5;

export interface ReplyTurn { role: 'user' | 'assistant'; content: string }
export interface ReplyRankRequest {
  task: 'rank_reply';
  input: string;
  conversation: ReplyTurn[];
  /** the flow's question and what answers it (the step's responseContext, interpolated) */
  question: string;
  options: ReplyOption[];
  llm: { system: string; user: string; schema: Record<string, unknown> };
  systemOne: { state: Record<string, unknown>; questions: Record<string, unknown>; index: { id: string; option: ReplyOption }[] };
}

// ── the criteria: written once, rendered for both executors ─────────────────────────────────────────
const CRITERIA: Record<ReplyOption, { true: string; false: string }> = {
  answers: {
    true: 'The latest message responds to the current question, in any words: the requested information, a correction of it, or that the caller does not know, does not have or cannot give it (datos incorrectos, no lo sé, no lo tengo, no puedo dar el dato), including asking how to provide it.',
    false: 'It withdraws the request, or asks for a different service or an unrelated question.',
  },
  abort: {
    true: 'The latest message withdraws the current request (never mind, forget it, I no longer want it) and asks for nothing else.',
    false: 'It responds to the current question, or asks for something.',
  },
  new_request: {
    true: 'The latest message asks for a different service or action, or asks a question unrelated to the current question.',
    false: 'It responds to the current question, or only withdraws the request.',
  },
};
const TASK = 'A workflow asked the caller a question. Decide what the caller\'s latest message does with it.';

const conversationText = (conversation: ReplyTurn[], input: string) =>
  `${conversation.length ? `<conversation>\n${conversation.map(t => `${t.role}: ${t.content}`).join('\n')}\n</conversation>\n` : ''}<latest-message>\n${input}\n</latest-message>`;

/** The reply ranker's instructions for both executors. */
export function buildReplyRank(input: string, conversation: ReplyTurn[], question: string): ReplyRankRequest {
  const options = [...REPLY_OPTIONS];
  const schema = {
    type: 'object', additionalProperties: false, required: ['option'],
    properties: { option: { type: 'string', enum: options } },
  };
  const system = [
    TASK,
    '',
    '<current-question>',
    question,
    '</current-question>',
    '',
    ...options.map(o => `- ${o}: ${CRITERIA[o].true}`),
    `When none clearly applies: ${REPLY_DEFAULT}.`,
    '',
    '<json-schema>',
    JSON.stringify(schema),
    '</json-schema>',
    '',
    'Respond ONLY with valid JSON matching the schema. No other text.',
  ].join('\n');
  const questions: Record<string, unknown> = {};
  const index: { id: string; option: ReplyOption }[] = [];
  options.forEach((o, i) => {
    const id = `r${i}`;
    questions[id] = { type: 'noul', criteria: CRITERIA[o], instructions: { option: o, question: `Does the latest message do what \`${o}\` describes?` } };
    index.push({ id, option: o });
  });
  return {
    task: 'rank_reply', input, conversation, question, options,
    llm: { system, user: conversationText(conversation, input), schema },
    systemOne: {
      state: {
        assistant_instructions: `${TASK}\n\nThe current question:\n${question}`,
        conversation: conversation.map(t => ({ role: t.role, content: t.content })),
        latest_message: input,
      },
      questions,
      index,
    },
  };
}

/** A text model's answer as the canonical reply; throws when it names no offered option. */
export function decodeReplyRankLlm(text: string, request: ReplyRankRequest): { option: ReplyOption } {
  const parsed = parseJsonObject(text);
  const said = String(parsed.option ?? '').trim().toLowerCase();
  const option = request.options.find(o => o === said);
  if (!option) throw new Error(`rank_reply: "${said.slice(0, 40)}" is not an offered option`);
  return { option };
}

/**
 * System One's answers as the canonical reply: the highest-rated option when it clears the cut, else the default
 * (`answers`), with every option's probability (for logs). Throws if any question is unanswered.
 */
export function decodeReplyRankSystemOne(
  answers: Record<string, { noul?: unknown } | undefined> | undefined,
  request: ReplyRankRequest,
  { threshold = REPLY_YES_THRESHOLD } = {}
): { option: ReplyOption; scores: Record<string, number>; fallback: boolean } {
  const scores: Record<string, number> = {};
  for (const q of request.systemOne.index) {
    const noul = Number(answers?.[q.id]?.noul);
    if (!Number.isFinite(noul)) throw new Error(`System One: question ${q.id} unanswered`);
    scores[q.option] = noul;
  }
  const [best] = request.systemOne.index.map(q => q.option).sort((a, b) => scores[b] - scores[a]);
  if (best && scores[best] >= threshold) {
    return { option: best, scores, fallback: false };
  } else {
    return { option: REPLY_DEFAULT, scores, fallback: true };
  }
}

/** Is this jsfe's reply-rank request (a host's aiCallback receives it as the 4th argument)? */
export function isReplyRankRequest(request: unknown): request is ReplyRankRequest {
  const r = request as ReplyRankRequest | null | undefined;
  return !!r && r.task === 'rank_reply' && Array.isArray(r.options) && !!r.systemOne && !!r.llm;
}

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
