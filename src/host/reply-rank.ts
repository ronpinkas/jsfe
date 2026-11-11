/**
 * The reply ranker: what the caller's latest message does with the question a flow asked — the instructions and the
 * decoders, zero runtime imports. jsfe asks it at a contextual DISPATCH (`onResponse: "continue"`), passing the request
 * below to aiCallback as its 4th argument (task 'rank_reply'). The host is the executor: System One (Jev) answers, a
 * text model covers it (the host's aiCallbackRank), and the CANONICAL reply is a JSON string: { "option": "<name>" }.
 *
 *   answers      the reply answers the question (the default: an open question's reply that clears no option is its answer)
 *   abort        the caller withdraws the request and asks for nothing else
 *   new_request  the caller clearly asks for something else: a different service, product or action, or an unrelated question
 *   irrelevant   the reply means nothing here (a stray word, an unfinished sentence, speech to someone else): the question
 *                is asked again and no flow moves. A reason question does not offer it.
 *   concern      the reply objects to or misunderstands what the process does (offered only when a form declares
 *                user_description, passed as `concern`): the form says what it does and how to cancel, then asks again
 *   choice:<key> the reply picks one of the question's declared choices (only when the step declares them); `answers`
 *                is then a reply that picks none of them
 *
 * Both executors' instructions come from the same criteria. A host that does not know this task answers the `llm`
 * instructions with its text model, which is a complete answer.
 */

export const REPLY_OPTIONS = ['answers', 'abort', 'new_request', 'irrelevant'] as const;
/** The fixed options, or `choice:<key>` for a declared choice. */
export type ReplyOption = typeof REPLY_OPTIONS[number] | 'concern' | `choice:${string}`;
/** Offered when the question names what its process does (DISPATCH responseConcern, from a form's user_description). */
export const CONCERN_OPTION = 'concern' as const;
/** A choice the question offers: its key and the words that describe it to the ranker. */
// route 'new_request': a pick of this choice is a new request, routed by intent detection (an exit the flow declares).
// parameters: a pick of this choice also extracts these from the reply (intent stage 2), read as { key, arguments }.
export interface ReplyChoiceParameter { name: string; type: string; description: string }
export interface ReplyChoice { key: string; label: string; route?: 'new_request'; parameters?: ReplyChoiceParameter[] }
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
  // Measured 2026-11-01 on 444 prod replies: a real request never rated 0.5; a name given at a contact question rated 0.64.
  irrelevant: 0.7,
  // a concern costs one explanation and the question again. Not yet cut from labelled prod replies (owner 2026-11-11: Jev
  // decides by score, also over a cleared choice); the live purpose test (prod CA6a93680b…) is its first measurement.
  concern: 0.6,
};
/**
 * `irrelevant` outranks a cleared choice only from here: a false pick can transfer the call. Measured 2026-11-01: "You." and
 * "And, Leslie." at a pay menu rated 0.86 and were taken as a request for a person; "Operator." 0.78 is that request.
 */
export const REPLY_IRRELEVANT_OVER_CHOICE = 0.8;
/**
 * The cut another declared choice must clear to be reported beside the pick (`also`): a reply may ask for two of a menu's
 * facts ("my due date and the amount"). Measured 2026-11-02 on 136 prod replies at the account menu: 0.6 kept those and
 * dropped the neighbours a single question rates 0.50-0.59.
 */
export const REPLY_ALSO_CUT = 0.6;

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
  /** the question asks why the caller does not want this (a cancellation's reason): the step's responseReasonFor */
  reasonFor?: string;
  /** what the process does (the step's responseConcern): offers `concern` */
  concern?: string;
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
    true: 'The latest message withdraws the current request (never mind, forget it, cancel it, I no longer want it) and asks for nothing else.',
    false: 'It responds to the current question, or asks for something else.',
  },
  new_request: {
    true: 'The latest message clearly asks for a different service, product or action, by name or in words, or asks a question unrelated to the current question. A stray word, an unfinished sentence, a remark or speech addressed to someone else does not qualify.',
    false: 'It responds to the current question, only withdraws the request, or does not clearly say what the caller wants.',
  },
  irrelevant: {
    true: 'The latest message means nothing here: a stray word or name, an unfinished sentence, background speech or words addressed to someone else. It names no service, action, product, amount or person to speak to.',
    false: 'It responds to the current question in any words (yes, no, thanks, a name, a number, a question about it), withdraws the request, or names something the caller wants.',
  },
};
const TASK = 'A workflow asked the caller a question. Decide what the caller\'s latest message does with it.';
// A question that asks WHY the caller does not want something (a cancellation's reason): not using, needing or wanting
// it IS the answer, so the generic withdrawal ("I no longer want it") must not read it as one (owner 2026-10-31; prod
// 2026-10-30: "No, la uso", "No necesito más" and "No, no la necesito" at the Club reason ended the request as withdrawn).
const reasonTask = (x: string) => `A workflow is filing the caller's request about something the caller does not want (${x}), and asked for the reason. Decide what the caller's latest message does with that question.`;
// A reason question offers no `abort` (owner 2026-10-31): a reason is never a withdrawal, so the ranker never has to tell
// "I don't need it" from "I'll keep it". A caller who changes their mind declines the request's confirmation, which the
// flow asking for the reason must have (the Curacao cancellation reads the request back before filing it).
const REASON_OPTIONS = ['answers', 'new_request'] as const;
const reasonCriteria = (x: string): Record<typeof REASON_OPTIONS[number], { true: string; false: string }> => ({
  answers: {
    true: `The latest message responds to why the caller does not want ${x}, in any words: that they do not use, need or want it (even when it starts with "no": no la uso, ya no la necesito, I no longer need it, I don't use it), its cost, a problem or complaint, a change in their situation, that they have no reason or prefer not to say, or that they changed their mind.`,
    false: `It asks for a different service or an unrelated question.`,
  },
  new_request: {
    true: `The latest message asks for a different service or action, or asks a question unrelated to the reason for not wanting ${x}.`,
    false: `It responds to the question about the reason.`,
  },
});
// With declared choices, `answers` is the reply that responds without picking any of them.
const ANSWERS_WITHOUT_CHOICE = {
  true: 'The latest message responds to the current question but picks none of the offered options.',
  false: 'It picks one of the offered options, withdraws the request, or asks for something else.',
};
const choiceCriteria = (c: ReplyChoice) => ({
  true: `The latest message picks the option "${c.label}", in any words, or says it already chose it.`,
  false: 'It picks another option or none of them, withdraws the request, or asks for something else.',
});
// The caller objects to or misunderstands what the process does (owner 2026-11-11; prod CA6a93680b…: "It's not a new address.
// I'm just changing the delivery address." at the read-back of the new delivery address).
const concernCriteria = (concern: string) => ({
  true: `The latest message objects to, questions or misunderstands what this process is doing (${concern}): it says the process is not what the caller wants or meant, corrects how the process describes the request, or asks why it is being asked or what it is for, instead of answering the current question.`,
  false: 'It answers the current question in any words (yes, no, a value, a correction of a value), picks an option, withdraws the request, or asks for a different service.',
});
const criteriaOf = (option: ReplyOption, choices: ReplyChoice[], reasonFor = '', concern = '') => {
  if (option === CONCERN_OPTION) {
    return concernCriteria(concern);
  } else if (option.startsWith(CHOICE_PREFIX)) {
    return choiceCriteria(choices.find(c => CHOICE_PREFIX + c.key === option)!);
  } else if (option === 'answers' && choices.length) {
    return ANSWERS_WITHOUT_CHOICE;
  } else if (reasonFor) {
    return reasonCriteria(reasonFor)[option as typeof REASON_OPTIONS[number]];
  } else {
    return CRITERIA[option as typeof REPLY_OPTIONS[number]];
  }
};

