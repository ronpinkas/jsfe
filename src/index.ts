/**
 * Copyright (c) 2025 InstantAIguru.com

Permission is hereby granted, free of charge, to any person obtaining a copy of this software 
and associated documentation files (the “Software”), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
**/

/**
 * Flows Engine for any conversational platform
 * ============================================
 *
 * Overview:
 * ---------
 * This module implements a robust, extensible, and secure workflow orchestration engine
 * for conversational and automation platforms. It is designed to power production-grade,
 * multi-flow, multi-step user journeys with advanced interruption, resumption, and tool
 * integration capabilities.
 *
 * Key Features:
 * -------------
 * - Stack-of-stacks model for flow frames, enabling nested flows, interruptions, and resumptions.
 * - Modular step handlers for SAY, SAY-GET, SET, SWITCH, TOOL, and SUBFLOW steps.
 * - Secure, pattern-based expression evaluation for variable interpolation and flow logic.
 * - AI-powered intent detection, argument extraction, and flow activation, with robust fallbacks.
 * - Universal flow control commands (help, status, cancel, exit) available at any point in a flow.
 * - Comprehensive error handling, logging, and audit support for production reliability.
 * - Flexible tool integration: supports local functions, HTTP APIs, and mock/test tools withvalidation and authentication.
 * - Metadata-driven flow definitions (risk, auth, category) for security and analytics.
 *
 * Security Model:
 * --------------
 * - All user-supplied expressions are evaluated with strict pattern checks to prevent code injection or unsafe operations.
 * - No arbitrary code execution is allowed in variable interpolation or flow logic.
 * - Tool calls support secure authentication (Bearer, Basic, HMAC/hash) and header management.
 *
 * Usage:
 * ------
 * - Instantiate the WorkflowEngine with a flows menu, tools registry, and approved local functions.
 * - Use `updateActivity(contextEntry, userId)` to share user input before your processing and assistant responses after processing.
 * - For user inputs: contextEntry.role = 'user' - analyzed and optionally triggers full flow logic
 * - For assistant responses: contextEntry.role = 'assistant' - adds to context stack only
 * - Extend with new step handlers or tool integrations as needed for your platform.
 *
 * Maintenance:
 * ------------
 * - Review and update security patterns regularly.
 * - Ensure comprehensive test coverage for all step handlers and flow control logic.
 * - Monitor logs and audit trails for production issues and user behavior analytics.
 *
 * Author: instantAIguru.com Team
 * Last updated: August 2025
 **/

import * as crypto from "crypto";
import Ajv from "ajv";
import addFormats from "ajv-formats";

/**
 * Pure JS parser for .tools file content (string or object)
 * @param input JSON string or parsed object
 * @returns tools array
 */
export function parseTools(input: string | object): any[] {
  let parsed: any;
  if (typeof input === 'string') {
    parsed = JSON.parse(input);
  } else {
    parsed = input;
  }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.tools)) return parsed;
    throw new Error('Invalid .tools file format');
}

/**
 * Pure JS parser for .flows file content (string or object)
 * @param input JSON string or parsed object
 * @returns flows array
 */
export function parseFlows(input: string | object): any[] {
  let parsed: any;
  if (typeof input === 'string') {
    parsed = JSON.parse(input);
  } else {
    parsed = input;
  }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.flows)) return parsed;
    throw new Error('Invalid .flows file format');
}


/**
 * Logger interface for use with WorkflowEngine.
 *
 * Any logger passed to initSession must implement these four methods.
 *
 * @example
 * class MyLogger implements Logger {
 *   info(msg: string) { ... }
 *   warn(msg: string) { ... }
 *   error(msg: string) { ... }
 *   debug(msg: string) { ... }
 * }
 */
export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export type MessageTemplates = Record<string, string>;
export type MessageRegistry = Record<string, MessageTemplates>;

// === GUIDANCE INTEGRATION CONFIGURATION ===
export interface GuidanceConfig {
  enabled: boolean; // Whether to add guidance messages at all
  mode: 'append' | 'prepend' | 'template' | 'none'; // How to integrate guidance
  template?: string; // Template for custom integration (e.g., "{{message}} - {{guidance}}")
  separator?: string; // Separator between message and guidance (default: "\n\n")
  contextSelector?: 'general' | 'payment' | 'auto'; // Which guidance context to use
  guidanceMessages?: {
    // Single language format (for backwards compatibility)
    general?: string;
    payment?: string;
  } | MessageRegistry; // Multi-language format (like messageRegistry: {en: {general: ..., payment: ...}, es: {...}})
}

// === BUILT-IN MESSAGE REGISTRY ===
// Centralized system messages for internationalization and customization
// This registry contains all engine-generated user-facing messages
const DEFAULT_MESSAGE_REGISTRY: MessageRegistry = {
  en: {
    flow_init: "🤖 Processing {{flowPrompt}}",
    flow_interrupted: "🔄 Switched to {{flowPrompt}}\n\n(Your previous \"{{previousFlowPrompt}}\" progress has been saved)",
    flow_resumed: "🔄 Resuming where you left off with {{flowPrompt}}.",
    flow_resumed_with_guidance: "🔄 Resuming {{flowPrompt}} - Type 'cancel' or 'help' for options.",
    flow_completed: "✅ {{flowPrompt}} completed successfully.",
    flow_completed_generic: "✅ Flow completed.",
    flow_cancelled: "❌ Cancelled {{flowPrompt}}.",
    flow_help_general: "Processing {{flowPrompt}} - You can also 'cancel' or request 'help'.",
    flow_help_payment: "Processing {{flowPrompt}} - You can also 'cancel' or request 'help'.",
    critical_error: "❌ I encountered a critical error. Let me restart our session to ensure everything works properly.",
    invalid_input: "❌ I'm sorry, I didn't understand that. Please try again.",
    system_ready: "🤖 System ready. How can I help you today?",
    no_flows_available: "❌ No workflows are currently available.",
    flow_execution_error: "❌ An error occurred while processing your request. Please try again.",
    switch_no_branch_found: "SWITCH step: no branch found for value '{{switchValue}}' and no default branch defined",
    tool_failed: "Tool \"{{toolName}}\" failed: {{errorMessage}}",
    subflow_not_found: "Sub-flow \"{{subFlowName}}\" not found.",
    flow_switch_error: "❌ Cannot switch to \"{{targetFlow}}\" - flow definition not found.\n\nReturning to main menu.",
    flow_not_found: "❌ Could not start \"{{targetFlow}}\" - flow not found.",
    flow_switch_general_error: "I encountered an error while switching flows: {{errorMessage}}. Please try again or contact support if the issue persists.",
    
    // System Commands
    cmd_flow_exited: "✅ Successfully exited {{flowName}}. How can I help you with something else?",
    cmd_help_title: "📋 Flow Help - {{flowName}}",
    cmd_help_available_commands: "Available commands while in this flow:",
    cmd_help_cancel: "• \"cancel\" - Exit this flow completely",
    cmd_help_status: "• \"status\" - Show current flow information", 
    cmd_help_help: "• \"help\" - Show this help message",
    cmd_help_financial_warning: "⚠️ This is a financial transaction flow. Please complete or cancel to maintain security.",
    cmd_help_current_question: "**Current Question:**",
    cmd_help_respond_instruction: "Please respond to the question above, or use a command listed above.",
    cmd_help_continue_instruction: "Continue with your response to proceed, or use a command above.",
    
    cmd_status_title: "📊 **Flow Status**",
    cmd_status_current_flow: "Current Flow: {{flowName}}",
    cmd_status_steps_remaining: "Steps Remaining: {{stepsRemaining}}",
    cmd_status_stack_depth: "Stack Depth: {{stackDepth}}",
    cmd_status_transaction_id: "Transaction ID: {{transactionId}}",
    cmd_status_collected_info: "Collected Information:",
    cmd_status_hidden_value: "[HIDDEN]",
    cmd_status_continue_instruction: "Continue with your response to proceed.",
    
    cmd_interruption_switch: "switch",
    cmd_interruption_continue: "continue",
  },
  es: {
    flow_init: "🤖 Procesando {{flowPrompt}}",
    flow_interrupted: "🔄 Cambiado a {{flowPrompt}}\n\n(Su progreso anterior de \"{{previousFlowPrompt}}\" ha sido guardado)",
    flow_resumed: "🔄 Continuando donde lo dejó con {{flowPrompt}}.",
    flow_resumed_with_guidance: "🔄 Continuando {{flowPrompt}} - Escriba 'cancelar' o 'ayuda' para opciones.",
    flow_completed: "✅ {{flowPrompt}} completado exitosamente.",
    flow_completed_generic: "✅ Flujo completado.",
    flow_cancelled: "❌ {{flowPrompt}} cancelado.",
    flow_help_general: "Procesando {{flowPrompt}} - También puede 'cancelar' o solicitar 'ayuda'.",
    flow_help_payment: "Procesando {{flowPrompt}} - También puede 'cancelar' o solicitar 'ayuda'.",
    critical_error: "❌ Encontré un error crítico. Permítame reiniciar nuestra sesión para asegurar que todo funcione correctamente.",
    invalid_input: "❌ Lo siento, no entendí eso. Por favor, inténtelo de nuevo.",
    system_ready: "🤖 Sistema listo. ¿Cómo puedo ayudarle hoy?",
    no_flows_available: "❌ No hay flujos de trabajo disponibles actualmente.",
    flow_execution_error: "❌ Ocurrió un error al procesar su solicitud. Por favor, inténtelo de nuevo.",
    switch_no_branch_found: "Paso SWITCH: no se encontró rama para el valor '{{switchValue}}' y no se definió rama por defecto",
    tool_failed: "Herramienta \"{{toolName}}\" falló: {{errorMessage}}",
    subflow_not_found: "Sub-flujo \"{{subFlowName}}\" no encontrado.",
    flow_switch_error: "❌ No se puede cambiar a \"{{targetFlow}}\" - definición de flujo no encontrada.\n\nRegresando al menú principal.",
    flow_not_found: "❌ No se pudo iniciar \"{{targetFlow}}\" - flujo no encontrado.",
    flow_switch_general_error: "Encontré un error al cambiar flujos: {{errorMessage}}. Por favor intente de nuevo o contacte soporte si el problema persiste.",
    
    // System Commands
    cmd_flow_exited: "✅ Salió exitosamente de {{flowName}}. ¿Cómo puedo ayudarle con algo más?",
    cmd_help_title: "📋 Ayuda del Flujo - {{flowName}}",
    cmd_help_available_commands: "Comandos disponibles en este flujo:",
    cmd_help_cancel: "• \"cancelar\" - Salir completamente de este flujo",
    cmd_help_status: "• \"estado\" - Mostrar información del flujo actual",
    cmd_help_help: "• \"ayuda\" - Mostrar este mensaje de ayuda",
    cmd_help_financial_warning: "⚠️ Este es un flujo de transacción financiera. Por favor complete o cancele para mantener la seguridad.",
    cmd_help_current_question: "**Pregunta Actual:**",
    cmd_help_respond_instruction: "Por favor responda a la pregunta anterior, o use un comando de la lista anterior.",
    cmd_help_continue_instruction: "Continúe con su respuesta para proceder, o use un comando anterior.",
    
    cmd_status_title: "📊 **Estado del Flujo**",
    cmd_status_current_flow: "Flujo Actual: {{flowName}}",
    cmd_status_steps_remaining: "Pasos Restantes: {{stepsRemaining}}",
    cmd_status_stack_depth: "Profundidad de Pila: {{stackDepth}}",
    cmd_status_transaction_id: "ID de Transacción: {{transactionId}}",
    cmd_status_collected_info: "Información Recopilada:",
    cmd_status_hidden_value: "[OCULTO]",
    cmd_status_continue_instruction: "Continúe con su respuesta para proceder.",
    
    cmd_interruption_switch: "cambiar",
    cmd_interruption_continue: "continuar",
  }
};

// === INTERNATIONALIZED COMMAND SYNONYMS ===
// Multi-language command support for system commands
const COMMAND_SYNONYMS: Record<string, Record<string, string[]>> = {
  en: {
    cancel: ['cancel', 'abort', 'stop', 'exit', 'quit', 'end'],
    help: ['help', '?', 'options', 'commands'],
    status: ['status', 'where am i', 'what flow', 'current flow', 'info'],
    switch: ['switch', 'change', 'go to'],
    continue: ['continue', 'proceed', 'keep going', 'go on']
  },
  es: {
    cancel: ['cancelar', 'abortar', 'parar', 'salir', 'terminar', 'fin'],
    help: ['ayuda', '?', 'opciones', 'comandos'],
    status: ['estado', 'donde estoy', 'que flujo', 'flujo actual', 'info'],
    switch: ['cambiar', 'ir a', 'cambio'],
    continue: ['continuar', 'proceder', 'seguir', 'continúa']
  }
};

// === INTERNATIONALIZED COMMAND HELPERS ===

/**
 * Get command synonyms for the current language
 */
function getCommandSynonyms(engine: Engine, command: string): string[] {
  const language = engine.language || 'en';
  const synonyms = COMMAND_SYNONYMS[language];
  
  if (!synonyms || !synonyms[command]) {
    // Fallback to English if language not supported or command not found
    return COMMAND_SYNONYMS.en[command] || [];
  }
  
  return synonyms[command];
}

/**
 * Check if input matches any synonym for a command in current language
 */
function isCommand(engine: Engine, input: string, command: string): boolean {
  if (!input || typeof input !== 'string') {
    return false;
  }
  
  const normalizedInput = input.toLowerCase().trim();
  const synonyms = getCommandSynonyms(engine, command);
  
  return synonyms.some(synonym => {
    // Exact match
    if (normalizedInput === synonym) {
      return true;
    }
    
    // Allow for "cancel flow", "exit workflow", etc.
    if (normalizedInput.includes(synonym + ' flow') || 
        normalizedInput.includes(synonym + ' workflow')) {
      return true;
    }
    
    return false;
  });
}

/**
 * Detect any system command in the input
 */
function detectSystemCommand(engine: Engine, input: string): string | null {
  const commands = ['cancel', 'help', 'status', 'switch', 'continue'];
  
  for (const command of commands) {
    if (isCommand(engine, input, command)) {
      return command;
    }
  }
  
  return null;
}

// === EXAMPLE GUIDANCE CONFIGURATION TEMPLATES ===
// Users can configure guidance integration using these patterns:

export const GUIDANCE_CONFIG_EXAMPLES = {
  // Standard append mode (default)
  append: {
    enabled: true,
    mode: 'append' as const,
    separator: '\n\n',
    contextSelector: 'auto' as const
  },
  
  // Integrated template - elegant combination
  elegant: {
    enabled: true,
    mode: 'template' as const,
    template: "{{message}}\n\n_{{guidance}}_",
    contextSelector: 'auto' as const
  },
  
  // Custom template with user's suggested format
  integrated: {
    enabled: true,
    mode: 'template' as const,
    template: "{{guidance}} - {{message}}",
    separator: ' ',
    contextSelector: 'auto' as const,
    guidanceMessages: {
      general: "You can type cancel or help - To complete {{flowPrompt}}",
      payment: "You can type cancel or help - Payment in progress"
    }
  },
  
  // Compact inline style
  compact: {
    enabled: true,
    mode: 'template' as const,
    template: "{{message}} (Type 'cancel' or 'help' for {{flowPrompt}})",
    contextSelector: 'auto' as const
  },
  
  // Disabled guidance
  disabled: {
    enabled: false,
    mode: 'none' as const
  },
  
  // Multi-language guidance messages
  multilingual: {
    enabled: true,
    mode: 'template' as const,
    template: "{{guidance}} - {{message}}",
    contextSelector: 'auto' as const,
    guidanceMessages: {
      en: {
        general: "You can type cancel or help - To complete {{flowPrompt}}",
        payment: "You can type cancel or help - Payment in progress"
      },
      es: {
        general: "Puede escribir cancelar o ayuda - Para completar {{flowPrompt}}",
        payment: "Puede escribir cancelar o ayuda - Pago en progreso"
      }
    }
  }
};


// === UNIFIED MESSAGING SYSTEM ===
export function getSystemMessage(engine: Engine, messageId: string, context?: Record<string, unknown>): string {
  const registry = engine.messageRegistry || DEFAULT_MESSAGE_REGISTRY;
  const language = engine.language || 'en';
  
  const templates = registry[language] || registry['en'] || {};
  let message = templates[messageId];
  
  if (!message) {
    // Fallback to English if translation not found
    message = DEFAULT_MESSAGE_REGISTRY['en'][messageId] || `Unknown message: ${messageId}`;
  }
  
  // Simple template replacement for common placeholders
  if (context && typeof message === 'string') {
    message = message.replace(/\{\{([^}]+)\}\}/g, (match, key) => {      
      return String(context[key] || match);
    });
  }
  
  return message;
}

// Helper function to get flow prompt in current language
export function getFlowPrompt(engine: Engine, flowName: string): string {
  const language = engine.language || 'en';
  const flowsMenu = engine.flowsMenu || [];
  const flow = flowsMenu.find(f => f.name === flowName);
  
  if (!flow) {
    return flowName; // Fallback to flow name if not found
  }
  
  // Try to get prompt in current language
  const promptKey = `prompt_${language}` as keyof FlowDefinition;
  if (flow[promptKey]) {
    return flow[promptKey] as string;
  }
  
  // Fallback to default prompt or flow name
  return flow.prompt || flow.name;
}

// === TYPE DEFINITIONS ===
export type StepType = 'SAY' | 'SAY-GET' | 'SET' | 'CALL-TOOL' | 'FLOW' | 'SWITCH' | 'CASE';

// Enhanced context tracking with role information
export interface ContextEntry {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | Record<string, unknown> | unknown; // Improved from any - supports strings, objects, and other content
  timestamp: number;
  stepId?: string;
  toolName?: string;
  metadata?: Record<string, unknown>;
}

// AI Intelligence Callback Interface - REQUIRED for engine operation
// The engine cannot function without this - it's used for critical AI-powered decisions:
// - Intent detection (determining which workflow to activate)
// - Smart argument matching when schemas aren't provided  
// - Flow decision-making that requires natural language understanding
// Must return specific formatted responses (e.g., 'None' for no intent detected)
export interface AiCallbackFunction {
  (systemInstruction: string, userMessage: string): Promise<string>;
}

// Engine Session Context - Encapsulates all session-specific state
// This object should be maintained by the host application for each user session
export interface EngineSessionContext {
  hostLogger: Logger; // Logger instance for session-specific logging
  sessionId: string;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
  flowStacks: FlowFrame[][];
  globalAccumulatedMessages: string[];
  lastChatTurn: { user?: ContextEntry; assistant?: ContextEntry };
  globalVariables: Record<string, unknown>;
}

export interface FlowStep {
  id?: string;
  type: StepType;
  tool?: string;
  args?: Record<string, unknown>;
  variable?: string;
  value?: string;
  [key: string]: unknown; // Allow for value-xx properties and future extensions
  name?: string;
  nextFlow?: string;
  callType?: 'call' | 'replace' | 'reboot';
  branches?: Record<string, FlowStep>;  // SWITCH branches contain single steps, not arrays
  onFail?: FlowStep;
  retryCount?: number;
  
  // Enhanced retry configuration
  maxRetries?: number; // Maximum number of automatic retries
  retryDelay?: number; // Delay between retries in milliseconds
  retryStrategy?: 'immediate' | 'exponential' | 'linear' | 'manual'; // Retry strategy
  retryOnConditions?: Array<{
    errorPattern: string; // Regex pattern to match error messages
    action: 'retry' | 'skip' | 'ask_user' | 'fallback'; // What to do when this error occurs
    fallbackStep?: FlowStep; // Alternative step to execute
  }>;
  
  // Step-level input validation (before tool execution)
  inputValidation?: {
    patterns?: Array<{
      field: string; // Variable name to validate
      pattern: string; // Regex pattern
      message: string; // Error message if validation fails
    }>;
    customValidator?: string; // Name of approved function for complex validation
  };
  
  // Progressive retry with user feedback
  retryBehavior?: {
    preserveData?: boolean; // Keep existing variables during retry
    askUserBeforeRetry?: boolean; // Confirm with user before retrying
    escalateAfterMaxRetries?: FlowStep; // What to do after max retries reached
    showProgressiveHelp?: boolean; // Show more detailed help on subsequent failures
  };
}

export interface TransactionStep {
  stepId: string;
  stepType: StepType;
  tool?: string;
  result?: unknown;
  error?: string;
  duration: number;
  status: 'success' | 'error';
  timestamp: Date;
  retryCount?: number;
}

export interface TransactionObj {
  id: string;
  flowName: string;
  initiator: string;
  userId: string;
  steps: TransactionStep[];
  state: 'active' | 'completed' | 'failed' | 'rolled_back';
  createdAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  rolledBackAt?: Date;
  failureReason?: string;
  metadata: Record<string, unknown>;
  addStep: (step: FlowStep, result: unknown, duration: number, status?: 'success' | 'error') => void;
  addError: (step: FlowStep, error: Error, duration: number) => void;
  sanitizeForLog: (data: unknown) => unknown;
  rollback: () => void;
  complete: () => void;
  fail: (reason: string) => void;
}

export interface FlowFrame {
  flowName: string;
  flowId: string;
  flowVersion: string;
  flowStepsStack: FlowStep[];
  contextStack: ContextEntry[];  // Enhanced with role information
  inputStack: unknown[];
  variables: Record<string, unknown>;
  transaction: TransactionObj;
  userId: string;
  startTime: number;
  pendingVariable?: string;
  lastSayMessage?: string;
  pendingInterruption?: Record<string, unknown>;
  accumulatedMessages?: string[];
  parentTransaction?: string;
  justResumed?: boolean; // Flag to indicate this flow frame was just resumed
}

export interface Engine {
  flowStacks: FlowFrame[][];
  flowsMenu?: FlowDefinition[];
  toolsRegistry?: ToolDefinition[];
  language?: string; // Optional language support
  messageRegistry?: MessageRegistry; // Centralized registry for system messages
  guidanceConfig?: GuidanceConfig; // User-controlled guidance integration settings
  globalVariables?: Record<string, unknown>; // Global variables shared across all flows
  hasAccumulatedMessages?: () => boolean;
  getAndClearAccumulatedMessages?: (engineSessionContext?: EngineSessionContext) => string[];
  addAccumulatedMessage?: (message: string, engineSessionContext?: EngineSessionContext) => void;
  sessionId?: string;
  APPROVED_FUNCTIONS?: ApprovedFunctions;
  aiCallback: AiCallbackFunction; // REQUIRED - Engine cannot function without AI access for intent detection & smart decisions
  lastChatTurn: { user?: ContextEntry; assistant?: ContextEntry }; // Last chat turn when not in a flow
  // Session management methods
  initSession?: (logger: Logger, userId: string, sessionId?: string) => EngineSessionContext;
  updateActivity?: (contextEntry: ContextEntry, engineSessionContext?: EngineSessionContext) => Promise<string | null>;
}

export interface FlowDefinition {
  id: string;
  name: string; // Internal identifier
  prompt?: string; // Default prompt for the flow
  prompt_en?: string; // English prompt (default)
  prompt_es?: string; // Spanish prompt
  prompt_pt?: string; // Portuguese prompt
  prompt_fr?: string; // French prompt
  prompt_de?: string; // German prompt
  [key: `prompt_${string}`]: string | undefined; // Support for any language code
  description: string;
  version: string;
  steps: FlowStep[];
  variables?: Record<string, {
    type: string;
    scope: string;
    value?: unknown; // Initial value for the variable
  }>;
  metadata?: {
    riskLevel?: string;
    category?: string;
    [key: string]: unknown;
  };
}

export type ArgsType = Record<string, unknown>;

// === ENHANCED TYPE DEFINITIONS FOR STRICT TYPING ===

export interface ToolDefinition {
  id: string; // Unique tool identifier
  name: string;
  description: string;
  schema?: {
    required?: string[];
    properties?: Record<string, PropertySchema>;
  };
  parameters?: {
    type: string;
    properties?: Record<string, PropertySchema>;
    required?: string[];
    additionalProperties?: boolean;
  };
  implementation?: {
    type: 'local' | 'http';
    function?: string;
    url?: string;
    method?: HttpMethod;
    contentType?: string;
    pathParams?: string[];
    queryParams?: string[];
    headers?: Record<string, string>;
    responseMapping?: MappingConfig;
    timeout?: number;
    retries?: number;
    authentication?: AuthConfig;
  };
  security?: {
    rateLimit?: {
      requests: number;
      window: number;
    };
  };
  apiKey?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  category?: string;
}

export interface PropertySchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: PropertySchema;
  properties?: Record<string, PropertySchema>;
  required?: string[];
  default?: unknown;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface AuthConfig {
  type: 'bearer' | 'basic' | 'apikey' | 'hmac';
  token?: string;
  username?: string;
  password?: string;
  key?: string;
  secret?: string;
  header?: string;
}

export interface ApprovedFunctions {
  get(functionName: string): ((...args: unknown[]) => unknown) | undefined;
  [functionName: string]: unknown;
}

export interface SystemContext {
  [key: string]: string | number | boolean | null | undefined;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Initialize JSON Schema validator
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// === DECLARATIVE RESPONSE MAPPING SYSTEM ===
// Generic, secure response transformation using declarative mapping rules
// Users define transformations through JSON configuration, not code injection
// This maintains complete engine genericity while supporting complex API response handling

// === RESPONSE MAPPING TYPE DEFINITIONS ===
export type JsonPathMappingConfig = {
  type: 'jsonPath';
  mappings: Record<string, {
    path: string;
    transform?: ValueTransformConfig;
    fallback?: unknown;
  }>;
  strict?: boolean;
};

export type ObjectMappingConfig = {
  type: 'object';
  mappings: Record<string, string | PathConfig | MappingConfig | object>;
  strict?: boolean;
};

export type ArrayMappingConfig = {
  type: 'array';
  source?: string;
  filter?: ConditionConfig;
  itemMapping?: MappingConfig;
  sort?: { field: string; order?: 'asc' | 'desc' };
  offset?: number;
  limit?: number;
  fallback?: unknown[];
};

export type TemplateMappingConfig = {
  type: 'template';
  template: string;
};

export type ConditionalMappingConfig = {
  type: 'conditional';
  conditions: Array<{
    if: ConditionConfig;
    then: MappingConfig;
  }>;
  else?: MappingConfig;
};

export type PathConfig = {
  path: string;
  transform?: ValueTransformConfig;
  fallback?: unknown;
};

export interface ValueTransformConfig {
  type: 'parseInt' | 'parseFloat' | 'toLowerCase' | 'toUpperCase' | 'trim' | 'replace' | 'concat' | 'regex' | 'date' | 'default' | 'conditional' | 'substring' | 'split' | 'join' | 'abs' | 'round' | 'floor' | 'ceil' | 'template' | 'custom';
  fallback?: unknown;
  prefix?: string;
  suffix?: string;
  pattern?: string;
  replacement?: string;
  group?: number;
  start?: number;
  end?: number;
  delimiter?: string;
  index?: number;
  template?: string;
  calculation?: string;
  condition?: ConditionConfig;
  conditions?: Array<{
    if: ConditionConfig;
    then: unknown;
  }>; // For complex conditional transforms
  trueValue?: unknown;
  falseValue?: unknown;
  value?: unknown; // For default transforms
  flags?: string; // For regex flags
  else?: unknown; // For conditional else case
}

export interface ConditionConfig {
  field: string;
  operator: 'equals' | 'eq' | 'notEquals' | 'ne' | 'contains' | 'exists' | 'notExists' | 'greaterThan' | 'gt' | 'lessThan' | 'lt' | 'greaterThanOrEqual' | 'gte' | 'lessThanOrEqual' | 'lte' | 'startsWith' | 'endsWith' | 'matches' | 'in' | 'hasLength' | 'isArray' | 'isObject' | 'isString' | 'isNumber';
  value?: unknown;
}

export type MappingConfig =
  | JsonPathMappingConfig
  | ObjectMappingConfig
  | ArrayMappingConfig
  | TemplateMappingConfig
  | ConditionalMappingConfig
  | PathConfig
  | string
  | Record<string, unknown>;

/**
 * Type guard to check if a value is a traversable object (not null, not array, has string keys)
 */
function isPathTraversableObject(val: unknown): val is PathTraversableObject {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Generic response mapper that applies declarative transformation rules
 * Supports multiple mapping types: jsonPath, object, array, template, conditional
 * 
 * @param data - Source data to transform (typically API response)
 * @param mappingConfig - Mapping configuration specifying how to transform the data
 * @param args - Arguments available for template variables and $args references
 * @returns Transformed data according to mapping configuration
 * 
 * @example
 * ```typescript
 * // JSONPath mapping
 * applyResponseMapping(
 *   { user: { name: "John" } }, 
 *   { type: "jsonPath", mappings: { "username": { path: "user.name" } } }
 * ) // { username: "John" }
 * 
 * // Template mapping
 * applyResponseMapping(
 *   { name: "Alice", age: 25 },
 *   { type: "template", template: "Name: {{name}}, Age: {{age}}" }
 * ) // "Name: Alice, Age: 25"
 * ```
 */
function applyResponseMapping(
  data: PathTraversableObject, 
  mappingConfig: MappingConfig, 
  args: PathArguments = {}
): ExtractedValue {
  logger.debug(`applyResponseMapping called with: dataType=${typeof data}, data=${JSON.stringify(data)}, mappingConfig=${JSON.stringify(mappingConfig)}, args=${JSON.stringify(args)}`);
  
  if (!mappingConfig) {
    logger.debug(`No mapping config provided, returning original data`);
    return data;
  }
  
  // Handle string mappings
  if (typeof mappingConfig === 'string') {
    logger.debug(`String mapping: extracting path ${mappingConfig}`);
    const result = extractByPath(data, mappingConfig);
    logger.debug(`String mapping result: ${JSON.stringify(result)}`);
    return result;
  }
  
  // Handle object mappings with type property
  if (typeof mappingConfig === 'object' && mappingConfig !== null && 'type' in mappingConfig) {
    logger.debug(`Object mapping with type: ${mappingConfig.type}`);
    switch (mappingConfig.type) {
      case 'jsonPath':
        return applyJsonPathMapping(data, mappingConfig as JsonPathMappingConfig, args);
      case 'object':
        return applyObjectMapping(data, mappingConfig as ObjectMappingConfig, args);
      case 'array':
        return applyArrayMapping(data, mappingConfig as ArrayMappingConfig, args);
      case 'template':
        return applyTemplateMapping(data, mappingConfig as TemplateMappingConfig, args);
      case 'conditional':
        return applyConditionalMapping(data, mappingConfig as ConditionalMappingConfig, args);
    }
  }
  
  // Handle PathConfig (has path property but not type)
  if (typeof mappingConfig === 'object' && mappingConfig !== null && 'path' in mappingConfig) {
    logger.debug(`PathConfig mapping with path: ${(mappingConfig as PathConfig).path}`);
    const result = extractByPath(data, (mappingConfig as PathConfig).path);
    logger.debug(`PathConfig mapping result: ${JSON.stringify(result)}`);
    return result;
  }
  
  logger.debug(`No matching mapping type, returning original data`);
  return data;
}

// JSONPath-style field extraction and mapping
/**
 * Apply JSONPath-based field extraction and mapping to transform response data
 * 
 * @param data - Source data object to extract values from
 * @param config - JSONPath mapping configuration with field mappings and transforms
 * @param args - Arguments available for $args.property references and template variables
 * @returns Object with mapped fields according to configuration
 * 
 * @example
 * ```typescript
 * const data = { users: [{ name: "John", age: 30 }] };
 * const config = {
 *   type: "jsonPath",
 *   mappings: {
 *     "user_name": { path: "users[0].name", transform: { type: "toUpperCase" } },
 *     "user_age": { path: "users[0].age", transform: { type: "parseInt" } }
 *   }
 * };
 * applyJsonPathMapping(data, config, {}) // { user_name: "JOHN", user_age: 30 }
 * ```
 */
function applyJsonPathMapping(
  data: PathTraversableObject, 
  config: JsonPathMappingConfig, 
  args: PathArguments
): Record<string, ExtractedValue> {
  const result: Record<string, unknown> = {};
  
  logger.debug(`applyJsonPathMapping starting with data: ${JSON.stringify(data)}`);
  logger.debug(`applyJsonPathMapping args: ${JSON.stringify(args)}`);
  logger.debug(`applyJsonPathMapping config: ${JSON.stringify(config)}`);
  
  for (const [outputField, pathConfig] of Object.entries(config.mappings)) {
    try {
      logger.debug(`Processing field ${outputField} with pathConfig: ${JSON.stringify(pathConfig)}`);
      
      // Interpolate placeholders in path before extraction
      let path = pathConfig.path;
      let value;
      
      if (path && typeof path === 'string') {
        logger.debug(`Processing path: ${path}`);
        
        // Handle $args.property syntax for accessing argument values
        if (path.startsWith('$args.')) {
          const argPath = path.slice(6); // Remove '$args.' prefix
          value = extractByPath(args, argPath);
          logger.debug(`$args path ${path} -> argPath: ${argPath} -> value: ${JSON.stringify(value)}`);
        } else {
          // Replace {placeholder} with actual argument values
          const originalPath = path;
          path = path.replace(/\{([^}]+)\}/g, (match, placeholder) => {
            const replacement = String(args[placeholder] || match);
            logger.debug(`Replacing placeholder {${placeholder}} with: ${replacement}`);
            return replacement;
          });
          
          if (originalPath !== path) {
            logger.debug(`Path after placeholder replacement: ${originalPath} -> ${path}`);
          }
          
          value = extractByPath(data, path);
          logger.debug(`Extracted value from data path ${path}: ${JSON.stringify(value)}`);
        }
      } else {
        value = extractByPath(data, path);
        logger.debug(`Extracted value from simple path ${path}: ${JSON.stringify(value)}`);
      }
      
      // Apply transformations
      if (pathConfig.transform) {
        const originalValue = value;
        value = applyValueTransform(value, pathConfig.transform, args);
        logger.debug(`Applied transform ${pathConfig.transform.type}: ${JSON.stringify(originalValue)} -> ${JSON.stringify(value)}`);
      }
      
      // Apply fallback if value is null/undefined
      if ((value === null || value === undefined) && pathConfig.fallback !== undefined) {
        const originalValue = value;
        value = typeof pathConfig.fallback === 'string' && pathConfig.fallback.startsWith('$args.') 
          ? extractByPath(args, pathConfig.fallback.slice(6))
          : pathConfig.fallback;
        logger.debug(`Applied fallback: ${JSON.stringify(originalValue)} -> ${JSON.stringify(value)}`);
      }
      
      logger.debug(`Final value for field ${outputField}: ${JSON.stringify(value)}`);
      setByPath(result, outputField, value);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Failed to map field ${outputField}: ${errorMessage}`);
      logger.debug(`Error details for field ${outputField}: ${JSON.stringify(error)}`);
      if (config.strict === false) {
        // Continue with other mappings in non-strict mode
        continue;
      } else {
        throw error;
      }
    }
  }
  
  logger.debug(`applyJsonPathMapping result: ${JSON.stringify(result)}`);
  return result;
}

// Object structure mapping with nested transformations
function applyObjectMapping(data: unknown, config: ObjectMappingConfig, args: ArgsType): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(config.mappings)) {
    try {
      if (typeof value === 'string') {
        // Simple field mapping
  result[key] = extractByPath(data as PathTraversableObject, value);
      } else if (typeof value === 'object' && value !== null && 'type' in value) {
        // Nested mapping with type
  result[key] = applyResponseMapping(data as PathTraversableObject, value as MappingConfig, args);
      } else if (typeof value === 'object' && value !== null && 'path' in value) {
        // Object with path and optional transform
        const pathConfig = value as PathConfig;
  let fieldValue = extractByPath(data as PathTraversableObject, pathConfig.path);
        
        if (pathConfig.transform) {
          fieldValue = applyValueTransform(fieldValue, pathConfig.transform, args);
        }
        
        if ((fieldValue === null || fieldValue === undefined) && pathConfig.fallback !== undefined) {
          fieldValue = typeof pathConfig.fallback === 'string' && pathConfig.fallback.startsWith('$args.') 
            ? extractByPath(args, pathConfig.fallback.slice(6))
            : pathConfig.fallback;
        }
        
        result[key] = fieldValue;
      } else if (typeof value === 'object' && value !== null) {
        // Static object with potential interpolation
        result[key] = interpolateObject(value, data, args);
      } else {
        // Literal value
        result[key] = value;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Failed to map object field ${key}:`, errorMessage);
      if (config.strict !== false) {
        continue;
      } else {
        throw error;
      }
    }
  }
  
