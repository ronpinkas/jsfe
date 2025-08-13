# JSFE — JavaScript Flow Engine

ESM TypeScript library for workflow + tool orchestration.

## Install
\`\`\`bash
npm i jsfe
\`\`\`

## 📖 Documentation

- **[JavaScript Flow Engine User Guide](JavaScript%20Flow%20Engine.md)** - Comprehensive tutorials, examples, and best practices
- **[README.md](README.md)** - Technical API reference (this document)

*For detailed tutorials, step-by-step examples, and comprehensive workflow patterns, see the **[User Guide](JavaScript%20Flow%20Engine.md)**.*

## Usage

```typescript
import { WorkflowEngine } from "jsfe";

// 1. Create the engine
const engine = new WorkflowEngine(
  hostLogger,          // Your logging instance
  aiCallback,          // Your AI communication function
  flowsMenu,           // Array of flow definitions
  toolsRegistry,       // Array of tool definitions
  APPROVED_FUNCTIONS,  // Pre-approved local functions
  globalVariables,     // Optional: Session-wide variables
  validateOnInit,      // Optional: Enable pre-flight validation (default: true)
  language,            // Optional: User's preferred language
  messageRegistry,     // Optional: Custom message templates
  guidanceConfig       // Optional: User assistance configuration
);

// 2. Initialize a session for each user
const sessionContext = engine.initSession(yourLogger, 'user-123', 'session-456');

// 3. Process user input and assistant responses
const result = await engine.updateActivity(contextEntry, sessionContext);
```

### Session Management

- Each user requires a unique session context via `initSession(logger, userId, sessionId)`
- The `EngineSessionContext` object should be persisted by your application
- Pass the same session context to `updateActivity` for conversation continuity

### Context Entry Types

- User input: `contextEntry.role = 'user'` - analyzed and may trigger flow execution
- Assistant response: `contextEntry.role = 'assistant'` - added to context for awareness

### ContextEntry Structure

```typescript
interface ContextEntry {
  role: 'user' | 'assistant' | 'system' | 'tool';  // Message role type
  content: string | Record<string, unknown>;       // Message content (text, object, etc.)
  timestamp: number;                               // Unix timestamp in milliseconds
  stepId?: string;                                 // Optional: Used by the system when a Step calls a Tool
  toolName?: string;                               // Optional: Used by the system to record Tool result into the the chat context
  metadata?: Record<string, unknown>;              // Optional: Additional context data
}
```

### Example Usage

```typescript
// User message
const userEntry = {
  role: 'user',
  content: 'I need help with my account',
};
// Process the message
await engine.updateActivity(userEntry, sessionContext);

// Assistant response  
const assistantEntry = {
  role: 'assistant',
  content: 'I can help you with your account. What specific issue are you experiencing?',
};
// Process the message
await engine.updateActivity(assistantEntry, sessionContext);
```

## Architecture Overview

### Stack-of-Stacks Design

The Flow Engine implements a sophisticated "stack-of-stacks" architecture that allows flows to be suspended and resumed, enabling users to naturally interrupt one workflow to handle another task, then return to their original workflow seamlessly.

#### Core Components

1. **Multiple Independent Flow Execution Stacks**
   - Active stack index tracks current execution context
   - Automatic stack switching for flow interruption/resumption
   - Proper isolation between different workflow contexts

2. **Flow Frame Structure (Runtime Execution Context)**
   Each flow execution maintains a complete context frame:
   ```typescript
   interface FlowFrame {
     flowName: string;                              // Human-readable flow name (from FlowDefinition.name)
     flowId: string;                                // Unique flow identifier (from FlowDefinition.id)
     flowVersion: string;                           // Flow version for compatibility (from FlowDefinition.version)
     flowStepsStack: FlowStep[];                    // Remaining steps (reversed for efficient pop)
     contextStack: ContextEntry[];                  // Complete interaction history with role info
     inputStack: unknown[];                         // Current input context for step execution
     variables: Record<string, unknown>;            // Unified variable storage (shared across sub-flows)
     transaction: TransactionObj;                   // Comprehensive transaction and audit tracking
     userId: string;                                // User identifier for this flow session
     startTime: number;                             // Flow start timestamp for timing analysis
     pendingVariable?: string;                      // Variable name awaiting user input (SAY-GET steps)
     lastSayMessage?: string;                       // Last SAY step output for context
     pendingInterruption?: Record<string, unknown>; // Interruption state management
     accumulatedMessages?: string[];                // Accumulated SAY messages for batching
     parentTransaction?: string;                    // Parent transaction ID for sub-flow tracking
     justResumed?: boolean;                         // Flag indicating flow was just resumed
   }
   ```
   
   **Technical Implementation Details:**
   - **Flow Identity**: `flowName`, `flowId`, `flowVersion` are copied from the FlowDefinition
   - **Dynamic Properties**: Flow `prompt`, `description`, and localized prompts are accessed dynamically from FlowDefinition
   - **flowStepsStack**: Steps stored in reverse order for efficient pop operations
   - **contextStack**: Enhanced with role information for complete conversation context
   - **variables**: Flat storage shared across sub-flows for seamless data passing
   - **accumulatedMessages**: SAY steps are batched for efficient output
   - **justResumed**: Helps engine provide appropriate resumption messages
   ```

