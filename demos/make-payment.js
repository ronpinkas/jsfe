// support-ticket.js
import { WorkflowEngine } from '../dist/index.js';
//import { WorkflowEngine } from "jsfe";

import readline from "node:readline/promises";

import winston from 'winston';

const logger = winston.createLogger({
   level: process.env.LOG_LEVEL || 'warn',  // Enable debug logging to trace validation
   format: winston.format.printf(({ level, message }) => {
      return `${level}: ${message}`;
   }),
   transports: [
      new winston.transports.Console()
   ]
});

import fs from 'fs';
import path from 'path';

// Ensure __dirname is defined for both CommonJS and ES modules
import { dirname } from 'path';
import { fileURLToPath } from 'url';
let __dirname;
try {
   __dirname = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));
} catch (e) {
   __dirname = process.cwd();
}

/* ---------- AI callback ---------- */
async function aiCallback(systemInstruction, userMessage) {
   const apiKey = process.env.OPENAI_API_KEY;
   if (!apiKey) throw new Error("OPENAI_API_KEY env var is required");

   const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
         "Content-Type": "application/json",
         "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
         model: "gpt-4o-mini",
         messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userMessage },
         ],
         temperature: 0.1,
         max_tokens: 200,
      }),
   });

   if (!res.ok) {
      throw new Error(`AI API failed: ${res.status} ${res.statusText}`);
   }

   const data = await res.json();
   return data?.choices?.[0]?.message?.content?.trim() || "";
}

/* ---------- Functions ---------- */
function validateDigits(input, minDigits, maxDigits) {
   const digitRegex = /^\d+$/;

   if (!digitRegex.test(input)) {
      logger.debug(`Invalid input: ${input}`);
      return false;
   }

   const length = input.length;
   return length >= minDigits && length <= maxDigits;
}

function validatePhone(phone) {
   // Remove any non-digit characters for validation
   const cleaned = phone.replace(/\D/g, '');
   logger.debug(`Validating phone format: ${cleaned}`);

   // US phone number: 10 digits or 11 if country code is included
   if (cleaned.length === 10 || (cleaned.length === 11 && cleaned.startsWith('1'))) {
      logger.debug(`Valid US phone number: ${cleaned}`);
      return true;
   }

   // International format: 11+ digits
   if (cleaned.length >= 11 && cleaned.length <= 15) {
      logger.debug(`Valid international phone number: ${cleaned}`);
      return true;
   }

   logger.debug(`Invalid phone number format: ${cleaned}`);
   return false;
}

function validateEmail(email) {
   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
   return emailRegex.test(email);
}

/* ---------- Registries ---------- */
const APPROVED_FUNCTIONS = {
   "validateDigits": validateDigits,
   "validatePhone": validatePhone,
   "validateEmail": validateEmail,
};

const toolsRegistry = [
   {
      "id": "get-otp-link",
      "name": "Get OTP Link",
      "description": "Generates a one-time payment link and sends it to the user via SMS and optionally email",
      "parameters": {
         "type": "object",
         "properties": {
            "email": {
               "type": "string",
               "description": "Customer's email address",
               "default": ""
            },
            "phone_number": {
               "type": "string",
               "description": "Customer's phone number",
               "default": ""
            },
            "account_number": {
               "type": "string",
               "description": "Customer's account number",
               "default": ""
            }
         },
         "required": [],
         "additionalProperties": false
      },
      "implementation": {
         "type": "http",
         "url": "https://<your-url>/get-otp-link",
         "method": "POST",
         "contentType": "application/json",
         "timeout": 10000,
         "retries": 0,
         "headers": {
            "Authorization": "Bearer <API_KEY_PLACEHOLDER>"
         },
         "responseMapping": {
            "type": "object",
            "mappings": {
               "success": {
                  "path": "success",
                  "fallback": false
               },
               "error": {
                  "path": "error",
                  "fallback": 1
               },
               "customer_info": {
                  "type": "object",
                  "mappings": {
                     "cust_id": "cust_id",
                     "first_name": "first_name",
                     "last_name": "last_name",
                     "phone": "phone",
                     "cell": "cell",
                     "email": "email",
                     "address": {
                        "type": "template",
                        "template": "{{street}}, {{city}}, {{state}} {{zip}}"
                     }
                  }
               },
               "api_response": "."
            }
         }
      },
      "security": {
         "requiresAuth": false,
         "auditLevel": "high",
         "dataClassification": "financial",
         "rateLimit": {
            "requests": 10,
            "window": 60000
         }
      }
   }
];