  return result;
}

// Array transformation and filtering
function applyArrayMapping(data: unknown, config: ArrayMappingConfig, args: ArgsType): unknown[] {
  const sourceArray = config.source ? extractByPath(data as PathTraversableObject, config.source) : data;
  if (!Array.isArray(sourceArray)) {
    logger.warn(`Array mapping source is not an array:`, sourceArray);
    return config.fallback || [];
  }
  
  let result = [...sourceArray]; // Create a copy
  
  // Apply filters
  if (config.filter) {
    result = result.filter(item => {
      try {
        return evaluateCondition(item, config.filter!);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.warn('Filter evaluation failed:', errorMessage);
        return false;
      }
    });
  }
  
  // Apply transformations to each item
  if (config.itemMapping) {
    result = result.map((item, index) => {
      try {
        return applyResponseMapping(item, config.itemMapping!, { ...args, index });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.warn(`Item mapping failed for index ${index}:`, errorMessage);
        return item; // Return original item on error
      }
    });
  }
  
  // Apply sorting
  if (config.sort) {
    const { field, order = 'asc' } = config.sort;
    result.sort((a, b) => {
      try {
        const aVal = extractByPath(a, field);
        const bVal = extractByPath(b, field);
        
        // Convert to comparable values
        const aComp = aVal != null ? String(aVal) : '';
        const bComp = bVal != null ? String(bVal) : '';
        
        if (aComp < bComp) return order === 'asc' ? -1 : 1;
        if (aComp > bComp) return order === 'asc' ? 1 : -1;
        return 0;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.warn('Sort comparison failed:', errorMessage);
        return 0;
      }
    });
  }
  
  // Apply offset
  if (config.offset && typeof config.offset === 'number' && config.offset > 0) {
    result = result.slice(config.offset);
  }
  
  // Apply limit
  if (config.limit && typeof config.limit === 'number' && config.limit > 0) {
    result = result.slice(0, config.limit);
  }
  
  return result;
}

// Template-based string interpolation
function applyTemplateMapping(data: unknown, config: TemplateMappingConfig, args: ArgsType): string {
  let template = config.template;
  
  // Replace placeholders with actual values
  template = template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
  const value = extractByPath(data as PathTraversableObject, path.trim());
    return value !== null && value !== undefined ? String(value) : '';
  });
  
  // Replace argument placeholders
  template = template.replace(/\{\$args\.([^}]+)\}/g, (match, path) => {
    const value = extractByPath(args, path.trim());
    return value !== null && value !== undefined ? String(value) : '';
  });
  
  return template;
}

// Conditional mapping based on data content
function applyConditionalMapping(data: unknown, config: ConditionalMappingConfig, args: ArgsType): unknown {
  if (!config.conditions || !Array.isArray(config.conditions)) {
    throw new Error('Conditional mapping requires a conditions array');
  }
  
  for (const condition of config.conditions) {
    try {
      // Handle $args references in conditions
      let conditionResult = false;
      if (condition.if.field && condition.if.field.startsWith('$args.')) {
        const argPath = condition.if.field.slice(6);
        conditionResult = evaluateCondition(args, { 
          ...condition.if, 
          field: argPath 
        });
      } else {
        conditionResult = evaluateCondition(data, condition.if);
      }
      
      if (conditionResult) {
  return applyResponseMapping(data as PathTraversableObject, condition.then, args);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn('Condition evaluation failed:', errorMessage);
      continue; // Try next condition
    }
  }
  
  // Default case
  if (config.else) {
  return applyResponseMapping(data as PathTraversableObject, config.else, args);
  }
  
  return data;
}

// Helper functions for path extraction and manipulation
// === PATH EXTRACTION TYPE DEFINITIONS ===

/**
 * Represents any object that can be traversed by path
 * Object with string keys for safe path traversal
 */
export interface PathTraversableObject {
  [key: string]: unknown;
}

/**
 * Result type for path extraction - can be any value or null if path not found
 */
type ExtractedValue = unknown;

/**
 * JSONPath expression starting with $. or simple dot notation path
 */
type PathExpression = string;

/**
 * Arguments object for template variable replacement in paths
 * Using unknown to maintain compatibility with ArgsType
 */
type PathArguments = Record<string, unknown>;

// === ENHANCED PATH EXTRACTION FUNCTIONS ===

/**
 * Extract value from object using dot notation or JSONPath syntax
 * 
 * @param obj - Object to extract value from (can be nested object, array, or primitive)
 * @param path - Dot notation path (e.g., "user.name") or JSONPath (e.g., "$.users[0].name")
 * @returns Extracted value or null if path not found
 * 
 * @example
 * ```typescript
 * extractByPath({ user: { name: "John" } }, "user.name") // "John"
 * extractByPath({ users: [{ name: "Jane" }] }, "users[0].name") // "Jane"
 * extractByPath({ data: { items: [] } }, "$.data.items[0]") // null (JSONPath syntax)
 * ```
 */
function extractByPath(obj: PathTraversableObject, path: PathExpression): ExtractedValue {
  logger.debug(`extractByPath called with path: ${path}, obj type: ${typeof obj}`);
  
  if (!path || path === '.') {
    logger.debug(`extractByPath: empty path or dot, returning original object`);
    return obj;
  }
  if (obj === null || obj === undefined) {
    logger.debug(`extractByPath: null/undefined object, returning null`);
    return null;
  }
  
  // Handle JSONPath syntax (starts with $)
  if (path.startsWith('$.')) {
    logger.debug(`extractByPath: JSONPath syntax detected, delegating to extractByJsonPath`);
    return extractByJsonPath(obj, path);
  }
  
  const parts = path.split('.');
  let current: unknown = obj;
  logger.debug(`extractByPath: processing path parts: ${JSON.stringify(parts)}`);
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (current === null || current === undefined) {
      logger.debug(`extractByPath: current is null/undefined at part ${i} (${part}), returning null`);
      return null;
    }
    
    logger.debug(`extractByPath: processing part ${i}: ${part}, current type: ${typeof current}`);
    
    // Handle array indices
    if (part.includes('[') && part.includes(']')) {
      const [key, indexPart] = part.split('[');
      const index = parseInt(indexPart.replace(']', ''));
      
      logger.debug(`extractByPath: array access detected - key: ${key}, index: ${index}`);
      
      if (key) {
        if (isPathTraversableObject(current)) {
          const next = current[key];
          logger.debug(`extractByPath: accessed key ${key}, result: ${JSON.stringify(next)}`);
          current = next;
        } else {
          logger.debug(`extractByPath: current is not traversable at key ${key}, returning null`);
          return null;
        }
      }
      
      if (Array.isArray(current) && index >= 0 && index < current.length) {
        current = current[index];
        logger.debug(`extractByPath: accessed array index ${index}, result: ${JSON.stringify(current)}`);
      } else {
        logger.debug(`extractByPath: invalid array access or out of bounds for index ${index}, returning null`);
        return null;
      }
    } else {
      if (isPathTraversableObject(current)) {
        const next = current[part];
        logger.debug(`extractByPath: accessed property ${part}, result: ${JSON.stringify(next)}`);
        current = next;
      } else {
        logger.debug(`extractByPath: current is not traversable at part ${part}, returning null`);
        return null;
      }
      logger.debug(`extractByPath: accessed property ${part}, result: ${JSON.stringify(current)}`);
    }
  }
  
  logger.debug(`extractByPath final result: ${JSON.stringify(current)}`);
  return current;
}

/**
 * JSONPath expression parser for paths like $.nearest_area[0].areaName[0].value
 * 
 * @param obj - Object to traverse using JSONPath syntax
 * @param jsonPath - JSONPath expression starting with $. (e.g., "$.users[0].profile.name")
 * @returns Extracted value or null if path not found or invalid JSONPath
 * 
 * @example
 * ```typescript
 * const data = { users: [{ profile: { name: "Alice" } }] };
 * extractByJsonPath(data, "$.users[0].profile.name") // "Alice"
 * extractByJsonPath(data, "$.users[0].profile.age") // null
 * extractByJsonPath(data, "invalid_path") // null (not JSONPath)
 * ```
 */
function extractByJsonPath(obj: PathTraversableObject, jsonPath: PathExpression): ExtractedValue {
  if (!jsonPath.startsWith('$.')) {
    return null;
  }
  
  // Remove the $ prefix and split by dots
  const path = jsonPath.slice(2);
  const parts = path.split('.');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return null;
    }
    
    // Handle array access like name[0]
    if (part.includes('[') && part.includes(']')) {
      const [key, indexPart] = part.split('[');
      const index = parseInt(indexPart.replace(']', ''));
      
      // First access the key if it exists
      if (key && key !== '') {
  current = (current as PathTraversableObject)[key];
  if (typeof current !== 'object' || current === null) break;
        if (current === null || current === undefined) {
          return null;
        }
      }
      
      // Then access the array index
      if (Array.isArray(current) && index >= 0 && index < current.length) {
        current = current[index];
      } else {
        return null;
      }
    } else {
  // Simple property access
  current = (current as PathTraversableObject)[part];
  if (typeof current !== 'object' || current === null) break;
    }
  }
  
  return current;
}

/**
 * Set a value in an object using dot notation path, creating nested objects as needed
 * 
 * @param obj - Target object to set value in (will be mutated)
 * @param path - Dot notation path where to set the value (e.g., "user.profile.name")
 * @param value - Value to set at the specified path
 * 
 * @example
 * ```typescript
 * const obj = {};
 * setByPath(obj, "user.profile.name", "John");
 * // obj is now { user: { profile: { name: "John" } } }
 * 
 * setByPath(obj, "user.profile.age", 30);
 * // obj is now { user: { profile: { name: "John", age: 30 } } }
 * ```
 */
function setByPath(
  obj: Record<string, unknown>, 
  path: PathExpression, 
  value: ExtractedValue
): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  
  current[parts[parts.length - 1]] = value;
}

/**
 * Apply declarative transformations to extracted values
 * 
 * @param value - Value to transform (can be string, number, object, array, etc.)
 * @param transform - Transformation configuration specifying type and parameters
 * @param args - Arguments available for template replacements and calculations
 * @returns Transformed value or original value if transformation fails
 * 
 * @example
 * ```typescript
 * applyValueTransform("hello", { type: "toUpperCase" }) // "HELLO"
 * applyValueTransform("123", { type: "parseInt" }) // 123
 * applyValueTransform("test", { type: "concat", prefix: "pre_", suffix: "_post" }) // "pre_test_post"
 * ```
 */
function applyValueTransform(
  value: ExtractedValue, 
  transform: ValueTransformConfig, 
  args: PathArguments
): ExtractedValue {
  if (!transform || typeof transform !== 'object') {
    logger.debug(`applyValueTransform: no transform or invalid transform, returning original value: ${JSON.stringify(value)}`);
    return value;
  }
  
  logger.debug(`applyValueTransform: transforming value ${JSON.stringify(value)} with transform: ${JSON.stringify(transform)}`);
  
  try {
    switch (transform.type) {
      case 'parseInt':
        const intVal = parseInt(String(value));
        const intResult = !isNaN(intVal) ? intVal : (transform.fallback !== undefined ? transform.fallback : 0);
        logger.debug(`parseInt transform: ${JSON.stringify(value)} -> ${JSON.stringify(intResult)}`);
        return intResult;
      
      case 'parseFloat':
        const floatVal = parseFloat(String(value));
        const floatResult = !isNaN(floatVal) ? floatVal : (transform.fallback !== undefined ? transform.fallback : 0.0);
        logger.debug(`parseFloat transform: ${JSON.stringify(value)} -> ${JSON.stringify(floatResult)}`);
        return floatResult;
      
      case 'toLowerCase':
        const lowerResult = value != null ? String(value).toLowerCase() : '';
        logger.debug(`toLowerCase transform: ${JSON.stringify(value)} -> ${JSON.stringify(lowerResult)}`);
        return lowerResult;
      
      case 'toUpperCase':
        const upperResult = value != null ? String(value).toUpperCase() : '';
        logger.debug(`toUpperCase transform: ${JSON.stringify(value)} -> ${JSON.stringify(upperResult)}`);
        return upperResult;
      
      case 'trim':
        const trimResult = value != null ? String(value).trim() : '';
        logger.debug(`trim transform: ${JSON.stringify(value)} -> ${JSON.stringify(trimResult)}`);
        return trimResult;
      
      case 'replace':
        if (!transform.pattern) {
          logger.debug(`replace transform: no pattern provided, returning original value`);
          return value;
        }
        const replaceResult = String(value).replace(
          new RegExp(transform.pattern, transform.flags || 'g'), 
          transform.replacement || ''
        );
        logger.debug(`replace transform: ${JSON.stringify(value)} -> ${JSON.stringify(replaceResult)} (pattern: ${transform.pattern}, replacement: ${transform.replacement})`);
        return replaceResult;
      
      case 'concat':
        const concatResult = (transform.prefix || '') + String(value) + (transform.suffix || '');
        logger.debug(`concat transform: ${JSON.stringify(value)} -> ${JSON.stringify(concatResult)} (prefix: ${transform.prefix}, suffix: ${transform.suffix})`);
        return concatResult;
      
      case 'regex':
        if (!transform.pattern) {
          logger.debug(`regex transform: no pattern provided, returning original value`);
          return value;
        }
        const match = String(value).match(new RegExp(transform.pattern));
        const regexResult = match ? (transform.group ? match[transform.group] : match[0]) : (transform.fallback || '');
        logger.debug(`regex transform: ${JSON.stringify(value)} -> ${JSON.stringify(regexResult)} (pattern: ${transform.pattern}, group: ${transform.group})`);
        return regexResult;
      
      case 'date':
        if (value) {
          const date = new Date(String(value));
          return !isNaN(date.getTime()) ? date.toISOString() : new Date().toISOString();
        }
        return new Date().toISOString();
      
      case 'default':
        return value !== null && value !== undefined ? value : transform.value;
      
      case 'conditional':
        // Handle conditional transforms
        if (transform.conditions && Array.isArray(transform.conditions)) {
          for (const condition of transform.conditions) {
            // For value transforms, the field should be checked against the value itself
            let conditionData: Record<string, unknown>;
            if (condition.if.field === '.' || !condition.if.field) {
              conditionData = { ".": value };
            } else {
              // If the field references something else, we need the original data
              // For now, assume it's the current value
              conditionData = { [condition.if.field]: value };
            }
            
            if (evaluateCondition(conditionData, condition.if)) {
              return condition.then;
            }
          }
          return transform.else || value;
        }
        
        // Fallback to simple conditional for backward compatibility
        if (transform.condition && evaluateCondition({ value }, transform.condition)) {
          return transform.trueValue !== undefined ? transform.trueValue : value;
        } else {
          return transform.falseValue !== undefined ? transform.falseValue : value;
        }
      
      case 'substring':
        const str = String(value);
        const start = transform.start || 0;
        const end = transform.end || str.length;
        return str.substring(start, end);
      
      case 'split':
        if (!transform.delimiter) return value;
        const parts = String(value).split(transform.delimiter);
        return transform.index !== undefined ? parts[transform.index] : parts;
      
      case 'join':
        if (!Array.isArray(value)) return value;
        return value.join(transform.delimiter || ',');
      
      case 'abs':
        return Math.abs(Number(value));
      
      case 'round':
        return Math.round(Number(value));
      
      case 'floor':
        return Math.floor(Number(value));
      
      case 'ceil':
        return Math.ceil(Number(value));
      
      case 'template':
        // Handle template transforms
        if (typeof transform.template === 'string') {
          return transform.template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
            if (path.trim() === '.') {
              return String(value);
            }
            // Access the property path on the value object
            const propertyPath = path.trim();
            const propertyValue = value && typeof value === 'object' ? (value as Record<string, unknown>)[propertyPath] : undefined;
            return propertyValue !== undefined ? String(propertyValue) : match;
          });
        }
        return value;
      
      case 'custom':
        // Handle custom calculations (for demo purposes, implement some common ones)
        switch (transform.calculation) {
          case 'sum_likes':
            if (Array.isArray(value)) {
              return value.reduce((sum, item) => sum + (item.likes || 0), 0);
            }
            return 0;
          case 'avg_rating':
            if (Array.isArray(value)) {
              const ratings = value.map(item => item.rating).filter(r => r);
              return ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
            }
            return 0;
          case 'years_since':
            const year = Number(value);
            return year ? new Date().getFullYear() - year : 0;
          case 'to_millions':
            return Number(value) / 1000000;
          case 'budget_per_employee':
            if (typeof value === 'object' && value !== null && 
                'budget' in value && 'employees' in value) {
              const obj = value as Record<string, unknown>;
              const budget = Number(obj.budget);
              const employees = Number(obj.employees);
              return employees > 0 ? Math.round(budget / employees) : 0;
            }
            return 0;
          default:
            logger.warn(`Unknown custom calculation: ${transform.calculation}`);
            return value;
        }
      
      default:
        logger.warn(`Unknown transform type: ${transform.type}`);
        return value;
    }
  } catch (error: any) {
    logger.warn(`Transform ${transform.type} failed: ${error.message}`);
    return transform.fallback !== undefined ? transform.fallback : value;
  }
}

function evaluateCondition(data: unknown, condition: ConditionConfig): boolean {
  if (!condition || typeof condition !== 'object') return false;
  
  const { field, operator, value } = condition;
  
  try {
    let fieldValue: unknown = undefined;
    if (isPathTraversableObject(data)) {
      fieldValue = extractByPath(data, field);
    }
    
    switch (operator) {
      case 'equals':
      case 'eq':
        return fieldValue === value;
      
      case 'notEquals':
      case 'ne':
        return fieldValue !== value;
      
      case 'contains':
        return String(fieldValue).includes(String(value));
      
      case 'exists':
        return fieldValue !== null && fieldValue !== undefined;
      
      case 'notExists':
        return fieldValue === null || fieldValue === undefined;
      
      case 'greaterThan':
      case 'gt':
        return Number(fieldValue) > Number(value);
      
      case 'lessThan':
      case 'lt':
        return Number(fieldValue) < Number(value);
      
      case 'greaterThanOrEqual':
      case 'gte':
        return Number(fieldValue) >= Number(value);
      
      case 'lessThanOrEqual':
      case 'lte':
        return Number(fieldValue) <= Number(value);
      
      case 'startsWith':
        return String(fieldValue).startsWith(String(value));
      
      case 'endsWith':
        return String(fieldValue).endsWith(String(value));
      
      case 'matches':
        return new RegExp(String(value)).test(String(fieldValue));
      
      case 'in':
        return Array.isArray(value) && value.includes(fieldValue);
      
      case 'hasLength':
        const length = Array.isArray(fieldValue) ? fieldValue.length : String(fieldValue).length;
        return length === Number(value);
      
      case 'isArray':
        return Array.isArray(fieldValue);
      
      case 'isObject':
        return typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue);
      
      case 'isString':
        return typeof fieldValue === 'string';
      
      case 'isNumber':
        return typeof fieldValue === 'number' && !isNaN(fieldValue);
      
      default:
        logger.warn(`Unknown condition operator: ${operator}`);
        return false;
    }
  } catch (error: any) {
    logger.warn(`Condition evaluation failed:`, error.message);
    return false;
  }
}

function interpolateObject(obj: unknown, data: unknown, args: ArgsType = {}): unknown {
  if (typeof obj === 'string') {
    // Handle template strings
    return obj.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      try {
        let value: unknown = undefined;
        if (isPathTraversableObject(data)) {
          value = extractByPath(data, path.trim());
        }
        return value !== null && value !== undefined ? String(value) : '';
      } catch (error) {
        return match; // Keep original on error
      }
    }).replace(/\{\$args\.([^}]+)\}/g, (match, path) => {
      try {
        const value = extractByPath(args, path.trim());
        return value !== null && value !== undefined ? String(value) : '';
      } catch (error) {
        return match; // Keep original on error
      }
    });
  } else if (Array.isArray(obj)) {
    return obj.map(item => interpolateObject(item, data, args));
  } else if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateObject(value, data, args);
    }
    return result;
  }
  return obj;
}

// Define a fake logger that does nothing

let logger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

// Fallback for any remaining console calls
if (!(global as Record<string, unknown>).console) {
  (global as Record<string, unknown>).console = {
    log: (...args: unknown[]) => logger.info(args.join(' ')),
    warn: (...args: unknown[]) => logger.warn(args.join(' ')),
    error: (...args: unknown[]) => logger.error(args.join(' ')),
    info: (...args: unknown[]) => logger.info(args.join(' '))
  };
}

// === TRANSACTION MANAGEMENT CLASS ===
class FlowTransaction implements TransactionObj {
  id: string;
  flowName: string;
  initiator: string;
  userId: string;
  steps: TransactionStep[] = [];
  state: 'active' | 'completed' | 'failed' | 'rolled_back' = 'active';
  createdAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  rolledBackAt?: Date;
  failureReason?: string;
  metadata: Record<string, unknown> = {};

  constructor(flowName: string, initiator: string, userId: string = 'anonymous') {
    this.id = crypto.randomUUID();
    this.flowName = flowName;
    this.initiator = initiator;
    this.userId = userId;
    this.steps = [];
    this.state = 'active';
    this.createdAt = new Date();
    this.metadata = {};
  }
  
  addStep(step: FlowStep, result: unknown, duration: number, status: 'success' | 'error' = 'success') {
    this.steps.push({
      stepId: step.id || step.type,
      stepType: step.type,
      tool: step.tool,
      result: this.sanitizeForLog(result),
      duration,
      status,
      timestamp: new Date(),
      retryCount: step.retryCount || 0
    });
  }
  
  addError(step: FlowStep, error: Error, duration: number) {
    this.steps.push({
      stepId: step.id || step.type,
      stepType: step.type,
      tool: step.tool,
      error: error.message,
      duration,
      status: 'error',
      timestamp: new Date()
    });
  }
  
  sanitizeForLog(data: unknown): unknown {
    if (typeof data === 'object' && data !== null) {
      const sanitized = { ...(data as Record<string, unknown>) };
      // Remove sensitive fields
      delete sanitized.signature;
      delete sanitized.password;
      delete sanitized.token;
      return sanitized;
    }
    return data;
  }
  
  rollback() {
    // In a real implementation, this would execute compensating actions
    this.state = 'rolled_back';
    this.rolledBackAt = new Date();
    auditLogger.logTransactionRollback(this);
  }
  
  complete() {
    this.state = 'completed';
    this.completedAt = new Date();
    auditLogger.logTransactionComplete(this);
  }
  
  fail(reason: string) {
    this.state = 'failed';
    this.failedAt = new Date();
    this.failureReason = reason;
    auditLogger.logTransactionFailed(this);
  }
}

// === COMPREHENSIVE AUDIT LOGGING ===
const auditLogger = {
  logFlowStart(flowName: string, input: unknown, userId: string, transactionId: string) {
    const logEntry = {
      event: "flow_started",
      flowName,
      userId,
      transactionId,
      timestamp: new Date().toISOString(),
      input: this.sanitizeForLog(input)
    };
    logger.info(`[AUDIT] ${JSON.stringify(logEntry)}`);
  },
  
  logToolExecution(toolName: string, args: unknown, result: unknown, duration: number, userId: string, transactionId: string) {
    const logEntry = {
      event: "tool_executed",
      toolName,
      userId,
      transactionId,
      duration,
      timestamp: new Date().toISOString(),
      args: this.sanitizeForLog(args),
      result: this.sanitizeForLog(result),
      success: true
    };
    logger.info(`[AUDIT] ${JSON.stringify(logEntry)}`);
  },
  
  logToolError(toolName: string, args: unknown, error: Error, duration: number, userId: string, transactionId: string) {
    const logEntry = {
      event: "tool_error",
      toolName,
      userId,
      transactionId,
      duration,
      timestamp: new Date().toISOString(),
      args: this.sanitizeForLog(args),
      error: error.message,
      success: false
    };
    logger.info(`[AUDIT] ${JSON.stringify(logEntry)}`);
  },
  
  logTransactionComplete(transaction: FlowTransaction) {
    const logEntry = {
      event: "transaction_completed",
      transactionId: transaction.id,
      flowName: transaction.flowName,
      userId: transaction.userId,
      duration: transaction.completedAt ? transaction.completedAt.getTime() - transaction.createdAt.getTime() : 0,
      stepCount: transaction.steps.length,
      timestamp: new Date().toISOString()
    };
    logger.info(`[AUDIT] ${JSON.stringify(logEntry)}`);
  },
  
  logTransactionFailed(transaction: FlowTransaction) {
    const logEntry = {
      event: "transaction_failed",
      transactionId: transaction.id,
      flowName: transaction.flowName,
      userId: transaction.userId,
      reason: transaction.failureReason,
      stepCount: transaction.steps.length,
      timestamp: new Date().toISOString()
    };
    logger.info(`[AUDIT] ${JSON.stringify(logEntry)}`);
  },
  
  logTransactionRollback(transaction: FlowTransaction) {
    const logEntry = {
      event: "transaction_rollback",
      transactionId: transaction.id,
      flowName: transaction.flowName,
      userId: transaction.userId,
      timestamp: new Date().toISOString()
    };
    logger.info(`[AUDIT] ${JSON.stringify(logEntry)}`);
  },
  
  logFlowExit(flowName: string, userId: string, transactionId: string, reason: string) {
    const logEntry = {
      event: "flow_exit",
      flowName,
      userId,
      transactionId,
      reason,
      timestamp: new Date().toISOString()
    };
    logger.info(`[AUDIT] ${JSON.stringify(logEntry)}`);
  },
  
  sanitizeForLog(data: unknown): unknown {
    if (typeof data === 'object' && data !== null) {
      const sanitized = { ...(data as Record<string, unknown>) };
      // Remove sensitive fields for logging
      const sensitiveFields = ['password', 'token', 'signature', 'key', 'secret'];
      sensitiveFields.forEach(field => {
        if (field in sanitized) {
          sanitized[field] = '[REDACTED]';
        }
      });
      return sanitized;
    }
    return data;
  }
};

