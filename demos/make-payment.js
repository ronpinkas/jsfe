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

import crypto from "node:crypto";

import twilio from "twilio";
const TWILIO_AUTH_TOKEN = '<your_twilio_auth_token_here>';
const TWILIO_ACCOUNT_SID = '<your_twilio_account_sid_here>';

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

// Send email using our smtp server
async function sendEmail(to, cc, subject, body) {
   try {
      const transporter = nodemailer.createTransport({
         host: SMTP_HOST,
         port: SMTP_PORT,
         secure: true,
         auth: {
            user: SMTP_USER,
            pass: SMTP_PASSWORD
         }
      });

      const mailOptions = {
         from: '"instantAIguru" <mailer@instantaiguru.com>',
         to: to,
         subject: subject,
         text: body
      };
      if (cc) {
         mailOptions.cc = cc;
      }

      const info = await transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully: ${info.messageId} to ${to}`);
   } catch (error) {
      logger.error(`Error sending email: ${error}`);
      throw new Error(`Failed to send email: ${error.message}`);
   }
}

// Use same logic as in sendSMSOTP()
async function sendEmailOTP(to, container) {
   try {
      // Generate a 6-digit OTP
      const otp = crypto.randomInt(100000, 999999).toString();

      // Hash the OTP for storage
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

      // Store the hash and timestamp in the container
      container.otpHash = otpHash;
      container.otpTimestamp = Date.now();

      const domain = config.dbPrefix;
      const subject = `Your OTP Code for ${domain}`;
      const body = `Your One-Time Password (OTP) is: ${otp}\n\n`;

      await sendEmail(to, null, subject, body);
   } catch (error) {
      logger.error(`Error generating OTP for email ${to}:`, error);
      throw new Error(`Failed to generate OTP: ${error.message}`);
   }
}

// Send SMS using Twilio
async function sendTwilioSMS(accountSid, from, to, reply, messageSid = '') {
   const twilioClient = twilio(accountSid, TWILIO_AUTH_TOKEN);

   try {
      const sentMessage = await twilioClient.messages.create({
         body: reply,
         from: from,
         to: to,
      });
      logger.info(`Twilio SMS reply to message SID ${messageSid} sent: ${sentMessage.sid}`);
      return sentMessage.status
   } catch (error) {
      logger.error(`Error sending Twilio SMS reply to message SID ${messageSid}:`, error);
      throw new Error(`Failed to send Twilio SMS reply: ${error.message}`);
   }
}

// Generate a 6-digit OTP and send via SMS, return hash for persistence
async function sendSMSOTP(accountSid, from, to, container) {
   try {
      logger.info(`accountSid: ${accountSid}, from: ${from}, to: ${to} container: ${JSON.stringify(container)}`);

      // Use default Account SID if not provided (for non-SMS initiated requests)
      const effectiveAccountSid = accountSid || TWILIO_ACCOUNT_SID;

      // Generate a 6-digit OTP
      const otp = crypto.randomInt(100000, 999999).toString();

      // Hash the OTP for storage
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

      // Store the hash and timestamp in the container
      container.otpHash = otpHash;
      container.otpTimestamp = Date.now();

      // Send SMS with OTP
      const smsMessage = `Your verification code is: ${otp}. This code will expire in 10 minutes.`;
      await sendTwilioSMS(effectiveAccountSid, from, to, smsMessage, 'OTP');

      logger.info(`OTP sent to ${to} using AccountSid ${effectiveAccountSid}, hash stored in container`);
      return otpHash;
   } catch (error) {
      logger.error(`Error sending SMS OTP: ${error.message}`);
      throw error;
   }
}

// Validate OTP against stored hash with 10-minute expiration
async function validateOTP(otp, container) {
   try {
      // Check if OTP hash exists
      if (!container.otpHash || !container.otpTimestamp) {
         logger.warn(`No OTP found`);
         return false;
      }

      // Check if OTP has expired (10 minutes = 600000 milliseconds)
      const now = Date.now();
      const otpAge = now - container.otpTimestamp;
      const OTP_EXPIRY_TIME = 10 * 60 * 1000; // 10 minutes

      if (otpAge > OTP_EXPIRY_TIME) {
         logger.warn(`OTP expired`);
         // Clear expired OTP
         container.otpHash = null;
         container.otpTimestamp = null;
         return false;
      }

      // Hash the provided OTP and compare
      const providedOtpHash = crypto.createHash('sha256').update(otp.toString()).digest('hex');
      const isValid = providedOtpHash === container.otpHash;

      if (isValid) {
         logger.info(`OTP validated successfully`);
         // Clear the OTP after successful validation
         container.otpHash = null;
         container.otpTimestamp = null;
      } else {
         logger.warn(`Invalid OTP`);
      }

      return isValid;
   } catch (error) {
      logger.error(`Error validating OTP: ${error.message}`);
      throw error;
   }
}

/* ---------- Registries ---------- */
const APPROVED_FUNCTIONS = {
   "sendTwilioSMS": sendTwilioSMS,
   "sendSMSOTP": sendSMSOTP,
   "validateOTP": validateOTP,
   "validateDigits": validateDigits,
   "validatePhone": validatePhone,
   "validateEmail": validateEmail,
   "sendEmail": sendEmail,
   "sendEmailOTP": sendEmailOTP,
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
   },
   {
      "id": "create-crm-ticket",
      "name": "Create CRM Ticket",
      "description": "Creates a CRM ticket when customer requests live agent assistance",
      "parameters": {
         "type": "object",
         "properties": {
            "firstname": {
               "type": "string",
               "description": "Customer's first name",
               "default": ""
            },
            "lastname": {
               "type": "string",
               "description": "Customer's last name",
               "default": ""
            },
            "email": {
               "type": "string",
               "description": "Customer's email address",
               "default": ""
            },
            "phone": {
               "type": "string",
               "description": "Customer's phone number",
               "default": ""
            },
            "title": {
               "type": "string",
               "description": "Ticket title/subject",
               "default": "Live Agent Request"
            },
            "description": {
               "type": "string",
               "description": "Detailed description of the request including chat history",
               "default": ""
            }
         },
         "required": [
            "title",
            "description"
         ],
         "additionalProperties": false
      },
      "implementation": {
         "type": "http",
         "url": "https://<your-url>/create-case",
         "method": "POST",
         "contentType": "application/json",
         "timeout": 5000,
         "retries": 0,
         "headers": {
            "Authorization": "Bearer <CRM_API_KEY_PLACEHOLDER>"
         },
         "responseMapping": {
            "type": "object",
            "mappings": {
               "success": {
                  "path": "status",
                  "transform": "value === 'success'"
               },
               "case_id": {
                  "path": "case_id",
                  "fallback": null
               },
               "message": {
                  "path": "message",
                  "fallback": "Unknown response"
               },
               "error_message": {
                  "path": "message",
                  "fallback": "Unknown error occurred"
               },
               "api_response": "."
            }
         }
      },
      "security": {
         "requiresAuth": true,
         "auditLevel": "high",
         "dataClassification": "customer_service",
         "rateLimit": {
            "requests": 20,
            "window": 60000
         }
      }
   },
   {
      "id": "lookup-account",
      "name": "Lookup Account",
      "description": "Finds and validates account info based on phone, email, or account number",
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
         "url": "https://<your-url>/lookup-account",
         "method": "POST",
         "contentType": "application/json",
         "timeout": 10000,
         "retries": 0,
         "headers": {
            "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRfaWQiOiJwZXJtYW5lbnRfcHJvZF90b2tlbiIsImlhdCI6MTc1NTMwNTYxOSwiaXNzIjoicG9zX2FpX2FwaSJ9.0fwQn72pU0kUr37HJSverql9verbXYDgD1Yrygw1K2k"
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
                     "street": "street",
                     "city": "city",
                     "state": "state",
                     "zip": "zip"
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
   },
   {
      "id": "send-sms-otp",
      "name": "Send SMS OTP",
      "description": "Send OTP code via SMS for authentication",
      "parameters": {
         "accountSid": {
            "type": "string",
            "description": "Twilio Account SID"
         },
         "from": {
            "type": "string",
            "description": "From phone number"
         },
         "to": {
            "type": "string",
            "description": "To phone number"
         },
         "container": {
            "type": "object",
            "description": "Session cargo container for OTP storage"
         }
      },
      "required": ["accountSid", "from", "to", "container"],
      "additionalProperties": false,
      "implementation": {
         "type": "local",
         "function": "sendSMSOTP",
         "args": ["accountSid", "from", "to", "container"],
         "timeout": 5000
      },
      "security": {
         "requiresAuth": false,
         "auditLevel": "medium",
         "dataClassification": "authentication",
         "rateLimit": {
            "requests": 5,
            "window": 300000
         }
      }
   },
   {
      "id": "send-email-otp",
      "name": "Send Email OTP",
      "description": "Send OTP code via email for authentication",
      "parameters": {
         "type": "object",
         "properties": {
            "to": {
               "type": "string",
               "description": "Email address to send OTP to"
            },
            "container": {
               "type": "object",
               "description": "Session cargo container for OTP storage"
            }
         },
         "required": ["to", "container"],
         "additionalProperties": false
      },
      "implementation": {
         "type": "local",
         "function": "sendEmailOTP",
         "args": ["to", "container"],
         "timeout": 5000
      },
      "security": {
         "requiresAuth": false,
         "auditLevel": "medium",
         "dataClassification": "authentication",
         "rateLimit": {
            "requests": 5,
            "window": 300000
         }
      }
   },
   {
      "id": "validate-otp",
      "name": "Validate OTP",
      "description": "Validate OTP code entered by user",
      "parameters": {
         "otp": {
            "type": "string",
            "description": "OTP code to validate"
         },
         "container": {
            "type": "object",
            "description": "Session cargo container for OTP storage"
         }
      },
      "required": ["otp", "container"],
      "additionalProperties": false,
      "implementation": {
         "type": "local",
         "function": "validateOTP",
         "args": ["otp", "container"],
         "timeout": 5000
      },
      "security": {
         "requiresAuth": false,
         "auditLevel": "medium",
         "dataClassification": "authentication",
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
            "value": "To facilitate your payment we need to identify your account, {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES if you know your account number. {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO if you don't.",
            "value_es": "Para facilitar su pago, necesitamos identificar su cuenta, {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb}} SÍ si sabe su número de cuenta. {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb}} NO si no lo sabe.",
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
                  "value": "get-acct-number",
                  "mode": "call"
               },
               "condition: know_acct_yes_or_no === '2' || ['no', 'no.'].includes(know_acct_yes_or_no.trim().toLowerCase())": {
                  "id": "goto_cell_or_email_flow",
                  "type": "FLOW",
                  "value": "get-cell-or-email",
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
            "id": "conditional_generate_otp",
            "type": "CASE",
            "branches": {
               "condition: (typeof cell_number !== 'undefined' && cell_number) || (typeof email !== 'undefined' && email) || (typeof acct_number !== 'undefined' && acct_number)": {
                  "id": "generate_otp_link",
                  "type": "FLOW",
                  "value": "generate-otp-link",
                  "mode": "call"
               },
               "default": {
                  "id": "skip_otp_generation",
                  "type": "SET",
                  "variable": "otp_skipped",
                  "value": true
               }
            }
         },
         {
            "id": "conditional_validate_payment_link",
            "type": "CASE",
            "branches": {
               "condition: !payment_aborted && typeof otp_link_result !== 'undefined' && otp_link_result.success !== undefined": {
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
      "id": "get-acct-number",
      "name": "GetAcctNumber",
      "version": "1.0.0",
      "description": "Collect account number and validate",
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
                  "id": "acct_valid",
                  "type": "SET",
                  "variable": "acct_validated",
                  "value": true
               },
               "default": {
                  "id": "retry_acct_number_flow",
                  "type": "FLOW",
                  "value": "retry-get-acct-number",
                  "mode": "replace"
               }
            }
         }
      ]
   },
   {
      "id": "retry-get-acct-number",
      "name": "RetryGetAcctNumber",
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
                  "value": "get-acct-number",
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
      "id": "get-cell-or-email",
      "name": "GetCellOrEmail",
      "version": "1.0.0",
      "description": "Let user choose between cell phone or email for contact info",
      "steps": [
         {
            "id": "ask_cell_or_email",
            "type": "SAY-GET",
            "variable": "cell_or_email",
            "value": "Ok. We can locate your account using your phone or email. {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} 'PHONE' to proceed using your phone. {{cargo.voice ? 'Press 2 or ' : ''}}{{cargo.verb}} 'EMAIL' to proceed by email.",
            "value_es": "Bien. Podemos localizar su cuenta usando su teléfono o correo electrónico. {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb}} 'TELEFONO' para continuar usando su teléfono. {{cargo.voice ? 'Presione 2 o ' : ''}}{{cargo.verb}} 'EMAIL' para continuar por correo electrónico.",
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
                  "value": "get-cell"
               },
               "condition: cell_or_email === '2' || ['email.', 'email', 'e-mail.', 'e-mail'].includes(cell_or_email.trim().toLowerCase())": {
                  "id": "goto_email_flow",
                  "type": "FLOW",
                  "value": "get-email"
               },
               "default": {
                  "id": "retry_cell_or_email",
                  "type": "FLOW",
                  "value": "retry-get-cell-or-email",
                  "mode": "replace"
               }
            }
         }
      ]
   },
   {
      "id": "retry-get-cell-or-email",
      "name": "RetryGetCellOrEmail",
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
                  "value": "get-cell-or-email",
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
      "id": "get-cell",
      "name": "GetCell",
      "version": "1.0.0",
      "description": "Collect and validate cell number",
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
            "id": "validate_cell_number",
            "type": "CASE",
            "branches": {
               "condition: validatePhone(cell_number)": {
                  "id": "cell_valid",
                  "type": "SET",
                  "variable": "cell_validated",
                  "value": true
               },
               "default": {
                  "id": "retry_cell_flow",
                  "type": "FLOW",
                  "value": "retry-get-cell",
                  "mode": "replace"
               }
            }
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
            "value": "Great. I notice you are using a number ending with {{cargo.callerId.slice(-4).split('').join(', ')}}. {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to use that cell. {{cargo.voice ? 'Press 2 or ' : ''}}{{cargo.verb}} NO to use another cell.",
            "value_es": "Genial. Noto que está usando un número que termina en {{cargo.callerId.slice(-4).split('').join(', ')}}. {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb}} SÍ para usar ese celular. {{cargo.voice ? 'Presione 2 o ' : ''}}{{cargo.verb}} NO para usar otro celular.",
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
      "id": "retry-get-cell",
      "name": "RetryGetCell",
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
                  "value": "get-cell",
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
      "id": "get-email",
      "name": "GetEmail",
      "version": "1.0.0",
      "description": "Collect and validate email",
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
                  "id": "email_valid",
                  "type": "SET",
                  "variable": "email_validated",
                  "value": true
               },
               "default": {
                  "id": "retry_email_flow",
                  "type": "FLOW",
                  "value": "retry-get-email",
                  "mode": "replace"
               }
            }
         }
      ]
   },
   {
      "id": "retry-get-email",
      "name": "RetryGetEmail",
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
                  "value": "get-email",
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
                  "value": "Great! Payment link was sent to {{otp_link_result.customer_info.email && otp_link_result.customer_info.cell ? 'your email: ' + otp_link_result.customer_info.email + ' and cell: ' + otp_link_result.customer_info.cell : otp_link_result.customer_info.email ? 'your email: ' + otp_link_result.customer_info.email : 'your cell: ' + otp_link_result.customer_info.cell}}. Please click the link to complete your payment. You'll already be logged in, simply select your payment options and submit, it's that easy!",
                  "value_es": "¡Genial! El enlace de pago fue enviado a {{otp_link_result.customer_info.email && otp_link_result.customer_info.cell ? 'su correo: ' + otp_link_result.customer_info.email + ' y celular: ' + otp_link_result.customer_info.cell : otp_link_result.customer_info.email ? 'su correo: ' + otp_link_result.customer_info.email : 'su celular: ' + otp_link_result.customer_info.cell}}. Por favor haga clic en el enlace para completar su pago. ¡Ya estará conectado, simplemente seleccione sus opciones de pago y envíe, es así de fácil!"
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
            "value": "Sorry I couldn't help! For assistance with your payment, please call (Eight Seven Seven) Four Nine Five, Six Seven, Seven Four, or text 'Pay' to: Seven, Zero, Two, Seven, Three, from a cell phone associated with your account.",
            "value_es": "¡Lo siento, no pude ayudar! Para asistencia con su pago, por favor llame al (Ocho Siete Siete) Cuatro Nueve Cinco, Seis Siete, Siete Cuatro, o envíe un mensaje de texto con la palabra 'Pagar' al: Siete, Cero, Dos, Siete, Tres, desde un celular asociado con su cuenta."
         }
      ]
   },
   {
      "id": "create-crm-ticket",
      "name": "CreateLiveAgentTicket",
      "version": "1.0.0",
      "description": "Creates a CRM ticket when customer requests live agent assistance",
      "variables": {
         "ticket_result": {
            "type": "object",
            "description": "Result from CRM ticket creation"
         },
         "customer_first_name": {
            "type": "string",
            "description": "Customer's first name extracted from displayName"
         },
         "customer_last_name": {
            "type": "string",
            "description": "Customer's last name extracted from displayName"
         },
         "caller_id": {
            "type": "string",
            "description": "Caller ID phone number"
         },
         "display_name": {
            "type": "string",
            "description": "Customer display name"
         },
         "chat_history": {
            "type": "string",
            "description": "Complete chat history"
         }
      },
      "steps": [
         {
            "id": "extract_cargo_values",
            "type": "SET",
            "variable": "display_name",
            "value": "cargo.displayName ? cargo.displayName : 'Not available'"
         },
         {
            "id": "extract_caller_id",
            "type": "SET",
            "variable": "caller_id",
            "value": "cargo.callerId ? cargo.callerId : 'Not available'"
         },
         {
            "id": "extract_chat_history",
            "type": "SET",
            "variable": "chat_history",
            "value": "cargo.chatHistory ? cargo.chatHistory : 'No chat history available'"
         },
         {
            "id": "extract_customer_names",
            "type": "SET",
            "variable": "customer_first_name",
            "value": "display_name ? display_name.split(' ')[0] || '' : ''"
         },
         {
            "id": "extract_customer_last_name",
            "type": "SET",
            "variable": "customer_last_name",
            "value": "display_name ? display_name.split(' ').slice(1).join(' ') || '' : ''"
         },
         {
            "id": "create_ticket",
            "type": "CALL-TOOL",
            "tool": "create-crm-ticket",
            "variable": "ticket_result",
            "args": {
               "firstname": "{{customer_first_name}}",
               "lastname": "{{customer_last_name}}",
               "email": "",
               "phone": "{{caller_id}}",
               "title": "Live Agent Request",
               "description": "Customer requested live agent assistance.\n\nCustomer Display Name: {{display_name}}\nCaller ID: {{caller_id}}\n\nChat History:\n{{chat_history}}"
            },
            "onFail": {
               "id": "ticket_creation_failed",
               "type": "FLOW",
               "value": "handle-ticket-creation-failure",
               "mode": "call"
            }
         },
         {
            "id": "confirm_ticket_creation",
            "type": "CASE",
            "branches": {
               "condition: ticket_result.success": {
                  "id": "ticket_success_msg",
                  "type": "SAY",
                  "value": "I've created a support ticket for you{{ticket_result.case_id ? ' (Case #' + ticket_result.case_id + ')' : ''}}. A live agent will contact you shortly.",
                  "value_es": "He creado un ticket de soporte para usted{{ticket_result.case_id ? ' (Caso #' + ticket_result.case_id + ')' : ''}}. Un agente en vivo se comunicará con usted en breve."
               },
               "default": {
                  "id": "ticket_failure_fallback",
                  "type": "FLOW",
                  "value": "handle-ticket-creation-failure",
                  "mode": "call"
               }
            }
         }
      ]
   },
   {
      "id": "generate-otp-link",
      "name": "GenerateOtpLink",
      "version": "1.0.0",
      "description": "Generate OTP link using collected contact information",
      "steps": [
         {
            "id": "normalize_account_number",
            "type": "SET",
            "variable": "normalized_account_number",
            "value": "{{typeof acct_number !== 'undefined' ? acct_number : ''}}"
         },
         {
            "id": "normalize_email",
            "type": "SET",
            "variable": "normalized_email",
            "value": "{{typeof email !== 'undefined' ? email : ''}}"
         },
         {
            "id": "normalize_phone_number",
            "type": "SET",
            "variable": "normalized_phone_number",
            "value": "{{typeof cell_number !== 'undefined' ? cell_number : ''}}"
         },
         {
            "id": "call_get_otp_link",
            "type": "CALL-TOOL",
            "tool": "get-otp-link",
            "variable": "otp_link_result",
            "args": {
               "account_number": "{{normalized_account_number}}",
               "email": "{{normalized_email}}",
               "phone_number": "{{normalized_phone_number}}"
            },
            "onFail": {
               "id": "otp_generation_failed",
               "type": "FLOW",
               "value": "payment-failed",
               "mode": "replace"
            }
         }
      ]
   },
   {
      "id": "handle-ticket-creation-failure",
      "name": "HandleTicketCreationFailure",
      "version": "1.0.0",
      "description": "Handle failures in CRM ticket creation",
      "steps": [
         {
            "id": "ticket_failure_msg",
            "type": "SAY",
            "value": "I apologize, but I'm having trouble creating your support ticket at the moment. Result: {{ticket_result}}",
            "value_es": "Me disculpo, pero estoy teniendo problemas para crear su ticket de soporte en este momento. Resultado: {{ticket_result}}"
         }
      ]
   },
   {
      "id": "locate-account",
      "name": "LocateAccount",
      "version": "1.0.0",
      "description": "Help customer locate their account by authenticating with OTP",
      "prompt": "Account lookup with authentication",
      "primary": true,
      "variables": {
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
         "otp_code": {
            "type": "string",
            "description": "OTP code entered by user"
         },
         "otp_container": {
            "type": "object",
            "description": "Container for OTP hash and timestamp"
         },
         "otp_validation_result": {
            "type": "boolean",
            "description": "Result from OTP validation"
         },
         "lookup_result": {
            "type": "object",
            "description": "Result from account lookup"
         }
      },
      "steps": [
         {
            "id": "explain_authentication",
            "type": "SAY",
            "value": "To locate your account we must authenticate you, sending a code to the phone or email associated with your account.",
            "value_es": "Para localizar su cuenta debemos autenticarlo, enviando un código al teléfono o correo electrónico asociado con su cuenta."
         },
         {
            "id": "get_contact_info",
            "type": "FLOW",
            "value": "get-cell-or-email",
            "mode": "call"
         },
         {
            "id": "send_otp_based_on_contact",
            "type": "CASE",
            "branches": {
               "condition: cell_number": {
                  "id": "send_sms_otp",
                  "type": "CALL-TOOL",
                  "tool": "send-sms-otp",
                  "args": {
                     "accountSid": null,
                     "from": "{{cargo.twilioNumber}}",
                     "to": "{{cell_number}}",
                     "container": "{{cargo}}"
                  },
                  "onFail": {
                     "id": "sms_failed",
                     "type": "SAY",
                     "value": "Failed to send SMS. Please try email instead.",
                     "value_es": "Error al enviar SMS. Por favor intente con correo electrónico."
                  }
               },
               "condition: email": {
                  "id": "send_email_otp",
                  "type": "CALL-TOOL",
                  "tool": "send-email-otp",
                  "args": {
                     "to": "{{email}}",
                     "container": "{{cargo}}"
                  },
                  "onFail": {
                     "id": "email_failed",
                     "type": "SAY",
                     "value": "Failed to send email. Please try phone instead.",
                     "value_es": "Error al enviar correo. Por favor intente con teléfono."
                  }
               },
               "default": {
                  "id": "no_contact_error",
                  "type": "SAY",
                  "value": "No contact information available for authentication.",
                  "value_es": "No hay información de contacto disponible para autenticación."
               }
            }
         },
         {
            "id": "get_otp_from_user",
            "type": "SAY-GET",
            "variable": "otp_code",
            "value": "Please {{cargo.verb}} the 6-digit verification code you received.",
            "value_es": "Por favor {{cargo.verb}} el código de verificación de 6 dígitos que recibió.",
            "digits": {
               "min": 6,
               "max": 6
            }
         },
         {
            "id": "validate_otp_and_lookup",
            "type": "CASE",
            "branches": {
               "condition: otp_code && otp_code.length === 6": {
                  "id": "validate_otp",
                  "type": "CALL-TOOL",
                  "tool": "validate-otp",
                  "variable": "otp_validation_result",
                  "args": {
                     "otp": "{{otp_code}}",
                     "container": "{{cargo}}"
                  },
                  "onFail": {
                     "id": "otp_validation_failed",
                     "type": "SAY",
                     "value": "Invalid verification code. Please try again.",
                     "value_es": "Código de verificación inválido. Por favor inténtelo de nuevo."
                  }
               },
               "default": {
                  "id": "invalid_otp_format",
                  "type": "SAY",
                  "value": "Please enter a valid 6-digit code.",
                  "value_es": "Por favor ingrese un código válido de 6 dígitos."
               }
            }
         },
         {
            "id": "perform_lookup_if_validated",
            "type": "CASE",
            "branches": {
               "condition: otp_validation_result": {
                  "id": "perform_account_lookup",
                  "type": "CALL-TOOL",
                  "tool": "lookup-account",
                  "variable": "lookup_result",
                  "args": {
                     "email": "{{email}}",
                     "phone_number": "{{cell_number}}"
                  },
                  "onFail": {
                     "id": "lookup_failed",
                     "type": "SAY",
                     "value": "Unable to locate your account. Please try again or contact customer service.",
                     "value_es": "No se pudo localizar su cuenta. Por favor inténtelo de nuevo o contacte al servicio al cliente."
                  }
               },
               "default": {
                  "id": "otp_not_validated",
                  "type": "SAY",
                  "value": "Authentication failed. Please try again.",
                  "value_es": "Autenticación fallida. Por favor inténtelo de nuevo."
               }
            }
         },
         {
            "id": "show_lookup_results",
            "type": "CASE",
            "branches": {
               "condition: lookup_result && lookup_result.success": {
                  "id": "account_found",
                  "type": "SAY",
                  "value": "Account found! Customer: {{lookup_result.customer_info.first_name}} {{lookup_result.customer_info.last_name}}, Account ID: {{lookup_result.customer_info.cust_id}}",
                  "value_es": "¡Cuenta encontrada! Cliente: {{lookup_result.customer_info.first_name}} {{lookup_result.customer_info.last_name}}, ID de cuenta: {{lookup_result.customer_info.cust_id}}"
               },
               "default": {
                  "id": "account_not_found",
                  "type": "SAY",
                  "value": "Account not found with the provided contact information.",
                  "value_es": "Cuenta no encontrada con la información de contacto proporcionada."
               }
            }
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
   session.cargo.twilioNumber = "12132053155"; // Example: Twilio number
   session.cargo.callerId = "12135551212";   // Example: Caller ID
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
