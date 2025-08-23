# JavaScript Flow Engine User Guide

## 📖 Documentation

- **[JavaScript Flow Engine User Guide](JavaScript%20Flow%20Engine.md)** - Comprehensive tutorials, examples, and best practices (this document)
- **[README.md](README.md)** - Technical API reference and quick start guide

*For technical API documentation, installation instructions, and architecture overview, see the **[README.md](README.md)**.*

## Table of Contents

[Introduction: JavaScript Flow Engine Overview](#introduction-javascript-flow-engine-overview)

1. [TOOL-CALL Support: Complete Integration Guide](#chapter-1-tool-call-support-complete-integration-guide)
2. [Variable Management and Expression System](#chapter-2-variable-management-and-expression-system)
3. [Workflows and Step Types](#chapter-3-workflows-and-step-types)
4. [Conditional Execution and Advanced Branching](#chapter-4-conditional-execution-and-advanced-branching)
5. [Flow Interruption and Resumption](#chapter-5-flow-interruption-and-resumption)
6. [Testing and Debugging Workflows](#chapter-6-testing-and-debugging-workflows)

[Conclusion and Next Steps](#conclusion-and-next-steps) 

---

# Introduction: JavaScript Flow Engine Overview

## What is the JavaScript Flow Engine?

The **JavaScript Flow Engine** is a sophisticated, host-agnostic workflow orchestration system designed to serve as a **pluggable intent detector and workflow orchestrator** for any conversational platform. Whether integrated with AI chat assistants, live agent systems, customer service platforms, or any other conversational interface, the engine provides reliable, secure, and intelligent workflow automation.

## Core Concepts

### Pluggable Architecture

The engine acts as an intelligent **gatekeeper** that sits at the early ping-pong of conversational interactions:

- **Intent Detection**: Uses targeted AI to analyze user input and detect actionable intents
- **Workflow Mapping**: Maps detected intents to specific, predefined workflows 
- **Safe Execution**: Executes workflows with controlled access to tools and integrations
- **Context Preservation**: Maintains conversation context across complex multi-step processes

### Host-Agnostic Design

The engine makes **no assumptions about its hosting environment** (Node and Browser supported) and can integrate with:

- **AI Chat Assistants**: ChatGPT, Claude, Gemini, or custom AI implementations
- **Live Agent Systems**: Customer service platforms, helpdesk solutions
- **Conversational Tools**: Chatbots, voice assistants, messaging platforms
- **Custom Applications**: Any system that processes user intent and requires workflow execution
- **Hybrid Systems**: Mixed human-AI environments where workflows can be triggered by either

## ⚠️ Critical Session Management Notice

**IMPORTANT**: All code examples in this guide have been updated to reflect the correct session management pattern. The `updateActivity()` method returns an updated `EngineSessionContext` that **must be captured and used** for all subsequent calls to prevent session corruption.

### Key Pattern to Remember:
```javascript
// ✅ ALWAYS capture the returned session context
sessionContext = await engine.updateActivity(entry, sessionContext);

// ✅ ALWAYS check for workflow responses  
if (sessionContext.response) {
  return sessionContext.response;
}
```

**Never use `const` for session context** - always use `let` so you can update the reference. See the [Critical Session Management Patterns](#critical-session-management-patterns) section for comprehensive details.

---

### Intent Detection and Execution Flow

```
User Input → Intent Analysis → Workflow Activation → Controlled Execution → Response
     ↑              ↑               ↑                    ↑               ↓
 Host System → Flow Engine → Tool Registry → Approved Functions → Host System
```

## Integration Architecture

### Core Registries

The engine operates through four primary registries that define its capabilities:

#### 1. **Flows Registry** - Workflow Definitions
```javascript
const flowsMenu = [
  {
    id: "payment-workflow",
    name: "ProcessPayment", 
    prompt: "Process a payment",
    description: "Handle payment processing with validation",
    primary: true, // Mark as user-facing entry point flow
    steps: [
      { type: "SAY", value: "Let's process your payment." },
      { type: "SAY-GET", variable: "amount", value: "Enter amount:" },
      { type: "CALL-TOOL", tool: "PaymentProcessor", args: {...} }
    ]
  }
];
```

#### 2. **Tools Registry** - External Integrations
```javascript
const toolsRegistry = [
  {
    id: "PaymentProcessor",
    name: "Process Payment",
    description: "Processes financial transactions securely",
    parameters: { /* OpenAI Function Calling Standard Schema */ },
    implementation: {
      type: "local", // or "http" for APIs
      function: "processPayment",
      timeout: 10000
    },
    security: {
      requiresAuth: true,
      auditLevel: "critical",
      dataClassification: "financial"
    }
  }
];
```

#### 3. **Approved Functions Registry** - Secure Local Functions
```javascript
const APPROVED_FUNCTIONS = {};

// Define secure local functions
async function processPayment(args) {
  // Secure payment processing logic
  return { transactionId: "...", status: "success" };
}

// Register approved functions
APPROVED_FUNCTIONS['processPayment'] = processPayment;
```

#### 4. **Global Variables** - Secure Sharing of Local Data
```javascript
const globalVariables = {
  caller_id: "(555) 123-4567",
  caller_name: "John Doe", 
  thread_id: "conversation-123"
};
```

### Engine Initialization

Initialize the engine with all required components:

```javascript
import { WorkflowEngine } from './jsfe.ts.js';

// Initialize the engine
context.engine = new WorkflowEngine(
  hostLogger,           // Any logger supporting .debug/.info/.warn/.error (or null)
  aiCallback,           // host provided access to AI function that receives <systemInstruction>, <userMessage> and returns <string response>
  flowsMenu,            // Available workflows
  toolsRegistry,        // Tool definitions
  APPROVED_FUNCTIONS,   // Secure local functions
  globalVariables,      // Session-wide variables (optional)
  validateOnInit,       // Integrity validation flag (optional, default: true)
  language,             // Language preference (optional, 'en', 'es', etc.)
  aiTimeOut,            // AI timeout in milliseconds (optional, default: 1000ms)
  messageRegistry,      // Custom message templates (optional)
  guidanceConfig        // User guidance settings (optional)
);
```

#### Engine Initialization Parameters

The WorkflowEngine constructor accepts the following parameters in order, each serving a specific purpose in the engine's operation:

**1. hostLogger** (Logger | null)
- **Purpose**: Primary logging interface for the host application
- **Requirements**: Must support `.debug()`, `.info()`, `.warn()`, `.error()` methods
- **Usage**: Engine uses this for all operational logging and debugging output
- **Example**: Winston, or custom logger implementation
- **Nullable**: Can be `null` to disable host application logging

**2. aiCallback** (Function)
- **Purpose**: AI communication function for intent detection and response generation
- **Signature**: `async (systemInstruction: string, userMessage: string) => string`
- **Integration**: Engine calls this function when AI analysis is needed
- **Requirements**: Must return AI response as string, handle errors gracefully
- **Details**: See dedicated AI Callback Function section below

**3. flowsMenu** (FlowDefinition[])
- **Purpose**: Array of available workflow definitions
- **Content**: All workflows that the engine can detect and execute
- **Validation**: Engine validates flow structure during initialization
- **Requirements**: Each flow must have valid id, name, description, and steps

**4. toolsRegistry** (ToolDefinition[])
- **Purpose**: Array of external tool definitions for CALL-TOOL steps
- **Content**: HTTP APIs, local functions, and mock tools available to workflows
- **Validation**: Parameter schemas validated against OpenAI Function Calling Standard
- **Security**: Tools define their own security levels and authentication requirements

**5. APPROVED_FUNCTIONS** (Object)
- **Purpose**: Secure registry of pre-approved local JavaScript functions
- **Security**: Only functions in this object can be executed by local-type tools
- **Format**: Plain object where keys are function names and values are the actual functions
- **Validation**: Functions must match tool definitions in toolsRegistry

**6. globalVariables** (Record<string, unknown>, optional)
- **Purpose**: Session-wide variables accessible to all workflows
- **Scope**: Available to all flows in the session via variable interpolation
- **Security**: Safe sharing of host application data with workflows
- **Examples**: User ID, session ID, application configuration, environmental data
- **Nature**: **STATIC** - Set during engine initialization, same for all sessions

### Alternative Setting logger: engine.logger = logger
**hostLogger** (Logger)
- **Purpose**: Primary logging interface for the host application
- **Requirements**: Must support `.debug()`, `.info()`, `.warn()`, `.error()` methods
- **Usage**: Engine uses this for all operational logging and debugging output
- **Example**: Winston, or custom logger implementation

```javascript
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'warn',  // Enable debug logging to trace validation
  format: winston.format.printf(({ level, message }) => {
    return `${level}: ${message}`;
  }),
  transports: [
    new winston.transports.Console()
  ]
});

engine.logger = logger;
```

### Dynamic Session Data: The `cargo` Property

While `globalVariables` are static and shared across all sessions, each `EngineSessionContext` has a `cargo` property for **dynamic, session-specific data sharing**:

```javascript
// After initSession, you can set dynamic session data
let sessionContext = engine.initSession('user-123', 'session-456');

// Set dynamic data that workflows can access
sessionContext.cargo.userProfile = {
  name: 'Alice Johnson',
  tier: 'premium',
  preferences: { theme: 'dark', notifications: true }
};

sessionContext.cargo.currentTransaction = {
  id: 'TXN-789',
  amount: 150.00,
  status: 'pending'
};

sessionContext.cargo.temporaryState = {
  lastSearchQuery: 'laptop deals',
  cartItems: 3,
  sessionStartTime: Date.now()
};

// Workflows can reference cargo data with variable interpolation
// Example flow step:
// { type: "SAY", value: "Welcome back {{cargo.userProfile.name}}! You have {{cargo.cartItems}} items in your cart." }
```

**Key Differences: `globalVariables` vs `cargo`**

| Feature            | `globalVariables`.            | `cargo`                       |
|--------------------|-------------------------------|-------------------------------|
| **Scope**          | Engine-wide, all sessions     | Session-specific              |
| **Mutability**     | Static, set at initialization | Dynamic, modifiable anytime   |
| **Lifecycle**      | Exists for engine lifetime    | Exists for session lifetime   |
| **Use Cases**      | API keys, system config.      | User data, conversation state |
| **Access Pattern** | `{{globalVar}}`               | `{{cargo.property}}`          |
| **Example**        | `{{app_name}}`                | `{{cargo.user.name}}`         |

**When to Use Each:**
- **globalVariables**: Configuration, constants, application metadata that doesn't change
- **cargo**: User-specific data, conversation context, dynamic state that changes during interaction

**7. validateOnInit** (boolean, optional)
- **Purpose**: Enable comprehensive flow and tool validation during initialization
- **Default**: `true` - recommended for development and production
- **Performance**: Set to `false` only in high-performance scenarios with pre-validated flows
- **Output**: Detailed validation reports with errors, warnings, and success metrics

**8. language** (string, optional)
- **Purpose**: User's preferred language for localized messages and prompts
- **Format**: ISO language code ('en', 'es', 'fr', 'de', etc.)
- **Default**: 'en' if not specified
- **Usage**: Engine selects appropriate prompt_xx properties from flow definitions

**9. aiTimeOut** (number, optional)
- **Purpose**: Timeout in milliseconds for AI callback function calls
- **Default**: 1000ms (1 second) if not specified
- **Usage**: Prevents AI calls from hanging indefinitely, providing better reliability
- **Range**: Recommended range 1000-30000ms depending on AI service response times
- **Special Value**: Set to `0` to disable timeout (no time limit on AI calls)
- **Error Handling**: Throws timeout error if AI call exceeds specified duration

**10. messageRegistry** (MessageRegistry, optional)
- **Purpose**: Custom message templates for engine-generated user messages
- **Format**: Multi-language message registry with customizable system messages
- **Override**: Allows customization of built-in engine messages
- **Localization**: Supports multiple languages with fallback to default messages

**11. guidanceConfig** (GuidanceConfig, optional)
- **Purpose**: Configuration for user guidance and help messages
- **Features**: Controls how and when the engine provides user assistance
- **Modes**: Append, prepend, template, or none for guidance integration
- **Context**: Different guidance for general vs. payment/financial workflows

### AI Callback Function

The `aiCallback` parameter provides the engine access to your AI system for intent detection and workflow triggering. Here's a minimal implementation example:

```javascript
// Minimal AI callback implementation
async function aiCallback(systemInstruction, userMessage) {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${YOUR_OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userMessage }
        ],
        temperature: 0.1,
        max_tokens: 200
      })
    });

    if (!response.ok) {
      throw new Error(`AI API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
    
  } catch (error) {
    throw new Error(`AI communication failed: ${error.message}`);
  }
}
```

**AI Callback Interface:**
- **Input**: `systemInstruction` (string), `userMessage` (string)
- **Output**: AI response as a string
- **Purpose**: Analyzes user input to detect workflow intents and generate responses
- **Integration**: The engine calls this function when it needs AI analysis for intent detection

**How the Engine Generates Input Arguments:**
- **`systemInstruction`**: Dynamically generated by the engine based on:
  - Available flow definitions and their descriptions
  - Current session context and active flows
  - Current conversation state and collected variables
- **`userMessage`**: Intelligently composed by the engine, including:
  - The actual user input/prompt
  - Relevant contextual information from the conversation
  - Session state and variables needed for intent analysis

Both parameters are carefully engineered by the engine to work together for optimal intent detection. The engine automatically constructs comprehensive, context-aware prompts that provide the AI with all necessary information for accurate workflow selection and response generation. Your aiCallback implementation only needs to send these pre-constructed arguments to your AI service and return the response.

**Alternative AI Services:**
You can integrate any AI service (Claude, Gemini, local LLMs, etc.) by implementing this same interface. The engine only requires a function that takes system instructions and user input, then returns an AI response.


### Flow Definition Structure

Each workflow is defined using a comprehensive FlowDefinition interface that supports localization, metadata, and declarative configuration:

```typescript
interface FlowDefinition {
  id: string;                          // Unique flow identifier
  name: string;                        // Human-readable flow name
  description: string;                 // Clear description of what the flow does
  version: string;                     // Flow version for compatibility
  steps: FlowStep[];                   // Array of executable flow steps
  primary?: boolean;                   // Optional: Marks this as a primary (user-facing) flow
  
  // Localization Support
  prompt?: string;                     // Default prompt for the flow
  prompt_en?: string;                  // English prompt (default)
  prompt_es?: string;                  // Spanish prompt
  prompt_pt?: string;                  // Portuguese prompt
  prompt_fr?: string;                  // French prompt
  prompt_de?: string;                  // German prompt
  [key: `prompt_${string}`]: string | undefined; // Support for any language code
  
  // Optional Configuration
  variables?: Record<string, {         // Flow-specific variable definitions
    type: string;                      // Variable type (string, number, boolean, etc.)
    scope: string;                     // Variable scope (flow, global, session)
    value?: unknown;                   // Initial value for the variable
  }>;
  
  metadata?: {                         // Flow metadata for classification
    riskLevel?: string;                // Risk classification (low, medium, high, critical)
    category?: string;                 // Flow category (payment, support, information, etc.)
    [key: string]: unknown;            // Additional custom metadata
  };
}
```

**Key Definition Properties:**

- **Core Identity**: `id`, `name`, `description`, `version` define the flow's identity and purpose
- **Execution Logic**: `steps` array contains the declarative workflow logic
- **Flow Classification**: `primary` property distinguishes user-facing entry points from helper sub-flows
  - `primary: true`: User-facing workflows that can be directly triggered by user input
  - `primary: false` or omitted: Helper/sub-flows called by other flows, not directly accessible
  - **Validation Impact**: Only primary flows are validated as top-level workflows during initialization
  - **AI Detection**: Only primary flows are considered for intent detection and user interaction
- **Multi-language Support**: Engine automatically selects appropriate prompt based on user's language preference
- **Variable Management**: Define flow-specific variables with types, scopes, and initial values
- **Risk Classification**: `metadata.riskLevel` enables security-conscious flow handling
- **Categorization**: `metadata.category` helps with flow organization and discovery

**Localization Example:**
```javascript
{
  id: "payment-flow",
  name: "ProcessPayment",
  description: "Handle secure payment processing",
  primary: true,                                       // Mark as user-facing entry point
  prompt: "Let's process your payment",                // Default
  prompt_en: "Let's process your payment",             // English
  prompt_es: "Procesemos su pago",                     // Spanish  
  prompt_fr: "Traitons votre paiement",                // French
  prompt_de: "Lassen Sie uns Ihre Zahlung bearbeiten", // German
  version: "1.0.0",
  steps: [
    { type: "SAY", value: "I'll help you with your payment." },
    { type: "SAY-GET", variable: "amount", value: "Enter the payment amount:" }
  ],
  metadata: {
    riskLevel: "high",
    category: "financial"
  }
}
```

**Primary vs. Sub-Flow Architecture Example:**

```javascript
const flowsMenu = [
  // PRIMARY FLOW - User-facing entry point
  {
    id: "start-payment",
    name: "StartPayment",
    primary: true,                    // Marks this as directly accessible to users
    prompt: "Process a payment",
    description: "Main payment processing workflow",
    variables: {
      amount: { type: "string", description: "Payment amount" },
      account_number: { type: "string", description: "Customer account" }
    },
    steps: [
      { type: "SAY-GET", variable: "amount", value: "Enter payment amount:" },
      { 
        type: "CASE", 
        branches: {
          "condition: validateAmount(amount)": {
            type: "CALL-TOOL", 
            tool: "ProcessPayment",
            variable: "payment_result"
          },
          "default": {
            type: "FLOW",
            value: "retry-payment-amount",  // Calls sub-flow
            mode: "replace"
          }
        }
      }
    ]
  },
  
  // SUB-FLOW - Helper flow for error handling
  {
    id: "retry-payment-amount",
    name: "RetryPaymentAmount",
    // No 'primary' property - this is a helper flow
    description: "Retry payment amount collection after validation error",
    steps: [
      { 
        type: "SAY", 
        value: "Sorry, '{{amount}}' is not a valid amount. Let's try again." 
      },
      { 
        type: "FLOW", 
        value: "start-payment",  // Returns to primary flow
        mode: "replace" 
      }
    ]
  }
];
```

**Validation Benefits:**
- **Primary flows** are validated as standalone workflows with complete variable context
- **Sub-flows** are validated only when called from primary flows, ensuring proper variable inheritance
- **No false errors** for sub-flows that depend on variables from their calling flows
- **Complete coverage** through deep traversal of the flow call graph during validation

**Flow Execution Context:**
During execution, the engine creates lightweight FlowFrame objects that maintain execution state while accessing FlowDefinition properties dynamically for optimal memory usage and localization support.

### Tool Definition Structure

Tools provide external capabilities that flows can invoke through CALL-TOOL steps. Each tool is defined with comprehensive configuration for security, validation, and integration:

```typescript
interface ToolDefinition {
  id: string;                          // Unique tool identifier
  name: string;                        // Human-readable tool name
  description: string;                 // Clear description of tool functionality
  
  // Parameter Validation (OpenAI Function Calling Standard)
  parameters?: {
    type: string;                      // Usually "object"
    properties?: Record<string, PropertySchema>; // Parameter definitions
    required?: string[];               // Required parameter names
    additionalProperties?: boolean;    // Allow additional parameters
  };
  
  // Tool Implementation
  implementation?: {
    type: 'local' | 'http';           // Execution type
    
    // Local Function Implementation
    function?: string;                 // Function name in APPROVED_FUNCTIONS
    
    // HTTP API Implementation  
    url?: string;                      // API endpoint URL with {param} placeholders
    method?: HttpMethod;               // HTTP method (GET, POST, PUT, etc.)
    contentType?: string;              // Request content type
    pathParams?: string[];             // Parameters to substitute in URL
    queryParams?: string[];            // Parameters to add as query string
    headers?: Record<string, string>;  // Custom headers
    timeout?: number;                  // Request timeout in milliseconds
    retries?: number;                  // Number of retry attempts
    
    // Response Processing
    responseMapping?: MappingConfig;   // Transform API response
  };
  
  // Security Configuration
  apiKey?: string;                     // Bearer token for authentication
  riskLevel?: 'low' | 'medium' | 'high'; // Security classification
  category?: string;                   // Tool category (financial, data, etc.)
  security?: {
    rateLimit?: {
      requests: number;                // Max requests
      window: number;                  // Time window in milliseconds
    };
  };
}
```

**Key Tool Properties:**

- **Identity & Documentation**: `id`, `name`, `description` define the tool's purpose
- **Parameter Validation**: OpenAI Function Calling Standard schema for type safety
- **Flexible Implementation**: Support for both local functions and HTTP APIs
- **Security Controls**: Rate limiting, risk classification, and authentication
- **Response Transformation**: Declarative mapping to structure API responses

**Local Function Tool Example:**
```javascript
{
  id: "ValidateAccount",
  name: "Account Validator",
  description: "Validates customer account numbers and status",
  parameters: {
    type: "object",
    properties: {
      accountNumber: {
        type: "string",
        description: "Customer account number",
        pattern: "^[0-9]{6,12}$"
      }
    },
    required: ["accountNumber"]
  },
  implementation: {
    type: "local",
    function: "validateAccount"  // Must be in APPROVED_FUNCTIONS
  },
  riskLevel: "medium",
  category: "validation"
}
```

**HTTP API Tool Example:**
```javascript
{
  id: "WeatherAPI",
  name: "Weather Information",
  description: "Get current weather for any city",
  parameters: {
    type: "object", 
    properties: {
      city: {
        type: "string",
        description: "City name for weather lookup"
      }
    },
    required: ["city"]
  },
  implementation: {
    type: "http",
    url: "https://wttr.in/{city}",
    method: "GET",
    pathParams: ["city"],
    queryParams: ["format"],
    timeout: 5000,
    responseMapping: {
      type: "jsonPath",
      mappings: {
        "temperature": "current_condition[0].temp_C",
        "condition": "current_condition[0].weatherDesc[0].value"
      }
    }
  },
  riskLevel: "low",
  category: "information"
}
```


### Response Mapping Configuration (MappingConfig Interface)

The `responseMapping` property in ToolDefinition supports comprehensive data transformation through multiple mapping types. This configuration reference enables developers to structure their tool responses precisely:

```typescript
export type MappingConfig =
  | JsonPathMappingConfig
  | ObjectMappingConfig  
  | ArrayMappingConfig
  | TemplateMappingConfig
  | ConditionalMappingConfig
  | PathConfig
  | string
  | Record<string, unknown>;

// JSONPath-based field extraction and transformation
export type JsonPathMappingConfig = {
  type: 'jsonPath';
  mappings: Record<string, {
    path: string;                              // JSONPath expression for data extraction
    transform?: ValueTransformConfig;          // Optional value transformation
    fallback?: unknown;                        // Fallback value if path not found
  }>;
  strict?: boolean;                            // Strict mode validation
};

// Object structure mapping with nested support
export type ObjectMappingConfig = {
  type: 'object';
  mappings: Record<string, string | PathConfig | MappingConfig | object>;
  strict?: boolean;                            // Strict mode validation
};

// Array processing with filtering, sorting, and pagination
export type ArrayMappingConfig = {
  type: 'array';
  source?: string;                             // Source array path
  filter?: ConditionConfig;                    // Filtering conditions
  itemMapping?: MappingConfig;                 // Per-item transformation
  sort?: { field: string; order?: 'asc' | 'desc' }; // Sorting configuration
  offset?: number;                             // Pagination offset
  limit?: number;                              // Pagination limit  
  fallback?: unknown[];                        // Fallback array if source not found
};

// Template-based string generation with variable substitution
export type TemplateMappingConfig = {
  type: 'template';
  template: string;                            // Template string with {{variable}} placeholders
  dataPath?: string;                           // Optional path to resolve template data from
};

// Conditional logic-based mapping selection
export type ConditionalMappingConfig = {
  type: 'conditional';
  conditions: Array<{
    if: ConditionConfig;                       // Condition evaluation
    then: MappingConfig;                       // Mapping to apply if condition true
  }>;
  else?: MappingConfig;                        // Default mapping if no conditions match
};

// Path-based value extraction with transformation
export type PathConfig = {
  path: string;                                // Data path for extraction
  transform?: ValueTransformConfig;            // Optional value transformation
  fallback?: unknown;                          // Fallback value if path not found
};

// Comprehensive value transformation system with 25+ transform types
export interface ValueTransformConfig {
  type: 'parseInt' | 'parseFloat' | 'toLowerCase' | 'toUpperCase' | 'trim' | 
        'replace' | 'concat' | 'regex' | 'date' | 'default' | 'conditional' | 
        'substring' | 'split' | 'join' | 'abs' | 'round' | 'floor' | 'ceil' | 
        'template' | 'sum' | 'average' | 'count' | 'min' | 'max' | 'multiply' | 
        'divide' | 'percentage' | 'add' | 'subtract' | 'currentYear' | 
        'yearDifference' | 'handlebars' | 'custom';
  
  // Common transformation parameters
  fallback?: unknown;                          // Default value for failed transforms
  prefix?: string;                             // String prefix for concat operations
  suffix?: string;                             // String suffix for concat operations
  pattern?: string;                            // Regex pattern for replace/match operations
  replacement?: string;                        // Replacement string for regex operations
  template?: string;                           // Template string for template transforms
  value?: unknown;                             // Static value for default transforms
  
  // Mathematical operation parameters
  precision?: number;                          // Decimal precision for rounding operations
  divisor?: number;                            // Divisor for division/percentage operations
  multiplier?: number;                         // Multiplier for multiplication operations
  addend?: number;                             // Value to add for addition operations
  subtrahend?: number;                         // Value to subtract for subtraction operations
  
  // Array and aggregation parameters
  field?: string;                              // Field name for array aggregations
  delimiter?: string;                          // Delimiter for join/split operations
  index?: number;                              // Array index for element selection
  
  // Conditional and date parameters
  condition?: ConditionConfig;                 // Condition for conditional transforms
  fromYear?: number;                           // Start year for year difference calculations
  dataPath?: string;                           // Path for accessing context data
}

// Flexible condition evaluation system
export interface ConditionConfig {
  field: string;                               // Field path for evaluation
  operator: 'equals' | 'eq' | 'notEquals' | 'ne' | 'contains' | 'exists' | 
            'notExists' | 'greaterThan' | 'gt' | 'lessThan' | 'lt' | 
            'greaterThanOrEqual' | 'gte' | 'lessThanOrEqual' | 'lte' | 
            'startsWith' | 'endsWith' | 'matches' | 'in' | 'hasLength' | 
            'isArray' | 'isObject' | 'isString' | 'isNumber';
  value?: unknown;                             // Comparison value for operators
}
```
#### The validateOnInit Parameter

The `validateOnInit` parameter (boolean, default: `true`) controls whether the engine performs comprehensive integrity validation during initialization. When enabled, the engine's validator performs deep analysis of all flows and tools to detect potential execution errors before they occur in production.

**Validation Features:**
- **Flow Structure Validation**: Ensures all flows have required metadata (id, name, description, steps)
- **Tool Registry Verification**: Validates that all referenced tools exist in the toolsRegistry
- **Parameter Schema Checking**: Verifies tool parameters conform to JSON Schema standards
- **Variable Scope Analysis**: Detects variable usage issues and scope violations
- **Circular Reference Detection**: Identifies flows that call each other in infinite loops
- **Step Type Validation**: Ensures all step types are recognized and properly configured
- **Expression Syntax Checking**: Validates template expressions and variable references
- **Deep Dependency Analysis**: Recursively validates sub-flows and their dependencies

**Validation Output Examples:**
```
✅ All 15 flows passed validation successfully!
📊 Validation Summary: 15/15 flows valid, 0 errors, 3 warnings

⚠️  Flow "UserOnboarding" has 1 warnings:
   • Step 5: Variable 'user_email' used before being defined

❌ Flow validation failed: 2 errors, 1 warnings
❌ Flow "PaymentProcessing" has 2 errors:
   • Step 3: Tool 'PaymentGateway' not found in toolsRegistry
   • Step 7: Invalid expression syntax: {{amount + tax}
```

**Best Practices:**
- Keep `validateOnInit: true` in development to catch issues early
- Consider `validateOnInit: false` in high-performance production environments where flows are pre-validated
- Use validation results to improve flow quality and prevent runtime failures
- Review validation warnings as they often indicate potential improvement areas

**Configuration Guidance for Developers:**

- **JsonPathMappingConfig**: Use for extracting specific fields from complex API responses with JSONPath expressions
- **ObjectMappingConfig**: Use for restructuring response data into new object layouts with field mapping
- **ArrayMappingConfig**: Use for processing arrays with filtering, sorting, pagination, and per-item transformations
- **TemplateMappingConfig**: Use for generating formatted strings with dynamic variable substitution
- **ConditionalMappingConfig**: Use for applying different mapping strategies based on response data conditions
- **ValueTransformConfig**: Comprehensive transformation system supporting mathematical operations, string manipulation, date processing, and conditional logic
- **ConditionConfig**: Flexible condition evaluation for filtering and conditional transformations

This interface system enables developers to configure precise data transformations without code injection, maintaining security while providing maximum flexibility for API response handling.

**Tool Integration in Flows:**
Tools are invoked from flows using CALL-TOOL steps, with automatic parameter validation and response handling according to the tool definition.

### Integration Pattern: The updateActivity() Method

The engine integrates with host systems through the **`updateActivity()`** method, which handles the complete intent detection and execution cycle:

#### Step-by-Step Usage Process

0. **Initialize Engine**: Set up the WorkflowEngine with your configurations
1. **Initialize Session**: Create a session context for conversation management
2. **Create ContextEntry**: Format user input as a ContextEntry object  
3. **Call updateActivity()**: Pass the ContextEntry and session context to the engine
4. **Handle Response**: Process the workflow result or continue with regular conversation

#### Engine Initialization
```javascript
import { WorkflowEngine } from './jsfe.ts.js';

// Initialize the engine (typically done once at application startup)
const engine = new WorkflowEngine(logger, fetchAiResponse, flowsMenu, toolsRegistry, APPROVED_FUNCTIONS, globalVariable, true, parsed.lang, 2000); // 2 second timeout for AI calls
```

#### Session Initialization
```javascript
// Initialize the session (typically done once per session when supporting multiple user sessions)
let sessionContext = engine.initSession('test-user', 'test-session');
/*
  Store the returned context into your host context for the respective session. 
  It should be passed as argument to all subsequent engine.updateActivity() calls  
  CRITICAL: Always update your session reference after each updateActivity() call
*/
context.sessionContext = sessionContext
```

#### Create ContextEntry
```javascript
const contextEntry = {
  role: 'user',
  content: input,
  timestamp: Date.now()
```

#### Call updateActivity()
```javascript
  const updatedSessionContext = await engine.updateActivity(contextEntry, context.sessionContext);
  context.sessionContext = updatedSessionContext; // CRITICAL: Always update your session reference
  
  // If flow activated you should not proceed to your normal handling
  if (updatedSessionContext.response) {
    return updatedSessionContext.response;
  }
```


#### Integration Example
```javascript
async function handleUserInput(input, sessionContext) {
  // Create ContextEntry for user input
  const contextEntry = {
    role: 'user',
    content: input,
    timestamp: Date.now()
  };
  
  // Try workflow engine first and update session context
  const updatedSessionContext = await engine.updateActivity(contextEntry, sessionContext);
  sessionContext = updatedSessionContext; // CRITICAL: Update session reference
  
  if (updatedSessionContext.response) {
    return updatedSessionContext.response; // Engine handled the request
  }

  // Handle as regular conversation
  const reply = await generateAIResponse(input);
  
  // Update engine with assistant response for context
  sessionContext = await engine.updateActivity({
    role: 'assistant', 
    content: reply,
    timestamp: Date.now()
  }, sessionContext);

  return reply;
}
```

## Critical Session Management Patterns

### Understanding Session Context Updates

The `updateActivity()` method returns an **updated `EngineSessionContext`** that must be captured and used for all subsequent calls. This is critical for maintaining workflow state and preventing session corruption.

#### ❌ Common Mistake - Not Updating Session Reference
```javascript
// WRONG - This causes session corruption
const sessionContext = engine.initSession('user-123', 'session-456');

await engine.updateActivity(userEntry, sessionContext); // Session state lost!
// Subsequent calls will have corrupted or invalid session state
```

#### ✅ Correct Pattern - Always Update Session Reference
```javascript
// CORRECT - Session state maintained properly
let sessionContext = engine.initSession('user-123', 'session-456');

// Always capture the returned session context
sessionContext = await engine.updateActivity(userEntry, sessionContext);

// Check for workflow response
if (sessionContext.response) {
  return sessionContext.response;
}

// ... you normal processing

// Record response of your normal process to the sessionContext
sessionContext = await engine.updateActivity(assistantEntry, sessionContext);
```

### Session Isolation for Multiple Users

When handling multiple users or sessions, ensure complete isolation:

```javascript
// Maintain session per user/conversation
const userSessions = new Map();

async function handleUserMessage(userId, sessionId, message) {
  // Get or create session for this user
  const sessionKey = `${userId}-${sessionId}`;
  let sessionContext = userSessions.get(sessionKey);
  
  if (!sessionContext) {
    sessionContext = engine.initSession(userId, sessionId);
  }
  
  // Process message and update session
  sessionContext = await engine.updateActivity({
    role: 'user',
    content: message,
    timestamp: Date.now()
  }, sessionContext);
  
  // Store updated session
  userSessions.set(sessionKey, sessionContext);
  
  // Return response if workflow was triggered
  if (sessionContext.response) {
    return sessionContext.response;
  }
  
  // Handle normal conversation...
  // ...

  // Update engine with assistant response for context
  sessionContext = await engine.updateActivity({
    role: 'assistant', 
    content: reply, // The reply generated by your process
    timestamp: Date.now()
  }, sessionContext);
}
```

### Session Cargo: Dynamic Data Management

Each session context includes a `cargo` property for dynamic, session-specific data sharing between your application and workflows:

```javascript
// Initialize session
let sessionContext = engine.initSession('user-123', 'session-456');

// Set dynamic session data before or during conversation
sessionContext.cargo.userProfile = {
  name: 'Alice Johnson',
  accountType: 'premium',
  lastLogin: new Date().toISOString()
};

sessionContext.cargo.currentOrder = {
  id: 'ORD-789',
  items: 3,
  total: 249.99,
  status: 'in_cart'
};

sessionContext.cargo.conversationState = {
  topic: 'billing_inquiry',
  priority: 'high',
  agentRequired: false
};

// Workflows can access cargo data in any step
// Flow example:
// { type: "SAY", value: "Hello {{cargo.userProfile.name}}! Your order {{cargo.currentOrder.id}} is ready." }

// Update cargo during conversation as needed
async function updateUserContext(userId, sessionContext) {
  // Fetch fresh user data from your system
  const userProfile = await getUserProfile(userId);
  const currentOrder = await getCurrentOrder(userId);
  
  // Update session cargo with fresh data
  sessionContext.cargo.userProfile = userProfile;
  sessionContext.cargo.currentOrder = currentOrder;
  
  return sessionContext;
}

// Example: Update cargo before processing user message
sessionContext = await updateUserContext('user-123', sessionContext);
sessionContext = await engine.updateActivity(userEntry, sessionContext);
```

**Cargo Use Cases:**
- **User Context**: Profile data, preferences, account status
- **Transaction State**: Current orders, cart contents, payment status  
- **Conversation Data**: Topic tracking, escalation flags, temporary values
- **Application State**: Feature flags, permissions, session metadata

**Cargo vs Global Variables:**
- **Global Variables**: Static app config (`{{app_name}}`, `{{support_email}}`)
- **Cargo**: Dynamic session data (`{{cargo.user.name}}`, `{{cargo.order.total}}`)

### Test Suite Session Management

When creating test suites, **create fresh sessions for each test** to prevent contamination:

```javascript
// ❌ Wrong - Shared session causes test failures
const globalSession = engine.initSession('test-user', 'test-session');

for (const testCase of testCases) {
  // This will cause session corruption between tests!
  await runTest(testCase, globalSession);
}

// ✅ Correct - Fresh session per test
for (let i = 0; i < testCases.length; i++) {
  const testCase = testCases[i];
  
  // Create fresh session for each test
  let sessionContext = engine.initSession('test-user', `test-session-${i+1}`);
  
  await runTest(testCase, sessionContext);
}

async function runTest(inputs, sessionContext) {
  for (const input of inputs) {
    // Always update session context in tests
    sessionContext = await engine.updateActivity({
      role: 'user',
      content: input,
      timestamp: Date.now()
    }, sessionContext);
    
    if (sessionContext.response) {
      console.log('Test Response:', sessionContext.response);
    }
  }
}
```
`

## Engine Behavior and Intelligence

### Intent Detection

The engine uses **targeted AI** to analyze user input and determine if it represents an actionable intent:

- **Weak Intent**: Casual mentions that don't trigger workflows
- **Medium Intent**: Possible workflow triggers that may ask for confirmation
- **Strong Intent**: Clear workflow activation requests that execute immediately

### Context Awareness

The engine maintains sophisticated context through:

- **Conversation History**: Complete chat turn context for intent evaluation
- **Workflow State**: Active workflow progress and variables
- **Session Variables**: Persistent data across workflow executions
- **Global Variables**: Shared data across all workflows in a session

### Interruption and Resumption

Advanced **stack-of-stacks** architecture enables:

- **Flow Interruption**: Users can start new workflows while others are active
- **Context Preservation**: Interrupted workflows maintain their state
- **Smart Resumption**: Return to previous workflows with full context
- **Emergency Recovery**: Safe handling of complex workflow interactions

## Security and Control

### Controlled Tool Execution

The engine provides **highly controlled execution** of tools and integrations:

- **Pre-approved Functions**: Only registered functions can be executed
- **Parameter Validation**: JSON Schema validation for all tool arguments
- **Rate Limiting**: Configurable limits to prevent abuse
- **Audit Logging**: Comprehensive logging for compliance and debugging
- **Data Classification**: Security levels based on data sensitivity

### Expression Security

Safe expression evaluation with multiple security levels:

- **Pattern Blocking**: Prevents code injection and dangerous operations
- **Context-Aware Security**: Different security levels for different contexts
- **Input Sanitization**: Safe handling of user-provided data
- **No Code Execution**: Template expressions cannot execute arbitrary code



## Benefits of the Flow Engine Approach

### For Developers
- **Reduced Complexity**: Declarative workflow definitions vs. imperative code
- **Reliable Execution**: Predictable, testable workflow behavior
- **Security by Design**: Built-in security controls and validation
- **Host Independence**: Works with any conversational platform

### For Organizations
- **Consistent Experiences**: Standardized workflow execution across platforms
- **Compliance Ready**: Comprehensive audit trails and security controls
- **Scalable Architecture**: Handle complex multi-step processes reliably
- **Cost Effective**: Reduce development time for conversational workflows

### For Users
- **Natural Interactions**: Express intent naturally, get reliable results
- **Context Preservation**: Workflows remember previous interactions
- **Error Recovery**: Graceful handling of failures and edge cases
- **Multi-language Support**: Workflows adapt to user language preferences

---

# Chapter 1: TOOL-CALL Support: Complete Integration Guide

## Overview

The JavaScript Flow Engine's TOOL-CALL system provides a sophisticated, secure, and flexible way to integrate external tools and APIs into your workflows. It supports multiple implementation types, comprehensive response mapping, advanced error handling, and robust security features.

## Core Concepts

### What is a TOOL-CALL Step?

A `CALL-TOOL` step in your workflow executes external tools, whether they are:
- **Local Functions**: Secure, pre-approved JavaScript functions
- **HTTP APIs**: RESTful web services with full authentication support
- **Mock Tools**: Test implementations for development and testing

### Basic Syntax

```javascript
{
  id: "my-tool-step",
  type: "CALL-TOOL",
  tool: "ToolRegistryId",
  variable: "resultVariableName",  // Optional: store result in variable
  args: {                          // Optional: explicit arguments
    param1: "value1",
    param2: "{{variable}}"         // Template interpolation supported
  },
  onFail: {                        // Optional: error handling
    type: "SAY",
    value: "Tool failed: {{errorMessage}}"
  }
}
```

## Tool Registry Configuration

### Tool Registry Structure

Every tool must be registered in the `toolsRegistry` with this structure:

```javascript
{
  id: "UniqueToolId",              // Required: Unique identifier
  name: "Human Readable Name",     // Required: Display name
  description: "Tool description", // Required: What the tool does
  version: "1.0.0",               // Required: Tool version
  
  // OpenAI Function Calling Standard Schema
  parameters: {
    type: "object",
    properties: { /* parameter definitions */ },
    required: ["param1", "param2"],
    additionalProperties: false
  },
  
  // Implementation details
  implementation: { /* implementation config */ },
  
  // Security configuration
  security: { /* security settings */ },
  
  // Optional: API authentication
  apiKey: "bearer-token-here"
}
```

## Implementation Types

### 1. Local Function Implementation

Execute pre-approved JavaScript functions securely:

```javascript
{
  id: "VerifyAccountTool",
  name: "Verify Account",
  description: "Validates customer account number and status",
  version: "1.0.0",
  
  parameters: {
    type: "object",
    properties: {
      accountNumber: {
        type: "string",
        description: "Customer account number (6-12 digits)",
        pattern: "^[0-9]{6,12}$",
        minLength: 6,
        maxLength: 12
      }
    },
    required: ["accountNumber"],
    additionalProperties: false
  },
  
  implementation: {
    type: "local",
    function: "verifyAccount",     // Function name in APPROVED_FUNCTIONS
    timeout: 5000,                // Optional: execution timeout
    retries: 2                    // Optional: retry attempts
  },
  
  security: {
    requiresAuth: true,
    auditLevel: "high",
    dataClassification: "sensitive",
    rateLimit: { requests: 10, window: 60000 }
  }
}
```

**Setting up Local Functions:**

```javascript
const APPROVED_FUNCTIONS = {};

// Define your function
function verifyAccount(args) {
  const { accountNumber } = args;
  // Your verification logic here
  return {
    accountNumber,
    status: "verified",
    accountType: "checking",
    balance: 1234.56
  };
}

// Register the function
APPROVED_FUNCTIONS['verifyAccount'] = verifyAccount;

// Pass to engine
// Initialize the engine
context.engine = new WorkflowEngine(
  hostLogger,           // Any logger supporting .debug/.info/.warn/.error (or null)
  aiCallback,           // host provided access to AI function that receives <systemInstruction>, <userMessage> and returns <string response>
  flowsMenu,            // Available workflows
  toolsRegistry,        // Tool definitions
  APPROVED_FUNCTIONS,   // Secure local functions
  globalVariables,      // Session-wide variables (optional)
  validateOnInit,       // Integrity validation flag (optional, default: true)
  language,             // Language preference (optional, 'en', 'es', etc.)
  aiTimeOut,            // AI timeout in milliseconds (optional, default: 1000ms)
  messageRegistry,      // Custom message templates (optional)
  guidanceConfig        // User guidance settings (optional)
);
```

### 2. HTTP API Implementation

Call external REST APIs with full feature support:

```javascript
{
  id: "GetWeather",
  name: "Get Weather Information",
  description: "Fetches current weather information for a given city",
  version: "1.0.0",
  
  parameters: {
    type: "object",
    properties: {
      q: {
        type: "string",
        description: "City name for weather lookup",
        minLength: 2,
        maxLength: 100,
        pattern: "^[a-zA-Z\\s\\-,]+$"
      }
    },
    required: ["q"],
    additionalProperties: false
  },
  
  implementation: {
    type: "http",
    url: "https://wttr.in/{q}",        // URL with path parameters
    method: "GET",                     // HTTP method
    timeout: 5000,                     // Request timeout
    retries: 2,                        // Retry attempts
    retryDelay: 1000,                  // Delay between retries
    
    // Path parameters - tells engine which args to substitute into URL placeholders
    // Example: args.q = "London" → URL becomes "https://wttr.in/London"
    pathParams: ["q"],
    
    // Query parameters - added to URL query string
    queryParams: ["format", "units"],
    
    // Custom query string
    customQuery: "format=j1",
    
    // Content type for POST/PUT requests
    contentType: "application/json",
    
    // Custom headers
    headers: {
      "X-Client-Version": "1.0.0",
      "Accept-Language": "en-US"
    },
    
    // Default headers applied to all requests
    defaultHeaders: {
      "Accept": "application/json",
      "User-Agent": "MyWorkflowEngine/1.0"
    },
    
    // Response mapping (see Response Mapping section)
    responseMapping: { /* mapping config */ }
  },
  
  // API authentication
  apiKey: "your-bearer-token",         // Bearer token
  
  // Alternative authentication methods
  implementation: {
    // Basic authentication
    basicAuth: {
      username: "user",
      password: "pass"
    },
    
    // Custom authentication headers
    authHeaders: {
      "X-API-Key": "your-key",
      "X-Client-ID": "your-client-id"
    }
  },
  
  security: {
    requiresAuth: false,
    auditLevel: "low",
    dataClassification: "public",
    rateLimit: { requests: 20, window: 60000 }
  }
}
```

### 3. Mock Implementation

For testing and development:

```javascript
{
  id: "MockWeatherTool",
  name: "Mock Weather Tool",
  description: "Returns mock weather data for testing",
  version: "1.0.0",
  
  parameters: {
    type: "object",
    properties: {
      q: { type: "string", description: "City name" }
    },
    required: ["q"]
  },
  
  implementation: {
    type: "mock",
    mockResponse: {
      location: {
        name: "San Francisco",
        country: "United States"
      },
      current: {
        temp_c: 22,
        condition: "Partly cloudy",
        humidity: 65
      }
    },
    
    // Conditional mock responses based on arguments
    mockResponse: {
      "london": {
        location: { name: "London", country: "UK" },
        current: { temp_c: 15, condition: "Rainy" }
      },
      "default": {
        location: { name: "Unknown", country: "Unknown" },
        current: { temp_c: 20, condition: "Clear" }
      }
    }
  }
}
```

## Argument Generation and Validation

### Automatic Argument Generation

The engine automatically generates tool arguments from:

1. **User Input**: Direct parsing and pattern matching
2. **Flow Variables**: Smart variable matching
3. **Context History**: Previous conversation context
4. **AI Extraction**: Intelligent argument extraction using AI

### Explicit Arguments

You can provide explicit arguments in the step definition:

```javascript
{
  id: "weather-step",
  type: "CALL-TOOL",
  tool: "GetWeather",
  args: {
    q: "{{userCity}}",           // Template interpolation
    format: "json",              // Static value
    units: "metric"              // Static value
  }
}
```

### Template Interpolation in Arguments

Use `{{variable}}` syntax to insert variables into arguments:

```javascript
{
  args: {
    accountNumber: "{{accountInfo.id}}",
    amount: "{{paymentAmount}}",
    currency: "{{userPreferences.currency}}"
  }
}
```

### Argument Validation

Arguments are validated against the tool's parameter schema:

- **Type checking**: Ensures correct data types
- **Pattern validation**: Regex pattern matching
- **Range validation**: Min/max values for numbers
- **Required fields**: Validates all required parameters are present

## Response Mapping and Data Transformation

The JavaScript Flow Engine features a completely enhanced response mapping system with powerful mathematical operations, advanced date processing, and sophisticated template capabilities.

### Transform Types Overview

| Category | Transform Types | Description |
|----------|----------------|-------------|
| **Mathematical** | `add`, `subtract`, `multiply`, `divide`, `percentage` | Arithmetic operations with precision control |
| **Mathematical Functions** | `abs`, `round`, `floor`, `ceil` | Mathematical functions with configurable precision |
| **Statistical** | `sum`, `average`, `count`, `min`, `max` | Array aggregation operations |
| **Date/Time** | `currentYear`, `yearDifference`, `date` | Dynamic date calculations and formatting |
| **String** | `concat`, `template`, `join`, `uppercase`, `lowercase` | String manipulation and formatting |
| **Conditional** | `conditional` | Logic-based value transformation |
| **Array** | Array processing with enhanced path resolution | Support for `array.length` and complex iteration |
| **Custom** | `custom` | User-defined transformation functions |

### Mathematical Operations

#### Basic Arithmetic
```javascript
responseMapping: {
  type: "object",
  mappings: {
    "total_price": {
      path: "base_price",
      transform: {
        type: "add",
        value: 10.50  // Add tax
      }
    },
    "discount_price": {
      path: "original_price", 
      transform: {
        type: "subtract",
        value: "{{discount_amount}}"  // Dynamic subtraction
      }
    },
    "bulk_price": {
      path: "unit_price",
      transform: {
        type: "multiply",
        value: "{{quantity}}"
      }
    },
    "price_per_unit": {
      path: "total_cost",
      transform: {
        type: "divide",
        value: "{{item_count}}",
        precision: 2
      }
    },
    "tax_percentage": {
      path: "tax_amount",
      transform: {
        type: "percentage",
        total: "{{subtotal}}",
        precision: 1
      }
    }
  }
}
```

#### Mathematical Functions
```javascript
responseMapping: {
  type: "object", 
  mappings: {
    "absolute_change": {
      path: "price_change",
      transform: {
        type: "abs"  // Always positive
      }
    },
    "rounded_price": {
      path: "calculated_price",
      transform: {
        type: "round",
        precision: 2  // Round to 2 decimal places
      }
    },
    "floor_price": {
      path: "estimated_cost",
      transform: {
        type: "floor"  // Round down
      }
    },
    "ceiling_estimate": {
      path: "budget_estimate", 
      transform: {
        type: "ceil"  // Round up
      }
    }
  }
}
```

### Statistical Array Operations

#### Array Aggregations
```javascript
responseMapping: {
  type: "object",
  mappings: {
    "total_revenue": {
      path: "sales",
      transform: {
        type: "sum",
        field: "amount"  // Sum of sales[].amount
      }
    },
    "average_rating": {
      path: "reviews",
      transform: {
        type: "average", 
        field: "rating",
        precision: 1
      }
    },
    "product_count": {
      path: "inventory",
      transform: {
        type: "count"  // Count array items
      }
    },
    "highest_price": {
      path: "products",
      transform: {
        type: "max",
        field: "price"
      }
    },
    "lowest_stock": {
      path: "inventory",
      transform: {
        type: "min", 
        field: "quantity"
      }
    }
  }
}
```

### Enhanced Date and Time Processing

#### Dynamic Date Operations
```javascript
responseMapping: {
  type: "object",
  mappings: {
    "current_year": {
      transform: {
        type: "currentYear"  // Always returns current year
      }
    },
    "age_years": {
      path: "birth_date",
      transform: {
        type: "yearDifference",
        from: "birth_date",  // Can reference path or use current date
        precision: 0  // Whole years only
      }
    },
    "years_employed": {
      path: "hire_date", 
      transform: {
        type: "yearDifference",
        to: "{{current_date}}",  // Dynamic end date
        precision: 1  // Include decimal years
      }
    },
    "formatted_date": {
      path: "created_at",
      transform: {
        type: "date",
        format: "YYYY-MM-DD",
        fallback: "No date"
      }
    }
  }
}
```

### Advanced Template System with Handlebars-Style Iteration

#### Enhanced Template Processing
```javascript
responseMapping: {
  type: "template",
  template: `
Company Overview:
- Founded: {{founded_year}}
- Current Year: {{#transform type="currentYear"}}{{/transform}}
- Years in Business: {{#transform type="yearDifference" from="founded_year"}}{{/transform}}

Financial Summary:
{{#each financial_data}}
  Quarter {{@index}}: ${{revenue}} ({{#if @last}}Latest{{else}}Historical{{/if}})
{{/each}}

Global Presence: {{locations.length}} locations worldwide
{{#each locations}}
  • {{name}} - {{country}}{{#unless @last}},{{/unless}}
{{/each}}
  `
}
```

#### Complex Array Iteration with Context
```javascript
responseMapping: {
  type: "template",
  template: `
Sales Performance Report:

{{#each sales_data}}
Region {{@index}} - {{region_name}}:
- Revenue: ${{#transform type="add" value="0"}}{{revenue}}{{/transform}}
- Growth: {{#transform type="percentage" total="../total_revenue" precision="1"}}{{revenue}}{{/transform}}%
{{#if @last}}
─────────────────
Total Regions: {{@root.sales_data.length}}
{{/if}}
{{/each}}
  `
}
```

### Enhanced JSONPath with Array Length Support

#### Complex Path Resolution
```javascript
responseMapping: {
  type: "object",
  mappings: {
    "total_locations": {
      path: "company.locations.length"  // Direct array length access
    },
    "has_multiple_offices": {
      path: "company.locations.length",
      transform: {
        type: "conditional",
        condition: "value > 1",
        trueValue: "Multi-location company",
        falseValue: "Single location"
      }
    },
    "location_summary": {
      path: "company.locations",
      transform: {
        type: "template", 
        template: "{{length}} offices: {{#each this}}{{city}}{{#unless @last}}, {{/unless}}{{/each}}"
      }
    }
  }
}
```

### Complete Support Ticket Example with Cargo

This example demonstrates how to use session cargo for dynamic data sharing in a support ticket workflow:

```javascript
// Initialize session with dynamic user data
let sessionContext = engine.initSession('user-123', 'session-456');

// Set initial cargo data (could come from your user database)
sessionContext.cargo.userProfile = {
  name: 'Sarah Chen',
  email: 'sarah.chen@company.com',
  accountType: 'enterprise',
  supportTier: 'priority'
};

sessionContext.cargo.systemInfo = {
  lastLogin: '2024-08-14T10:30:00Z',
  browserAgent: 'Chrome/115.0',
  ipAddress: '192.168.1.100'
};

// Define flow that uses cargo data
const supportTicketFlow = {
  id: "support-ticket-with-cargo",
  name: "Support Ticket Creation",
  primary: true, // User-facing entry point flow
  prompt: "create support ticket|need help|technical issue",
  steps: [
    { 
      type: "SAY", 
      value: "Hello {{cargo.userProfile.name}}! I'll help you create a {{cargo.userProfile.supportTier}} support ticket." 
    },
    { 
      type: "SAY-GET", 
      variable: "issue_description", 
      value: "Please describe your technical issue:" 
    },
    {
      type: "CALL-TOOL",
      tool: "CreateSupportTicket",
      variable: "ticket_result",
      args: {
        customer_name: "{{cargo.userProfile.name}}",
        customer_email: "{{cargo.userProfile.email}}",
        account_type: "{{cargo.userProfile.accountType}}",
        priority: "{{cargo.userProfile.supportTier}}",
        description: "{{issue_description}}",
        system_info: {
          last_login: "{{cargo.systemInfo.lastLogin}}",
          browser: "{{cargo.systemInfo.browserAgent}}",
          ip: "{{cargo.systemInfo.ipAddress}}"
        }
      }
    },
    {
      type: "SET",
      variable: "ticket_created",
      value: "{{ticket_result.success}}"
    },
    {
      type: "SWITCH",
      variable: "ticket_created",
      branches: {
        true: {
          type: "SAY",
          value: "✅ {{cargo.userProfile.supportTier}} ticket {{ticket_result.ticket.id}} created successfully! We'll contact you at {{cargo.userProfile.email}} within our SLA timeframe."
        },
        default: {
          type: "SAY", 
          value: "❌ Failed to create ticket: {{ticket_result.error}}. Please contact {{cargo.userProfile.supportTier}} support directly."
        }
      }
    }
  ]
};

// Usage in conversation handler
async function handleUserMessage(userId, message) {
  // Update cargo with fresh user data if needed
  const userProfile = await fetchUserProfile(userId);
  const systemInfo = await getSystemInfo(userId);
  
  sessionContext.cargo.userProfile = userProfile;
  sessionContext.cargo.systemInfo = systemInfo;
  
  // Process the message
  sessionContext = await engine.updateActivity({
    role: 'user',
    content: message
  }, sessionContext);
  
  if (sessionContext.response) {
    return sessionContext.response; // Workflow handled it with cargo data
  }
  
  // Continue with normal conversation...
}
```

**Key Benefits of Cargo:**
- **Dynamic Data**: Update user context in real-time during conversation
- **Rich Context**: Workflows have access to complete user and session state
- **Personalization**: Responses automatically include user-specific information
- **System Integration**: Include system metadata and operational data
- **Session Isolation**: Each user's cargo is completely separate

### Real-World Example: E-commerce Order Processing

```javascript
const orderProcessingFlow = {
  id: "process-ecommerce-order",
  name: "E-commerce Order Processing",
  primary: true, // User-facing entry point flow
  steps: [
    {
      id: "calculate-order-totals",
      type: "CALL-TOOL", 
      tool: "OrderCalculator",
      parameters: {
        order_id: "{{order_id}}"
      },
      responseMapping: {
        type: "object",
        mappings: {
          // Basic calculations
          "subtotal": {
            path: "line_items",
            transform: {
              type: "sum",
              field: "total_price"
            }
          },
          "tax_amount": {
            path: "subtotal",
            transform: {
              type: "multiply",
              value: 0.08,  // 8% tax
              precision: 2
            }
          },
          "shipping_cost": {
            path: "weight_total",
            transform: {
              type: "conditional",
              condition: "value > 50",
              trueValue: 0,     // Free shipping over 50lbs
              falseValue: 15.99
            }
          },
          "grand_total": {
            path: "subtotal", 
            transform: {
              type: "add",
              value: "{{tax_amount + shipping_cost}}"
            }
          },
          
          // Customer insights
          "customer_tier": {
            path: "customer.total_orders",
            transform: {
              type: "conditional", 
              condition: "value >= 10",
              trueValue: "VIP",
              falseValue: "Standard"
            }
          },
          "loyalty_discount": {
            path: "customer.total_orders",
            transform: {
              type: "conditional",
              condition: "value >= 10",
              trueValue: { type: "percentage", total: "{{subtotal}}", value: 5 },
              falseValue: 0
            }
          },
          
          // Order summary template
          "order_summary": {
            transform: {
              type: "template",
              template: `
Order #{{order_id}} Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Items ({{line_items.length}}):
{{#each line_items}}
  {{quantity}}x {{product_name}} - ${{total_price}}
{{/each}}

Financial Breakdown:
  Subtotal: ${{subtotal}}
  Tax (8%): ${{tax_amount}}
  Shipping: ${{#if shipping_cost}}${{shipping_cost}}{{else}}FREE{{/if}}
  {{#if loyalty_discount}}VIP Discount: -${{loyalty_discount}}{{/if}}
  ─────────────
  Total: ${{grand_total}}

Customer: {{customer_tier}} ({{customer.total_orders}} orders)
Estimated Delivery: {{#transform type="add" value="3"}}{{current_date}}{{/transform}} days
              `
            }
          }
        }
      }
    }
  ]
};
```

### Advanced Conditional Mapping

```javascript
responseMapping: {
  type: "conditional",
  conditions: [
    {
      if: { field: "customer.age", operator: "gte", value: 65 },
      then: {
        type: "object",
        mappings: {
          "discount_rate": {
            value: 15,
            transform: { type: "percentage", total: "{{subtotal}}" }
          },
          "message": {
            transform: {
              type: "template",
              template: "Senior discount applied: {{discount_rate}}% off!"
            }
          }
        }
      }
    },
    {
      if: { field: "order_total", operator: "gt", value: 100 },
      then: {
        type: "object",
        mappings: {
          "shipping_cost": { value: 0 },
          "message": { value: "Free shipping on orders over $100!" }
        }
      }
    }
  ],
  else: {
    type: "object",
    mappings: {
      "shipping_cost": {
        path: "weight",
        transform: {
          type: "multiply",
          value: 2.50,
          precision: 2
        }
      }
    }
  }
}
```

## Real-World Implementation Examples

This section showcases comprehensive real-world scenarios demonstrating the enhanced transformation capabilities across different industry verticals.

### 1. E-commerce Platform: Dynamic Pricing & Inventory Management

```javascript
const ecommercePricingFlow = {
  id: "dynamic-pricing-engine",
  name: "E-commerce Dynamic Pricing Engine",
  primary: true, // User-facing entry point flow
  description: "Comprehensive pricing system with inventory tracking, customer segmentation, and promotional calculations",
  
  steps: [
    {
      id: "fetch-product-data",
      type: "CALL-TOOL",
      tool: "ProductCatalogAPI",
      parameters: {
        product_ids: "{{requested_products}}",
        include_inventory: true,
        include_pricing_history: true
      },
      responseMapping: {
        type: "object",
        mappings: {
          // Basic product information
          "product_count": {
            path: "products.length"
          },
          "total_inventory_value": {
            path: "products",
            transform: {
              type: "sum",
              field: "inventory_value"
            }
          },
          "average_base_price": {
            path: "products",
            transform: {
              type: "average",
              field: "base_price",
              precision: 2
            }
          },
          
          // Dynamic pricing calculations
          "pricing_summary": {
            transform: {
              type: "template",
              template: `
🛒 E-commerce Pricing Analysis
═══════════════════════════════════════

📊 Portfolio Overview:
• Total Products: {{product_count}}
• Average Base Price: ${{average_base_price}}
• Total Inventory Value: ${{#transform type="round" precision="0"}}{{total_inventory_value}}{{/transform}}

💰 Dynamic Pricing Strategy:
{{#each products}}
┌─ {{name}} (SKU: {{sku}})
│  Base Price: ${{base_price}}
│  Stock Level: {{inventory_quantity}} units
│  Demand Score: {{#transform type="round" precision="1"}}{{demand_score}}{{/transform}}/10
│  
│  📈 Price Adjustments:
{{#if (gt inventory_quantity 100)}}
│  • Overstock Discount: -{{#transform type="percentage" total="../base_price" precision="0"}}5{{/transform}}%
{{/if}}
{{#if (lt inventory_quantity 10)}}
│  • Low Stock Premium: +{{#transform type="percentage" total="../base_price" precision="0"}}10{{/transform}}%
{{/if}}
│  • Seasonal Adjustment: {{#transform type="conditional" condition="demand_score > 7" trueValue="+5%" falseValue="0%"}}{{/transform}}
│  
│  💵 Final Price: ${{#transform type="add" value="{{seasonal_adjustment}}"}}{{adjusted_price}}{{/transform}}
│  📊 Margin: {{#transform type="percentage" total="../final_price" precision="1"}}{{profit_margin}}{{/transform}}%
│  
{{#unless @last}}├─────────────────────────────────────────
{{else}}└─────────────────────────────────────────
{{/unless}}
{{/each}}

🎯 Optimization Recommendations:
• High-performing products: {{#transform type="count" condition="demand_score > 8"}}{{products}}{{/transform}}
• Clearance candidates: {{#transform type="count" condition="inventory_quantity > 50 AND demand_score < 5"}}{{products}}{{/transform}}
• Restock alerts: {{#transform type="count" condition="inventory_quantity < 20"}}{{products}}{{/transform}}
              `
            }
          }
        }
      }
    },
    
    {
      id: "customer-segmentation",
      type: "CALL-TOOL",
      tool: "CustomerAnalyticsAPI",
      parameters: {
        customer_id: "{{customer_id}}",
        include_purchase_history: true,
        loyalty_program: true
      },
      responseMapping: {
        type: "object",
        mappings: {
          "customer_lifetime_value": {
            path: "purchase_history",
            transform: {
              type: "sum",
              field: "order_total"
            }
          },
          "average_order_value": {
            path: "purchase_history",
            transform: {
              type: "average",
              field: "order_total",
              precision: 2
            }
          },
          "years_as_customer": {
            path: "registration_date",
            transform: {
              type: "yearDifference",
              precision: 1
            }
          },
          "loyalty_tier": {
            path: "customer_lifetime_value",
            transform: {
              type: "conditional",
              condition: "value >= 5000",
              trueValue: "Platinum",
              falseValue: {
                type: "conditional", 
                condition: "value >= 1000",
                trueValue: "Gold",
                falseValue: "Silver"
              }
            }
          },
          "personalized_discount": {
            path: "loyalty_tier",
            transform: {
              type: "conditional",
              condition: "value === 'Platinum'",
              trueValue: 15,
              falseValue: {
                type: "conditional",
                condition: "value === 'Gold'", 
                trueValue: 10,
                falseValue: 5
              }
            }
          }
        }
      }
    }
  ]
};
```

### 2. Financial Services: Investment Portfolio Analysis

```javascript
const portfolioAnalysisFlow = {
  id: "investment-portfolio-analyzer",
  name: "Investment Portfolio Analysis Engine",
  primary: true, // User-facing entry point flow
  description: "Comprehensive portfolio analysis with risk assessment, performance metrics, and rebalancing recommendations",
  
  steps: [
    {
      id: "portfolio-performance",
      type: "CALL-TOOL",
      tool: "PortfolioAPI",
      parameters: {
        portfolio_id: "{{portfolio_id}}",
        time_period: "1Y",
        include_dividends: true
      },
      responseMapping: {
        type: "object",
        mappings: {
          "portfolio_analysis": {
            transform: {
              type: "template",
              template: `
📈 Investment Portfolio Analysis Report
════════════════════════════════════════════════

👤 Portfolio Overview:
• Portfolio ID: {{portfolio_id}}
• Total Value: ${{#transform type="round" precision="0"}}{{total_value}}{{/transform}}
• Analysis Date: {{#transform type="currentYear"}}{{/transform}}-{{current_month}}-{{current_day}}
• Performance Period: {{performance_period}}

💼 Asset Allocation:
{{#each holdings}}
┌─ {{asset_name}} ({{symbol}})
│  Current Value: ${{#transform type="round" precision="0"}}{{current_value}}{{/transform}}
│  Portfolio Weight: {{#transform type="percentage" total="../total_value" precision="1"}}{{current_value}}{{/transform}}%
│  Shares Held: {{#transform type="round" precision="0"}}{{shares}}{{/transform}}
│  
│  📊 Performance Metrics:
│  • 1Y Return: {{#transform type="percentage" total="../purchase_price" precision="1"}}{{annual_return}}{{/transform}}%
│  • Unrealized P&L: {{#transform type="conditional" condition="unrealized_pnl > 0" trueValue="+$" falseValue="-$"}}{{/transform}}{{#transform type="abs"}}{{unrealized_pnl}}{{/transform}}
│  • Dividend Yield: {{#transform type="percentage" total="../current_value" precision="2"}}{{dividend_income}}{{/transform}}%
│  
│  🎯 Risk Assessment:
│  • Beta: {{#transform type="round" precision="2"}}{{beta}}{{/transform}}
│  • Volatility: {{#transform type="percentage" precision="1"}}{{volatility}}{{/transform}}%
│  • Risk Score: {{#transform type="conditional" condition="risk_score < 3" trueValue="🟢 Low" falseValue="🟡 Medium"}}{{/transform}}{{#transform type="conditional" condition="risk_score > 7" trueValue="🔴 High" falseValue=""}}{{/transform}}
│  
{{#unless @last}}├─────────────────────────────────────────
{{else}}└─────────────────────────────────────────
{{/unless}}
{{/each}}

📊 Portfolio Statistics:
• Total Return (1Y): {{#transform type="percentage" total="../initial_investment" precision="1"}}{{total_return}}{{/transform}}%
• Dividend Income: ${{#transform type="sum" field="dividend_income"}}{{holdings}}{{/transform}}
• Portfolio Beta: {{#transform type="average" field="beta" precision="2"}}{{holdings}}{{/transform}}
• Sharpe Ratio: {{#transform type="round" precision="3"}}{{sharpe_ratio}}{{/transform}}

⚖️ Asset Allocation Analysis:
• Equity Exposure: {{#transform type="percentage" total="../total_value" precision="0"}}{{equity_value}}{{/transform}}%
• Fixed Income: {{#transform type="percentage" total="../total_value" precision="0"}}{{bond_value}}{{/transform}}%
• Alternative Investments: {{#transform type="percentage" total="../total_value" precision="0"}}{{alternative_value}}{{/transform}}%
• Cash & Equivalents: {{#transform type="percentage" total="../total_value" precision="0"}}{{cash_value}}{{/transform}}%

🔄 Rebalancing Recommendations:
{{#each rebalancing_suggestions}}
• {{action}}: {{asset_symbol}} - {{#transform type="conditional" condition="action === 'BUY'" trueValue="Add" falseValue="Reduce"}}{{/transform}} ${{#transform type="round" precision="0"}}{{amount}}{{/transform}}
  Target Weight: {{target_percentage}}% | Current: {{current_percentage}}%
{{/each}}

⚠️  Risk Alerts:
{{#each risk_alerts}}
• {{alert_type}}: {{description}}
  Impact: {{#transform type="conditional" condition="severity === 'HIGH'" trueValue="🔴 High" falseValue="🟡 Medium"}}{{/transform}}
{{/each}}
              `
            }
          }
        }
      }
    }
  ]
};
```

### 3. Human Resources: Employee Performance & Analytics

```javascript
const hrAnalyticsFlow = {
  id: "employee-performance-analytics",
  name: "HR Performance Analytics Engine",
  primary: true, // User-facing entry point flow
  description: "Comprehensive employee analytics with performance tracking, compensation analysis, and development recommendations",
  
  steps: [
    {
      id: "employee-metrics",
      type: "CALL-TOOL",
      tool: "HRManagementAPI",
      parameters: {
        department: "{{department}}",
        include_performance: true,
        include_compensation: true,
        time_period: "annual"
      },
      responseMapping: {
        type: "object",
        mappings: {
          "department_analytics": {
            transform: {
              type: "template",
              template: `
👥 HR Analytics Dashboard - {{department}} Department
═══════════════════════════════════════════════════════

📊 Department Overview:
• Total Employees: {{employees.length}}
• Current Year: {{#transform type="currentYear"}}{{/transform}}
• Analysis Period: {{analysis_period}}
• Department Budget: ${{#transform type="round" precision="0"}}{{total_budget}}{{/transform}}

👨‍💼 Employee Demographics:
{{#each employees}}
┌─ {{first_name}} {{last_name}} (ID: {{employee_id}})
│  📋 Profile:
│  • Position: {{job_title}}
│  • Level: {{job_level}}
│  • Tenure: {{#transform type="yearDifference" from="../hire_date" precision="1"}}{{/transform}} years
│  • Age: {{#transform type="yearDifference" from="../birth_date" precision="0"}}{{/transform}} years
│  
│  💰 Compensation:
│  • Base Salary: ${{#transform type="round" precision="0"}}{{base_salary}}{{/transform}}
│  • Performance Bonus: ${{#transform type="round" precision="0"}}{{performance_bonus}}{{/transform}}
│  • Total Compensation: ${{#transform type="add" value="{{performance_bonus}}"}}{{base_salary}}{{/transform}}
│  • Market Percentile: {{#transform type="round" precision="0"}}{{market_percentile}}{{/transform}}%
│  
│  📈 Performance Metrics:
│  • Overall Rating: {{performance_rating}}/5.0
│  • Goal Achievement: {{#transform type="percentage" precision="0"}}{{goal_completion_rate}}{{/transform}}%
│  • Peer Ranking: {{peer_ranking}}/{{../employees.length}}
│  • YTD Performance: {{#transform type="conditional" condition="performance_rating >= 4.5" trueValue="🌟 Exceeds Expectations" falseValue=""}}{{/transform}}{{#transform type="conditional" condition="performance_rating >= 3.5 AND performance_rating < 4.5" trueValue="✅ Meets Expectations" falseValue=""}}{{/transform}}{{#transform type="conditional" condition="performance_rating < 3.5" trueValue="⚠️ Needs Improvement" falseValue=""}}{{/transform}}
│  
│  🎯 Development Areas:
{{#each skill_assessments}}
│  • {{skill_name}}: {{current_level}}/5 {{#transform type="conditional" condition="target_level > current_level" trueValue="→ Target: " falseValue=""}}{{/transform}}{{#if (gt target_level current_level)}}{{target_level}}/5{{/if}}
{{/each}}
│  
{{#unless @last}}├─────────────────────────────────────────
{{else}}└─────────────────────────────────────────
{{/unless}}
{{/each}}

📊 Department Statistics:
• Average Tenure: {{#transform type="average" field="years_with_company" precision="1"}}{{employees}}{{/transform}} years
• Average Performance: {{#transform type="average" field="performance_rating" precision="2"}}{{employees}}{{/transform}}/5.0
• Total Compensation: ${{#transform type="sum" field="total_compensation"}}{{employees}}{{/transform}}
• Average Salary: ${{#transform type="average" field="total_compensation" precision="0"}}{{employees}}{{/transform}}
• Promotion Rate: {{#transform type="percentage" precision="0"}}{{promotion_rate}}{{/transform}}%

🏆 Top Performers (Rating ≥ 4.5):
{{#each top_performers}}
• {{name}}: {{performance_rating}}/5.0 - {{achievement_summary}}
{{/each}}

⚠️  Performance Alerts:
{{#each performance_alerts}}
• {{employee_name}}: {{alert_type}} - {{description}}
  Action Required: {{recommended_action}}
{{/each}}

💡 Department Recommendations:
• High Performers for Promotion: {{#transform type="count" condition="performance_rating >= 4.5 AND years_in_role >= 2"}}{{employees}}{{/transform}}
• Training Investment Needed: {{#transform type="count" condition="performance_rating < 3.5"}}{{employees}}{{/transform}}
• Retention Risk (High Performers): {{#transform type="count" condition="performance_rating >= 4.0 AND flight_risk_score > 7"}}{{employees}}{{/transform}}
• Salary Adjustment Candidates: {{#transform type="count" condition="market_percentile < 50 AND performance_rating >= 4.0"}}{{employees}}{{/transform}}
              `
            }
          }
        }
      }
    }
  ]
};
```

### 4. Healthcare Analytics: Patient Care Optimization

```javascript
const healthcareAnalyticsFlow = {
  id: "patient-care-analytics",
  name: "Healthcare Analytics & Patient Care Optimization",
  primary: true, // User-facing entry point flow
  description: "Comprehensive patient analytics with care quality metrics, resource utilization, and outcome predictions",
  
  steps: [
    {
      id: "patient-outcomes",
      type: "CALL-TOOL",
      tool: "HealthcareAPI",
      parameters: {
        facility_id: "{{facility_id}}",
        time_period: "quarterly",
        include_patient_outcomes: true,
        include_resource_utilization: true
      },
      responseMapping: {
        type: "object",
        mappings: {
          "healthcare_dashboard": {
            transform: {
              type: "template",
              template: `
🏥 Healthcare Analytics Dashboard
════════════════════════════════════════════

🏢 Facility Overview:
• Facility: {{facility_name}}
• Reporting Period: Q{{current_quarter}} {{#transform type="currentYear"}}{{/transform}}
• Total Patients: {{patients.length}}
• Average Age: {{#transform type="average" field="age" precision="1"}}{{patients}}{{/transform}} years

👨‍⚕️ Patient Demographics & Outcomes:
{{#each patients}}
┌─ Patient ID: {{patient_id}}
│  📋 Profile:
│  • Age: {{#transform type="yearDifference" from="../birth_date" precision="0"}}{{/transform}} years
│  • Gender: {{gender}}
│  • Primary Condition: {{primary_diagnosis}}
│  • Admission Date: {{admission_date}}
│  • Length of Stay: {{#transform type="subtract" value="{{admission_date}}"}}{{discharge_date}}{{/transform}} days
│  
│  🎯 Care Metrics:
│  • Risk Score: {{#transform type="round" precision="1"}}{{risk_score}}{{/transform}}/10
│  • Severity Level: {{#transform type="conditional" condition="severity_score < 3" trueValue="🟢 Low" falseValue=""}}{{/transform}}{{#transform type="conditional" condition="severity_score >= 3 AND severity_score < 7" trueValue="🟡 Moderate" falseValue=""}}{{/transform}}{{#transform type="conditional" condition="severity_score >= 7" trueValue="🔴 High" falseValue=""}}{{/transform}}
│  • Care Quality Score: {{care_quality_score}}/100
│  • Patient Satisfaction: {{patient_satisfaction_score}}/10
│  
│  💊 Treatment Effectiveness:
│  • Medications: {{medications.length}} active prescriptions
│  • Treatment Response: {{#transform type="percentage" precision="0"}}{{treatment_effectiveness}}{{/transform}}%
│  • Complication Rate: {{#transform type="percentage" precision="1"}}{{complication_rate}}{{/transform}}%
│  • Recovery Progress: {{#transform type="conditional" condition="recovery_percentage >= 80" trueValue="🟢 Excellent" falseValue=""}}{{/transform}}{{#transform type="conditional" condition="recovery_percentage >= 60 AND recovery_percentage < 80" trueValue="🟡 Good" falseValue=""}}{{/transform}}{{#transform type="conditional" condition="recovery_percentage < 60" trueValue="🔴 Needs Attention" falseValue=""}}{{/transform}}
│  
│  💰 Resource Utilization:
│  • Total Cost: ${{#transform type="round" precision="0"}}{{total_treatment_cost}}{{/transform}}
│  • Cost per Day: ${{#transform type="divide" value="{{length_of_stay}}" precision="0"}}{{total_treatment_cost}}{{/transform}}
│  • Insurance Coverage: {{#transform type="percentage" precision="0"}}{{insurance_coverage_rate}}{{/transform}}%
│  
{{#unless @last}}├─────────────────────────────────────────
{{else}}└─────────────────────────────────────────
{{/unless}}
{{/each}}

📊 Facility Performance Metrics:
• Average Length of Stay: {{#transform type="average" field="length_of_stay" precision="1"}}{{patients}}{{/transform}} days
• Overall Care Quality: {{#transform type="average" field="care_quality_score" precision="1"}}{{patients}}{{/transform}}/100
• Patient Satisfaction: {{#transform type="average" field="patient_satisfaction_score" precision="2"}}{{patients}}{{/transform}}/10
• Complication Rate: {{#transform type="average" field="complication_rate" precision="2"}}{{patients}}{{/transform}}%
• Average Treatment Cost: ${{#transform type="average" field="total_treatment_cost" precision="0"}}{{patients}}{{/transform}}
• Bed Utilization: {{#transform type="percentage" precision="0"}}{{bed_utilization_rate}}{{/transform}}%

🎯 Quality Indicators:
• Readmission Rate (30-day): {{#transform type="percentage" precision="1"}}{{readmission_rate_30day}}{{/transform}}%
• Mortality Rate: {{#transform type="percentage" precision="2"}}{{mortality_rate}}{{/transform}}%
• Infection Rate: {{#transform type="percentage" precision="2"}}{{hospital_acquired_infection_rate}}{{/transform}}%
• Medication Error Rate: {{#transform type="percentage" precision="3"}}{{medication_error_rate}}{{/transform}}%

👥 Staffing Efficiency:
• Nurse-to-Patient Ratio: 1:{{#transform type="divide" value="{{nursing_staff_count}}" precision="1"}}{{total_patients}}{{/transform}}
• Physician Utilization: {{#transform type="percentage" precision="0"}}{{physician_utilization_rate}}{{/transform}}%
• Staff Satisfaction: {{#transform type="average" field="satisfaction_score" precision="1"}}{{staff_metrics}}{{/transform}}/10

⚠️  Clinical Alerts:
{{#each clinical_alerts}}
• {{alert_type}}: {{patient_count}} patients affected
  Priority: {{#transform type="conditional" condition="priority === 'HIGH'" trueValue="🔴 High" falseValue="🟡 Medium"}}{{/transform}}
  Recommended Action: {{recommended_action}}
{{/each}}

💡 Optimization Recommendations:
• High-Risk Patients Requiring Attention: {{#transform type="count" condition="risk_score >= 7"}}{{patients}}{{/transform}}
• Discharge Planning Candidates: {{#transform type="count" condition="recovery_percentage >= 80 AND length_of_stay >= 5"}}{{patients}}{{/transform}}
• Cost Optimization Opportunities: {{#transform type="count" condition="total_treatment_cost > average_cost * 1.5"}}{{patients}}{{/transform}}
• Quality Improvement Cases: {{#transform type="count" condition="care_quality_score < 70"}}{{patients}}{{/transform}}
              `
            }
          }
        }
      }
    }
  ]
};
```

### 5. Supply Chain Management: Logistics Optimization

```javascript
const supplyChainFlow = {
  id: "supply-chain-optimization",
  name: "Supply Chain Analytics & Optimization Engine",
  primary: true, // User-facing entry point flow
  description: "Comprehensive supply chain analysis with inventory management, logistics optimization, and predictive analytics",
  
  steps: [
    {
      id: "supply-chain-analysis",
      type: "CALL-TOOL",
      tool: "SupplyChainAPI",
      parameters: {
        region: "{{operational_region}}",
        include_inventory: true,
        include_logistics: true,
        include_suppliers: true
      },
      responseMapping: {
        type: "object",
        mappings: {
          "supply_chain_dashboard": {
            transform: {
              type: "template",
              template: `
🚚 Supply Chain Analytics Dashboard
═══════════════════════════════════════════

🌍 Regional Overview:
• Region: {{operational_region}}
• Analysis Date: {{#transform type="currentYear"}}{{/transform}}-{{current_month}}-{{current_day}}
• Active Warehouses: {{warehouses.length}}
• Supplier Network: {{suppliers.length}} suppliers
• Total SKUs: {{#transform type="sum" field="sku_count"}}{{warehouses}}{{/transform}}

📦 Inventory Management:
{{#each warehouses}}
┌─ {{warehouse_name}} ({{location}})
│  📊 Inventory Metrics:
│  • Total SKUs: {{sku_count}}
│  • Inventory Value: ${{#transform type="round" precision="0"}}{{total_inventory_value}}{{/transform}}
│  • Capacity Utilization: {{#transform type="percentage" precision="0"}}{{capacity_utilization}}{{/transform}}%
│  • Turnover Rate: {{#transform type="round" precision="1"}}{{inventory_turnover_rate}}{{/transform}}x annually
│  
│  📈 Performance Indicators:
│  • Fill Rate: {{#transform type="percentage" precision="1"}}{{order_fill_rate}}{{/transform}}%
│  • Stockout Incidents: {{stockout_count}}
│  • Overstock Value: ${{#transform type="round" precision="0"}}{{overstock_value}}{{/transform}}
│  • Days of Inventory: {{#transform type="round" precision="0"}}{{days_of_inventory}}{{/transform}} days
│  
│  🎯 Top Moving Products:
{{#each top_products}}
│  • {{product_name}}: {{monthly_velocity}} units/month
│    Stock Level: {{current_stock}} | Reorder Point: {{reorder_point}}
│    Status: {{#transform type="conditional" condition="current_stock < reorder_point" trueValue="🔴 Reorder Needed" falseValue="🟢 Adequate"}}{{/transform}}
{{/each}}
│  
{{#unless @last}}├─────────────────────────────────────────
{{else}}└─────────────────────────────────────────
{{/unless}}
{{/each}}

🚛 Logistics Performance:
• Average Delivery Time: {{#transform type="average" field="delivery_time_days" precision="1"}}{{shipments}}{{/transform}} days
• On-Time Delivery Rate: {{#transform type="percentage" precision="1"}}{{on_time_delivery_rate}}{{/transform}}%
• Transportation Cost: ${{#transform type="sum" field="transportation_cost"}}{{shipments}}{{/transform}}
• Cost per Shipment: ${{#transform type="average" field="transportation_cost" precision="0"}}{{shipments}}{{/transform}}
• Damage Rate: {{#transform type="percentage" precision="2"}}{{damage_rate}}{{/transform}}%

🏭 Supplier Performance:
{{#each suppliers}}
┌─ {{supplier_name}} ({{supplier_id}})
│  📋 Supplier Metrics:
│  • Category: {{product_category}}
│  • Relationship Duration: {{#transform type="yearDifference" from="../partnership_start_date" precision="1"}}{{/transform}} years
│  • Monthly Volume: ${{#transform type="round" precision="0"}}{{monthly_purchase_volume}}{{/transform}}
│  
│  📊 Performance Scores:
│  • Quality Rating: {{quality_score}}/10
│  • Delivery Performance: {{#transform type="percentage" precision="0"}}{{delivery_performance}}{{/transform}}%
│  • Cost Competitiveness: {{cost_rating}}/10
│  • Risk Score: {{#transform type="conditional" condition="risk_score < 3" trueValue="🟢 Low Risk" falseValue=""}}{{/transform}}{{#transform type="conditional" condition="risk_score >= 3 AND risk_score < 7" trueValue="🟡 Medium Risk" falseValue=""}}{{/transform}}{{#transform type="conditional" condition="risk_score >= 7" trueValue="🔴 High Risk" falseValue=""}}{{/transform}}
│  
│  💰 Financial Impact:
│  • YTD Spend: ${{#transform type="round" precision="0"}}{{ytd_spend}}{{/transform}}
│  • Cost Savings: ${{#transform type="round" precision="0"}}{{cost_savings_achieved}}{{/transform}}
│  • Payment Terms: {{payment_terms}} days
│  
{{#unless @last}}├─────────────────────────────────────────
{{else}}└─────────────────────────────────────────
{{/unless}}
{{/each}}

📊 Key Performance Indicators:
• Network Inventory Value: ${{#transform type="sum" field="total_inventory_value"}}{{warehouses}}{{/transform}}
• Average Days of Inventory: {{#transform type="average" field="days_of_inventory" precision="0"}}{{warehouses}}{{/transform}} days
• Perfect Order Rate: {{#transform type="percentage" precision="1"}}{{perfect_order_rate}}{{/transform}}%
• Cash-to-Cash Cycle: {{#transform type="round" precision="0"}}{{cash_to_cash_cycle_days}}{{/transform}} days
• Supply Chain ROI: {{#transform type="percentage" precision="1"}}{{supply_chain_roi}}{{/transform}}%

🎯 Optimization Opportunities:
• Reorder Alerts: {{#transform type="count" condition="current_stock < reorder_point"}}{{all_products}}{{/transform}} products
• Overstock Items: {{#transform type="count" condition="days_of_inventory > 90"}}{{all_products}}{{/transform}} SKUs
• Supplier Diversification Needed: {{#transform type="count" condition="single_source_risk_score > 7"}}{{product_categories}}{{/transform}} categories
• Cost Reduction Potential: ${{#transform type="round" precision="0"}}{{cost_reduction_opportunity}}{{/transform}}

⚠️  Supply Chain Alerts:
{{#each supply_chain_alerts}}
• {{alert_type}}: {{description}}
  Impact: {{#transform type="conditional" condition="severity === 'HIGH'" trueValue="🔴 Critical" falseValue="🟡 Monitor"}}{{/transform}}
  Recommended Action: {{recommended_action}}
  Timeline: {{resolution_timeline}}
{{/each}}

🔮 Predictive Insights:
• Demand Forecast Accuracy: {{#transform type="percentage" precision="0"}}{{forecast_accuracy}}{{/transform}}%
• Predicted Stockouts (Next 30 days): {{predicted_stockouts_30day}}
• Seasonal Demand Patterns: {{seasonal_demand_trend}}
• Supplier Risk Forecast: {{#transform type="count" condition="predicted_risk_score > 6"}}{{suppliers}}{{/transform}} suppliers at risk
              `
            }
          }
        }
      }
    }
  ]
};
```

These comprehensive examples demonstrate the power of the JavaScript Flow Engine's enhanced transformation capabilities across different industry scenarios. Each example showcases:

- **Mathematical Operations**: Complex calculations for pricing, performance metrics, and financial analysis
- **Statistical Aggregations**: Sum, average, count operations for data analysis  
- **Advanced Template Processing**: Handlebars-style iteration with context variables
- **Conditional Logic**: Dynamic content based on business rules and thresholds
- **Date/Time Processing**: Age calculations, tenure analysis, and temporal metrics
- **Enhanced Path Resolution**: Array length access and complex object navigation

## Error Handling

### OnFail Handlers

Handle tool failures gracefully:

```javascript
{
  id: "risky-tool-step",
  type: "CALL-TOOL",
  tool: "ExternalAPI",
  onFail: {
    type: "SAY",
    value: "Sorry, the {{toolName}} service is temporarily unavailable. Error: {{errorMessage}}"
  }
}
```

### Advanced OnFail with CallType

```javascript
{
  onFail: {
    type: "FLOW",
    name: "ErrorRecoveryFlow",
    callType: "call"    // Options: "call", "replace", "reboot"
  }
}
```

**CallType Options:**
- `"call"`: Execute onFail as sub-flow, return to original flow after
- `"replace"`: Replace current flow with onFail flow
- `"reboot"`: Clear all flows and start fresh with onFail flow

### Smart Default Error Handling

If no onFail is specified, the engine generates intelligent defaults:

- **Financial tools**: Strict error handling with transaction logging
- **Information tools**: Graceful degradation with user-friendly messages
- **Critical tools**: Automatic retry with exponential backoff

## Security Features

### Authentication Support

Multiple authentication methods:

```javascript
// Bearer Token
{
  apiKey: "your-bearer-token"
}

// Basic Authentication
{
  implementation: {
    basicAuth: {
      username: "user",
      password: "password"
    }
  }
}

// Custom Headers
{
  implementation: {
    authHeaders: {
      "X-API-Key": "your-api-key",
      "Authorization": "Custom token-here"
    }
  }
}
```

### Rate Limiting

Prevent API abuse:

```javascript
{
  security: {
    rateLimit: {
      requests: 10,          // Max requests
      window: 60000         // Time window in milliseconds
    }
  }
}
```

### Complete REST API Tool Example

Here's a comprehensive example showing all tool configuration features:

```javascript
{
  id: "ComprehensiveAPITool",
  name: "Comprehensive API Integration",
  name_es: "Integración API Integral",
  name_fr: "Intégration API Complète",
  
  description: "Full-featured API tool demonstrating all capabilities",
  description_es: "Herramienta API completa demostrando todas las capacidades",
  
  version: "2.1.0",
  
  // Comprehensive parameter definition
  parameters: {
    type: "object",
    properties: {
      userId: {
        type: "string",
        description: "User identifier",
        pattern: "^USER-[0-9]{6,12}$",
        examples: ["USER-123456"]
      },
      action: {
        type: "string",
        enum: ["create", "update", "delete", "view"],
        default: "view"
      },
      data: {
        type: "object",
        properties: {
          email: { 
            type: "string", 
            format: "email",
            description: "User email address"
          },
          preferences: {
            type: "object",
            properties: {
              language: { type: "string", enum: ["en", "es", "fr"] },
              notifications: { type: "boolean", default: true }
            }
          }
        },
        required: ["email"]
      },
      options: {
        type: "object",
        properties: {
          includeHistory: { type: "boolean", default: false },
          format: { type: "string", enum: ["json", "xml"], default: "json" }
        }
      }
    },
    required: ["userId", "action"],
    additionalProperties: false
  },
  
  implementation: {
    type: "http",
    url: "https://api.example.com/users/{userId}/actions/{action}",
    method: "POST",
    
    // Path parameter substitution
    pathParams: ["userId", "action"],
    
    // Query parameters from arguments
    queryParams: ["format", "includeHistory"],
    
    // Static query parameters
    customQuery: "version=2&source=workflow",
    
    // Content type and encoding
    contentType: "application/json",
    charset: "utf-8",
    
    // Request headers
    headers: {
      "X-Client-Version": "{{appVersion}}",
      "X-Request-ID": "{{generateUUID()}}",
      "Accept-Language": "{{userLanguage}}"
    },
    
    // Default headers for all requests
    defaultHeaders: {
      "Accept": "application/json",
      "User-Agent": "WorkflowEngine/2.0",
      "X-Content-Type-Options": "nosniff"
    },
    
    // Form data for file uploads or form submissions
    formData: {
      action: "{action}",
      user_data: "{{JSON.stringify(data)}}",
      timestamp: "{{Date.now()}}",
      signature: "{{generateSignature(userId, action)}}"
    },
    
    // Request body construction (alternative to formData)
    requestBody: {
      type: "template",
      template: {
        userId: "{{userId}}",
        action: "{{action}}",
        payload: "{{data}}",
        metadata: {
          timestamp: "{{Date.now()}}",
          source: "workflow_engine",
          version: "2.0"
        }
      }
    },
    
    // Timeout and retry configuration
    timeout: 15000,
    retries: 3,
    retryDelay: 2000,
    retryBackoff: "exponential",
    retryOn: ["timeout", "5xx", "network"],
    
    // Response processing
    responseMapping: {
      type: "conditional",
      conditions: [
        {
          if: { field: "status", operator: "equals", value: "success" },
          then: {
            type: "object",
            mappings: {
              "id": "data.user.id",
              "name": "data.user.full_name",
              "email": "data.user.email",
              "status": "data.user.status",
              "last_login": {
                path: "data.user.last_login_timestamp",
                transform: {
                  type: "date",
                  format: "YYYY-MM-DD HH:mm:ss",
                  fallback: "Never"
                }
              },
              "preferences": {
                path: "data.user.preferences",
                fallback: {}
              }
            }
          }
        }
      ],
      else: {
        type: "template",
        template: "Error: {{response.message || 'Unknown error occurred'}}",
        template_es: "Error: {{response.message || 'Error desconocido ocurrió'}}",
        template_fr: "Erreur: {{response.message || 'Erreur inconnue survenue'}}"
      }
    }
  },
  
  // Authentication configuration
  apiKey: "{{secrets.apiKey}}",  // Dynamic from secure storage
  
  // Advanced security settings
  security: {
    requiresAuth: true,
    auditLevel: "high",
    dataClassification: "pii",
    
    // Rate limiting
    rateLimit: {
      requests: 50,
      window: 60000,
      strategy: "sliding"
    },    
  },    
}
```

### Data Classification

Classify tools by sensitivity:

```javascript
{
  security: {
    requiresAuth: true,
    auditLevel: "high",              // "low", "medium", "high", "critical"
    dataClassification: "sensitive"  // "public", "internal", "sensitive", "financial"
  }
}
```

### Approved Functions Registry

Local functions must be pre-approved:

```javascript
const APPROVED_FUNCTIONS = {};
APPROVED_FUNCTIONS['safeFunctionName'] = safeFunctionImplementation;

// Only functions in this registry can be called
```

## Advanced Features

### URL Template Interpolation

Use variables in API URLs:

```javascript
{
  implementation: {
    type: "http",
    url: "https://api.example.com/users/{{userId}}/orders/{{orderId}}",
    pathParams: ["userId", "orderId"]
  }
}
```

### Tool Configuration Best Practices

#### ✅ Configuration Best Practices:

**Comprehensive Parameter Validation**
```javascript
// Always define strict parameter schemas
parameters: {
  type: "object",
  properties: {
    amount: {
      type: "number",
      minimum: 0.01,
      maximum: 10000,
      multipleOf: 0.01  // Enforce currency precision
    }
  },
  required: ["amount"],
  additionalProperties: false  // Prevent unexpected parameters
}
```

**Security-First Configuration**
```javascript
// Always classify data and set appropriate security
security: {
  dataClassification: "financial",  // Be explicit
  auditLevel: "critical",          // Match the importance
  rateLimit: { /* appropriate limits */ }
}
```

**Response Transformation**
```javascript
// Transform responses to consistent format
responseMapping: {
  type: "object",
  mappings: {
    "standardField": "api_field",
    "amount": {
      path: "transaction.amount_cents",
      transform: { type: "divide", value: 100 }  // Convert cents to dollars
    }
  }
}
```

#### ❌ Configuration Anti-Patterns:

1. **Loose Parameter Validation**
```javascript
// ❌ Too permissive
parameters: {
  type: "object",
  additionalProperties: true  // Allows anything
}

// ✅ Strict validation
parameters: {
  type: "object",
  properties: { /* specific properties */ },
  additionalProperties: false
}
```

2. **Missing Security Classification**
```javascript
// ❌ No security configuration
{
  id: "PaymentTool",
  // missing security configuration
}

// ✅ Proper security
{
  id: "PaymentTool",
  security: {
    dataClassification: "financial",
    auditLevel: "critical",
    requiresAuth: true
  }
}
```

3. **No Response Validation**
```javascript
// ❌ No response processing
implementation: {
  type: "http",
  url: "..."
  // No responseMapping - raw response returned
}

// ✅ Processed response
implementation: {
  type: "http",
  url: "...",
  responseMapping: { /* transform response */ }
}
```

## Understanding URL Parameters and Templates

### Two Templating Systems

The workflow engine uses **two different templating syntaxes** for different purposes:

1. **`{singleBraces}`** - For URL path parameters (requires `pathParams` configuration)
2. **`{{doubleBraces}}`** - For variable interpolation (automatic, no configuration needed)

### Path Parameters (`pathParams`)

Path parameters use **single braces `{param}`** and allow you to build dynamic URLs by substituting argument values into URL templates. This is essential for RESTful APIs where resource IDs are part of the URL path.

#### How it Works:

1. **Define URL Template**: Use `{paramName}` placeholders (single braces) in your URL
2. **Specify pathParams**: List which arguments should be substituted
3. **Engine Processing**: Arguments are safely encoded and substituted into URL

#### Why Single Braces for URLs?

- **Security**: Ensures proper URL encoding and injection prevention
- **Explicit Control**: You must explicitly declare which parameters go into the URL
- **Separation of Concerns**: URL building vs. variable interpolation are different operations

#### Example 1: URL Path Parameters vs Variable Interpolation

**URL Building (Single Braces):**
```javascript
{
  implementation: {
    url: "https://wttr.in/{q}",      // Single braces for URL paths
    pathParams: ["q"]                // Must declare path parameters
  },
  // Arguments can use variable interpolation (double braces)
  args: {
    q: "{{userCity}}"               // Double braces for variables
  }
}

// Process:
// 1. userCity = "New York" (from flow variables)
// 2. args.q becomes "New York" (double brace substitution)  
// 3. URL becomes "https://wttr.in/New York" → "https://wttr.in/New%20York" (safe encoding)
```

**Alternative - Could you use double braces in URLs? Technically yes, but not recommended:**
```javascript
{
  implementation: {
    url: "https://wttr.in/{{userCity}}"  // This would work but bypasses safety
  }
}
// Problems: No explicit parameter declaration, potential encoding issues
```

#### Example 2: RESTful API with Multiple Parameters

```javascript
{
  implementation: {
    url: "https://api.example.com/users/{userId}/orders/{orderId}",
    pathParams: ["userId", "orderId"]
  }
}

// When called with args: { userId: "123", orderId: "456" }
// Final URL becomes: "https://api.example.com/users/123/orders/456"
```

#### Example 3: Mixed Path and Query Parameters

```javascript
{
  implementation: {
    url: "https://api.github.com/repos/{owner}/{repo}/issues",
    pathParams: ["owner", "repo"],
    queryParams: ["state", "labels", "sort"]
  }
}

// When called with args: { owner: "microsoft", repo: "vscode", state: "open", sort: "updated" }
// Final URL becomes: "https://api.github.com/repos/microsoft/vscode/issues?state=open&sort=updated"
```

### Variable Interpolation in Arguments

When defining arguments for tools, you can use **double braces `{{variable}}`** to insert flow variables:

```javascript
{
  id: "weather-step",
  type: "CALL-TOOL", 
  tool: "GetWeather",
  args: {
    q: "{{userCity}}",              // Double braces - flow variable
    format: "json",                 // Static value
    apiKey: "{{config.weatherKey}}" // Another flow variable
  }
}
```

### Best Practices for Templates

#### ✅ Recommended Approach:
```javascript
{
  implementation: {
    url: "https://api.example.com/users/{userId}",  // Single braces
    pathParams: ["userId"]                          // Explicit declaration
  },
  args: {
    userId: "{{currentUser.id}}",                   // Double braces for variables
    includeDetails: true                            // Static values
  }
}
```

#### ❌ Avoid Direct Variable URLs:
```javascript
{
  implementation: {
    url: "https://api.example.com/users/{{currentUser.id}}"  // Less safe, harder to debug
  }
}
```

### Query Parameters (`queryParams`)

Query parameters are added to the URL as query string parameters (`?key=value&key2=value2`).

#### Usage:

```javascript
{
  implementation: {
    url: "https://api.example.com/search",
    queryParams: ["q", "limit", "offset"]
  }
}

// When called with args: { q: "javascript", limit: 10, offset: 20 }
// Final URL becomes: "https://api.example.com/search?q=javascript&limit=10&offset=20"
```

### Custom Query String

For APIs that need specific query parameters regardless of arguments:

```javascript
{
  implementation: {
    url: "https://wttr.in/{q}",
    pathParams: ["q"],
    customQuery: "format=j1&units=metric"
  }
}

// When called with args: { q: "Paris" }
// Final URL becomes: "https://wttr.in/Paris?format=j1&units=metric"
```

### Form Data and POST Requests

For APIs that require form data or file uploads:

```javascript
{
  id: "FileUploadTool",
  name: "Upload File",
  description: "Uploads a file to the server",
  version: "1.0.0",
  
  parameters: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description: "Base64 encoded file content",
        contentEncoding: "base64"
      },
      filename: {
        type: "string",
        description: "Name of the file"
      },
      category: {
        type: "string",
        enum: ["document", "image", "video"],
        description: "File category"
      }
    },
    required: ["file", "filename"]
  },
  
  implementation: {
    type: "http",
    url: "https://api.example.com/upload",
    method: "POST",
    contentType: "multipart/form-data",
    
    // Form data configuration
    formData: {
      file:     "{file}",                         // File content from args
      filename: "{filename}",                     // Filename from args  
      category: "{category}",                     // Category from args
      metadata: "{{JSON.stringify(uploadMeta)}}", // Complex data serialization
      timestamp: "{{Date.now()}}"                 // Dynamic values
    },
    
    // Alternative: URL-encoded form data
    contentType: "application/x-www-form-urlencoded",
    formData: {
      username: "{username}",
      password: "{password}",
      remember: "true"
    }
  }
}
```

### Advanced Parameter Configuration

Enhanced parameter definitions with comprehensive validation:

```javascript
{
  parameters: {
    type: "object",
    properties: {
      email: {
        type: "string",
        format: "email",
        description: "User email address",
        examples: ["user@example.com"]
      },
      age: {
        type: "integer",
        minimum: 0,
        maximum: 150,
        description: "User age in years"
      },
      preferences: {
        type: "object",
        properties: {
          language: {
            type: "string",
            enum: ["en", "es", "fr", "de"],
            default: "en"
          },
          notifications: {
            type: "boolean",
            default: true
          }
        },
        additionalProperties: false
      },
      tags: {
        type: "array",
        items: {
          type: "string",
          minLength: 1,
          maxLength: 50
        },
        minItems: 1,
        maxItems: 10,
        uniqueItems: true
      }
    },
    required: ["email"],
    additionalProperties: false,
    
    // Custom validation rules
    customValidation: {
      "age_consent": "age >= 13 || parent_consent === true",
      "email_domain": "email.endsWith('@company.com') || role === 'external'"
    }
  }
}

### Security and Encoding

- **Automatic URL Encoding**: All path and query parameters are automatically URL-encoded
- **Injection Prevention**: Template substitution prevents URL injection attacks
- **Validation**: Parameters are validated against the tool's schema before substitution

#### Safe Character Handling:

```javascript
// Input: { q: "New York" }
// Safe URL: "https://wttr.in/New%20York"

// Input: { search: "coffee & tea" }
// Safe URL: "https://api.example.com/search?q=coffee%20%26%20tea"
```

### Common Patterns

#### 1. Resource-by-ID Pattern
```javascript
url: "https://api.example.com/users/{id}",
pathParams: ["id"]
```

#### 2. Nested Resource Pattern
```javascript
url: "https://api.example.com/users/{userId}/posts/{postId}",
pathParams: ["userId", "postId"]
```

#### 3. Search with Filters Pattern
```javascript
url: "https://api.example.com/products",
queryParams: ["category", "minPrice", "maxPrice", "sort"]
```

#### 4. Pagination Pattern
```javascript
url: "https://api.example.com/items",
queryParams: ["page", "limit", "offset"]
```

### Variable Storage

Store tool results for later use:

```javascript
{
  id: "get-account-info",
  type: "CALL-TOOL",
  tool: "GetAccountInfo",
  variable: "accountDetails"    // Store result in this variable
}

// Later in the flow, access with {{accountDetails.balance}}
```

### Timeout and Retries

Configure resilience:

```javascript
{
  implementation: {
    timeout: 5000,        // 5 second timeout
    retries: 3,           // Retry 3 times on failure
    retryDelay: 1000      // Wait 1 second between retries
  }
}
```

## Example: Complete Weather Tool Integration

Here's a complete example showing a weather tool integration:

### 1. Tool Registry Definition

```javascript
{
  id: "GetWeather",
  name: "Get Weather Information",
  description: "Fetches current weather information for a given city",
  version: "1.0.0",
  
  parameters: {
    type: "object",
    properties: {
      q: {
        type: "string",
        description: "City name for weather lookup",
        minLength: 2,
        maxLength: 100
      }
    },
    required: ["q"],
    additionalProperties: false
  },
  
  implementation: {
    type: "http",
    url: "https://wttr.in/{q}",
    method: "GET",
    pathParams: ["q"],
    customQuery: "format=j1",
    timeout: 5000,
    retries: 2,
    
    responseMapping: {
      type: "jsonPath",
      mappings: {
        "location": {
          path: "nearest_area[0].areaName[0].value",
          fallback: "Unknown"
        },
        "temperature": {
          path: "current_condition[0].temp_C",
          transform: { type: "parseInt", fallback: 0 }
        },
        "condition": {
          path: "current_condition[0].weatherDesc[0].value",
          fallback: "Unknown"
        },
        "humidity": {
          path: "current_condition[0].humidity",
          transform: { type: "parseInt", fallback: 0 }
        }
      }
    }
  },
  
  security: {
    requiresAuth: false,
    auditLevel: "low",
    dataClassification: "public",
    rateLimit: { requests: 20, window: 60000 }
  }
}
```

### 2. Flow Step Using the Tool

```javascript
{
  id: "get-weather-step",
  type: "CALL-TOOL",
  tool: "GetWeather",
  variable: "weatherInfo",
  args: {
    q: "{{userCity}}"
  },
  onFail: {
    type: "SAY",
    value: "Sorry, I couldn't get weather information for {{userCity}}. Please try again later."
  }
}
```

### 3. Using the Result

```javascript
{
  id: "show-weather",
  type: "SAY",
  value: "The weather in {{weatherInfo.location}} is {{weatherInfo.condition}} with a temperature of {{weatherInfo.temperature}}°C and humidity of {{weatherInfo.humidity}}%."
}
```

## Best Practices

### 1. Tool Design
- **Single Responsibility**: Each tool should do one thing well
- **Clear Parameters**: Use descriptive parameter names and validation
- **Consistent Responses**: Maintain consistent response structures
- **Error Handling**: Always provide meaningful error messages

### 2. Security
- **Validate Inputs**: Use comprehensive parameter validation
- **Rate Limiting**: Implement appropriate rate limits
- **Authentication**: Use secure authentication methods
- **Audit Logging**: Enable audit logging for sensitive operations

### 3. Performance
- **Timeouts**: Set reasonable timeouts for all tools
- **Retries**: Implement retry logic for transient failures
- **Caching**: Consider caching for frequently accessed data
- **Mock Testing**: Use mock implementations for development

### 4. Response Mapping
- **Fallback Values**: Always provide fallback values for critical fields
- **Type Conversion**: Use transforms for proper type conversion
- **Error Gracefully**: Handle malformed responses gracefully
- **Test Thoroughly**: Test mapping with various response formats

## Troubleshooting

### Common Issues

1. **Tool Not Found**: Ensure tool ID matches exactly in registry
2. **Parameter Validation Errors**: Check parameter schema against actual arguments
3. **Authentication Failures**: Verify API keys and authentication configuration
4. **Timeout Errors**: Increase timeout values for slow APIs
5. **Mapping Errors**: Validate JSONPath expressions and fallback values

### Debugging Tips

1. **Enable Logging**: Set log level to debug for detailed information
2. **Test in Isolation**: Test tools independently before using in flows
3. **Check Network**: Verify network connectivity for HTTP tools
4. **Validate Schemas**: Ensure parameter schemas are correct
5. **Monitor Rate Limits**: Check for rate limiting issues

---

This completes the TOOL-CALL support chapter. The system provides enterprise-grade tool integration with comprehensive security, error handling, and response transformation capabilities.

---

# Chapter 2: Variable Management and Expression System

## Overview

The JavaScript Flow Engine features a **simplified, powerful JavaScript expression evaluator** that handles variable interpolation, mathematical operations, logical expressions, and conditional logic with full JavaScript syntax support. This system  provides reliable expression evaluation by using native JavaScript execution within a security framework.

## Core Concepts

### Variable Scope and Storage

Variables in the workflow engine operate at multiple scopes:

- **Flow Variables**: Stored in `flowFrame.variables` - persistent throughout the flow execution
- **Step Variables**: Created by individual steps (tool results, user inputs)
- **Session Variables**: Persist across workflow executions (`caller_id`, `caller_name`, `thread_id`)
- **Context Variables**: Derived from conversation history and context stack

### Simplified Expression System

The engine uses a **single, powerful JavaScript evaluator** that provides 100% compatibility with JavaScript expressions while maintaining security through limited access to explictly shared variables and functions.

- **Direct JavaScript Evaluation**: All expressions are evaluated as native JavaScript
- **Type Preservation**: Single expressions like `{{count + 1}}` preserve their JavaScript types
- **Template Interpolation**: String templates like `"Count: {{count + 1}}"` handle string conversion
- **No Complex Parsing**: Eliminates the complexity and edge cases of custom expression parsers
- **Full Compatibility**: All standard JavaScript operators, precedence, and semantics supported

### Template Interpolation Syntax

The engine uses **double braces `{{expression}}`** for variable/expression interpolation with two distinct behaviors:

**Single Expression Mode** (preserves JavaScript types):
```javascript
// These return native JavaScript types - numbers stay numbers, booleans stay booleans
"{{attempt_count + 1}}"                        // Returns number: 2
"{{age >= 18 && verified}}"                    // Returns boolean: true
"{{user_data.profile}}"                        // Returns object: {...}
```

**Template String Mode** (converts to strings):
```javascript
// These are string templates with embedded expressions converted to strings
"Attempt {{attempt_count + 1}} of {{max_attempts}}"    // Returns string: "Attempt 2 of 3"
"Welcome {{user.name}} (Status: {{verified ? 'OK' : 'Pending'}})"
"Total: ${{(price * quantity).toFixed(2)}}"
```

## Expression Types and Syntax

### Simplified JavaScript Evaluation

The workflow engine uses **direct JavaScript evaluation** with a security framework, providing 100% JavaScript compatibility while maintaining safety:

- **Native JavaScript**: All expressions are evaluated as standard JavaScript code
- **Type Preservation**: Single expressions preserve their native JavaScript types
- **Template Conversion**: String templates handle automatic type conversion for interpolation
- **Full Operator Support**: All JavaScript operators, precedence, and semantics supported
- **Access Safety**: Only variables and functions explictly exported are accessable.

### Expression Examples

```javascript
// ✅ ALL SUPPORTED - Full JavaScript syntax
"{{userName}}"                                 // Variable access
"{{user.profile.email}}"                       // Object property access
"{{items[0].name}}"                            // Array/object indexing
"{{age >= 18 && verified}}"                    // Logical expressions  
"{{price * quantity + tax}}"                   // Mathematical operations
"{{status || 'Unknown'}}"                      // Nullish/falsy fallbacks
"{{balance > 1000 ? 'Premium' : 'Standard'}}"  // Ternary conditionals
"{{Math.round(average)}}"                      // Method calls
"{{new Date().getFullYear()}}"                 // Constructor calls (if allowed by security)
```

### Key Behavioral Differences

**Single Expression (Type Preserving)**:
```javascript
// In SET steps or other contexts expecting native values
{ type: "SET", variable: "count", value: "{{attempt_count + 1}}" }
// Result: count = 2 (number), not "2" (string)

{ type: "SET", variable: "isEligible", value: "{{age >= 18 && verified}}" }  
// Result: isEligible = true (boolean), not "true" (string)
```

**Template String (String Converting)**:

```javascript  
// In SAY steps or other string contexts
{ type: "SAY", value: "Attempt {{attempt_count + 1}} of {{max_attempts}}" }
// Result: "Attempt 2 of 3" (string)

{ type: "SAY", value: "Status: {{verified ? 'Verified' : 'Pending'}}" }
// Result: "Status: Verified" (string)
```

## Security Features

### Simplified JavaScript Evaluation Architecture

The Workflow Engine uses a **direct JavaScript evaluation approach** with security through controlled access limited to to exported variables and functions. This simplified architecture provides 100% JavaScript compatibility while maintaining security.

#### Core Security Principles

1. **Controlled Access**: Only exported entities are allowed as valid JavaScript identifiers.  
2. **User Input Safety**: User inputs are treated as values, not code structure
3. **Function Constructor**: Uses JavaScript Function constructor with acess explictly limited to wxported entities.
4. **No eval()**: Direct function construction without string evaluation dangers

#### Security Features

**User Input Safety**:
- User inputs become **values** in the variable context
- Users cannot inject code structure or operators
- Variable names are controlled by developers, not users

**Function Constructor Safety**:
- No string `eval()` vulnerabilities
- Controlled access limited to explicitly exported variables and functions.
- Expression evaluated in controlled scope

#### What's Allowed vs Blocked

**✅ ALLOWED - Full JavaScript within parameter scope**:
```javascript
{{userName}}                                 // Variable access
{{age >= 18 && verified}}                    // All logical operators
{{price * quantity + tax}}                   // All mathematical operations  
{{status || 'default'}}                      // Nullish coalescing
{{items.length > 0 ? 'Has items' : 'Empty'}} // Ternary conditionals
{{Math.round(average)}}                      // Method calls on allowed objects
```

**❌ AUTOMATICALLY BLOCKED - Access to any unexported variable or function

**Developer Responsibility**:

## Advanced Expression Features

### Type Preservation Examples

The new expression system correctly preserves JavaScript types in single expressions:

```javascript
// SET steps preserve native types
{ type: "SET", variable: "attempt_count", value: "{{attempt_count + 1}}" }
// Result: attempt_count = 2 (number)

{ type: "SET", variable: "is_eligible", value: "{{age >= 18 && verified}}" }  
// Result: is_eligible = true (boolean)

{ type: "SET", variable: "user_profile", value: "{{api_response.user}}" }
// Result: user_profile = {name: "John", ...} (object)
```

### Template String Examples  

String templates automatically convert embedded expressions to strings:

```javascript
// SAY steps with templates create strings
{ type: "SAY", value: "Attempt {{attempt_count + 1}} of {{max_attempts}}" }
// Result: "Attempt 2 of 3"

{ type: "SAY", value: "Welcome {{user.name}} ({{verified ? 'Verified' : 'Pending'}})" }
// Result: "Welcome John (Verified)"
```

### Variable Access

```javascript
// Deep object traversal
{{user.profile.settings.notifications.email}}

// Array access
{{orders.items.length}}
{{user.addresses.primary.zipcode}}

// Complex nested expressions
{{user.account.balance > subscription.plan.price ? 'sufficient' : 'insufficient'}}
```

### Complex Business Logic

```javascript
// Multi-condition eligibility
{{(age >= 21 && creditScore > 650 && income > 30000) || (hasGuarantor && income > 20000)}}

// Dynamic pricing calculations
{{basePrice * quantity * (isMember ? 0.9 : 1.0) * (isHoliday ? 1.1 : 1.0)}}

// Status determination
{{isVerified && !isSuspended && balance > 0 && lastLogin < 90 ? 'active' : 'inactive'}}
```

### User-Defined Approved Functions

Register custom business logic functions for use in expressions:

```javascript
// Example: Register custom functions during engine initialization
const APPROVED_FUNCTIONS = {
  'currentTime': () => new Date().toISOString(),
  'extractCrypto': (text) => /* crypto extraction logic */,
  'formatCurrency': (amount, currency) => /* formatting logic */,
  'validateEmail': (email) => /* validation logic */
};

// Use in expressions
{{currentTime()}}                               // Current timestamp
{{extractCrypto(userMessage)}}                 // Extract crypto symbols
{{formatCurrency(amount, 'USD')}}              // Format money
{{validateEmail(input) ? 'Valid' : 'Invalid'}} // Email validation
```

---

# Chapter 3: Workflows and Step Types

## Overview

Workflows are the core building blocks of the JavaScript Flow Engine. They define structured, conversational sequences that guide users through specific tasks or processes. This chapter explains what workflows are, how they're structured, and covers all supported step types that enable sophisticated user interactions.

## Understanding Workflows

### What is a Workflow?

A **workflow** is a structured sequence of steps that defines a conversational process between a user and the system. Workflows enable:

- **Guided Conversations**: Step-by-step user interactions
- **Dynamic Content**: Variable-driven responses and branching logic
- **Data Collection**: Gathering and validating user input
- **External Integration**: Calling tools, APIs, and services
- **Complex Business Logic**: Multi-step decision processes

### Workflow Structure

Every workflow is defined as a JSON structure with these key components:

```javascript
{
  id: "payment-workflow",              // Unique workflow identifier
  name: "ProcessPayment",              // Internal name for the workflow
  prompt: "Process a payment",         // Default user-facing description
  prompt_es: "Procesar un pago",       // Spanish description
  prompt_<lang>: "..."                 // Any language you want to support

  description: "Handle payment processing with validation and confirmation",
  version: "1.0.0",                   // Version for compatibility
  
  // Workflow execution sequence
  steps: [
    { id: "welcome", type: "SAY", value: "Let's process your payment." },
    { id: "get-amount", type: "SAY-GET", variable: "amount", value: "Enter payment amount:" },
    { id: "validate", type: "CASE", branches: { /* validation logic */ } },
    { id: "process", type: "CALL-TOOL", tool: "PaymentProcessor" },
    { id: "confirm", type: "SAY", value: "Payment of ${{amount}} processed successfully!" }
  ],
  
  // Optional: Initial variable values
  variables: {
    currency: { type: "string", value: "USD" },
    maxAmount: { type: "number", value: 10000 }
  },
  
  // Optional: Workflow metadata
  metadata: {
    riskLevel: "high",
    category: "financial",
    requiresAuth: true
  }
}
```

### Workflow Execution Model

Workflows execute using a **stack-based model** that supports:

1. **Linear Execution**: Steps execute sequentially
2. **Branching**: Conditional logic routes to different paths
3. **Sub-workflows**: Calling other workflows as steps
4. **Interruption/Resumption**: Users can switch between workflows and return
5. **Variable Sharing**: Data flows between steps and workflows

### Variable Scope in Workflows

Variables operate at multiple levels:

- **Flow Variables**: Persist throughout the workflow execution
- **Step Variables**: Created by individual steps (user input, tool results)
- **Global Variables**: Shared across all workflows in a session
- **Session Variables**: Persist across workflow executions

## Step Types Reference

### SAY Steps - Display Messages

**Purpose**: Output messages to users with dynamic content support.

```javascript
{
  id: "welcome-message",
  type: "SAY",
  value: "Welcome {{user_name}}! Your balance is ${{account_balance}}.",
  value_es: "¡Bienvenido {{user_name}}! Su saldo es ${{account_balance}}."
}
```

**Key Features:**
- **Template Interpolation**: Use `{{variable}}` for dynamic content
- **Multi-language Support**: Different values per language (value_en, value_es, etc.)
- **Expression Support**: Full mathematical and logical expressions
- **Message Accumulation**: Multiple SAY steps combine into single output until the next wait state (SAY-GET)

**Advanced Examples:**
```javascript
// Conditional messaging with business logic
{
  id: "account-status",
  type: "SAY",
  value: "Account status: {{is_verified && balance > 0 && !is_suspended ? 'Active and ready' : 'Requires attention'}}"
}

// Complex calculations in messages
{
  id: "order-summary",
  type: "SAY",
  value: "Order total: ${{(item_price * quantity) + (shipping_cost) + (tax_rate * item_price * quantity)}}"
}

// Multi-condition personalization
{
  id: "greeting",
  type: "SAY",
  value: "{{timeOfDay === 'morning' ? 'Good morning' : timeOfDay === 'afternoon' ? 'Good afternoon' : 'Good evening'}}, {{user_preferred_name || user_first_name || 'there'}}!"
}
```

### SAY-GET Steps - Interactive Input Collection

**Purpose**: Display a message and collect user input, storing it in a variable.

```javascript
{
  id: "collect-payment-amount",
  type: "SAY-GET",
  variable: "payment_amount",
  value: "Enter payment amount (minimum ${{min_payment}}, maximum ${{max_payment}}):"
}
```

**Key Features:**
- **Variable Storage**: User input automatically saved to specified variable
- **Dynamic Prompts**: Template interpolation in questions
- **Context Awareness**: Previous conversation affects prompts
- **Validation Ready**: Collected data available for subsequent validation

**Practical Examples:**
```javascript
// Simple data collection
{
  id: "get-name",
  type: "SAY-GET",
  variable: "customer_name",
  value: "Please provide your full name:"
}

// Conditional prompting
{
  id: "get-verification",
  type: "SAY-GET",
  variable: "verification_code",
  value: "{{verification_method === 'sms' ? 'Enter the SMS code:' : 'Enter the email verification code:'}}"
}

// Dynamic prompts with calculations
{
  id: "get-loan-amount",
  type: "SAY-GET",
  variable: "requested_amount",
  value: "Enter loan amount. Based on your {{credit_score}} credit score and {{debt_to_income}}% debt ratio, you qualify for up to ${{max_qualifying_amount}}:"
}
```

### SET Steps - Variable Assignment and Calculations

**Purpose**: Assign values to variables using expressions, calculations, or static values.

```javascript
{
  id: "calculate-total",
  type: "SET",
  variable: "order_total",
  value: "{{base_price * quantity + shipping_cost + (tax_rate * base_price * quantity)}}"
}
```

**Key Features:**
- **Expression Evaluation**: Full mathematical and logical expression support
- **Type Handling**: Automatic conversion between strings, numbers, booleans
- **Conditional Assignment**: Use ternary operators for dynamic values
- **Data Transformation**: Format and manipulate data for subsequent steps

**Common Patterns:**
```javascript
// Mathematical calculations
{
  id: "apply-discount",
  type: "SET",
  variable: "final_price",
  value: "{{base_price * (is_vip_member ? 0.85 : 0.95)}}"  // 15% VIP discount, 5% regular
}

// Business logic evaluation
{
  id: "determine-eligibility",
  type: "SET",
  variable: "loan_eligible",
  value: "{{credit_score >= 650 && annual_income >= 30000 && debt_ratio < 0.4}}"
}

// Data formatting and combination
{
  id: "create-display-name",
  type: "SET",
  variable: "full_name",
  value: "{{first_name}} {{middle_initial ? middle_initial + '. ' : ''}}{{last_name}}"
}

// Complex conditional logic
{
  id: "set-shipping-cost",
  type: "SET",
  variable: "shipping",
  value: "{{order_total > 100 ? 0 : (is_member ? 7.99 : 12.99)}}"
}
```

### CALL-TOOL Steps - External System Integration

**Purpose**: Execute external tools, APIs, or internal functions to fetch data or perform operations.

```javascript
{
  id: "process-payment",
  type: "CALL-TOOL",
  tool: "PaymentProcessor",
  variable: "payment_result",           // Store result here
  args: {                               // Tool arguments
    amount: "{{payment_amount}}",
    currency: "USD",
    method: "{{payment_method}}"
  },
  onFail: {                            // Error handling
    type: "SAY",
    value: "Payment failed: {{errorMessage}}. Please try again."
  }
}
```

**Key Features:**
- **Dynamic Arguments**: Use variables and expressions in tool arguments
- **Result Storage**: Automatically store tool responses in variables
- **Error Handling**: Define custom responses for tool failures
- **Response Mapping**: Transform tool responses into usable data

**Advanced Tool Examples:**
```javascript
// API call with conditional arguments
{
  id: "fetch-weather",
  type: "CALL-TOOL",
  tool: "WeatherAPI",
  variable: "weather_data",
  args: {
    location: "{{user_location}}",
    units: "{{user_preference_metric ? 'metric' : 'imperial'}}",
    include_forecast: "{{subscription_tier === 'premium'}}"
  }
}

// Financial service with validation
{
  id: "validate-account",
  type: "CALL-TOOL",
  tool: "AccountValidator",
  variable: "account_info",
  args: {
    account_number: "{{account_number}}",
    ssn_last_four: "{{ssn_digits}}"
  },
  onFail: {
    type: "SAY",
    value: "Account validation failed. Please verify your information."
  }
}
```

### FLOW Steps - Sub-workflow Execution

**Purpose**: Execute other workflows as sub-processes, enabling workflow composition and reusability.

```javascript
{
  id: "verify-identity",
  type: "FLOW",
  name: "IdentityVerification",         // Target workflow name
  callType: "call",                     // Execution mode
  variable: "verification_result"        // Store sub-workflow result
}
```

**Call Types:**
- **`"call"`** (default): Execute sub-workflow, return to current workflow after completion
- **`"replace"`**: Replace current workflow with new workflow
- **`"reboot"`**: Clear all workflows and start fresh (emergency recovery)

**Sub-workflow Examples:**
```javascript
// Standard sub-workflow call
{
  id: "address-verification",
  type: "FLOW",
  name: "AddressVerification",
  callType: "call",
  variable: "address_verified"
}

// Conditional sub-workflow routing
{
  id: "route-support",
  type: "FLOW",
  name: "{{user_tier === 'premium' ? 'PremiumSupport' : 'StandardSupport'}}",
  callType: "call"
}

// Emergency flow replacement
{
  id: "security-breach-handler",
  type: "FLOW",
  name: "SecurityProtocol",
  callType: "reboot"  // Clear all contexts and start fresh
}
```

### SWITCH and CASE Steps - Conditional Branching

**Purpose**: Route workflow execution based on variable values or complex conditions.

**SWITCH Steps** perform exact value matching:
```javascript
{
  id: "handle-user-choice",
  type: "SWITCH",
  variable: "user_selection",
  branches: {
    "1": { type: "SAY", value: "You selected account information" },
    "2": { type: "SAY", value: "You selected make payment" },
    "default": { type: "SAY", value: "Invalid selection" }
  }
}
```

**CASE Steps** evaluate complex conditions:
```javascript
{
  id: "eligibility-check", 
  type: "CASE",
  branches: {
    "condition: age >= 21 && is_verified && credit_score > 750": {
      type: "SAY", value: "Premium tier approved!"
    },
    "condition: age >= 18 && is_verified": {
      type: "SAY", value: "Standard features available"
    },
    "default": { type: "SAY", value: "Complete verification first" }
  }
}
```

**Key Features:**
- **SWITCH**: Exact string/number matching with multiple branches
- **CASE**: Complex conditional logic with full expression support
- **Default Branches**: Fallback handling for unmatched cases
- **Nested Logic**: Each branch can contain any step type

*Note: Advanced branching patterns and complex decision trees are covered in Chapter 4.*

## Step Execution Lifecycle

### 1. Step Preparation
- Variables are resolved and expressions evaluated
- Dynamic content is generated
- Arguments are validated and prepared

### 2. Step Execution
- SAY: Message accumulation
- SAY-GET: Message output and input waiting
- SET: Variable assignment
- CALL-TOOL: External system integration
- FLOW: Sub-workflow execution

### 3. Result Processing
- Results stored in specified variables
- Context stack updated with step results
- Error handling triggered if needed
- Next step determined based on results

### 4. Flow Continuation
- Linear progression to next step
- Conditional branching based on results
- Sub-workflow calls or returns
- Flow completion or termination

## Multi-language Support and Internationalization

The JavaScript Flow Engine provides comprehensive internationalization (i18n) support through language-specific properties.

### Language-Specific Properties

All user-facing content supports language variants using the `_<lang>` suffix pattern:

```javascript
{
  id: "welcome-step",
  type: "SAY",
  value: "Welcome to our service!",             // Default 
  value_en: "Welcome to our service!",          // English
  value_es: "¡Bienvenido a nuestro servicio!",  // Spanish
  value_fr: "Bienvenue dans notre service!",    // French
  value_de: "Willkommen bei unserem Service!",  // German
  value_pt: "Bem-vindo ao nosso serviço!",      // Portuguese
}
```

**Language Selection:**
- Engine uses `language` property to select appropriate message
- Falls back to default `value` or 'promot' if language-specific version not available
- Supports any language code (en, es, fr, de, pt, zh, ja, etc.)

### Workflow-Level Internationalization

Complete workflows can be internationalized:

```javascript
{
  id: "payment-workflow",
  name: "ProcessPayment",              
  prompt: "Process a payment",         // Default English
  prompt_es: "Procesar un pago",       // Spanish
  prompt_fr: "Traiter un paiement",    // French  
  prompt_de: "Zahlung verarbeiten",    // German
  prompt_pt: "Processar pagamento",    // Portuguese
  
  description: "Handle payment processing with validation",
  description_es: "Manejar procesamiento de pagos con validación",
  description_fr: "Gérer le traitement des paiements avec validation",
  
  steps: [
    {
      id: "amount-request",
      type: "SAY-GET",
      variable: "amount",
      value: "Enter payment amount:",
      value_es: "Ingrese el monto del pago:",
      value_fr: "Entrez le montant du paiement:",
      value_de: "Zahlungsbetrag eingeben:",
      value_pt: "Digite o valor do pagamento:",
      value_zh: "输入付款金额:",
      value_ja: "支払い金額を入力してください:"
    }
  ]
}
```

### GuidanceConfig - Advanced User Assistance

The `guidanceConfig` parameter provides sophisticated user guidance and help systems:

### Message Registry - Custom Templates

Define custom message templates with full internationalization:

```javascript
const messageRegistry = {
  // System messages
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
```

### Best Practices for Internationalization

#### ✅ Recommended Approaches:
```javascript
// Always provide fallbacks
value: "Default English text",
value_es: "Spanish translation",
// Engine falls back to 'value' if user's language not available

// Use consistent language codes (ISO 639-1)
value_es: "Spanish",     // ✅ Correct
value_spa: "Spanish",    // ❌ Avoid

// Consider cultural context, not just translation
value: "Enter your ZIP code",
value_uk: "Enter your postcode",     // UK English variant
value_es: "Ingresa tu código postal" // Spanish

// Use proper number/date formatting per locale
value: "Total: ${{amount}}",
value_eu: "Total: {{amount}}€",
value_jp: "合計: ¥{{amount}}"
```

#### ❌ Common Mistakes to Avoid:
```javascript
// Don't hardcode language-specific content in logic
if (language === "es") {
  return "Hola";  // ❌ Bad - hardcoded
}

// Better - use language properties
return getMessage("greeting", language);  // ✅ Good

// Don't assume text length will be similar
value: "OK",           // 2 characters
value_de: "Bestätigen" // 10 characters - breaks UI layouts
```

## Error Handling in Steps

All step types support error handling through various mechanisms:

### Step-Level Error Handling
```javascript
{
  id: "risky-operation",
  type: "CALL-TOOL",
  tool: "ExternalAPI",
  onFail: {
    type: "SAY",
    value: "Operation failed. {{errorMessage}}"
  }
}
```

### Graceful Degradation
```javascript
// Use fallback values in expressions
{
  id: "safe-greeting",
  type: "SAY",
  value: "Hello {{user_name || 'valued customer'}}!"
}
```

### Validation Steps
```javascript
// Validate user input before proceeding
{
  id: "validate-amount",
  type: "CASE",
  branches: {
    "condition: payment_amount > 0 && payment_amount <= max_amount": {
      type: "SAY",
      value: "Amount validated. Proceeding with payment."
    },
    "default": {
      type: "SAY",
      value: "Invalid amount. Please enter between $1 and ${{max_amount}}."
    }
  }
}
```

## Best Practices for Workflow Design

### 1. Clear Step Organization
```javascript
// ✅ Good: Clear, descriptive step IDs
{
  id: "collect-payment-amount",
  id: "validate-payment-amount", 
  id: "process-payment-transaction",
  id: "confirm-payment-success"
}

// ❌ Avoid: Generic step IDs
{
  id: "step1",
  id: "step2",
  id: "step3"
}
```

### 2. Effective Variable Management
```javascript
// ✅ Good: Descriptive variable names
{
  type: "SET",
  variable: "annual_income_verified",
  value: "{{income_amount >= 25000 && income_source_verified}}"
}

// ❌ Avoid: Cryptic variable names
{
  type: "SET", 
  variable: "x",
  value: "{{y >= 25000 && z}}"
}
```

### 3. User-Friendly Messages
```javascript
// ✅ Good: Clear, helpful messages
{
  type: "SAY-GET",
  variable: "account_number",
  value: "Please enter your 10-digit account number (found on your statement):"
}

// ❌ Avoid: Technical or unclear prompts
{
  type: "SAY-GET",
  variable: "acct_num",
  value: "Enter acct#:"
}
```

### 4. Robust Error Handling
```javascript
// ✅ Good: Comprehensive error handling
{
  type: "CALL-TOOL",
  tool: "CreditCheck",
  onFail: {
    type: "SAY",
    value: "We're unable to process your credit check right now. You can continue manually or try again later."
  }
}
```

---

This chapter provides the foundation for understanding workflows and step types. Chapter 4 will dive deep into conditional branching, complex decision trees, and advanced flow control patterns.

---

# Chapter 4: Conditional Execution and Advanced Branching

## Overview

The JavaScript Flow Engine provides sophisticated conditional execution capabilities through two primary step types: **SWITCH** and **CASE**. These steps enable complex decision trees, dynamic flow routing, and intelligent branching based on variable values and conditional logic.

### Key Concepts

- **SWITCH Steps**: Exact value matching for discrete choices
- **CASE Steps**: Condition-based branching with expression evaluation
- **Nested Branching**: Combining SWITCH and CASE for complex logic
- **Expression Safety**: Secure condition evaluation with variable interpolation
- **Performance Optimization**: Choosing the right branching strategy

## SWITCH Steps: Exact Value Matching

The **SWITCH** step provides traditional switch-case functionality with exact value matching. It's optimized for performance when you need to branch based on specific, known values.

### Basic SWITCH Syntax

```javascript
{
  id: "user_choice_switch",
  type: "SWITCH",
  variable: "user_choice",
  branches: {
    "1": {
      type: "SAY",
      value: "You selected option 1"
    },
    "2": {
      type: "SAY", 
      value: "You selected option 2"
    },
    "premium": {
      type: "FLOW",
      value: "PremiumUserFlow"
    },
    "default": {
      type: "SAY",
      value: "Invalid choice, please try again"
    }
  }
}
```

### SWITCH Characteristics

**Exact Matching Only**: SWITCH steps compare the variable value exactly with branch keys
```javascript
// If user_choice = "1", matches "1" branch
// If user_choice = "premium", matches "premium" branch  
// If user_choice = "Premium", NO MATCH (case sensitive)
```

**Single Step Per Branch**: Each branch must contain exactly one step
```javascript
{
  type: "SWITCH",
  variable: "status",
  branches: {
    "active": {
      type: "SAY",
      value: "Your account is active"
    },
    // ❌ INVALID - multiple steps not allowed
    "inactive": [
      { type: "SAY", value: "Account inactive" },
      { type: "SAY", value: "Contact support" }
    ],
    // ✅ VALID - use FLOW for multiple steps
    "suspended": {
      type: "FLOW",
      value: "AccountSuspendedFlow"  // Sub-flow handles multiple steps
    }
  }
}
```

**Performance Optimized**: SWITCH uses direct object property lookup for O(1) performance

### Advanced SWITCH Examples

#### Multi-Type Value Matching
```javascript
{
  id: "subscription_switch",
  type: "SWITCH", 
  variable: "subscription_tier",
  branches: {
    "free": {
      type: "SET",
      variable: "max_exports",
      value: "5"
    },
    "pro": {
      type: "SET",
      variable: "max_exports", 
      value: "100"
    },
    "enterprise": {
      type: "SET",
      variable: "max_exports",
      value: "unlimited"
    },
    "default": {
      type: "SAY",
      value: "Unknown subscription tier: {{subscription_tier}}"
    }
  }
}
```

#### SWITCH with Sub-Flow Branching
```javascript
{
  id: "payment_method_switch",
  type: "SWITCH",
  variable: "payment_method",
  branches: {
    "credit_card": {
      type: "FLOW",
      value: "CreditCardProcessing",
      callType: "call"
    },
    "paypal": {
      type: "FLOW", 
      value: "PayPalProcessing",
      callType: "call"
    },
    "bank_transfer": {
      type: "FLOW",
      value: "BankTransferProcessing", 
      callType: "replace"  // Replace current flow
    },
    "default": {
      type: "SAY",
      value: "Payment method {{payment_method}} not supported"
    }
  }
}
```

## CASE Steps: Condition-Based Branching

The **CASE** step provides powerful condition-based branching using expression evaluation. It's designed for complex logical conditions involving multiple variables, comparisons, and boolean operations.

### Basic CASE Syntax

```javascript
{
  id: "age_verification_case",
  type: "CASE",
  branches: {
    "condition: user_age >= 21": {
      type: "SAY",
      value: "Full access granted"
    },
    "condition: user_age >= 18": {
      type: "SAY",
      value: "Limited access granted"
    },
    "default": {
      type: "SAY",
      value: "Access denied - must be 18 or older"
    }
  }
}
```

### CASE Characteristics

**Condition Evaluation**: Branch keys must start with `condition:` followed by an expression
```javascript
"condition: variable > 100"      // Numeric comparison
"condition: status === 'active'" // String comparison  
"condition: verified && premium" // Boolean logic
```

**Expression Security**: Conditions are evaluated safely with input sanitization
- No code execution allowed
- Template variable interpolation only
- Math and comparison operators supported
- Boolean logic operators supported

**Order Matters**: Conditions are evaluated in order, first match wins
```javascript
{
  type: "CASE",
  branches: {
    // ✅ Correct order - most specific first
    "condition: score >= 90": { /*...*/ },
    "condition: score >= 80": { /*...*/ },
    "condition: score >= 70": { /*...*/ },
    "default": { /*...*/ }
  }
}
```

### Advanced CASE Examples

#### Complex Multi-Variable Conditions
```javascript
{
  id: "loan_approval_case",
  type: "CASE",
  branches: {
    "condition: credit_score >= 750 && income >= 75000 && debt_ratio < 0.3": {
      type: "SET",
      variable: "loan_status", 
      value: "PRE_APPROVED"
    },
    "condition: credit_score >= 650 && income >= 50000 && debt_ratio < 0.4": {
      type: "FLOW",
      value: "ManualReviewFlow"
    },
    "condition: credit_score >= 600 && income >= 30000": {
      type: "SET",
      variable: "loan_status",
      value: "CONDITIONAL_APPROVAL" 
    },
    "default": {
      type: "SET",
      variable: "loan_status",
      value: "DENIED"
    }
  }
}
```

#### String and Pattern Matching
```javascript
{
  id: "email_domain_case",
  type: "CASE", 
  branches: {
    "condition: email.includes('@company.com')": {
      type: "SET",
      variable: "user_type",
      value: "EMPLOYEE"
    },
    "condition: email.length > 0": {
      type: "SET",
      variable: "user_type", 
      value: "EXTERNAL"
    },
    "default": {
      type: "SAY",
      value: "Invalid email address"
    }
  }
}
```

#### Time-Based Conditions
```javascript
{
  id: "business_hours_case",
  type: "CASE",
  branches: {
    "condition: current_hour >= 9 && current_hour < 17 && day_of_week <= 5": {
      type: "FLOW",
      value: "LiveAgentFlow"
    },
    "condition: current_hour >= 17 || current_hour < 9 || day_of_week > 5": {
      type: "FLOW", 
      value: "AfterHoursFlow"
    },
    "default": {
      type: "SAY",
      value: "Unable to determine business hours"
    }
  }
}
```

## Expression Syntax and Safety

### Supported Operators
All JavaScript operators and methods are supported within a sandboxed environment with
access limited to explictly exported entities. 

### Variable Interpolation

Variables and expressions are interpolated using double curly braces `{{variable_name}}`:

### Security Features

The expression evaluator includes multiple security layers:

**Input Sanitization**
User inputs are stored in a special class of variables which enable safety sanitation.

**Context Isolation**: Expressions run in isolated context
- No access to global objects
- No access to Node.js APIs
- No access to file system
- No network access

## Error Handling in Conditional Steps

### Missing Variables

When variables referenced in conditions are undefined:

```javascript
// If user_age is undefined
"condition: user_age >= 18"  // Evaluates to false

// Defensive programming
"condition: user_age !== null && user_age >= 18"
```

### Fallback Strategies

Always provide meaningful default branches:

```javascript
{
  type: "CASE",
  branches: {
    "condition: score >= 90": {
      type: "SET",
      variable: "grade",
      value: "A"
    },
    "condition: score >= 80": {
      type: "SET", 
      variable: "grade",
      value: "B"
    },
    "default": {
      // Handle missing score or unexpected values
      type: "CASE",
      branches: {
        "condition: score !== null": {
          type: "SET",
          variable: "grade", 
          value: "F"
        },
        "default": {
          type: "SAY",
          value: "Score not available - please try again"
        }
      }
    }
  }
}
```

---

This chapter provides comprehensive coverage of conditional execution in the Workflow Engine. Chapter 5 will explore response mapping, data transformation, and advanced tool integration patterns.


# Chapter 5: Flow Interruption and Resumption

## Overview

One of the most sophisticated features of the Workflow Engine is its ability to handle **flow interruptions and resumptions**. Users can start new workflows while others are in progress, and the engine intelligently manages the flow stack to allow seamless switching between tasks.

## How Flow Interruption Works

### The Stack-of-Stacks Architecture

The engine maintains a sophisticated stack system:

```
Current Flow Stack:
┌─────────────────────┐
│   Weather Check     │ ← Current active flow
├─────────────────────┤  
│   Make Payment      │ ← Interrupted flow (saved state)
│   Step: Enter Amount│ ← Exact position saved
└─────────────────────┘
```

### Interruption Detection

The engine automatically detects when user input represents a new intent while another flow is active:

```javascript
// User is in payment flow, at amount entry step
// User says: "What's the weather in Tokyo?"
// Engine detects weather intent and interrupts payment flow

🔄 Handling regular flow interruption for user test-user: What's the weather in Tokyo?
🔄 Switched to Weather Check
(Your previous "Make a payment" progress has been saved)
```

---

# Chapter 6: Testing and Debugging Workflows

## Overview

Effective testing is crucial for reliable workflow deployment. The Workflow Engine provides comprehensive testing capabilities, from individual step validation to complex multi-flow integration testing.

## Test Framework Architecture

### Test Simulation Mode

The engine includes a built-in test simulation mode that executes workflows with predefined inputs:

```javascript
// Enable test simulation mode
🧪 Enhanced Workflow Engine - Test Simulation Mode
Session ID: test-session
Running 3 simulated inputs...
```

### Test Structure

Each test defines a scenario with specific inputs and expected behaviors:

```javascript
const testScenario = {
  id: "weatherMappingTest",
  description: "Test weather mapping functionality",
  inputs: ["What's the weather in London?"],
  expectedBehaviors: [
    "AI should trigger weather flow",
    "Weather data should be retrieved",
    "Response should include temperature and conditions"
  ]
};
```

## Best Practices for Testing

### 1. Comprehensive Test Coverage

```javascript
// ✅ Good - Test all paths
- Happy path scenarios
- Error conditions  
- Edge cases
- Boundary conditions
- Interruption scenarios
- Rate limiting scenarios

// ❌ Insufficient - Only happy path
- Basic functionality only
- No error testing
- No edge case coverage
```

## Troubleshooting Common Issues

### Session Management Problems

#### Problem: "engineSessionContext.flowStacks was invalid, initialized fresh flowStacks"

**Root Cause**: Session context corruption due to improper session management patterns.

**Solutions**:

1. **Always capture updateActivity() return value**:
   ```javascript
   // ❌ Wrong - Session state lost
   await engine.updateActivity(entry, sessionContext);
   
   // ✅ Correct - Session state maintained
   sessionContext = await engine.updateActivity(entry, sessionContext);
   ```

2. **Use unique sessions for each user/test**:
   ```javascript
   // ❌ Wrong - Shared sessions cause contamination
   const sharedSession = engine.initSession('shared', 'shared');
   
   // ✅ Correct - Isolated sessions
   const userSession = engine.initSession(`user-${userId}`, `session-${sessionId}`);
   ```

3. **Create fresh sessions for each test case**:
   ```javascript
   // ✅ Correct test pattern
   for (let i = 0; i < testCases.length; i++) {
     let sessionContext = engine.initSession('test-user', `test-session-${i+1}`);
     await runTestCase(testCases[i], sessionContext);
   }
   ```

#### Problem: Workflows not triggering or receiving mock responses

**Root Cause**: Corrupted session state preventing proper flow execution.

**Solution**: Implement proper session lifecycle management:
```javascript
// Initialize session once per user/conversation
let sessionContext = engine.initSession(userId, sessionId);

// Always update session for every interaction
sessionContext = await engine.updateActivity(userInput, sessionContext);

// Check for workflow responses
if (sessionContext.response) {
  return sessionContext.response;
}

// Continue with regular conversation
sessionContext = await engine.updateActivity(assistantResponse, sessionContext);
```

#### Problem: State bleeding between different users or test runs

**Root Cause**: Shared session contexts between different users, conversations, or test cases.

**Solution**: Maintain strict session isolation:
```javascript
class SessionManager {
  constructor() {
    this.sessions = new Map();
  }
  
  getSessionKey(userId, sessionId) {
    return `${userId}-${sessionId}`;
  }
  
  async processMessage(userId, sessionId, message) {
    const key = this.getSessionKey(userId, sessionId);
    let sessionContext = this.sessions.get(key);
    
    if (!sessionContext) {
      sessionContext = engine.initSession(userId, sessionId);
    }
    
    // Process and update session
    sessionContext = await engine.updateActivity({
      role: 'user',
      content: message,
      timestamp: Date.now()
    }, sessionContext);
    
    // Store updated session
    this.sessions.set(key, sessionContext);
    
    return sessionContext.response;
  }
}
```

### Best Practices Summary

1. **Session Management**:
   - Always use `let` instead of `const` for session context variables
   - Always capture and update session context from `updateActivity()` calls
   - Create unique sessions for each user, conversation, and test case
   - Implement proper session persistence in production environments

2. **Testing**:
   - Isolate test cases with fresh session contexts
   - Test session management patterns explicitly
   - Include session corruption scenarios in your test suite
   - Verify session state preservation across workflow interruptions

3. **Production Deployment**:
   - Implement session persistence and recovery
   - Monitor for session corruption warnings in logs
   - Use proper session key strategies for multi-tenant systems
   - Include session management in your monitoring and alerting

---

This comprehensive User Guide now includes all the critical aspects observed in your test suite, providing developers with complete knowledge to build robust, production-ready workflows.

# Conclusion and Next Steps

## Summary

The **JavaScript Flow Engine** represents a sophisticated, production-ready workflow orchestration system designed for modern conversational platforms. This comprehensive user guide has covered:

### Key Capabilities Covered

✅ **Complete Tool Integration** - Comprehensive HTTP API, local function, and mock tool support with advanced features like formData, pathParams, queryParams, responseMapping, and security controls

✅ **Advanced Internationalization** - Full i18n support with `value_<lang>`, `prompt_<lang>` properties, guidanceConfig for user assistance, and cultural adaptation

✅ **Robust Security** - Enterprise-grade authentication, authorization, data classification, audit logging, and compliance features

✅ **Sophisticated Response Mapping** - JSONPath, object mapping, array processing with itemMapping, conditional mapping, transforms, and error handling

✅ **Production Deployment** - Containerization, Kubernetes deployment, monitoring, alerting, scaling, and disaster recovery

✅ **Comprehensive Testing** - Built-in test framework, debugging tools, validation, performance testing, and CI/CD integration

### Framework Strengths

1. **Host-Agnostic Design** - Works with any conversational platform (AI assistants, live agents, custom applications)

2. **Security-First Architecture** - Built-in security controls, data classification, and compliance features

3. **Developer-Friendly** - Declarative workflow definitions, comprehensive validation, and excellent debugging tools

4. **Enterprise-Ready** - Production deployment, monitoring, scaling, and operational features

5. **Internationally Aware** - Full internationalization support with cultural adaptation

6. **Highly Extensible** - Flexible tool integration, custom functions, and response transformations

## Getting Started Checklist

### For New Implementations

#### 1. **Setup and Configuration** (30 minutes)
```javascript
// ✅ Initialize the engine with proper configuration
context.engine = new WorkflowEngine(
  hostLogger,           // Any logger supporting .debug/.info/.warn/.error (or null)
  aiCallback,           // host provided access to AI function that receives <systemInstruction>, <userMessage> and returns <string response>
  flowsMenu,            // Available workflows
  toolsRegistry,        // Tool definitions
  APPROVED_FUNCTIONS,   // Secure local functions
  globalVariables,      // Session-wide variables (optional)
  validateOnInit,       // Integrity validation flag (optional, default: true)
  language,             // Language preference (optional, 'en', 'es', etc.)
  aiTimeOut,            // AI timeout in milliseconds (optional, default: 1000ms)
  messageRegistry,      // Custom message templates (optional)
  guidanceConfig        // User guidance settings (optional)
);
```

#### 2. **Create Your First Flow** (45 minutes)
```javascript
// ✅ Start with a simple, linear workflow
{
  id: "welcome-flow",
  name: "UserWelcome",
  prompt: "Welcome new user",
  description: "Simple welcome flow for new users",
  steps: [
    { id: "greeting", type: "SAY", value: "Welcome! I'm here to help." },
    { id: "get-name", type: "SAY-GET", variable: "userName", value: "What's your name?" },
    { id: "personalized", type: "SAY", value: "Nice to meet you, {{userName}}!" }
  ]
}
```

#### 3. **Add Your First Tool** (60 minutes)
```javascript
// ✅ Begin with a simple HTTP API tool
{
  id: "WeatherTool",
  name: "Get Weather",
  description: "Fetch weather information",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "City name" }
    },
    required: ["city"]
  },
  implementation: {
    type: "http",
    url: "https://wttr.in/{city}",
    pathParams: ["city"],
    customQuery: "format=j1"
  }
}
```

#### 4. **Test and Validate** (30 minutes)
```javascript
// ✅ Run comprehensive testing
node test-jsfe.js --test all > test-results.out 2>&1
// Review results for any issues
```

## Common Implementation Patterns

### 1. **Multi-Step Business Process**
```javascript
// Complex workflows with validation, external calls, and error handling
{
  id: "payment-processing",
  steps: [
    { type: "SAY-GET", variable: "amount", value: "Enter payment amount:" },
    { type: "CASE", branches: { "condition: amount > 0 && amount <= 10000": {...} }},
    { type: "CALL-TOOL", tool: "PaymentProcessor", onFail: {...} },
    { type: "SAY", value: "Payment processed successfully!" }
  ]
}
```

### 2. **Information Gathering**
```javascript
// Collect user information with validation
{
  id: "user-onboarding",
  steps: [
    { type: "SAY-GET", variable: "email", value: "Enter your email:" },
    { type: "SAY-GET", variable: "phone", value: "Enter your phone:" },
    { type: "CALL-TOOL", tool: "ValidateUser", args: {...} },
    { type: "SAY", value: "Account created successfully!" }
  ]
}
```

### 3. **External System Integration**
```javascript
// Integrate with external APIs and services
{
  id: "crm-integration",
  steps: [
    { type: "CALL-TOOL", tool: "GetCustomerData", variable: "customer" },
    { type: "CALL-TOOL", tool: "UpdatePreferences", args: {...} },
    { type: "SAY", value: "Your preferences have been updated." }
  ]
}
```

## Best Practices Summary

### ✅ **Do These**

1. **Start Simple** - Begin with basic flows and gradually add complexity
2. **Validate Everything** - Use comprehensive parameter validation and error handling
3. **Secure by Default** - Always configure proper security and data classification
4. **Test Thoroughly** - Test happy paths, error conditions, and edge cases
5. **Monitor Actively** - Implement comprehensive monitoring and alerting
6. **Document Well** - Maintain clear documentation for flows and tools
7. **Internationalize Early** - Add i18n support from the beginning
8. **Plan for Scale** - Design for horizontal scaling and high availability

### ❌ **Avoid These**

1. **Skipping Validation** - Don't skip parameter validation or error handling
2. **Hardcoded Values** - Avoid hardcoding API keys or configuration
3. **Overly Complex Flows** - Keep individual flows focused and manageable
4. **Poor Error Messages** - Provide clear, actionable error messages
5. **Ignoring Security** - Don't skip security configuration
6. **No Testing** - Don't deploy without comprehensive testing
7. **Missing Monitoring** - Don't deploy without proper observability
8. **Tight Coupling** - Keep flows and tools loosely coupled

## Community and Support

### Resources

- **Documentation**: This comprehensive user guide
- **Examples**: Complete examples in test scenarios
- **Best Practices**: Proven patterns and approaches
- **Security Guidelines**: Enterprise security recommendations

### Contributing

The JavaScript Flow Engine benefits from community contributions:

- **Flow Libraries**: Share common workflow patterns
- **Tool Integrations**: Contribute new tool integrations
- **Language Support**: Add new language translations
- **Security Enhancements**: Improve security features
- **Performance Optimizations**: Enhance engine performance

### Getting Help

1. **Review Documentation** - This guide covers most scenarios
2. **Check Examples** - Test scenarios show real-world usage
3. **Enable Debug Logging** - Use debug mode for troubleshooting
4. **Validate Configuration** - Use built-in validation features
5. **Monitor Metrics** - Use observability for issue diagnosis

---

The **JavaScript Flow Engine** provides a robust foundation for building sophisticated conversational workflows. With proper implementation following this guide, you can create reliable, secure, and scalable workflow automation that enhances user experiences across any conversational platform.

## Related Documentation

- **[README.md](README.md)** - Technical API reference, installation guide, and architecture overview
- **[npm package](https://www.npmjs.com/package/jsfe)** - Latest version and installation instructions
- **Source Code** - Complete implementation with examples and test suites

For technical implementation details, API documentation, and quick-start instructions, refer to the **[README.md](README.md)** file.

**Happy Building!** 🚀