// === RATE LIMITING ===
const rateLimiter = new Map<string, number[]>();

function checkRateLimit(engine: Engine, userId: string, toolId: string) {
   try {
      const toolsRegistry = engine.toolsRegistry;
      const tool = toolsRegistry?.find((t: ToolDefinition) => t.id === toolId);
      
      if (!tool?.security?.rateLimit) return; // No rate limit configured
      
      const { requests, window } = tool.security.rateLimit;
      const key = `${userId}:${toolId}`;
      const now = Date.now();
      
      if (!rateLimiter.has(key)) {
         rateLimiter.set(key, []);
      }
      
      const attempts = rateLimiter.get(key)!.filter(time => now - time < window);
      
      if (attempts.length >= requests) {
         throw new Error(`Rate limit exceeded for ${tool.name}. Max ${requests} requests per ${window/1000} seconds.`);
      }
      
      attempts.push(now);
      rateLimiter.set(key, attempts);
   } catch (error: any) {
      logger.warn(`Rate limiting error: ${error.message}`);
      logger.info(error.stack);
      throw new Error(`Rate limit check failed for tool ${toolId}: ${error.message}`);
   }
}

// === INPUT VALIDATION & SANITIZATION ===
function sanitizeInput(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  // Basic HTML escape and trim
  return input.trim().replace(/[<>'"&]/g, (char) => {
    const escapeMap: Record<string, string> = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;' };
    return escapeMap[char];
  });
}

function validateToolArgs(tool: ToolDefinition, args: Record<string, unknown>): Record<string, unknown> {
  if (!tool.parameters) return args; // No validation schema
  
  const validate = ajv.compile(tool.parameters);
  const valid = validate(args);
  
  if (!valid) {
    const errors = (validate.errors || []).map(err => 
      `${err.instancePath || 'root'} ${err.message}`
    ).join(', ');
    logger.warn(`Tool argument validation failed for ${tool.name}: ${errors}`);
    logger.info(`Stack trace: ${new Error().stack}`);
    throw new Error(`Tool argument validation failed: ${errors}`);
  }
  
  return args;
}

// === ENHANCED CONTEXT STACK MANAGEMENT ===

/**
 * Add an entry to the context stack with role information
 */
function addToContextStack(
  contextStack: ContextEntry[], 
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: string | Record<string, unknown> | unknown,
  stepId?: string,
  toolName?: string,
  metadata?: Record<string, unknown>
): void {
  contextStack.push({
    role,
    content,
    timestamp: Date.now(),
    stepId,
    toolName,
    metadata
  });
}

/**
 * Flatten context stack for AI processing with role-aware formatting
 */
function flattenContextStack(contextStack: ContextEntry[], includeRoles: boolean = true): string {
  if (!contextStack || contextStack.length === 0) {
    return 'No previous context available';
  }

  return contextStack.map(entry => {
    let formattedContent: string;
    
    // Handle different content types
    if (typeof entry.content === 'object') {
      formattedContent = JSON.stringify(entry.content, null, 2);
    } else {
      formattedContent = String(entry.content);
    }

    // Add role prefix if requested
    if (includeRoles) {
      const rolePrefix = getRolePrefix(entry.role, entry.toolName);
      return `${rolePrefix}: ${formattedContent}`;
    } else {
      return formattedContent;
    }
  }).join('\n\n');
}

/**
 * Flatten lastChatTurn for AI processing with role-aware formatting
 */
function flattenLastChatTurn(lastChatTurn: { user?: ContextEntry; assistant?: ContextEntry }, includeRoles: boolean = true): string {
  const entries: ContextEntry[] = [];
  
  // Add user entry if present
  if (lastChatTurn.user) {
    entries.push(lastChatTurn.user);
  }
  
  // Add assistant entry if present
  if (lastChatTurn.assistant) {
    entries.push(lastChatTurn.assistant);
  }
  
  if (entries.length === 0) {
    return 'No chat context available';
  }
  
  // Reuse the existing formatting logic
  return flattenContextStack(entries, includeRoles);
}

/**
 * Get appropriate prefix for different roles
 */
function getRolePrefix(role: string, toolName?: string): string {
  switch (role) {
    case 'user':
      return 'User';
    case 'assistant':
      return 'Assistant';
    case 'system':
      return 'System';
    case 'tool':
      return toolName ? `Tool(${toolName})` : 'Tool';
    default:
      return role;
  }
}

/**
 * Filter context stack by role for specific use cases
 */
function filterContextByRole(contextStack: ContextEntry[], roles: string[]): ContextEntry[] {
  return contextStack.filter(entry => roles.includes(entry.role));
}

/**
 * Get recent context entries (last N entries)
 */
function getRecentContext(contextStack: ContextEntry[], count: number): ContextEntry[] {
  return contextStack.slice(-count);
}

/**
 * Debug utility: Get a human-readable summary of the context stack
 */
function getContextSummary(contextStack: ContextEntry[]): string {
  if (!contextStack || contextStack.length === 0) {
    return 'Context Stack: Empty';
  }

  const summary = contextStack.map((entry, index) => {
    const timestamp = new Date(entry.timestamp).toISOString().slice(11, 19); // HH:MM:SS
    const contentPreview = typeof entry.content === 'string' 
      ? entry.content.substring(0, 50) + (entry.content.length > 50 ? '...' : '')
      : '[object]';
    
    const toolInfo = entry.toolName ? ` (${entry.toolName})` : '';
    const stepInfo = entry.stepId ? ` [${entry.stepId}]` : '';
    
    return `${index + 1}. ${timestamp} ${entry.role}${toolInfo}${stepInfo}: ${contentPreview}`;
  }).join('\n');

  return `Context Stack (${contextStack.length} entries):\n${summary}`;
}

/**
 * Export context stack as conversation history for AI prompts
 */
function exportConversationHistory(contextStack: ContextEntry[], format: 'openai' | 'anthropic' | 'simple' = 'simple'): unknown[] | string {
  if (!contextStack || contextStack.length === 0) {
    return [];
  }

  switch (format) {
    case 'openai':
      return contextStack.map(entry => ({
        role: entry.role === 'assistant' ? 'assistant' : 'user',
        content: typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content)
      }));
      
    case 'anthropic':
      return contextStack.map(entry => ({
        role: entry.role === 'assistant' ? 'assistant' : 'user',
        content: typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content)
      }));
      
    case 'simple':
    default:
      return flattenContextStack(contextStack, true);
  }
}

// === STACK-OF-STACKS FLOW MANAGEMENT ===
// Simple implementation: maintains multiple flow stacks for proper interruption/resumption
// Stored in engine.flowStacks for proper context isolation

function initializeFlowStacks(engine: Engine) {
   try {
      engine.flowStacks = [[]];
   } catch (error: any) {
      logger.error("Failed to initialize flow stacks:", error.message);
      logger.error(error.stack);
      throw error; // Re-throw to ensure proper error handling
   }
}

function getCurrentStack(engine: Engine): FlowFrame[] {
  return engine.flowStacks[engine.flowStacks.length - 1] as FlowFrame[];
}

function pushToCurrentStack(engine: Engine, flowFrame: FlowFrame) {
   getCurrentStack(engine).push(flowFrame);
}

function popFromCurrentStack(engine: Engine): FlowFrame | undefined {
  return getCurrentStack(engine).pop();
}

function createNewStack(engine: Engine): number {
  // Create new stack and switch to it
  engine.flowStacks.push([]);
  return engine.flowStacks.length - 1;
}

function switchToPreviousStack(engine: Engine) {
   try {
      // Remove current empty stack and switch to previous
      if (engine.flowStacks.length > 1) {
          engine.flowStacks.pop();
          logger.info(`Switched back to previous stack, now have ${engine.flowStacks.length} stacks`);
      } else {
         logger.error("Attempted to switch to previous stack, but only one stack exists");
         throw new Error("Cannot switch to previous stack - only one stack exists");
      }
   } catch (error: any) {
      logger.error("Error switching to previous stack:", error.message);
      logger.error(error.stack);
      throw error;
   }
}

function getInitialVariables(engine: Engine, flowDefinition?: FlowDefinition, inheritedVariables?: Record<string, unknown>): Record<string, unknown> {
   let variables: Record<string, unknown>;
   
   if (inheritedVariables) {
     // For sub-flows: Use the SAME REFERENCE as parent (don't spread/copy)
     variables = inheritedVariables;
     
     // Merge flow definition variables IN-PLACE on the shared reference
     if (flowDefinition?.variables) {
       for (const [varName, varDef] of Object.entries(flowDefinition.variables)) {
         if (varDef.value !== undefined) {
           variables[varName] = varDef.value; // Modify in-place on shared reference
         }
       }
     }
   } else {
     // For root flows: Create new variables object from globals + flow definition
     variables = engine.globalVariables ? { ...engine.globalVariables } : {};
     
     // Merge in flow-defined variables with their initial values
     if (flowDefinition?.variables) {
       for (const [varName, varDef] of Object.entries(flowDefinition.variables)) {
         if (varDef.value !== undefined) {
           variables[varName] = varDef.value;
         }
       }
     }
   }
   
   return variables;
}

function getCurrentStackLength(engine: Engine): number {
  return getCurrentStack(engine).length;
}

function getCurrentFlowFrame(engine: Engine): FlowFrame {
  if (getCurrentStackLength(engine) === 0) {
    throw new Error("No flow frames available in the current stack");
  }
  
  // Return the last frame in the current stack
  const currentFlowFrame = getCurrentStack(engine)[getCurrentStackLength(engine) - 1];
  
  if (!currentFlowFrame) {
    throw new Error("Current flow frame is undefined");
  }

  return currentFlowFrame;
}

// === FLOW EXECUTION ENGINE WITH ENHANCED ERROR HANDLING ===
async function isFlowActivated(input: string, engine: Engine, userId: string = 'anonymous') {
  const flowsMenu = engine.flowsMenu; 
  const flow = await getFlowForInput(input, engine);
  
  if (flow) {
    const transaction = new FlowTransaction(flow.name, 'user-input', userId);
    
    // Prepare tentative flow_init message that will be replaced by SAY-GET guidance if present
    const tentativeFlowInit = getSystemMessage(engine, 'flow_init', { 
      flowName: flow.name,
      flowPrompt: getFlowPrompt(engine, flow.name)
    });
    // Add to global accumulated messages
    engine?.addAccumulatedMessage!(tentativeFlowInit);

    const flowFrame: FlowFrame = {
      flowName: flow.name,
      flowId: flow.id,
      flowVersion: flow.version,
      flowStepsStack: [...flow.steps].reverse(),
      contextStack: [{ role: 'user', content: sanitizeInput(input), timestamp: Date.now() }], // Keep activation input in context for reference
      inputStack: [], // Start empty - only SAY-GET responses go here
      variables: getInitialVariables(engine, flow), // Start with global variables + flow definition variables
      transaction,
      userId,
      startTime: Date.now()
    };
    
    pushToCurrentStack(engine, flowFrame);
    auditLogger.logFlowStart(flow.name, input, userId, transaction.id);
    
    return flow;
  }

  return null;
}

async function playFlowFrame(engine: Engine): Promise<string | null> {
  // Enhanced recursion protection using natural stack depth
  const stackDepth = getCurrentStackLength(engine);
  if (stackDepth > 20) {
    const error = new Error("Maximum recursion depth reached in playFlowFrame");
    logger.error("ERROR!", error.message);
    
    // Log the error and clean up
    if (getCurrentStackLength(engine) > 0) {
      const currentFlowFrame = getCurrentFlowFrame(engine);
      auditLogger.logFlowExit(currentFlowFrame.flowName, currentFlowFrame.userId, currentFlowFrame.transaction.id, 'max_recursion_depth');
      
      // Do we need this?
      //currentFlowFrame.contextStack.push(error.message);
      
      currentFlowFrame.transaction.fail("Max recursion depth exceeded");
    }
    
    throw error;
  }

  if (getCurrentStackLength(engine) === 0) {
    const error = new Error("No flow frames to play");
    logger.error("ERROR!", error.message);
    throw error;
  }

  // Continue processing until we hit a SAY step or complete all flows
  while (getCurrentStackLength(engine) > 0) {
    const currentFlowFrame = getCurrentFlowFrame(engine);
    logger.info(`[${currentFlowFrame.transaction.id.slice(0, 8)}] Playing flow: ${currentFlowFrame.flowName}, steps left: ${currentFlowFrame.flowStepsStack.length}, stack depth: ${stackDepth}`);
    
    // Handle pending variable storage when resuming flow execution
    if (currentFlowFrame.pendingVariable && currentFlowFrame.inputStack && currentFlowFrame.inputStack.length > 0) {
      const userInput = currentFlowFrame.inputStack[currentFlowFrame.inputStack.length - 1];
      
      // Safety check: ensure userInput is defined before processing
      if (!userInput) {
        logger.warn(`Skipping variable processing - userInput is undefined for pendingVariable: ${currentFlowFrame.pendingVariable}`);
        // Clear the pending variable to avoid infinite loops
        delete currentFlowFrame.pendingVariable;
      } else {
        // Store user input as variable value
        // (System commands like 'cancel' are already handled before this point)
        currentFlowFrame.variables[currentFlowFrame.pendingVariable] = userInput;
        logger.info(`Stored user input in variable '${currentFlowFrame.pendingVariable}': "${userInput}"`);
        delete currentFlowFrame.pendingVariable;
        
        // Pop the SAY-GET step now that variable assignment is complete
        currentFlowFrame.flowStepsStack.pop();
        logger.info(`Popped SAY-GET step after variable assignment completed`);
      }
    }
    
    // Flow completion handling
    if (currentFlowFrame.flowStepsStack.length === 0) {
      logger.info(`Flow ${currentFlowFrame.flowName} completed, popping from stack (steps length: ${currentFlowFrame.flowStepsStack.length})`);
      const completedFlow = popFromCurrentStack(engine)!;
      completedFlow.transaction.complete();
      
      // When a flow completes, it doesn't "return" a value in the traditional sense.
      // It communicates results by setting variables in the shared `variables` object,
      // which are then accessible to the parent flow.
      // The only thing to handle here is flushing any pending user-facing messages.
      
      // If there are pending messages, they should be displayed.
      let finalUserMessage = '';
      const accumulatedMessages: string[] = [];
      
      // Use only global accumulated messages (simplified)
      if (engine && typeof engine.hasAccumulatedMessages === 'function' && engine.hasAccumulatedMessages()) {
        Array.prototype.push.apply(accumulatedMessages, engine.getAndClearAccumulatedMessages!());
      }

      if (accumulatedMessages.length > 0) {
        finalUserMessage = accumulatedMessages.join('\n\n');
        logger.info(`Flow ${completedFlow.flowName} completed with ${accumulatedMessages.length} accumulated messages`);
      } else {
        logger.info(`Flow ${completedFlow.flowName} completed with no accumulated messages`);
      }
      
      // If a parent flow exists, continue its execution.
      if (getCurrentStackLength(engine) > 0) {
        const parentFlowFrame = getCurrentFlowFrame(engine);
        logger.info(`Flow ${completedFlow.flowName} finished. Returning to parent flow ${parentFlowFrame.flowName}.`);
        
        // If there was a final message from the completed sub-flow, ensure it's displayed
        // before the parent flow continues. We'll add it to the engine's accumulator.
        if (finalUserMessage) {
          if (engine) engine.addAccumulatedMessage!(finalUserMessage);
        }

        continue; // The loop will now process the parent flow.
      }
      
      // No parent flow - check for interrupted flows to resume
      if (getCurrentStackLength(engine) === 0) {
         if (engine.flowStacks.length > 1) {
            logger.info(`🔄 Switching back to previous stack (${engine.flowStacks.length - 2})`);
            switchToPreviousStack(engine);

            if (getCurrentStackLength(engine) > 0) {
               logger.info(`Resumed stack has ${getCurrentStackLength(engine)} flow frames`);
               
               // Get the resumed flow name and show consolidated resumption message with guidance
               const resumedFlowFrame = getCurrentFlowFrame(engine);
               resumedFlowFrame.justResumed = true; // Mark as just resumed to skip regular guidance
               const resumeMessage = getSystemMessage(engine, 'flow_resumed_with_guidance', { 
                 flowName: resumedFlowFrame.flowName,
                 flowPrompt: getFlowPrompt(engine, resumedFlowFrame.flowName)
               });
               
               // Add both the final message and resumption message to accumulated messages
               if (finalUserMessage && engine.addAccumulatedMessage) {
                  engine.addAccumulatedMessage(finalUserMessage);
               }
               if (engine.addAccumulatedMessage) {
                  engine.addAccumulatedMessage(resumeMessage);
               }
               
               continue;
            }
         } else {
            logger.info(`No more flow frames to process, all flows completed.`);
         }
      }
      
      // No parent flow, no stack to resume. This is the end of the interaction for now.
      // Return the final message if there is one.
      return finalUserMessage || getSystemMessage(engine, 'flow_completed_generic');
    }

    const step = currentFlowFrame.flowStepsStack[currentFlowFrame.flowStepsStack.length - 1];
    const startTime = Date.now();
    
    try {
      const result = await playStep(currentFlowFrame, engine);
      const duration = Date.now() - startTime;
      
      currentFlowFrame.transaction.addStep(step, result, duration, 'success');
      logger.info(`Step ${step.type} executed successfully, result: ${typeof result === 'object' ? '[object]' : result}`);
      
      // If this was a SAY-GET step, return and wait for user input
      if (step.type === 'SAY-GET') {
        // Check if this was the last step - if so, complete the flow
        if (currentFlowFrame.flowStepsStack.length === 0) {
          logger.info(`SAY-GET step was final step, flow ${currentFlowFrame.flowName} completed`);
          const completedFlow = popFromCurrentStack(engine)!;
          completedFlow.transaction.complete();
          return result;
        }
        return result;
      }
      
      // For SAY, CALL-TOOL, FLOW, and SET steps, continue processing automatically (non-blocking)
      continue;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      currentFlowFrame.transaction.addError(step, error, duration);
      
      logger.error(`Step ${step.type} failed: ${error.message}`);
      logger.info(`Stack trace: ${error.stack}`);
      throw error;
    }
  }
  
  // Should never reach here
  const currentFlowFrame = getCurrentFlowFrame(engine);
  logger.error(`Unexpected flow state reached for flow ${currentFlowFrame.flowName}`);
  throw new Error(`Unexpected flow state reached for flow ${currentFlowFrame.flowName}`);
}

async function playStep(currentFlowFrame: FlowFrame, engine: Engine): Promise<string | null> {
  try {
    const stackDepth = getCurrentStackLength(engine);
    if (stackDepth > 20) {
      throw new Error("Maximum recursion depth reached in playStep");
    }

    // Extract what we need from the currentFlowFrame
    const step = currentFlowFrame.flowStepsStack[currentFlowFrame.flowStepsStack.length - 1];
    //const contextStack = currentFlowFrame.contextStack;
    const inputStack = currentFlowFrame.inputStack;
    const currentInput = inputStack[inputStack.length - 1];

    // Smart logging - don't log "undefined" input for steps that don't need it yet
    const inputDisplay = currentInput !== undefined ? `"${currentInput}"` : 
                        (step.type === 'SAY-GET' ? '(waiting for user input)' : 
                         step.type === 'SAY' ? '(no input needed)' : 
                         step.type === 'SET' ? '(no input needed)' : 
                         '(no input available)');
    
    logger.info(`[${currentFlowFrame.transaction.id.slice(0, 8)}] Playing step ${step.id || step.type} with input: ${inputDisplay}`);

    switch (step.type) {
      case 'CALL-TOOL':
        return await handleToolStep(currentFlowFrame, engine);
      case 'SAY':
        return handleSayStep(currentFlowFrame, engine);
      case 'SAY-GET':
        return handleSayGetStep(currentFlowFrame, engine);
      case 'FLOW':
        return await handleSubFlowStep(currentFlowFrame, engine);
      case 'SET':
        return handleSetStep(currentFlowFrame, engine);
      case 'SWITCH':
        return await handleSwitchStep(currentFlowFrame, engine);
      case 'CASE':
        return await handleCaseStep(currentFlowFrame, engine);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }    
  } catch (error: any) {
    logger.error(`Error in playStep: ${error.message}`);
    throw error;
  }
}

// === AI COMMUNICATION LAYER ===

/**
 * Base AI worker: Plain interface to AI services
 * Uses the user-provided AI callback function instead of hardcoded implementation
 * @param systemInstruction - The system message/prompt for the AI
 * @param userMessage - The user's input message
 * @param aiCallback - User-provided AI communication function
 * @returns AI response as string
 */
async function fetchAiResponse(systemInstruction: string, userMessage: string, aiCallback: AiCallbackFunction): Promise<string> {
  try {
    logger.debug(`fetchAiResponse called with system instruction length: ${systemInstruction.length}, user message: "${userMessage}"`);
    
    // Use the user-provided AI callback function
    const aiResponse = await aiCallback(systemInstruction, userMessage);
    
    if (typeof aiResponse !== 'string') {
      throw new Error('AI callback must return a string response');
    }
    
    logger.debug(`fetchAiResponse completed, response length: ${aiResponse.length}`);
    return aiResponse.trim();
    
  } catch (error: any) {
    logger.warn(`fetchAiResponse error: ${error.message}`);
    logger.warn(error.stack);
    throw new Error(`AI communication failed: ${error.message}`);
  }
}

/**
 * Task-oriented AI wrapper: Creates structured prompts for specific tasks
 * @param task - The main task description
 * @param rules - Rules and constraints for the task
 * @param context - Current context information
 * @param userInput - The user's input
 * @param flows - Available flows (optional)
 * @param jsonSchema - Optional JSON schema for structured responses
 * @param aiCallback - User-provided AI communication function
 * @returns AI response as string or parsed JSON object
 */