const flowsMenu = [
   {
      "id": "start-payment",
      "name": "StartPayment",
      "version": "1.0.0",
      "description": "Start payment process",
      "prompt": "Accepting payment",
      "prompt_es": "Aceptando pago",
      "primary": true,
      "variables": {
         "know_acct_yes_or_no": {
            "type": "string",
            "description": "User response for knowing account number"
         },
         "acct_number": {
            "type": "string",
            "description": "Customer account number"
         },
         "cell_or_email": {
            "type": "string",
            "description": "User choice between cell or email"
         },
         "cell_number": {
            "type": "string",
            "description": "Customer cell phone number"
         },
         "email": {
            "type": "string",
            "description": "Customer email address"
         },
         "otp_link_result": {
            "type": "object",
            "description": "Result from OTP link generation"
         },
         "payment_aborted": {
            "type": "boolean",
            "description": "Flag to indicate if payment was aborted",
            "value": false
         }
      },
      "steps": [
         {
            "id": "ask_known_account",
            "type": "SAY-GET",
            "variable": "know_acct_yes_or_no",
            "value": "Sure. {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES if you know your account number. {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO if you don't.",
            "value_es": "Claro. {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb}} SÍ si sabe su número de cuenta. {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb}} NO si no lo sabe.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "branch_on_account_knowledge",
            "type": "CASE",
            "branches": {
               "condition: know_acct_yes_or_no === '1' || ['yes', 'yes.', 'sí', 'sí.'].includes(know_acct_yes_or_no.trim().toLowerCase())": {
                  "id": "goto_acct_flow",
                  "type": "FLOW",
                  "value": "get-acct-number-and-generate-link",
                  "mode": "call"
               },
               "condition: know_acct_yes_or_no === '2' || ['no', 'no.'].includes(know_acct_yes_or_no.trim().toLowerCase())": {
                  "id": "goto_cell_or_email_flow",
                  "type": "FLOW",
                  "value": "get-cell-or-email-and-generate-link",
                  "mode": "call"
               },
               "default": {
                  "id": "retry_start_payment",
                  "type": "FLOW",
                  "value": "retry-start-payment",
                  "mode": "replace"
               }
            }
         },
         {
            "id": "conditional_validate_payment_link",
            "type": "CASE",
            "branches": {
               "condition: !payment_aborted": {
                  "id": "validate_payment_link",
                  "type": "FLOW",
                  "value": "validate-payment-link",
                  "mode": "call"
               },
               "default": {
                  "id": "payment_aborted_msg",
                  "type": "SAY",
                  "value": "Payment process was cancelled. How else can I assist you?",
                  "value_es": "El proceso de pago fue cancelado. ¿Cómo más puedo ayudarle?"
               }
            }
         }
      ]
   },
   {
      "id": "retry-start-payment",
      "name": "RetryStartPayment",
      "version": "1.0.0",
      "description": "Retry the payment process after an error",
      "variables": {
         "user_choice": {
            "type": "string",
            "description": "User choice for retry or exit"
         }
      },
      "steps": [
         {
            "id": "retry_msg",
            "type": "SAY",
            "value": "Sorry, I did not understand that.",
            "value_es": "Lo siento, no entendí eso."
         },
         {
            "id": "offer_choice",
            "type": "SAY-GET",
            "variable": "user_choice",
            "value": "Would you like to try again? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to retry, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO to cancel.",
            "value_es": "¿Le gustaría intentar de nuevo? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb}} SÍ para reintentar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb}} NO para cancelar.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "handle_choice",
            "type": "CASE",
            "branches": {
               "condition: user_choice === '1' || ['yes', 'yes.', 'sí', 'sí.'].includes(user_choice.trim().toLowerCase())": {
                  "id": "restart_payment",
                  "type": "FLOW",
                  "value": "start-payment",
                  "mode": "replace"
               },
               "condition: user_choice === '2' || ['no', 'no.'].includes(user_choice.trim().toLowerCase())": {
                  "id": "provide_contact_info",
                  "type": "FLOW",
                  "value": "customer-service-contact",
                  "mode": "replace"
               },
               "default": {
                  "id": "provide_contact_info_default",
                  "type": "FLOW",
                  "value": "customer-service-contact",
                  "mode": "replace"
               }
            }
         }
      ]
   },
   {
      "id": "get-acct-number-and-generate-link",
      "name": "GetAcctNumberAndGenerateLink",
      "version": "1.0.0",
      "description": "Collect account number and generate payment link",
      "steps": [
         {
            "id": "ask_acct_number",
            "type": "SAY-GET",
            "variable": "acct_number",
            "value": "Cool. Please {{cargo.verb}} {{cargo.voice ? 'or enter ' : ''}}your account number{{cargo.voice ? ' followed by the pound key' : ''}}.",
            "value_es": "Genial. Por favor {{cargo.verb}} {{cargo.voice ? 'o ingrese ' : ''}}su número de cuenta{{cargo.voice ? ' seguido de la tecla de almohadilla' : ''}}.",
            "digits": {
               "min": 7,
               "max": 9
            }
         },
         {
            "id": "remove-non-digits",
            "type": "SET",
            "variable": "acct_number",
            "value": "acct_number.replace(/\\D/g, '')"
         },
         {
            "id": "branch_on_account_number",
            "type": "CASE",
            "branches": {
               "condition: validateDigits(acct_number, global_acct_required_digits, global_acct_max_digits)": {
                  "id": "call_get_otp_link",
                  "type": "CALL-TOOL",
                  "tool": "get-otp-link",
                  "variable": "otp_link_result",
                  "args": {
                     "account_number": "{{acct_number}}",
                     "email": "",
                     "phone_number": ""
                  },
                  "onFail": {
                     "id": "account-otp-failed-flow",
                     "type": "FLOW",
                     "value": "payment-failed",
                     "mode": "replace"
                  }
               },
               "default": {
                  "id": "retry_acct_number_flow",
                  "type": "FLOW",
                  "value": "retry-get-acct-number-and-generate-link",
                  "mode": "replace"
               }
            }
         }
      ]
   },
   {
      "id": "retry-get-acct-number-and-generate-link",
      "name": "RetryGetAcctNumberAndGenerateLink",
      "version": "1.0.0",
      "description": "Retry collecting account number after validation error",
      "variables": {
         "user_choice": {
            "type": "string",
            "description": "User choice for retry or exit"
         }
      },
      "steps": [
         {
            "id": "retry_msg",
            "type": "SAY",
            "value": "Sorry. '{{acct_number}}' is not a valid account number. (It must be {{global_acct_required_digits}}-{{global_acct_max_digits}} digits).",
            "value_es": "Lo siento. '{{acct_number}}' no es un número de cuenta válido. (Debe tener entre {{global_acct_required_digits}} y {{global_acct_max_digits}} dígitos)."
         },
         {
            "id": "offer_choice",
            "type": "SAY-GET",
            "variable": "user_choice",
            "value": "Would you like to try again? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to retry, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO to cancel.",
            "value_es": "¿Le gustaría intentar de nuevo? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb}} SÍ para reintentar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb}} NO para cancelar.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "handle_choice",
            "type": "CASE",
            "branches": {
               "condition: user_choice === '1' || user_choice.trim().toLowerCase() === 'yes' || user_choice.trim().toLowerCase() === 'sí'": {
                  "id": "retry_acct_entry",
                  "type": "FLOW",
                  "value": "get-acct-number-and-generate-link",
                  "mode": "replace"
               },
               "condition: user_choice === '2' || user_choice.trim().toLowerCase() === 'no'": {
                  "id": "provide_contact_info",
                  "type": "FLOW",
                  "value": "customer-service-contact",
                  "mode": "replace"
               },
               "default": {
                  "id": "provide_contact_info_default",
                  "type": "FLOW",
                  "value": "customer-service-contact",
                  "mode": "replace"
               }
            }
         }
      ]
   },
   {
      "id": "get-cell-or-email-and-generate-link",
      "name": "GetCellOrEmailAndGenerateLink",
      "version": "1.0.0",
      "description": "Let user choose between cell phone or email for payment link delivery",
      "steps": [
         {
            "id": "ask_cell_or_email",
            "type": "SAY-GET",
            "variable": "cell_or_email",
            "value": "No problem. We can locate your account using your phone or email. {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} 'PHONE' to proceed using your phone. {{cargo.voice ? 'Press 2 or ' : ''}}{{cargo.verb}} 'EMAIL' to proceed by email.",
            "value_es": "No hay problema. Podemos localizar su cuenta usando su teléfono o correo electrónico. {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb}} 'TELEFONO' para continuar usando su teléfono. {{cargo.voice ? 'Presione 2 o ' : ''}}{{cargo.verb}} 'EMAIL' para continuar por correo electrónico.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "branch_on_cell_or_email",
            "type": "CASE",
            "branches": {
               "condition: cell_or_email === '1' || ['cell.', 'cell', 'phone.', 'phone', 'telefono.', 'telefono'].includes(cell_or_email.trim().toLowerCase())": {
                  "id": "goto_cell_flow",
                  "type": "FLOW",
                  "value": "get-cell-and-generate-link"
               },
               "condition: cell_or_email === '2' || ['email.', 'email', 'e-mail.', 'e-mail'].includes(cell_or_email.trim().toLowerCase())": {
                  "id": "goto_email_flow",
                  "type": "FLOW",
                  "value": "get-email-and-generate-link"
               },
               "default": {
                  "id": "retry_cell_or_email",
                  "type": "FLOW",
                  "value": "retry-get-cell-or-email-and-generate-link",
                  "mode": "replace"
               }
            }
         }
      ]
   },

   {
      "id": "retry-get-cell-or-email-and-generate-link",
      "name": "RetryGetCellOrEmailAndGenerateLink",
      "version": "1.0.0",
      "description": "Retry choosing between cell phone or email after invalid input",
      "variables": {
         "user_choice": {
            "type": "string",
            "description": "User choice for retry or exit"
         }
      },
      "steps": [
         {
            "id": "retry_msg",
            "type": "SAY",
            "value": "Sorry, I did not understand that.",
            "value_es": "Lo siento, no entendí eso."
         },
         {
            "id": "offer_choice",
            "type": "SAY-GET",
            "variable": "user_choice",
            "value": "Would you like to try again? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to retry, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO to cancel.",
            "value_es": "¿Le gustaría intentar de nuevo? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb}} SÍ para reintentar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb}} NO para cancelar.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "handle_choice",
            "type": "CASE",
            "branches": {
               "condition: user_choice === '1' || ['yes', 'yes.', 'sí', 'sí.'].includes(user_choice.trim().toLowerCase())": {
                  "id": "retry_cell_or_email_choice",
                  "type": "FLOW",
                  "value": "get-cell-or-email-and-generate-link",
                  "mode": "replace"
               },
               "condition: user_choice === '2' || ['no', 'no.'].includes(user_choice.trim().toLowerCase())": {
                  "id": "provide_contact_info",
                  "type": "FLOW",
                  "value": "customer-service-contact",
                  "mode": "replace"
               },
               "default": {
                  "id": "provide_contact_info_default",
                  "type": "FLOW",
                  "value": "customer-service-contact",
                  "mode": "replace"
               }
            }
         }
      ]
   },

   {
      "id": "get-cell-and-generate-link",
      "name": "GetCellAndGenerateLink",
      "version": "1.0.0",
      "description": "Collect cell number and generate payment link with caller ID detection",
      "steps": [
         {
            "id": "check_caller_id_available",
            "type": "CASE",
            "branches": {
               "condition: cargo.callerId && cargo.callerId.length >= 10": {
                  "id": "goto_caller_id_flow",
                  "type": "FLOW",
                  "value": "get-cell-with-caller-id",
                  "mode": "call"
               },
               "default": {
                  "id": "goto_manual_cell_flow",
                  "type": "FLOW",
                  "value": "get-cell-manual-entry",
                  "mode": "call"
               }
            }
         },
         {
            "id": "validate_and_send",
            "type": "FLOW",
            "value": "validate-cell-and-send-link",
            "mode": "call"
         }
      ]
   },

   {
      "id": "get-cell-with-caller-id",
      "name": "GetCellWithCallerId",
      "version": "1.0.0",
      "description": "Offer to use detected caller ID for cell number",
      "variables": {
         "use_caller_id": {
            "type": "string",
            "description": "User choice to use detected caller ID"
         }
      },
      "steps": [
         {
            "id": "offer_caller_id",
            "type": "SAY-GET",
            "variable": "use_caller_id",
            "value": "Great. I notice you are using a number ending with {{cargo.callerId.slice(-4).split('').join('-')}}. {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to use that cell. {{cargo.voice ? 'Press 2 or ' : ''}}{{cargo.verb}} NO to use another cell.",
            "value_es": "Genial. Noto que está usando un número que termina en {{cargo.callerId.slice(-4).split('').join('-')}}. {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb}} SÍ para usar ese celular. {{cargo.voice ? 'Presione 2 o ' : ''}}{{cargo.verb}} NO para usar otro celular.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "handle_caller_id_choice",
            "type": "CASE",
            "branches": {
               "condition: use_caller_id === '1' || ['yes', 'yes.', 'sí', 'sí.'].includes(use_caller_id.trim().toLowerCase())": {
                  "id": "use_detected_number",
                  "type": "SET",
                  "variable": "cell_number",
                  "value": "{{cargo.callerId}}"
               },
               "condition: use_caller_id === '2' || ['no', 'no.'].includes(use_caller_id.trim().toLowerCase())": {
                  "id": "goto_manual_entry",
                  "type": "FLOW",
                  "value": "get-cell-manual-entry",
                  "mode": "call"
               },
               "default": {
                  "id": "retry_caller_id_choice",
                  "type": "FLOW",
                  "value": "retry-get-cell-with-caller-id",
                  "mode": "replace"
               }
            }
         }
      ]
   },

   {
      "id": "get-cell-manual-entry",
      "name": "GetCellManualEntry",
      "version": "1.0.0",
      "description": "Manual cell number entry",
      "steps": [
         {
            "id": "ask_cell_number",
            "type": "SAY-GET",
            "variable": "cell_number",
            "value": "Please {{cargo.verb}} {{cargo.voice ? 'or enter ' : ''}}your cell number{{cargo.voice ? ' followed by the pound key' : ''}}.",
            "value_es": "Por favor {{cargo.verb}} {{cargo.voice ? 'o ingrese ' : ''}}su número de celular{{cargo.voice ? ' seguido de la tecla de almohadilla' : ''}}.",
            "digits": {
               "min": 10,
               "max": 15
            }
         },
         {
            "id": "remove-non-digits",
            "type": "SET",
            "variable": "cell_number",
            "value": "cell_number.replace(/\\D/g, '')"
         }
      ]
   },

   {
      "id": "validate-cell-and-send-link",
      "name": "ValidateCellAndSendLink",
      "version": "1.0.0",
      "description": "Validate cell number and send payment link",
      "steps": [
         {
            "id": "validate_cell_number",
            "type": "CASE",
            "branches": {
               "condition: validatePhone(cell_number)": {
                  "id": "call_get_otp_link_cell",
                  "type": "CALL-TOOL",
                  "tool": "get-otp-link",
                  "variable": "otp_link_result",
                  "args": {
                     "account_number": "",
                     "email": "",
                     "phone_number": "{{cell_number}}"
                  },
                  "onFail": {
                     "id": "cell-otp-failed-flow",
                     "type": "FLOW",
                     "value": "payment-failed",
                     "mode": "replace"
                  }
               },
               "default": {
                  "id": "retry_cell_flow",
                  "type": "FLOW",
                  "value": "retry-get-cell-and-generate-link",
                  "mode": "replace"
               }
            }
         }
      ]
   },

   {
      "id": "retry-get-cell-with-caller-id",
      "name": "RetryGetCellWithCallerId",
      "version": "1.0.0",
      "description": "Retry caller ID choice after invalid input",
      "variables": {
         "user_choice": {
            "type": "string",
            "description": "User choice for retry or exit"
         }
      },
      "steps": [
         {
            "id": "retry_msg",
            "type": "SAY",
            "value": "Sorry, I did not understand that.",
            "value_es": "Lo siento, no entendí eso."
         },
         {
            "id": "offer_choice",
            "type": "SAY-GET",
            "variable": "user_choice",
            "value": "Would you like to try again? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to retry, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO to cancel.",
            "value_es": "¿Le gustaría intentar de nuevo? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb}} SÍ para reintentar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb}} NO para cancelar.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "handle_choice",
            "type": "CASE",
            "branches": {
               "condition: user_choice === '1' || ['yes', 'yes.', 'sí', 'sí.'].includes(user_choice.trim().toLowerCase())": {
                  "id": "retry_caller_id_flow",
                  "type": "FLOW",
                  "value": "get-cell-with-caller-id",
                  "mode": "replace"
               },
               "condition: user_choice === '2' || ['no', 'no.'].includes(user_choice.trim().toLowerCase())": {
                  "id": "provide_contact_info",
                  "type": "FLOW",
                  "value": "customer-service-contact",
                  "mode": "replace"
               },
               "default": {
                  "id": "provide_contact_info_default",
                  "type": "FLOW",
                  "value": "customer-service-contact",
                  "mode": "replace"
               }
            }
         }
      ]
   },

   {
      "id": "retry-get-cell-and-generate-link",
      "name": "RetryGetCellAndGenerateLink",
      "version": "1.0.0",
      "description": "Retry collecting cell number after validation error",
      "variables": {
         "user_choice": {
            "type": "string",
            "description": "User choice for retry or exit"
         }
      },
      "steps": [
         {
            "id": "retry_msg",
            "type": "SAY",
            "value": "Sorry, '{{cell_number}}' is not a valid cell number.",
            "value_es": "Lo siento, '{{cell_number}}' no es un número de celular válido."
         },
         {
            "id": "offer_choice",
            "type": "SAY-GET",
            "variable": "user_choice",
            "value": "Would you like to try again? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to retry, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO to cancel.",
            "value_es": "¿Le gustaría intentar de nuevo? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb}} SÍ para reintentar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb}} NO para cancelar.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "handle_choice",
            "type": "CASE",
            "branches": {
               "condition: user_choice === '1' || user_choice.trim().toLowerCase() === 'yes' || user_choice.trim().toLowerCase() === 'sí'": {
                  "id": "retry_cell_entry",
                  "type": "FLOW",
                  "value": "get-cell-and-generate-link",
                  "mode": "replace"
               },
               "condition: user_choice === '2' || user_choice.trim().toLowerCase() === 'no'": {
                  "id": "provide_contact_info",
                  "type": "FLOW",
                  "value": "customer-service-contact",
                  "mode": "replace"
               },
               "default": {
                  "id": "provide_contact_info_default",
                  "type": "FLOW",
                  "value": "customer-service-contact",
                  "mode": "replace"
               }
            }
         }
      ]
   },

   {
      "id": "get-email-and-generate-link",
      "name": "GetEmailAndGenerateLink",
      "version": "1.0.0",
      "description": "Collect email and generate payment link",
      "steps": [
         {
            "id": "ask_email",
            "type": "SAY-GET",
            "variable": "email",
            "value": "Please {{cargo.verb}} {{cargo.voice ? 'or enter ' : ''}}your email.",
            "value_es": "Por favor {{cargo.verb}} {{cargo.voice ? 'o ingrese ' : ''}}su correo electrónico."
         },
         {
            "id": "branch_on_email",
            "type": "CASE",
            "branches": {
               "condition: validateEmail(email)": {
                  "id": "call_get_otp_link_email",
                  "type": "CALL-TOOL",
                  "tool": "get-otp-link",
                  "variable": "otp_link_result",
                  "args": {
                     "account_number": "",
                     "email": "{{email}}",
                     "phone_number": ""
                  },
                  "onFail": {
                     "id": "email-otp-failed-flow",
                     "type": "FLOW",
                     "value": "payment-failed",
                     "mode": "replace"
                  }
               },
               "default": {
                  "id": "retry_email_flow",
                  "type": "FLOW",
                  "value": "retry-get-email-and-generate-link",
                  "mode": "replace"
               }
            }
         }
      ]
   },

   {
      "id": "retry-get-email-and-generate-link",
      "name": "RetryGetEmailAndGenerateLink",
      "version": "1.0.0",
      "description": "Retry collecting email after validation error",
      "variables": {
         "user_choice": {
            "type": "string",
            "description": "User choice for retry or exit"
         }
      },
      "steps": [
         {
            "id": "retry_msg",
            "type": "SAY",
            "value": "Sorry, '{{email}}' is not a valid email address.",
            "value_es": "Lo siento, '{{email}}' no es una dirección de correo electrónico válida."
         },
         {
            "id": "offer_choice",
            "type": "SAY-GET",
            "variable": "user_choice",
            "value": "Would you like to try again? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to retry, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO to cancel.",
            "value_es": "¿Le gustaría intentar de nuevo? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb}} SÍ para reintentar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb}} NO para cancelar.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "handle_choice",
            "type": "CASE",
            "branches": {
               "condition: user_choice === '1' || ['yes', 'yes.', 'sí', 'sí.'].includes(user_choice.trim().toLowerCase())": {
                  "id": "retry_email_entry",
                  "type": "FLOW",
                  "value": "get-email-and-generate-link",
                  "mode": "replace"
               },
               "condition: user_choice === '2' || ['no', 'no.'].includes(user_choice.trim().toLowerCase())": {
                  "id": "provide_contact_info",
                  "type": "FLOW",
                  "value": "customer-service-contact",
                  "mode": "replace"
               },
               "default": {
                  "id": "provide_contact_info_default",
                  "type": "FLOW",
                  "value": "customer-service-contact",
                  "mode": "replace"
               }
            }
         }
      ]
   },

   {
      "id": "validate-payment-link",
      "name": "ValidatePaymentLink",
      "version": "1.0.0",
      "description": "Validate OTP link generation result and provide appropriate response",
      "steps": [
         {
            "id": "validate_otp_result",
            "type": "CASE",
            "branches": {
               "condition: otp_link_result.success": {
                  "id": "success_msg",
                  "type": "SAY",
                  "value": "Great! Payment link was sent to {{otp_link_result.customer_info.email && otp_link_result.customer_info.cell ? 'your email: ' + otp_link_result.customer_info.email + ' and cell: ' + otp_link_result.customer_info.cell : otp_link_result.customer_info.email ? 'your email: ' + otp_link_result.customer_info.email : 'your cell: ' + otp_link_result.customer_info.cell}}. To complete the payment, click the link in the message and it will log you in automatically and allow you to complete the payment.",
                  "value_es": "¡Genial! El enlace de pago fue enviado a {{otp_link_result.customer_info.email && otp_link_result.customer_info.cell ? 'su correo: ' + otp_link_result.customer_info.email + ' y celular: ' + otp_link_result.customer_info.cell : otp_link_result.customer_info.email ? 'su correo: ' + otp_link_result.customer_info.email : 'su celular: ' + otp_link_result.customer_info.cell}}. Para completar el pago, haga clic en el enlace del mensaje y se iniciará sesión automáticamente para que pueda completar el pago."
               },
               "default": {
                  "id": "retry_payment",
                  "type": "FLOW",
                  "value": "payment-failed",
                  "mode": "replace"
               }
            }
         }
      ]
   },

   {
      "id": "payment-failed",
      "name": "PaymentFailed",
      "version": "1.0.0",
      "description": "Handle payment failure",
      "variables": {
         "user_choice": {
            "type": "string",
            "description": "User choice for retry or exit"
         }
      },
      "steps": [
         {
            "id": "say_payment_failed",
            "type": "SAY",
            "value": "Sorry, the payment link could not be generated.",
            "value_es": "Lo siento, no se pudo generar el enlace de pago."
         },
         {
            "id": "offer_choice",
            "type": "SAY-GET",
            "variable": "user_choice",
            "value": "Would you like to try again? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to retry, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO for customer service contact information.",
            "value_es": "¿Le gustaría intentar de nuevo? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb}} SÍ para reintentar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb}} NO para información de contacto de servicio al cliente.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "handle_choice",
            "type": "CASE",
            "branches": {
               "condition: user_choice === '1' || ['yes', 'yes.', 'sí', 'sí.'].includes(user_choice.trim().toLowerCase())": {
                  "id": "restart_payment",
                  "type": "FLOW",
                  "value": "start-payment",
                  "mode": "replace"
               },
               "condition: user_choice === '2' || ['no', 'no.'].includes(user_choice.trim().toLowerCase())": {
                  "id": "provide_contact_info",
                  "type": "FLOW",
                  "value": "customer-service-contact",
                  "mode": "replace"
               },
               "default": {
                  "id": "provide_contact_info_default",
                  "type": "FLOW",
                  "value": "customer-service-contact",
                  "mode": "replace"
               }
            }
         }
      ]
   },

   {
      "id": "customer-service-contact",
      "name": "CustomerServiceContact",
      "version": "1.0.0",
      "description": "Provide customer service contact information",
      "steps": [
         {
            "id": "set_payment_aborted",
            "type": "SET",
            "variable": "payment_aborted",
            "value": true
         },
         {
            "id": "provide_contact_info",
            "type": "SAY",
            "value": "Sorry I couldn't help! For assistance with your payment, please call 1-877-495-6774 or text 'Pay' to Seven Zero Two Seven Three from a cell phone associated with your account.",
            "value_es": "¡Lo siento, no pude ayudar! Para asistencia con su pago, por favor llame al 1-877-495-6774 o envíe un mensaje de texto con la palabra 'Pagar' al Siete Cero Dos Siete Tres desde un celular asociado con su cuenta."
         }
      ]
   }
      
];