3. **Helper Function Architecture**
   All stack operations go through centralized helper functions:
   - `initializeFlowStacks(engine)`: Ensures proper structure
   - `getCurrentStack(engine)`: Gets currently active stack
   - `pushToCurrentStack(engine, frame)`: Adds flow to active stack
   - `popFromCurrentStack(engine)`: Removes flow from active stack

4. **Tool Definition Structure (Runtime Integration Context)**
   Tools provide external capabilities with comprehensive security and validation:
   ```typescript
   interface ToolDefinition {
     id: string;                                    // Unique tool identifier
     name: string;                                  // Human-readable tool name
     description: string;                           // Tool functionality description
     
     parameters?: {                                 // OpenAI Function Calling Standard schema
       type: string;                                // Parameter type structure
       properties?: Record<string, PropertySchema>; // Parameter validation rules
       required?: string[];                         // Required parameter names
       additionalProperties?: boolean;              // Additional parameter handling
     };
     
     implementation?: {                             // Execution configuration
       type: 'local' | 'http';                      // Implementation type
       function?: string;                           // Local function name (APPROVED_FUNCTIONS)
       url?: string;                                // HTTP endpoint with {param} placeholders
       method?: HttpMethod;                         // HTTP method
       pathParams?: string[];                       // URL parameter substitution
       queryParams?: string[];                      // Query string parameters
       responseMapping?: MappingConfig;             // Response transformation config
       timeout?: number;                            // Request timeout
       retries?: number;                            // Retry attempts
     };
     
     security?: {                                   // Security controls
       rateLimit?: {                                // Rate limiting configuration
         requests: number;                          // Max requests per window
         window: number;                            // Time window in milliseconds
       };
     };
     apiKey?: string;                               // Authentication token
     riskLevel?: 'low' | 'medium' | 'high';         // Security classification
   }
   ```
   
   **Technical Implementation Details:**
   - **Parameter Validation**: JSON Schema validation with ajv for type safety
   - **Local Function Execution**: Secure execution through APPROVED_FUNCTIONS registry
   - **HTTP Integration**: Full REST API support with authentication and retries
   - **Response Mapping**: Declarative transformation without code injection
   - **Security Controls**: Rate limiting, risk classification, audit logging
   - **Error Handling**: Automatic retry logic and graceful degradation