async function fetchAiTask(
  task: string, 
  rules: string, 
  context: string, 
  userInput: string, 
  flows?: FlowDefinition[],
  jsonSchema?: string,
  aiCallback?: AiCallbackFunction
): Promise<string> {
  try {
    if (!aiCallback) {
      throw new Error('AI callback function is required');
    }
    
    logger.debug(`fetchAiTask called for task: "${task.substring(0, 50)}...", jsonMode: ${!!jsonSchema}`);
    
    // Create structured system message using markup
    let systemMessage = `<task>\n${task}\n</task>\n\n`;
    systemMessage += `<rules>\n${rules}</rules>`;
    
    // Add JSON schema instructions if provided
    if (jsonSchema) {
      systemMessage += `\n\n<json-schema>\n${jsonSchema}\n</json-schema>\n\n`;
      systemMessage += `<instructions>\nRespond ONLY with valid JSON matching the schema above. No additional text or explanation.\n</instructions>`;
    }
    
    // Create structured user message using markup
    let userMessage = context ? `<context>\n${context}</context>\n\n` : '';
    userMessage += `<user-input>\n${sanitizeInput(userInput)}\n</user-input>`;
    
    if (flows && flows.length > 0) {
      const flowDescriptions = flows.map(flow => 
        `${flow.name}: ${flow.description} (Risk: ${flow.metadata?.riskLevel || 'unknown'})`
      ).join('\n');
      userMessage += `\n\n<available-flows>\n${flowDescriptions}\n</available-flows>`;
    }
    
    const aiResponse = await fetchAiResponse(systemMessage, userMessage, aiCallback);
    
    // If JSON schema was provided, parse and return JSON
    if (jsonSchema) {
      // Clean up common AI response formatting issues
      let cleanedResponse = aiResponse.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```$/i, '');
      
      // Extract JSON from response if it contains extra text
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedResponse = jsonMatch[0];
      }
      
      try {
        const parsedResponse = JSON.parse(cleanedResponse);
        logger.debug(`fetchAiTask completed with JSON parsing successful`);
        return parsedResponse;
      } catch (parseError: any) {
        logger.warn(`JSON parsing failed for response: "${cleanedResponse}"`);
        logger.info(`Stack trace: ${parseError.stack}`);
        throw new Error(`Invalid JSON response from AI: ${parseError.message}`);
      }
    }
    
    // Return raw string response for non-JSON tasks
    return aiResponse;
    
  } catch (error: any) {
    logger.error(`fetchAiTask error: ${error.message}`);
    throw new Error(`AI task processing failed: ${error.message}`);
  }
}

async function getFlowForInput(input: string, engine: Engine): Promise<FlowDefinition | null> {
   // CRITICAL: This function requires AI access via engine.aiCallback
   // Without AI, the engine cannot detect user intent and activate flows
   // Sessions would never be activated as no workflows could be triggered
   try {
      logger.info(`getFlowForInput called with input: "${input}"`);

      if (!input || typeof input !== 'string') {
         logger.warn(`getFlowForInput received invalid input: ${typeof input} ${input}`);
         return null;
      }
      
      const flowsMenu = engine.flowsMenu;
      if (!flowsMenu || flowsMenu.length === 0) {
         logger.warn("No flows available in the menu");
         return null;
      }

      // First try direct name matching for exact flow names (useful for testing)
      const directMatch = flowsMenu.find(flow => flow.name === input || flow.name.toLowerCase() === input.toLowerCase());
      if (directMatch) {
         logger.info(`Direct flow name match found: ${directMatch.name}`);
         return directMatch;
      }

      const task = "Considering the chat history when available and applicable, decide if the user input should trigger any available flow.";

      const rules = `- Return the exact flow name if a match is found
- Return "None" if no workflow applies
- Consider user intent and the chat context
- Prioritize the most relevant flow considering all available flows
`;

      // Use chat context when not in a flow (this is where lastChatTurn context is relevant)
      let context = '';
      if (engine.lastChatTurn && (engine.lastChatTurn.user || engine.lastChatTurn.assistant)) {
        const chatContext = flattenLastChatTurn(engine.lastChatTurn, true);
        context = `<chat-history>\n
          ${chatContext}\n
          </chat-history>\n\n`;
      }

      try {    
         const aiResponse = await fetchAiTask(task, rules, context, input, flowsMenu, undefined, engine.aiCallback);
         
         if (aiResponse && aiResponse !== 'None' && aiResponse !== 'null') {
            const flow = flowsMenu.find(flow => flow.name === aiResponse);
            if (flow) {
            return flow;
            } else {
            logger.error(`Flow "${aiResponse}" not found in flows menu`);
            }
         } else {
            logger.info(`No flow activated for input: "${input}"`);
         }
      } catch (error: any) {
         logger.error("Error in flow detection:", error);
      }

      return null;
   } catch (error: any) {
      logger.warn(`Error in getFlowForInput: ${error.message}`);
      logger.info(`Stack trace: ${error.stack}`);
      return null;
   }
}

// === SMART DEFAULT ONFAIL GENERATOR ===
function generateSmartRetryDefaultOnFail(step: FlowStep, error: Error, currentFlowFrame: FlowFrame): boolean {
  const toolName = step.tool || 'unknown';
  const errorMessage = error.message || 'Unknown error';
  const flowName = currentFlowFrame.flowName;

  logger.info(`Generating smart default onFail for tool ${toolName}, in flow ${flowName} for error: ${errorMessage}`);

  // Categorize error types for intelligent handling

  // Our tool call related errors:
  const isToolCallError = errorMessage.includes('Failed to generate tool call');

  // Provoke retry of the current TOOL step if recoverable
  const isNetworkError = errorMessage.includes('fetch failed') || 
                         errorMessage.includes('ENOTFOUND') || 
                         errorMessage.includes('timeout') ||
                         errorMessage.includes('ECONNREFUSED') ||
                         errorMessage.includes('network');

  // Provoke retry of the current flow if recoverable
  const isServerError = errorMessage.includes('408') || // Request Timeout
                        errorMessage.includes('409') || // Conflict
                        errorMessage.includes('500') || // Internal Server Error
                        errorMessage.includes('502') || // Bad Gateway
                        errorMessage.includes('503') || // Service Unavailable
                        errorMessage.includes('504');   // Gateway Timeout

  // Provoke cancelation of the current flow if unrecoverable
  const isBadRequest = errorMessage.includes('400') ||
                       errorMessage.includes('404') || // Not Found
                       errorMessage.includes('405') || // Method Not Allowed
                       errorMessage.includes('406') || // Not Acceptable
                       errorMessage.includes('410') || // Gone
                       errorMessage.includes('501') || // Not Implemented
                       errorMessage.includes('505') || // HTTP Version Not Supported
                       errorMessage.includes('bad request') ||
                       errorMessage.includes('invalid request') ||
                       errorMessage.includes('malformed request') ||
                       errorMessage.includes('syntax error');
  
  // Provoke cancelation of the current flow if unrecoverable
  const isAuthError = errorMessage.includes('401') || // Unauthorized
                      errorMessage.includes('402') || // Payment Required
                      errorMessage.includes('403') || // Forbidden
                      errorMessage.includes('407') || // Proxy Authentication Required
                      errorMessage.includes('unauthorized') ||
                      errorMessage.includes('authentication');

  // Provoke cancelation of the current flow if unrecoverable
  const isRateLimitError = errorMessage.includes('429') || 
                           errorMessage.includes('rate limit') ||
                           errorMessage.includes('too many requests');

  // Financial operations get special treatment in the future
  const isCriticalFinancial = toolName.toLowerCase().includes('payment') || 
                              toolName.toLowerCase().includes('account') ||
                              toolName.toLowerCase().includes('transaction') ||
                              flowName.toLowerCase().includes('payment');
   
  // Generate context-aware error messages and recovery strategies
  let message: string, callType = "replace", retryHint = "", doRetry = false, doCancel = false;
  
  if (isNetworkError || isServerError) {
    doRetry = true;
  } else if (isToolCallError || isBadRequest || isAuthError || isRateLimitError || isCriticalFinancial) {
    doCancel = true;
  } else {
    logger.warn(`Unrecognized error type for tool ${toolName} in flow ${flowName}: ${errorMessage}`);    
    // Default to Cancel for unexpected errors
    doCancel = true;
  }

  /* This used to be generateSmartDefaultOnFail() attempting to generate an onFail step[s] - but it was buggy and not very useful.
  logger.info(`Generating smart default onFail for tool ${toolName}, error: ${errorMessage}`);
  
  // Categorize error types for intelligent handling
  const isNetworkError = errorMessage.includes('fetch failed') || 
                        errorMessage.includes('ENOTFOUND') || 
                        errorMessage.includes('timeout') ||
                        errorMessage.includes('ECONNREFUSED') ||
                        errorMessage.includes('network');
                        
  const isAuthError = errorMessage.includes('401') || 
                     errorMessage.includes('403') || 
                     errorMessage.includes('unauthorized') ||
                     errorMessage.includes('authentication');
                     
  const isRateLimitError = errorMessage.includes('429') || 
                          errorMessage.includes('rate limit') ||
                          errorMessage.includes('too many requests');
                          
  const isDataError = errorMessage.includes('invalid') || 
                     errorMessage.includes('validation') ||
                     errorMessage.includes('bad request') ||
                     errorMessage.includes('400');
                     
  const isCriticalFinancial = toolName.toLowerCase().includes('payment') || 
                             toolName.toLowerCase().includes('account') ||
                             toolName.toLowerCase().includes('transaction') ||
                             flowName.toLowerCase().includes('payment');
  
  // Generate context-aware error messages and recovery strategies
  let message: string, callType = "replace", retryHint = "";
  
  if (isCriticalFinancial) {
    // Financial operations get special treatment
    message = `🚨 Payment system temporarily unavailable. Your transaction has been logged and will be reviewed.\n\n` +
              `Error Reference: ${currentFlowFrame.transaction.id.slice(0, 8)}\n` +
              `Please contact customer support if needed, or try again in a few minutes.`;
    callType = "replace"; // Don't continue financial flows on error
    
  } else if (isNetworkError) {
    message = `🌐 Network connectivity issue detected. The service "${toolName}" is temporarily unreachable.\n\n` +
              `This usually resolves quickly. You can:\n` +
              `• Try again in a moment\n` +
              `• Check your internet connection\n` +
              `• Continue with other workflows`;
    retryHint = " You may retry this operation later.";
        
  } else if (isAuthError) {
    message = `🔐 Authentication required for "${toolName}". Your access permissions may need to be updated.\n\n` +
              `Please contact your administrator or try logging in again.`;
              
  } else if (isRateLimitError) {
    message = `⏱️ Service "${toolName}" is currently busy (rate limited). Please wait a moment before retrying.\n\n` +
              `This helps ensure fair access for all users.`;
    retryHint = " The service will be available again shortly.";
    
  } else if (isDataError) {
    message = `📝 Data validation issue with "${toolName}". The provided information may be incomplete or invalid.\n\n` +
              `Please check your input and try again with corrected data.`;
              
  } else {
    // Generic intelligent error handling
    const userFriendlyToolName = toolName.replace(/([A-Z])/g, ' $1').trim();
    message = `⚠️ The "${userFriendlyToolName}" service encountered an unexpected issue.\n\n` +
              `Technical details: ${errorMessage}\n\n` +
              `This has been logged for review. You can continue with other workflows.${retryHint}`;
  }
  
  // Add helpful context based on current flow
  if (flowName.toLowerCase().includes('test') || flowName.toLowerCase().includes('demo')) {
    message += `\n\n💡 Note: This is a test/demo environment where some failures are expected.`;
  }
  
  // Add step information for debugging
  if (step.id) {
    message += `\n\nStep ID: ${step.id}`;
  }
    
  return {
    type: "SAY" as const,
    value: message,
    callType: callType as 'call' | 'replace' | 'reboot'
  };
  */

  // Can we push a 'cancel' input to the input stack?
  if (doCancel) {
    // Remove all remaining steps from the stack
    currentFlowFrame.flowStepsStack = [];
    logger.info(`Cancelling flow ${currentFlowFrame.flowName} due to unrecoverable error: ${errorMessage}`);
  }

  // Return the decision to retry, cancel, or replace the step
  return doRetry;
}

// === ENHANCED RETRY AND VALIDATION SYSTEM ===

/**
 * Step-level input validation result
 */
interface StepValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Perform step-level input validation before tool execution
 */
async function performStepInputValidation(
  step: FlowStep, 
  currentFlowFrame: FlowFrame, 
  engine: Engine
): Promise<StepValidationResult> {
  const result: StepValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };
  
  // Skip validation if no validation rules defined
  if (!step.inputValidation) {
    return result;
  }
  
  // Validate against patterns
  if (step.inputValidation.patterns) {
    for (const pattern of step.inputValidation.patterns) {
      const fieldValue = currentFlowFrame.variables?.[pattern.field];
      if (fieldValue && typeof fieldValue === 'string') {
        const regex = new RegExp(pattern.pattern);
        if (!regex.test(fieldValue)) {
          result.isValid = false;
          result.errors.push(pattern.message || `Field ${pattern.field} does not match required pattern`);
        }
      }
    }
  }
  
  // Custom validation function
  if (step.inputValidation.customValidator && engine.APPROVED_FUNCTIONS) {
    try {
      const validator = engine.APPROVED_FUNCTIONS.get(step.inputValidation.customValidator);
      if (typeof validator === 'function') {
        const customResult = await validator(currentFlowFrame.variables, currentFlowFrame) as any;
        if (customResult && typeof customResult === 'object') {
          if (customResult.isValid === false) {
            result.isValid = false;
            if (Array.isArray(customResult.errors)) {
              result.errors.push(...customResult.errors);
            }
          }
        }
      }
    } catch (error: any) {
      logger.warn(`Custom validation function failed: ${error.message}`);
      result.warnings.push('Custom validation could not be performed');
    }
  }
  
  return result;
}

/**
 * Handle validation failure with user-friendly retry
 */
async function handleValidationFailure(
  step: FlowStep,
  validationResult: StepValidationResult,
  currentFlowFrame: FlowFrame,
  engine: Engine
): Promise<string> {
  const errors = validationResult.errors.join(', ');
  logger.info(`Input validation failed for step ${step.id}: ${errors}`);
  
  // Create a smart retry step that goes back to collect valid input
  const retryStep: FlowStep = {
    type: 'SAY-GET',
    value: `❌ ${errors}\n\nPlease provide the correct information:`,
    variable: step.variable || 'user_input'
  };
  
  // If we can identify which step collected the invalid input, retry from there
  const collectStepId = findInputCollectionStep(step, currentFlowFrame);
  if (collectStepId) {
    // Go back to the data collection step
    const originalFlow = engine.flowsMenu?.find(f => f.name === currentFlowFrame.flowName);
    const collectStep = originalFlow?.steps.find(s => s.id === collectStepId);
    if (collectStep) {
      // Modify the message to include validation error
      retryStep.value = `❌ ${errors}\n\n${collectStep.value || 'Please provide the correct information:'}`;
      retryStep.variable = collectStep.variable;
    }
  }
  
  // Push retry step and current step back to stack
  currentFlowFrame.flowStepsStack.push(step); // Put back the tool step for retry
  currentFlowFrame.flowStepsStack.push(retryStep);
  
  return `Input validation failed. Asking for corrected input.`;
}

/**
 * Find the step that collected input for a failed tool step
 */
function findInputCollectionStep(toolStep: FlowStep, currentFlowFrame: FlowFrame): string | null {
  // Look for a variable that the tool step depends on
  const toolVariable = toolStep.variable;
  if (!toolVariable) return null;
  
  // Find the step that set this variable (likely a SAY-GET step)
  const contextEntries = currentFlowFrame.contextStack.filter(entry => entry.stepId);
  for (let i = contextEntries.length - 1; i >= 0; i--) {
    const entry = contextEntries[i];
    if (entry.stepId && entry.role === 'user') {
      // This might be the input collection step
      return entry.stepId;
    }
  }
  
  return null;
}

/**
 * Determine if a step should be retried based on error and retry configuration
 */
async function shouldRetryStep(
  step: FlowStep,
  error: Error,
  currentFlowFrame: FlowFrame,
  engine: Engine
): Promise<boolean> {
  const currentRetryCount = step.retryCount || 0;
  const maxRetries = step.maxRetries || 0;
  
  // Don't retry if we've exceeded max retries
  if (currentRetryCount >= maxRetries) {
    logger.info(`Max retries (${maxRetries}) reached for step ${step.id}`);
    return false;
  }
  
  // Check retry conditions if defined
  if (step.retryOnConditions) {
    for (const condition of step.retryOnConditions) {
      const regex = new RegExp(condition.errorPattern, 'i');
      if (regex.test(error.message)) {
        switch (condition.action) {
          case 'retry':
            return true;
          case 'skip':
          case 'fallback':
            return false;
          case 'ask_user':
            // TODO: Implement user confirmation for retry
            return true;
        }
      }
    }
  }
  
  // Default retry logic for common error types
  const errorMessage = error.message.toLowerCase();
  const isNetworkError = errorMessage.includes('fetch failed') || 
                        errorMessage.includes('timeout') ||
                        errorMessage.includes('econnrefused');
  const isTemporaryError = errorMessage.includes('rate limit') ||
                          errorMessage.includes('503') ||
                          errorMessage.includes('502');
  
  return maxRetries > 0 && (isNetworkError || isTemporaryError);
}

/**
 * Retry the current step with enhanced logic
 */
async function retryCurrentStep(
  step: FlowStep,
  error: Error,
  currentFlowFrame: FlowFrame,
  engine: Engine
): Promise<string> {
  const currentRetryCount = step.retryCount || 0;
  step.retryCount = currentRetryCount + 1;
  
  logger.info(`Retrying step ${step.id}, attempt ${step.retryCount}`);
  
  // Apply retry delay if specified
  if (step.retryDelay && step.retryDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, step.retryDelay));
  }
  
  // Apply exponential backoff for network errors
  if (step.retryStrategy === 'exponential') {
    const delay = Math.min(1000 * Math.pow(2, currentRetryCount), 30000); // Max 30 seconds
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  // Show progressive help if enabled
  if (step.retryBehavior?.showProgressiveHelp && step.retryCount > 1) {
    const helpMessage = generateProgressiveHelpMessage(step, error, step.retryCount);
    addToContextStack(
      currentFlowFrame.contextStack,
      'system',
      helpMessage,
      step.id + '-retry-help'
    );
  }
  
  // Put the step back on the stack for retry
  currentFlowFrame.flowStepsStack.push(step);
  
  return `Retrying ${step.tool} (attempt ${step.retryCount})...`;
}

/**
 * Generate progressive help messages for repeated failures
 */
function generateProgressiveHelpMessage(step: FlowStep, error: Error, retryCount: number): string {
  const toolName = step.tool || 'tool';
  let message = `💡 **Retry Help** (Attempt ${retryCount}):\n\n`;
  
  if (retryCount === 2) {
    message += `The "${toolName}" operation failed again. Here are some things to check:\n`;
    message += `• Make sure your input data is complete and valid\n`;
    message += `• Check that all required fields are provided\n`;
    message += `• Verify the format matches what's expected\n\n`;
  } else if (retryCount === 3) {
    message += `We're seeing repeated issues with "${toolName}". Additional troubleshooting:\n`;
    message += `• Try using simpler or different input values\n`;
    message += `• Check if there are any special characters causing issues\n`;
    message += `• Consider contacting support if this persists\n\n`;
    message += `**Error details:** ${error.message}\n\n`;
  } else if (retryCount >= 4) {
    message += `This is attempt ${retryCount} for "${toolName}". Consider:\n`;
    message += `• Canceling this operation and trying a different approach\n`;
    message += `• Contacting technical support for assistance\n`;
    message += `• Checking system status or trying again later\n\n`;
  }
  
  return message;
}

// === ENHANCED STEP HANDLERS ===
async function handleToolStep(currentFlowFrame: FlowFrame, engine: Engine): Promise<string> {
  // Extract what we need from the currentFlowFrame
  const step = currentFlowFrame.flowStepsStack.pop()!; // This handler pops its own step
  const contextStack = currentFlowFrame.contextStack;
  const inputStack = currentFlowFrame.inputStack;
  const input = inputStack[inputStack.length - 1];
  const flowsMenu = engine.flowsMenu; // Access the global flows menu
  
  const startTime = Date.now();
  
  // Initialize retry count if not present
  if (step.retryCount === undefined) {
    step.retryCount = 0;
  }
  
  // Perform input validation before tool execution
  const validationResult = await performStepInputValidation(step, currentFlowFrame, engine);
  if (!validationResult.isValid) {
    // Handle validation failure with user-friendly retry
    return await handleValidationFailure(step, validationResult, currentFlowFrame, engine);
  }
  
  try {
    logger.info(`Executing tool ${step.tool} (attempt ${step.retryCount + 1})`);
    
    // Rate limiting check
    checkRateLimit(engine, currentFlowFrame.userId, step.tool || '');
    
    const result = await generateToolCallAndResponse(engine, step.tool!, input, contextStack, currentFlowFrame.userId, currentFlowFrame.transaction.id, currentFlowFrame, step.args);
    const duration = Date.now() - startTime;
    
    // Log successful tool execution
    auditLogger.logToolExecution(step.tool!, input, result, duration, currentFlowFrame.userId, currentFlowFrame.transaction.id);
    
    // Add result to enhanced context stack with role information
    addToContextStack(
      contextStack, 
      'tool', 
      result, 
      step.id, 
      step.tool, 
      { duration, status: 'success' }
    );
    inputStack.push(result);
    
    // Store result in named variable if specified
    if (step.variable && currentFlowFrame.variables !== undefined) {
      currentFlowFrame.variables[step.variable] = result;
      logger.info(`Stored tool result in variable '${step.variable}': ${typeof result === 'object' ? JSON.stringify(result) : result}`);
    }

    // Tools always auto-proceed - return result and let flow continue naturally
    logger.info(`Tool completed successfully, continuing to next step`);
    return typeof result === 'string' ? result : `Tool ${step.tool} executed successfully.`;
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.warn(`Error executing tool ${step.tool}:`, error);
    logger.info(`Stack trace: ${error.stack}`);

    // Set the right most instance of 'Failed ...' in the tool's variable
    if (step.variable && currentFlowFrame.variables !== undefined) {
      // Find the right most instance of 'Failed ...' in the error message
      const errorMessage = error.message || 'Error: Unknown error';
      const rightIndex = errorMessage.lastIndexOf('Failed ');
      let errorMatch = null;
      if( rightIndex !== -1) {
        // Extract the error last instance of 'Failed ' occurrence including the 'Failed '
        errorMatch = errorMessage.substring(rightIndex);
      }
      if (errorMatch) {
        currentFlowFrame.variables[step.variable] = errorMatch;
      } else {
        currentFlowFrame.variables[step.variable] = errorMessage;
      }
      logger.info(`Stored tool error in variable '${step.variable}': ${currentFlowFrame.variables[step.variable]}`);
    }

    // Log tool error
    auditLogger.logToolError(step.tool!, input, error, duration, currentFlowFrame.userId, currentFlowFrame.transaction.id);

    // Enhanced retry logic: check if we should retry this step
    const shouldRetry = await shouldRetryStep(step, error, currentFlowFrame, engine) || (!step.onFail && generateSmartRetryDefaultOnFail(step, error, currentFlowFrame));
    // Default to 2 retries for a total of 3 attempts
    if (shouldRetry && step.retryCount < (step.maxRetries || 2)) {
      return await retryCurrentStep(step, error, currentFlowFrame, engine);
    }

    // Enhanced error handling: Check for explicit onFail or use smart default
    const effectiveOnFail = step.onFail; /*|| generateSmartDefaultOnFail(step, error, currentFlowFrame)*/
    
    if (effectiveOnFail) {
      logger.info(`Executing ${step.onFail ? 'explicit' : 'smart default'} onFail step for tool ${step.tool}`);
      
      // Handle array of onFail steps
      const onFailStep = Array.isArray(effectiveOnFail) ? effectiveOnFail[0] : effectiveOnFail;
      const callType = onFailStep.callType || "replace"; // Default to current behavior
      
      if (callType === "reboot") {
        // Clear all flows and start fresh with the onFail flow
        logger.info(`Rebooting with flow: ${onFailStep.name || onFailStep.type}`);
        
        // Clean up all existing flows
        while (getCurrentStackLength(engine) > 0) {
          const flow = popFromCurrentStack(engine)!;
          flow.transaction.fail(`Rebooted due to critical failure in ${step.tool}`);
        }
        
        // Start the onFail flow as a new root flow
        if (onFailStep.type === "FLOW") {
          const rebootFlow = flowsMenu?.find(f => f.name === onFailStep.name);
          if (rebootFlow) {
            const transaction = new FlowTransaction(rebootFlow.name, 'reboot-recovery', currentFlowFrame.userId);
            
            /* TODO: REVIEW if needed
            // Prepare tentative flow_init message
            const tentativeFlowInit = getSystemMessage(engine, 'flow_init', { 
              flowName: rebootFlow.name,
              flowPrompt: getFlowPrompt(engine, rebootFlow.name)
            });
            engine?.addAccumulatedMessage!(tentativeFlowInit);
            */
            
            pushToCurrentStack(engine, {
              flowName: rebootFlow.name,
              flowId: rebootFlow.id,
              flowVersion: rebootFlow.version,
              flowStepsStack: [...rebootFlow.steps].reverse(),
              contextStack: [{ role: 'user', content: input, timestamp: Date.now() }],
              inputStack: [input],
              variables: getInitialVariables(engine, rebootFlow), // Fresh variables for reboot flow
              transaction,
              userId: currentFlowFrame.userId,
              startTime: Date.now()
            });
            auditLogger.logFlowStart(rebootFlow.name, input, currentFlowFrame.userId, transaction.id);
          }
        } else {
          // Handle non-FLOW onFail steps in reboot mode
          currentFlowFrame.flowStepsStack = [onFailStep];
        }
        
        return `System rebooted due to critical failure in ${step.tool}`;
        
      } else if (callType === "replace") {
        // Current behavior - replace remaining steps in current flow
        if (Array.isArray(effectiveOnFail)) {
          currentFlowFrame.flowStepsStack = effectiveOnFail;
        } else {
          currentFlowFrame.flowStepsStack = [effectiveOnFail];
        }
          return `Tool ${step.tool} failed, executing onFail step`;
        
      } else if (callType === "call") {
        // New behavior - call onFail as sub-flow (preserves current flow)
        if (onFailStep.type === "FLOW") {
            // Push onFail flow as sub-flow
          const onFailFlow = flowsMenu?.find(f => f.name === onFailStep.name);
          if (onFailFlow) {
            const transaction = new FlowTransaction(onFailFlow.name, 'onFail-recovery', currentFlowFrame.userId);

            /* TODO: REVIEW if needed
            // Prepare tentative flow_init message
            const tentativeFlowInit = getSystemMessage(engine, 'flow_init', { 
              flowName: onFailFlow.name,
              flowPrompt: getFlowPrompt(engine, onFailFlow.name)
            });
            engine?.addAccumulatedMessage!(tentativeFlowInit);
            */

            pushToCurrentStack(engine, {
              flowName: onFailFlow.name,
              flowId: onFailFlow.id,
              flowVersion: onFailFlow.version,
              flowStepsStack: [...onFailFlow.steps].reverse(),
              contextStack: [...currentFlowFrame.contextStack], // Inherit context
              inputStack: [...currentFlowFrame.inputStack],
              variables: { ...currentFlowFrame.variables }, // Inherit variables
              transaction,
              userId: currentFlowFrame.userId,
              startTime: Date.now()
            });
            auditLogger.logFlowStart(onFailFlow.name, input, currentFlowFrame.userId, transaction.id);
            return `Tool ${step.tool} failed, calling recovery flow ${onFailFlow.name}`;
          }
        } else {
          // Handle non-FLOW onFail steps as immediate execution
          currentFlowFrame.flowStepsStack.unshift(onFailStep);
          return `Tool ${step.tool} failed, executing onFail step`;
        }
      }
    }

    // CANCEL remaining steps if no effective onFail handler is available and tool failed
    if (!effectiveOnFail) {
      // Remove all remaining steps from the stack
      currentFlowFrame.flowStepsStack = [];
      logger.info(`Cancelling flow ${currentFlowFrame.flowName} due to unrecoverable error: ${error.message}`);
    }

    // No onFail handler available - use default error message
    const defaultMessage = getSystemMessage(engine, 'tool_failed', { 
      toolName: step.tool, 
      errorMessage: error.message 
    });
    return defaultMessage;
  }
}

function handleSayStep(currentFlowFrame: FlowFrame, engine: Engine | null = null): null {
  // Extract what we need from the currentFlowFrame
  const step = currentFlowFrame.flowStepsStack.pop()!; // This handler pops its own step
  const contextStack = currentFlowFrame.contextStack;
  
  const lang = engine?.language;
  const message = (lang && step[`value_${lang}`]) || step.value || '';
  const interpolated = interpolateMessage(String(message), contextStack, currentFlowFrame?.variables, engine || undefined);
  logger.info(`SAY step executed (non-blocking): "${interpolated}"`);
  
  // Add assistant message to context stack
  addToContextStack(contextStack, 'assistant', interpolated, step.id);
  
  // Use global accumulation when engine is available
  if (engine && typeof engine.addAccumulatedMessage === 'function') {
    engine.addAccumulatedMessage(interpolated);
    logger.info(`SAY message globally accumulated.`);
  } else {
    // This case should ideally not happen in the main engine, but is a fallback.
    logger.warn(`Engine not available for SAY step. Message may be lost: "${interpolated}"`);
  }
  
  // Non-blocking: return null to continue processing next step
  return null;
}

// SAY-GET step: outputs all accumulated messages + waits for user input
function handleSayGetStep(currentFlowFrame: FlowFrame, engine: Engine): string {
  // IMPORTANT: Don't pop the step yet! We need to defer the pop until after user input is processed
  // This prevents the SAY-GET step from being lost during flow interruption/resumption
  const step = currentFlowFrame.flowStepsStack[currentFlowFrame.flowStepsStack.length - 1]; // Peek at step without popping
  const contextStack = currentFlowFrame.contextStack;
  
  const lang = engine?.language;
  const message = (lang && step[`value_${lang}`]) || step.value || '';
  const interpolated = interpolateMessage(String(message), contextStack, currentFlowFrame?.variables, engine || undefined);
  logger.info(`SAY-GET step executed (blocking): "${interpolated}"`);
  
  // Combine accumulated messages with current message
  let finalMessage = interpolated;
  
  // Use global accumulated messages (simplified - no local fallback)
  if (engine && typeof engine.hasAccumulatedMessages === 'function' && engine.hasAccumulatedMessages()) {
    const globalMessages = engine.getAndClearAccumulatedMessages!();
    const initMessage = getSystemMessage(engine, 'flow_init', {flowPrompt: getFlowPrompt(engine, currentFlowFrame.flowName)});
    
    // Check if the last global message is the tentative flow_init for this flow
    const hasTentativeFlowInit = globalMessages[globalMessages.length - 1] === initMessage;
    
    if (hasTentativeFlowInit) {
      // Replace tentative flow_init with SAY messages only (guidance will be added by addFlowContextGuidance)
      if (globalMessages.length > 1) {
        finalMessage = `${globalMessages.slice(0, -1).join('\n\n')}\n\n${interpolated}`;
      } else {
        finalMessage = interpolated; // Only had flow_init, so just use current message
      }
      logger.info(`SAY-GET replaced tentative flow_init with proper guidance handling`);
    } else {
      finalMessage = `${globalMessages.join('\n\n')}\n\n${interpolated}`;
      logger.info(`SAY-GET combined ${globalMessages.length + 1} messages globally`);
    }
  }
  
  // Store the final message for future context pairing
  if (currentFlowFrame) {
    currentFlowFrame.lastSayMessage = finalMessage;
    
    // Add assistant message to context stack
    addToContextStack(contextStack, 'assistant', finalMessage, step.id);
    
    // If this step has a variable attribute, it expects user input to be stored in that variable
    if (step.variable) {
      currentFlowFrame.pendingVariable = step.variable;
      logger.info(`SAY-GET step will store next user input in variable '${step.variable}' (step will be popped after input)`);
      
      // Enhanced user guidance: Add contextual help to SAY-GET messages that expect input
      const contextualMessage = addFlowContextGuidance(finalMessage, currentFlowFrame, engine);
      currentFlowFrame.lastSayMessage = contextualMessage;
      return contextualMessage;
    } else {
      // No variable to collect, pop the step now
      currentFlowFrame.flowStepsStack.pop();
    }
  }
  
  return finalMessage;
}

// Add contextual guidance to SAY messages when user input is expected
function addFlowContextGuidance(message: string, flowFrame: FlowFrame, engine?: Engine | null): string {
  // Check if guidance is disabled
  if (!engine?.guidanceConfig?.enabled) {
    return message;
  }

  // Check if this flow frame was just resumed - if so, skip regular guidance since
  // consolidated resumption guidance was already provided
  if (flowFrame.justResumed === true) {
    flowFrame.justResumed = false; // Clear the flag after first use
    return message;
  }

  const config = engine.guidanceConfig;
  
  // Use root flow name for guidance context (first flow in stack)
  const currentStack = getCurrentStack(engine);
  const rootFlow = currentStack && currentStack.length > 0 ? currentStack[0] : null;
  const flowName = rootFlow?.flowName || flowFrame.flowName; // Fallback to current if no root
  
  // Determine context type
  let contextType: 'general' | 'payment';
  if (config.contextSelector === 'auto') {
    const isFinancialFlow = flowName.toLowerCase().includes('payment') || 
                           flowName.toLowerCase().includes('transfer') ||
                           flowName.toLowerCase().includes('financial');
    contextType = isFinancialFlow ? 'payment' : 'general';
  } else {
    contextType = config.contextSelector || 'general';
  }
  
  let guidance = '';
  
  // Get guidance message
  if (config.guidanceMessages) {
    // Check if it's multi-language format (has language keys like 'en', 'es')
    const language = engine?.language || 'en';
    
    // Check if guidanceMessages has language properties (multi-language format)
    if (typeof config.guidanceMessages === 'object' && 
        (config.guidanceMessages as any)[language] && 
        typeof (config.guidanceMessages as any)[language] === 'object') {
      // Multi-language format: { en: { general: "...", payment: "..." }, es: { ... } }
      const languageMessages = (config.guidanceMessages as MessageRegistry)[language];
      guidance = languageMessages?.[contextType] || '';
    } else if (typeof config.guidanceMessages === 'object' && 
               (config.guidanceMessages as any)[contextType] && 
               typeof (config.guidanceMessages as any)[contextType] === 'string') {
      // Single-language format: { general: "...", payment: "..." }
      guidance = (config.guidanceMessages as any)[contextType];
    }
  }
  
  // Fallback to centralized messaging system if no custom guidance found
  if (!guidance && engine) {
    // Use centralized messaging system
    const messageId = contextType === 'payment' ? 'flow_help_payment' : 'flow_help_general';
    guidance = getSystemMessage(engine, messageId, { 
      flowName,
      flowPrompt: getFlowPrompt(engine, flowName)
    });
  } else if (!guidance) {
    // Fallback to hardcoded messages if engine not available
    if (contextType === 'payment') {
      guidance = "Type 'cancel' or 'help' for options.";
    } else {
      guidance = "Type 'cancel' or 'help' for options.";
    }
  }
  
  // Apply template interpolation to guidance if needed
  if (guidance.includes('{{')) {
    guidance = guidance.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const context: any = { 
        flowName, 
        flowPrompt: getFlowPrompt(engine, flowName),
        message 
      };
      return context[key] || match;
    });
  }
  
  // Apply integration mode
  switch (config.mode) {
    case 'none':
      return message;
      
    case 'prepend':
      const separator = config.separator || '\n\n';
      return guidance + separator + message;
      
    case 'append':
      const appendSeparator = config.separator || '\n\n';
      return message + appendSeparator + guidance;
      
    case 'template':
      if (config.template) {
        return config.template
          .replace(/\{\{message\}\}/g, message)
          .replace(/\{\{guidance\}\}/g, guidance)
          .replace(/\{\{flowName\}\}/g, flowName);
      }
      // Fall through to append if no template provided
      
    default:
      const defaultSeparator = config.separator || '\n\n';
      return message + defaultSeparator + guidance;
  }
}

function handleSetStep(currentFlowFrame: FlowFrame, engine?: Engine): string {
  // Extract what we need from the currentFlowFrame
  const step = currentFlowFrame.flowStepsStack.pop()!; // This handler pops its own step
  
  if (!step.variable || step.value === undefined) {
    throw new Error(`SET step requires both 'variable' and 'value' attributes`);
  }
  
  // Support interpolation in SET values
  const interpolatedValue = typeof step.value === 'string' 
    ? interpolateMessage(step.value, [], currentFlowFrame?.variables, engine)
    : step.value;
  
  if (currentFlowFrame && currentFlowFrame.variables !== undefined) {
    currentFlowFrame.variables[step.variable] = interpolatedValue;
    logger.info(`SET step: stored '${interpolatedValue}' in variable '${step.variable}'`);
  }
  
  return `Variable '${step.variable}' set to '${interpolatedValue}'`;
}

async function handleSwitchStep(currentFlowFrame: FlowFrame, engine: Engine): Promise<string> {
  // Extract what we need from the currentFlowFrame
  const step = currentFlowFrame.flowStepsStack.pop()!; // This handler pops its own step
  
  if (!step.variable || !step.branches) {
    throw new Error(`SWITCH step requires both 'variable' and 'branches' attributes`);
  }
  
  // Get the variable value to switch on
  const switchValue = currentFlowFrame.variables ? currentFlowFrame.variables[step.variable] : undefined;
  
  logger.info(`SWITCH step: evaluating variable '${step.variable}' with value '${switchValue}'`);
  
  // Find the matching branch (exact value matching only)
  let selectedStep: FlowStep | null = null;
  let selectedBranch: string | null = null;
  
  // SWITCH now only supports exact value matching for optimal performance
  // For conditional logic, use the CASE step instead
  if (switchValue !== undefined && typeof switchValue === 'string' && step.branches[switchValue]) {
    selectedStep = step.branches[switchValue];
    selectedBranch = String(switchValue);
    logger.info(`SWITCH: selected exact match branch '${switchValue}'`);
  }
  
  // If no exact match found, use default
  if (!selectedStep && step.branches.default) {
    selectedStep = step.branches.default;
    selectedBranch = 'default';
    logger.info(`SWITCH: using default branch (no exact match for '${switchValue}')`);
  }
  
  // If still no match, throw error
  if (!selectedStep) {
    const errorMessage = getSystemMessage(engine, 'switch_no_branch_found', { switchValue });
    throw new Error(errorMessage);
  }

  // SWITCH branches must contain exactly ONE step, not arrays
  // If multiple steps are needed, use a FLOW step that references a sub-flow
  logger.info(`SWITCH: executing step ${selectedStep.id || selectedStep.type} in branch '${selectedBranch}'`);
  
  // Add the branch step to the current flow frame's stack
  // This integrates properly with the playFlowFrame architecture
  currentFlowFrame.flowStepsStack.push(selectedStep);
  
  logger.info(`SWITCH: added branch step to stack. currentFlowFrame.flowStepsStack.length: ${currentFlowFrame.flowStepsStack.length}`);
  
  // Return message indicating which branch was selected
  return `SWITCH executed branch '${selectedBranch}', added step '${selectedStep.id || selectedStep.type}' to flow`;
}

