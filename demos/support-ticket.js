// support-ticket.js
//import { WorkflowEngine } from '../dist/index.js';
import { WorkflowEngine } from "jsfe";

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

/* ---------- level-filtered logger (default 'warn') ---------- */
function makeLogger(level = process.env.LOG_LEVEL || "warn") {
	const ORDER = { debug: 10, info: 20, warn: 30, error: 40 };
	let current = ORDER[level] ?? ORDER.warn;
  const allow = (lvl) => ORDER[lvl] >= current;
	return {
		setLevel: (lvl) => { current = ORDER[lvl] ?? current; },
    debug: (...a) => { if (allow("debug")) console.debug(...a); },
    info:  (...a)  => { if (allow("info"))  console.info(...a); },
    warn:  (...a)  => { if (allow("warn"))  console.warn(...a); },
    error: (...a) => { if (allow("error")) console.error(...a); },
	};
}
const logger = makeLogger();

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

	if (!res.ok) throw new Error(`AI API failed: ${res.status} ${res.statusText}`);
	const data = await res.json();
	return data?.choices?.[0]?.message?.content?.trim() || "";
}

/* ---------- Local tool: createSupportTicket ---------- */
async function createSupportTicket({ subject, description, customer_email }) {
  if (!subject?.trim() || !description?.trim() || !customer_email?.includes("@")) {
    return { ok: false, error: "Please provide subject, description, and a valid email." };
  }

	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	const file = path.join(__dirname, "tickets.json");

	let db = [];
	try {
		const raw = await fs.readFile(file, "utf8");
		db = JSON.parse(raw);
	} catch { /* first run */ }

	const ticket = {
		id: `T-${Date.now()}`,
		subject,
		description,
		customer_email,
		created_at: new Date().toISOString(),
		status: "open",
	};
	db.push(ticket);
	await fs.writeFile(file, JSON.stringify(db, null, 2), "utf8");

	return { ok: true, ticket };
}

/* ---------- Registries ---------- */
const APPROVED_FUNCTIONS = new Map([["createSupportTicket", createSupportTicket]]);

const toolsRegistry = [
	{
		id: "CreateSupportTicket",
		name: "Create Support Ticket",
		description: "Creates a support ticket in the local JSON store",
		parameters: {
			type: "object",
			properties: {
				subject: { type: "string", description: "Short title" },
				description: { type: "string", description: "Detailed description" },
				customer_email: { type: "string", description: "Customer email" },
			},
			required: ["subject", "description", "customer_email"],
			additionalProperties: false,
		},
		implementation: { type: "local", function: "createSupportTicket", timeout: 8000 },
		security: { requiresAuth: false },
	},
];

const flowsMenu = [
	{
		id: "support-ticket",
    version: "1.1.0",
		name: "OpenSupportTicket",
		prompt: "Open a new support ticket",
		description: "Collect subject, description, and email; then create a ticket.",
		steps: [
      { type: "SAY",     id: "say_1",     value: "Sure — let's open a support ticket. With Cargo: {{cargo.test_var}}" },
      { type: "SAY-GET", id: "say_get_1", variable: "subject", value: "Subject?" },
      { type: "SAY-GET", id: "say_get_2", variable: "description", value: "What happened? (a few sentences)" },
      { type: "SAY-GET", id: "say_get_3", variable: "customer_email", value: "Your email?" },
			{
				type: "CALL-TOOL",
        id: "call_tool_1",
				tool: "CreateSupportTicket",
				variable: "ticket_result", 
				args: {
					subject: "{{subject}}",
					description: "{{description}}",
					customer_email: "{{customer_email}}"
				}
			},
      { type: "SET", id: "set_2", variable: "success", value: "{{ticket_result.ok}}" },
      {
        type: 'SWITCH', id: 'switch_1', variable: 'success',
        branches: {
          true: {
            type: "SAY", id: "say_3", value: "Ticket created: {{ticket_result.ticket.id}} — we will email updates to {{ticket_result.ticket.customer_email}}."
          },
          default: {
            type: "SAY", id: "say_4", value: "Failed to create ticket: {{ticket_result.error}}"
          }
        } 
      }
		]
	}
];

/* ---------- Engine Boot ---------- */
const engine = new WorkflowEngine(
	logger,
	aiCallback,
	flowsMenu,
	toolsRegistry,
	APPROVED_FUNCTIONS
);

/* ---------- Simple REPL ---------- */
async function main() {
	let session = engine.initSession(logger, "user-001", "session-001");
  // You can set session variables like this:
  session.cargo.test_var = "test value";

	console.log("Type anything like: 'I need to open a support ticket'");

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
