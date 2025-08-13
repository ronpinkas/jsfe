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
  stepId?: string;                                 // Optional: Associated flow step ID
  toolName?: string;                               // Optional: Tool name for tool messages
  metadata?: Record<string, unknown>;              // Optional: Additional context data
}
```

### Example Usage

```typescript
// User message
const userEntry = {
  role: 'user',
  content: 'I need help with my account',
  timestamp: Date.now()
};
// Process the message
await engine.updateActivity(userEntry, sessionContext);

// Assistant response  
const assistantEntry = {
  role: 'assistant',
  content: 'I can help you with your account. What specific issue are you experiencing?',
  timestamp: Date.now(),
  stepId: 'greeting-step'
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

2. **Flow Frame Structure**
   Each flow execution maintains a complete context frame:
   ```typescript
   {
     flowName: string,          // Human-readable flow name
     flowId: string,            // Unique flow identifier
     flowVersion: string,       // Flow version for compatibility
     flowStepsStack: [...],     // Remaining steps (reversed)
     contextStack: [...],       // Complete interaction history
     inputStack: [...],         // Current input context
     variables: {},             // Unified variable storage
     transaction: TransactionObj, // Audit and transaction tracking
     userId: string,            // User identifier
     startTime: number,         // Flow start timestamp
     pendingVariable: string,   // Variable awaiting user input
     lastSayMessage: string,    // Last SAY step output
     pendingInterruption: {}    // Interruption state management
   }
   ```

3. **Helper Function Architecture**
   All stack operations go through centralized helper functions:
   - `initializeFlowStacks(engine)`: Ensures proper structure
   - `getCurrentStack(engine)`: Gets currently active stack
   - `pushToCurrentStack(engine, frame)`: Adds flow to active stack
   - `popFromCurrentStack(engine)`: Removes flow from active stack

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