5. **Response Mapping Configuration (MappingConfig Interface)**
   The comprehensive response mapping system supports multiple transformation types:
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
       path: string;                                   // JSONPath expression for data extraction
       transform?: ValueTransformConfig;               // Optional value transformation
       fallback?: unknown;                             // Fallback value if path not found
     }>;
     strict?: boolean;                                 // Strict mode validation
   };

   // Object structure mapping with nested support
   export type ObjectMappingConfig = {
     type: 'object';
     mappings: Record<string, string | PathConfig | MappingConfig | object>;
     strict?: boolean;                                 // Strict mode validation
   };

   // Array processing with filtering, sorting, and pagination
   export type ArrayMappingConfig = {
     type: 'array';
     source?: string;                                  // Source array path
     filter?: ConditionConfig;                         // Filtering conditions
     itemMapping?: MappingConfig;                      // Per-item transformation
     sort?: { field: string; order?: 'asc' | 'desc' }; // Sorting configuration
     offset?: number;                                  // Pagination offset
     limit?: number;                                   // Pagination limit  
     fallback?: unknown[];                             // Fallback array if source not found
   };

   // Template-based string generation with variable substitution
   export type TemplateMappingConfig = {
     type: 'template';
     template: string;                                 // Template string with {{variable}} placeholders
     dataPath?: string;                                // Optional path to resolve template data from
   };

   // Conditional logic-based mapping selection
   export type ConditionalMappingConfig = {
     type: 'conditional';
     conditions: Array<{
       if: ConditionConfig;                            // Condition evaluation
       then: MappingConfig;                            // Mapping to apply if condition true
     }>;
     else?: MappingConfig;                             // Default mapping if no conditions match
   };

   // Path-based value extraction with transformation
   export type PathConfig = {
     path: string;                                     // Data path for extraction
     transform?: ValueTransformConfig;                 // Optional value transformation
     fallback?: unknown;                               // Fallback value if path not found
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
     fallback?: unknown;                               // Default value for failed transforms
     prefix?: string;                                  // String prefix for concat operations
     suffix?: string;                                  // String suffix for concat operations
     pattern?: string;                                 // Regex pattern for replace/match operations
     replacement?: string;                             // Replacement string for regex operations
     template?: string;                                // Template string for template transforms
     value?: unknown;                                  // Static value for default transforms
     
     // Mathematical operation parameters
     precision?: number;                               // Decimal precision for rounding operations
     divisor?: number;                                 // Divisor for division/percentage operations
     multiplier?: number;                              // Multiplier for multiplication operations
     addend?: number;                                  // Value to add for addition operations
     subtrahend?: number;                              // Value to subtract for subtraction operations
     
     // Array and aggregation parameters
     field?: string;                                   // Field name for array aggregations
     delimiter?: string;                               // Delimiter for join/split operations
     index?: number;                                   // Array index for element selection
     
     // Conditional and date parameters
     condition?: ConditionConfig;                      // Condition for conditional transforms
     fromYear?: number;                                // Start year for year difference calculations
     dataPath?: string;                                // Path for accessing context data
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
   
   **Response Mapping Technical Features:**
   - **Type Safety**: Full TypeScript interface definitions with validation
   - **Declarative Configuration**: No code injection - pure JSON configuration
   - **Comprehensive Transforms**: 25+ built-in transformation types
   - **Mathematical Operations**: Arithmetic, statistical, and precision control
   - **Date Processing**: Dynamic date calculations and formatting
   - **Template System**: Handlebars-style variable substitution with array iteration
   - **Conditional Logic**: Complex branching and filtering capabilities
   - **Array Processing**: Filtering, sorting, pagination, and aggregation
   - **Path Resolution**: JSONPath support with fallback handling
   - **Security**: Complete input sanitization and validation

## Features & Capabilities

### Flow Execution Modes
- ✅ **Linear Flow Execution** - Sequential step processing
- ✅ **Sub-Flow Calls** - Nested workflow execution
- ✅ **Flow Interruption** - Suspend current flow for new task
- ✅ **Flow Resumption** - Return to previously suspended flows
- ✅ **Flow Replacement** - Replace current flow with new flow
- ✅ **Flow Reboot** - Nuclear option: clear all flows and restart

### Step Types
- ✅ **SAY** - Non-blocking output messages (accumulated)
- ✅ **SAY-GET** - Blocking output with user input request
- ✅ **SET** - Variable assignment with interpolation support
- ✅ **CALL-TOOL** - External tool execution with error handling
- ✅ **FLOW** - Sub-flow execution with multiple call types
- ✅ **SWITCH** - Enhanced conditional branching with expressions

### Expression Template System

The engine supports safe JavaScript expressions within `{{}}` templates:

```javascript
// Simple variables
{{userName}}, {{account.balance}}

// Arithmetic
{{amount + fee}}, {{price * quantity}}

// Comparisons
{{age >= 18}}, {{status === 'active'}}

// Logical operations
{{isAdmin && hasAccess}}, {{retryCount < maxRetries}}

// Complex expressions
{{user.permissions.includes('admin') && creditScore > 700}}
```

### Safe Method Calls

**String Methods:**
```javascript
// Case conversion
{{userInput.toLowerCase().trim()}}

// Email validation
{{email.includes('@') && email.length > 5}}

// Text processing
{{text.substring(0, 10).padEnd(15, '...')}}
```

**Array Methods:**
```javascript
// Length and content checks
{{items.length > 0 && items.includes('premium')}}

// Array manipulation
{{categories.slice(0, 3).join(', ')}}
```

**Math Methods:**
```javascript
// Tax calculation
{{Math.round(price * 1.08)}}

// Ensure non-negative
{{Math.max(balance, 0)}}
```

**Safe Functions:**
```javascript
// Type conversion and validation
{{Number(input) > 0 && !isNaN(Number(input))}}
{{Boolean(user.isActive && user.hasAccess)}}

// URI encoding for API calls
{{encodeURIComponent(searchTerm)}}

// User-defined approved functions
{{currentTime()}} // If registered as approved function
{{extractCryptoFromInput(userMessage)}} // Custom business logic
```

## Demo/Test Mode: Flow Matching Without AI

For demos, tests, or developer convenience, you can set `aiCallback` to `null` when constructing the engine. In this mode, intent detection will:

1. **Match by Flow Name or ID (case-insensitive):**
   - If the user input exactly matches a flow's `name` or `id`, that flow is activated.
2. **Partial Match Fallback:**
   - If no exact match is found, the engine will look for a flow whose `name` or `id` contains the input (case-insensitive).
3. **No Match:**
   - If no match is found, no flow is activated.

This makes it easy to run demos and tests without requiring a real AI intent detection function. In production, always provide a real `aiCallback` for robust intent detection.

## Security & Compliance

### Expression Security
- ✅ **Safe Expression Evaluation** - No eval(), no code injection
- ✅ **Safe Method Allowlist** - Only pre-approved methods allowed
- ✅ **Pattern-Based Security** - Block dangerous operations
- ✅ **Variable Path Validation** - Secure nested property access

### Transaction Management
- ✅ **Comprehensive Audit Trail** - Every action logged
- ✅ **Transaction State Tracking** - Success/failure/pending states
- ✅ **Error Recovery Logging** - Detailed failure analysis
- ✅ **User Context Isolation** - Prevent cross-user data leaks

## Integration Capabilities

### REST API Support
- ✅ **HTTP Methods:** GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- ✅ **Content Types:** JSON, Form-data, URL-encoded, XML/SOAP, Plain text, Multipart
- ✅ **Authentication:** Bearer tokens, Basic auth, API keys, HMAC signatures
- ✅ **Parameter Handling:** Path params, Query params, Request body, Headers
- ✅ **Advanced Features:** Retries with exponential backoff, Timeouts, Rate limiting

### Declarative Response Mapping

The engine supports completely generic response transformation through declarative JSON configuration:

#### JSONPath Mapping
```javascript
{
  responseMapping: {
    type: "jsonPath",
    mappings: {
      "output_field": {
        path: "api.response.field[0].value",
        transform: { type: "parseInt", fallback: 0 },
        fallback: "$args.inputField"
      }
    }
  }
}
```

#### Object Mapping
```javascript
{
  responseMapping: {
    type: "object", 
    mappings: {
      "user_name": "name",
      "contact": {
        "email": "email",
        "phone": "phone"
      },
      "metadata": {
        "processed": true,
        "timestamp": "{{new Date().toISOString()}}"
      }
    }
  }
}
```

#### Template Mapping
```javascript
{
  responseMapping: {
    type: "template",
    template: "User {{name}} ({{email}}) from {{$args.source}}"
  }
}
```

## Core Features

- **OpenAI Function Calling Standard** schemas
- **JSON Schema validation** with ajv
- **Secure function registry**
- **Comprehensive error handling** & transaction management
- **Audit logging** for compliance
- **Rate limiting** and input validation

## Value Transformations

### Supported Transforms
- **Number conversion:** parseInt, parseFloat
- **String manipulation:** toLowerCase, toUpperCase, trim
- **Text processing:** replace (regex), concat (prefix/suffix)
- **Date handling:** Convert to ISO date string
- **Fallback values:** Default handling for missing data

### Security & Best Practices
- ✅ No code injection possible - all transformations are declarative
- ✅ Secure path traversal with validation
- ✅ Fallback handling for missing data
- ✅ Type coercion with validation
- ✅ Error handling with graceful degradation

## Example Tool Configurations

### Simple GET Request
```javascript
{
  implementation: {
    type: "http",
    url: "https://api.example.com/users",
    method: "GET"
  }
}
```

### Authenticated POST with JSON
```javascript
{
  implementation: {
    type: "http", 
    url: "https://api.example.com/users",
    method: "POST",
    contentType: "application/json"
  },
  apiKey: "your-bearer-token"
}
```

### Path Parameters with Response Mapping
```javascript
{
  implementation: {
    type: "http",
    url: "https://api.example.com/users/{userId}",
    method: "GET",
    pathParams: ["userId"],
    responseMapping: {
      type: "object",
      mappings: {
        "user_id": "id",
        "full_name": "name",
        "contact_email": "email"
      }
    }
  }
}
```