/* ---------- Global Variables ---------- */
const globalVariables = {
   global_acct_required_digits: 6,
   global_acct_max_digits: 12
};

/* ---------- Engine Boot ---------- */
const engine = new WorkflowEngine(
   logger,
   aiCallback,
   flowsMenu,
   toolsRegistry,
   APPROVED_FUNCTIONS,
   globalVariables
);
engine.disableCommands(); // Disable default flow commands for this demo

/* ---------- Simple REPL ---------- */
async function main() {

   try {
      fs.writeFileSync(path.resolve(__dirname, 'tests.flow'), JSON.stringify(flowsMenu, null, 2), 'utf8');
      fs.writeFileSync(path.resolve(__dirname, 'tests.tools'), JSON.stringify(toolsRegistry, null, 2), 'utf8');
      console.log('✅ Persisted flowsMenu and toolsRegistry to tests.flow and tests.tools');
   } catch (err) {
      console.error('❌ Failed to persist flows/tools:', err);
   }

   let session = engine.initSession("user-001", "session-001");
   // You can set session variables like this:
   session.cargo.test_var = "test value";

   // GLOBAL PAYMENT ABORT FEATURE:
   // The payment_aborted variable is automatically initialized to false
   // Any retry flow can set it to true to skip payment validation:
   // session.cargo.payment_aborted = true;
   // This will bypass the validate-payment-link flow and show a cancellation message

   // Simulate caller ID detection - in a real system, this would come from your telephony system
   session.cargo.twilioNumber = "12133864412"; // Example: Twilio number
   session.cargo.voice = false; // Simulate voice interaction
   session.cargo.verb = "type";
   session.cargo.verb_es = "diga";


   console.log(`Simulated caller ID: ${session.cargo.callerId}`);

   console.log("Type anything like: 'I need to make a payment' or 'payment' to test the enhanced caller ID flow");
   console.log("NOTE: This test includes JSON serialization/deserialization to simulate the remote widget");

   const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
   while (true) {
      const user = await rl.question("> ");

      // SIMULATE REMOTE WIDGET: Serialize session before sending to engine (like chat-widget.js does)
      //console.log("🔄 Simulating JSON serialization (like remote widget)...");
      const serializedSession = JSON.stringify(session);
      const deserializedSession = JSON.parse(serializedSession);

      // Use the deserialized session (this breaks object references without our fix)
      const result = await engine.updateActivity({ role: "user", content: user }, deserializedSession);
      session = result

      // SIMULATE REMOTE WIDGET: Serialize session again after engine response
      const serializedResult = JSON.stringify(session);
      session = JSON.parse(serializedResult);

      if (result.response) {
         console.log(result.response);
      } else {
         console.log("You said:", user);
      }
   }
}

main().catch(err => {
   logger.error("Fatal:", err);
   process.exit(1);
});
