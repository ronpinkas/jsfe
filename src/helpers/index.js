/**
 * jsfe/helpers — the functions JSFE's system flows call from expressions, in ONE place for every host: reading an
 * answer (matchesChoice, pickChoice, isAnswer, readEmail, readIdentifier, amountInAnswer, matchInputs …), saying
 * values (amountToSpeech, dateToWords, last4, urlToSpeech …), checking shapes and one-time codes. Pure: no credentials,
 * no network, no host state beyond the container a caller passes in.
 *
 * The engine does not register them by itself. A host lists them among its approved functions, usually all at once:
 *
 *   import { STANDARD_FUNCTIONS } from 'jsfe/helpers';
 *   new WorkflowEngine(logger, aiCallback, flows, tools, { ...STANDARD_FUNCTIONS, ...hostFunctions }, …);
 *
 * Functions that need credentials or the network (sending a text or an email, geocoding, a store's API) belong to the
 * host.
 */
import { matchesChoice } from './matches-choice.js';
import { ANSWER_WORDS, CONFIRM_WORDS, isAnswer, isAgentRequest, isOtherRequest, isSpelledFragment, isAmountAnswer, amountInAnswer, pickChoice } from './answer.js';
import { readEmail, readPhone, readInternationalPhone, readIdentifier, last4, maskEmail, callerTextNumber, textDestination, callerIsInternational } from './contact.js';
import { normalizeAndFindCapture } from './capture.js';
import { anythingElse, goodbye, sayName } from './phrases.js';
import { dateToWords } from './date-words.js';
import { amountToSpeech } from './amount-to-speech.js';
import { validateCardNumber, validateExpiration } from './card-checks.js';
import { matchInputs } from './match-inputs.js';
import { checkOtp, maskDestination, validateOTP, OTP_EXPIRY_MS } from './otp-check.js';
import { validateDigits, validatePhone, validateEmail } from './validators.js';
import { urlToSpeech, textWithUrlToSpeech } from './url-speech.js';

export {
   matchesChoice, ANSWER_WORDS, CONFIRM_WORDS, isAnswer, isAgentRequest, isOtherRequest, isSpelledFragment, isAmountAnswer, amountInAnswer,
   pickChoice, readEmail, readPhone, readInternationalPhone, readIdentifier, last4, maskEmail, callerTextNumber, textDestination,
   callerIsInternational, normalizeAndFindCapture, anythingElse, goodbye, sayName, dateToWords, amountToSpeech, validateCardNumber,
   validateExpiration, matchInputs, checkOtp, maskDestination, validateOTP, OTP_EXPIRY_MS, validateDigits, validatePhone, validateEmail,
   urlToSpeech, textWithUrlToSpeech,
};

/** The functions flows call by name, ready to spread into a host's approved functions. */
export const STANDARD_FUNCTIONS = {
   matchesChoice, isAnswer, isAgentRequest, isOtherRequest, isSpelledFragment, isAmountAnswer, amountInAnswer, pickChoice,
   readEmail, readPhone, readInternationalPhone, readIdentifier, last4, maskEmail, callerTextNumber, textDestination, callerIsInternational,
   normalizeAndFindCapture, anythingElse, goodbye, dateToWords, amountToSpeech, validateCardNumber, validateExpiration, matchInputs,
   validateOTP, validateDigits, validatePhone, validateEmail, urlToSpeech, textWithUrlToSpeech,
};