const conversationText = (conversation: ReplyTurn[], input: string) =>
  `${conversation.length ? `<conversation>\n${conversation.map(t => `${t.role}: ${t.content}`).join('\n')}\n</conversation>\n` : ''}<latest-message>\n${input}\n</latest-message>`;

/**
 * The reply ranker's instructions for both executors. `reasonFor` (what the caller does not want, e.g. "your Curacao
 * Club membership") ranks the reply as an answer to "why don't you want it?": only `answers` or `new_request`, no
 * choices.
 */
export function buildReplyRank(input: string, conversation: ReplyTurn[], question: string, choices: ReplyChoice[] = [], { reasonFor = '', concern = '' }: { reasonFor?: string; concern?: string } = {}): ReplyRankRequest {
  reasonFor = String(reasonFor || '').trim();
  // A reason question is about the caller's own reason, never the process: it offers no concern.
  concern = reasonFor ? '' : String(concern || '').trim();
  if (reasonFor && choices.length) throw new Error('rank_reply: a reason question (reasonFor) declares no choices');
  const task = reasonFor ? reasonTask(reasonFor) : TASK;
  const options: ReplyOption[] = [...choices.map(c => `${CHOICE_PREFIX}${c.key}` as ReplyOption), ...(reasonFor ? REASON_OPTIONS : REPLY_OPTIONS), ...(concern ? [CONCERN_OPTION] : [])];
  const schema = {
    type: 'object', additionalProperties: false, required: ['option'],
    properties: { option: { type: 'string', enum: options } },
  };
  const system = [
    task,
    '',
    '<current-question>',
    question,
    '</current-question>',
    '',
    ...options.map(o => `- ${o}: ${criteriaOf(o, choices, reasonFor, concern).true}`),
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
    questions[id] = { type: 'noul', criteria: criteriaOf(o, choices, reasonFor, concern), instructions: { option: o, question: `Does the latest message do what \`${o}\` describes?` } };
    index.push({ id, option: o });
  });
  return {
    task: 'rank_reply', input, conversation, question, options, ...(choices.length ? { choices } : {}), ...(reasonFor ? { reasonFor } : {}), ...(concern ? { concern } : {}),
    llm: { system, user: conversationText(conversation, input), schema },
    systemOne: {
      state: {
        assistant_instructions: `${task}\n\nThe current question:\n${question}`,
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
): { option: ReplyOption; also?: string[]; scores: Record<string, number>; fallback: boolean } {
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
  // `irrelevant` takes a choice's place only from its own higher cut (REPLY_IRRELEVANT_OVER_CHOICE).
  const yieldsToChoice = cleared[0] === 'answers' || cleared[0] === 'new_request' || (cleared[0] === 'irrelevant' && scores.irrelevant < REPLY_IRRELEVANT_OVER_CHOICE);
  // A clear ask outranks noise (owner 2026-11-02, prod "¿Quién habla?" irrelevant .85, new_request .72): with both cleared the reply is a request.
  const best = choice && yieldsToChoice ? choice : cleared[0] === 'irrelevant' && !choice && cleared.includes('new_request') ? 'new_request' : cleared[0];
  if (best) {
    // A question's own choices that also cleared REPLY_ALSO_CUT, by score. An escape (`__agent`) is never a second pick.
    const also = best.startsWith(CHOICE_PREFIX) ? cleared.filter(o => o !== best && o.startsWith(CHOICE_PREFIX) && !o.startsWith(`${CHOICE_PREFIX}__`) && scores[o] >= REPLY_ALSO_CUT).map(o => o.slice(CHOICE_PREFIX.length)) : [];
    return { option: best, ...(also.length ? { also } : {}), scores, fallback: false };
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