async function handleCaseStep(currentFlowFrame: FlowFrame, engine: Engine): Promise<string> {
  // Extract what we need from the currentFlowFrame
  const step = currentFlowFrame.flowStepsStack.pop()!; // This handler pops its own step
  
  if (!step.branches) {
    throw new Error(`CASE step requires 'branches' attribute`);
  }
  
  logger.info(`CASE step: evaluating conditions`);
  
  // Find the matching branch by evaluating conditions
  let selectedStep: FlowStep | null = null;
  let selectedBranch: string | null = null;
  
  // Try condition-based matching (CASE only supports conditions, no variable matching)
  for (const [branchKey, branchStep] of Object.entries(step.branches)) {
    if (branchKey === 'default') continue; // Skip default, handle later
    
    // Check if this is a condition branch
    if (branchKey.startsWith('condition:')) {
      const condition = branchKey.slice(10); // Remove 'condition:' prefix
      logger.info(`CASE: evaluating condition '${condition}'`);
      
      try {
        // Evaluate the condition expression
        const conditionResult = evaluateSafeCondition(condition, currentFlowFrame.variables || {});
        logger.info(`CASE: condition '${condition}' evaluated to: ${conditionResult}`);
        
        if (conditionResult) {
          selectedStep = branchStep;
          selectedBranch = branchKey;
          logger.info(`CASE: selected condition branch '${branchKey}'`);
          break;
        }
      } catch (error: any) {
        logger.warn(`CASE: condition evaluation failed for '${condition}':`, error.message);
        continue; // Try next condition
      }
    } else {
      // CASE step only supports condition branches, warn about invalid branches
      logger.warn(`CASE: ignoring non-condition branch '${branchKey}' - CASE step only supports 'condition:' branches and 'default'`);
    }
  }
  
  // If no match found, use default
  if (!selectedStep && step.branches.default) {
    selectedStep = step.branches.default;
    selectedBranch = 'default';
    logger.info(`CASE: using default branch (no conditions matched)`);
  }
  
  // If still no match, throw error
  if (!selectedStep) {
    throw new Error(`CASE step: no conditions matched and no default branch provided`);
  }

  // CASE branches must contain exactly ONE step, not arrays
  // If multiple steps are needed, use a FLOW step that references a sub-flow
  logger.info(`CASE: executing step ${selectedStep.id || selectedStep.type} in branch '${selectedBranch}'`);
  
  // Add the branch step to the current flow frame's stack
  // This integrates properly with the playFlowFrame architecture
  currentFlowFrame.flowStepsStack.push(selectedStep);
  
  logger.info(`CASE: added branch step to stack. currentFlowFrame.flowStepsStack.length: ${currentFlowFrame.flowStepsStack.length}`);
  
  // Return message indicating which branch was selected
  return `CASE executed branch '${selectedBranch}', added step '${selectedStep.id || selectedStep.type}' to flow`;
}

async function handleSubFlowStep(currentFlowFrame: FlowFrame, engine: Engine): Promise<string> {
   try {
      logger.info(`Handling sub-flow step in flow: ${currentFlowFrame.flowName}`);

      // Extract what we need from the currentFlowFrame
      const step = currentFlowFrame.flowStepsStack.pop()!; // This handler pops its own step
      const input = currentFlowFrame.inputStack[currentFlowFrame.inputStack.length - 1];
      const flowsMenu = engine.flowsMenu; // Access the global flows menu
      
      const subFlowName = step.value || step.name || step.nextFlow;
      const subFlow = flowsMenu?.find(f => f.name === subFlowName);
      
      if (!subFlow) {
         return getSystemMessage(engine, 'subflow_not_found', { subFlowName });
      }
      
      const callType = step.callType || "call"; // Default to normal sub-flow call
      
      logger.info(`Starting sub-flow ${subFlow.name} with callType: ${callType}, input: ${input}`);
      
      if (callType === "reboot") {
         // Clear all flows and start fresh
         logger.info(`Rebooting with flow: ${subFlow.name}`);
         
         // Clean up all existing flows
         while (getCurrentStackLength(engine) > 0) {
            const flow = popFromCurrentStack(engine)!;
            flow.transaction.fail(`Rebooted to flow ${subFlow.name}`);
         }
         
         // Reset to empty stacks
         // flowStacks = [[]];
         // We must keep same reference to allow proper stack switching
         initializeFlowStacks(engine);
         
         // Start the sub-flow as a new root flow
         const transaction = new FlowTransaction(subFlow.name, 'reboot', currentFlowFrame.userId);

         /* TODO: REVIEW if needed
         // Prepare tentative flow_init message
         const tentativeFlowInit = getSystemMessage(engine, 'flow_init', { 
           flowName: subFlow.name,
           flowPrompt: getFlowPrompt(engine, subFlow.name)
         });
         engine?.addAccumulatedMessage!(tentativeFlowInit);
         */
         
         pushToCurrentStack(engine, {
            flowName: subFlow.name,
            flowId: subFlow.id,
            flowVersion: subFlow.version,
            flowStepsStack: [...subFlow.steps].reverse(),
            contextStack: [{ role: 'user', content: input, timestamp: Date.now() }],
            inputStack: [input],
            variables: getInitialVariables(engine, subFlow), // Fresh variables for reboot flow
            transaction,
            userId: currentFlowFrame.userId,
            startTime: Date.now()
         });
         
         auditLogger.logFlowStart(subFlow.name, input, currentFlowFrame.userId, transaction.id);
         return `System rebooted to flow ${subFlow.name}`;
         
      } else if (callType === "replace") {
         // Replace current flow's steps with the sub-flow's steps
         logger.info(`Replacing current flow ${currentFlowFrame.flowName} with ${subFlow.name}`);
         logger.debug(`Current flowStepsStack length before replace: ${currentFlowFrame.flowStepsStack.length}`);
         
         // Update current frame to become the new flow
         currentFlowFrame.flowName = subFlow.name;
         currentFlowFrame.flowId = subFlow.id;
         currentFlowFrame.flowVersion = subFlow.version;
         currentFlowFrame.flowStepsStack = [...subFlow.steps].reverse();
         addToContextStack(currentFlowFrame.contextStack, 'user', input);
         currentFlowFrame.inputStack.push(input);
         
         // Update transaction
         currentFlowFrame.transaction.fail(`Replaced by flow ${subFlow.name}`);
         currentFlowFrame.transaction = new FlowTransaction(subFlow.name, 'replacement', currentFlowFrame.userId);
         
         auditLogger.logFlowStart(subFlow.name, input, currentFlowFrame.userId, currentFlowFrame.transaction.id);
         logger.debug(`About to return from handleSubFlowStep replacement, flowStepsStack length: ${currentFlowFrame.flowStepsStack.length}`);
         return `Flow replaced with ${subFlow.name}`;
         
      } else { // callType === "call" (default)
         // Normal sub-flow call - create new transaction for sub-flow
         const subTransaction = new FlowTransaction(subFlow.name, 'sub-flow', currentFlowFrame.userId);

         /* TODO: REVIEW if needed
         // Prepare tentative flow_init message
         const tentativeFlowInit = getSystemMessage(engine, 'flow_init', { 
           flowName: subFlow.name,
           flowPrompt: getFlowPrompt(engine, subFlow.name)
         });
         engine?.addAccumulatedMessage!(tentativeFlowInit);
         */

         // Push sub-flow onto stack - INHERIT parent's variables for unified scope
         pushToCurrentStack(engine, {
            flowName: subFlow.name,
            flowId: subFlow.id,
            flowVersion: subFlow.version,
            flowStepsStack: [...subFlow.steps].reverse(),
            contextStack: [{ role: 'user', content: input, timestamp: Date.now() }],
            inputStack: [input],
            variables: getInitialVariables(engine, subFlow, currentFlowFrame.variables), // Inherit + merge flow definition variables
            transaction: subTransaction,
            userId: currentFlowFrame.userId,
            startTime: Date.now(),
            parentTransaction: currentFlowFrame.transaction.id
         });
         
         auditLogger.logFlowStart(subFlow.name, input, currentFlowFrame.userId, subTransaction.id);
         
         // Sub-flow has been pushed to stack - let playFlowFrame's loop handle it
         logger.info(`Sub-flow ${subFlow.name} pushed to stack, will be processed by main loop`);
         return `Sub-flow ${subFlow.name} started`;
      }
   } catch (error: any) {
      logger.error(`Error handling sub-flow step: ${error.message}`);
      logger.info(`Stack trace: ${error.stack}`);
      throw new Error(`Failed to handle sub-flow step: ${error.message}`);
   }
}

// === TOOL CALLING AND ARGUMENT GENERATION SYSTEM ===
async function generateToolCallAndResponse(
  engine: Engine, 
  toolName: string, 
  input: unknown, 
  contextStack: ContextEntry[] = [], 
  userId: string = 'anonymous', 
  transactionId: string | null = null, 
  flowFrame: FlowFrame | null = null, 
  explicitArgs?: Record<string, unknown>
): Promise<unknown> {
   try {
      const toolsRegistry = engine.toolsRegistry;
      if (!toolsRegistry) {
         throw new Error('Tools registry not found in engine');
      }
      const tool = toolsRegistry.find((t: any) => t.id === toolName);
      if (!tool) {
         throw new Error(`Tool ${toolName} not found in registry`);
      }

      // Use explicit args if provided, otherwise generate them
      let rawArgs: any;
      if (explicitArgs && Object.keys(explicitArgs).length > 0) {
         logger.info('Using explicit args from step definition:', explicitArgs);
         rawArgs = explicitArgs;
      } else {
         // Generate and validate arguments with conversation context
         rawArgs = await generateToolArgs(tool.schema || tool.parameters, input, contextStack, flowFrame, engine);
      }
      
      // === TEMPLATE INTERPOLATION FOR ARGS ===
      // Interpolate {{variable}} templates in the args using current flow variables
      if (flowFrame && rawArgs && typeof rawArgs === 'object') {
         try {
            const variables = flowFrame.variables || {};
            const contextStack = flowFrame.contextStack || [];
            
            logger.debug(`Interpolating args templates:`, rawArgs);
            logger.debug(`Available variables:`, variables);
            
            rawArgs = interpolateObject(rawArgs, variables, variables);
            logger.debug(`Interpolated args:`, rawArgs);
         } catch (error: any) {
            logger.warn(`Failed to interpolate args templates: ${error.message}`);
            // Continue with original args if interpolation fails
         }
      }
      
      const validatedArgs = validateToolArgs(tool, rawArgs);
      
      return await callTool(engine, tool, validatedArgs, userId, transactionId);
   } catch (error: any) {
      logger.warn(`Error generating tool call for ${toolName}: ${error.message}`);
      throw new Error(`Failed to generate tool call for ${toolName}: ${error.message}`);
   }
}

async function generateToolArgs(schema: any, input: any, contextStack: ContextEntry[] = [], flowFrame: FlowFrame | null = null, engine: Engine): Promise<any> {
   try {
      if (!schema || typeof schema !== 'object') {
         logger.warn(`Invalid schema provided for argument generation: ${schema}`);
         return {};
      }

      logger.info(`Generating tool arguments for schema: ${schema.name || schema.title || 'unknown'}`);

      if (typeof input === 'object') {
         logger.warn(`Using input object directly for args:`, input);
         return input;
      }
      
      logger.info(`Generating args for schema with input: "${input}"`);
      
      if (schema && schema.properties && Object.keys(schema.properties).length > 0) {
         const args = generateEnhancedFallbackArgs(schema, input, flowFrame);
         logger.info(`Generated args:`, args);
         
         if (Object.keys(args).length > 0) {
            return args;
         }
         
         // Fallback to AI argument generation
         logger.info('Enhanced fallback failed, trying AI argument generation...');
         try {
            const aiArgs = await generateArgsWithAI(schema, input, contextStack, flowFrame, engine);
            if (Object.keys(aiArgs).length > 0) {
            logger.info('AI argument generation succeeded:', aiArgs);
            return aiArgs;
            }
         } catch (error: any) {
            logger.warn('AI argument generation failed:', error.message);
         }    
      }
      
      // Final fallback to generic mapping
      return { userInput: input };
   } catch (error: any) {
      logger.error(`Error generating tool arguments: ${error.message}`);
      logger.info(`Stack trace: ${error.stack}`);
      throw new Error(`Failed to generate tool arguments: ${error.message}`);
   }
}

async function generateArgsWithAI(schema: any, input: any, contextStack: ContextEntry[], flowFrame: FlowFrame | null = null, engine: Engine): Promise<any> {
  const properties = schema.properties || {};
  const required = schema.required || [];
  
  const schemaDescription = Object.entries(properties)
    .map(([key, prop]: [string, any]) => {
      const req = required.includes(key) ? ' (required)' : ' (optional)';
      const desc = prop.description || '';
      const pattern = prop.pattern ? ` Pattern: ${prop.pattern}` : '';
      const range = prop.minimum !== undefined && prop.maximum !== undefined 
        ? ` Range: ${prop.minimum}-${prop.maximum}` : '';
      return `${key}: ${prop.type}${req} - ${desc}${pattern}${range}`;
    })
    .join('\n');

  // Build variables context for intelligent argument generation
  let variablesContext = '';
  if (flowFrame && flowFrame.variables && Object.keys(flowFrame.variables).length > 0) {
    variablesContext = '<variables-context>:\n' + 
      Object.entries(flowFrame.variables)
        .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
        .join('\n');

        variablesContext += '\n</variables-context>';
  }
  
  // Use the enhanced fetchAiTask worker with JSON schema
  const task = "You are a tool argument generator. Extract arguments from the current context based on the schema.";
  
  const rules = `Instructions:
1. PRIORITIZE available variables - use them to auto-fill required parameters
2. Extract remaining fields from the current context data
3. Return ONLY a valid JSON object with the schema fields
4. If a required field cannot be determined, use reasonable defaults or null

Variable Usage Priority:
- accountNumber: Use variables like "accountNumber", "accountInfo.accountId", etc.
- amount: Use variables like "amount", "paymentAmount", etc.
- Other fields: Check for exact variable name matches first

Context Extraction Examples:
- For accountNumber: extract numbers from context like "my account is 123456" → "123456"
- For amount: extract currency amounts like "$50.00" or "50 dollars" → 50.00  
- For city: use location names directly like "London" → "London"`;

  // Flatten the chat context for AI processing using enhanced role-aware formatting
  let chatContext = '';
  if (contextStack && contextStack.length > 0) {
    // Use the new enhanced flattening with role information
    chatContext = flattenContextStack(contextStack, true);
  } else {
    chatContext = 'No previous context available';
  }
  
  // Wrap the chat context for AI processing
  chatContext = '<chat-context>:\n' + 
    chatContext + '\n' +
  '</chat-context>';

  const context = variablesContext || 'No variables available';

  try {    
    const aiResponse = await fetchAiTask(task, rules, context, String(input), [], schemaDescription, engine.aiCallback);
    
    // When we expect JSON args, the response should be parsed as an object
    const args = typeof aiResponse === 'string' ? JSON.parse(aiResponse) : aiResponse;
    
    // Type coercion and validation
    const validatedArgs: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(properties) as [string, PropertySchema][]) {
      if (args && typeof args === 'object' && key in args) {
        const argValue = (args as Record<string, unknown>)[key];
        if (argValue !== undefined && argValue !== null) {
          if (prop.type === 'number' && typeof argValue === 'string') {
            const num = parseFloat(argValue);
            if (!isNaN(num)) {
              validatedArgs[key] = num;
            }
          } else if (prop.type === 'string') {
            validatedArgs[key] = String(argValue);
          } else if (typeof argValue === prop.type) {
            validatedArgs[key] = argValue;
          }
        }
      }
    }
    
    return validatedArgs;
  } catch (error: any) {
    logger.warn(`Error in AI argument generation: ${error.message}`);
    logger.info(`Stack trace: ${error.stack}`);
    return {}; // Return empty object on failure
  }
}

// Enhanced pattern-based fallback that uses variables and input parsing
function generateEnhancedFallbackArgs(schema: any, input: any, flowFrame: FlowFrame | null = null): any {
  const properties = schema.properties || {};
  const required = schema.required || [];
  const args: any = {};
  
  // First priority - try to extract from unified variables
  if (flowFrame && flowFrame.variables && Object.keys(flowFrame.variables).length > 0) {
    for (const [key, prop] of Object.entries(properties) as [string, any][]) {
      if (args[key]) continue; // Already found this property
      
      // Direct variable match
      if (flowFrame.variables[key] !== undefined) {
        let value = flowFrame.variables[key];
        // Type conversion if needed
        if (prop.type === 'number' && typeof value === 'string') {
          const num = parseFloat(value);
          if (!isNaN(num)) {
            value = num;
          }
        }
        args[key] = value;
        continue;
      }
      
      // Smart matching for account numbers
      if (key.includes('account')) {
        const accountVar = Object.keys(flowFrame.variables).find(varName => 
          varName.includes('account') || (
            typeof flowFrame.variables[varName] === 'object' && 
            flowFrame.variables[varName] !== null &&
            (flowFrame.variables[varName] as Record<string, unknown>)?.accountId
          )
        );
        if (accountVar) {
          const accountData = flowFrame.variables[accountVar];
          if (typeof accountData === 'object' && accountData !== null && 'accountId' in accountData) {
            args[key] = (accountData as Record<string, unknown>).accountId;
          } else if (typeof accountData === 'string') {
            args[key] = accountData;
          }
        }
      }
      
      // Smart matching for amounts
      if (key.includes('amount')) {
        const amountVar = Object.keys(flowFrame.variables).find(varName => 
          varName.includes('amount') || varName.includes('payment')
        );
        if (amountVar) {
          const amountData = flowFrame.variables[amountVar];
          if (typeof amountData === 'number') {
            args[key] = amountData;
          } else if (typeof amountData === 'string') {
            const num = parseFloat(amountData);
            if (!isNaN(num)) {
              args[key] = num;
            }
          }
        }
      }
    }
  }
  
  // If enhanced fallback didn't find anything useful, try simple pattern matching
  if (Object.keys(args).length === 0) {
    const simpleArgs = generateSimpleFallbackArgs(schema, input);
    Object.assign(args, simpleArgs);
  }
    
  logger.info(`Enhanced fallback generated args:`, args);
  return args;
}

// Simple pattern-based fallback for common cases
function generateSimpleFallbackArgs(schema: any, input: any): any {
  const properties = schema.properties || {};
  const required = schema.required || [];
  const args: any = {};
  
  // Look for common patterns
  for (const [key, prop] of Object.entries(properties) as [string, any][]) {
    if (prop.type === 'string') {
      // For city/location queries
      if (key === 'q' || key.includes('city') || key.includes('location')) {
        args[key] = String(input).trim();
        break;
      }
      // For account numbers
      if (key.includes('account') && /^\d+$/.test(input.trim())) {
        args[key] = input.trim();
        break;
      }
    } else if (prop.type === 'number') {
      // For amounts
      if (key.includes('amount') || key.includes('price')) {
        const match = input.match(/[\d.]+/);
        if (match) {
          const num = parseFloat(match[0]);
          if (!isNaN(num)) {
            args[key] = num;
            break;
          }
        }
      }
    }
  }
  
  // If no specific pattern matched, use the first required property
  if (Object.keys(args).length === 0 && required.length > 0) {
    const firstRequired = required[0];
    const prop = properties[firstRequired];
    if (prop.type === 'string') {
      args[firstRequired] = String(input).trim();
    }
  }
  
  return args;
}

async function callTool(engine: Engine, tool: any, args: any, userId: string = 'anonymous', transactionId: string | null = null): Promise<any> {
   try {
      logger.info(`Calling tool ${tool.name} with args:`, args);

      const APPROVED_FUNCTIONS = engine.APPROVED_FUNCTIONS;
      // === SECURE LOCAL FUNCTION MODE ===
      if (tool.implementation?.type === 'local' && tool.implementation?.function) {
         if (!APPROVED_FUNCTIONS) {
            throw new Error(`Approved functions registry not available`);
         }
         const fn = APPROVED_FUNCTIONS.get(tool.implementation.function);
         if (!fn) {
            throw new Error(`Function "${tool.implementation.function}" not found in approved functions registry`);
         }
         
         // Apply timeout if configured
         const timeout = tool.implementation.timeout || 5000;
         const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Tool execution timeout after ${timeout}ms`)), timeout)
         );
         
         try {
            const result = await Promise.race([fn(args), timeoutPromise]);
            return result;
         } catch (error: any) {
            // Unconditional Retry logic for local functions
            const retries = tool.implementation.retries || 0;
            if (retries > 0) {
              logger.info(`Retrying tool ${tool.name}, attempts remaining: ${retries}`);
              const retryTool = { ...tool, implementation: { ...tool.implementation, retries: retries - 1 } };
              return await callTool(engine, retryTool, args, userId, transactionId);
            }
            throw error;
         }
      }

      // === ENHANCED HTTP TOOL CALL MODE ===
      return await callHttpTool(tool, args, userId, transactionId, engine);
   } catch (error: any) {
      logger.warn(`Error calling tool ${tool.name}: ${error.message}`);
      logger.info(`Stack trace: ${error.stack}`);
      throw new Error(`Failed to call tool ${tool.name}: ${error.message}`);
   }
}

async function callHttpTool(tool: any, args: any, userId: string = 'anonymous', transactionId: string | null = null, engine?: Engine): Promise<any> {
   try {
      logger.info(`Calling HTTP tool ${tool.name} with args: ${JSON.stringify(args)}`);

      const implementation = tool.implementation;
      
      // === MOCK RESPONSE SUPPORT FOR TESTING ===
      if (implementation.type === 'mock' && implementation.mockResponse) {
         logger.info(`[MOCK] Simulating HTTP call for tool ${tool.name}`);
         
         // Simulate API delay
         await new Promise(resolve => setTimeout(resolve, 100));
         
         let mockData = implementation.mockResponse;
         
         // Handle conditional mock responses based on args
         if (args.testType && typeof mockData === 'object' && mockData[args.testType]) {
            mockData = mockData[args.testType];
         }
         
         // Apply response mapping if configured
         if (implementation.responseMapping) {
            try {
            const mappedResult = applyResponseMapping(mockData, implementation.responseMapping, args);
            logger.info(`[MOCK] Response mapping applied for ${tool.name}`);
            return mappedResult;
            } catch (error: any) {
            logger.error(`[MOCK] Response mapping failed for ${tool.name}:`, error.message);
            return mockData; // Fallback to raw mock data
            }
         }
         
         return mockData;
      }
      
      const method = (tool.method || implementation.method || 'POST').toUpperCase();
      let baseUrl = implementation.url || tool.url;
      
      if (!baseUrl) {
         throw new Error(`No URL specified for HTTP tool ${tool.name}`);
      }

      // === TEMPLATE INTERPOLATION FOR URL ===
      // Interpolate {{variable}} templates in the URL using current flow variables
      if (engine && baseUrl.includes('{{')) {
         try {
            const currentFlowFrame = getCurrentFlowFrame(engine);
            const variables = currentFlowFrame?.variables || {};
            const contextStack = currentFlowFrame?.contextStack || [];
            
            logger.debug(`Interpolating URL template: ${baseUrl}`);
            logger.debug(`Available variables:`, variables);
            
            baseUrl = interpolateMessage(baseUrl, contextStack, variables, engine);
            logger.debug(`Interpolated URL: ${baseUrl}`);
         } catch (error: any) {
            logger.warn(`Failed to interpolate URL template: ${error.message}`);
            // Continue with original URL if interpolation fails
         }
      }

      // === COMPREHENSIVE HEADER HANDLING ===
      const headers: Record<string, string> = { 
         'User-Agent': implementation.userAgent || 'WorkflowEngine/1.0',
         ...implementation.defaultHeaders || {}
      };

      // Content-Type handling based on data format
      const contentType = implementation.contentType || 'application/json';
      if (method !== 'GET' && method !== 'HEAD') {
         headers['Content-Type'] = contentType;
      }

      // === AUTHENTICATION HANDLING ===
      // Bearer Token Authentication
      if (tool.apiKey) {
         headers['Authorization'] = `Bearer ${tool.apiKey}`;
      }
      
      // Basic Authentication
      if (implementation.basicAuth) {
         const credentials = btoa(`${implementation.basicAuth.username}:${implementation.basicAuth.password}`);
         headers['Authorization'] = `Basic ${credentials}`;
      }
      
      // API Key in Header
      if (implementation.apiKeyHeader) {
         headers[implementation.apiKeyHeader.name] = implementation.apiKeyHeader.value;
      }
      
      // Custom Headers
      if (implementation.headers) {
         Object.assign(headers, implementation.headers);
      }

      // === HMAC/HASH AUTHENTICATION ===
      if (tool.hashAuth || implementation.hashAuth) {
         const hashConfig = tool.hashAuth || implementation.hashAuth;
         const hash = generateHash(hashConfig, args);
         
         if (hashConfig.location === 'header') {
            headers[hashConfig.keyName] = hash;
         } else {
            args[hashConfig.keyName] = hash;
         }
      }

      // === URL CONSTRUCTION WITH PATH PARAMETERS ===
      let finalUrl = baseUrl;

      // We may need another pass later
      const argsCopy = { ...args }; // Copy args for request body
      const mappingArgs = { ...args }; // Preserve original args for response mapping

      // Handle path parameters (e.g., /users/{userId}/posts/{postId})
      if (finalUrl.includes('{')) {
        logger.info(`Processing path parameters in URL: ${finalUrl}`);
        const pathParams = implementation.pathParams || [];
        pathParams.forEach((paramName: string) => {
          logger.debug(`Checking path parameter: ${paramName}`);
          if (args[paramName] !== undefined) {
            finalUrl = finalUrl.replace(`{${paramName}}`, encodeURIComponent(args[paramName]));
            delete args[paramName]; // Remove from body/query params
            logger.debug(`Resolved path parameter: ${paramName} = ${finalUrl}`);
          } else {
            logger.warn(`Missing path parameter: ${paramName}`);
          }
        });
        
        // Handle any remaining placeholders in URL
        finalUrl = finalUrl.replace(/\{([^}]+)\}/g, function(match: string, paramName: string): string {
          if (args[paramName] !== undefined) {
            const value = args[paramName];
            delete args[paramName];
            return encodeURIComponent(value);
          }
          throw new Error(`Missing required path parameter: ${paramName}`);
        });
      }

      // === QUERY PARAMETERS ===
      const queryParams = new URLSearchParams();
      
      // Handle different parameter placement strategies
      if (method === 'GET' || method === 'HEAD' || implementation.useQueryParams) {
         // For GET requests or when explicitly specified, all args go to query params
         Object.entries(args).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              if (Array.isArray(value)) {
                // Handle array parameters (e.g., tags=red&tags=blue or tags=red,blue)
                if (implementation.arrayFormat === 'comma') {
                    queryParams.append(key, value.join(','));
                } else {
                    value.forEach((v: any) => queryParams.append(key, v));
                }
              } else {
                queryParams.append(key, String(value));
              }
            }
         });
         
         // Add query params to URL
         if (queryParams.toString()) {
            finalUrl += (finalUrl.includes('?') ? '&' : '?') + queryParams.toString();
         }
      } else {
         // For POST/PUT/PATCH, some params might still go to query string
         if (implementation.queryParams) {
            implementation.queryParams.forEach((paramName: string) => {
            if (args[paramName] !== undefined) {
               queryParams.append(paramName, String(args[paramName]));
               delete args[paramName];
            }
            });
            
            if (queryParams.toString()) {
              finalUrl += (finalUrl.includes('?') ? '&' : '?') + queryParams.toString();
            }
         }
      }
      logger.info(`After query parameter processing, final URL is: ${finalUrl}`);

      // === REQUEST BODY CONSTRUCTION ===
      let requestBody: any;
      
      if (method !== 'GET' && method !== 'HEAD' && Object.keys(args).length > 0) {
         switch (contentType.toLowerCase()) {
            case 'application/json':
            requestBody = JSON.stringify(args);
            break;
            
            case 'application/x-www-form-urlencoded':
            const formData = new URLSearchParams();
            Object.entries(args).forEach(([key, value]) => {
               if (value !== undefined && value !== null) {
                  formData.append(key, String(value));
               }
            });
            requestBody = formData.toString();
            break;
            
            case 'multipart/form-data':
            const formDataMultipart = new FormData();
            Object.entries(args).forEach(([key, value]) => {
               if (value !== undefined && value !== null) {
                  if (value instanceof File || value instanceof Blob) {
                     formDataMultipart.append(key, value);
                  } else {
                     formDataMultipart.append(key, String(value));
                  }
               }
            });
            requestBody = formDataMultipart;
            // Remove Content-Type header to let browser set it with boundary
            delete headers['Content-Type'];
            break;
            
            case 'text/plain':
            case 'text/xml':
            case 'application/xml':
            // For text/XML, assume args contain a 'body' or 'data' field
            requestBody = args.body || args.data || JSON.stringify(args);
            break;
            
            default:
            // Default to JSON for unknown content types
            requestBody = JSON.stringify(args);
         }
      }

      // === ADD CUSTOM QUERY STRING ===
      if (implementation.customQuery) {
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + implementation.customQuery;
        logger.info(`Added custom query string to URL: ${finalUrl}`);
      }

      // Restore args from copy after processing URL
      Object.assign(args, argsCopy);

      // Handle query parameters in URL if they are still present
      if ( finalUrl.includes('{')) {
         logger.info(`Processing query parameters in URL: ${finalUrl}`);

         const pathParams = implementation.pathParams || [];
         pathParams.forEach((paramName: string) => {
            logger.debug(`Checking path parameter: ${paramName}`);
            if (args[paramName] !== undefined) {
              const paramValue = args[paramName];
              finalUrl = finalUrl.replace(`{${paramName}}`, encodeURIComponent(paramValue));
              delete args[paramName]; // Remove from body/query params
              logger.debug(`Resolved path parameter: ${paramName} = ${paramValue}`);
            } else {
              logger.warn(`Missing path parameter: ${paramName}`);
            }
         });
         
         // Handle any remaining placeholders in URL
         finalUrl = finalUrl.replace(/\{([^}]+)\}/g, function(match: string, paramName: string): string {
            if (args[paramName] !== undefined) {
              const value = args[paramName];
              delete args[paramName];
              return encodeURIComponent(value);
            }
            throw new Error(`Missing required path parameter: ${paramName}`);
         });
      } else {
        logger.info(`No query parameters to process in URL: ${finalUrl}`);
      }

      // === EXECUTE REQUEST WITH TIMEOUT AND RETRIES ===
      const timeout = implementation.timeout || 10000;
      const maxRetries = implementation.retries || 0;
      
      // Unconditional retry logic
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
         try {
            logger.info(`HTTP ${method} ${finalUrl} (attempt ${attempt + 1}/${maxRetries + 1})`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            const fetchOptions: RequestInit = {
            method,
            headers,
            signal: controller.signal,
            ...(requestBody && { body: requestBody })
            };
            
            // Remove undefined headers
            Object.keys(fetchOptions.headers as Record<string, any>).forEach(key => {
            if ((fetchOptions.headers as Record<string, any>)[key] === undefined) {
               delete (fetchOptions.headers as Record<string, any>)[key];
            }
            });
            
            const response = await fetch(finalUrl, fetchOptions);
            clearTimeout(timeoutId);
            logger.info(`HTTP ${method} ${finalUrl} completed with status ${response.status}`);

            // === RESPONSE HANDLING ===
            if (!response.ok) {
              const errorText = await response.text();
              const error = new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`) as any;
              error.status = response.status;
              error.statusText = response.statusText;
              error.response = response;
              
              // Don't retry on 4xx client errors (except 429 rate limit)
              if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                throw error;
              }
              
              // Retry on 5xx server errors and 429 rate limit
              if (attempt < maxRetries) {
                const delay = implementation.retryDelay || Math.pow(2, attempt) * 1000; // Exponential backoff
                logger.info(`Retrying after ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
              
              throw error;
            }
            
            // === RESPONSE PARSING ===
            const responseContentType = response.headers.get('content-type') || '';
            
            if (responseContentType.includes('application/json')) {
              const data = await response.json();
              logger.info(`Received JSON response from ${tool.name} Response: ${JSON.stringify(data)}`);

              // Apply declarative response mapping if configured (preferred)
              if (implementation.responseMapping) {
                try {
                    return applyResponseMapping(data, implementation.responseMapping, mappingArgs);
                } catch (error: any) {
                    logger.error(`Response mapping failed:`, error.message);
                    return data; // Fall back to original response
                }
              }
              
              return data;
            } else if (responseContentType.includes('text/')) {
              logger.info(`Received text response from ${tool.name}`);
              return await response.text();
            } else if (responseContentType.includes('application/xml') || responseContentType.includes('text/xml')) {
              logger.info(`Received XML response from ${tool.name} Response: ${await response.text()}`);
              return await response.text(); // Return XML as text for now
            } else {
              logger.info(`Received response from ${tool.name} with content type: ${responseContentType}`);
              // For other content types, try to parse as JSON first, then fallback to text
              try {
                return await response.json();
              } catch {
                return await response.text();
              }
            }
            
         } catch (error: any) {
            if (error.name === 'AbortError') {
            // Create new error with timeout message instead of modifying existing
            const timeoutError = new Error(`Request timeout after ${timeout}ms`);
            timeoutError.name = 'AbortError';
            error = timeoutError;
            }
            
            if (attempt < maxRetries && error.status !== 401 && error.status !== 403) {
            const delay = implementation.retryDelay || Math.pow(2, attempt) * 1000;
            logger.info(`Request failed: ${error.message}. Retrying after ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
            }
            
            throw error;
         }
      }
   } catch (error: any) {
      logger.warn(`Error calling HTTP tool ${tool.name}: ${error.message}`);
      logger.info(`Stack trace: ${error.stack}`);
      throw new Error(`Failed to call HTTP tool ${tool.name}: ${error.message}`);
   }
}

