/** Shared platform choice transport, moved into JSFE so all hosts use one implementation. */
export const FLOWS = [
  {
    "id": "ask-choice",
    "name": "AskChoice",
    "version": "1.19.0",
    "description": "Worker: ask one question and return cargo.choice plus the original cargo.choiceText. Declared choices, precheck keys and typed answer-validator keys keep priority across both read passes. Exact negative choices accept only their own declared words and keys. With amount, an unowned legacy payment question accepts a complete USD monetary answer or a simple payment instruction through readMoneyAmount; uncertain prose yields to DISPATCH without declaring an action failure. A lone digit keeps the question's keypad policy; amount:'marked' still requires marked money. An owning FORM supplies form_context and performs its own field, correction, provider-question and confirmation matching before deciding to retry or yield, retaining its draft and safety guards. Optional answer_precheck runs before choices; answer_validator runs only when no choice matched. AGENT/0 requests a person; EXIT/* leaves the request; a consumed switch offer routes its declared flow. Params include question(_es), choices [{key,phrases,exact?,negative?,neutral?}], retry(_es), accept_other, expect, amount, digits, exit_context(_es), pii and form_context.",
    "parameters": [
      {"name":"form_context","type":"object","description":"Optional declared FORM reader context {form,current,names,questions}; valid field readings take precedence over stale verification-code echoes."},
      {
        "name": "question",
        "type": "string",
        "description": "The question (English)",
        "required": true
      },
      {
        "name": "question_es",
        "type": "string",
        "description": "The question (Spanish)",
        "required": false
      },
      {
        "name": "choices",
        "type": "array",
        "description": "[{key, phrases}] in priority order",
        "required": true
      },
      {
        "name": "retry",
        "type": "string",
        "description": "Re-ask wording (English); default \"Sorry, I didn't catch that.\" + the question",
        "required": false
      },
      {
        "name": "retry_es",
        "type": "string",
        "description": "Re-ask wording (Spanish)",
        "required": false
      },
      {
        "name": "accept_other",
        "type": "boolean",
        "description": "Return any other answer as choice \"other\" instead of re-asking",
        "required": false
      },
      {
        "name": "digits",
        "type": "object",
        "description": "Keypad input bounds {min, max} on voice",
        "required": false
      },
      {
        "name": "exit_context",
        "type": "string",
        "description": "What EXIT abandons, for the support message (English)",
        "required": false
      },
      {
        "name": "exit_context_es",
        "type": "string",
        "description": "What EXIT abandons (Spanish)",
        "required": false
      },
      {
        "name": "expect",
        "type": "string",
        "description": "With accept_other: what the answer should be — 'number', 'email' or 'contact' (either). Three or more words of neither shape are another request and are DISPATCHed"
      },
      {
        "name": "amount",
        "type": "boolean",
        "description": "true on a payment question: the answer is kept as spoken (the question's asSpoken) and an answer that names an amount ($1, 1 dollar, 12.50) returns cargo.choice = 'amount' with the text — never a keypad key, never a DISPATCH"
      },
      {
        "name": "pii",
        "type": "boolean",
        "description": "true when the answer is sensitive (a card's security code): every question here is a SAY-GET `pii` (jsfe >= 1.3.5), so the host keeps the answer out of its logs and records"
      },
      {
        "name": "answer_validator",
        "type": "string",
        "description": "Optional flow name. When an answer picks no choice, it is called (call) with { answer } and MAY set answer_key to a choice key, which is then returned as cargo.choice; if it sets none, the answer is handled as before (amount check, re-ask). Fail-closed. The validator must end by completion: a RETURN in it terminates the conversation turn."
      },
      {
        "name": "answer_precheck",
        "type": "string",
        "description": "Optional flow run with { answer } before the choices are matched; an answer_key it sets is the answer's key (for an answer that must not be read as a choice, such as a question)",
        "required": false
      },
      {
        "name": "reask_long",
        "type": "boolean",
        "description": "true: an answer of three words or more that matches no choice is asked again once (the retry question) instead of being DISPATCHed at once; the second miss is DISPATCHed. For a question whose loss costs the caller real work, e.g. the charge confirmation after a card was typed (owner 2026-10-17).",
        "required": false
      },
      {
        "name": "as_spoken",
        "type": "boolean",
        "description": "Keep exact speech independently of numeric or amount semantics"
      }
    ],
    "variables": {
      "ac_answer": {
        "type": "string",
        "value": ""
      },
      "ac_key": {
        "type": "string",
        "value": ""
      },
      "ac_other": {
        "type": "boolean",
        "value": false
      },
      "ac_q_es": {
        "type": "string",
        "value": ""
      },
      "ac_retry": {
        "type": "string",
        "value": ""
      },
      "ac_retry_es": {
        "type": "string",
        "value": ""
      },
      "ac_exit_ctx": {
        "type": "string",
        "value": ""
      },
      "ac_exit_ctx_es": {
        "type": "string",
        "value": ""
      },
      "ac_missed": {
        "type": "boolean",
        "value": false
      },
      "answer_key": {
        "type": "string",
        "description": "Set by answer_validator: the choice key the answer stands for, or empty",
        "value": ""
      },
      "ac_offer": {
        "type": "object",
        "value": null
      },
      "ac_q": {
        "type": "string",
        "value": ""
      },
      "ac_code": {
        "type": "string",
        "value": ""
      },
      "ac_late": {
        "type": "boolean",
        "value": false
      },
      "ac_marked": {
        "type": "boolean",
        "value": false
      },
      "as_spoken": {
        "type": "boolean",
        "value": false
      },
      "contract": {
        "type": "object",
        "value": {
          "version": 1,
          "role": "collector",
          "summary": "Shared channel input transport and platform choice handling",
          "parametersFrom": "parameters"
        }
      }
    },
    "steps": [
      {
        "id": "ac_reset",
        "type": "SET",
        "variable": "assignment_side_effect",
        "value": "cargo.choice = '', cargo.choiceText = ''"
      },
      {
        "id": "ac_accepts_other",
        "type": "SET",
        "variable": "ac_other",
        "value": "typeof accept_other !== 'undefined' && (accept_other === true || accept_other === 'true')"
      },
      {
        "id": "ac_takes_amount",
        "type": "SET",
        "variable": "ac_amount",
        "value": "typeof amount !== 'undefined' && (amount === true || amount === 'true' || amount === 'marked')"
      },
      {
        "id": "ac_takes_marked_amount",
        "type": "SET",
        "variable": "ac_marked",
        "value": "typeof amount !== 'undefined' && amount === 'marked'"
      },
      {
        "id": "ac_takes_pii",
        "type": "SET",
        "variable": "ac_pii",
        "value": "typeof pii !== 'undefined' && (pii === true || pii === 'true')"
      },
      {
        "id": "ac_question_es",
        "type": "SET",
        "variable": "ac_q_es",
        "value": "typeof question_es !== 'undefined' && question_es ? question_es : question"
      },
      {
        "id": "ac_retry_en",
        "type": "SET",
        "variable": "ac_retry",
        "value": "typeof retry !== 'undefined' && retry ? retry : \"Sorry, I didn't catch that. \" + question"
      },
      {
        "id": "ac_retry_spanish",
        "type": "SET",
        "variable": "ac_retry_es",
        "value": "typeof retry_es !== 'undefined' && retry_es ? retry_es : 'Disculpe, no le entendí. ' + ac_q_es"
      },
      {
        "id": "ac_exit_context",
        "type": "SET",
        "variable": "ac_exit_ctx",
        "value": "typeof exit_context !== 'undefined' && exit_context ? exit_context : 'your request'"
      },
      {
        "id": "ac_exit_context_es",
        "type": "SET",
        "variable": "ac_exit_ctx_es",
        "value": "typeof exit_context_es !== 'undefined' && exit_context_es ? exit_context_es : 'su solicitud'"
      },
      {
        "id": "ac_keypad",
        "type": "SET",
        "variable": "assignment_side_effect",
        "value": "(cargo.digits = typeof digits !== 'undefined' && digits && typeof digits === 'object' ? digits : undefined, true)"
      },
      {
        "id": "ac_late_code_take",
        "type": "SET",
        "variable": "ac_code",
        "value": "(function(d) { cargo.otpLateCode = ''; return d.length === 6 && !(typeof expect !== 'undefined' && expect) && !ac_amount ? d : ''; })(String(cargo.otpLateCode || ''))"
      },
      {
        "id": "ac_take_offer",
        "type": "SET",
        "variable": "ac_offer",
        "value": "takeChoiceOffer(cargo)"
      },
      {
        "id": "ac_question_with_offer",
        "type": "SET",
        "variable": "ac_q",
        "value": "question + (ac_offer && ac_offer.text ? ' ' + ac_offer.text : '')"
      },
      {
        "id": "ac_question_with_offer_es",
        "type": "SET",
        "variable": "ac_q_es",
        "value": "ac_q_es + (ac_offer && (ac_offer.text_es || ac_offer.text) ? ' ' + (ac_offer.text_es || ac_offer.text) : '')"
      },
      {
        "id": "ac_ask",
        "type": "SAY-GET",
        "variable": "ac_answer",
        "asSpoken": "ac_amount === true || as_spoken === true",
        "value": "{{ac_q}}",
        "value_es": "{{ac_q_es}}",
        "pii": "ac_pii === true"
      },
      {
        "id": "ac_late_code_check",
        "type": "SET",
        "variable": "ac_late",
        "value": "(function(t, c) { if (typeof form_context !== 'undefined' && form_context && form_context.form) { var fc=form_context, chain=formInputChain(cargo.forms,fc.form,cargo), read=readFormAnswer(t,chain,Array.isArray(fc.names)&&fc.names.length>1?{form:fc.form,names:fc.names}:{form:fc.form,name:fc.current},'',fc.questions||[]); if(read.hits.length || read.ambiguous.length || read.questions.length) return false; } t = String(t || '').trim(); c = String(c || ''); if (c.length !== 6) { return false; } var rest = t.replace(/^(?:(?:el|mi|the|my)\\s+)?(?:c[oó]digo|code)(?:\\s+(?:es|is|era|was))?\\s*[:,.-]?\\s*/i, ''); if (!/^[\\d\\s.,-]+$/.test(rest)) { return false; } var d = rest.replace(/\\D/g, ''); return d.length >= 2 && d.length <= 6 && c.indexOf(d) >= 0; })(ac_answer, ac_code)"
      },
      {
        "id": "ac_late_code_reask",
        "type": "CASE",
        "branches": {
          "condition: ac_late": {
            "id": "ac_late_code_again",
            "type": "FLOW",
            "value": "late-code-reask",
            "callType": "call",
            "parameters": {
              "question": "{{ac_q}}",
              "question_es": "{{ac_q_es}}",
              "code": "{{ac_code}}"
            }
          },
          "default": {
            "id": "ac_late_code_none",
            "type": "SET",
            "variable": "noop",
            "value": "true"
          }
        }
      },
      {
        "id": "ac_late_code_answer",
        "type": "SET",
        "variable": "ac_answer",
        "value": "ac_late ? String(cargo.lateCodeAnswer || '') : ac_answer"
      },
      {
        "id": "ac_late_code_clear",
        "type": "SET",
        "variable": "assignment_side_effect",
        "value": "(cargo.lateCodeAnswer = '', true)"
      },
      {
        "id": "ac_repeat_1",
        "type": "CASE",
        "branches": {
          "condition: /^[\\s¿¡]*(?:(?:por favor|please|a|que|me lo|me|lo|puede|can you|could you)\\s+)*(?:repetir|repite|rep[ií]t[ae](?:lo|la|me|melo|nos)?|rep[ií]tamelo|otra vez|de nuevo|repeat(?:\\s+(?:that|it))?|say (?:that|it) again|again|one more time)(?:\\s+(?:por favor|please|la pregunta|las opciones|eso|that|it))*[\\s.!?¿,]*$/i.test(String(ac_answer || '')) && pickChoice(ac_answer, choices, ac_other) === ''": {
            "id": "ac_repeat_ask_1",
            "type": "SAY-GET",
            "variable": "ac_answer",
            "asSpoken": "ac_amount === true || as_spoken === true",
            "value": "{{ac_q}}",
            "value_es": "{{ac_q_es}}",
            "pii": "ac_pii === true"
          },
          "default": {
            "id": "ac_no_repeat_1",
            "type": "SET",
            "variable": "noop",
            "value": "true"
          }
        }
      },
      {
        "id": "ac_repeat_2",
        "type": "CASE",
        "branches": {
          "condition: /^[\\s¿¡]*(?:(?:por favor|please|a|que|me lo|me|lo|puede|can you|could you)\\s+)*(?:repetir|repite|rep[ií]t[ae](?:lo|la|me|melo|nos)?|rep[ií]tamelo|otra vez|de nuevo|repeat(?:\\s+(?:that|it))?|say (?:that|it) again|again|one more time)(?:\\s+(?:por favor|please|la pregunta|las opciones|eso|that|it))*[\\s.!?¿,]*$/i.test(String(ac_answer || '')) && pickChoice(ac_answer, choices, ac_other) === ''": {
            "id": "ac_repeat_ask_2",
            "type": "SAY-GET",
            "variable": "ac_answer",
            "asSpoken": "ac_amount === true || as_spoken === true",
            "value": "{{ac_q}}",
            "value_es": "{{ac_q_es}}",
            "pii": "ac_pii === true"
          },
          "default": {
            "id": "ac_no_repeat_2",
            "type": "SET",
            "variable": "noop",
            "value": "true"
          }
        }
      },
      {
        "id": "ac_init_precheck_key",
        "type": "SET",
        "variable": "answer_key",
        "value": "''"
      },
      {
        "id": "ac_precheck",
        "type": "CASE",
        "branches": {
          "condition: typeof answer_precheck !== 'undefined' && answer_precheck && String(ac_answer || '').trim()": {
            "id": "ac_run_precheck",
            "type": "FLOW",
            "value": "{{answer_precheck}}",
            "callType": "call",
            "parameters": {
              "answer": "{{ac_answer}}"
            }
          },
          "default": {
            "id": "ac_no_precheck",
            "type": "SET",
            "variable": "noop_precheck",
            "value": "true"
          }
        }
      },
      {
        "id": "ac_precheck_key",
        "type": "SET",
        "variable": "ac_prechecked",
        "value": "typeof answer_key !== 'undefined' && answer_key ? String(answer_key) : ''"
      },
      {
        "id": "ac_match",
        "type": "SET",
        "variable": "ac_key",
        "value": "ac_prechecked ? ac_prechecked : pickChoice(ac_answer, choices, ac_other)"
      },
      {
        "id": "ac_match_offer",
        "type": "SET",
        "variable": "ac_key",
        "value": "ac_offer && Array.isArray(ac_offer.phrases ?? ac_offer.words) && matchesChoice(ac_answer, ac_offer.phrases ?? ac_offer.words) ? '__switch' : ac_key"
      },
      {
        "id": "ac_exact_no_own_words",
        "type": "SET",
        "variable": "ac_key",
        "value": "(function() { var cs = Array.isArray(choices) ? choices : []; var isExactNo = function(c) { return !!c && c.exact === true && (['no', 'decline', 'done', 'cancel'].indexOf(c.key) > -1 || c.negative === true); }; var c = cs.filter(function(x) { return !!x && x.key === ac_key; })[0]; if (!isExactNo(c)) { return ac_key; } else if (pickChoice(ac_answer, [{ key: 'ac_own', phrases: c.phrases ?? c.words, exact: true }], false) === 'ac_own') { return ac_key; } else { return pickChoice(ac_answer, cs.filter(function(x) { return !isExactNo(x); }), ac_other); } })()"
      },
      {
        "id": "ac_init_answer_key",
        "type": "SET",
        "variable": "answer_key",
        "value": "''"
      },
      {
        "id": "ac_validate_answer",
        "type": "CASE",
        "branches": {
          "condition: ac_key === '' && typeof answer_validator !== 'undefined' && answer_validator && String(ac_answer || '').trim()": {
            "id": "ac_run_answer_validator",
            "type": "FLOW",
            "value": "{{answer_validator}}",
            "callType": "call",
            "parameters": {
              "answer": "{{ac_answer}}"
            }
          },
          "default": {
            "id": "ac_no_answer_validator",
            "type": "SET",
            "variable": "noop_answer_validator",
            "value": "true"
          }
        }
      },
      {
        "id": "ac_take_answer_key",
        "type": "SET",
        "variable": "ac_key",
        "value": "ac_key === '' && typeof answer_key !== 'undefined' && answer_key ? String(answer_key) : ac_key"
      },
      {
        "id": "ac_amount_check",
        "type": "SET",
        "variable": "ac_key",
        "value": "ac_key !== '' || !ac_amount || (typeof form_context !== 'undefined' && form_context && form_context.form) ? ac_key : (String(ac_answer||'').trim() && !Number.isFinite(readMoneyAmount(ac_answer,{currency:'USD',cardinals:true,intent:'payment'}))) ? '__elsewhere' : (ac_amount && (isAmountAnswer(ac_answer) || (ac_marked ? (ac_key === '' && /\\d\\s*(?:con|and)\\s*(?:un\\s+)?\\d{2}\\b(?!\\s*\\d)/i.test(String(ac_answer || ''))) : (ac_key === '' && (!/^\\D*\\d\\D*$/.test(String(ac_answer || '')) || /\\b(?:pay|paying|pagar|pagarle|abonar)\\b/i.test(String(ac_answer || ''))) && !/^[\\s,.;]*\\d(?:[\\s,.;]+\\d)+[\\s,.;]*$/.test(String(ac_answer || '')) && !isNaN(readMoneyAmount(ac_answer,{currency:'USD',cardinals:true,intent:'payment'}))))) ? '__amount' : ac_key)"
      },
      {
        "id": "ac_switch_to_text_key",
        "type": "SET",
        "variable": "ac_key",
        "value": "ac_key === '' && !ac_other && !ac_amount && cargo.voice && String(ac_answer || '').trim() === '9' && !!callerTextNumber(cargo) ? '__text' : ac_key"
      },
      {
        "id": "ac_keypad_again",
        "type": "SET",
        "variable": "assignment_side_effect",
        "value": "(cargo.digits = typeof digits !== 'undefined' && digits && typeof digits === 'object' ? digits : undefined, true)"
      },
      {
        "id": "ac_missed_once",
        "type": "SET",
        "variable": "ac_missed",
        "value": "ac_key === '' && !ac_other && (String(ac_answer || '').split(/\\s+/).filter(function(w) { return /[a-záéíóúüñ]/i.test(w); }).length < 3 || (typeof reask_long !== 'undefined' && (reask_long === true || reask_long === 'true')))"
      },
      {
        "id": "ac_reask_on_miss",
        "type": "CASE",
        "branches": {
          "condition: ac_missed": {
            "id": "ac_reask",
            "type": "SAY-GET",
            "variable": "ac_answer",
            "asSpoken": "ac_amount === true || as_spoken === true",
            "value": "{{ac_retry}}",
            "value_es": "{{ac_retry_es}}",
            "pii": "ac_pii === true"
          },
          "default": {
            "id": "ac_no_reask",
            "type": "SET",
            "variable": "noop",
            "value": "true"
          }
        }
      },
      {
        "id": "ac_repeat_after_miss_1",
        "type": "CASE",
        "branches": {
          "condition: ac_missed && /^[\\s¿¡]*(?:(?:por favor|please|a|que|me lo|me|lo|puede|can you|could you)\\s+)*(?:repetir|repite|rep[ií]t[ae](?:lo|la|me|melo|nos)?|rep[ií]tamelo|otra vez|de nuevo|repeat(?:\\s+(?:that|it))?|say (?:that|it) again|again|one more time)(?:\\s+(?:por favor|please|la pregunta|las opciones|eso|that|it))*[\\s.!?¿,]*$/i.test(String(ac_answer || '')) && pickChoice(ac_answer, choices, ac_other) === ''": {
            "id": "ac_repeat_after_miss_ask_1",
            "type": "SAY-GET",
            "variable": "ac_answer",
            "asSpoken": "ac_amount === true || as_spoken === true",
            "value": "{{ac_q}}",
            "value_es": "{{ac_q_es}}",
            "pii": "ac_pii === true"
          },
          "default": {
            "id": "ac_no_repeat_after_miss_1",
            "type": "SET",
            "variable": "noop",
            "value": "true"
          }
        }
      },
      {
        "id": "ac_repeat_after_miss_2",
        "type": "CASE",
        "branches": {
          "condition: ac_missed && /^[\\s¿¡]*(?:(?:por favor|please|a|que|me lo|me|lo|puede|can you|could you)\\s+)*(?:repetir|repite|rep[ií]t[ae](?:lo|la|me|melo|nos)?|rep[ií]tamelo|otra vez|de nuevo|repeat(?:\\s+(?:that|it))?|say (?:that|it) again|again|one more time)(?:\\s+(?:por favor|please|la pregunta|las opciones|eso|that|it))*[\\s.!?¿,]*$/i.test(String(ac_answer || '')) && pickChoice(ac_answer, choices, ac_other) === ''": {
            "id": "ac_repeat_after_miss_ask_2",
            "type": "SAY-GET",
            "variable": "ac_answer",
            "asSpoken": "ac_amount === true || as_spoken === true",
            "value": "{{ac_q}}",
            "value_es": "{{ac_q_es}}",
            "pii": "ac_pii === true"
          },
          "default": {
            "id": "ac_no_repeat_after_miss_2",
            "type": "SET",
            "variable": "noop",
            "value": "true"
          }
        }
      },
      {
        "id": "ac_init_precheck_key_again",
        "type": "SET",
        "variable": "answer_key",
        "value": "''"
      },
      {
        "id": "ac_precheck_again",
        "type": "CASE",
        "branches": {
          "condition: typeof answer_precheck !== 'undefined' && answer_precheck && String(ac_answer || '').trim()": {
            "id": "ac_run_precheck_again",
            "type": "FLOW",
            "value": "{{answer_precheck}}",
            "callType": "call",
            "parameters": {
              "answer": "{{ac_answer}}"
            }
          },
          "default": {
            "id": "ac_no_precheck_again",
            "type": "SET",
            "variable": "noop_precheck",
            "value": "true"
          }
        }
      },
      {
        "id": "ac_precheck_key_again",
        "type": "SET",
        "variable": "ac_prechecked",
        "value": "typeof answer_key !== 'undefined' && answer_key ? String(answer_key) : ''"
      },
      {
        "id": "ac_match_again",
        "type": "SET",
        "variable": "ac_key",
        "value": "ac_prechecked ? ac_prechecked : (ac_key === '' && !ac_other ? pickChoice(ac_answer, choices, ac_other) : ac_key)"
      },
      {
        "id": "ac_match_again_offer",
        "type": "SET",
        "variable": "ac_key",
        "value": "ac_offer && Array.isArray(ac_offer.phrases ?? ac_offer.words) && matchesChoice(ac_answer, ac_offer.phrases ?? ac_offer.words) ? '__switch' : ac_key"
      },
      {
        "id": "ac_exact_no_own_words_again",
        "type": "SET",
        "variable": "ac_key",
        "value": "ac_key === '' ? ac_key : (function() { var cs = Array.isArray(choices) ? choices : []; var isExactNo = function(c) { return !!c && c.exact === true && (['no', 'decline', 'done', 'cancel'].indexOf(c.key) > -1 || c.negative === true); }; var c = cs.filter(function(x) { return !!x && x.key === ac_key; })[0]; if (!isExactNo(c)) { return ac_key; } else if (pickChoice(ac_answer, [{ key: 'ac_own', phrases: c.phrases ?? c.words, exact: true }], false) === 'ac_own') { return ac_key; } else { return pickChoice(ac_answer, cs.filter(function(x) { return !isExactNo(x); }), ac_other); } })()"
      },
      {
        "id": "ac_init_answer_key_again",
        "type": "SET",
        "variable": "answer_key",
        "value": "''"
      },
      {
        "id": "ac_validate_answer_again",
        "type": "CASE",
        "branches": {
          "condition: ac_key === '' && typeof answer_validator !== 'undefined' && answer_validator && String(ac_answer || '').trim()": {
            "id": "ac_run_answer_validator_again",
            "type": "FLOW",
            "value": "{{answer_validator}}",
            "callType": "call",
            "parameters": {
              "answer": "{{ac_answer}}"
            }
          },
          "default": {
            "id": "ac_no_answer_validator_again",
            "type": "SET",
            "variable": "noop_answer_validator",
            "value": "true"
          }
        }
      },
      {
        "id": "ac_take_answer_key_again",
        "type": "SET",
        "variable": "ac_key",
        "value": "ac_key === '' && typeof answer_key !== 'undefined' && answer_key ? String(answer_key) : ac_key"
      },
      {
        "id": "ac_amount_check_again",
        "type": "SET",
        "variable": "ac_key",
        "value": "ac_key !== '' || !ac_amount || (typeof form_context !== 'undefined' && form_context && form_context.form) ? ac_key : (String(ac_answer||'').trim() && !Number.isFinite(readMoneyAmount(ac_answer,{currency:'USD',cardinals:true,intent:'payment'}))) ? '__elsewhere' : (ac_amount && (isAmountAnswer(ac_answer) || (ac_marked ? (ac_key === '' && /\\d\\s*(?:con|and)\\s*(?:un\\s+)?\\d{2}\\b(?!\\s*\\d)/i.test(String(ac_answer || ''))) : (ac_key === '' && (!/^\\D*\\d\\D*$/.test(String(ac_answer || '')) || /\\b(?:pay|paying|pagar|pagarle|abonar)\\b/i.test(String(ac_answer || ''))) && !/^[\\s,.;]*\\d(?:[\\s,.;]+\\d)+[\\s,.;]*$/.test(String(ac_answer || '')) && !isNaN(readMoneyAmount(ac_answer,{currency:'USD',cardinals:true,intent:'payment'}))))) ? '__amount' : ac_key)"
      },
      {
        "id": "ac_other_request_check",
        "type": "SET",
        "variable": "ac_key",
        "value": "ac_key === '' && ac_other && typeof expect !== 'undefined' && expect && isOtherRequest(ac_answer, expect) ? '__elsewhere' : ac_key"
      },
      {
        "id": "ac_switch_to_text_key_again",
        "type": "SET",
        "variable": "ac_key",
        "value": "ac_key === '' && !ac_other && !ac_amount && cargo.voice && String(ac_answer || '').trim() === '9' && !!callerTextNumber(cargo) ? '__text' : ac_key"
      },
      {
        "id": "ac_keypad_done",
        "type": "SET",
        "variable": "assignment_side_effect",
        "value": "(cargo.digits = undefined, (ac_key === '__agent' || ac_key === '__exit' || ac_key === '__elsewhere' || (ac_key === '' && !ac_other)) && Array.isArray(cargo.sensitive) ? cargo.sensitive.forEach(function(p) { var o = cargo, k = String(p).split('.'); for (var i = 0; i < k.length - 1 && o; i++) { o = o[k[i]]; } if (o && typeof o === 'object') { o[k[k.length - 1]] = null; } }) : null, true)"
      },
      {
        "id": "ac_route",
        "type": "CASE",
        "branches": {
          "condition: ac_key === '__switch'": {
            "id": "ac_offer_taken",
            "type": "FLOW",
            "value": "{{ac_offer.flow}}",
            "callType": "reboot"
          },
          "condition: ac_key === '__agent'": {
            "id": "ac_agent",
            "type": "FLOW",
            "value": "live-agent-requested",
            "callType": "reboot"
          },
          "condition: ac_key === '__exit'": {
            "id": "ac_exit",
            "type": "FLOW",
            "value": "contact-support",
            "callType": "reboot",
            "parameters": {
              "support_context": "{{ac_exit_ctx}}",
              "support_context_es": "{{ac_exit_ctx_es}}"
            }
          },
          "condition: ac_key === '__text'": {
            "id": "ac_switch_to_text",
            "type": "FLOW",
            "value": "switch-to-text",
            "callType": "reboot"
          },
          "condition: ac_key === '__amount'": {
            "id": "ac_return_amount",
            "type": "SET",
            "variable": "assignment_side_effect",
            "value": "cargo.choice = 'amount', cargo.choiceText = String(ac_answer || '').replace(/\\\\(['\"\\\\])/g, '$1')"
          },
          "condition: ac_key === '__elsewhere'": {
            "id": "ac_elsewhere",
            "type": "DISPATCH"
          },
          "condition: ac_key === '' && ac_other": {
            "id": "ac_return_other",
            "type": "SET",
            "variable": "assignment_side_effect",
            "value": "cargo.choice = 'other', cargo.choiceText = String(ac_answer || '').replace(/\\\\(['\"\\\\])/g, '$1')"
          },
          "condition: ac_key === ''": {
            "id": "ac_other_request",
            "type": "DISPATCH"
          },
          "default": {
            "id": "ac_return_choice",
            "type": "SET",
            "variable": "assignment_side_effect",
            "value": "cargo.choice = ac_key, cargo.choiceText = String(ac_answer || '').replace(/\\\\(['\"\\\\])/g, '$1')"
          }
        }
      }
    ],
    "scope": "isolated"
  }
];
