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
\`\`\`ts
import { WorkflowEngine } from "jsfe";
const engine = new WorkflowEngine(
  hostLogger: Logger, // logger instance like winston - supporting .info/.debug/.warn/.error methods
  aiCallback: AiCallbackFunction, // host provided access to AI fetch function aiFetcher(systemInstructions, userMessage) -> response string
  flowsMenu: FlowDefinition[], // host defined available flows
  toolsRegistry: ToolDefinition[], // host defined tools registry
  APPROVED_FUNCTIONS: ApprovedFunctions, // Optional host provided safe functions map
  globalVariables?: Record<string, unknown> // Optional global variables shared across all new flows
  validateOnInit: boolean = true, // Optional validate all flows an enggine initialization
  language?: string, // Optional language code
  messageRegistry?: MessageRegistry, // Optional override all engine internationalized messages
  guidanceConfig?: GuidanceConfig, // Optional overide default internationalized guidance prompts
);

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
✅ Expression Evaluation - Dynamic condition evaluation using safe JavaScript expressions
✅ Mixed Branches - Combine exact matches with conditions
✅ Secure Evaluation - No eval(), no code injection, safe expression parsing
✅ Expression Templates - {{variable + otherVar}} and {{complex.expression > threshold}} support

EXPRESSION TEMPLATE SYSTEM:
The engine supports safe JavaScript expressions within {{}} templates:
- Simple variables: {{userName}}, {{account.balance}}
- Arithmetic: {{amount + fee}}, {{price * quantity}}
- Comparisons: {{age >= 18}}, {{status === 'active'}}
- Logical: {{isAdmin && hasAccess}}, {{retryCount < maxRetries}}
- Complex: {{user.permissions.includes('admin') && creditScore > 700}}

SAFE METHOD CALLS:
The engine includes comprehensive security controls that allow only pre-approved methods:

**String Methods:**
✅ Case conversion: toLowerCase(), toUpperCase()
✅ Whitespace: trim(), padStart(), padEnd()
✅ Access: charAt(), charCodeAt(), indexOf(), lastIndexOf()
✅ Extraction: substring(), substr(), slice(), split()
✅ Search: includes(), startsWith(), endsWith(), match(), search()
✅ Manipulation: replace(), repeat(), concat()
✅ Utility: toString(), valueOf(), length, localeCompare(), normalize()

**Array Methods:**
✅ Inspection: length, includes(), indexOf(), lastIndexOf()
✅ Extraction: slice(), join()
✅ Conversion: toString(), valueOf()

**Math Methods:**
✅ Basic: abs(), ceil(), floor(), round()
✅ Comparison: max(), min()
✅ Advanced: pow(), sqrt(), random()

**Examples:**
```javascript
// String processing
{{userInput.toLowerCase().trim()}}
{{email.includes('@') && email.length > 5}}
{{text.substring(0, 10).padEnd(15, '...')}}

// Array operations  
{{items.length > 0 && items.includes('premium')}}
{{categories.slice(0, 3).join(', ')}}

// Mathematical operations
{{Math.round(price * 1.08)}} // Tax calculation
{{Math.max(balance, 0)}} // Ensure non-negative
```

SAFE FUNCTIONS:
✅ **Built-in Functions:** parseInt(), parseFloat(), isNaN(), isFinite()
✅ **Type Conversion:** String(), Number(), Boolean() (non-constructor forms)
✅ **URI Encoding:** encodeURIComponent(), decodeURIComponent(), encodeURI(), decodeURI()
✅ **User-Defined Functions:** Any functions registered in the APPROVED_FUNCTIONS registry

**Examples:**
```javascript
// Type conversion and validation
{{Number(input) > 0 && !isNaN(Number(input))}}
{{Boolean(user.isActive && user.hasAccess)}}

// URI encoding for API calls
{{encodeURIComponent(searchTerm)}}