// === AUTH HELPERS ===
function generateHash(hashConfig: any, args: any): string {
   const { secret, fields, algorithm = 'sha256', encoding = 'hex' } = hashConfig;
   
   if (!secret || !fields) {
      throw new Error('Hash authentication requires secret and fields configuration');
   }
   
   // Build the raw string from specified fields
   const raw = fields.map((field: string) => {
      const value = field.split('.').reduce((obj, part) => obj?.[part], args);
      return value ?? '';
   }).join('|');
   
   // Generate hash with specified algorithm
   return crypto.createHmac(algorithm, secret).update(raw).digest(encoding);
}

/**
 * Portable hash/HMAC utility for Node.js and browser/Cloudflare Worker environments.
 * Supports SHA-256 and HMAC-SHA256.
 * Usage: await portableHash('data', 'secret')
 */
export async function portableHash(data: string | Uint8Array, secret?: string, algorithm: string = 'SHA-256', encoding: 'hex' | 'base64' = 'hex'): Promise<string> {
  // Convert string to Uint8Array
  function toBytes(input: string | Uint8Array): Uint8Array {
    if (typeof input === 'string') {
      if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(input);
      } else {
        // Node.js fallback
        // @ts-ignore
        return Buffer.from(input, 'utf8');
      }
    }
    return input;
  }

  // Normalize algorithm for Node.js and Web Crypto
  function normalizeAlgorithm(algo: string): string {
    // Node.js expects e.g. 'sha256', Web Crypto expects 'SHA-256'
    const map: Record<string, string> = {
      'sha256': 'SHA-256',
      'sha-256': 'SHA-256',
      'sha512': 'SHA-512',
      'sha-512': 'SHA-512',
      'sha1': 'SHA-1',
      'sha-1': 'SHA-1',
    };
    const lower = algo.toLowerCase();
    return map[lower] || algo;
  }

  // Node.js crypto
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    // Dynamically require to avoid breaking browser/worker builds
    const nodeCrypto = await import('crypto');
    const nodeAlgo = algorithm.replace('-', '').toLowerCase();
    if (secret) {
      // HMAC
      const hmac = nodeCrypto.createHmac(nodeAlgo, secret);
      hmac.update(toBytes(data));
      return encoding === 'base64' ? hmac.digest('base64') : hmac.digest('hex');
    } else {
      // Hash
      const hash = nodeCrypto.createHash(nodeAlgo);
      hash.update(toBytes(data));
      return encoding === 'base64' ? hash.digest('base64') : hash.digest('hex');
    }
  }

  // Browser/Cloudflare Worker Web Crypto API
  const subtle = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) ? globalThis.crypto.subtle : undefined;
  if (!subtle) throw new Error('No crypto.subtle available in this environment');

  const algo = normalizeAlgorithm(algorithm);
  // Always use Uint8Array backed by ArrayBuffer (not SharedArrayBuffer)
  function toStrictArrayBuffer(input: string | Uint8Array): ArrayBuffer {
    const bytes = toBytes(input);
    // Always copy to a new ArrayBuffer to guarantee ArrayBuffer, not SharedArrayBuffer
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes[i];
    return arr.buffer;
  }
  const keyBuffer: ArrayBuffer | undefined = secret ? toStrictArrayBuffer(secret) : undefined;
  const dataBuffer: ArrayBuffer = toStrictArrayBuffer(data);

  // Helper for base64 encoding
  function arrayBufferToBase64(buf: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    // btoa is available in browsers, but not in all workers; fallback if needed
    if (typeof btoa !== 'undefined') {
      return btoa(binary);
    } else if (typeof Buffer !== 'undefined') {
      // @ts-ignore
      return Buffer.from(bytes).toString('base64');
    } else {
      throw new Error('No base64 encoder available');
    }
  }

  if (secret && keyBuffer) {
    // HMAC
    const key = await subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'HMAC', hash: { name: algo } },
      false,
      ['sign']
    );
    const sig = await subtle.sign('HMAC', key, dataBuffer);
    return encoding === 'base64' ? arrayBufferToBase64(sig) : Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Hash
    const hash = await subtle.digest(algo, dataBuffer);
    return encoding === 'base64' ? arrayBufferToBase64(hash) : Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

// === UTILITIES ===
// ===============================================
// UNIFIED EXPRESSION EVALUATOR
// ===============================================

interface ExpressionOptions {
  securityLevel?: 'strict' | 'standard' | 'permissive';
  allowLogicalOperators?: boolean;
  allowMathOperators?: boolean;
  allowComparisons?: boolean;
  allowTernary?: boolean;
  context?: string; // For logging/debugging
  returnType?: 'string' | 'boolean' | 'auto';
}

// Unified expression evaluator - replaces both evaluateSafeExpression and evaluateSafeCondition
function evaluateExpression(
  expression: string, 
  variables: Record<string, any> = {}, 
  contextStack: ContextEntry[] = [],
  options: ExpressionOptions = {},
  engine?: Engine
): any {
  const opts: Required<ExpressionOptions> = {
    securityLevel: 'standard' as const,
    allowLogicalOperators: true,
    allowMathOperators: true,
    allowComparisons: true,
    allowTernary: true,
    context: 'template',
    returnType: 'auto' as const,
    ...options
  };

  try {
    logger.debug(`Evaluating expression: ${expression} with options: ${JSON.stringify(opts)}`);

    // Security check with configurable level
    if (containsUnsafePatterns(expression, opts)) {
      logger.warn(`Blocked unsafe expression in ${opts.context}: ${expression}`);
      return opts.returnType === 'boolean' ? false : `[blocked: ${expression}]`;
    }
    
    // First, check if this is a comparison or logical expression with template variables
    let processedExpression = expression;
    
    // If it has template variables, interpolate them first
    while (processedExpression.includes('{{') && processedExpression.includes('}}')) {
      processedExpression = interpolateTemplateVariables(processedExpression, variables, contextStack, opts, engine);
    }
    
    // Now check the processed expression for operators (after template interpolation)
    
    // Handle logical AND/OR expressions (if allowed)
    if (opts.allowLogicalOperators && (processedExpression.includes('&&') || processedExpression.includes('||'))) {
      const result = evaluateLogicalExpression(processedExpression, variables, contextStack, opts, engine);
      return convertReturnType(result, opts.returnType);
    }
    
    // Handle comparison expressions (if allowed)
    if (opts.allowComparisons && containsComparisonOperators(processedExpression)) {
      const result = evaluateComparisonExpression(processedExpression, variables, contextStack, opts, engine);
      return convertReturnType(result, opts.returnType);
    }
    
    // Handle ternary expressions (if allowed)
    if (opts.allowTernary && processedExpression.includes('?') && processedExpression.includes(':')) {
      const result = evaluateSafeTernaryExpression(processedExpression, variables, contextStack, engine);
      return convertReturnType(result, opts.returnType);
    }
    
    // Handle mathematical expressions (if allowed)
    if (opts.allowMathOperators && isMathematicalExpression(processedExpression)) {
      const result = evaluateSafeMathematicalExpression(processedExpression, variables, contextStack, engine);
      return convertReturnType(result, opts.returnType);
    }
    
    // Handle simple variable paths (e.g., "user.name", "data.items.length")
    if (isSimpleVariablePath(processedExpression)) {
      const result = resolveSimpleVariable(processedExpression, variables, contextStack, engine);
      return convertReturnType(result, opts.returnType);
    }
    
    // Handle function calls (e.g., "currentTime()", "extractCryptoFromInput(...)")
    if (processedExpression.includes('(') && processedExpression.includes(')')) {
      const result = evaluateFunctionCall(processedExpression, variables, contextStack, engine);
      if (result !== undefined) {
        return convertReturnType(result, opts.returnType);
      }
    }
        
    // If no pattern matches and we had template variables, return the interpolated result
    if (processedExpression !== expression) {
      return convertReturnType(processedExpression, opts.returnType);
    }
    
    // Fallback: treat as literal
    const result = expression;
    return convertReturnType(result, opts.returnType);
    
  } catch (error: any) {
    logger.warn(`Expression evaluation error in ${opts.context}: ${error.message}`);
    return opts.returnType === 'boolean' ? false : `[error: ${expression}]`;
  }
}

