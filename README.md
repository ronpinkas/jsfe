# JSFE — JavaScript Flow Engine

ESM TypeScript library for workflow + tool orchestration.

## Install
\`\`\`bash
npm i jsfe
\`\`\`

## Usage
\`\`\`ts
import { WorkflowEngine } from "jsfe";
\`\`\`

/*
==========================================
ENHANCED FLOW ENGINE ARCHITECTURE OVERVIEW
==========================================

MAJOR DESIGN ENHANCEMENT: Stack-of-Stacks Architecture for Flow Interruption/Resumption

This Flow Engine implements a sophisticated "stack-of-stacks" architecture that allows flows to be 
suspended and resumed, enabling users to naturally interrupt one workflow to handle another task,
then return to their original workflow seamlessly.

==========================================
CORE ARCHITECTURE COMPONENTS
==========================================

1. STACK-OF-STACKS DESIGN:
   - Multiple independent flow execution stacks
   - Active stack index tracks current execution context
   - Automatic stack switching for flow interruption/resumption
   - Proper isolation between different workflow contexts

2. FLOW FRAME STRUCTURE:
   Each flow execution maintains a complete context frame:
   - flowName, flowId, flowVersion: Flow identity and versioning
   - flowStepsStack: Remaining steps (reversed for efficient pop operations)
   - contextStack: Complete history of inputs and responses
   - inputStack: Current input context for step execution
   - variables: Unified flat variable storage (shared across sub-flows)
   - transaction: Comprehensive transaction management and audit trail
   - userId, startTime: User context and timing metadata

3. HELPER FUNCTION ARCHITECTURE:
   All stack operations go through centralized helper functions:
   - initializeFlowStacks(engine): Ensures proper structure
   - getCurrentStack(engine): Gets currently active stack
   - getCurrentStackLength(engine): Safe length checking
   - pushToCurrentStack(engine, frame): Adds flow to active stack
   - popFromCurrentStack(engine): Removes flow from active stack
   - createNewStack(engine): Creates new stack for interruptions
   - switchToPreviousStack(engine): Returns to previous context

==========================================
DATA STRUCTURES & PROPERTIES
==========================================

FLOW FRAME PROPERTIES:
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

========================================
SUPPORTED FEATURES & CAPABILITIES
========================================

FLOW EXECUTION MODES:
✅ Linear Flow Execution - Sequential step processing
✅ Sub-Flow Calls - Nested workflow execution
✅ Flow Interruption - Suspend current flow for new task
✅ Flow Resumption - Return to previously suspended flows
✅ Flow Replacement - Replace current flow with new flow
✅ Flow Reboot - Nuclear option: clear all flows and restart

CALL TYPE BEHAVIORS:
✅ "call" (default) - Normal sub-flow, preserves parent on stack
✅ "replace" - Replace current flow with new flow
✅ "reboot" - Clear entire stack and start fresh (emergency recovery)

STEP TYPE SUPPORT:
✅ SAY - Non-blocking output messages (accumulated)
✅ SAY-GET - Blocking output with user input request
✅ SET - Variable assignment with interpolation support
✅ CALL-TOOL - External tool execution with error handling
✅ FLOW - Sub-flow execution with multiple call types
✅ SWITCH - Enhanced conditional branching with expressions

ADVANCED SWITCH CONDITIONS:
✅ Exact Value Matching - Traditional switch behavior
✅ Expression Evaluation - Dynamic condition evaluation
✅ Mixed Branches - Combine exact matches with conditions
✅ Secure Evaluation - No code injection, safe expression parsing
✅ Variable Interpolation - {{variable}} template support

INTELLIGENT ERROR HANDLING:
✅ Smart Default OnFail - Context-aware error recovery
✅ Financial Operation Protection - Special handling for sensitive flows
✅ Network Error Recovery - Intelligent retry and messaging
✅ Graceful Degradation - Maintain user experience during failures
✅ Transaction Rollback - Proper cleanup on critical failures

FLOW CONTROL COMMANDS:
✅ Universal Commands - Work in any flow context
✅ "cancel"/"abort" - Exit current flow
✅ "help" - Context-sensitive help messages
✅ "status" - Current flow state information

INTENT INTERRUPTION SYSTEM:
✅ AI-Powered Intent Detection - Recognize new workflow requests
✅ Three-Tier Intent Strength - Weak/Medium/Strong intent classification
✅ Financial Flow Protection - Require explicit confirmation
✅ Graceful Interruption - Preserve context while switching
✅ Smart Resume Logic - Automatic return to suspended flows

========================================
SECURITY & COMPLIANCE FEATURES
========================================

EXPRESSION SECURITY:
✅ Safe Expression Evaluation - No eval(), no code injection
✅ Pattern-Based Security - Block dangerous function calls
✅ Variable Path Validation - Secure nested property access
✅ Input Sanitization - Clean and validate all user inputs

TRANSACTION MANAGEMENT:
✅ Comprehensive Audit Trail - Every action logged
✅ Transaction State Tracking - Success/failure/pending states
✅ Error Recovery Logging - Detailed failure analysis
✅ User Context Isolation - Prevent cross-user data leaks

RATE LIMITING & VALIDATION:
✅ Per-User Rate Limiting - Prevent abuse
✅ JSON Schema Validation - Type-safe parameter handling
✅ Input Size Limits - Prevent memory exhaustion
✅ Timeout Management - Prevent hanging operations

========================================
INTEGRATION CAPABILITIES
========================================

REST API SUPPORT:
✅ HTTP Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
✅ Content Types: JSON, Form-data, URL-encoded, XML/SOAP, Plain text, Multipart
✅ Authentication: Bearer tokens, Basic auth, API keys, HMAC signatures
✅ Parameter Handling: Path params, Query params, Request body, Headers
✅ Advanced Features: Retries with exponential backoff, Timeouts, Rate limiting
✅ Response Handling: JSON, XML, Text with automatic content-type detection
✅ DECLARATIVE RESPONSE MAPPING: Secure, generic transformation without code injection
✅ Error Handling: Status-based retry logic, Detailed error messages
✅ Security: Input sanitization, Credential management, Audit logging

DECLARATIVE RESPONSE MAPPING SYSTEM:
The engine supports completely generic response transformation through declarative 
JSON configuration, eliminating the need for users to inject code. This maintains 
complete engine security while supporting complex API response handling.

MAPPING TYPES SUPPORTED:

1. JSONPATH MAPPING - Extract and transform specific fields:
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

2. OBJECT MAPPING - Restructure response objects:
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

3. ARRAY MAPPING - Filter and transform arrays:
{
  responseMapping: {
    type: "array",
    source: "results",
    limit: 10,
    filter: { field: "status", operator: "equals", value: "active" },
    itemMapping: {
      type: "object",
      mappings: { "id": "id", "name": "name" }
    }
  }
}

4. TEMPLATE MAPPING - String interpolation:
{
  responseMapping: {
    type: "template",
    template: "User {{name}} ({{email}}) from {$args.source}"
  }
}

5. CONDITIONAL MAPPING - Different mapping based on response structure:
{
  responseMapping: {
    type: "conditional",
    conditions: [
      {
        if: { field: "status", operator: "equals", value: "success" },
        then: { type: "object", mappings: { "result": "data" } }
      }
    ],
    else: { type: "object", mappings: { "error": "message" } }
  }
}

VALUE TRANSFORMATIONS SUPPORTED:
- parseInt, parseFloat: Number conversion
- toLowerCase, toUpperCase, trim: String manipulation  
- replace: Regex replacement
- concat: Add prefix/suffix
- regex: Extract with regex groups
- date: Convert to ISO date string
- default: Fallback values

SECURITY & BEST PRACTICES:
- No code injection possible - all transformations are declarative
- Secure path traversal with validation
- Fallback handling for missing data
- Type coercion with validation
- Error handling with graceful degradation

========================================
IMPLEMENTATION NOTES & BEST PRACTICES
========================================

PROPER USAGE PATTERNS:
1. Always use helper functions for stack operations
2. Never directly access flowStacks arrays
3. Maintain transaction state consistency
4. Use proper error handling with smart defaults
5. Implement comprehensive logging for debugging

========================================

- OpenAI Function Calling Standard schemas
- JSON Schema validation with ajv
- Secure function registry
- Comprehensive error handling & transaction management
- Audit logging for compliance
- Rate limiting and input validation
- COMPREHENSIVE REST API SUPPORT with all common conventions:

REST API FEATURES SUPPORTED:
✅ HTTP Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
✅ Content Types: JSON, Form-data, URL-encoded, XML/SOAP, Plain text, Multipart
✅ Authentication: Bearer tokens, Basic auth, API keys, HMAC signatures
✅ Parameter Handling: Path params, Query params, Request body, Headers
✅ Advanced Features: Retries with exponential backoff, Timeouts, Rate limiting
✅ Response Handling: JSON, XML, Text with automatic content-type detection
✅ DECLARATIVE RESPONSE MAPPING: Secure, generic transformation without code injection
✅ Error Handling: Status-based retry logic, Detailed error messages
✅ Security: Input sanitization, Credential management, Audit logging

DECLARATIVE RESPONSE MAPPING SYSTEM:
The engine now supports completely generic response transformation through declarative 
JSON configuration, eliminating the need for users to inject code. This maintains 
complete engine security while supporting complex API response handling.

MAPPING TYPES SUPPORTED:

1. JSONPATH MAPPING - Extract and transform specific fields:
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

2. OBJECT MAPPING - Restructure response objects:
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

3. ARRAY MAPPING - Filter and transform arrays:
{
  responseMapping: {
    type: "array",
    source: "results",
    limit: 10,
    filter: { field: "status", operator: "equals", value: "active" },
    itemMapping: {
      type: "object",
      mappings: { "id": "id", "name": "name" }
    }
  }
}

4. TEMPLATE MAPPING - String interpolation:
{
  responseMapping: {
    type: "template",
    template: "User {{name}} ({{email}}) from {$args.source}"
  }
}

5. CONDITIONAL MAPPING - Different mapping based on response structure:
{
  responseMapping: {
    type: "conditional",
    conditions: [
      {
        if: { field: "status", operator: "equals", value: "success" },
        then: { type: "object", mappings: { "result": "data" } }
      }
    ],
    else: { type: "object", mappings: { "error": "message" } }
  }
}

VALUE TRANSFORMATIONS SUPPORTED:
- parseInt, parseFloat: Number conversion
- toLowerCase, toUpperCase, trim: String manipulation  
- replace: Regex replacement
- concat: Add prefix/suffix
- regex: Extract with regex groups
- date: Convert to ISO date string
- default: Fallback values

SECURITY & BEST PRACTICES:
- No code injection possible - all transformations are declarative
- Secure path traversal with validation
- Fallback handling for missing data
- Type coercion with validation
- Error handling with graceful degradation

EXAMPLE TOOL CONFIGURATIONS:

1. SIMPLE GET REQUEST:
{
  implementation: {
    type: "http",
    url: "https://api.example.com/users",
    method: "GET"
  }
}

2. AUTHENTICATED POST WITH JSON:
{
  implementation: {
    type: "http", 
    url: "https://api.example.com/users",
    method: "POST",
    contentType: "application/json"
  },
  apiKey: "your-bearer-token"
}

3. PATH PARAMETERS WITH RESPONSE MAPPING:
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

4. COMPLEX API WITH ARRAY PROCESSING:
{
  implementation: {
    type: "http",
    url: "https://api.example.com/search",
    method: "GET",
    responseMapping: {
      type: "array",
      source: "results",
      limit: 5,
      filter: { field: "active", operator: "equals", value: true },
      itemMapping: {
        type: "object",
        mappings: {
          "id": "id",
          "title": "name",
          "snippet": {
            path: "description", 
            transform: { type: "regex", pattern: "^(.{100})", group: 1 }
          }
        }
      }
    }
  }
}

5. WEATHER API WITH DECLARATIVE MAPPING:
{
  implementation: {
    type: "http",
    url: "https://wttr.in/{city}",
    pathParams: ["city"],
    customQuery: "format=j1",
    responseMapping: {
      type: "jsonPath",
      mappings: {
        "location.name": {
          path: "nearest_area[0].areaName[0].value",
          fallback: "$args.city"
        },
        "current.temp_c": {
          path: "current_condition[0].temp_C",
          transform: { type: "parseInt", fallback: 0 }
        },
        "current.condition": {
          path: "current_condition[0].weatherDesc[0].value",
          fallback: "Unknown"
        }
      }
    }
  }
}
*/