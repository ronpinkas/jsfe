/**
 * The reply ranker: what the caller's latest message does with the question a flow asked — the instructions and the
 * decoders, zero runtime imports. jsfe asks it at a contextual DISPATCH (`onResponse: "continue"`), passing the request
 * below to aiCallback as its 4th argument (task 'rank_reply'). The host is the executor: System One (Jev) answers, a
 * text model covers it (the host's aiCallbackRank), and the CANONICAL reply is a JSON string: { "option": "<name>" }.
 *
 *   answers      the reply answers the question (the default: an open question's reply that clears no option is its answer)
 *   abort        the caller withdraws the request and asks for nothing else
 *   new_request  the caller asks for something else: a different service or an unrelated question
 *   choice:<key> the reply picks one of the question's declared choices (only when the step declares them); `answers`
 *                is then a reply that picks none of them
 *
 * Both executors' instructions come from the same criteria. A host that does not know this task answers the `llm`
 * instructions with its text model, which is a complete answer.
 */

export const REPLY_OPTIONS = ['answers', 'abort', 'new_request'] as const;
/** The fixed options, or `choice:<key>` for a declared choice. */
export type ReplyOption = typeof REPLY_OPTIONS[number] | `choice:${string}`;
/** A choice the question offers: its key and the words that describe it to the ranker. */
// route 'new_request': a pick of this choice is a new request, routed by intent detection (an exit the flow declares).
export interface ReplyChoice { key: string; label: string; route?: 'new_request' }
export const CHOICE_PREFIX = 'choice:';
/** An open question's reply that clears no option is its answer (owner decision 2026-10-26). */
export const REPLY_DEFAULT: ReplyOption = 'answers';
/** A noul at or above this is a yes. */
export const REPLY_YES_THRESHOLD = 0.5;
/**
 * The cut an option must clear, by what a wrong pick costs: an option not listed here takes REPLY_YES_THRESHOLD. Set
 * from labelled prod replies (owner 2026-10-28), never guessed.
 */
export const REPLY_CUTS: Partial<Record<ReplyOption, number>> = {
  // a NO cancels what the caller was confirming. Measured 2026-10-28: replies that are not a NO ("imposible", "no es un")
  // rated 0.51-0.63, real NOs ("No me interesa", "No de verdad", "mejor no") 0.67-0.95
  'choice:no': 0.65,
  // a new request leaves the question unanswered. Unclear replies at a question ("la curazán" at a confirmation, "Es que
  // mi tarjeta se cambió" at the pay menu) rated 0.47-0.58 and vary ±0.04 between calls; they are asked again
  new_request: 0.6,
};

export interface ReplyTurn { role: 'user' | 'assistant'; content: string }
export interface ReplyRankRequest {
  task: 'rank_reply';
  input: string;
  conversation: ReplyTurn[];
  /** the flow's question and what answers it (the step's responseContext, interpolated) */
  question: string;
  options: ReplyOption[];
  /** the question's declared choices, when it offers any */
  choices?: ReplyChoice[];
  llm: { system: string; user: string; schema: Record<string, unknown> };
  systemOne: { state: Record<string, unknown>; questions: Record<string, unknown>; index: { id: string; option: ReplyOption }[] };
}

// ── the criteria: written once, rendered for both executors ─────────────────────────────────────────
const CRITERIA: Record<typeof REPLY_OPTIONS[number], { true: string; false: string }> = {
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
// With declared choices, `answers` is the reply that responds without picking any of them.
const ANSWERS_WITHOUT_CHOICE = {
  true: 'The latest message responds to the current question but picks none of the offered options.',
  false: 'It picks one of the offered options, withdraws the request, or asks for something else.',
};
const choiceCriteria = (c: ReplyChoice) => ({
  true: `The latest message picks the option "${c.label}", in any words, or says it already chose it.`,
  false: 'It picks another option or none of them, withdraws the request, or asks for something else.',
});
const criteriaOf = (option: ReplyOption, choices: ReplyChoice[]) => {
  if (option.startsWith(CHOICE_PREFIX)) {
    return choiceCriteria(choices.find(c => CHOICE_PREFIX + c.key === option)!);
  } else if (option === 'answers' && choices.length) {
    return ANSWERS_WITHOUT_CHOICE;
  } else {
    return CRITERIA[option as typeof REPLY_OPTIONS[number]];
  }
};

const conversationText = (conversation: ReplyTurn[], input: string) =>
  `${conversation.length ? `<conversation>\n${conversation.map(t => `${t.role}: ${t.content}`).join('\n')}\n</conversation>\n` : ''}<latest-message>\n${input}\n</latest-message>`;

/** The reply ranker's instructions for both executors. */
export function buildReplyRank(input: string, conversation: ReplyTurn[], question: string, choices: ReplyChoice[] = []): ReplyRankRequest {
  const options: ReplyOption[] = [...choices.map(c => `${CHOICE_PREFIX}${c.key}` as ReplyOption), ...REPLY_OPTIONS];
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
    ...options.map(o => `- ${o}: ${criteriaOf(o, choices).true}`),
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
  // With declared choices, `answers` ("picks none of them") is not a question System One answers: it competes with the
  // choices it excludes. It is what is left when no option clears its cut (owner 2026-10-28). A text model still has it.
  // An escape (`__agent`) is not the question's own choice: a question that offers only escapes is an open question,
  // where `answers` is the reply (prod 2026-10-28: a city named at "check nearby stores" went to intent detection).
  const ownChoices = choices.some(c => !c.key.startsWith('__'));
  options.filter(o => !(o === 'answers' && ownChoices)).forEach((o, i) => {
    const id = `r${i}`;
    questions[id] = { type: 'noul', criteria: criteriaOf(o, choices), instructions: { option: o, question: `Does the latest message do what \`${o}\` describes?` } };
    index.push({ id, option: o });
  });
  return {
    task: 'rank_reply', input, conversation, question, options, ...(choices.length ? { choices } : {}),
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
 * System One's answers as the canonical reply: the highest-rated option that clears its own cut (REPLY_CUTS, else the
 * threshold), a cleared choice before `answers` and `new_request`; when none does, the default (`answers`: asked again at a choice question, the answer at an open one), with
 * every option's probability (for logs). Throws if any question is unanswered.
 */
export function decodeReplyRankSystemOne(
  answers: Record<string, { noul?: unknown } | undefined> | undefined,
  request: ReplyRankRequest,
  { threshold = REPLY_YES_THRESHOLD, cuts = REPLY_CUTS }: { threshold?: number; cuts?: Partial<Record<ReplyOption, number>> } = {}
): { option: ReplyOption; scores: Record<string, number>; fallback: boolean } {
  const scores: Record<string, number> = {};
  for (const q of request.systemOne.index) {
    const noul = Number(answers?.[q.id]?.noul);
    if (!Number.isFinite(noul)) throw new Error(`System One: question ${q.id} unanswered`);
    scores[q.option] = noul;
  }
  const cleared = request.systemOne.index.map(q => q.option).filter(o => scores[o] >= (cuts[o] ?? threshold)).sort((a, b) => scores[b] - scores[a]);
  // A cleared choice is taken over `answers` and `new_request` (owner 2026-10-28: a request that names an offered option
  // is that option, "Representative." is the agent); only `abort` keeps its rank.
  const choice = cleared.find(o => o.startsWith(CHOICE_PREFIX));
  const best = choice && (cleared[0] === 'answers' || cleared[0] === 'new_request') ? choice : cleared[0];
  if (best) {
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
