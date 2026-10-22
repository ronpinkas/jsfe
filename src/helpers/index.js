import {contextualResponseProtocol} from './contextual-response.js';
import {formProposalPolicy,stageFormProposal,nextFormProposal,formProposalReadings,bindFormProposal,decideFormProposal,commitFormProposals,settleFormProposalValidation} from './form-proposals.js';
import {formProposalProtocol,validateFormProposalPolicy,validateFormProposalDescriptor,formProposalDescriptor} from './proposal-contract.js';
import {clearFormMisses,missFormInput,formInputPrompt,consumeFormFeedback,formConversationOutcome} from './form-conversation.js';
import { takeChoiceOffer } from './choice-offer.js';
import { consumeActionReceipt, authorizeFormActionRetry, formSignature, selectFormAction, confirmFormRevision, prepareFormAction, actionConfirmationValid, beginFormAction, finishFormAction, actionGateVerified } from './form-actions.js';
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
import { sourceNeedsLoad, beginSourceRefresh, completeSourceRefresh, pickProviderQuestion } from './form-sources.js';
import { matchesChoice } from './matches-choice.js';
import {readMoneyAmount,isMoneyAmount,moneyIntentAllows,validateMoneyOptions} from './money.js';
import { ANSWER_WORDS, CONFIRM_WORDS, isAnswer, isAgentRequest, isOtherRequest, isSpelledFragment, isAmountAnswer, amountInAnswer, pickChoice } from './answer.js';
import { readEmail, readPhone, readInternationalPhone, readIdentifier, last4, maskEmail, callerTextNumber, textDestination, callerIsInternational } from './contact.js';
import { normalizeAndFindCapture } from './capture.js';
import { anythingElse, goodbye, sayName } from './phrases.js';
import { dateToWords } from './date-words.js';
import { amountToSpeech } from './amount-to-speech.js';
import { validateCardNumber, validateExpiration } from './card-checks.js';
import { matchInputs, readFormAnswer, readInputProfile } from './match-inputs.js';
import { resolveFormInputs, formInputApplies, formInputFilled, nextFormInput, formInputChain, openFormInstance, validateFormIncompleteOutcome, formIncompleteOutcome, validateFormExhaustion, exhaustFormInput, formInitialReadings, orderFormReadings, proposedFormValues, applyFormValidation, formReadingDependencies, exclusiveFormReadings, enrichFormMatches, expandFormActivations, settleFormActivations, rememberFormArguments, resetFormInputs, hasFormValue, formPath, formValuesEqual, formReadingReady, formReadingRelevant, formPreparation, queueFormReadings, pendingFormReadings, formWorkLimit, rejectFormReadings, invalidateFormInputs, acceptFormReadings, formInstanceApplies, formParentResume, closeFormInstance } from './form-state.js';
import { checkOtp, maskDestination, validateOTP, OTP_EXPIRY_MS } from './otp-check.js';
import { validateDigits, validatePhone, validateEmail } from './validators.js';
import { urlToSpeech, textWithUrlToSpeech } from './url-speech.js';

