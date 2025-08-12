# Workflow Engine v2.0 User Guide

## 📖 Documentation

- **[JavaScript Flow Engine User Guide](JavaScript%20Flow%20Engine.md)** - Comprehensive tutorials, examples, and best practices (this document)
- **[README.md](README.md)** - Technical API reference and quick start guide

*For technical API documentation, installation instructions, and architecture overview, see the **[README.md](README.md)**.*

## Table of Contents

[Introduction: JavaScript Flow Engine Overview](#introduction-javascript-flow-engine-overview) ✅
1. [TOOL-CALL Support: Complete Integration Guide](#tool-call-support-complete-integration-guide) ✅
2. [Variable Management and Expression System](#variable-management-and-expression-system) ✅  
3. [Flow Control and Step Types](#flow-control-and-step-types) ✅
4. [Response Mapping and Data Transformation](#response-mapping-and-data-transformation) ✅
5. [Conditional Execution and Advanced Branching](#conditional-execution-and-advanced-branching) ✅
6. [Stack-of-Stacks Architecture and Flow Management](#stack-of-stacks-architecture) ✅
7. [Error Handling and Recovery](#error-handling-and-recovery) ✅
8. [Rate Limiting and Performance](#rate-limiting-and-performance) ⭐ NEW
9. [Flow Interruption and Resumption](#flow-interruption-and-resumption) ⭐ NEW
10. [Testing and Debugging](#testing-and-debugging) ⭐ NEW
11. [Security and Authentication](#security-and-authentication) ✅
12. [Performance and Best Practices](#performance-and-best-practices) ✅

---

# Introduction: JavaScript Flow Engine Overview

## What is the JavaScript Flow Engine?

The **JavaScript Flow Engine** is a sophisticated, host-agnostic workflow orchestration system designed to serve as a **plugable intent detector, and work flows orchestrator** for any conversational platform. Whether integrated with AI chat assistants, live agent systems, customer service platforms, or any other conversational interface, the engine provides reliable, secure, and intelligent workflow automation.

## Core Concepts

### Plugable Architecture

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
const APPROVED_FUNCTIONS = new Map();

// Define secure local functions
async function processPayment(args) {
  // Secure payment processing logic
  return { transactionId: "...", status: "success" };
}

// Register approved functions
APPROVED_FUNCTIONS.set('processPayment', processPayment);
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
  aiCallback,           // host provided acess to AI function that receives <systemInstruction>, <userMessage> and reterning <string response>
  flowsMenu,            // Available workflows
  toolsRegistry,        // Tool definitions
  APPROVED_FUNCTIONS,   // Secure local functions
  logger,               // Logging implementation
  language,             // Language preference ('en', 'es', etc.)
  messageRegistry,      // Custom message templates (optional)
  guidanceConfig,       // User guidance settings (optional)
  validateOnInit,       // Integrity validation flag (default: true)
  globalVariables       // Session-wide variables (optional)
);
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

### Integration Pattern: The updateActivity() Method

The engine integrates with host systems through the **`updateActivity()`** method, which handles the complete intent detection and execution cycle:

#### Pre-Processing Integration
```javascript
async function flowEnginePlugin(context, input) {
  const engine = context.engine;
  
  // Create ContextEntry for user input
  const contextEntry = {
    role: 'user',
    content: input,
    timestamp: Date.now()
  };
  
  // Forward input to engine for conditional processing
  return await engine.updateActivity(contextEntry, context.userId);
}
```

#### Post-Processing Integration 
```javascript
async function handleQuery(context, input) {
  // Try workflow engine first
  const result = await flowEnginePlugin(context, input);
  if (result) {
    return result; // Engine handled the request
  }

  // Handle as regular conversation
  const reply = await generateAIResponse(input);
  
  // Update engine with assistant response for context
  engine.updateActivity({
    role: 'assistant', 
    content: reply,
    timestamp: Date.now()
  }, context.userId);

  return reply;
}
```

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

### Custom Application Integration
```javascript
// In any conversational application
class ConversationHandler {
  constructor(workflowEngine) {
    this.engine = new WorkflowEngine(
      aiCallback,           // AI communication function
      flowsMenu,            // Available workflows
      toolsRegistry,        // Tool definitions
      APPROVED_FUNCTIONS,   // Secure local functions
      logger,               // Logging implementation
      language,             // Language preference ('en', 'es', etc.)
      messageRegistry,      // Custom message templates (optional)
      guidanceConfig,       // User guidance settings (optional)
      validateOnInit,       // Integrity validation flag (default: true)
      globalVariables       // Session-wide variables (optional)
    );
  }
  
  async processUserInput(input, context) {
    // Always check for workflow intents first
    const contextEntry = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
      metadata: { source: 'custom_app', ...context }
    };
    
    const workflowResponse = await this.engine.updateActivity(contextEntry, context.userId);
    
    if (workflowResponse) {
      return { 
        handled: true, 
        response: workflowResponse,
        source: 'workflow_engine'
      };
    }
    
    // Handle through your application logic
    return { 
      handled: false, 
      requiresProcessing: true 
    };
  }
}
```

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

The Workflow Engine's TOOL-CALL system provides a sophisticated, secure, and flexible way to integrate external tools and APIs into your workflows. It supports multiple implementation types, comprehensive response mapping, advanced error handling, and robust security features.

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
const APPROVED_FUNCTIONS = new Map();

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
APPROVED_FUNCTIONS.set('verifyAccount', verifyAccount);

// Pass to engine
const engine = new WorkflowEngine(flowsMenu, {
  toolsRegistry,
  APPROVED_FUNCTIONS,
  // other config...
});
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

## Response Mapping and Transformation

The engine supports sophisticated response mapping to transform API responses into usable data:

### JSONPath Mapping

Extract specific values from complex JSON responses:

```javascript
responseMapping: {
  type: "jsonPath",
  mappings: {
    "location.name": {
      path: "nearest_area[0].areaName[0].value",
      fallback: "Unknown Location"
    },
    "current.temperature": {
      path: "current_condition[0].temp_C",
      transform: { type: "parseInt", fallback: 0 }
    },
    "current.condition": {
      path: "current_condition[0].weatherDesc[0].value",
      fallback: "Unknown"
    }
  }
}
```

### Object Mapping

Simple field-to-field mapping:

```javascript
responseMapping: {
  type: "object",
  mappings: {
    "id": "id",
    "name": "name",
    "email": "email",
    "full_address": {
      path: "address",
      transform: {
        type: "template",
        template: "{{street}}, {{city}} {{zipcode}}"
      }
    }
  }
}
```

### Array Processing with ItemMapping

Handle arrays with filtering, sorting, and transformation:

```javascript
responseMapping: {
  type: "array",
  source: "results",              // Array source path
  filter: {                       // Optional filtering
    field: "active",
    operator: "equals",
    value: true
  },
  sort: {                         // Optional sorting
    field: "price",
    order: "desc"
  },
  limit: 10,                      // Optional limit
  itemMapping: {                  // Transform each item
    type: "object",
    mappings: {
      "id": "id",
      "title": "name",
      "price_display": {
        path: "price",
        transform: {
          type: "concat",
          prefix: "$",
          suffix: " USD"
        }
      },
      "category": {
        path: "category.name",
        fallback: "Uncategorized"
      },
      "is_premium": {
        path: "price",
        transform: {
          type: "conditional",
          condition: "value > 100",
          trueValue: true,
          falseValue: false
        }
      }
    }
  }
}
```

### Advanced Transform Operations

The `transform` property supports multiple operations:

```javascript
// String transformations
transform: {
  type: "concat",
  prefix: "Mr. ",
  suffix: " Jr.",
  fallback: "Unknown"
}

// Numeric transformations  
transform: {
  type: "parseInt",
  fallback: 0,
  min: 0,
  max: 100
}

// Date transformations
transform: {
  type: "date",
  format: "YYYY-MM-DD",
  fallback: "1970-01-01"
}

// Conditional transformations
transform: {
  type: "conditional",
  condition: "value > 1000",
  trueValue: "High",
  falseValue: "Normal"
}

// Custom transformations
transform: {
  type: "custom",
  function: "customTransform",  // Must be in APPROVED_FUNCTIONS
  args: { multiplier: 1.1, currency: "USD" }
}

// Template transformations
transform: {
  type: "template",
  template: "Product: {{name}} - Price: ${{price}}"
}

// Array transformations
transform: {
  type: "join",
  separator: ", ",
  fallback: "No items"
}
```

### Conditional Mapping

Different mappings based on response content:

```javascript
responseMapping: {
  type: "conditional",
  conditions: [
    {
      if: { field: "type", operator: "equals", value: "weather" },
      then: {
        type: "object",
        mappings: {
          "temperature": "current.temp_c",
          "condition": "current.condition",
          "location": "location.name"
        }
      }
    },
    {
      if: { field: "type", operator: "equals", value: "user" },
      then: {
        type: "object", 
        mappings: {
          "id": "user_id",
          "name": "full_name",
          "email": "email_address"
        }
      }
    }
  ],
  else: {
    type: "template",
    template: "Raw response: {{JSON.stringify(response)}}"
  }
}
```

### Template Mapping

Generate formatted strings:

```javascript
responseMapping: {
  type: "template",
  template: "Weather in {{location.name}}: {{current.condition}}, {{current.temp_c}}°C",
  
  // Multi-language templates
  template_es: "Clima en {{location.name}}: {{current.condition}}, {{current.temp_c}}°C",
  template_fr: "Météo à {{location.name}}: {{current.condition}}, {{current.temp_c}}°C"
}
```

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
const APPROVED_FUNCTIONS = new Map();
APPROVED_FUNCTIONS.set('safeFunctionName', safeFunctionImplementation);

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
      file: "{file}",           // File content from args
      filename: "{filename}",   // Filename from args  
      category: "{category}",   // Category from args
      metadata: "{{JSON.stringify(uploadMeta)}}", // Complex data serialization
      timestamp: "{{Date.now()}}" // Dynamic values
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

The Workflow Engine features a **unified expression evaluation system** that handles variable interpolation, mathematical operations, logical expressions, and conditional logic with consistent syntax across all contexts. This system powers everything from simple variable substitution to complex business rule evaluation while maintaining appropriate security controls.

## Core Concepts

### Variable Scope and Storage

Variables in the workflow engine operate at multiple scopes:

- **Flow Variables**: Stored in `flowFrame.variables` - persistent throughout the flow execution
- **Step Variables**: Created by individual steps (tool results, user inputs)
- **Session Variables**: Persist across workflow executions (`caller_id`, `caller_name`, `thread_id`)
- **Context Variables**: Derived from conversation history and context stack

### Unified Expression System

The engine uses a **single, powerful expression evaluator** that works consistently across all contexts:

- **Template Interpolation**: `{{variable}}` syntax in strings
- **Condition Evaluation**: Boolean expressions in CASE statements  
- **Value Assignment**: Direct expression evaluation in SET steps
- **Mathematical Operations**: Arithmetic with proper precedence
- **Logical Operations**: AND, OR, and comparison operators everywhere

### Template Interpolation Syntax

The engine uses **double braces `{{variable}}`** for variable interpolation:

```javascript
// Basic variable interpolation
"Hello {{userName}}, your balance is ${{account.balance}}"

// Logical operators work everywhere
"Access: {{age >= 18 && is_verified ? 'Granted' : 'Denied'}}"

// Mathematical expressions with logical conditions
"Total: ${{price * quantity * (is_member ? 0.9 : 1.0)}}"

// Complex conditional logic
"Status: {{is_active && balance > 0 && verified ? 'Active' : 'Inactive'}}"
```

## Expression Types and Syntax

### Unified Expression System

The workflow engine uses a **single, unified expression evaluator** that works consistently across all contexts:

- **Template Context**: String interpolation with `{{variable}}` syntax
- **Condition Context**: Boolean evaluation for CASE step conditions
- **Value Context**: Direct expression evaluation in SET steps
- **All contexts support the same syntax** - logical operators, mathematics, conditionals work everywhere!

### Expression Examples

```javascript
// ✅ ALL SUPPORTED everywhere - unified syntax
"Hello {{userName}}"                           // Variable access
"Status: {{status || 'Unknown'}}"              // OR fallback
"Access: {{age >= 18 && verified ? 'Yes' : 'No'}}"  // Full logical operators
"Total: ${{price * quantity + shipping}}"      // Mathematics
"condition:{{age >= 18 && verified && balance > 100}}"  // Complex conditions
```

### 1. Simple Variable Access

Access variables using dot notation:

```javascript
// Simple variable
{{userName}}

// Nested object access
{{user.profile.email}}
{{account.settings.notifications}}

// Array access
{{items.length}}
```

**Example Usage:**
```javascript
{
  id: "welcome-step", 
  type: "SAY",
  value: "Welcome back, {{user.name}}! You have {{notifications.count}} new messages."
}
```

### 2. Logical Expressions

Use logical operators for complex conditions and fallbacks:

```javascript
// Logical AND
{{is_verified && age >= 18}}

// Logical OR for fallbacks
{{user.nickname || user.firstName || 'Guest'}}

// Complex combinations
{{(age >= 21 && location === 'US') || is_vip_member}}

// Logical operators in conditions
{{is_active && (is_premium || total_spent > 1000)}}
```

**Example Usage:**
```javascript
{
  id: "access-check",
  type: "CASE",
  branches: {
    "condition:{{age >= 18 && is_verified && balance >= 100}}": {
      id: "grant-access",
      type: "SAY",
      value: "Access granted! Welcome {{user.name}}."
    }
  }
}
```

### 3. Conditional (Ternary) Expressions

Implement conditional logic with the `condition ? trueValue : falseValue` syntax:

```javascript
// Simple boolean check
{{isVerified ? 'Verified User' : 'Unverified'}}

// Numeric comparisons
{{age >= 18 ? 'Adult' : 'Minor'}}
{{balance > 1000 ? 'Premium' : 'Standard'}}

// String comparisons  
{{status === 'active' ? 'Online' : 'Offline'}}

// Complex conditions
{{isVip && balance > 5000 ? 'VIP Gold' : 'Regular'}}
```

**Supported Comparison Operators:**
- `===` - Strict equality
- `!==` - Strict inequality  
- `==` - Loose equality
- `!=` - Loose inequality
- `>` - Greater than
- `<` - Less than
- `>=` - Greater than or equal
- `<=` - Less than or equal

**Example Usage:**
```javascript
{
  id: "access-level",
  type: "SAY",
  value: "Your access level is: {{userRole === 'admin' ? 'Administrator' : 'Standard User'}}"
}
```

### 4. Mathematical Expressions

Perform safe mathematical operations:

```javascript
// Basic arithmetic
{{price * quantity}}
{{total + tax - discount}}
{{amount / exchangeRate}}

// With parentheses for precedence
{{(subtotal + tax) * (1 - discountPercent)}}

// Mixed variables and constants
{{basePrice * 1.1 + shippingCost}}
```

**Supported Math Operators:**
- `+` - Addition
- `-` - Subtraction
- `*` - Multiplication
- `/` - Division
- `%` - Modulo
- `()` - Parentheses for precedence

**Example Usage:**
```javascript
{
  id: "calculate-total",
  type: "SET",
  variable: "orderTotal",
  value: "{{(itemPrice * quantity) + shippingCost}}"
}
```

### 5. Conditional Logic in CASE Steps

CASE steps use the `condition:` prefix for complex conditional branching with **full logical operator support**:

```javascript
{
  id: "complex-eligibility-check",
  type: "CASE",
  branches: {
    // Multiple AND conditions
    "condition:{{user_age}} >= 18 && {{user_verified}} && {{total_amount}} > 100": {
      type: "SAY",
      value: "You're eligible for premium processing!"
    },
    // OR conditions
    "condition:{{isVip}} || {{isEmployee}} || {{referralCode}}": {
      type: "SAY",
      value: "You qualify for special rates."
    },
    // Complex mixed logic
    "condition:({{creditScore}} > 700 && {{income}} > 50000) || {{hasGuarantor}}": {
      type: "SAY",
      value: "Your application is pre-approved."
    },
    // Boolean variable checks
    "condition:{{is_premium_member}}": {
      type: "SAY",
      value: "Welcome, premium member!"
    },
    // Negation with parentheses
    "condition:!({{isSuspended}} || {{isBlacklisted}})": {
      type: "SAY",
      value: "Account status is good."
    },
    "default": {
      type: "SAY",
      value: "Standard processing applies."
    }
  }
}
```

**Supported Logical Operators in CASE Conditions:**
- `&&` - Logical AND
- `||` - Logical OR  
- `!` - Logical NOT
- `()` - Parentheses for grouping
- All comparison operators: `===`, `!==`, `==`, `!=`, `>`, `<`, `>=`, `<=`

## Security Features

### Unified Expression Evaluator Architecture

The Workflow Engine uses a **single, unified expression evaluator** that provides consistent syntax and security across all contexts. This architecture replaced the previous dual-evaluator system to provide better maintainability, consistency, and developer experience.

#### Core Security Principles

1. **Developer Trust Model**: Workflows are authored by developers, not end users
2. **Value-Only User Input**: Users provide variable values, not code structure or operators
3. **Configurable Security**: Adjustable security levels based on deployment context
4. **Pattern-Based Protection**: Comprehensive blocking of dangerous code patterns

#### Unified Security Implementation

```javascript
// Single evaluator with configurable security options
evaluateExpression(expression, variables, contextStack, options = {
  securityLevel: 'standard',        // 'strict', 'standard', 'permissive'
  allowLogicalOperators: true,      // Enable &&, ||, ! operators
  allowMathOperators: true,         // Enable +, -, *, /, % operators
  allowComparisons: true,           // Enable ==, !=, <, >, <=, >= operators
  allowTernary: true,               // Enable ?: conditional expressions
  context: 'template',              // For logging and debugging
  returnType: 'auto'                // 'string', 'boolean', 'auto'
})
```

#### Security Levels

**Standard Level (Default)**
- ✅ **Allowed**: All mathematical operations, logical operators, comparisons, ternary expressions
- ✅ **Variable Access**: Safe nested property access (`user.profile.name`)
- ✅ **OR Fallbacks**: Variable fallbacks (`{{status || 'default'}}`)
- ❌ **Blocked**: Function calls, object manipulation, code execution, assignment operators

**Strict Level (High Security)**
- ✅ **Allowed**: Basic variable access and mathematical operations only
- ❌ **Blocked**: All logical operators, advanced expressions, bracket notation

**Permissive Level (Full Trust)**
- ✅ **Allowed**: All standard features plus advanced expressions
- ✅ **Bracket Notation**: Dynamic property access (`user['property']`)
- ❌ **Still Blocked**: Core dangerous patterns (function calls, eval, etc.)

#### Comprehensive Pattern Blocking

The unified evaluator blocks dangerous patterns at all security levels:

```javascript
// ❌ BLOCKED EVERYWHERE - Core Dangerous Patterns
{{eval('malicious')}}              // Code execution
{{constructor.prototype}}          // Object manipulation
{{process.env}}                    // System access
{{setTimeout()}}                   // Function calls
{{global.something}}               // Global access
{{fetch('http://evil.com')}}       // Network requests
{{new Date()}}                     // Constructor calls
{{delete user.data}}               // Delete operations
{{user = 'hacked'}}                // Assignment operations

// ✅ ALLOWED - Safe Expressions (All Contexts)
{{user.name}}                      // Variable access
{{age >= 18 && verified}}          // Logical expressions
{{balance + fee - discount}}       // Mathematical operations
{{status === 'active' ? 'Online' : 'Offline'}}  // Conditional expressions
{{items.length > 0 || hasDefault}} // Complex logical expressions
```

#### Context-Aware Security

The evaluator adjusts behavior based on context:

```javascript
// Template Interpolation Context
"Welcome {{user.name}}! Status: {{verified && active ? 'Ready' : 'Pending'}}"

// Condition Evaluation Context  
"condition:{{age >= 21 && verified && (income > 50000 || hasGuarantor)}}"

// Variable Assignment Context
variable: "{{(basePrice * quantity) + (isPremium ? 0 : shippingFee)}}"
```

#### Security Benefits of Unified Approach

**Consistency**: Same syntax works everywhere, reducing developer confusion and errors.

**Maintainability**: Single codebase for security patterns, easier to audit and update.

**Flexibility**: Configurable security levels allow adjustment for different deployment environments.

**Future-Proof**: Easy to add new operators or security features without architectural changes.

**Developer Experience**: Predictable behavior across all expression contexts.

### Expression Error Handling

When expressions encounter errors or security violations:

```javascript
// Security violations
{{eval('dangerous')}}     // Result: "[blocked: eval('dangerous')]"

// Runtime errors  
{{user.nonexistent.prop}} // Result: "[error: Cannot read property of undefined]"

// Type errors
{{text * boolean}}        // Result: "[math-error: invalid operands]"

// Graceful fallbacks with OR operator
{{user.name || 'Guest'}}  // Result: "Guest" (if user.name is undefined)
```

## Advanced Expression Features

### Nested Variable Access

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

### Performance Considerations

The unified evaluator is optimized for real-world usage:

- **Simple Variables**: ~1ms (e.g., `{{userName}}`)
- **Mathematical Operations**: ~2-3ms (e.g., `{{price * quantity}}`)
- **Logical Expressions**: ~5-10ms (e.g., `{{verified && active}}`)
- **Complex Conditions**: ~10-20ms (e.g., multi-variable business logic)

### Best Practices

**✅ Recommended Patterns:**
```javascript
// Use fallbacks for optional values
{{user.nickname || user.firstName || 'Guest'}}

// Break complex logic into steps
// Step 1: SET isEligible = {{age >= 18 && verified}}
// Step 2: Use {{isEligible}} in subsequent expressions

// Use clear, descriptive variable names
{{currentAccountBalance > minimumPaymentAmount}}
```

**❌ Avoid These Patterns:**
```javascript
// Overly complex nested expressions
{{(user.profile && user.profile.settings && user.profile.settings.notifications) ? 'enabled' : 'disabled'}}

// Better: Use intermediate variables or OR fallbacks
{{user.profile.settings.notifications || false ? 'enabled' : 'disabled'}}
```

## Safe Method Calls and Function Support

### Approved String Methods

The engine includes comprehensive security controls that allow only pre-approved string methods:

```javascript
// Case conversion
{{userName.toLowerCase()}}
{{title.toUpperCase()}}

// Whitespace handling
{{input.trim()}}
{{text.padStart(10, '0')}}
{{name.padEnd(20, '.')}}

// String access and search
{{email.charAt(0)}}                    // First character
{{text.indexOf('@')}}                  // Find position
{{email.includes('@domain.com')}}      // Contains check
{{url.startsWith('https://')}}         // Starts with
{{filename.endsWith('.pdf')}}          // Ends with

// String extraction and manipulation
{{fullText.substring(0, 100)}}         // Extract substring
{{data.slice(5, 15)}}                 // Extract slice
{{csv.split(',')}}                    // Split into array
{{text.replace('old', 'new')}}        // Replace text
{{content.repeat(3)}}                 // Repeat string
{{parts.concat(' - ', suffix)}}      // Concatenate

// String inspection
{{message.length > 100}}              // Length checks
{{text.search(/\d+/)}}               // Regex search
{{input.match(/[a-z]+/)}}            // Pattern matching
{{name.localeCompare(other)}}        // Compare strings
```

### Approved Array Methods

Safe array operations for data processing:

```javascript
// Array inspection
{{items.length > 0}}                  // Length checks
{{categories.includes('premium')}}     // Contains item
{{list.indexOf('target')}}            // Find position

// Array extraction
{{items.slice(0, 5)}}                // First 5 items
{{tags.join(', ')}}                  // Join with separator

// Array utility
{{data.toString()}}                  // Convert to string
{{array.valueOf()}}                  // Get primitive value
```

### Approved Math Methods

Mathematical operations with built-in functions:

```javascript
// Basic math operations
{{Math.abs(balance)}}                 // Absolute value
{{Math.ceil(price)}}                 // Round up
{{Math.floor(average)}}              // Round down
{{Math.round(calculation)}}          // Round to nearest

// Comparisons
{{Math.max(a, b, c)}}               // Maximum value
{{Math.min(options)}}               // Minimum value

// Advanced calculations
{{Math.pow(base, exponent)}}        // Power calculation
{{Math.sqrt(area)}}                 // Square root
{{Math.random()}}                   // Random number (0-1)
```

### Safe Built-in Functions

Type conversion and validation functions:

```javascript
// Numeric conversion and validation
{{parseInt(userInput)}}              // String to integer
{{parseFloat(price)}}               // String to decimal
{{isNaN(value)}}                    // Check if not a number
{{isFinite(result)}}                // Check if finite number

// Type conversion (non-constructor forms)
{{String(data)}}                    // Convert to string
{{Number(input)}}                   // Convert to number
{{Boolean(flag)}}                   // Convert to boolean

// URI encoding for API calls
{{encodeURIComponent(searchTerm)}}  // URL-safe encoding
{{decodeURIComponent(encoded)}}     // URL decoding
{{encodeURI(fullUrl)}}             // Full URI encoding
{{decodeURI(uri)}}                 // Full URI decoding
```

### User-Defined Approved Functions

Register custom business logic functions for use in expressions:

```javascript
// Example: Register custom functions during engine initialization
const APPROVED_FUNCTIONS = new Map([
  ['currentTime', () => new Date().toISOString()],
  ['extractCrypto', (text) => /* crypto extraction logic */],
  ['formatCurrency', (amount, currency) => /* formatting logic */],
  ['validateEmail', (email) => /* validation logic */]
]);

// Use in expressions
{{currentTime()}}                               // Current timestamp
{{extractCrypto(userMessage)}}                 // Extract crypto symbols
{{formatCurrency(amount, 'USD')}}              // Format money
{{validateEmail(input) ? 'Valid' : 'Invalid'}} // Email validation
```

### Method Chaining

Combine multiple safe methods for complex processing:

```javascript
// Complex string processing
{{userInput.toLowerCase().trim().substring(0, 50)}}

// Email domain extraction and validation
{{email.substring(email.indexOf('@') + 1).toLowerCase()}}

// Array processing with string methods
{{tags.join(', ').toUpperCase().replace(/,/g, ' |')}}

// Conditional method calls
{{isValidEmail ? email.toLowerCase() : 'invalid@example.com'}}
```

### Security Benefits

- **Allowlist Approach**: Only explicitly approved methods are permitted
- **No Code Injection**: Methods calls are parsed and validated, not executed as code
- **Type Safety**: Method calls are validated against the actual data types
- **No Side Effects**: All approved methods are read-only operations
- **Predictable Behavior**: Same security model across all expression contexts

---

# Chapter 3: Workflows and Step Types

## Overview

Workflows are the core building blocks of the Workflow Engine. They define structured, conversational sequences that guide users through specific tasks or processes. This chapter explains what workflows are, how they're structured, and covers all supported step types that enable sophisticated user interactions.

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
    "condition:{{age >= 21 && is_verified && credit_score > 750}}": {
      type: "SAY", value: "Premium tier approved!"
    },
    "condition:{{age >= 18 && is_verified}}": {
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

The Workflow Engine provides comprehensive internationalization (i18n) support through language-specific properties.

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
  prompt_zh: "处理付款",               // Chinese
  prompt_ja: "支払いを処理する",       // Japanese
  
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
    "condition:{{payment_amount}} > 0 && {{payment_amount}} <= {{max_amount}}": {
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

The Workflow Engine provides sophisticated conditional execution capabilities through two primary step types: **SWITCH** and **CASE**. These steps enable complex decision trees, dynamic flow routing, and intelligent branching based on variable values and conditional logic.

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
    "condition:{{user_age}} >= 21": {
      type: "SAY",
      value: "Full access granted"
    },
    "condition:{{user_age}} >= 18": {
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
"condition:{{variable}} > 100"           // Numeric comparison
"condition:{{status}} === 'active'"      // String comparison  
"condition:{{verified}} && {{premium}}"  // Boolean logic
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
    "condition:{{score}} >= 90": { /*...*/ },
    "condition:{{score}} >= 80": { /*...*/ },
    "condition:{{score}} >= 70": { /*...*/ },
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
    "condition:{{credit_score}} >= 750 && {{income}} >= 75000 && {{debt_ratio}} < 0.3": {
      type: "SET",
      variable: "loan_status", 
      value: "PRE_APPROVED"
    },
    "condition:{{credit_score}} >= 650 && {{income}} >= 50000 && {{debt_ratio}} < 0.4": {
      type: "FLOW",
      value: "ManualReviewFlow"
    },
    "condition:{{credit_score}} >= 600 && {{income}} >= 30000": {
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
    "condition:{{email}}.includes('@company.com')": {
      type: "SET",
      variable: "user_type",
      value: "EMPLOYEE"
    },
    "condition:{{email}}.includes('@partner.')": {
      type: "SET", 
      variable: "user_type",
      value: "PARTNER"
    },
    "condition:{{email}}.length > 0": {
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
    "condition:{{current_hour}} >= 9 && {{current_hour}} < 17 && {{day_of_week}} <= 5": {
      type: "FLOW",
      value: "LiveAgentFlow"
    },
    "condition:{{current_hour}} >= 17 || {{current_hour}} < 9 || {{day_of_week}} > 5": {
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

#### Comparison Operators
```javascript
"condition:{{age}} > 18"       // Greater than
"condition:{{age}} >= 21"      // Greater than or equal
"condition:{{score}} < 100"    // Less than  
"condition:{{score}} <= 95"    // Less than or equal
"condition:{{status}} === 'active'"  // Strict equality
"condition:{{status}} !== 'banned'"  // Not equal
```

#### Boolean Operators
```javascript
"condition:{{verified}} && {{premium}}"           // AND
"condition:{{guest}} || {{trial}}"                // OR
"condition:!{{suspended}}"                        // NOT
"condition:{{age}} > 18 && {{verified}}"          // Combined
```

#### String Operations
```javascript
"condition:{{email}}.includes('@company.com')"    // Contains
"condition:{{name}}.startsWith('Dr.')"            // Starts with
"condition:{{file}}.endsWith('.pdf')"             // Ends with
"condition:{{message}}.length > 100"              // String length
```

#### Mathematical Operations
```javascript
"condition:{{total}} + {{tax}} > 1000"           // Addition
"condition:{{price}} * {{quantity}} <= {{budget}}" // Multiplication
"condition:{{score}} / {{max_score}} >= 0.8"     // Division
"condition:{{current}} - {{previous}} > 50"      // Subtraction
```

### Variable Interpolation

Variables are interpolated using double curly braces `{{variable_name}}`:

```javascript
// Simple variable
"condition:{{user_age}} >= 18"

// Nested object access
"condition:{{user.profile.verified}} === true"

// Array access
"condition:{{scores[0]}} > {{scores[1]}}"

// Global variables
"condition:{{caller_id}} !== null"
```

### Security Features

The expression evaluator includes multiple security layers:

**Input Sanitization**: Removes dangerous patterns
```javascript
// ❌ Blocked patterns
"condition:eval()"          // Code execution
"condition:require()"       // Module imports  
"condition:process.exit()"  // System calls
"condition:__proto__"       // Prototype pollution
```

**Context Isolation**: Expressions run in isolated context
- No access to global objects
- No access to Node.js APIs
- No access to file system
- No network access

**Type Safety**: Automatic type coercion and validation
```javascript
"condition:{{string_number}} > 100"  // "150" > 100 = true
"condition:{{boolean_string}} && true"  // "false" && true = false
```

## Combining SWITCH and CASE

For complex logic, you can combine SWITCH and CASE steps to create sophisticated decision trees.

### Nested Branching Example

```javascript
{
  id: "user_routing_switch", 
  type: "SWITCH",
  variable: "user_tier",
  branches: {
    "premium": {
      // Premium users get condition-based routing
      type: "CASE",
      branches: {
        "condition:{{support_urgency}} === 'critical'": {
          type: "FLOW",
          value: "PremiumCriticalSupportFlow"
        },
        "condition:{{support_urgency}} === 'high'": {
          type: "FLOW", 
          value: "PremiumHighSupportFlow"
        },
        "default": {
          type: "FLOW",
          value: "PremiumStandardSupportFlow"
        }
      }
    },
    "standard": {
      // Standard users get simpler routing
      type: "CASE",
      branches: {
        "condition:{{support_urgency}} === 'critical'": {
          type: "FLOW",
          value: "EscalatedSupportFlow"
        },
        "default": {
          type: "FLOW",
          value: "StandardSupportFlow"
        }
      }
    },
    "trial": {
      // Trial users always go to self-service
      type: "FLOW",
      value: "SelfServiceFlow"
    },
    "default": {
      type: "SAY",
      value: "Unable to determine user tier"
    }
  }
}
```

### Mixed Exact and Conditional Logic

```javascript
{
  id: "order_processing_switch",
  type: "SWITCH", 
  variable: "order_type",
  branches: {
    "express": {
      // Express orders always go to priority processing
      type: "FLOW",
      value: "ExpressProcessingFlow"
    },
    "bulk": {
      // Bulk orders need conditional handling
      type: "CASE",
      branches: {
        "condition:{{item_count}} > 1000 && {{total_value}} > 50000": {
          type: "FLOW",
          value: "LargeBulkOrderFlow"
        },
        "condition:{{item_count}} > 100": {
          type: "FLOW",
          value: "StandardBulkOrderFlow"
        },
        "default": {
          type: "FLOW",
          value: "SmallBulkOrderFlow"
        }
      }
    },
    "default": {
      // All other order types use standard processing with conditions
      type: "CASE", 
      branches: {
        "condition:{{total_value}} > 10000": {
          type: "FLOW",
          value: "HighValueOrderFlow"
        },
        "condition:{{customer_tier}} === 'vip'": {
          type: "FLOW",
          value: "VIPOrderFlow"
        },
        "default": {
          type: "FLOW",
          value: "StandardOrderFlow"
        }
      }
    }
  }
}
```

## Performance Considerations

### When to Use SWITCH vs CASE

**Use SWITCH when:**
- You have discrete, known values to match
- Performance is critical (O(1) lookup)
- Logic is simple and straightforward
- Values are static and don't require computation

**Use CASE when:**
- You need conditional logic with expressions
- Multiple variables influence the decision
- Ranges or complex comparisons are needed
- Dynamic conditions based on computed values

### Optimization Strategies

#### Order Conditions by Likelihood
```javascript
{
  type: "CASE",
  branches: {
    // Most common case first
    "condition:{{user_type}} === 'standard'": { /*...*/ },
    // Less common cases 
    "condition:{{user_type}} === 'premium'": { /*...*/ },
    // Rare cases last
    "condition:{{user_type}} === 'enterprise'": { /*...*/ }
  }
}
```

#### Combine Simple Checks in SWITCH
```javascript
// ✅ Efficient - use SWITCH for simple checks
{
  type: "SWITCH",
  variable: "status",
  branches: {
    "active": { /*...*/ },
    "inactive": { /*...*/ },
    "default": {
      // Only use CASE for complex conditions in default
      type: "CASE", 
      branches: { /*...*/ }
    }
  }
}

// ❌ Less efficient - CASE for simple exact matches
{
  type: "CASE",
  branches: {
    "condition:{{status}} === 'active'": { /*...*/ },
    "condition:{{status}} === 'inactive'": { /*...*/ }
  }
}
```

#### Minimize Variable Access in Conditions
```javascript
// ✅ Good - minimal variable access
"condition:{{total}} > 1000"

// ❌ Less efficient - multiple variable access
"condition:{{price}} + {{tax}} + {{shipping}} + {{handling}} > 1000"

// ✅ Better - pre-calculate in SET step
{ type: "SET", variable: "total", value: "{{price}} + {{tax}} + {{shipping}} + {{handling}}" }
{ type: "CASE", branches: { "condition:{{total}} > 1000": { /*...*/ } } }
```

## Error Handling in Conditional Steps

### Missing Variables

When variables referenced in conditions are undefined:

```javascript
// If user_age is undefined
"condition:{{user_age}} >= 18"  // Evaluates to false

// Defensive programming
"condition:{{user_age}} !== null && {{user_age}} >= 18"
```

### Invalid Expressions

The engine provides detailed error messages for invalid expressions:

```javascript
// ❌ Invalid syntax
"condition:{{age} >= 18"     // Missing closing brace
"condition:{{age}} >="       // Incomplete comparison
"condition:{{age}} && "      // Incomplete boolean expression

// Error handling in flow
{
  type: "CASE",
  branches: {
    "condition:{{user_age}} >= 18": {
      type: "SAY",
      value: "Access granted"
    },
    "default": {
      // This catches both false conditions AND expression errors
      type: "SAY", 
      value: "Unable to verify age requirements"
    }
  }
}
```

### Fallback Strategies

Always provide meaningful default branches:

```javascript
{
  type: "CASE",
  branches: {
    "condition:{{score}} >= 90": {
      type: "SET",
      variable: "grade",
      value: "A"
    },
    "condition:{{score}} >= 80": {
      type: "SET", 
      variable: "grade",
      value: "B"
    },
    "default": {
      // Handle missing score or unexpected values
      type: "CASE",
      branches: {
        "condition:{{score}} !== null": {
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

## Best Practices

### 1. Choose the Right Tool

```javascript
// ✅ Good - SWITCH for exact matching
{
  type: "SWITCH",
  variable: "language",
  branches: {
    "en": { type: "SET", variable: "greeting", value: "Hello" },
    "es": { type: "SET", variable: "greeting", value: "Hola" },
    "fr": { type: "SET", variable: "greeting", value: "Bonjour" }
  }
}

// ✅ Good - CASE for ranges and conditions  
{
  type: "CASE",
  branches: {
    "condition:{{temperature}} > 30": { type: "SAY", value: "It's hot!" },
    "condition:{{temperature}} > 20": { type: "SAY", value: "It's warm" },
    "condition:{{temperature}} > 10": { type: "SAY", value: "It's cool" }
  }
}
```

### 2. Provide Comprehensive Coverage

```javascript
// ✅ Good - handles all expected cases
{
  type: "SWITCH",
  variable: "day_of_week", 
  branches: {
    "monday": { /*...*/ },
    "tuesday": { /*...*/ },
    "wednesday": { /*...*/ },
    "thursday": { /*...*/ },
    "friday": { /*...*/ },
    "saturday": { /*...*/ },
    "sunday": { /*...*/ },
    "default": {
      type: "SAY",
      value: "Invalid day: {{day_of_week}}"
    }
  }
}
```

### 3. Keep Conditions Readable

```javascript
// ✅ Good - clear and readable
"condition:{{age}} >= 18 && {{verified}} === true"

// ❌ Less readable - too complex
"condition:{{age}} >= 18 && {{verified}} === true && {{country}} !== 'restricted' && {{account_status}} === 'active' && {{last_login}} > '2024-01-01'"

// ✅ Better - break into multiple steps
{ type: "SET", variable: "eligible", value: "{{age}} >= 18 && {{verified}}" }
{ type: "SET", variable: "access_allowed", value: "{{country}} !== 'restricted' && {{account_status}} === 'active'" }
{ type: "CASE", branches: { "condition:{{eligible}} && {{access_allowed}}": { /*...*/ } } }
```

### 4. Document Complex Logic

```javascript
{
  id: "risk_assessment_case",
  type: "CASE",
  description: "Assess transaction risk based on amount, frequency, and user history",
  branches: {
    // High risk: Large amounts from new or unverified users
    "condition:{{amount}} > 10000 && ({{account_age_days}} < 30 || !{{verified}})": {
      type: "FLOW",
      value: "HighRiskReviewFlow"
    },
    // Medium risk: Moderate amounts or high frequency
    "condition:{{amount}} > 5000 || {{daily_transaction_count}} > 10": {
      type: "FLOW", 
      value: "MediumRiskReviewFlow"
    },
    // Low risk: Normal transactions
    "default": {
      type: "FLOW",
      value: "StandardProcessingFlow"
    }
  }
}
```

### 5. Test Edge Cases

Consider testing these scenarios:

- **Null/undefined variables**: `{{undefined_var}} > 0`
- **Type mismatches**: String compared to number
- **Edge values**: Boundary conditions (exactly 18, exactly 0, etc.)
- **Empty strings**: `{{empty_string}}.length > 0`
- **Boolean conversion**: `{{string_boolean}} === true`

## Advanced Patterns

### State Machine Implementation

```javascript
{
  id: "order_state_machine",
  type: "SWITCH",
  variable: "order_status",
  branches: {
    "pending": {
      type: "CASE",
      branches: {
        "condition:{{payment_confirmed}}": {
          type: "SET",
          variable: "order_status",
          value: "processing"
        },
        "condition:{{hours_since_order}} > 24": {
          type: "SET", 
          variable: "order_status",
          value: "expired"
        },
        "default": {
          type: "SAY",
          value: "Order pending payment confirmation"
        }
      }
    },
    "processing": {
      type: "CASE",
      branches: {
        "condition:{{all_items_shipped}}": {
          type: "SET",
          variable: "order_status", 
          value: "shipped"
        },
        "condition:{{processing_days}} > 5": {
          type: "FLOW",
          value: "DelayNotificationFlow"
        },
        "default": {
          type: "SAY",
          value: "Order is being processed"
        }
      }
    },
    "shipped": {
      type: "SAY",
      value: "Order has been shipped"
    }
  }
}
```

### Multi-Tier Decision Trees

```javascript
{
  id: "customer_service_routing",
  type: "SWITCH", 
  variable: "customer_tier",
  branches: {
    "enterprise": {
      // Enterprise customers get immediate escalation options
      type: "CASE",
      branches: {
        "condition:{{issue_type}} === 'outage'": {
          type: "FLOW",
          value: "EnterpriseOutageFlow"
        },
        "condition:{{issue_severity}} === 'critical'": {
          type: "FLOW",
          value: "EnterpriseCriticalFlow"  
        },
        "default": {
          type: "FLOW",
          value: "EnterpriseStandardFlow"
        }
      }
    },
    "premium": {
      // Premium customers get priority handling
      type: "CASE", 
      branches: {
        "condition:{{business_hours}} && {{issue_severity}} !== 'low'": {
          type: "FLOW",
          value: "PremiumLiveAgentFlow"
        },
        "default": {
          type: "FLOW",
          value: "PremiumSelfServiceFlow"
        }
      }
    },
    "default": {
      // Standard customers get filtered routing
      type: "CASE",
      branches: {
        "condition:{{business_hours}} && {{queue_length}} < 10": {
          type: "FLOW",
          value: "StandardLiveAgentFlow" 
        },
        "condition:{{issue_type}} === 'billing'": {
          type: "FLOW",
          value: "BillingSelfServiceFlow"
        },
        "default": {
          type: "FLOW",
          value: "StandardSelfServiceFlow"
        }
      }
    }
  }
}
```

---

This chapter provides comprehensive coverage of conditional execution in the Workflow Engine. Chapter 5 will explore response mapping, data transformation, and advanced tool integration patterns.


---

# Chapter 5: Rate Limiting and Performance Management

## Overview

The Workflow Engine includes sophisticated rate limiting capabilities to prevent abuse, manage system resources, and ensure fair usage across users and tools. Based on extensive testing, the engine demonstrates robust rate limiting with configurable limits and intelligent retry mechanisms.

## Rate Limiting Architecture

### Tool-Level Rate Limiting

Each tool can specify its own rate limits to prevent API abuse and manage external service quotas:

```javascript
{
  id: "GeneratePaymentLink",
  name: "Generate Payment Link", 
  description: "Creates secure payment links for transactions",
  
  security: {
    rateLimit: {
      requests: 5,          // Maximum requests
      window: 60000,        // Time window in milliseconds (60 seconds)
      scope: "per-user"     // "per-user", "global", "per-session"
    }
  }
}
```

### Rate Limiting Behavior

When rate limits are exceeded, the engine automatically:

1. **Blocks the request** and returns a rate limiting error
2. **Triggers onFail handlers** if defined in the step
3. **Logs the violation** for monitoring and debugging
4. **Provides clear error messages** to help users understand the limitation

### Example from Test Results

```
warn: Rate limiting error: Rate limit exceeded for Generate Payment Link. Max 5 requests per 60 seconds.
warn: Error executing tool GeneratePaymentLink: Rate limit check failed for tool GeneratePaymentLink: Rate limit exceeded for Generate Payment Link. Max 5 requests per 60 seconds.
```

---

# Chapter 6: Flow Interruption and Resumption

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

# Chapter 7: Testing and Debugging Workflows

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
const engine = new WorkflowEngine(
  aiCallback,           // Your AI communication function
  flowsMenu,            // Start with 2-3 simple flows
  toolsRegistry,        // Begin with 1-2 essential tools
  APPROVED_FUNCTIONS,   // Pre-approved local functions
  logger,               // Your logging instance 
  language,             // Optional User's preferred language
  messageRegistry,      // Optional Custom message templates
  guidanceConfig,       // Optional User assistance configuration
  true,                 // Enable pre-flight validation during development
  globalVariables       // Session-wide variables
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
    { type: "CASE", branches: { "condition:{{amount > 0 && amount <= 10000}}": {...} }},
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