// User-defined approved functions
{{currentTime()}} // If registered as approved function
{{extractCryptoFromInput(userMessage)}} // If registered as approved function to provide Custom business logic
```

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
✅ AI-Powered Intent Detection - Recognize new workflow requests (when `aiCallback` is provided)
✅ Fallback Flow Matching - If `aiCallback` is `null`, the engine will match the user input to a flow by id or name (case-insensitive), and if no exact match is found, will attempt a partial match. This allows demos and tests to run without requiring a real AI function.
✅ Three-Tier Intent Strength - Weak/Medium/Strong intent classification
✅ Financial Flow Protection - Require explicit confirmation
✅ Graceful Interruption - Preserve context while switching
✅ Smart Resume Logic - Automatic return to suspended flows

---

## ⚡️ Demo/Test Mode: Flow Matching Without AI

For demos, tests, or developer convenience, you can now set `aiCallback` to `null` when constructing the engine. In this mode, intent detection will:

1. **Match by Flow Name or ID (case-insensitive):**
  - If the user input exactly matches a flow's `name` or `id`, that flow is activated.
2. **Partial Match Fallback:**
  - If no exact match is found, the engine will look for a flow whose `name` or `id` contains the input (case-insensitive).
3. **No Match:**
  - If no match is found, no flow is activated.

This makes it easy to run demos and tests without requiring a real AI intent detection function. In production, always provide a real `aiCallback` for robust intent detection.

========================================
SECURITY & COMPLIANCE FEATURES
========================================

EXPRESSION SECURITY:
✅ Safe Expression Evaluation - No eval(), no code injection, allowlist-based safe method calls
✅ Safe Method Allowlist - Only pre-approved string, array, and math methods allowed
✅ Safe Function Registry - Built-in safe functions + user-defined approved functions
✅ Pattern-Based Security - Block dangerous operations (constructors, eval, etc.)
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
🚀 ENHANCED TRANSFORMATION CAPABILITIES
========================================

The JavaScript Flow Engine now includes a comprehensive suite of mathematical, temporal, 
and template processing enhancements that enable sophisticated data transformations 
without code injection risks.

MATHEMATICAL OPERATIONS:
✅ `add` - Addition with precision control: `{ type: "add", addend: 10, precision: 2 }`
✅ `subtract` - Subtraction with precision control: `{ type: "subtract", subtrahend: 5, precision: 2 }`
✅ `multiply` - Multiplication: `{ type: "multiply", multiplier: 1.08, precision: 2 }`
✅ `divide` - Division with zero protection: `{ type: "divide", divisor: 100, precision: 2 }`
✅ `percentage` - Percentage calculation: `{ type: "percentage", divisor: 1000, precision: 1 }`
✅ `abs`, `round`, `floor`, `ceil` - Mathematical functions

DATE-BASED CALCULATIONS:
✅ `currentYear` - Get current year: `{ type: "currentYear" }`
✅ `yearDifference` - Calculate age/duration: `{ type: "yearDifference" }` (current year - value)
✅ Dynamic age calculations, time-based transformations

ARRAY AGGREGATIONS:
✅ `sum` - Sum array values: `{ type: "sum", field: "budget" }` (for object arrays)
✅ `average` - Calculate mean: `{ type: "average", field: "employees", precision: 1 }`
✅ `count` - Count non-null values: `{ type: "count", field: "active" }`
✅ `min` - Find minimum: `{ type: "min", field: "price" }`
✅ `max` - Find maximum: `{ type: "max", field: "score" }`

ENHANCED TEMPLATE SYSTEM:
✅ **Array Length Access**: `{{array.length}}` automatically supported
✅ **Handlebars-Style Iteration**: `{{#each items}}...{{/each}}` with full nesting
✅ **Context Variables**: `{{@index}}` (current index), `{{@last}}` (is last item)
✅ **Conditional Rendering**: `{{#unless @last}}separator{{/unless}}`
✅ **Nested Property Access**: `{{item.nested.property}}`

REAL-WORLD EXAMPLES:

**Age Calculation:**
```json
{
  "path": "user.birthYear", 
  "transform": { "type": "yearDifference" }
}
```
Input: `2015` → Output: `10` (automatically calculated as 2025 - 2015)

**Financial Aggregations:**
```json
{
  "path": "departments",
  "transform": { 
    "type": "sum", 
    "field": "budget",
    "precision": 0
  }
}
```
Input: `[{budget: 8500000}, {budget: 3200000}]` → Output: `11700000`

**Complex Template with Arrays:**
```json
{
  "type": "template",
  "template": "Operating in {{locations.length}} locations: {{#each locations}}{{city}}, {{country}} ({{employees}} employees){{#unless @last}}; {{/unless}}{{/each}}"
}
```
Input: Array of locations → Output: `"Operating in 3 locations: San Francisco, USA (150 employees); London, UK (60 employees); Toronto, Canada (40 employees)"`

**Percentage Calculations:**
```json
{
  "path": "completedProjects",
  "transform": {
    "type": "percentage", 
    "divisor": "{{totalProjects}}",
    "precision": 1
  }
}
```
Input: `19` completed, `30` total → Output: `63.3` (percentage)

CONTRIBUTORS: Areas for Future Enhancement
✅ **Current Coverage**: Mathematical, temporal, aggregation, template processing
⚠️ **Missing Operations**: Trigonometric functions (sin, cos, tan)
⚠️ **Missing Date Functions**: Date formatting, timezone conversions, date arithmetic
⚠️ **Missing String Functions**: Advanced regex operations, locale-specific formatting
⚠️ **Missing Array Functions**: Complex filtering, sorting, grouping operations
⚠️ **Missing Template Features**: Nested loops, advanced conditionals, custom helpers

========================================
📋 COMPREHENSIVE FEATURE MATRIX FOR CONTRIBUTORS
========================================

This section provides a complete overview of implemented features and identifies 
areas where contributors can add value. All features maintain the engine's security 
model (no code injection, declarative-only transformations).

FLOW EXECUTION ENGINE:
✅ **Stack-of-stacks architecture** - Complete with interruption/resumption
✅ **Flow frame management** - Variables, context, transaction tracking
✅ **Step types** - SAY, SAY-GET, SET, CALL-TOOL, FLOW, SWITCH
✅ **Expression evaluation** - Safe JavaScript expressions with allowlist
✅ **Error handling** - Smart defaults, financial protection, graceful degradation
✅ **Intent detection** - AI-powered + fallback flow matching
✅ **Universal commands** - help, status, cancel, exit

TRANSFORMATION SYSTEM:
✅ **Basic types** - parseInt, parseFloat, toLowerCase, toUpperCase, trim
✅ **String operations** - replace, concat, regex, substring, split, join
✅ **Mathematical** - add, subtract, multiply, divide, percentage, abs, round, floor, ceil
✅ **Date/Time** - currentYear, yearDifference, ISO date conversion
✅ **Array aggregations** - sum, average, count, min, max (with field targeting)
✅ **Conditional logic** - Multi-branch conditions with operators
✅ **Template processing** - Simple placeholders + Handlebars-style iteration
✅ **Default/fallback** - Robust null handling

RESPONSE MAPPING SYSTEM:
✅ **JSONPath mapping** - Deep object extraction with transformations
✅ **Object mapping** - Restructuring and field remapping
✅ **Array mapping** - Filtering, limiting, item transformation
✅ **Template mapping** - String interpolation with complex iteration
✅ **Conditional mapping** - Response-structure-based branching

REST API INTEGRATION:
✅ **HTTP methods** - GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
✅ **Content types** - JSON, form-data, URL-encoded, XML/SOAP, text, multipart
✅ **Authentication** - Bearer, Basic, API keys, HMAC signatures
✅ **Parameters** - Path params, query params, body, headers
✅ **Advanced features** - Retries, timeouts, rate limiting
✅ **Response handling** - Auto content-type detection, declarative mapping

SECURITY & COMPLIANCE:
✅ **Expression security** - Safe evaluation, method allowlist, no eval()
✅ **Transaction management** - Audit trails, state tracking, recovery
✅ **Rate limiting** - Per-user controls, abuse prevention
✅ **Input validation** - JSON Schema, size limits, sanitization
✅ **Credential management** - Secure token handling, audit logging

AREAS FOR CONTRIBUTOR ENHANCEMENT (very liberal AI based 🫣 ):

🔢 **MATHEMATICAL EXTENSIONS:**
⚠️ Trigonometric functions (sin, cos, tan, asin, acos, atan)
⚠️ Logarithmic functions (log, log10, ln)
⚠️ Statistical functions (median, mode, standard deviation)
⚠️ Financial functions (compound interest, NPV, IRR)

📅 **DATE/TIME ENHANCEMENTS:**
⚠️ Date formatting with locale support (MM/DD/YYYY, DD-MM-YYYY)
⚠️ Timezone conversions and handling
⚠️ Date arithmetic (add days, subtract months, etc.)
⚠️ Relative date calculations (next Monday, last quarter)
⚠️ Duration calculations (time between dates)

🔤 **STRING PROCESSING EXPANSIONS:**
⚠️ Advanced regex operations (lookahead, lookbehind)
⚠️ Locale-specific formatting (currency, numbers)
⚠️ String similarity and distance algorithms
⚠️ Text normalization and cleaning utilities
⚠️ Encoding/decoding beyond URI (Base64, hex)

🔗 **ARRAY OPERATION ENHANCEMENTS:**
⚠️ Complex filtering with multiple conditions
⚠️ Sorting with custom comparators
⚠️ Grouping and partitioning operations
⚠️ Set operations (union, intersection, difference)
⚠️ Array flattening and nested operations

🎨 **TEMPLATE SYSTEM EXTENSIONS:**
⚠️ Nested loop support (each within each)
⚠️ Advanced conditionals (if/else if/else blocks)
⚠️ Custom helper functions (user-defined template functions)
⚠️ Template caching and optimization
⚠️ Internationalization and localization support

🔧 **INTEGRATION CAPABILITIES:**
⚠️ Database connectivity (with secure query building)
⚠️ File system operations (secure read/write)
⚠️ Message queue integration (Kafka, RabbitMQ, SQS)
⚠️ Real-time capabilities (WebSocket, Server-Sent Events)
⚠️ Monitoring and metrics collection

⚡ **PERFORMANCE OPTIMIZATIONS:**
⚠️ Expression caching and compilation
⚠️ Lazy evaluation for expensive operations
⚠️ Memory usage optimization for large datasets
⚠️ Parallel processing for independent operations
⚠️ Streaming processing for large arrays

IMPLEMENTATION GUIDELINES FOR CONTRIBUTORS:
1. **Security First**: All new features must maintain no-code-injection principle
2. **Declarative Design**: Use JSON configuration, not executable code
3. **Error Handling**: Implement comprehensive fallbacks and validation
4. **Testing**: Add to the 40+ test comprehensive test suite
5. **Documentation**: Update both README.md and User Guide
6. **Type Safety**: Maintain TypeScript compliance with proper interfaces
7. **Performance**: Consider memory and computational impact

CURRENT TEST COVERAGE:
✅ **40 Comprehensive Test Scenarios** - 100% pass rate validated
✅ **Flow execution patterns** - Linear, nested, interrupted, resumed
✅ **Mathematical transformations** - All operations with edge cases
✅ **Template processing** - Simple and complex Handlebars-style
✅ **API integrations** - HTTP methods, auth, error handling
✅ **Error scenarios** - Network failures, invalid data, timeouts
✅ **Security validation** - Expression safety, input sanitization

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