export {
   contextualResponseProtocol,
   formProposalPolicy,stageFormProposal,nextFormProposal,formProposalReadings,bindFormProposal,decideFormProposal,commitFormProposals,settleFormProposalValidation,formProposalProtocol,validateFormProposalPolicy,validateFormProposalDescriptor,formProposalDescriptor,
   clearFormMisses,missFormInput,formInputPrompt,consumeFormFeedback,formConversationOutcome,
   readMoneyAmount, isMoneyAmount, moneyIntentAllows, validateMoneyOptions, takeChoiceOffer, matchesChoice, ANSWER_WORDS, CONFIRM_WORDS, isAnswer, isAgentRequest, isOtherRequest, isSpelledFragment, isAmountAnswer, amountInAnswer,
   pickChoice, readEmail, readPhone, readInternationalPhone, readIdentifier, last4, maskEmail, callerTextNumber, textDestination,
   callerIsInternational, normalizeAndFindCapture, anythingElse, goodbye, sayName, dateToWords, amountToSpeech, validateCardNumber,
   validateExpiration, consumeActionReceipt, authorizeFormActionRetry, formSignature, selectFormAction, confirmFormRevision, prepareFormAction, actionConfirmationValid, beginFormAction, finishFormAction, actionGateVerified, sourceNeedsLoad, beginSourceRefresh, completeSourceRefresh, pickProviderQuestion, matchInputs, readFormAnswer, readInputProfile, resolveFormInputs, formInputApplies, formInputFilled, nextFormInput, formInputChain, openFormInstance, validateFormIncompleteOutcome, formIncompleteOutcome, validateFormExhaustion, exhaustFormInput, formInitialReadings, orderFormReadings, proposedFormValues, applyFormValidation, formReadingDependencies, exclusiveFormReadings, enrichFormMatches, expandFormActivations, settleFormActivations, rememberFormArguments, resetFormInputs, hasFormValue, formPath, formValuesEqual, formReadingReady, formReadingRelevant, formPreparation, queueFormReadings, pendingFormReadings, formWorkLimit, rejectFormReadings, invalidateFormInputs, acceptFormReadings, formInstanceApplies, formParentResume, closeFormInstance, checkOtp, maskDestination, validateOTP, OTP_EXPIRY_MS, validateDigits, validatePhone, validateEmail,
   urlToSpeech, textWithUrlToSpeech,
};

/** The functions flows call by name, ready to spread into a host's approved functions. */
export const STANDARD_FUNCTIONS = {
   contextualResponseProtocol,
   formProposalPolicy,stageFormProposal,nextFormProposal,formProposalReadings,bindFormProposal,decideFormProposal,commitFormProposals,settleFormProposalValidation,formProposalProtocol,validateFormProposalPolicy,validateFormProposalDescriptor,formProposalDescriptor,
   clearFormMisses,missFormInput,formInputPrompt,consumeFormFeedback,formConversationOutcome,
   readMoneyAmount, isMoneyAmount, moneyIntentAllows, validateMoneyOptions, takeChoiceOffer, matchesChoice, isAnswer, isAgentRequest, isOtherRequest, isSpelledFragment, isAmountAnswer, amountInAnswer, pickChoice,
   readEmail, readPhone, readInternationalPhone, readIdentifier, last4, maskEmail, callerTextNumber, textDestination, callerIsInternational,
   normalizeAndFindCapture, anythingElse, goodbye, sayName, dateToWords, amountToSpeech, validateCardNumber, validateExpiration, consumeActionReceipt, authorizeFormActionRetry, formSignature, selectFormAction, confirmFormRevision, prepareFormAction, actionConfirmationValid, beginFormAction, finishFormAction, actionGateVerified, sourceNeedsLoad, beginSourceRefresh, completeSourceRefresh, pickProviderQuestion, matchInputs, readFormAnswer, readInputProfile, resolveFormInputs, formInputApplies, formInputFilled, nextFormInput, formInputChain, openFormInstance, validateFormIncompleteOutcome, formIncompleteOutcome, validateFormExhaustion, exhaustFormInput, formInitialReadings, orderFormReadings, proposedFormValues, applyFormValidation, formReadingDependencies, exclusiveFormReadings, enrichFormMatches, expandFormActivations, settleFormActivations, rememberFormArguments, resetFormInputs, hasFormValue, formPath, formValuesEqual, formReadingReady, formReadingRelevant, formPreparation, queueFormReadings, pendingFormReadings, formWorkLimit, rejectFormReadings, invalidateFormInputs, acceptFormReadings, formInstanceApplies, formParentResume, closeFormInstance,
   validateOTP, validateDigits, validatePhone, validateEmail, urlToSpeech, textWithUrlToSpeech,
};
