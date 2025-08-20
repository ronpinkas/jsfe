// support-ticket.js
import { WorkflowEngine } from '../dist/index.js';
//import { WorkflowEngine } from "jsfe";

import readline from "node:readline/promises";

import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',  // Changed to debug to see HTTP requests
  format: winston.format.printf(({ level, message }) => {
    return `${level}: ${message}`;
  }),
  transports: [
    new winston.transports.Console()
  ]
});

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

function validate_phone_format(phone) {
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

function valid_email(email) {
   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
   return emailRegex.test(email);
}

async function genAndSendPaymentLink(params) {
   const acct_number = params.acct_number;
   const cell_number = params.cell_number || params.cell;
   const email = params.email;
   
   logger.info(`Generating payment link - account: ${acct_number}, cell: ${cell_number}, email: ${email}`);
   
   try {
      // Simulate payment link generation
      const paymentId = `PAY-${Date.now()}`;
      const paymentLink = `https://secure.payment.com/pay/${paymentId}`;
      
      // Handle the three scenarios: account lookup, cell direct, or email direct
      let contactInfo = {};
      
      if (acct_number) {
         // Scenario 1: Account-based lookup - simulate looking up customer contact info
         contactInfo = await lookupCustomerByAccount(acct_number);
         logger.info(`Found customer contact info for account ${acct_number}: ${JSON.stringify(contactInfo)}`);
      } else if (cell_number) {
         // Scenario 2: Cell-based direct
         contactInfo = { cell: cell_number, method: 'cell' };
      } else if (email) {
         // Scenario 3: Email-based direct  
         contactInfo = { email: email, method: 'email' };
      } else {
         throw new Error("Must provide either account_number, cell_number, or email");
      }
      
      // Send payment link to the appropriate contact method(s)
      const sendResults = {};
      
      if (contactInfo.cell) {
         sendResults.sms = await sendSMS(contactInfo.cell, `Payment link: ${paymentLink}`);
      }
      
      if (contactInfo.email) {
         sendResults.email = await sendEmail(contactInfo.email, "Payment Link", `Your payment link: ${paymentLink}`);
      }
      
      // Determine primary contact method used
      const primaryContact = contactInfo.cell || contactInfo.email;
      const primaryMethod = contactInfo.cell ? 'SMS' : 'Email';
      
      return {
         ok: true,
         payment_id: paymentId,
         payment_link: paymentLink,
         contact_method: primaryMethod,
         api_response: {
         DATA: {
            TWILIOINFO: {
               to: contactInfo.cell || "not provided",
               status: contactInfo.cell ? "sent" : "skipped"
            },
            EMAILINFO: {
               to: contactInfo.email || "not provided", 
               status: contactInfo.email ? "sent" : "skipped"
            }
         }
         }
      };
   } catch (error) {
      logger.error(`Payment link generation failed: ${error.message}`);
      return {
         ok: false,
         error: error.message
      };
   }
}

// Mock function to simulate customer lookup by account number
async function lookupCustomerByAccount(accountNumber) {
   // Simulate database lookup - in real implementation this would query your customer database
   logger.info(`Looking up customer info for account: ${accountNumber}`);
   
   // Simulate finding customer contact info based on account
   // In a real system, this would query your customer database
   const mockCustomerData = {
      "123456": { cell: "555-123-4567", email: "customer1@example.com" },
      "789012": { cell: "555-987-6543", email: "customer2@example.com" },
      "345678": { cell: "555-345-6789" }, // Cell only
      "901234": { email: "customer4@example.com" }, // Email only
   };
   
   const customerInfo = mockCustomerData[accountNumber];
   if (!customerInfo) {
      throw new Error(`No customer found for account number: ${accountNumber}`);
   }
   
   return customerInfo;
}

// Mock SMS sending function
async function sendSMS(phone, message) {
   logger.info(`SMS sent to ${phone}: ${message}`);
   return { status: "sent", to: phone };
}

// Mock email sending function  
async function sendEmail(email, subject, body) {
  logger.info(`Email sent to ${email}: ${subject}`);
  return { status: "sent", to: email };
}

/* ---------- Registries ---------- */
const APPROVED_FUNCTIONS = {
   "validateDigits": validateDigits,
   "validate_phone_format": validate_phone_format,
   "valid_email": valid_email,
   "genAndSendPaymentLink": genAndSendPaymentLink
};

const toolsRegistry = [
	{
		id: "get-otp-link",
		name: "Get OTP Link",
		description: "Generates a one-time payment link and sends it to the user via SMS and optionally email",
      parameters: {
         type: "object",
         properties: {
            acct_number: { type: "string", description: "Account Number" },
            cell_number: { type: "string", description: "Customer's phone number" },
            email: { type: "string", description: "Customer's email address" }
         },
         required: [],
         additionalProperties: false
      },
      implementation: { type: "local", function: "genAndSendPaymentLink", timeout: 5000 },
      security: { requiresAuth: false },
	},
];

const flowsMenu = [
   {
      id: "start-payment",
      name: "StartPayment",
      version: "1.0.0",
      description: "Start payment process",
      prompt: "Accepting payment",
      prompt_es: "Aceptando pago",
      variables: {
         know_acct_yes_or_no: { type: "string", description: "User response for knowing account number" },
         acct_number: { type: "string", description: "Customer account number" },
         cell_or_email: { type: "string", description: "User choice between cell or email" },
         cell_number: { type: "string", description: "Customer cell phone number" },
         email: { type: "string", description: "Customer email address" },
         otp_link_result: { type: "object", description: "Result from OTP link generation" }
      },
      steps: [
         {
            id: "ask_known_account",
            type: "SAY-GET",
            variable: "know_acct_yes_or_no",
            value: "Press 1 or say YES if you know your account number - press 2 or say NO if you don't.",
            value_es: "Presione 1 o diga SÍ si conoce su número de cuenta - presione 2 o diga NO si no lo conoce."
         },
         {
            id: "branch_on_account_knowledge",
            type: "CASE",
            branches: {
               "condition: {{know_acct_yes_or_no}} === '1' || {{know_acct_yes_or_no.trim().toLowerCase()}} === 'yes'": {
                  id: "goto_acct_flow",
                  type: "FLOW",
                  value: "get-acct-number-and-generate-link",
                  mode: "call"
               },
               "condition: {{know_acct_yes_or_no}} === '2' || {{know_acct_yes_or_no.trim().toLowerCase()}} === 'no'": {
                  id: "goto_cell_or_email_flow",
                  type: "FLOW",
                  value: "get-cell-or-email-and-generate-link",
                  mode: "call"
               },
               "default": {
                  id: "retry_start_payment",
                  type: "FLOW",
                  value: "retry-start-payment",
                  mode: "replace"
               }
            }
         },
         {
            id: "validate_payment_link",
            type: "FLOW",
            value: "validate-payment-link",
            mode: "call"
         }
      ]
   },

   {
      id: "retry-start-payment",
      name: "RetryStartPayment",
      version: "1.0.0",
      description: "Retry the payment process after an error",
      steps: [
         { 
            id: "retry_msg", 
            type: "SAY", 
            value: "Oops, sorry, something went wrong - let's try again...",
            value_es: "Ups, lo siento, algo salió mal - intentemos de nuevo..."
         },
         { id: "restart_payment", type: "FLOW", value: "start-payment", mode: "replace" }
      ]
   },

   {
      id: "get-acct-number-and-generate-link",
      name: "GetAcctNumberAndGenerateLink",
      version: "1.0.0",
      description: "Collect account number and generate payment link",
      steps: [
         {
         id: "ask_acct_number",
         type: "SAY-GET",
         variable: "acct_number",
         value: "Please say or enter your account number",
         value_es: "Por favor diga o ingrese su número de cuenta"
         },
         {
         id: "branch_on_account_number",
         type: "CASE",
         branches: {
            "condition: validateDigits({{acct_number}}, {{global_acct_required_digits}}, {{global_acct_max_digits}})": {
               id: "call_get_otp_link",
               type: "CALL-TOOL",
               tool: "get-otp-link",
               variable: "otp_link_result",
               parameters: {
                  acct_number: "{{acct_number}}"
               }
            },
            "default": {
               id: "retry_acct_number_flow",
               type: "FLOW",
               value: "retry-get-acct-number-and-generate-link",
               mode: "replace"
            }
         }
         }
      ]
   },

   {
      id: "retry-get-acct-number-and-generate-link",
      name: "RetryGetAcctNumberAndGenerateLink",
      version: "1.0.0",
      description: "Retry collecting account number after validation error",
      steps: [
         { 
            id: "retry_msg", 
            type: "SAY", 
            value: "Oops, sorry, something went wrong - let's try again...",
            value_es: "Ups, lo siento, algo salió mal - intentemos de nuevo..."
         },
         { id: "retry_flow", type: "FLOW", value: "get-acct-number-and-generate-link", mode: "replace" }
      ]
   },

   {
      id: "get-cell-or-email-and-generate-link",
      name: "GetCellOrEmailAndGenerateLink",
      version: "1.0.0",
      description: "Let user choose between cell phone or email for payment link delivery",
      steps: [
         {
         id: "ask_cell_or_email",
         type: "SAY-GET",
         variable: "cell_or_email",
         value: "To locate your account we need to validate your cell or email. Press 1 or say CELL to proceed using your phone - Press 2 or say EMAIL to proceed by email.",
         value_es: "Para localizar su cuenta necesitamos validar su celular o email. Presione 1 o diga CELULAR para proceder usando su teléfono - Presione 2 o diga EMAIL para proceder por correo."
         },
         {
         id: "branch_on_cell_or_email",
         type: "CASE",
         branches: {
            "condition:{{cell_or_email}} === '1' || ['cell', 'phone', 'mobile'].includes({{cell_or_email}}.trim().toLowerCase())": {
               id: "goto_cell_flow",
               type: "FLOW",
               value: "get-cell-and-generate-link"
            },
            "condition:{{cell_or_email}} === '2' || {{cell_or_email}} === 'email'": {
               id: "goto_email_flow",
               type: "FLOW",
               value: "get-email-and-generate-link"
            },
            "default": {
               id: "retry_cell_or_email",
               type: "FLOW",
               value: "retry-get-cell-or-email-and-generate-link",
               mode: "replace"
            }
         }
         }
      ]
   },

   {
      id: "retry-get-cell-or-email-and-generate-link",
      name: "RetryGetCellOrEmailAndGenerateLink",
      version: "1.0.0",
      description: "Retry choosing between cell phone or email after invalid input",
      steps: [
         { 
            id: "retry_msg", 
            type: "SAY", 
            value: "Oops, sorry, something went wrong - let's try again...",
            value_es: "Ups, lo siento, algo salió mal - intentemos de nuevo..."
         },
         { id: "retry_flow", type: "FLOW", value: "get-cell-or-email-and-generate-link", mode: "replace" }
      ]
   },

   {
      id: "get-cell-and-generate-link",
      name: "GetCellAndGenerateLink",
      version: "1.0.0",
      description: "Collect cell number and generate payment link with caller ID detection",
      steps: [
         {
            id: "check_caller_id_available",
            type: "CASE",
            branches: {
               "condition: {{cargo.callerId}} && {{cargo.callerId.length}} >= 10": {
                  id: "goto_caller_id_flow",
                  type: "FLOW",
                  value: "get-cell-with-caller-id",
                  mode: "call"
               },
               "default": {
                  id: "goto_manual_cell_flow",
                  type: "FLOW",
                  value: "get-cell-manual-entry",
                  mode: "call"
               }
            }
         },
         {
            id: "validate_and_send",
            type: "FLOW",
            value: "validate-cell-and-send-link",
            mode: "call"
         }
      ]
   },

   {
      id: "get-cell-with-caller-id",
      name: "GetCellWithCallerId",
      version: "1.0.0",
      description: "Offer to use detected caller ID for cell number",
      variables: {
         use_caller_id: { type: "string", description: "User choice to use detected caller ID" }
      },
      steps: [
         {
            id: "offer_caller_id",
            type: "SAY-GET",
            variable: "use_caller_id",
            value: "I notice you called from a number ending with {{cargo.callerId.slice(-4).split('').join('-')}}. Press 1 or say YES to use that cell - Press 2 or say NO to use another cell.",
            value_es: "Noto que llamó desde un número que termina en {{cargo.callerId.slice(-4).split('').join('-')}}. Presione 1 o diga SÍ para usar ese celular - Presione 2 o diga NO para usar otro celular."
         },
         {
            id: "handle_caller_id_choice",
            type: "CASE",
            branches: {
               "condition: {{use_caller_id}} === '1' || {{use_caller_id.trim().toLowerCase()}} === 'yes'": {
                  id: "use_detected_number",
                  type: "SET",
                  variable: "cell_number",
                  value: "{{cargo.callerId}}"
               },
               "condition: {{use_caller_id}} === '2' || {{use_caller_id.trim().toLowerCase()}} === 'no'": {
                  id: "goto_manual_entry",
                  type: "FLOW",
                  value: "get-cell-manual-entry",
                  mode: "call"
               },
               "default": {
                  id: "retry_caller_id_choice",
                  type: "FLOW",
                  value: "retry-get-cell-with-caller-id",
                  mode: "replace"
               }
            }
         }
      ]
   },

   {
      id: "get-cell-manual-entry",
      name: "GetCellManualEntry",
      version: "1.0.0",
      description: "Manual cell number entry",
      steps: [
         {
            id: "ask_cell_number",
            type: "SAY-GET",
            variable: "cell_number",
            value: "Please say or enter your cell number",
            value_es: "Por favor diga o ingrese su número de celular"
         }
      ]
   },

   {
      id: "validate-cell-and-send-link",
      name: "ValidateCellAndSendLink",
      version: "1.0.0",
      description: "Validate cell number and send payment link",
      steps: [
         {
            id: "validate_cell_number",
            type: "CASE",
            branches: {
               "condition: validate_phone_format({{cell_number}})": {
                  id: "call_get_otp_link_cell",
                  type: "CALL-TOOL",
                  tool: "get-otp-link",
                  variable: "otp_link_result",
                  parameters: { cell_number: "{{cell_number}}" }
               },
               "default": {
                  id: "retry_cell_flow",
                  type: "FLOW",
                  value: "retry-get-cell-and-generate-link",
                  mode: "replace"
               }
            }
         }
      ]
   },

   {
      id: "retry-get-cell-with-caller-id",
      name: "RetryGetCellWithCallerId",
      version: "1.0.0",
      description: "Retry caller ID choice after invalid input",
      steps: [
         { 
            id: "retry_msg", 
            type: "SAY", 
            value: "Oops, sorry, something went wrong - let's try again...",
            value_es: "Ups, lo siento, algo salió mal - intentemos de nuevo..."
         },
         { id: "retry_flow", type: "FLOW", value: "get-cell-with-caller-id", mode: "replace" }
      ]
   },

   {
      id: "retry-get-cell-and-generate-link",
      name: "RetryGetCellAndGenerateLink",
      version: "1.0.0",
      description: "Retry collecting cell number after validation error",
      steps: [
         { 
            id: "retry_msg", 
            type: "SAY", 
            value: "Oops, sorry, something went wrong - let's try again...",
            value_es: "Ups, lo siento, algo salió mal - intentemos de nuevo..."
         },
         { id: "retry_flow", type: "FLOW", value: "get-cell-and-generate-link", mode: "replace" }
      ]
   },

   {
      id: "get-email-and-generate-link",
      name: "GetEmailAndGenerateLink",
      version: "1.0.0",
      description: "Collect email and generate payment link",
      steps: [
         {
         id: "ask_email",
         type: "SAY-GET",
         variable: "email",
         value: "Please say your email",
         value_es: "Por favor diga su correo electrónico"
         },
         {
         id: "branch_on_email",
         type: "CASE",
         branches: {
            "condition:valid_email({{email}})": {
               id: "call_get_otp_link_email",
               type: "CALL-TOOL",
               tool: "get-otp-link",
               variable: "otp_link_result",
               parameters: { email: "{{email}}" }
            },
            "default": {
               id: "retry_email_flow",
               type: "FLOW",
               value: "retry-get-email-and-generate-link",
               mode: "replace"
            }
         }
         }
      ]
   },

   {
      id: "retry-get-email-and-generate-link",
      name: "RetryGetEmailAndGenerateLink",
      version: "1.0.0",
      description: "Retry collecting email after validation error",
      steps: [
         { 
            id: "retry_msg", 
            type: "SAY", 
            value: "Oops, sorry, something went wrong - let's try again...",
            value_es: "Ups, lo siento, algo salió mal - intentemos de nuevo..."
         },
         { id: "retry_flow", type: "FLOW", value: "get-email-and-generate-link", mode: "replace" }
      ]
   },

   {
      id: "validate-payment-link",
      name: "ValidatePaymentLink",
      version: "1.0.0", 
      description: "Validate OTP link generation result and provide appropriate response",
      steps: [
         {
         id: "validate_otp_result",
         type: "CASE",
         branches: {
            "condition:{{otp_link_result.ok}}": {
               id: "success_msg",
               type: "SAY",
               value: "Payment link was sent to {{otp_link_result.api_response.DATA.TWILIOINFO.to}}",
               value_es: "El enlace de pago fue enviado a {{otp_link_result.api_response.DATA.TWILIOINFO.to}}"
            },
            "default": {
               id: "retry_payment",
               type: "FLOW",
               value: "retry-start-payment",
               mode: "replace"
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

/* ---------- Simple REPL ---------- */
async function main() {
	let session = engine.initSession(logger, "user-001", "session-001");
  // You can set session variables like this:
  session.cargo.test_var = "test value";
  
  // Simulate caller ID detection - in a real system, this would come from your telephony system
  session.cargo.callerId = "15551234567"; // Example: caller ID
  session.cargo.twilioNumber = "12133864412"; // Example: Twilio number
  console.log(`Simulated caller ID: ${session.cargo.callerId}`);

	console.log("Type anything like: 'I need to make a payment' or 'payment' to test the enhanced caller ID flow");

	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	while (true) {
		const user = await rl.question("> ");
		const result = await engine.updateActivity({ role: "user", content: user }, session);
    session = result
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