// Unified security pattern checking with configurable levels
function containsUnsafePatterns(expression: string, options: ExpressionOptions): boolean {
  const { securityLevel = 'standard', allowLogicalOperators = true, allowComparisons = true } = options;
  
  // Core dangerous patterns (blocked at all levels)
  const coreDangerousPatterns = [
    /\w+\s*\(/,          // Function calls: func(
    /eval\s*\(/,         // eval() calls
    /Function\s*\(/,     // Function constructor
    /constructor/,       // Constructor access
    /prototype/,         // Prototype manipulation  
    /__proto__/,         // Prototype access
    /import\s*\(/,       // Dynamic imports
    /require\s*\(/,      // CommonJS requires
    /process\./,         // Process access
    /global\./,          // Global access
    /window\./,          // Window access (browser)
    /document\./,        // Document access (browser)
    /console\./,         // Console access
    /setTimeout/,        // Timer functions
    /setInterval/,       // Timer functions
    /fetch\s*\(/,        // Network requests
    /XMLHttpRequest/,    // Network requests
    /localStorage/,      // Storage access
    /sessionStorage/,    // Storage access
    /\+\s*\+/,           // Increment operators
    /--/,                // Decrement operators
    /(?<![=!<>])=(?!=)/,  // Assignment operators = (but not ==, !=, <=, >=)
    /delete\s+/,         // Delete operator
    /new\s+/,            // Constructor calls
    /throw\s+/,          // Throw statements
    /try\s*\{/,          // Try blocks
    /catch\s*\(/,        // Catch blocks
    /finally\s*\{/,      // Finally blocks
    /for\s*\(/,          // For loops
    /while\s*\(/,        // While loops
    /do\s*\{/,           // Do-while loops
    /switch\s*\(/,       // Switch statements
    /return\s+/,         // Return statements
  ];

  // Additional strict patterns (only blocked in strict mode)
  const strictOnlyPatterns = [
    /\[.*\]/,            // Array/object bracket notation
    /this\./,            // This access
    /arguments\./,       // Arguments access
  ];
  
  // For template interpolation context, be more lenient about function call pattern
  if (options.context === 'template-interpolation') {
    // Only check patterns that don't include the function call pattern for variables within {{}}
    const templateSafePatterns = coreDangerousPatterns.filter(pattern => 
      pattern.source !== '\\w+\\s*\\('  // Exclude the function call pattern for template variables
    );
    
    if (templateSafePatterns.some(pattern => pattern.test(expression))) {
      return true;
}
  } else {
    // Check core patterns for non-template contexts
    if (coreDangerousPatterns.some(pattern => pattern.test(expression))) {
      return true;
    }
  }

  // Check strict-only patterns if in strict mode
  if (securityLevel === 'strict' && strictOnlyPatterns.some(pattern => pattern.test(expression))) {
    return true;
  }

  return false;
}

// Template variable interpolation ({{variable}} format) with nested support
// Inside-out approach: process innermost {{}} expressions first, then repeat until no more changes
function interpolateTemplateVariables(
  template: string, 
  variables: Record<string, any>, 
  contextStack: ContextEntry[], 
  options: Required<ExpressionOptions>,
  engine?: Engine
): string {
  logger.debug(`Starting template interpolation: ${template}`);
  
  let result = template;
  let iterations = 0;
  const maxIterations = 10; // Prevent infinite loops
  
  while (result.includes('{{') && result.includes('}}') && iterations < maxIterations) {
    iterations++;
    logger.debug(`Template interpolation iteration ${iterations}: ${result}`);
    
    // Find the LAST (rightmost) {{ - this is the innermost opening
    const lastOpenIndex = result.lastIndexOf('{{');
    if (lastOpenIndex === -1) break;
    
    // From that position, find the FIRST }} - this is the matching closing
    const closeIndex = result.indexOf('}}', lastOpenIndex);
    if (closeIndex === -1) {
      logger.warn(`Found {{ at ${lastOpenIndex} but no matching }} in: ${result}`);
      break;
    }
    
    // Extract the innermost expression
    const expression = result.substring(lastOpenIndex + 2, closeIndex).trim();
    logger.debug(`Found innermost template expression: {{${expression}}}`);
    
    // Evaluate the innermost expression
    const evaluatedContent = evaluateExpression(expression, variables, contextStack, {
      ...options,
      returnType: 'string'
    }, engine);
    
    const replacement = typeof evaluatedContent === 'string' ? evaluatedContent : String(evaluatedContent);
    logger.debug(`Evaluated to: ${replacement}`);
    
    // Replace the template expression with its evaluated result
    result = result.substring(0, lastOpenIndex) + replacement + result.substring(closeIndex + 2);
    logger.debug(`After replacement: ${result}`);
  }
  
  if (iterations >= maxIterations) {
    logger.warn(`Template interpolation stopped after ${maxIterations} iterations to prevent infinite loop`);
  }
  
  logger.debug(`Final template result: ${result}`);
  return result;
}

// Logical expression evaluator (&&, ||)
function evaluateLogicalExpression(
  expression: string, 
  variables: Record<string, any>, 
  contextStack: ContextEntry[], 
  options: Required<ExpressionOptions>,
  engine?: Engine
): any {
  // Handle OR expressions
  if (expression.includes('||')) {
    return evaluateSafeOrExpression(expression, variables, contextStack, engine);
  }
  
  // Handle AND expressions
  if (expression.includes('&&')) {
    const parts = expression.split('&&').map(part => part.trim());
    for (const part of parts) {
      const partResult = evaluateExpression(part, variables, contextStack, {
        ...options,
        returnType: 'boolean'
      }, engine);
      if (!partResult) {
        return false;
      }
    }
    return true;
  }
  
  return false;
}

// Comparison expression evaluator (==, !=, <, >, <=, >=)
function evaluateComparisonExpression(
  expression: string, 
  variables: Record<string, any>, 
  contextStack: ContextEntry[], 
  options: Required<ExpressionOptions>,
  engine?: Engine
): boolean {
  // The expression should already be interpolated (no more {{variables}})
  // but handle any remaining variables just in case
  let processedExpression = expression;
    
  // Extract any remaining variables in {{variable}} format and replace with actual values
  const variableMatches = expression.match(/\{\{([^}]+)\}\}/g);
    if (variableMatches) {
      for (const match of variableMatches) {
        const varName = match.slice(2, -2).trim();
        let varValue = getNestedValue(variables, varName);
        logger.debug(`Resolving variable '${varName}' with value:`, varValue);
        
        // Check engine session variables if not found
        if (varValue === undefined && engine) {
          varValue = resolveEngineSessionVariable(varName, engine);
        }
        
        // Convert value to appropriate type for comparison
        let replacementValue: string;
        if (varValue === undefined || varValue === null) {
          replacementValue = 'undefined';
        } else if (typeof varValue === 'string') {
          replacementValue = `"${varValue}"`;
        } else if (typeof varValue === 'boolean') {
          replacementValue = varValue.toString();
        } else {
          replacementValue = varValue.toString();
        }
        
      processedExpression = processedExpression.replace(match, replacementValue);
      }
    }
    
  try {
    // Use Function constructor for safe evaluation (restricted context)
    const result = new Function('return ' + processedExpression)();
    return !!result; // Convert to boolean
  } catch (error: any) {
    logger.warn(`Comparison evaluation failed for '${expression}':`, error.message);
    return false;
  }
}

// Helper function to check for comparison operators
function containsComparisonOperators(expression: string): boolean {
  return /[<>=!]+/.test(expression) && 
         !(expression.includes('&&') || expression.includes('||')); // Not a logical expression
}

// Helper function to check for mathematical expressions
function isMathematicalExpression(expression: string): boolean {
  return /[\+\-\*\/\%]/.test(expression) && 
         !expression.includes('++') && 
         !expression.includes('--'); // Exclude increment/decrement
}

// Convert result to requested return type
function convertReturnType(value: any, returnType: string): any {
  switch (returnType) {
    case 'boolean':
      return !!value;
    case 'string':
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    case 'auto':
    default:
      return value;
  }
}

// Clean unified expression interface functions  
function interpolateMessage(template: string, contextStack: ContextEntry[], variables: Record<string, any> = {}, engine?: Engine): string {
  logger.debug(`Interpolating message template: ${template} with variables: ${JSON.stringify(variables)}`);
  if (!template) return template;
  
  // Use our enhanced template interpolation that supports nested {{ }} expressions
  return interpolateTemplateVariables(template, variables, contextStack, {
    securityLevel: 'standard',
    allowLogicalOperators: true,
    allowMathOperators: true,
    allowComparisons: true,
    allowTernary: true,
    context: 'template-interpolation',
    returnType: 'auto'
  }, engine);
}

function evaluateSafeCondition(condition: string, variables: Record<string, any>, engine?: Engine): boolean {
  logger.debug(`Evaluating safe condition: ${condition} with variables: ${JSON.stringify(variables)}`);
  return evaluateExpression(condition, variables, [], {
    securityLevel: 'standard',
    context: 'condition-evaluation',
    returnType: 'boolean',
    allowComparisons: true,
    allowLogicalOperators: true
  }, engine) as boolean;
}

// Essential helper functions for the unified evaluator
function isSimpleVariablePath(expression: string): boolean {
  logger.debug(`Checking if expression is a simple variable path: ${expression}`);
  return /^[a-zA-Z_$][a-zA-Z0-9_$.]*$/.test(expression);
}

function resolveSimpleVariable(expression: string, variables: Record<string, any>, contextStack: ContextEntry[], engine?: Engine): string {
  // Debug logging to track variable resolution issues
  logger.debug(`Resolving variable '${expression}' - Available variables: ${JSON.stringify(Object.keys(variables || {}))}`);
  
  // Try variables first
  if (variables && Object.keys(variables).length > 0) {
    const val = expression.split('.').reduce((obj, part) => obj?.[part], variables);
    if (val !== undefined) {
      logger.debug(`Variable '${expression}' resolved to: ${val}`);
      return typeof val === 'object' ? JSON.stringify(val) : String(val);
    }
  }
  
  // If not found in variables, check for engine session variables
  if (engine) {
    const sessionValue = resolveEngineSessionVariable(expression, engine);
    if (sessionValue !== undefined) {
      logger.debug(`Variable '${expression}' resolved from engine session: ${sessionValue}`);
      return typeof sessionValue === 'object' ? JSON.stringify(sessionValue) : String(sessionValue);
    }
  }
  
  logger.debug(`Variable '${expression}' not found in variables or engine session`);
  return `[undefined: ${expression}]`;
}

// Helper function to resolve engine session variables
function resolveEngineSessionVariable(expression: string, engine: Engine): any {
  try {
    const currentFlowFrame = getCurrentFlowFrame(engine);
    
    switch (expression) {
      case 'userInput':
      case 'lastUserInput':
        // Get the most recent user input from context stack
        const userEntries = currentFlowFrame.contextStack.filter(entry => entry.role === 'user');
        if (userEntries.length > 0) {
          const lastUserEntry = userEntries[userEntries.length - 1];
          return typeof lastUserEntry.content === 'string' ? lastUserEntry.content : String(lastUserEntry.content);
        }
        return undefined;
        
      case 'currentTime()':
        return new Date().toISOString();
        
      case 'sessionId':
        return engine.sessionId;
        
      case 'userId':
        return currentFlowFrame.userId;
        
      case 'flowName':
        return currentFlowFrame.flowName;
        
      default:
        return undefined;
    }
  } catch (error) {
    logger.debug(`Failed to resolve engine session variable '${expression}': ${error}`);
    return undefined;
  }
}

// Helper function to evaluate function calls
function evaluateFunctionCall(expression: string, variables: Record<string, any>, contextStack: ContextEntry[], engine?: Engine): any {
  try {
    logger.debug(`Evaluating function call: ${expression}`);
    
    // Handle currentTime() function call
    if (expression === 'currentTime()') {
      return new Date().toISOString();
    }
    
    // Handle extractCryptoFromInput(...) function call
    const extractCryptoMatch = expression.match(/^extractCryptoFromInput\((.+)\)$/);
    if (extractCryptoMatch) {
      const argExpression = extractCryptoMatch[1].trim();
      
      // Evaluate the argument expression (could be a variable or literal)
      let argValue: string;
      if (argExpression.startsWith('"') && argExpression.endsWith('"')) {
        argValue = argExpression.slice(1, -1);
      } else if (argExpression.startsWith("'") && argExpression.endsWith("'")) {
        argValue = argExpression.slice(1, -1);
      } else {
        // Try to resolve as variable (could be userInput or other variable)
        const varResult = resolveSimpleVariable(argExpression, variables, contextStack, engine);
        if (varResult && !varResult.startsWith('[undefined:')) {
          argValue = varResult;
        } else if (engine) {
          // Try engine session variables
          const sessionResult = resolveEngineSessionVariable(argExpression, engine);
          if (sessionResult !== undefined) {
            argValue = String(sessionResult);
          } else {
            argValue = argExpression; // Use as literal if can't resolve
          }
        } else {
          argValue = argExpression; // Use as literal if can't resolve
        }
      }
      
      logger.debug(`extractCryptoFromInput called with: ${argValue}`);
      
      // Extract crypto name from input text
      const cryptoNames = {
        'bitcoin': 'bitcoin',
        'btc': 'bitcoin',
        'ethereum': 'ethereum', 
        'eth': 'ethereum',
        'litecoin': 'litecoin',
        'ltc': 'litecoin',
        'dogecoin': 'dogecoin',
        'doge': 'dogecoin',
        'cardano': 'cardano',
        'ada': 'cardano'
      };
      
      const lowerInput = argValue.toLowerCase();
      for (const [key, value] of Object.entries(cryptoNames)) {
        if (lowerInput.includes(key)) {
          logger.debug(`Extracted crypto: ${value}`);
          return value;
        }
      }
      
      logger.debug(`No crypto found in input, defaulting to bitcoin`);
      return 'bitcoin'; // Default fallback
    }
    
    return undefined; // Function not recognized
  } catch (error: any) {
    logger.warn(`Function call evaluation error: ${error.message}`);
    return undefined;
  }
}

function getNestedValue(obj: any, path: string): any {
  if (!obj || typeof path !== 'string') {
    return undefined;
  }
  
  if (!path.includes('.')) {
    return obj[path];
  }
  
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[key];
  }
  
  return current;
}

function evaluateSafeOrExpression(expression: string, variables: Record<string, any>, contextStack: any[], engine?: Engine): string {
  const parts = expression.split('||').map(part => part.trim());
  
  for (const part of parts) {
    if ((part.startsWith('"') && part.endsWith('"')) || 
        (part.startsWith("'") && part.endsWith("'"))) {
      return part.slice(1, -1);
    }
    
    if (isSimpleVariablePath(part)) {
      if (variables && Object.keys(variables).length > 0) {
        const val = part.split('.').reduce((obj, partKey) => obj?.[partKey], variables);
        if (val !== undefined && val !== null && String(val) !== '') {
          return typeof val === 'object' ? JSON.stringify(val) : String(val);
        }
      }
      
      // Check engine session variables if not found in variables
      if (engine) {
        const sessionValue = resolveEngineSessionVariable(part, engine);
        if (sessionValue !== undefined && sessionValue !== null && String(sessionValue) !== '') {
          return typeof sessionValue === 'object' ? JSON.stringify(sessionValue) : String(sessionValue);
        }
      }
    }
  }
  
  const lastPart = parts[parts.length - 1];
  if ((lastPart.startsWith('"') && lastPart.endsWith('"')) || 
      (lastPart.startsWith("'") && lastPart.endsWith("'"))) {
    return lastPart.slice(1, -1);
  }
  
  // Final fallback - check for session variables in the last part
  if (engine && isSimpleVariablePath(lastPart)) {
    const sessionValue = resolveEngineSessionVariable(lastPart, engine);
    if (sessionValue !== undefined) {
      return typeof sessionValue === 'object' ? JSON.stringify(sessionValue) : String(sessionValue);
    }
  }
  
  return '';
}

function evaluateSafeTernaryExpression(expression: string, variables: Record<string, any>, contextStack: any[], engine?: Engine): string {
  const ternaryMatch = expression.match(/^([a-zA-Z_$.]+)\s*(===|!==|==|!=|>=|<=|>|<)\s*(\d+|'[^']*'|"[^"]*"|true|false)\s*\?\s*('([^']*)'|"([^"]*)"|[a-zA-Z_$.]+)\s*:\s*('([^']*)'|"([^"]*)"|[a-zA-Z_$.]+)$/);
  
  if (!ternaryMatch) {
    return `[invalid-ternary: ${expression}]`;
  }
  
  const [, leftVar, operator, rightValue, , trueStr1, trueStr2, , falseStr1, falseStr2] = ternaryMatch;
  
  let leftVal: any;
  if (variables && Object.keys(variables).length > 0) {
    leftVal = leftVar.split('.').reduce((obj, part) => obj?.[part], variables);
  }
  
  // Check engine session variables if not found
  if (leftVal === undefined && engine) {
    leftVal = resolveEngineSessionVariable(leftVar, engine);
  }
  
  if (leftVal === undefined) {
    return `[undefined: ${leftVar}]`;
  }
  
  let rightVal: any;
  if (rightValue === 'true') rightVal = true;
  else if (rightValue === 'false') rightVal = false;
  else if (/^\d+$/.test(rightValue)) rightVal = parseInt(rightValue);
  else if (/^\d*\.\d+$/.test(rightValue)) rightVal = parseFloat(rightValue);
  else if (rightValue.startsWith("'") && rightValue.endsWith("'")) rightVal = rightValue.slice(1, -1);
  else if (rightValue.startsWith('"') && rightValue.endsWith('"')) rightVal = rightValue.slice(1, -1);
  else rightVal = rightValue;
  
  let condition = false;
  switch (operator) {
    case '===': condition = leftVal === rightVal; break;
    case '!==': condition = leftVal !== rightVal; break;
    case '==': condition = leftVal == rightVal; break;
    case '!=': condition = leftVal != rightVal; break;
    case '>': condition = leftVal > rightVal; break;
    case '<': condition = leftVal < rightVal; break;
    case '>=': condition = leftVal >= rightVal; break;
    case '<=': condition = leftVal <= rightVal; break;
    default: return `[invalid-operator: ${operator}]`;
  }
  
  if (condition) {
    return trueStr1 || trueStr2 || resolveSimpleVariable(trueStr2, variables, contextStack, engine) || '';
  } else {
    return falseStr1 || falseStr2 || resolveSimpleVariable(falseStr2, variables, contextStack, engine) || '';
  }
}

function evaluateSafeMathematicalExpression(expression: string, variables: Record<string, any>, contextStack: any[], engine?: Engine): string {
  try {
    let evaluatedExpression = expression;
    const variablePattern = /[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*/g;
    const variables_found = expression.match(variablePattern) || [];
    
    for (const varPath of [...new Set(variables_found)]) {
      if (/^\d+(\.\d+)?$/.test(varPath)) continue;
      
      let value = resolveSimpleVariable(varPath, variables, contextStack, engine);
      const numValue = Number(value);
      if (!isNaN(numValue)) {
        value = String(numValue);
      } else if (value === undefined || value === null) {
        value = '0';
      }
      
      const regex = new RegExp(`\\b${varPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      evaluatedExpression = evaluatedExpression.replace(regex, String(value));
    }
    
    if (!/^[\d+\-*/%().\s]+$/.test(evaluatedExpression)) {
      return `[unsafe-math: ${expression}]`;
    }
    
    const result = new Function(`"use strict"; return (${evaluatedExpression})`)();
    return String(result);
    
  } catch (error: any) {
    logger.warn(`Mathematical expression evaluation error: ${error.message}`);
    return `[math-error: ${expression}]`;
  }
}

// === ENHANCED FLOW CONTROL COMMANDS ===
// Universal commands that work during any flow
async function handleFlowControlCommands(input: string, engine: Engine, userId: string): Promise<string | null> {
  if (!input || typeof input !== 'string') {
    logger.warn(`handleFlowControlCommands received invalid input: ${typeof input} ${input}`);
    return null;
  }

  const currentFlowFrame = getCurrentFlowFrame(engine);
  const detectedCommand = detectSystemCommand(engine, input);
  
  if (!detectedCommand) {
    return null; // No system command detected
  }
  
  // Cancel/Abort commands - highest priority
  if (detectedCommand === 'cancel') {
    return await handleFlowExit(engine, userId, input);
  }
  
  // Handle pending interruption confirmations
  if (currentFlowFrame.pendingInterruption) {
    if (detectedCommand === 'switch') {
      return await handlePendingInterruptionSwitch(engine, userId);
    } else if (detectedCommand === 'continue') {
      return await handlePendingInterruptionContinue(engine, userId);
    }
  }
  
  // Help commands
  if (detectedCommand === 'help') {
    return handleFlowHelp(currentFlowFrame, engine);
  }
  
  // Status/Where am I commands
  if (detectedCommand === 'status') {
    return handleFlowStatus(engine);
  }
    
  return null; // Command detected but not handled (shouldn't happen)
}

// Help handler for active flows
function handleFlowHelp(currentFlowFrame: FlowFrame, engine: Engine): string {
  const flowName = currentFlowFrame.flowName;
  const isFinancialFlow = flowName.toLowerCase().includes('payment') || 
                         flowName.toLowerCase().includes('transfer') ||
                         flowName.toLowerCase().includes('financial');
  
  const helpTitle = getSystemMessage(engine, 'cmd_help_title', { flowName });
  const availableCommands = getSystemMessage(engine, 'cmd_help_available_commands');
  const cancelHelp = getSystemMessage(engine, 'cmd_help_cancel');
  const statusHelp = getSystemMessage(engine, 'cmd_help_status');
  const helpHelp = getSystemMessage(engine, 'cmd_help_help');
  
  let helpMessage = `${helpTitle}\n\n`;
  helpMessage += `${availableCommands}\n`;
  helpMessage += `${cancelHelp}\n`;
  helpMessage += `${statusHelp}\n`;
  helpMessage += `${helpHelp}\n\n`;
  
  if (isFinancialFlow) {
    const financialWarning = getSystemMessage(engine, 'cmd_help_financial_warning');
    helpMessage += `${financialWarning}\n\n`;
  }
  
  // Show the last SAY message instead of generic "Continue with your response"
  if (currentFlowFrame.lastSayMessage) {
    const currentQuestion = getSystemMessage(engine, 'cmd_help_current_question');
    const respondInstruction = getSystemMessage(engine, 'cmd_help_respond_instruction');
    helpMessage += `${currentQuestion}\n${currentFlowFrame.lastSayMessage}\n\n`;
    helpMessage += respondInstruction;
  } else {
    const continueInstruction = getSystemMessage(engine, 'cmd_help_continue_instruction');
    helpMessage += continueInstruction;
  }
  
  return helpMessage;
}

// Status handler for active flows
function handleFlowStatus(engine: Engine): string {
  const currentFlowFrame = getCurrentFlowFrame(engine);
  const flowName = currentFlowFrame.flowName;
  const stepsRemaining = currentFlowFrame.flowStepsStack.length;
  const stackDepth = getCurrentStackLength(engine);
  const transactionId = currentFlowFrame.transaction.id.slice(0, 8);

  //TODO: Use the new centralized internationalization system!!!

  let statusMessage = `📊 **Flow Status**\n\n`;
  statusMessage += `Current Flow: ${flowName}\n`;
  statusMessage += `Steps Remaining: ${stepsRemaining}\n`;
  statusMessage += `Stack Depth: ${stackDepth}\n`;
  statusMessage += `Transaction ID: ${transactionId}\n\n`;
  
  if (currentFlowFrame.variables && Object.keys(currentFlowFrame.variables).length > 0) {
    statusMessage += `Collected Information:\n`;
    Object.entries(currentFlowFrame.variables).forEach(([key, value]) => {
      if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
        statusMessage += `• ${key}: [HIDDEN]\n`;
      } else {
        statusMessage += `• ${key}: ${value}\n`;
      }
    });
  }
  
  statusMessage += `\nContinue with your response to proceed.`;
  
  return statusMessage;
}

// === INTENT INTERRUPTION HANDLER ===
// Check if user input represents a strong intent to start a new flow
async function handleIntentInterruption(input: string, engine: Engine, userId: string): Promise<string | null> {
  const currentFlowFrame = getCurrentFlowFrame(engine);
  const currentFlowName = currentFlowFrame.flowName;
  
  logger.info(`handleIntentInterruption called with input: "${input}", currentFlow: "${currentFlowName}"`);
  
  // Check if we're waiting for user input to a SAY-GET or similar step
  // In this case, simple responses like "1", "2", etc. should not trigger intent interruption
  const isWaitingForInput = currentFlowFrame.pendingVariable || 
                          currentFlowFrame.lastSayMessage ||
                          currentFlowFrame.flowStepsStack.length > 0;
  
  logger.debug(`Interrupt intent analysis for: ${input} pendingVariable: ${currentFlowFrame.pendingVariable}, lastSayMessage: ${!!currentFlowFrame.lastSayMessage}, stepsLeft: ${currentFlowFrame.flowStepsStack.length}`);
  
    
  // Use AI to detect if this is a strong intent for a different flow
  const intentAnalysis = await analyzeIntentStrength(input, engine);

  logger.debug(`Intent analysis result:`, JSON.stringify(intentAnalysis));

  if (intentAnalysis.isStrongIntent && intentAnalysis.targetFlow) {
    // Check if the target flow is different from current flow
    if (intentAnalysis.targetFlow !== currentFlowName) {
      
      // For financial flows, require explicit confirmation
      const isCurrentFinancial = currentFlowName.toLowerCase().includes('payment') || 
                                 currentFlowName.toLowerCase().includes('transfer');
      
      return await handleRegularFlowInterruption(intentAnalysis, engine, userId);
    }
  }
  
  return null; // No strong intent interruption detected
}

// Analyze intent strength using AI
async function analyzeIntentStrength(input: string, engine: Engine): Promise<any> {
   const currentFlowFrame = getCurrentFlowFrame(engine);
   const currentFlowName = currentFlowFrame.flowName;
   const flowsMenu = engine.flowsMenu || [];

   // Use the enhanced fetchAiTask worker with JSON schema
   const task = "Analyze the user input within the current flow context to determine if it represents a STRONG intent to switch to a completely different workflow, or if it's a response to the current flow.";
   
   const rules = `Critical Analysis Framework:
1. Examine the flow history to understand what question or prompt the current flow is expecting
2. Determine if the user input is:
   - A STRONG intent for a new workflow (clear, specific action request)
   - A response to the current flow's prompt (continue current flow)
   - A clarification or question about the current flow (continue current flow)

STRONG intent indicators (switch to new flow):
- Explicit action requests: "I want to make a payment", "Check my account balance"
- Complete topic changes: "What's the weather?" when in a payment flow
- New service requests: "I need to transfer money" when in account verification

WEAK intent indicators (continue current flow):
- Direct responses to prompts: "1", "2", "Yes", "No", specific values
- Follow-up questions: "What does that mean?", "Can you clarify?"
- Partial information: Single words, numbers, or brief phrases that answer the current question
- Corrections: "Actually, it's 123-456-7890" when asked for a phone number

Consider the flow context carefully - if the flow just asked a specific question, treat the input as a response unless it's clearly unrelated.`;

   // Use flow context when analyzing intent (we're already in a flow)
   let context = `CURRENT SITUATION: User is in "${currentFlowName}" flow. Analyze if their input is a response to this flow or a request for a different workflow.

IMPORTANT: Be very conservative about interrupting flows - only classify as STRONG intent if the input is clearly unrelated to what the current flow is asking for.`;
   
   if (currentFlowFrame.contextStack && currentFlowFrame.contextStack.length > 0) {
     const flowContext = flattenContextStack(currentFlowFrame.contextStack, true);
     context = `<flow-history>
${flowContext}
</flow-history>

${context}`;
   }

   const jsonSchema = `{
  "isStrongIntent": true/false,
  "targetFlow": "FlowName" or null,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

   try {
      const analysis = await fetchAiTask(task, rules, context, input, flowsMenu, jsonSchema, engine.aiCallback);
      
      // Ensure analysis is an object and add originalInput
      if (typeof analysis === 'object' && analysis !== null) {
        (analysis as Record<string, unknown>).originalInput = input; // Preserve the original input
      }
      
      logger.info(`Intent analysis:`, analysis);
      return analysis;
   } catch (error: any) {
      logger.warn(`Intent analysis error:`, error.message);
      logger.info(`Stack trace:`, error.stack);
      return { isStrongIntent: false, targetFlow: null, confidence: 0, reasoning: `Error: ${error.message}`, originalInput: input };
   }
}

// Handle confirmed switch from pending interruption
async function handlePendingInterruptionSwitch(engine: Engine, userId: string): Promise<string> {
  const currentFlowFrame = getCurrentFlowFrame(engine);
  const targetFlow = currentFlowFrame.pendingInterruption?.targetFlow;
  const currentFlowName = currentFlowFrame.flowName;
  
  if (!targetFlow || typeof targetFlow !== 'string') {
    return getSystemMessage(engine, 'flow_switch_error', { targetFlow: 'unknown' });
  }
  
  // Clean up current flow
  currentFlowFrame.transaction.fail("User confirmed flow switch");
  popFromCurrentStack(engine);
  
  logger.info(`🔄 User confirmed switch from "${currentFlowName}" to "${targetFlow}"`);
  
  // Find and activate the target flow
  const targetFlowDefinition = engine.flowsMenu?.find(f => f.name === targetFlow);
  if (!targetFlowDefinition) {
    return getSystemMessage(engine, 'flow_switch_error', { targetFlow });
  }
  
  const newTransaction = new FlowTransaction(targetFlow, 'confirmed-switch', userId);
  
  const newFlowFrame: FlowFrame = {
    flowName: targetFlow,
    flowId: targetFlowDefinition.id,
    flowVersion: targetFlowDefinition.version || '1.0',
    flowStepsStack: [...targetFlowDefinition.steps].reverse(),
    contextStack: [],
    inputStack: [],
    variables: getInitialVariables(engine, targetFlowDefinition), // Fresh variables for first flow activation
    transaction: newTransaction,
    userId: userId,
    startTime: Date.now()
  };

  pushToCurrentStack(engine, newFlowFrame);

  // Start the new flow
  const response = await playFlowFrame(engine);
  return `✅ **Switched to ${targetFlow}**\n\n${response}`;
}

// Handle continue from pending interruption
async function handlePendingInterruptionContinue(engine: Engine, userId: string): Promise<string> {
  const currentFlowFrame = getCurrentFlowFrame(engine);
  const currentFlowName = currentFlowFrame.flowName;
  
  // Clear the pending interruption
  delete currentFlowFrame.pendingInterruption;
  
  logger.info(`↩️ User chose to continue in "${currentFlowName}"`);
  
  let continueMessage = `✅ **Continuing ${currentFlowName}**\n\n`;
  
  // Show the last SAY message if we have one
  if (currentFlowFrame.lastSayMessage) {
    continueMessage += `${currentFlowFrame.lastSayMessage}`;
  } else {
    continueMessage += `Please continue with your response to proceed.`;
  }
  
  return continueMessage;
}

// Handle interruption of regular flows (more permissive)
async function handleRegularFlowInterruption(intentAnalysis: any, engine: Engine, userId: string): Promise<string> {
   try {
      logger.info(`🔄 Handling regular flow interruption for user ${userId}: ${intentAnalysis.originalInput}`);

      const currentFlowFrame = getCurrentFlowFrame(engine);
      const currentFlowName = currentFlowFrame.flowName;
      const targetFlow = intentAnalysis.targetFlow;
      const userInput = intentAnalysis.originalInput || '';
      const flowsMenu = engine.flowsMenu; // Access the global flows menu
      
      logger.info(`🔄 Processing flow interruption: "${userInput}" -> ${targetFlow}`);
      
      // For non-financial flows, allow graceful switching with option to resume
      currentFlowFrame.transaction.complete();
      
      // IMPORTANT: Clear pendingVariable from interrupted flow to avoid stale state when resuming
      if (currentFlowFrame.pendingVariable) {
         logger.info(`🧹 Clearing stale pendingVariable '${currentFlowFrame.pendingVariable}' from interrupted flow`);
         delete currentFlowFrame.pendingVariable;
         
         // DON'T pop the SAY-GET step! Leave it on the stack so it can re-prompt when resumed
         logger.info(`🧹 Cleared pendingVariable but kept SAY-GET step on stack for proper resumption`);
      }
      
      // NEW: Instead of storing interrupted flows separately, create a new stack
      logger.info(`🔄 Creating new stack for interrupting flow: ${targetFlow}`);
      logger.info(`Current stack ${engine.flowStacks.length - 1} has ${getCurrentStackLength(engine)} flows, creating stack ${engine.flowStacks.length}`);

      // Create new stack and switch to it
      createNewStack(engine);
      
      // Remove current flow from original stack would be wrong here - we want to preserve it!
      // The flow will remain on its original stack and resume when we switch back
         
      logger.info(`🔄 Switching from "${currentFlowName}" to "${targetFlow}" (flow saved for potential resumption)`);
   
      // Activate the new flow
      const targetFlowDefinition = flowsMenu?.find(f => f.name === targetFlow);
      if (targetFlowDefinition) {
        const newTransaction = new FlowTransaction(targetFlow, 'intent-switch', userId);

        /* Switched message added unconditionally - I suspect this is not needed
        // Prepare tentative flow_init message
        const tentativeFlowInit = getSystemMessage(engine, 'flow_init', { 
          flowName: targetFlow,
          flowPrompt: getFlowPrompt(engine, targetFlow)
        });
        engine?.addAccumulatedMessage!(tentativeFlowInit);
        */

        const newFlowFrame: FlowFrame = {
          flowName: targetFlow,
          flowId: targetFlowDefinition.id,
          flowVersion: targetFlowDefinition.version || '1.0',
          flowStepsStack: [...targetFlowDefinition.steps].reverse(),
          contextStack: [], // Start with empty context - don't use interruption input
          inputStack: [],   // Start with empty input stack - new flow will get proper input next
          variables: getInitialVariables(engine, targetFlowDefinition), // Fresh variables for interrupting flow activation
          transaction: newTransaction,
          userId: userId,
          startTime: Date.now()
        };
        
        // Start the new flow on the new stack
        pushToCurrentStack(engine, newFlowFrame);

        const response = await playFlowFrame(engine);
        
        // Use centralized messaging system for flow interruption
        const switchMessage = getSystemMessage(engine, 'flow_interrupted', {
          flowName: targetFlow,
          flowPrompt: getFlowPrompt(engine, targetFlow),
          previousFlowName: currentFlowName,
          previousFlowPrompt: getFlowPrompt(engine, currentFlowName)
        });
        
        return switchMessage + '\n\n' + response;
      }  
      return getSystemMessage(engine, 'flow_not_found', { targetFlow });
   } catch (error: any) {
      logger.error(`Error handling regular flow interruption: ${error.message}`);
      logger.info(`Stack trace: ${error.stack}`);
      return getSystemMessage(engine, 'flow_switch_general_error', { errorMessage: error.message });
   }
}

// === EXIT HANDLING ===
async function handleFlowExit(engine: Engine, userId: string, input: string): Promise<string> {
  const currentStack = getCurrentStack(engine);
  const currentFlow = currentStack[currentStack.length - 1];
  const flowName = currentFlow?.flowName || 'unknown';

  // TODO Review if needed.
  /*
  const isFinancialFlow = flowName.toLowerCase().includes('payment') || 
                         flowName.toLowerCase().includes('transfer') ||
                         flowName.toLowerCase().includes('financial');
  */

  logger.info(`User requested exit from flow: ${flowName}`);
    
  // Clean up all flows with proper transaction logging
  const exitedFlows: string[] = [];
  let flow: FlowFrame | undefined;
  while ((flow = engine.flowStacks?.pop()?.[0])) {
    logger.warn(`Exiting flow: ${flow.flowName} due to user request`);
    flow.transaction.fail(`User requested exit: ${input}`);
    exitedFlows.push(flow.flowName);
    auditLogger.logFlowExit(flow.flowName, userId, flow.transaction.id, 'user_requested');
  }  
  initializeFlowStacks(engine); // Reset stacks after exit
  
  //const flowList = exitedFlows.length > 1 ? exitedFlows.join(', ') : exitedFlows[0];
  return getSystemMessage(engine, 'cmd_flow_exited', { flowName: exitedFlows[exitedFlows.length - 1] });
}

async function processActivity(input: string, userId: string, engine: Engine): Promise<string | null> {
   try {
      // Custom logic for processing user activity
      logger.info(`Processing activity for user ${userId}: ${input}`);
   
      // Sanitize input
      const sanitizedInput = sanitizeInput(input);
      
      // Debug logging
      logger.info(`processActivity received input: ${JSON.stringify(input)}, sanitized: ${JSON.stringify(sanitizedInput)}`);
      logger.debug(`Current stack length: ${getCurrentStackLength(engine)}`);
   
      const flowsMenu = engine.flowsMenu; // Access the global flows menu

      // Check if we're already in a flow (using new stack-of-stacks)
      if (getCurrentStackLength(engine) > 0) {
         logger.info(`\n=== [${new Date().toISOString()}] Flow Handling query: ${input} ===`);
         logger.info(`Session: ${engine.sessionId?.slice(0, 8)}, User: ${userId}`);
         logger.info(`Current flow stack depth: ${getCurrentStackLength(engine)}`);
   
         const currentFlowFrame = getCurrentFlowFrame(engine);
         logger.info(`In flow: ${currentFlowFrame.flowName} (${currentFlowFrame.transaction.id.slice(0, 8)})`);
         
         // Check for universal flow control commands
         const flowControlResult = await handleFlowControlCommands(String(sanitizedInput), engine, userId);
         if (flowControlResult) {
         return flowControlResult;
         }
         
         // Check for strong intent interruption (new flows)
         const interruptionResult = await handleIntentInterruption(String(sanitizedInput), engine, userId);
         if (interruptionResult) {
          return interruptionResult;
         }
         
         // Clear the last SAY message if we had one
         if (currentFlowFrame.lastSayMessage) {
         logger.info(`User responded to: "${currentFlowFrame.lastSayMessage}"`);
         delete currentFlowFrame.lastSayMessage;
         }
         
         // Add new input to enhanced context stack with role information
         addToContextStack(currentFlowFrame.contextStack, 'user', sanitizedInput);
         currentFlowFrame.inputStack = [sanitizedInput];
         
         logger.info(`Flow context updated. inputStack: ${JSON.stringify(currentFlowFrame.inputStack)}, contextStack length: ${currentFlowFrame.contextStack.length}`);
         
         try {
         const response = await playFlowFrame(engine);
         logger.info(`Flow response: ${response}`);
         return response;
         } catch (error: any) {
         logger.error(`Flow execution error: ${error.message}`);
         logger.info(`Stack trace: ${error.stack}`);
         
         // Clean up failed flow
         if (getCurrentStackLength(engine) > 0) {
            const failedFrame = popFromCurrentStack(engine)!;
            failedFrame.transaction.fail(error.message);
         }
         
         return `I encountered an error: ${error.message}. Please try again or contact support if the issue persists.`;
         }
      }
   
      // Check if input should activate a new flow
      logger.debug(`No active flow, checking if input should activate new flow...`);
      try {
         const activatedFlow = await isFlowActivated(String(sanitizedInput), engine, userId);
         
         if (activatedFlow) {
            logger.info(`Flow activated: ${activatedFlow.name}`);
            
            // Clear lastChatTurn since we now have flow context
            engine.lastChatTurn = {};
            logger.debug(`Cleared lastChatTurn - now using flow context for AI operations`);
            
            const response = await playFlowFrame(engine);
            logger.info(`Initial flow response: ${response}`);
            return response;
         }
      } catch (error: any) {
         logger.error(`Flow activation error: ${error.message}`);
         logger.info(`Stack trace: ${error.stack}`);
   
         return `I encountered an error while processing your request: ${error.message}`;
      }

      logger.debug(`No flow activated for input: ${input}`);

      return null; // No flow activated - let the calling system handle this

   } catch (error: any) {
      logger.error(`Error processing activity for user ${userId}: ${error.message}`);
      logger.info(`Stack trace: ${error.stack}`);
      
      return `I encountered an error while processing your request: ${error.message}`;
   }
}

// === WORKFLOW ENGINE CLASS ===
export class WorkflowEngine implements Engine {
   public flowsMenu: FlowDefinition[];
   public toolsRegistry: ToolDefinition[];
   public APPROVED_FUNCTIONS: ApprovedFunctions;
   public flowStacks: FlowFrame[][];
   public globalAccumulatedMessages: string[];
   public sessionId: string;
   public createdAt: Date;
   public lastActivity: Date;
   public language?: string;
   public messageRegistry?: MessageRegistry;
   public guidanceConfig?: GuidanceConfig;
   public globalVariables?: Record<string, unknown>;
   public aiCallback: AiCallbackFunction;
   public lastChatTurn: { user?: ContextEntry; assistant?: ContextEntry } = {};

   constructor(
      aiCallback: AiCallbackFunction, // REQUIRED - Engine cannot function without AI access for intent detection & smart decisions
      flowsMenu: FlowDefinition[], 
      toolsRegistry: ToolDefinition[], 
      APPROVED_FUNCTIONS: ApprovedFunctions, 
      language?: string,
      messageRegistry?: MessageRegistry,
      guidanceConfig?: GuidanceConfig,
      validateOnInit: boolean = true,
      globalVariables?: Record<string, unknown> // Optional global variables shared across all new flows
   ) {
      this.aiCallback = aiCallback;
      this.flowsMenu = flowsMenu;
      this.toolsRegistry = toolsRegistry;
      this.APPROVED_FUNCTIONS = APPROVED_FUNCTIONS;
      this.flowStacks = [[]]; // Stack of flowFrames stacks for proper flow interruption/resumption
      this.globalAccumulatedMessages = []; // Global SAY message accumulation across all stacks
      this.sessionId = crypto.randomUUID();
      this.createdAt = new Date();
      this.lastActivity = new Date();
      this.language = language;
      this.messageRegistry = messageRegistry;
      this.globalVariables = globalVariables ? { ...globalVariables } : {}; // Copy global variables to prevent external mutations
      this.guidanceConfig = guidanceConfig || {
         enabled: true,
         mode: 'prepend',
         separator: '\n\n',
         contextSelector: 'auto'
      };
      //this.initializeFlowStacks();

      // Logger will be assigned when initSession is called
      
      // Perform global flow validation on initialization
      if (validateOnInit && flowsMenu.length > 0) {
         this.performInitializationValidation();
      }
   }

  /**
   * Initialize a new session context for a user session.
   *
   * @param logger - Logger instance for this session. Must implement info, warn, error, and debug methods.
   * @param userId - User identifier for this session
   * @param sessionId - Unique identifier for the session
   * @returns EngineSessionContext object that should be persisted by the host
   * @throws Error if logger does not implement all required methods
   *
   * @example
   *   const engine = new WorkflowEngine(...);
   *   const session = engine.initSession(ConsoleLogger, 'user-123');
   */
   initSession(hostLogger: Logger, userId: string, sessionId?: string): EngineSessionContext {
    // Validate logger compatibility
    const requiredMethods = ['info', 'warn', 'error', 'debug'];
    for (const method of requiredMethods) {
      if (typeof (hostLogger as any)[method] !== 'function') {
        throw new Error(`Logger is missing required method: ${method}`);
      }
    }

    // Assign the session logger to the global logger
    logger = hostLogger;

    const engineSessionContext: EngineSessionContext = {
      hostLogger: hostLogger,
      sessionId: sessionId || crypto.randomUUID(),
      userId: userId,
      createdAt: new Date(),
      lastActivity: new Date(),
      flowStacks: [[]],
      globalAccumulatedMessages: [],
      lastChatTurn: {},
      globalVariables: this.globalVariables ? { ...this.globalVariables } : {}
    };

    logger.info(`Engine session initialized: ${engineSessionContext.sessionId} for user: ${userId}`);
    return engineSessionContext;
   }

   async updateActivity(contextEntry: ContextEntry, engineSessionContext?: EngineSessionContext): Promise<string | null> {
      // Load session context if provided
      if (engineSessionContext) {
         logger = engineSessionContext.hostLogger;
         this.sessionId = engineSessionContext.sessionId;
         this.createdAt = engineSessionContext.createdAt;
         this.flowStacks = engineSessionContext.flowStacks;
         this.globalAccumulatedMessages = engineSessionContext.globalAccumulatedMessages;
         this.lastChatTurn = engineSessionContext.lastChatTurn;
         this.globalVariables = engineSessionContext.globalVariables;
      }

      // Get userId from session context
      const userId = engineSessionContext?.userId || 'anonymous';

      this.lastActivity = new Date();
      
      // Update session context with latest activity time
      if (engineSessionContext) {
         engineSessionContext.lastActivity = this.lastActivity;
      }
      
      // Role-based processing logic
      if (contextEntry.role === 'user') {         
         // Detect intent to activate a flow or switch flows
         const flowOrNull =  await processActivity(String(contextEntry.content), userId, this);

         // Store user turn in lastChatTurn if not in a flow
         if (flowOrNull === null) {
            this.lastChatTurn.user = contextEntry;
         }

         // Update session context with current state
         if (engineSessionContext) {
            engineSessionContext.flowStacks = this.flowStacks;
            engineSessionContext.globalAccumulatedMessages = this.globalAccumulatedMessages;
            engineSessionContext.lastChatTurn = this.lastChatTurn;
            engineSessionContext.globalVariables = this.globalVariables || {};
         }

         return flowOrNull;
      } else if (contextEntry.role === 'assistant') {
         // Check if we're in a flow or not
         if (getCurrentStackLength(this) === 0) {
            // Not in a flow - store in lastChatTurn for context
            this.lastChatTurn.assistant = contextEntry;
         } else {
            // In a flow - add to current flow's context stack
            const currentFlowFrame = getCurrentFlowFrame(this);
            addToContextStack(currentFlowFrame.contextStack, 'assistant', contextEntry.content, contextEntry.stepId, contextEntry.toolName, contextEntry.metadata);
         }
         
         // Update session context with current state
         if (engineSessionContext) {
            engineSessionContext.flowStacks = this.flowStacks;
            engineSessionContext.globalAccumulatedMessages = this.globalAccumulatedMessages;
            engineSessionContext.lastChatTurn = this.lastChatTurn;
            engineSessionContext.globalVariables = this.globalVariables || {};
         }
         
         // Return null to indicate no flow processing needed
         return null;
      } else {
         // Throw error for unsupported roles
         throw new Error(`Unsupported role '${contextEntry.role}' in updateActivity. Only 'user' and 'assistant' roles are supported.`);
      }
   }

   // Add a SAY message to global accumulation
   addAccumulatedMessage(message: string, engineSessionContext?: EngineSessionContext): void {
      // Load session context if provided
      if (engineSessionContext) {
         this.globalAccumulatedMessages = engineSessionContext.globalAccumulatedMessages;
      }
      
      this.globalAccumulatedMessages.push(message);
      
      // Update session context with new message
      if (engineSessionContext) {
         engineSessionContext.globalAccumulatedMessages = this.globalAccumulatedMessages;
      }
   }

   // Get and clear all accumulated messages
   getAndClearAccumulatedMessages(engineSessionContext?: EngineSessionContext): string[] {
      // Load session context if provided
      if (engineSessionContext) {
         this.globalAccumulatedMessages = engineSessionContext.globalAccumulatedMessages;
      }
      
      const messages = [...this.globalAccumulatedMessages];
      this.globalAccumulatedMessages = [];
      
      // Update session context with cleared messages
      if (engineSessionContext) {
         engineSessionContext.globalAccumulatedMessages = this.globalAccumulatedMessages;
      }
      
      return messages;
   }

   // Check if there are accumulated messages
   hasAccumulatedMessages(): boolean {
      return this.globalAccumulatedMessages.length > 0;
   }

   initializeFlowStacks(): void {
      initializeFlowStacks(this);
   }
   
   getCurrentStack(): FlowFrame[] {
      return getCurrentStack(this);
   }

   getCurrentStackLength(): number {
      return getCurrentStackLength(this);
   }

   getCurrentFlowFrame(): FlowFrame {
      return getCurrentFlowFrame(this);
   }

   createNewStack(): void {
      createNewStack(this);
   }

   pushToCurrentStack(flowFrame: FlowFrame): void {
      pushToCurrentStack(this, flowFrame);
   }

   popFromCurrentStack(): FlowFrame | undefined {
      return popFromCurrentStack(this);
   }

   getFlowForInput(input: string): Promise<FlowDefinition | null> {
      return getFlowForInput(input, this);
   }

   /**
    * Performs comprehensive validation of all flows during engine initialization
    * This catches configuration errors early and provides immediate feedback
    */
   performInitializationValidation(): void {
      try {
         logger.info('🔍 Performing global flow validation on engine initialization...');
         
         const validationResults = this.validateAllFlows({
            deep: true,
            checkCircularRefs: true,
            validateTools: true,
            strictSchema: true,
            checkVariables: true
         });
         
         if (validationResults.totalErrors > 0) {
            logger.error(`❌ Flow validation failed: ${validationResults.totalErrors} errors, ${validationResults.totalWarnings} warnings`);
            
            // Log detailed errors
            for (const flowResult of validationResults.flowResults) {
               if (!flowResult.isValid) {
                  logger.error(`❌ Flow "${flowResult.flowName}" has ${flowResult.errors.length} errors:`);
                  for (const error of flowResult.errors) {
                     logger.error(`   • ${error}`);
                  }
               }
            }
            
            // Also log detailed warnings when there are errors
            if (validationResults.totalWarnings > 0) {
               const warningsByFlow = validationResults.flowResults.filter((f: { warnings: unknown[] }) => f.warnings.length > 0);
                for (const flowResult of warningsByFlow) {
                  logger.warn(`⚠️  Flow "${flowResult.flowName}" has ${flowResult.warnings.length} warnings:`);
                  for (const warning of flowResult.warnings) {
                     logger.warn(`   • ${warning}`);
                  }
               }
            }
            
            // In production, you might want to throw an error here to prevent startup
            // throw new Error(`Flow validation failed with ${validationResults.totalErrors} errors`);
            logger.warn('⚠️  Engine initialized with validation errors - flows may not execute correctly');
         } else if (validationResults.totalWarnings > 0) {
            logger.warn(`⚠️  Flow validation passed with ${validationResults.totalWarnings} warnings`);
            
            // Log detailed warnings when there are no errors
            const warningsByFlow = validationResults.flowResults.filter((f: { warnings: unknown[] }) => f.warnings.length > 0);
            for (const flowResult of warningsByFlow) {
               logger.warn(`⚠️  Flow "${flowResult.flowName}" has ${flowResult.warnings.length} warnings:`);
               for (const warning of flowResult.warnings) {
                  logger.warn(`   • ${warning}`);
               }
            }
         } else {
            logger.info(`✅ All ${validationResults.totalFlows} flows passed validation successfully!`);
         }
         
         // Log validation summary
         logger.info(`📊 Validation Summary: ${validationResults.validFlows}/${validationResults.totalFlows} flows valid, ${validationResults.totalErrors} errors, ${validationResults.totalWarnings} warnings`);
         
      } catch (error: any) {
         logger.error(`❌ Critical error during flow validation: ${error.message}`);
         logger.error(error.stack);
         // Don't throw here to allow engine to initialize even if validation fails
      }
   }

   // === FLOW VALIDATION METHODS ===

   /**
    * Validates a single flow and all its dependencies recursively
    * @param flowName - Name of the flow to validate
    * @param options - Validation options
    * @returns Validation result with errors, warnings, and flow graph
    */
   validateFlow(flowName: string, options: any = {}): any {
      const opts = {
         deep: true,                    // Validate sub-flows recursively
         checkCircularRefs: true,       // Detect circular flow references
         validateTools: true,           // Validate tool existence and parameters
         strictSchema: true,            // Enforce strict schema compliance
         checkVariables: true,          // Validate variable usage and scope
         maxDepth: 10,                 // Maximum recursion depth for sub-flows
         ...options
      };

      const validationState = {
         errors: [] as string[],
         warnings: [] as string[],
         visitedFlows: new Set<string>(),
         flowCallGraph: new Map<string, string[]>(),
         currentDepth: 0,
         variableScopes: new Map<string, Set<string>>(),
         toolRegistry: new Set(this.toolsRegistry.map((t: any) => t.id))
      };

      try {
         this._validateFlowRecursive(flowName, validationState, opts);
         
         // Check for circular references if enabled
         if (opts.checkCircularRefs) {
            this._checkCircularReferences(validationState);
         }

         return {
            isValid: validationState.errors.length === 0,
            errors: validationState.errors,
            warnings: validationState.warnings,
            flowGraph: Object.fromEntries(validationState.flowCallGraph),
            visitedFlows: Array.from(validationState.visitedFlows)
         };
      } catch (error: any) {
         return {
            isValid: false,
            errors: [`Critical validation error: ${error.message}`],
            warnings: validationState.warnings,
            flowGraph: {},
            visitedFlows: []
         };
      }
   }

   /**
    * Recursively validates a flow and its sub-flows
    */
   private _validateFlowRecursive(flowName: string, state: any, opts: any): void {
      // Check recursion depth
      if (state.currentDepth >= opts.maxDepth) {
         state.errors.push(`Maximum validation depth (${opts.maxDepth}) exceeded for flow: ${flowName}`);
         return;
      }

      // Check if already validated (avoid infinite loops)
      if (state.visitedFlows.has(flowName)) {
         return;
      }

      // Find the flow definition
      const flowDef = this.flowsMenu.find((f: any) => f.name === flowName);
      if (!flowDef) {
         state.errors.push(`Flow not found: ${flowName}`);
         return;
      }

      // Mark as visited
      state.visitedFlows.add(flowName);
      state.currentDepth++;

      // Initialize flow call graph
      if (!state.flowCallGraph.has(flowName)) {
         state.flowCallGraph.set(flowName, []);
      }

      // Validate flow metadata
      this._validateFlowMetadata(flowDef, state, opts);

      // Validate flow variables
      if (opts.checkVariables) {
         this._validateFlowVariables(flowDef, state, opts);
      }

      // Validate each step
      if (flowDef.steps && Array.isArray(flowDef.steps)) {
         for (let i = 0; i < flowDef.steps.length; i++) {
            const step = flowDef.steps[i];
            // Get current scope for this step (accumulated from previous steps)
            const currentScope = this._getCurrentStepScope(flowDef, i, state);
            this._validateFlowStep(step, flowDef, state, opts, currentScope);
         }
      } else {
         state.errors.push(`Flow "${flowName}" has no steps or steps is not an array`);
      }

      // Validate recursively if deep validation is enabled
      if (opts.deep) {
         const calledFlows = state.flowCallGraph.get(flowName) || [];
         for (const calledFlow of calledFlows) {
            this._validateFlowRecursive(calledFlow, state, opts);
         }
      }

      state.currentDepth--;
   }

   /**
    * Validates flow metadata and basic structure
    */
   private _validateFlowMetadata(flowDef: any, state: any, opts: any): void {
      // Required fields
      if (!flowDef.name) {
         state.errors.push(`Flow missing required "name" field`);
      }
      if (!flowDef.id) {
         state.errors.push(`Flow "${flowDef.name || 'unknown'}" missing required "id" field`);
      }
      if (!flowDef.version) {
         state.warnings.push(`Flow "${flowDef.name}" missing version field`);
      }
      if (!flowDef.description) {
         state.warnings.push(`Flow "${flowDef.name}" missing description field`);
      }

      // Validate metadata structure if present
      if (flowDef.metadata) {
         if (flowDef.metadata.riskLevel && !['low', 'medium', 'high', 'critical'].includes(flowDef.metadata.riskLevel)) {
            state.warnings.push(`Flow "${flowDef.name}" has invalid riskLevel: ${flowDef.metadata.riskLevel}`);
         }
      }
   }

   /**
    * Validates flow variable definitions
    */
   private _validateFlowVariables(flowDef: any, state: any, opts: any): void {
      if (flowDef.variables) {
         const flowScope = new Set<string>();
         
         for (const [varName, varDef] of Object.entries(flowDef.variables)) {
            if (typeof varDef === 'object' && varDef !== null) {
               const def = varDef as any;
               
               // Check required fields
               if (!def.type) {
                  state.warnings.push(`Variable "${varName}" in flow "${flowDef.name}" missing type definition`);
               }
               
               // Check valid types
               if (def.type && !['string', 'number', 'boolean', 'object', 'array'].includes(def.type)) {
                  state.warnings.push(`Variable "${varName}" in flow "${flowDef.name}" has invalid type: ${def.type}`);
               }
               
               // Check scope
               if (def.scope && !['flow', 'session', 'global'].includes(def.scope)) {
                  state.warnings.push(`Variable "${varName}" in flow "${flowDef.name}" has invalid scope: ${def.scope}`);
               }
               
               flowScope.add(varName);
            }
         }
         
         state.variableScopes.set(flowDef.name, flowScope);
      }
   }

   /**
    * Validates a single step within a flow
    */
   private _validateFlowStep(step: any, flowDef: any, state: any, opts: any, scope?: Set<string>): void {
      // Basic step structure validation
      if (!step.id) {
         state.errors.push(`Step "${step.type || 'unknown'}" in flow "${flowDef.name}" missing required "id" field`);
      }
      if (!step.type) {
         state.errors.push(`Step "${step.id || 'undefined'}" in flow "${flowDef.name}" missing required "type" field`);
         return;
      }

      // Validate step type
      const validStepTypes = ['SAY', 'SAY-GET', 'SET', 'SWITCH', 'CASE', 'CALL-TOOL', 'FLOW'];
      if (!validStepTypes.includes(step.type)) {
         state.errors.push(`Step "${step.id}" in flow "${flowDef.name}" has invalid type: ${step.type}`);
         return;
      }

      // Use provided scope or calculate current scope
      const currentScope = scope || new Set<string>();

      // Type-specific validation
      switch (step.type) {
         case 'SAY':
         case 'SAY-GET':
            this._validateSayStep(step, flowDef, state, opts, currentScope);
            break;
         case 'SET':
            this._validateSetStep(step, flowDef, state, opts, currentScope);
            break;
         case 'SWITCH':
            this._validateSwitchStep(step, flowDef, state, opts, currentScope);
            break;
         case 'CASE':
            this._validateCaseStep(step, flowDef, state, opts, currentScope);
            break;
         case 'CALL-TOOL':
            this._validateCallToolStep(step, flowDef, state, opts, currentScope);
            break;
         case 'FLOW':
            this._validateSubFlowStep(step, flowDef, state, opts, currentScope);
            break;
      }

      // Update scope with variables created by this step
      this._updateScopeAfterStep(step, flowDef, state);

      // Validate onFail handler if present
      if (step.onFail) {
         this._validateOnFailHandler(step.onFail, step, flowDef, state, opts, scope);
      }
   }

   /**
    * Validates SAY and SAY-GET steps
    */
   private _validateSayStep(step: any, flowDef: any, state: any, opts: any, scope?: Set<string>): void {
      // SAY steps must have value
      if (!step.value) {
         state.errors.push(`SAY step "${step.id}" in flow "${flowDef.name}" missing required "value" field`);
      }

      // SAY-GET steps must have variable
      if (step.type === 'SAY-GET' && !step.variable) {
         state.errors.push(`SAY-GET step "${step.id}" in flow "${flowDef.name}" missing required "variable" field`);
      }

      // Validate variable references in value and translations
      if (step.value && opts.checkVariables) {
         this._validateVariableReferences({ value: step.value }, step, flowDef, state, 'SAY step value', scope);
      }
      
      // Validate translations if present
      for (const [key, value] of Object.entries(step)) {
         if (key.startsWith('value-') && opts.checkVariables) {
            this._validateVariableReferences({ [key]: value }, step, flowDef, state, `SAY step translation ${key}`, scope);
         }
      }

      // Invalid attributes for SAY steps
      if (step.callType) {
         state.errors.push(`SAY step "${step.id}" in flow "${flowDef.name}" has invalid attribute "callType" - only FLOW steps support callType`);
      }
      if (step.tool) {
         state.errors.push(`SAY step "${step.id}" in flow "${flowDef.name}" has invalid attribute "tool" - only CALL-TOOL steps support tool`);
      }
      if (step.name && step.type !== 'SAY-GET') {
         state.warnings.push(`SAY step "${step.id}" in flow "${flowDef.name}" has "name" attribute which is typically for FLOW steps`);
      }
   }

   /**
    * Validates SET steps
    */
   private _validateSetStep(step: any, flowDef: any, state: any, opts: any, scope?: Set<string>): void {
      if (!step.variable) {
         state.errors.push(`SET step "${step.id}" in flow "${flowDef.name}" missing required "variable" field`);
      }
      if (!step.value && step.value !== 0 && step.value !== false && step.value !== '') {
         state.errors.push(`SET step "${step.id}" in flow "${flowDef.name}" missing required "value" field`);
      }

      // Validate variable references in value
      if (step.value && opts.checkVariables) {
         this._validateVariableReferences({ value: step.value }, step, flowDef, state, 'SET step value', scope);
      }

      // Invalid attributes for SET steps
      if (step.callType) {
         state.errors.push(`SET step "${step.id}" in flow "${flowDef.name}" has invalid attribute "callType" - only FLOW steps support callType`);
      }
   }

   /**
    * Validates SWITCH steps
    */
   private _validateSwitchStep(step: any, flowDef: any, state: any, opts: any, scope?: Set<string>): void {
      if (!step.variable) {
         state.errors.push(`SWITCH step "${step.id}" in flow "${flowDef.name}" missing required "variable" field`);
      }
      if (!step.branches || typeof step.branches !== 'object') {
         state.errors.push(`SWITCH step "${step.id}" in flow "${flowDef.name}" missing required "branches" object`);
         return;
      }

      // Validate variable reference in switch variable
      if (step.variable && opts.checkVariables && scope) {
         const rootVar = step.variable.split('.')[0];
         if (!scope.has(rootVar)) {
            state.errors.push(`SWITCH step "${step.id}" references undefined variable: ${rootVar}`);
         }
      }

      // Validate each branch
      for (const [branchKey, branchStep] of Object.entries(step.branches)) {
         if (typeof branchStep === 'object' && branchStep !== null) {
            this._validateFlowStep(branchStep, flowDef, state, opts, scope);
         }
         
         // SWITCH steps now only support exact value matching - use CASE for conditions
         if (branchKey.startsWith('condition:')) {
            state.errors.push(`SWITCH step "${step.id}" in flow "${flowDef.name}" has condition branch "${branchKey}" - use CASE step for conditional logic instead`);
         } else if (branchKey !== 'default') {
            // This is a constant value branch - validate it's a reasonable constant
            if (branchKey.includes('{{') || branchKey.includes('}}')) {
               state.warnings.push(`SWITCH step "${step.id}" in flow "${flowDef.name}" branch key "${branchKey}" contains template syntax - consider using CASE step for dynamic conditions`);
            }
         }
      }

      // Recommend default branch
      if (!step.branches.default) {
         state.warnings.push(`SWITCH step "${step.id}" in flow "${flowDef.name}" missing "default" branch - recommended for error handling`);
      }
   }

   /**
    * Validates CASE steps
    */
   private _validateCaseStep(step: any, flowDef: any, state: any, opts: any, scope?: Set<string>): void {
      // CASE steps require 'branches' object format
      if (!step.branches || typeof step.branches !== 'object') {
         state.errors.push(`CASE step "${step.id}" in flow "${flowDef.name}" missing required "branches" object`);
         return;
      }

      let hasConditionBranches = false;

      // Validate each branch
      for (const [branchKey, branchStep] of Object.entries(step.branches)) {
         if (typeof branchStep === 'object' && branchStep !== null) {
            this._validateFlowStep(branchStep, flowDef, state, opts, scope);
         }
         
         // CASE steps only support condition branches and default
         if (branchKey === 'default') {
            // Default branch is allowed
            continue;
         } else if (branchKey.startsWith('condition:')) {
            hasConditionBranches = true;
            const condition = branchKey.slice(10); // Remove 'condition:' prefix
            
            // Validate condition expression
            if (opts.checkVariables) {
               this._validateVariableReferences({ condition }, step, flowDef, state, 'CASE condition', scope);
            }
         } else {
            // CASE doesn't support exact value matching - that's SWITCH's job
            state.errors.push(`CASE step "${step.id}" in flow "${flowDef.name}" has invalid branch "${branchKey}" - CASE only supports "condition:" branches and "default"`);
         }
      }

      // CASE steps must have at least one condition branch
      if (!hasConditionBranches) {
         state.errors.push(`CASE step "${step.id}" in flow "${flowDef.name}" must have at least one "condition:" branch`);
      }

      // Recommend default branch
      if (!step.branches.default) {
         state.warnings.push(`CASE step "${step.id}" in flow "${flowDef.name}" missing "default" branch - recommended for error handling`);
      }
   }

   /**
    * Validates CALL-TOOL steps
    */
   private _validateCallToolStep(step: any, flowDef: any, state: any, opts: any, scope?: Set<string>): void {
      if (!step.tool) {
         state.errors.push(`CALL-TOOL step "${step.id}" in flow "${flowDef.name}" missing required "tool" field`);
         return;
      }

      // Validate tool exists in registry
      if (opts.validateTools && !state.toolRegistry.has(step.tool)) {
         state.errors.push(`CALL-TOOL step "${step.id}" in flow "${flowDef.name}" references unknown tool: ${step.tool}`);
      }

      // Validate tool arguments if present
      if (step.args && opts.validateTools) {
         this._validateToolArguments(step.args, step, flowDef, state, opts);
      }

      // Validate variable references in tool arguments
      if (step.args && opts.checkVariables) {
         this._validateVariableReferences(step.args, step, flowDef, state, 'tool arguments', scope);
      }

      // Validate response mapping if present
      if (step.responseMapping && opts.checkVariables) {
         this._validateResponseMapping(step.responseMapping, step, flowDef, state, scope);
      }

      // Invalid attributes for CALL-TOOL steps
      if (step.callType) {
         state.errors.push(`CALL-TOOL step "${step.id}" in flow "${flowDef.name}" has invalid attribute "callType" - only FLOW steps support callType`);
      }
      if (step.name && step.name !== step.tool) {
         state.warnings.push(`CALL-TOOL step "${step.id}" in flow "${flowDef.name}" has "name" attribute that differs from "tool" - potentially confusing`);
      }
   }

   /**
    * Validates FLOW steps (sub-flow calls)
    */
   private _validateSubFlowStep(step: any, flowDef: any, state: any, opts: any, scope?: Set<string>): void {
      if (!step.value) {
         state.errors.push(`FLOW step "${step.id}" in flow "${flowDef.name}" missing required "value" field`);
         return;
      }

      // Add to call graph
      const calledFlows = state.flowCallGraph.get(flowDef.name) || [];
      if (!calledFlows.includes(step.value)) {
         calledFlows.push(step.value);
         state.flowCallGraph.set(flowDef.name, calledFlows);
      }

      // Validate callType if present
      if (step.callType && !['call', 'replace', 'reboot'].includes(step.callType)) {
         state.errors.push(`FLOW step "${step.id}" in flow "${flowDef.name}" has invalid callType: ${step.callType}. Valid values are: call, replace, reboot`);
      }

      // Validate arguments passed to sub-flow if present
      if (step.args && opts.checkVariables) {
         this._validateVariableReferences(step.args, step, flowDef, state, 'sub-flow arguments', scope);
      }

      // Invalid attributes for FLOW steps
      if (step.tool) {
         state.errors.push(`FLOW step "${step.id}" in flow "${flowDef.name}" has invalid attribute "tool" - only CALL-TOOL steps support tool`);
      }
   }

   /**
    * Validates onFail handlers
    */
   private _validateOnFailHandler(onFail: any, parentStep: any, flowDef: any, state: any, opts: any, scope?: Set<string>): void {
      if (!onFail.type) {
         state.errors.push(`onFail handler for step "${parentStep.id}" in flow "${flowDef.name}" missing required "type" field`);
         return;
      }

      // Validate onFail step as a regular step with the same scope as the parent step
      this._validateFlowStep(onFail, flowDef, state, opts, scope);

      // Special validation for onFail handlers
      if (onFail.callType && onFail.type !== 'FLOW') {
         state.errors.push(`onFail handler for step "${parentStep.id}" in flow "${flowDef.name}" has invalid attribute "callType" on ${onFail.type} step - only FLOW steps support callType`);
      }
   }

   /**
    * Checks for circular references in the flow call graph
    */
   private _checkCircularReferences(state: any): void {
      const visited = new Set<string>();
      const recursionStack = new Set<string>();

      const detectCycle = (flowName: string, path: string[]): void => {
         if (recursionStack.has(flowName)) {
            const cycleStart = path.indexOf(flowName);
            const cycle = path.slice(cycleStart).join(' → ') + ' → ' + flowName;
            state.warnings.push(`Circular flow reference detected: ${cycle}`);
            return;
         }

         if (visited.has(flowName)) {
            return;
         }

         visited.add(flowName);
         recursionStack.add(flowName);

         const calledFlows = state.flowCallGraph.get(flowName) || [];
         for (const calledFlow of calledFlows) {
            detectCycle(calledFlow, [...path, flowName]);
         }

         recursionStack.delete(flowName);
      };

      // Check each flow in the call graph
      for (const flowName of state.flowCallGraph.keys()) {
         if (!visited.has(flowName)) {
            detectCycle(flowName, []);
         }
      }
   }

   /**
    * Validates all flows in the flowsMenu
    * @param options - Validation options
    * @returns Summary of validation results
    */
   validateAllFlows(options: any = {}): any {
      const results = {
         totalFlows: this.flowsMenu.length,
         validFlows: 0,
         invalidFlows: 0,
         totalErrors: 0,
         totalWarnings: 0,
         flowResults: [] as any[],
         skippedSubFlows: [] as string[],
         summary: {
            errors: [] as string[],
            warnings: [] as string[]
         }
      };

      // PHASE 1: Identify sub-flows referenced by other flows
      const referencedSubFlows = new Set<string>();
      
      logger.info('🔍 Phase 1: Building sub-flow reference map...');
      
      for (const flow of this.flowsMenu) {
         // Quick scan for FLOW steps to identify sub-flows
         if (flow.steps) {
            for (const step of flow.steps) {
               if (step.type === 'FLOW' && step.value) {
                  referencedSubFlows.add(step.value);
               }
               // Check SWITCH branches for FLOW steps
               else if (step.type === 'SWITCH' && step.branches) {
                  for (const [branchKey, branchStep] of Object.entries(step.branches)) {
                     const branch = branchStep as any;
                     if (branch && branch.type === 'FLOW' && branch.value) {
                        referencedSubFlows.add(branch.value);
                     }
                  }
               }
               
               // Check onFail handlers for FLOW steps (onFail is a single step)
               if (step.onFail && !Array.isArray(step.onFail) && step.onFail.type === 'FLOW' && step.onFail.value) {
                  referencedSubFlows.add(step.onFail.value);
               }
            }
         }
      }
      
      logger.info(`🔗 Found ${referencedSubFlows.size} flows referenced as sub-flows: [${Array.from(referencedSubFlows).join(', ')}]`);

      // PHASE 2: Validate only top-level flows (not referenced as sub-flows)
      logger.info('🔍 Phase 2: Validating top-level flows...');
      
      for (const flow of this.flowsMenu) {
         if (referencedSubFlows.has(flow.name)) {
            // Skip validation of sub-flows - they'll be validated in parent context
            logger.info(`⏭️  Skipping sub-flow "${flow.name}" - will be validated in parent context`);
            results.skippedSubFlows.push(flow.name);
            
            // Add placeholder result for tracking
            results.flowResults.push({
               flowName: flow.name,
               isValid: true,
               errors: [],
               warnings: [],
               skipped: true,
               skipReason: 'Sub-flow - validated in parent context'
            });
            
            results.validFlows++;
            continue;
         }
         
         logger.info(`🔍 Validating top-level flow "${flow.name}"...`);
         
         // Create isolated validation state for each flow
         const result = this.validateFlow(flow.name, options);
         
         results.flowResults.push({
            flowName: flow.name,
            ...result
         });

         if (result.isValid) {
            results.validFlows++;
         } else {
            results.invalidFlows++;
         }

         results.totalErrors += result.errors.length;
         results.totalWarnings += result.warnings.length;

         // Collect unique errors and warnings for summary
         for (const error of result.errors) {
            if (!results.summary.errors.includes(error)) {
               results.summary.errors.push(error);
            }
         }
         for (const warning of result.warnings) {
            if (!results.summary.warnings.includes(warning)) {
               results.summary.warnings.push(warning);
            }
         }
      }

      logger.info(`📊 Validation complete: ${results.validFlows}/${results.totalFlows} flows validated (${results.skippedSubFlows.length} sub-flows skipped)`);
      
      return results;
   }

   // === ENHANCED VARIABLE SCOPE TRACKING ===

   /**
    * Gets the current variable scope available at a specific step
    * This includes variables defined in flow definition + variables created by previous steps
    */
   private _getCurrentStepScope(flowDef: any, stepIndex: number, state: any): Set<string> {
      const scope = new Set<string>();
      
      // Add flow-defined variables
      if (flowDef.variables) {
         for (const varName of Object.keys(flowDef.variables)) {
            scope.add(varName);
         }
      }
      
      // Add common runtime variables available in all flows
      scope.add('user_input');
      scope.add('current_time');
      scope.add('session_id');
      scope.add('user_id');
      scope.add('flow_start_time');

      // Add the global variables if defined
      if (this.globalVariables) {
         for (const varName of Object.keys(this.globalVariables)) {
            scope.add(varName);
         }
      }
      
      // Add variables created by previous steps in execution order
      if (flowDef.steps && Array.isArray(flowDef.steps) && stepIndex >= 0) {
         for (let i = 0; i < stepIndex; i++) {
            const prevStep = flowDef.steps[i];
            this._addStepVariablesToScope(prevStep, scope);
         }
      }
      
      return scope;
   }

   /**
    * Updates the variable scope after a step executes
    * This tracks what variables a step creates for subsequent validation
    */
   private _updateScopeAfterStep(step: any, flowDef: any, state: any): void {
      if (!state.stepVariables) {
         state.stepVariables = new Map();
      }
      
      const flowKey = `${flowDef.name}_${step.id}`;
      const stepVars = new Set<string>();
      
      this._addStepVariablesToScope(step, stepVars);
      
      if (stepVars.size > 0) {
         state.stepVariables.set(flowKey, stepVars);
      }
   }

   /**
    * Determines what variables a step creates/defines
    */
   private _addStepVariablesToScope(step: any, scope: Set<string>): void {
      // SAY-GET steps create variables from user input
      if (step.type === 'SAY-GET' && step.variable) {
         scope.add(step.variable);
      }
      
      // SET steps create/modify variables
      if (step.type === 'SET' && step.variable) {
         scope.add(step.variable);
      }
      
      // CALL-TOOL steps create variables from tool responses
      if (step.type === 'CALL-TOOL' && step.variable) {
         scope.add(step.variable);
         
         // If tool has known response structure, add nested variables
         // e.g., if variable is "user_data" and tool returns {name, email}, 
         // we could add "user_data.name", "user_data.email" etc.
         // For now, just add the main variable
      }
      
      // FLOW steps might create variables (would need to analyze sub-flow)
      if (step.type === 'FLOW' && step.variable) {
         scope.add(step.variable);
      }
   }

   /**
    * Validates tool arguments against tool schema
    */
   private _validateToolArguments(args: any, step: any, flowDef: any, state: any, opts: any): void {
      const tool = this.toolsRegistry.find((t: any) => t.id === step.tool);
      if (!tool || !tool.schema) {
         state.warnings.push(`Tool "${step.tool}" in step "${step.id}" has no schema for argument validation`);
         return;
      }

      // Validate required parameters
      if (tool.schema.required && Array.isArray(tool.schema.required)) {
         for (const requiredParam of tool.schema.required) {
            if (!args.hasOwnProperty(requiredParam)) {
               state.errors.push(`CALL-TOOL step "${step.id}" in flow "${flowDef.name}" missing required argument: ${requiredParam}`);
            }
         }
      }

      // Validate parameter types if schema provides them
      if (tool.schema.properties) {
         for (const [paramName, paramValue] of Object.entries(args)) {
            const paramSchema = tool.schema.properties[paramName];
            if (paramSchema && paramSchema.type) {
               // Basic type validation - this could be enhanced
               if (!this._validateArgumentType(paramValue, paramSchema, step, flowDef, state)) {
                  state.warnings.push(`CALL-TOOL step "${step.id}" argument "${paramName}" may not match expected type ${paramSchema.type}`);
               }
            }
         }
      }
   }

   /**
    * Validates variable references in arguments, values, etc.
    */
   private _validateVariableReferences(obj: any, step: any, flowDef: any, state: any, context: string, scope?: Set<string>): void {
      if (!obj || typeof obj !== 'object') {
         return;
      }

      const currentScope = scope || this._getCurrentStepScope(flowDef, -1, state);

      const validateString = (str: string, path: string) => {
         if (typeof str !== 'string') return;

         // Find template variable references {{variable}}
         const variableRefs = str.match(/\{\{([^}]+)\}\}/g);
         if (variableRefs) {
            for (const ref of variableRefs) {
               const varPath = ref.slice(2, -2).trim(); // Remove {{ }}
               
               // Handle expressions with operators (like || for fallbacks)
               if (varPath.includes('||')) {
                  const parts = varPath.split('||').map(p => p.trim());
                  for (const part of parts) {
                     // Skip literal values (strings in quotes, numbers)
                     if (part.startsWith("'") || part.startsWith('"') || /^\d+(\.\d+)?$/.test(part)) {
                        continue;
                     }
                     const rootVar = part.split('.')[0].trim();
                     if (rootVar && !currentScope.has(rootVar)) {
                        state.errors.push(`${context} in step "${step.id}" references undefined variable: ${rootVar} (full path: ${varPath})`);
                     }
                  }
               } else {
                  // Extract variable names from JavaScript expressions
                  const extractVariableNames = (expression: string): string[] => {
                     // Remove whitespace and split on various operators and delimiters
                     const cleaned = expression.replace(/\s+/g, ' ').trim();
                     
                     // Split on operators while preserving variable names
                     const parts = cleaned.split(/[+\-*/%&|!<>=()[\]{},;:?\\]+/)
                        .map(p => p.trim())
                        .filter(p => p.length > 0);
                     
                     const variableNames: string[] = [];
                     for (const part of parts) {
                        // Skip literals: numbers, strings, booleans, Math functions
                        if (/^(\d+(\.\d*)?|\.\d+)$/.test(part) || // numbers
                            /^['"`].*['"`]$/.test(part) || // strings
                            /^(true|false|null|undefined)$/.test(part) || // literals
                            /^Math\.|^JSON\.|^Date\.|^Object\./.test(part)) { // built-in objects
                           continue;
                        }
                        
                        // Extract the root variable name (before any dot notation)
                        const rootVar = part.split('.')[0];
                        if (rootVar && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(rootVar)) {
                           variableNames.push(rootVar);
                        }
                     }
                     return [...new Set(variableNames)]; // Remove duplicates
                  };
                  
                  const variableNames = extractVariableNames(varPath);
                  for (const rootVar of variableNames) {
                     if (!currentScope.has(rootVar)) {
                        state.errors.push(`${context} in step "${step.id}" references undefined variable: ${rootVar} (full path: ${varPath})`);
                     }
                  }
               }
            }
         }
      };

      // Recursively validate object
      const traverse = (obj: any, path: string = '') => {
         if (typeof obj === 'string') {
            validateString(obj, path);
         } else if (Array.isArray(obj)) {
            obj.forEach((item, index) => traverse(item, `${path}[${index}]`));
         } else if (obj && typeof obj === 'object') {
            for (const [key, value] of Object.entries(obj)) {
               traverse(value, path ? `${path}.${key}` : key);
            }
         }
      };

      traverse(obj);
   }

   /**
    * Validates response mapping configurations
    */
   private _validateResponseMapping(mapping: any, step: any, flowDef: any, state: any, scope?: Set<string>): void {
      if (!mapping || typeof mapping !== 'object') {
         return;
      }

      // Validate different mapping types
      if (mapping.type) {
         switch (mapping.type) {
            case 'jsonPath':
               this._validateJsonPathMapping(mapping, step, flowDef, state, scope);
               break;
            case 'object':
               this._validateObjectMapping(mapping, step, flowDef, state, scope);
               break;
            case 'array':
               this._validateArrayMapping(mapping, step, flowDef, state, scope);
               break;
            case 'template':
               this._validateTemplateMapping(mapping, step, flowDef, state, scope);
               break;
            case 'conditional':
               this._validateConditionalMapping(mapping, step, flowDef, state, scope);
               break;
            default:
               state.warnings.push(`Unknown response mapping type "${mapping.type}" in step "${step.id}"`);
         }
      }
   }

   /**
    * Validates argument type against schema
    */
   private _validateArgumentType(value: any, schema: any, step: any, flowDef: any, state: any): boolean {
      // If value contains template variables, we can't validate type at design time
      if (typeof value === 'string' && value.includes('{{')) {
         return true; // Assume valid - will be resolved at runtime
      }

      // Basic type checking
      switch (schema.type) {
         case 'string':
            return typeof value === 'string';
         case 'number':
            return typeof value === 'number' || !isNaN(Number(value));
         case 'boolean':
            return typeof value === 'boolean' || value === 'true' || value === 'false';
         case 'object':
            return typeof value === 'object' && value !== null;
         case 'array':
            return Array.isArray(value);
         default:
            return true; // Unknown type, assume valid
      }
   }

   // Response mapping validation helpers
   private _validateJsonPathMapping(mapping: any, step: any, flowDef: any, state: any, scope?: Set<string>): void {
      if (!mapping.mappings || typeof mapping.mappings !== 'object') {
         state.errors.push(`JSONPath mapping in step "${step.id}" missing "mappings" object`);
      }
   }

   private _validateObjectMapping(mapping: any, step: any, flowDef: any, state: any, scope?: Set<string>): void {
      if (!mapping.mappings || typeof mapping.mappings !== 'object') {
         state.errors.push(`Object mapping in step "${step.id}" missing "mappings" object`);
      }
   }

   private _validateArrayMapping(mapping: any, step: any, flowDef: any, state: any, scope?: Set<string>): void {
      if (mapping.itemMapping && typeof mapping.itemMapping !== 'object') {
         state.errors.push(`Array mapping in step "${step.id}" has invalid "itemMapping"`);
      }
   }

   private _validateTemplateMapping(mapping: any, step: any, flowDef: any, state: any, scope?: Set<string>): void {
      if (!mapping.template || typeof mapping.template !== 'string') {
         state.errors.push(`Template mapping in step "${step.id}" missing "template" string`);
      } else {
         // Validate variable references in template
         this._validateVariableReferences({ template: mapping.template }, step, flowDef, state, 'response mapping template', scope);
      }
   }

   private _validateConditionalMapping(mapping: any, step: any, flowDef: any, state: any, scope?: Set<string>): void {
      if (!Array.isArray(mapping.conditions)) {
         state.errors.push(`Conditional mapping in step "${step.id}" missing "conditions" array`);
      }
   }
}
