//import { WorkflowEngine, /* any other needed exports */ } from './jsfe.ts.js';
import { WorkflowEngine } from '../dist/index.js';

import crypto from "crypto";
import winston from 'winston';

const logger = winston.createLogger({
  level: 'warn',  // Changed to debug to see HTTP requests
  format: winston.format.printf(({ level, message }) => {
    return `${level}: ${message}`;
  }),
  transports: [
    new winston.transports.Console()
  ]
});

// Mock local functions for testing
async function verifyAccount({ accountNumber }) {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 100));
  
  if (accountNumber === "123456") {
    return { 
      verified: true, 
      accountId: accountNumber,
      accountStatus: "active",
      lastActivity: new Date().toISOString()
    };
  } else {
    throw new Error("Invalid account number");
  }
}

async function generatePaymentLink({ accountNumber, amount }) {
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const paymentId = crypto.randomUUID();
  const signature = crypto
    .createHash("sha256")
    .update(`${accountNumber}|${amount.toFixed(2)}|${paymentId}`)
    .digest("hex");
    
  return {
    paymentId,
    url: `https://pay.example.com/${accountNumber}/${amount.toFixed(2)}?id=${paymentId}`,
    signature,
    expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour
  };
}

// === SECURITY: APPROVED FUNCTION REGISTRY ===
const APPROVED_FUNCTIONS = new Map();
// Register approved functions
APPROVED_FUNCTIONS.set('verifyAccount', verifyAccount);
APPROVED_FUNCTIONS.set('generatePaymentLink', generatePaymentLink);

// Add crypto helper functions
function extractCryptoFromInput(input) {
  // Simple crypto extraction
  const cryptoMap = {
    'bitcoin': 'bitcoin',
    'btc': 'bitcoin',
    'ethereum': 'ethereum',
    'eth': 'ethereum',
    'dogecoin': 'dogecoin',
    'doge': 'dogecoin'
  };
  
  const words = input.toLowerCase().split(' ');
  for (const word of words) {
    if (cryptoMap[word]) {
      return cryptoMap[word];
    }
  }
  return 'bitcoin'; // default
}

function currentTime() {
  return new Date().toLocaleString();
}

APPROVED_FUNCTIONS.set('extractCryptoFromInput', extractCryptoFromInput);
APPROVED_FUNCTIONS.set('currentTime', currentTime);

// === TOOL REGISTRY WITH OPENAI FUNCTION CALLING STANDARD ===
const toolsRegistry = [
  {
    id: "VerifyAccountTool",
    name: "Verify Account",
    description: "Validates customer account number and status",
    version: "1.0.0",
    
    // OpenAI Function Calling Standard Schema
    parameters: {
      type: "object",
      properties: {
        accountNumber: {
          type: "string",
          description: "Customer account number (6-12 digits)",
          pattern: "^[0-9]{6,12}$",
          examples: ["123456", "987654321"],
          minLength: 6,
          maxLength: 12
        }
      },
      required: ["accountNumber"],
      additionalProperties: false
    },
    
    // Implementation details
    implementation: {
      type: "local",
      function: "verifyAccount",
      timeout: 5000,
      retries: 2
    },
    
    // Security & compliance
    security: {
      requiresAuth: true,
      auditLevel: "high",
      dataClassification: "sensitive",
      rateLimit: { requests: 10, window: 60000 } // 10 requests per minute
    }
  },
  {
    id: "GeneratePaymentLink",
    name: "Generate Payment Link",
    description: "Generates a secure payment link for a given account and amount",
    version: "1.0.0",
    
    parameters: {
      type: "object",
      properties: {
        accountNumber: {
          type: "string",
          description: "Verified customer account number",
          pattern: "^[0-9]{6,12}$",
          minLength: 6,
          maxLength: 12
        },
        amount: {
          type: "number",
          description: "Payment amount in USD",
          minimum: 0.01,
          maximum: 10000,
          multipleOf: 0.01
        }
      },
      required: ["accountNumber", "amount"],
      additionalProperties: false
    },
    
    implementation: {
      type: "local",
      function: "generatePaymentLink",
      timeout: 10000,
      retries: 1
    },
    
    security: {
      requiresAuth: true,
      auditLevel: "critical",
      dataClassification: "financial",
      rateLimit: { requests: 5, window: 60000 } // 5 requests per minute
    }
  },
  {
    id: "GetWeather",
    name: "Get Weather Information", 
    description: "Fetches current weather information for a given city using wttr.in free API",
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
      url: "https://wttr.in/{q}",
      method: "GET",
      timeout: 5000,
      retries: 2,
      
      // Path parameters to extract from args and put in URL
      pathParams: ["q"],
      
      // Query parameters for the API
      queryParams: [],
      
      // Custom query string parameters
      customQuery: "format=j1",
      
      // Declarative response mapping (replaces responseTransform function)
      responseMapping: {
        type: "jsonPath",
        mappings: {
          "location.name": {
            path: "nearest_area[0].areaName[0].value",
            transform: { type: "concat", suffix: ", " },
            fallback: "$args.q"
          },
          "location.country": {
            path: "nearest_area[0].country[0].value",
            fallback: ""
          },
          "current.condition.text": {
            path: "current_condition[0].weatherDesc[0].value",
            fallback: "Unknown"
          },
          "current.temp_c": {
            path: "current_condition[0].temp_C",
            transform: { type: "parseInt", fallback: 0 }
          },
          "current.humidity": {
            path: "current_condition[0].humidity",
            transform: { type: "parseInt", fallback: 0 }
          },
          "last_updated": {
            path: null,
            transform: { type: "date" },
            fallback: new Date().toISOString()
          }
        }
      }
    },
    
    // No API key required - completely free service
    apiKey: null,
    
    security: {
      requiresAuth: false,
      auditLevel: "low",
      dataClassification: "public",
      rateLimit: { requests: 20, window: 60000 }
    }
  },
  {
    id: "RestApiExample",
    name: "REST API Example",
    description: "JSONPlaceholder API demonstrating declarative response mapping",
    version: "1.0.0",
    
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "User ID (1-10) for testing",
          default: "1"
        }
      },
      required: ["userId"],
      additionalProperties: false
    },
    
    implementation: {
      type: "http",
      url: "https://jsonplaceholder.typicode.com/users/{userId}",
      method: "GET",
      contentType: "application/json",
      timeout: 10000,
      retries: 2,
      retryDelay: 1000,
      
      // Path parameters to extract from args and put in URL
      pathParams: ["userId"],
      
      // Declarative response mapping using object transformation
      responseMapping: {
        type: "object",
        mappings: {
          "id": "id",
          "name": "name",
          "username": "username", 
          "email": "email",
          "phone": "phone",
          "website": "website",
          "company_name": "company.name",
          "city": "address.city",
          "status": {
            type: "template",
            template: "active"
          },
          "profile_summary": {
            path: "name",
            transform: {
              type: "template", 
              template: "{{name}} (@{{username}}) - {{email}}, {{phone}}"
            }
          },
          "metadata": {
            "source": "jsonplaceholder_api",
            "fetched_at": {
              path: null,
              transform: { type: "date" }
            }
          }
        }
      },
      
      // Custom headers
      headers: {
        "X-Client-Version": "1.0.0"
      },
      
      // Default headers
      defaultHeaders: {
        "Accept": "application/json"
      }
    },
    
    security: {
      requiresAuth: false,
      auditLevel: "medium",
      dataClassification: "public",
      rateLimit: { requests: 30, window: 60000 }
    }
  },
  {
    id: "AuthenticatedApiExample",
    name: "HTTPBin Authentication Example",
    description: "Real HTTPBin API demonstrating various authentication methods",
    version: "1.0.0",
    
    parameters: {
      type: "object",
      properties: {
        auth_type: {
          type: "string",
          enum: ["basic", "bearer", "digest"],
          description: "Authentication type to test",
          default: "basic"
        },
        username: {
          type: "string",
          description: "Username for basic/digest auth",
          default: "test_user"
        },
        password: {
          type: "string",
          description: "Password for basic/digest auth", 
          default: "test_pass"
        }
      },
      required: [],
      additionalProperties: false
    },
    
    implementation: {
      type: "http",
      url: "https://httpbin.org/basic-auth/test_user/test_pass",
      method: "GET",
      timeout: 15000,
      retries: 2,
      
      // Basic authentication (HTTPBin expects this exact format)
      headers: {
        "Authorization": "Basic dGVzdF91c2VyOnRlc3RfcGFzcw=="
      },
      
      responseMapping: {
        type: "object",
        mappings: {
          "status": "authenticated",
          "user": "user",
          "auth_type": {
            type: "template",
            template: "Basic Authentication"
          },
          "endpoint_info": {
            type: "template", 
            template: "HTTPBin Basic Auth Test - validates authentication flow"
          },
          "success": {
            path: "authenticated",
            transform: {
              type: "conditional",
              conditions: [
                { if: { field: ".", operator: "eq", value: true }, then: "Authentication successful" }
              ],
              else: "Authentication failed"
            }
          }
        }
      }
    },
    
    security: {
      requiresAuth: true,
      auditLevel: "high",
      dataClassification: "sensitive",
      rateLimit: { requests: 50, window: 60000 }
    }
  },
  {
    id: "FormDataExample", 
    name: "HTTPBin Form Data Example",
    description: "Real HTTPBin API demonstrating multipart/form-data and URL-encoded submissions",
    version: "1.0.0",
    
    parameters: {
      type: "object", 
      properties: {
        message: {
          type: "string",
          description: "Form message content",
          default: "Hello from form data test"
        },
        category: {
          type: "string",
          description: "Message category",
          enum: ["test", "demo", "example"],
          default: "test"
        },
        format: {
          type: "string",
          enum: ["json", "form", "multipart"],
          description: "Request format",
          default: "form"
        }
      },
      required: [],
      additionalProperties: false
    },
    
    implementation: {
      type: "http",
      url: "https://httpbin.org/post",
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      timeout: 30000,
      retries: 1,
      
      // Form data will be sent as key-value pairs
      formData: {
        "message": "{message}",
        "category": "{category}",
        "timestamp": "{$timestamp}",
        "format": "{format}"
      },
      
      responseMapping: {
        type: "object",
        mappings: {
          "status": {
            type: "template",
            template: "success"
          },
          "submitted_data": "form",
          "endpoint": "url", 
          "method": "method",
          "headers_received": "headers",
          "form_processing": {
            type: "template",
            template: "Form data successfully processed via {{method}} to {{url}}"
          },
          "data_summary": {
            path: "form",
            transform: {
              type: "template",
              template: "Message: {{message}}, Category: {{category}}, Format: {{format}}"
            }
          }
        }
      }
    },
    
    security: {
      requiresAuth: false,
      auditLevel: "low", 
      dataClassification: "public",
      rateLimit: { requests: 10, window: 60000 }
    }
  },
  {
    id: "XmlApiExample",
    name: "RSS Feed XML Parser",
    description: "Real RSS XML feed demonstrating XML response parsing",
    version: "1.0.0",
    
    parameters: {
      type: "object",
      properties: {
        feed: {
          type: "string",
          description: "RSS feed source",
          enum: ["news", "world", "business"],
          default: "news"
        },
        limit: {
          type: "integer",
          description: "Maximum number of articles",
          minimum: 1,
          maximum: 20,
          default: 5
        }
      },
      required: [],
      additionalProperties: false
    },
    
    implementation: {
      type: "http",
      url: "https://feeds.bbci.co.uk/news/rss.xml",
      method: "GET",
      timeout: 10000,
      headers: {
        "Accept": "application/rss+xml, application/xml, text/xml"
      },
      
      // XML parsing simulation (in real implementation would parse XML)
      responseMapping: {
        type: "template",
        template: `
RSS Feed Analysis:
Source: BBC News
Feed Type: News Articles
Status: Active
Last Updated: {{timestamp}}
Content: Latest news from BBC
Articles Available: Multiple current news articles
Format: RSS 2.0 XML

Sample Structure:
- Channel: BBC News
- Language: English  
- Category: News
- Update Frequency: Regular

Note: This demonstrates XML feed processing capability.
Real implementation would parse actual XML structure.
        `,
        variables: {
          "timestamp": {
            type: "function",
            function: "now",
            format: "iso"
          }
        }
      }
    },
    
    security: {
      requiresAuth: false,
      auditLevel: "low", 
      dataClassification: "public",
      rateLimit: { requests: 10, window: 60000 }
    }
  },
  {
    id: "ConditionalApiExample",
    name: "HTTPBin Conditional Response Example",
    description: "Real HTTPBin API demonstrating conditional response mapping",
    version: "1.0.0",
    
    parameters: {
      type: "object",
      properties: {
        endpoint: {
          type: "string",
          enum: ["ip", "headers", "user-agent", "get"],
          description: "HTTPBin endpoint to test",
          default: "ip"
        }
      },
      required: [],
      additionalProperties: false
    },
    
    implementation: {
      type: "http",
      url: "https://httpbin.org/{endpoint}",
      method: "GET",
      timeout: 5000,
      
      pathParams: ["endpoint"],
      
      // Conditional mapping based on response structure
      responseMapping: {
        type: "conditional",
        conditions: [
          {
            if: { field: "origin", operator: "exists" },
            then: {
              type: "object",
              mappings: {
                "client_ip": "origin",
                "message": "Successfully retrieved IP information",
                "endpoint_type": "ip_info"
              }
            }
          },
          {
            if: { field: "headers", operator: "exists" },
            then: {
              type: "object", 
              mappings: {
                "user_agent": "headers.User-Agent",
                "host": "headers.Host",
                "message": "Successfully retrieved header information",
                "endpoint_type": "headers_info"
              }
            }
          },
          {
            if: { field: "args", operator: "exists" },
            then: {
              type: "object",
              mappings: {
                "query_params": "args",
                "url": "url",
                "message": "Successfully retrieved GET request information",
                "endpoint_type": "get_info"
              }
            }
          }
        ],
        else: {
          type: "object",
          mappings: {
            "raw_response": ".",
            "message": "Unknown HTTPBin response format",
            "endpoint_type": "unknown"
          }
        }
      }
    },
    
    security: {
      requiresAuth: false,
      auditLevel: "low",
      dataClassification: "public",
      rateLimit: { requests: 10, window: 60000 }
    }
  },
  {
    id: "ArrayProcessingExample",
    name: "Quote API Array Processing",
    description: "Real Quotable API demonstrating array filtering and transformation",
    version: "1.0.0",
    
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Maximum number of quotes to return",
          minimum: 1,
          maximum: 50,
          default: 10
        },
        tags: {
          type: "string",
          description: "Quote tags to filter by",
          default: "inspirational"
        }
      },
      required: [],
      additionalProperties: false
    },
    
    implementation: {
      type: "http",
      url: "https://api.quotable.io/quotes",
      method: "GET",
      timeout: 5000,
      
      // Query parameters
      queryParams: ["limit", "tags"],
      
      // Array processing with filtering and transformation
      responseMapping: {
        type: "object",
        mappings: {
          "total_quotes": "totalCount",
          "page_info": {
            "current_page": "page",
            "total_pages": "totalPages"
          },
          "quotes": {
            type: "array",
            source: "results",
            limit: 5,
            filter: {
              field: "length",
              operator: "lessThan",
              value: 200
            },
            itemMapping: {
              type: "object",
              mappings: {
                "id": "_id",
                "text": "content",
                "author": "author",
                "length": "length",
                "tags": "tags",
                "word_count": {
                  path: "content",
                  transform: {
                    type: "regex",
                    pattern: "\\S+",
                    global: true,
                    fallback: 0
                  }
                },
                "category": {
                  path: "length",
                  transform: {
                    type: "conditional",
                    conditions: [
                      { if: { field: ".", operator: "lt", value: 50 }, then: "Short" },
                      { if: { field: ".", operator: "lt", value: 150 }, then: "Medium" }
                    ],
                    else: "Long"
                  }
                }
              }
            }
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
  },
  
  // === COMPREHENSIVE TEST TOOLS FOR DECLARATIVE MAPPING ===
  {
    id: "JsonPathMappingTest",
    name: "JSONPath Mapping Test",
    description: "Tests JSONPath mapping with complex nested data structures",
    version: "1.0.0",
    
    parameters: {
      type: "object",
      properties: {
        testType: {
          type: "string",
          enum: ["weather", "user", "product"],
          default: "weather",
          description: "Type of test data to use"
        }
      },
      required: [],
      additionalProperties: false
    },
    
    implementation: {
      type: "mock",
      mockResponse: {
        weather: {
          nearest_area: [{
            areaName: [{ value: "New York" }],
            country: [{ value: "United States" }],
            latitude: "40.7128",
            longitude: "-74.0060"
          }],
          current_condition: [{
            temp_C: "22",
            temp_F: "72",
            humidity: "65",
            pressure: "1013",
            weatherDesc: [{ value: "Partly cloudy" }],
            windspeedMiles: "8",
            windspeedKmph: "13"
          }],
          weather: [{
            date: "2025-08-04",
            maxtempC: "28",
            mintempC: "18",
            hourly: [
              { time: "0", tempC: "20", humidity: "70" },
              { time: "600", tempC: "18", humidity: "75" },
              { time: "1200", tempC: "25", humidity: "60" }
            ]
          }]
        },
        user: {
          id: 1,
          name: "John Doe",
          email: "john@example.com",
          address: {
            street: "123 Main St",
            city: "New York",
            zipcode: "10001",
            geo: { lat: "40.7128", lng: "-74.0060" }
          },
          company: {
            name: "Acme Corp",
            catchPhrase: "Multi-tiered zero tolerance productivity"
          },
          posts: [
            { id: 1, title: "First Post", likes: 42 },
            { id: 2, title: "Second Post", likes: 38 },
            { id: 3, title: "Third Post", likes: 55 }
          ]
        },
        product: {
          id: "prod_123",
          name: "Wireless Headphones",
          price: { amount: 199.99, currency: "USD" },
          specs: {
            battery: "30 hours",
            weight: "250g",
            features: ["noise-canceling", "bluetooth-5.0", "wireless-charging"]
          },
          reviews: [
            { user: "alice", rating: 5, comment: "Excellent quality!" },
            { user: "bob", rating: 4, comment: "Good value for money" },
            { user: "charlie", rating: 5, comment: "Amazing sound quality" }
          ],
          availability: {
            inStock: true,
            quantity: 150,
            regions: ["US", "EU", "CA"]
          }
        }
      },
      
      responseMapping: {
        type: "conditional",
        conditions: [
          {
            if: { field: "nearest_area", operator: "exists" },
            then: {
              type: "jsonPath",
              mappings: {
                "location.name": {
                  path: "nearest_area[0].areaName[0].value",
                  fallback: "Unknown Location"
                },
                "location.country": {
                  path: "nearest_area[0].country[0].value",
                  fallback: "Unknown Country"
                },
                "location.coordinates": {
                  path: "nearest_area[0]",
                  transform: {
                    type: "template",
                    template: "{{latitude}}, {{longitude}}"
                  }
                },
                "current.temperature": {
                  path: "current_condition[0].temp_C",
                  transform: { type: "parseInt", fallback: 0 }
                },
                "current.condition": {
                  path: "current_condition[0].weatherDesc[0].value",
                  fallback: "Unknown"
                },
                "current.humidity": {
                  path: "current_condition[0].humidity",
                  transform: { type: "parseInt", fallback: 0 }
                },
                "forecast.hourly_count": {
                  path: "weather[0].hourly.length",
                  transform: { type: "default", value: 0 }
                }
              }
            }
          },
          {
            if: { field: "address", operator: "exists" },
            then: {
              type: "jsonPath",
              mappings: {
                "user.id": { path: "id" },
                "user.name": { path: "name" },
                "user.email": { path: "email" },
                "user.location": {
                  path: "address",
                  transform: {
                    type: "template",
                    template: "{{street}}, {{city}} {{zipcode}}"
                  }
                },
                "user.company": { path: "company.name" },
                "user.post_count": {
                  path: "posts.length",
                  transform: { type: "default", value: 0 }
                },
                "user.total_likes": {
                  path: "posts",
                  transform: {
                    type: "sum",
                    field: "likes"
                  }
                }
              }
            }
          },
          {
            if: { field: "price", operator: "exists" },
            then: {
              type: "jsonPath",
              mappings: {
                "product.id": { path: "id" },
                "product.name": { path: "name" },
                "product.price_display": {
                  path: "price",
                  transform: {
                    type: "template",
                    template: "{{currency}} {{amount}}"
                  }
                },
                "product.features": { path: "specs.features" },
                "product.avg_rating": {
                  path: "reviews",
                  transform: {
                    type: "average",
                    field: "rating",
                    precision: 1
                  }
                },
                "product.in_stock": { path: "availability.inStock" },
                "product.stock_level": {
                  path: "availability.quantity",
                  transform: { type: "parseInt", fallback: 0 }
                }
              }
            }
          }
        ],
        else: {
          type: "object",
          mappings: {
            "error": "Unknown data structure",
            "received_keys": "{{Object.keys(this).join(', ')}}"
          }
        }
      }
    },
    
    security: {
      requiresAuth: false,
      auditLevel: "low",
      dataClassification: "test",
      rateLimit: { requests: 100, window: 60000 }
    }
  },
  
  {
    id: "ArrayMappingTest",
    name: "Array Processing Test",
    description: "Tests comprehensive array operations including filtering, sorting, and transformation",
    version: "1.0.0",
    
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["filter", "sort", "transform", "aggregate"],
          default: "filter",
          description: "Type of array operation to test"
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          default: 10,
          description: "Maximum number of results"
        }
      },
      required: [],
      additionalProperties: false
    },
    
    implementation: {
      type: "mock",
      mockResponse: {
        products: [
          { id: 1, name: "Laptop", category: "electronics", price: 999.99, rating: 4.5, inStock: true, tags: ["computer", "work"] },
          { id: 2, name: "Coffee Mug", category: "home", price: 12.99, rating: 4.2, inStock: true, tags: ["kitchen", "ceramic"] },
          { id: 3, name: "Smartphone", category: "electronics", price: 699.99, rating: 4.7, inStock: false, tags: ["mobile", "communication"] },
          { id: 4, name: "Desk Chair", category: "furniture", price: 199.99, rating: 4.1, inStock: true, tags: ["office", "ergonomic"] },
          { id: 5, name: "Tablet", category: "electronics", price: 399.99, rating: 4.3, inStock: true, tags: ["portable", "entertainment"] },
          { id: 6, name: "Bookshelf", category: "furniture", price: 149.99, rating: 4.0, inStock: false, tags: ["storage", "wood"] },
          { id: 7, name: "Headphones", category: "electronics", price: 159.99, rating: 4.6, inStock: true, tags: ["audio", "wireless"] },
          { id: 8, name: "Plant Pot", category: "home", price: 24.99, rating: 4.4, inStock: true, tags: ["garden", "ceramic"] }
        ],
        users: [
          { id: 1, name: "Alice", age: 28, department: "engineering", salary: 75000, active: true },
          { id: 2, name: "Bob", age: 35, department: "marketing", salary: 65000, active: true },
          { id: 3, name: "Charlie", age: 42, department: "engineering", salary: 95000, active: false },
          { id: 4, name: "Diana", age: 31, department: "sales", salary: 55000, active: true },
          { id: 5, name: "Eve", age: 26, department: "design", salary: 60000, active: true }
        ]
      },
      
      responseMapping: {
        type: "conditional",
        conditions: [
          {
            if: { field: "$args.operation", operator: "equals", value: "filter" },
            then: {
              type: "array",
              source: "products",
              filter: {
                field: "category",
                operator: "equals",
                value: "electronics"
              },
              limit: 5,
              itemMapping: {
                type: "object",
                mappings: {
                  "id": "id",
                  "name": "name", 
                  "price_formatted": {
                    path: "price",
                    transform: {
                      type: "concat",
                      prefix: "$",
                      suffix: " USD"
                    }
                  },
                  "rating_stars": {
                    path: "rating",
                    transform: {
                      type: "concat",
                      suffix: " ⭐"
                    }
                  },
                  "availability": {
                    path: "inStock",
                    transform: {
                      type: "conditional",
                      condition: { field: ".", operator: "equals", value: true },
                      then: "In Stock",
                      else: "Out of Stock"
                    }
                  }
                }
              }
            }
          },
          {
            if: { field: "$args.operation", operator: "equals", value: "sort" },
            then: {
              type: "array",
              source: "products",
              sort: { field: "price", order: "desc" },
              limit: 5,
              itemMapping: {
                type: "object",
                mappings: {
                  "rank": "$index + 1",
                  "name": "name",
                  "price": "price",
                  "category": "category"
                }
              }
            }
          },
          {
            if: { field: "$args.operation", operator: "equals", value: "transform" },
            then: {
              type: "array",
              source: "users",
              filter: { field: "active", operator: "equals", value: true },
              itemMapping: {
                type: "object",
                mappings: {
                  "employee_id": "id",
                  "full_name": {
                    path: "name",
                    transform: { type: "toUpperCase" }
                  },
                  "experience_level": {
                    path: "age",
                    transform: {
                      type: "conditional",
                      conditions: [
                        { if: { field: ".", operator: "lt", value: 30 }, then: "Junior" },
                        { if: { field: ".", operator: "lt", value: 40 }, then: "Senior" }
                      ],
                      else: "Expert"
                    }
                  },
                  "department": "department",
                  "compensation": {
                    path: "salary",
                    transform: {
                      type: "concat",
                      prefix: "$",
                      suffix: " annually"
                    }
                  }
                }
              }
            }
          },
          {
            if: { field: "$args.operation", operator: "equals", value: "aggregate" },
            then: {
              type: "object",
              mappings: {
                "total_products": {
                  path: "products.length",
                  transform: { type: "default", value: 0 }
                },
                "total_products": {
                  path: "products",
                  transform: {
                    type: "count"
                  }
                },
                "average_price": {
                  path: "products",
                  transform: {
                    type: "average",
                    field: "price",
                    precision: 2
                  }
                },
                "min_price": {
                  path: "products",
                  transform: {
                    type: "min",
                    field: "price"
                  }
                },
                "max_price": {
                  path: "products",
                  transform: {
                    type: "max",
                    field: "price"
                  }
                }
              }
            }
          }
        ],
        else: {
          type: "object",
          mappings: {
            "error": "Unknown operation type",
            "available_operations": ["filter", "sort", "transform", "aggregate"]
          }
        }
      }
    },
    
    security: {
      requiresAuth: false,
      auditLevel: "low",
      dataClassification: "test",
      rateLimit: { requests: 100, window: 60000 }
    }
  },
  
  {
    id: "TemplateMappingTest",
    name: "Template Mapping Test",
    description: "Tests template-based string interpolation and formatting",
    version: "1.0.0",
    
    parameters: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["summary", "report", "notification", "csv"],
          default: "summary",
          description: "Output format template"
        }
      },
      required: [],
      additionalProperties: false
    },
    
    implementation: {
      type: "mock",
      mockResponse: {
        order: {
          id: "ORD-2025-001",
          customer: {
            name: "John Smith",
            email: "john.smith@email.com",
            phone: "+1-555-0123"
          },
          items: [
            { name: "Wireless Mouse", quantity: 2, price: 29.99 },
            { name: "USB Cable", quantity: 3, price: 9.99 },
            { name: "Laptop Stand", quantity: 1, price: 49.99 }
          ],
          shipping: {
            address: "123 Main St, New York, NY 10001",
            method: "Express",
            cost: 15.99
          },
          totals: {
            subtotal: 109.96,
            tax: 8.80,
            shipping: 15.99,
            total: 134.75
          },
          status: "processing",
          created: "2025-08-04T10:30:00Z",
          estimated_delivery: "2025-08-06T18:00:00Z"
        }
      },
      
      responseMapping: {
        type: "conditional", 
        conditions: [
          {
            if: { field: "$args.format", operator: "equals", value: "summary" },
            then: {
              type: "template",
              template: "Order Summary\\n================\\nOrder ID: {{order.id}}\\nCustomer: {{order.customer.name}} ({{order.customer.email}})\\nStatus: {{order.status}}\\nItems: {{order.items.length}} items\\nTotal: ${{order.totals.total}}\\nCreated: {{order.created}}\\nEstimated Delivery: {{order.estimated_delivery}}"
            }
          },
          {
            if: { field: "$args.format", operator: "equals", value: "report" },
            then: {
              type: "template",
              template: "DETAILED ORDER REPORT\\n====================\\nOrder Information:\\n- Order ID: {{order.id}}\\n- Status: {{order.status}}\\n- Created: {{order.created}}\\n\\nCustomer Information:\\n- Name: {{order.customer.name}}\\n- Email: {{order.customer.email}}\\n- Phone: {{order.customer.phone}}\\n\\nShipping Information:\\n- Address: {{order.shipping.address}}\\n- Method: {{order.shipping.method}}\\n- Cost: ${{order.shipping.cost}}\\n\\nFinancial Summary:\\n- Subtotal: ${{order.totals.subtotal}}\\n- Tax: ${{order.totals.tax}}\\n- Shipping: ${{order.totals.shipping}}\\n- TOTAL: ${{order.totals.total}}\\n\\nEstimated Delivery: {{order.estimated_delivery}}"
            }
          },
          {
            if: { field: "$args.format", operator: "equals", value: "notification" },
            then: {
              type: "template",
              template: "Hi {{order.customer.name}}! Your order {{order.id}} is now {{order.status}}. Total: ${{order.totals.total}}. Expected delivery: {{order.estimated_delivery}}. Thank you for your business!"
            }
          },
          {
            if: { field: "$args.format", operator: "equals", value: "csv" },
            then: {
              type: "template",
              template: "OrderID,CustomerName,CustomerEmail,Status,ItemCount,Subtotal,Tax,Shipping,Total,Created,EstimatedDelivery\\n{{order.id}},{{order.customer.name}},{{order.customer.email}},{{order.status}},{{order.items.length}},{{order.totals.subtotal}},{{order.totals.tax}},{{order.totals.shipping}},{{order.totals.total}},{{order.created}},{{order.estimated_delivery}}"
            }
          }
        ],
        else: {
          type: "template",
          template: "Error: Unknown format '{{$args.format}}'. Available formats: summary, report, notification, csv"
        }
      }
    },
    
    security: {
      requiresAuth: false,
      auditLevel: "low", 
      dataClassification: "test",
      rateLimit: { requests: 100, window: 60000 }
    }
  },
  
  {
    id: "ComprehensiveMappingTest",
    name: "Comprehensive Mapping Test",
    description: "Tests all mapping types together in a complex nested scenario",
    version: "1.0.0",
    
    parameters: {
      type: "object",
      properties: {
        "includeMetrics": {
          type: "boolean",
          default: true,
          description: "Include performance metrics in output"
        }
      },
      additionalProperties: false
    },
    
    implementation: {
      type: "mock",
      mockResponse: {
        api_response: {
          status: "success",
          timestamp: "2025-08-04T15:30:00Z",
          data: {
            company: {
              id: "comp_123",
              name: "TechCorp Solutions",
              industry: "Technology",
              employees: 250,
              founded: 2015,
              revenue: {
                current_year: 15000000,
                previous_year: 12000000,
                currency: "USD"
              },
              departments: [
                { name: "Engineering", employees: 85, budget: 8500000 },
                { name: "Sales", employees: 40, budget: 3200000 },
                { name: "Marketing", employees: 25, budget: 2000000 },
                { name: "HR", employees: 15, budget: 1200000 },
                { name: "Operations", employees: 35, budget: 1800000 }
              ],
              projects: [
                {
                  id: "proj_001",
                  name: "AI Platform",
                  status: "active",
                  progress: 75,
                  team_size: 12,
                  budget: 2000000,
                  deadline: "2025-12-31"
                },
                {
                  id: "proj_002", 
                  name: "Mobile App",
                  status: "completed",
                  progress: 100,
                  team_size: 8,
                  budget: 800000,
                  deadline: "2025-06-30"
                },
                {
                  id: "proj_003",
                  name: "Cloud Migration",
                  status: "planning",
                  progress: 15,
                  team_size: 6,
                  budget: 1200000,
                  deadline: "2026-03-31"
                }
              ],
              locations: [
                { city: "San Francisco", country: "USA", employees: 150 },
                { city: "London", country: "UK", employees: 60 },
                { city: "Toronto", country: "Canada", employees: 40 }
              ]
            }
          },
          metadata: {
            request_id: "req_789",
            processing_time_ms: 245,
            cache_hit: false,
            version: "v2.1"
          }
        }
      },
      
      responseMapping: {
        type: "object",
        mappings: {
          "company_overview": {
            type: "object",
            mappings: {
              "basic_info": {
                type: "jsonPath",
                mappings: {
                  "id": { path: "api_response.data.company.id" },
                  "name": { path: "api_response.data.company.name" },
                  "industry": { path: "api_response.data.company.industry" },
                  "age_years": {
                    path: "api_response.data.company.founded",
                    transform: {
                      type: "yearDifference"
                    }
                  },
                  "size_category": {
                    path: "api_response.data.company.employees",
                    transform: {
                      type: "conditional",
                      conditions: [
                        { if: { field: ".", operator: "lt", value: 50 }, then: "Small" },
                        { if: { field: ".", operator: "lt", value: 250 }, then: "Medium" }
                      ],
                      else: "Large"
                    }
                  }
                }
              },
              "financial_summary": {
                type: "template",
                template: "Revenue Growth: ${{api_response.data.company.revenue.current_year}} ({{api_response.data.company.revenue.currency}}) - {{((api_response.data.company.revenue.current_year - api_response.data.company.revenue.previous_year) / api_response.data.company.revenue.previous_year * 100).toFixed(1)}}% YoY growth"
              }
            }
          },
          "departments": {
            type: "array",
            source: "api_response.data.company.departments",
            sort: { field: "employees", order: "desc" },
            itemMapping: {
              type: "object",
              mappings: {
                "name": "name",
                "headcount": "employees",
                "budget_millions": {
                  path: "budget",
                  transform: {
                    type: "divide",
                    divisor: 1000000,
                    precision: 1
                  }
                }
              }
            }
          },
          "active_projects": {
            type: "array",
            source: "api_response.data.company.projects",
            filter: { field: "status", operator: "equals", value: "active" },
            itemMapping: {
              type: "object",
              mappings: {
                "id": "id",
                "name": "name",
                "progress_display": {
                  path: "progress",
                  transform: {
                    type: "concat",
                    suffix: "% complete"
                  }
                },
                "team_size": "team_size",
                "status_indicator": {
                  path: "progress",
                  transform: {
                    type: "conditional",
                    conditions: [
                      { if: { field: ".", operator: "lt", value: 25 }, then: "🔴 Behind" },
                      { if: { field: ".", operator: "lt", value: 75 }, then: "🟡 On Track" }
                    ],
                    else: "🟢 Ahead"
                  }
                }
              }
            }
          },
          "global_presence": {
            type: "template",
            template: "Operating in {{api_response.data.company.locations.length}} locations: {{#each api_response.data.company.locations}}{{city}}, {{country}} ({{employees}} employees){{#unless @last}}; {{/unless}}{{/each}}"
          },
          "metrics": {
            type: "conditional",
            conditions: [{
              if: { field: "$args.includeMetrics", operator: "equals", value: true },
              then: {
                type: "object",
                mappings: {
                  "total_budget": {
                    path: "api_response.data.company.departments",
                    transform: {
                      type: "sum",
                      field: "budget"
                    }
                  },
                  "average_department_size": {
                    path: "api_response.data.company.departments",
                    transform: {
                      type: "average",
                      field: "employees",
                      precision: 1
                    }
                  },
                  "project_completion_rate": {
                    path: "api_response.data.company.projects",
                    transform: {
                      type: "average",
                      field: "progress",
                      precision: 1
                    }
                  }
                }
              }
            }],
            else: {
              type: "object",
              mappings: {
                "message": "Metrics disabled"
              }
            }
          },
          "report_metadata": {
            type: "jsonPath",
            mappings: {
              "generated_at": {
                path: "api_response.timestamp"
              },
              "request_id": {
                path: "api_response.metadata.request_id"
              },
              "processing_time": {
                path: "api_response.metadata.processing_time_ms",
                transform: {
                  type: "concat",
                  suffix: "ms"
                }
              }
            }
          }
        }
      }
    },
    
    security: {
      requiresAuth: false,
      auditLevel: "low",
      dataClassification: "test",
      rateLimit: { requests: 50, window: 60000 }
    }
  },

  // Cryptocurrency Price API (free CoinGecko API)
  {
    id: 'crypto-price-api',
    name: 'Crypto Price Check',
    description: 'Get current cryptocurrency prices',
    schema: {
      required: ['crypto'],
      properties: {
        crypto: {
          type: 'string',
          description: 'Cryptocurrency symbol (bitcoin, ethereum, etc.)'
        },
        currency: {
          type: 'string',
          description: 'Currency to convert to (usd, eur, etc.)',
          default: 'usd'
        }
      }
    },
    implementation: {
      type: 'http',
      url: 'https://api.coingecko.com/api/v3/simple/price',
      method: 'GET',
      pathParams: ['crypto', 'currency'], // Safely interpolate {crypto} and {currency} placeholders
      queryParams: ['ids', 'vs_currencies', 'include_24hr_change'],
      customQuery: 'ids={crypto}&vs_currencies={currency}&include_24hr_change=true',
      responseMapping: {
        type: 'jsonPath',
        mappings: {
          'crypto_name': {
            path: '$args.crypto',
            transform: { type: 'toUpperCase' }
          },
          'price': {
            path: '{crypto}.{currency}',
            transform: { type: 'parseFloat', fallback: 0 }
          },
          'change_24h': {
            path: '{crypto}.{currency}_24h_change',
            transform: { type: 'parseFloat', fallback: 0 }
          },
          'currency': {
            path: '$args.currency',
            transform: { type: 'toUpperCase' }
          }
        }
      },
      timeout: 10000,
      retries: 2
    },
    riskLevel: 'low',
    category: 'financial'
  },

  // Get503Error tool for testing smart retry logic with recoverable server errors
  {
    id: "Get503Error",
    name: "Get 503 Server Error",
    description: "Makes a request that reliably returns 503 Service Unavailable for testing smart retry logic",
    version: "1.0.0",
    
    parameters: {
      type: "object",
      properties: {},
      required: []
    },
    
    implementation: {
      type: "http",
      url: "https://httpstat.us/503",
      method: "GET",
      timeout: 5000,
      retries: 0, // Disable automatic retries to test smart retry logic
      
      responseMapping: {
        type: "object",
      }
    },
    
    security: {
      requiresAuth: false,
      auditLevel: "low",
      dataClassification: "test",
      rateLimit: { requests: 100, window: 60000 }
    }
  },
];

// === ENHANCED FLOW DEFINITIONS WITH BPMN-INSPIRED SCHEMA ===
// 
// NEW: callType attribute for FLOW steps and onFail handlers:
// - "call" (default): Normal sub-flow call, preserves current flow on stack
// - "replace": Replace current flow with new flow, current flow's remaining steps are discarded 
// - "reboot": Clear entire flow stack and start fresh with new flow (nuclear option)
//
const flowsMenu = [
  {
    id: "payment-flow-v1.2",
    name: "MakePayment",
    version: "1.2.0",
    description: "Complete payment processing workflow with enhanced validation",
    prompt: "Make a payment",
    prompt_es: "Hacer un pago",
    
    metadata: {
      author: "system",
      category: "financial",
      riskLevel: "high",
      requiresApproval: false,
      auditRequired: true,
      createdAt: "2025-08-02T00:00:00Z"
    },
    
    variables: {
      accountNumber: { type: "string", scope: "flow" },
      amount: { type: "number", scope: "flow" },
      paymentId: { type: "string", scope: "flow" }
    },
    
    steps: [
      {
        id: "set-api-config",
        type: "SET",
        variable: "api_base_url",
        value: "https://pay.example.com"
      },
      {
        id: "verify-account",
        type: "FLOW",
        value: "VerifyAccount",
        timeout: 10000,
        variable: "account_info",
        validation: {
          inputRequired: ["accountNumber"]
        }
      },
      {
        id: "get-payment-amount",
        type: "SAY-GET",
        value: "What amount would you like to pay? (minimum $0.01, maximum $10,000)",
        value_es: "¿Qué cantidad desea pagar? (mínimo $0.01, máximo $10,000)",
        variable: "amount",
        
        // Enhanced input validation
        inputValidation: {
          patterns: [
            {
              field: "amount",
              pattern: "^\\$?\\d+(\\.\\d{1,2})?$",
              message: "Please enter a valid amount (e.g., 25.50 or $25.50)"
            }
          ]
        }
      },
      {
        id: "generate-payment-link",
        type: "CALL-TOOL",
        tool: "GeneratePaymentLink",
        timeout: 15000,
        variable: "payment_link",
        
        // Enhanced retry configuration
        maxRetries: 2,
        retryStrategy: "exponential",
        retryOnConditions: [
          {
            errorPattern: "invalid.*amount|validation.*failed",
            action: "ask_user"
          },
          {
            errorPattern: "network|timeout|503|502",
            action: "retry"
          }
        ],
        
        retryBehavior: {
          preserveData: true,
          showProgressiveHelp: true,
          escalateAfterMaxRetries: {
            id: "payment-retry-escalation",
            type: "FLOW",
            name: "PaymentRetryEscalation",
            callType: "call" // Don't restart the whole flow
          }
        },
        
        // Improved onFail with smart retry
        onFail: {
          id: "payment-generation-failed-retry",
          type: "FLOW",
          name: "PaymentAmountRetry",
          value: "PaymentAmountRetry",
          callType: "replace" // Replace remaining steps to prevent duplicate confirmation
        }
      },
      {
        id: "payment-confirmation",
        type: "SAY",
        value: "Payment link generated successfully: {{payment_link.url}}\nPayment ID: {{payment_link.paymentId}}\nExpires: {{payment_link.expiresAt}}",
        value_es: "Enlace de pago generado con éxito: {{payment_link.url}}\nID de pago: {{payment_link.paymentId}}\nExpira: {{payment_link.expiresAt}}"
      }
    ],
    
    permissions: {
      execute: ["payment-processor", "admin", "customer"],
      view: ["customer-service", "audit"],
      modify: ["admin"]
    }
  },
  {
    id: "account-verification-v1.1",
    name: "VerifyAccount",
    version: "1.1.0",
    description: "Enhanced account verification with retry logic",
    prompt: "Verify account",
    prompt_es: "Verificar cuenta",
    
    metadata: {
      author: "system",
      category: "security",
      riskLevel: "medium",
      auditRequired: true
    },
    
    steps: [
      {
        id: "request-account-number",
        type: "SAY-GET",
        value: "Please enter your account number (6-12 digits)",
        value_es: "Por favor, ingrese su número de cuenta (6-12 dígitos)",
        variable: "accountNumber"  // Match VerifyAccountTool parameter exactly
      },
      {
        id: "verify-account-call",
        type: "CALL-TOOL",
        tool: "VerifyAccountTool",
        timeout: 5000,
        retries: 2,
        variable: "account_info",
        onFail: {
          id: "verify-account-failed-flow",
          type: "FLOW",
          value: "VerifyAccountFailed",
          callType: "replace"
        }
      }
    ]
  },
  {
    id: "account-verification-failed-v1.0",
    name: "VerifyAccountFailed",
    version: "1.0.0",
    description: "Handles account verification failures with limited retries",
    prompt: "Account verification failure",
    prompt_es: "Falla en la verificación de cuenta",

    steps: [
      {
        id: "verification-failed-message",
        type: "SAY-GET",
        value: "Account verification failed. Please ensure you entered a valid 6-12 digit account number.",
        value_es: "La verificación de la cuenta falló. Por favor, asegúrese de haber ingresado un número de cuenta válido de 6 a 12 dígitos.",
        variable: "accountNumber"  // Match VerifyAccountTool parameter exactly
      },
      {
        id: "retry-verification",
        type: "FLOW",
        value: "VerifyAccountRetry"
      }
    ]
  },
  {
    id: "account-verification-retry-v1.0",
    name: "VerifyAccountRetry",
    version: "1.0.0",
    description: "Retry account verification without re-prompting",
    prompt: "Retry account verification",
    prompt_es: "Reintentar verificación de cuenta",
    
    steps: [
      {
        id: "retry-verification-call",
        type: "CALL-TOOL",
        tool: "VerifyAccountTool",
        maxRetries: 1,
        onFail: {
          id: "account-verification-failed-final",
          type: "SAY",
          value: "Account verification failed multiple times. Please contact customer support for assistance.",
          value_es: "La verificación de la cuenta falló varias veces. Por favor, contacte a soporte al cliente para obtener ayuda."
        }
      }
    ]
  },
  
  // === ENHANCED PAYMENT RETRY FLOWS ===
  {
    id: "payment-amount-retry-v1.0",
    name: "PaymentAmountRetry",
    version: "1.0.0",
    description: "Smart retry for payment amount input with validation",
    prompt: "Payment Amount Retry",
    prompt_es: "Reintento de Cantidad de Pago",
    
    steps: [
      {
        id: "retry-amount-message",
        type: "SAY",
        value: "💡 Let's try entering the payment amount again. Please use a format like '25.50' or '$100.00'."
      },
      {
        id: "retry-get-payment-amount",
        type: "SAY-GET", 
        value: "What amount would you like to pay? (minimum $0.01, maximum $10,000)",
        value_es: "¿Qué cantidad desea pagar? (mínimo $0.01, máximo $10,000)",
        variable: "amount",
        
        inputValidation: {
          patterns: [
            {
              field: "amount",
              pattern: "^\\$?\\d+(\\.\\d{1,2})?$",
              message: "Please enter a valid amount in format: 25.50 or $25.50"
            }
          ]
        }
      },
      {
        id: "retry-generate-payment-link",
        type: "CALL-TOOL",
        tool: "GeneratePaymentLink",
        timeout: 15000,
        variable: "payment_link",
        maxRetries: 1,
        
        onFail: {
          id: "payment-retry-final-fail",
          type: "SAY",
          value: "❌ Payment processing is currently unavailable. Please try again later or contact support.\n\nIf you need assistance, please reference this session and contact our support team."
        }
      },
      {
        id: "retry-payment-confirmation",
        type: "SAY",
        value: "✅ Payment link generated successfully!\n\n🔗 Link: {{payment_link.url}}\n📋 Payment ID: {{payment_link.paymentId}}\n⏰ Expires: {{payment_link.expiresAt}}"
      }
    ]
  },
  
  {
    id: "payment-retry-escalation-v1.0", 
    name: "PaymentRetryEscalation",
    version: "1.0.0",
    description: "Escalation flow when payment retries are exhausted",
    prompt: "Payment Retry Escalation",
    
    // VALIDATION EXPECTATIONS:
    // Expected Warning: SWITCH step missing "default" branch
    // Purpose: Tests SWITCH behavior without fallback - validates that validator catches missing default branches
    // Test Intent: Demonstrates validation warning for incomplete SWITCH logic
    
    steps: [
      {
        id: "escalation-options",
        type: "SAY-GET",
        value: "🚨 We're experiencing issues processing your payment. What would you like to do?\n\n1. Try a different amount\n2. Contact customer support\n3. Try again later\n4. Cancel payment\n\nEnter your choice (1-4):",
        variable: "escalation_choice"
      },
      {
        id: "handle-escalation-choice",
        type: "SWITCH",
        variable: "escalation_choice",
        branches: {
          "1": {
            id: "retry-payment-flow",
            type: "FLOW",
            name: "PaymentAmountRetry",
            value: "PaymentAmountRetry",
            callType: "replace"
          },
          "2": {
            id: "contact-support-message",
            type: "SAY",
            value: "📞 Customer Support: 1-800-HELP (1-800-4357)\n📧 Email: support@example.com\n\nPlease reference this session when contacting support for faster assistance."
          },
          "3": {
            id: "try-later-message",
            type: "SAY", 
            value: "⏰ Please try again in a few minutes. Payment services may be temporarily unavailable.\n\nYour progress has been saved."
          },
          "4": {
            id: "cancel-payment-message",
            type: "SAY",
            value: "❌ Payment cancelled. You can start a new payment anytime."
          }
        },
      }
    ]
  },
  
  {
    id: "weather-flow-v1.0",
    name: "GetWeatherFlow",
    prompt: "Weather Check",
    prompt_es: "Consulta del Clima",
    prompt_fr: "Vérification Météo",
    version: "1.0.0",
    description: "Weather information retrieval workflow",
    
    metadata: {
      author: "system",
      category: "utility",
      riskLevel: "low",
      auditRequired: false
    },
    
    steps: [
      {
        id: "request-city",
        type: "SAY-GET",
        value: "Enter the city name to get current weather information",
        value_es: "Ingrese el nombre de la ciudad para obtener la información meteorológica actual",
        variable: "q"  // Match GetWeather tool parameter (external API requirement)
      },
      {
        id: "fetch-weather",
        type: "CALL-TOOL",
        tool: "GetWeather",
        timeout: 5000,
        variable: "weather_data",
        onFail: {
          id: "weather-fetch-failed",
          type: "SAY",
          value: "I'm sorry, I couldn't retrieve the weather information at this time. The weather service may be temporarily unavailable. Please try again later.",
          value_es: "Lo siento, no pude recuperar la información del tiempo en este momento. El servicio meteorológico puede no estar disponible temporalmente. Por favor, inténtelo de nuevo más tarde."
        }
      },
      {
        id: "display-weather",
        type: "SAY",
        value: "Current weather in {{weather_data.location.name}}: {{weather_data.current.condition.text}} at {{weather_data.current.temp_c}}°C ({{weather_data.current.humidity}}% humidity)\nLast updated: {{weather_data.last_updated}}",
        value_es: "Tiempo actual en {{weather_data.location.name}}: {{weather_data.current.condition.text}} a {{weather_data.current.temp_c}}°C ({{weather_data.current.humidity}}% de humedad)\nÚltima actualización: {{weather_data.last_updated}}"
      }
    ]
  },
  {
    id: "critical-error-recovery-v1.0",
    name: "CriticalErrorRecovery",
    version: "1.0.0",
    description: "Handles critical system errors with full reboot capability",
    prompt: "Handle critical system error",
    prompt_es: "Manejar error crítico del sistema",
    
    metadata: {
      author: "system",
      category: "recovery",
      riskLevel: "high",
      auditRequired: true
    },
    
    steps: [
      {
        id: "error-acknowledgment",
        type: "SAY",
        value: "I've encountered a critical system error. Let me restart our session with a clean state.",
        value_es: "He encontrado un error crítico del sistema. Permítame reiniciar nuestra sesión con un estado limpio."
      },
      {
        id: "restart-main-menu",
        type: "FLOW",
        value: "TestMenu",
        callType: "reboot"
      }
    ]
  },
  {
    id: "test-menu-v1.0", 
    name: "TestMenu",
    prompt: "Test Menu",
    prompt_es: "Mostrar Menú de Prueba",
    version: "1.0.0",
    description: "Test menu flow for user navigation",
    
    metadata: {
      author: "system",
      category: "navigation",
      riskLevel: "low"
    },
    
    steps: [
      {
        id: "welcome-message",
        type: "SAY",
        value: "This is the Test Menu. I can help you with:\nMake a payment\nCheck weather\nAccount verification\n\nWhat would you like to do?",
        value_es: "¡Bienvenido! Puedo ayudarle con:\n1. Hacer un pago\n2. Consultar el tiempo\n3. Verificación de cuenta\n\n¿Qué le gustaría hacer?"
      }
    ]
  },
  {
    id: "calltype-demo-v1.0",
    name: "CallTypeDemo", 
    version: "1.0.0",
    description: "Demonstrates different callType behaviors for FLOW steps",
    prompt: "Flow Navigation Demo",
    prompt_es: "Demostración de Navegación de Flujos",
    prompt_fr: "Démonstration de Navigation de Flux",
    prompt_ja: "フローナビゲーションデモ",
    
    metadata: {
      author: "system",
      category: "demo",
      riskLevel: "low"
    },
    
    steps: [
      {
        id: "demo-intro",
        type: "SAY-GET",
        value: "This flow demonstrates callType options. Choose:\n1. 'call' - Normal sub-flow\n2. 'replace' - Replace this flow\n3. 'reboot' - Clear all flows and restart",
        value_es: "Este flujo demuestra las opciones de callType. Elija:\n1. 'call' - Subflujo normal\n2. 'replace' - Reemplazar este flujo\n3. 'reboot' - Limpiar todos los flujos y reiniciar",
        variable: "choice"
      },
      {
        id: "demo-switch",
        type: "SWITCH",
        variable: "choice",
        branches: {
          "1": {
            id: "demo-call",
            type: "FLOW",
            value: "TestMenu",
            callType: "call"  // Normal sub-flow - preserves this flow
          },
          "2": {
            id: "demo-replace", 
            type: "FLOW",
            value: "TestMenu",
            callType: "replace"  // Replaces this flow
          },
          "3": {
            id: "demo-reboot",
            type: "FLOW", 
            value: "TestMenu",
            callType: "reboot"  // Clears all flows and restarts
          },
          "default": {
            id: "invalid-choice",
            type: "SAY",
            value: "Invalid choice. Sorry I couldn't help.",
            value_es: "Opción inválida. Lo siento, no pude ayudar."
          }
        }
      },
      {
        id: "demo-completion",
        type: "SAY",
        value: "CallTypeDemo completed! Returning from call.",
        value_es: "¡CallTypeDemo completado! Regresando de la llamada."
      }
    ]
  },
  {
    id: "rest-api-demo-v1.0",
    name: "RestApiDemo",
    version: "1.0.0", 
    description: "Demonstrates comprehensive REST API capabilities",
    prompt: "REST API demonstration",
    prompt_es: "Demostración de API REST",
    
    // VALIDATION EXPECTATIONS:
    // Expected Warning 1: Tool "RestApiExample" in step "fetch-user-data" has no schema for argument validation
    // Expected Warning 2: Tool "RestApiExample" in step "retry-fetch-user-data" has no schema for argument validation
    // Purpose: Tests flexible tool argument generation without strict validation constraints
    // Test Intent: Demonstrates AI-driven argument generation capabilities for schema-less tools
    
    metadata: {
      author: "system",
      category: "demo",
      riskLevel: "low"
    },
    
    steps: [
      {
        id: "demo-intro",
        type: "SAY-GET",
        value: "This demo shows REST API capabilities. Enter a user ID (1-10) to fetch user data:",
        value_es: "Esta demostración muestra las capacidades de la API REST. Ingrese un ID de usuario (1-10) para obtener datos de usuario:",
        variable: "userId"  // Match RestApiExample tool parameter exactly
      },
      {
        id: "fetch-user-data",
        type: "CALL-TOOL",
        tool: "RestApiExample",
        args: {
          userId: "{{userId}}"  // Use the user input collected in the previous step
        },
        variable: "user_data",
        onFail: {
          id: "user-data-fetch-failed-flow",
          type: "FLOW",
          value: "RestApiDemoRetry",
          callType: "replace"
        }
      },
      {
        id: "display-user-info",
        type: "SAY",
        value: "User Info:\nName: {{user_data.name}}\nEmail: {{user_data.email}}\nPhone: {{user_data.phone}}\nWebsite: {{user_data.website}}",
        value_es: "Información del usuario:\nNombre: {{user_data.name}}\nCorreo electrónico: {{user_data.email}}\nTeléfono: {{user_data.phone}}\nSitio web: {{user_data.website}}"
      }
    ]
  },
  {
    id: "rest-api-demo-retry-v1.0",
    name: "RestApiDemoRetry",
    version: "1.0.0",
    description: "Handles REST API failures with retry capability",
    prompt: "REST API retry handler",
    prompt_es: "Manejador de reintentos de API REST",
    
    metadata: {
      author: "system",
      category: "demo",
      riskLevel: "low"
    },
    
    steps: [
      {
        id: "retry-message",
        type: "SAY-GET",
        value: "Failed to fetch user data. Please try again with a valid user ID (1-10):",
        value_es: "No se pudieron obtener los datos del usuario. Por favor, inténtelo de nuevo con un ID de usuario válido (1-10):",
        variable: "userId"
      },
      {
        id: "retry-fetch-user-data",
        type: "CALL-TOOL",
        tool: "RestApiExample",
        args: {
          userId: "{{userId}}"
        },
        variable: "user_data",
        onFail: {
          id: "final-failure-message",
          type: "SAY",
          value: "Unable to fetch user data after retry. Please contact support.",
          value_es: "No se pueden obtener los datos del usuario después del reintento. Por favor, contacte a soporte."
        }
      },
      {
        id: "display-retry-user-info",
        type: "SAY",
        value: "User Info (after retry):\nName: {{user_data.name}}\nEmail: {{user_data.email}}\nPhone: {{user_data.phone}}\nWebsite: {{user_data.website}}",
        value_es: "Información del usuario (después del reintento):\nNombre: {{user_data.name}}\nCorreo electrónico: {{user_data.email}}\nTeléfono: {{user_data.phone}}\nSitio web: {{user_data.website}}"
      }
    ]
  },
  {
    id: "api-testing-flow-v1.0",
    name: "ApiTestingFlow",
    version: "1.0.0",
    description: "Comprehensive API testing workflow with different content types",
    prompt: "API testing suite",
    prompt_es: "Suite de pruebas de API",
    
    metadata: {
      author: "system", 
      category: "testing",
      riskLevel: "low"
    },
    
    steps: [
      {
        id: "test-intro",
        type: "SAY-GET",
        value: "API Testing Suite\nChoose test type:\n1. JSON API\n2. Form Data\n3. XML/SOAP\nEnter your choice:",
        value_es: "Suite de pruebas de API\nElija el tipo de prueba:\n1. API JSON\n2. Datos de formulario\n3. XML/SOAP\nIngrese su elección:",
        variable: "test_type"
      },
      {
        id: "branch-on-choice",
        type: "SWITCH",
        variable: "test_type",
        branches: {
          "1": {
            id: "start-json-test-flow",
            type: "FLOW",
            value: "JsonApiTestFlow",
            callType: "replace"
          },
          "2": {
            id: "start-form-test-flow",
            type: "FLOW", 
            value: "FormDataTestFlow",
            callType: "replace"
          },
          "3": {
            id: "start-xml-test-flow",
            type: "FLOW",
            value: "XmlApiTestFlow", 
            callType: "replace"
          },
          "default": {
            id: "restart-api-testing",
            type: "FLOW",
            value: "ApiTestingFlowRestart",
            callType: "replace"
          }
        }
      }
    ]
  },
  {
    id: "api-testing-flow-restart-v1.0",
    name: "ApiTestingFlowRestart",
    version: "1.0.0",
    description: "Shows error message and restarts API testing flow",
    prompt: "Restart API testing",
    prompt_es: "Reiniciar pruebas de API",
    
    metadata: {
      author: "system",
      category: "testing",
      riskLevel: "low"
    },
    
    steps: [
      {
        id: "invalid-choice-message",
        type: "SAY",
        value: "Invalid choice '{{test_type}}'. Please select:\n1. JSON API\n2. Form Data\n3. XML/SOAP\n\nRestarting API Testing Flow...",
        value_es: "Opción inválida '{{test_type}}'. Por favor seleccione:\n1. API JSON\n2. Datos de formulario\n3. XML/SOAP\n\nReiniciando el flujo de prueba de API..."
      },
      {
        id: "restart-api-testing",
        type: "FLOW",
        value: "ApiTestingFlow",
        callType: "replace"
      }
    ]
  },
  {
    id: "json-api-test-flow-v1.0",
    name: "JsonApiTestFlow",
    version: "1.0.0",
    description: "JSON API testing flow",
    prompt: "JSON API testing",
    prompt_es: "Pruebas de API JSON",
    
    metadata: {
      author: "system",
      category: "testing",
      riskLevel: "low"
    },
    
    steps: [
      {
        id: "execute-json-test",
        type: "CALL-TOOL",
        tool: "RestApiExample",
        args: {
          userId: "1"
        },
        variable: "json_result"
      },
      {
        id: "json-test-summary",
        type: "SAY",
        value: "JSON API Test Complete!\nResult: {{json_result.status || 'Failed'}}\nUser: {{json_result.login || 'Unknown'}}\nName: {{json_result.name || 'N/A'}}",
        value_es: "¡Prueba de API JSON completada!\nResultado: {{json_result.status || 'Falló'}}\nUsuario: {{json_result.login || 'Desconocido'}}\nNombre: {{json_result.name || 'N/A'}}"
      }
    ]
  },
  {
    id: "form-data-test-flow-v1.0",
    name: "FormDataTestFlow",
    version: "1.0.0",
    description: "Form data testing flow",
    prompt: "API Form Testing",
    prompt_es: "Pruebas de Formularios API",
    prompt_fr: "Tests de Formulaires API",
    prompt_zh: "API 表单测试",
    
    metadata: {
      author: "system",
      category: "testing",
      riskLevel: "low"
    },
    
    steps: [
      {
        id: "execute-form-test",
        type: "CALL-TOOL",
        tool: "FormDataExample",
        args: {
          message: "API Testing Suite",
          category: "demo",
          format: "json"
        },
        variable: "form_result"
      },
      {
        id: "form-test-summary",
        type: "SAY",
        value: "Form Data Test Complete!\nResult: {{form_result.status || 'Failed'}}\nEndpoint: {{form_result.endpoint || 'Unknown'}}\nMethod: {{form_result.method || 'N/A'}}",
        value_es: "¡Prueba de datos de formulario completada!\nResultado: {{form_result.status || 'Falló'}}\nEndpoint: {{form_result.endpoint || 'Desconocido'}}\nMétodo: {{form_result.method || 'N/A'}}"
      }
    ]
  },
  {
    id: "xml-api-test-flow-v1.0",
    name: "XmlApiTestFlow",
    version: "1.0.0",
    description: "XML API testing flow",
    prompt: "XML API testing",
    prompt_es: "Pruebas de API XML",
    
    metadata: {
      author: "system",
      category: "testing",
      riskLevel: "low"
    },
    
    steps: [
      {
        id: "execute-xml-test",
        type: "CALL-TOOL",
        tool: "XmlApiExample",
        args: {
          feed: "news",
          limit: 5
        },
        variable: "xml_result"
      },
      {
        id: "xml-test-summary",
        type: "SAY",
        value: "XML/RSS Feed Test Complete!\nResult: {{xml_result || 'Failed'}}\n\nXML parsing capabilities demonstrated.",
        value_es: "¡Prueba de feed XML/RSS completada!\nResultado: {{xml_result || 'Falló'}}\n\nCapacidades de análisis XML demostradas."
      }
    ]
  },
  {
    id: "mapping-test-flow-v1.0",
    name: "MappingTestFlow",
    version: "1.0.0",
    description: "Tests all declarative response mapping capabilities",
    prompt: "Response mapping tests",
    prompt_es: "Pruebas de mapeo de respuestas",
    
    // VALIDATION EXPECTATIONS:
    // Expected Warning 1: Tool "JsonPathMappingTest" has no schema for argument validation
    // Expected Warning 2: Tool "ArrayMappingTest" has no schema for argument validation  
    // Expected Warning 3: Tool "TemplateMappingTest" has no schema for argument validation
    // Expected Warning 4: Tool "ComprehensiveMappingTest" has no schema for argument validation
    // Purpose: Tests declarative response mapping with flexible argument handling
    // Test Intent: Validates mapping system works without strict tool schemas
    
    metadata: {
      author: "system",
      category: "testing",
      riskLevel: "low"
    },
    
    variables: {
      test_result: "Test not executed"
    },
    
    steps: [
      {
        id: "test-intro",
        type: "SAY-GET",
        value: "Testing Response Mapping System\nChoose test type:\n1. JSONPath mapping\n2. Array processing\n3. Template formatting\n4. Comprehensive mapping\nEnter your choice:",
        value_es: "Probando el sistema de mapeo de respuestas\nElija el tipo de prueba:\n1. Mapeo JSONPath\n2. Procesamiento de arreglos\n3. Formato de plantilla\n4. Mapeo completo\nIngrese su elección:",
        variable: "test_choice"
      },
      {
        id: "execute-selected-test",
        type: "SWITCH",
        variable: "test_choice",
        branches: {
          "1": {
            id: "execute-jsonpath-test",
            type: "CALL-TOOL",
            tool: "JsonPathMappingTest",
            args: {
              testType: "weather"
            },
            variable: "test_result"
          },
          "2": {
            id: "execute-array-test",
            type: "CALL-TOOL",
            tool: "ArrayMappingTest",
            args: {
              operation: "filter",
              limit: 5
            },
            variable: "test_result"
          },
          "3": {
            id: "execute-template-test",
            type: "CALL-TOOL",
            tool: "TemplateMappingTest",
            args: {
              format: "summary"
            },
            variable: "test_result"
          },
          "4": {
            id: "execute-comprehensive-test",
            type: "CALL-TOOL",
            tool: "ComprehensiveMappingTest",
            args: {
              includeMetrics: true
            },
            variable: "test_result"
          },
          "default": {
            id: "invalid-test-choice",
            type: "SAY",
            value: "Invalid choice '{{test_choice}}'. Please select 1, 2, 3, or 4.",
            value_es: "Opción inválida '{{test_choice}}'. Por favor seleccione 1, 2, 3 o 4."
          }
        },
        onFail: {
          id: "mapping-test-failed",
          type: "SAY",
          value: "Mapping test completed with errors.",
          value_es: "Prueba de mapeo completada con errores."
        }
      },
      {
        id: "test-summary",
        type: "SAY",
        value: "Response Mapping Tests Complete!\nResult: {{test_result || 'No test results available'}}",
        value_es: "¡Pruebas de mapeo de respuestas completadas!\nResultado: {{test_result || 'No hay resultados de prueba disponibles'}}"
      }
    ]
  },
  {
    id: "http-tools-test-flow-v1.0",
    name: "HttpToolsTestFlow",
    version: "1.0.0",
    description: "Tests all HTTP tool integrations and content types",
    prompt: "HTTP tools testing",
    prompt_es: "Pruebas de herramientas HTTP",
    
    // VALIDATION EXPECTATIONS:
    // Expected Warning 1: Tool "RestApiExample" has no schema for argument validation
    // Expected Warning 2: Tool "ConditionalApiExample" has no schema for argument validation
    // Expected Warning 3: Tool "ArrayProcessingExample" has no schema for argument validation
    // Expected Warning 4: Tool "FormDataExample" has no schema for argument validation
    // Purpose: Tests HTTP tool integrations with flexible argument handling
    // Test Intent: Validates various HTTP content types work without strict schemas
    
    metadata: {
      author: "system",
      category: "testing",
      riskLevel: "low"
    },
    
    steps: [
      {
        id: "http-test-intro",
        type: "SAY",
        value: "HTTP Tools Test Suite\nTesting various HTTP integrations and content types...",
        value_es: "Suite de pruebas de herramientas HTTP\nProbando varias integraciones HTTP y tipos de contenido...",
      },
      {
        id: "test-rest-api",
        type: "CALL-TOOL",
        tool: "RestApiExample",
        args: {
          endpoint: "users",
          userId: "2"  // Fixed: provide both required parameters
        },
        variable: "rest_result",
        onFail: {
          id: "rest-api-test-failed",
          type: "SAY",
          value: "REST API test completed with expected behavior.",
          value_es: "Prueba de API REST completada con el comportamiento esperado."
        }
      },
      {
        id: "test-conditional-api",
        type: "CALL-TOOL",
        tool: "ConditionalApiExample",
        args: {
          endpoint: "ip"  // Fixed: provide required endpoint parameter
        },
        variable: "conditional_result",
        onFail: {
          id: "conditional-api-test-failed",
          type: "SAY",
          value: "Conditional API test completed.",
          value_es: "Prueba de API condicional completada."
        }
      },
      {
        id: "test-array-processing",
        type: "CALL-TOOL",
        tool: "ArrayProcessingExample",
        args: {
          limit: 5,
          tags: "inspirational"  // Fixed: provide valid parameters
        },
        variable: "array_processing_result",
        onFail: {
          id: "array-processing-test-failed",
          type: "SAY",
          value: "Array processing test completed.",
          value_es: "Prueba de procesamiento de arreglos completada."
        }
      },
      {
        id: "test-form-data",
        type: "CALL-TOOL",
        tool: "FormDataExample",
        args: {
          message: "HTTP Tools Test",
          category: "test",
          format: "form"  // Fixed: provide valid parameters
        },
        variable: "form_result",
        onFail: {
          id: "form-data-test-failed",
          type: "SAY",
          value: "Form data test completed with expected behavior.",
          value_es: "Prueba de datos de formulario completada con el comportamiento esperado."
        }
      },
      {
        id: "http-tests-summary",
        type: "SAY",
        value: "HTTP Tools Tests Complete!\nAll HTTP integrations and content types validated.",
        value_es: "¡Pruebas de herramientas HTTP completadas!\nTodas las integraciones HTTP y tipos de contenido validados."
      }
    ]
  },

  // Enhanced SWITCH with condition support test
  {
    id: "enhanced-switch-condition-test",
    name: "Enhanced SWITCH with Condition Support Test",
    version: "1.0.0",
    description: "Test SWITCH step with both exact matching and condition evaluation",
    prompt: "Enhanced SWITCH condition testing",
    prompt_es: "Pruebas de condiciones SWITCH mejoradas",
    
    metadata: {
      author: "system",
      category: "testing",
      riskLevel: "low",
      requiresApproval: false,
      auditRequired: false,
      createdAt: "2025-01-28T00:00:00Z"
    },
    
    variables: {
      user_age: { type: "number", scope: "flow" },
      user_verified: { type: "boolean", scope: "flow" },
      total_amount: { type: "number", scope: "flow" },
      status: { type: "string", scope: "flow" },
      dummy: { type: "string", scope: "flow" }, // Added for condition-based SWITCH steps
      test1_result: { type: "string", scope: "flow" },
      test2_result: { type: "string", scope: "flow" },
      test3_result: { type: "string", scope: "flow" },
      test4_result: { type: "string", scope: "flow" }
    },
    
    steps: [
      // Set up test variables
      {
        id: "setup",
        type: "SET",
        variable: "user_age",
        value: "25"
      },
      {
        id: "setup2", 
        type: "SET",
        variable: "user_verified",
        value: "true"
      },
      {
        id: "setup3",
        type: "SET", 
        variable: "total_amount",
        value: "150"
      },
      {
        id: "setup4",
        type: "SET",
        variable: "status",
        value: "premium"
      },
      
      // Test 1: Simple exact matching (existing functionality)
      {
        id: "test_exact_match",
        type: "SWITCH",
        variable: "status",
        branches: {
          "premium": {
            id: "exact_match_result",
            type: "SET",
            variable: "test1_result",
            value: "EXACT_MATCH_SUCCESS"
          },
          "basic": {
            id: "basic_result", 
            type: "SET",
            variable: "test1_result",
            value: "BASIC_USER"
          },
          "default": {
            id: "default_result",
            type: "SET", 
            variable: "test1_result",
            value: "DEFAULT_CASE"
          }
        }
      },
      
      // Test 2: Age condition (using new CASE step)
      {
        id: "test_age_condition",
        type: "CASE",
        branches: {
          "condition:{{user_age}} >= 21": {
            id: "adult_result",
            type: "SET",
            variable: "test2_result", 
            value: "ADULT_USER"
          },
          "condition:{{user_age}} < 21": {
            id: "minor_result",
            type: "SET",
            variable: "test2_result",
            value: "MINOR_USER"
          },
          "default": {
            id: "unknown_age_result",
            type: "SET",
            variable: "test2_result", 
            value: "UNKNOWN_AGE"
          }
        }
      },
      
      // Test 3: Complex condition with multiple variables (using new CASE step)
      {
        id: "test_complex_condition",
        type: "CASE",
        branches: {
          "condition:{{user_age}} >= 18 && {{user_verified}} && {{total_amount}} > 100": {
            id: "vip_result",
            type: "SET",
            variable: "test3_result",
            value: "VIP_ACCESS_GRANTED"
          },
          "condition:{{user_age}} >= 18 && {{user_verified}}": {
            id: "verified_result",
            type: "SET", 
            variable: "test3_result",
            value: "VERIFIED_ACCESS"
          },
          "condition:{{user_age}} >= 18": {
            id: "basic_adult_result",
            type: "SET",
            variable: "test3_result",
            value: "BASIC_ADULT_ACCESS"
          },
          "default": {
            id: "no_access_result",
            type: "SET",
            variable: "test3_result",
            value: "NO_ACCESS"
          }
        }
      },
      
      // Test 4: Mix of exact match and conditions (SWITCH for exact, CASE for conditions)
      {
        id: "test_mixed_branches",
        type: "SWITCH",
        variable: "status",
        branches: {
          "premium": {
            id: "premium_exact_result",
            type: "SET",
            variable: "test4_result",
            value: "PREMIUM_EXACT_MATCH"
          },
          "default": {
            id: "check_amount_and_verification",
            type: "CASE",
            branches: {
              "condition:{{total_amount}} > 200": {
                id: "high_value_result", 
                type: "SET",
                variable: "test4_result",
                value: "HIGH_VALUE_USER"
              },
              "condition:{{user_verified}}": {
                id: "verified_fallback_result",
                type: "SET",
                variable: "test4_result", 
                value: "VERIFIED_FALLBACK"
              },
              "default": {
                id: "mixed_default_result",
                type: "SET",
                variable: "test4_result",
                value: "MIXED_DEFAULT"
              }
            }
          }
        }
      },
      
      // Display all results
      {
        id: "display_results",
        type: "SET",
        variable: "final_results",
        value: "Test1(exact): {{test1_result}}, Test2(age): {{test2_result}}, Test3(complex): {{test3_result}}, Test4(mixed): {{test4_result}}"
      },
      
      {
        id: "show_results",
        type: "SAY",
        value: "Enhanced SWITCH Test Results:\n{{final_results}}",
        value_es: "Resultados de la prueba SWITCH mejorada:\n{{final_results}}"
      }
    ]
  },

  // Real-world SWITCH example with proper error recovery
  {
    id: "user-access-control-v1.0",
    name: "UserAccessControl",
    version: "1.0.0",
    description: "Demonstrates proper SWITCH default handling with error recovery",
    prompt: "User access control",
    prompt_es: "Control de acceso de usuario",
    
    metadata: {
      author: "system",
      category: "security",
      riskLevel: "medium",
      requiresApproval: false,
      auditRequired: true,
      createdAt: "2025-01-28T00:00:00Z"
    },
    
    variables: {
      user_role: { type: "string", scope: "flow" },
      access_level: { type: "number", scope: "flow" },
      is_verified: { type: "boolean", scope: "flow" }
    },
    
    steps: [
      {
        id: "collect_user_info",
        type: "SAY-GET",
        value: "Enter your role (admin, manager, user, guest):",
        value_es: "Ingrese su rol (admin, manager, user, guest):",
        variable: "user_role"
      },
      {
        id: "set_access_level",
        type: "SET",
        variable: "access_level",
        value: "3"
      },
      {
        id: "set_verification",
        type: "SET",
        variable: "is_verified", 
        value: "true"
      },
      {
        id: "access_control_switch",
        type: "SWITCH",
        variable: "user_role",
        branches: {
          "admin": {
            id: "grant_admin_access",
            type: "SAY",
            value: "🔑 Admin access granted. Full system privileges enabled.",
            value_es: "🔑 Acceso de administrador concedido. Privilegios completos del sistema habilitados."
          },
          "manager": {
            id: "grant_manager_access", 
            type: "SAY",
            value: "👥 Manager access granted. Team management privileges enabled.",
            value_es: "👥 Acceso de gerente concedido. Privilegios de gestión de equipo habilitados."
          },
          "condition:{{user_role}} === 'user' && {{access_level}} >= 2 && {{is_verified}}": {
            id: "grant_verified_user_access",
            type: "SAY",
            value: "✅ Verified user access granted. Standard privileges enabled.",
            value_es: "✅ Acceso de usuario verificado concedido. Privilegios estándar habilitados."
          },
          "user": {
            id: "grant_basic_user_access",
            type: "SAY",
            value: "👤 Basic user access granted. Limited privileges enabled.",
            value_es: "👤 Acceso de usuario básico concedido. Privilegios limitados habilitados."
          },
          "guest": {
            id: "grant_guest_access",
            type: "SAY", 
            value: "🔒 Guest access granted. Read-only privileges enabled.",
            value_es: "🔒 Acceso de invitado concedido. Privilegios de solo lectura habilitados."
          },
          "default": {
            id: "restart_access_control_flow",
            type: "FLOW",
            value: "UserAccessControlRestart",
            callType: "replace"
          }
        }
      }
    ]
  },
  {
    id: "user-access-control-restart-v1.0",
    name: "UserAccessControlRestart",
    version: "1.0.0",
    description: "Shows error message and restarts user access control flow",
    prompt: "Restart access control",
    prompt_es: "Reiniciar control de acceso",
    
    metadata: {
      author: "system",
      category: "testing",
      riskLevel: "low"
    },
    
    steps: [
      {
        id: "invalid-role-message",
        type: "SAY",
        value: "❌ Invalid role '{{user_role}}'. Valid roles are: admin, manager, user, guest.\n\nRestarting access control process...",
        value_es: "❌ Rol inválido '{{user_role}}'. Los roles válidos son: admin, manager, user, guest.\n\nReiniciando el proceso de control de acceso..."
      },
      {
        id: "restart_access_control",
        type: "FLOW",
        value: "UserAccessControl",
        callType: "replace"
      }
    ]
  },

  // === SMART DEFAULT ONFAIL TEST FLOWS ===
  // These flows deliberately have NO onFail handlers to test smart defaults  
  {
    id: "smart-onfail-recoverable-test-v1.0",
    name: "SmartOn503FailRecoverableTest",
    version: "1.0.0",
    description: "Tests smart default onFail for recoverable server errors (should retry)",
    prompt: "Smart 503 recoverable error testing",
    prompt_es: "Pruebas de errores recuperables inteligentes",
    
    // VALIDATION EXPECTATIONS:
    // Purpose: Tests smart default retry logic with predictable 503 Service Unavailable error
    // Test Intent: Validates system correctly identifies recoverable errors and enables retry
    
    metadata: {
      author: "system",
      category: "testing",
      riskLevel: "low"
    },
    
    steps: [
      {
        id: "recoverable-test-intro",
        type: "SAY",
        value: "Testing smart default onFail for recoverable server errors (503)...",
        value_es: "Probando onFail inteligente por defecto para errores de servidor recuperables (503)..."
      },
      {
        id: "failing-network-call",
        type: "CALL-TOOL",
        tool: "Get503Error",
        args: { q: "NonExistentCity12345InvalidForSure" },
        variable: "network_result"
        // NO onFail handler - should trigger smart default (3 retries) then proceed to next step
      },
      {
        id: "after-tool-call",
        type: "SAY",
        value: "Call result: '{{network_result}}' - You should never see this message - system should have retried 3 times and then canceled the flow.",
        value_es: "Resultado de la llamada: '{{network_result}}' - Nunca deberías ver este mensaje - el sistema debería haber reintentado 3 veces y luego cancelado el flujo."
      }
    ]
  },
  
  {
    id: "smart-onfail-unrecoverable-test-v1.0",
    name: "SmartOnFailUnrecoverableTest", 
    version: "1.0.0",
    description: "Tests smart default onFail for invalid argument (amount must be number) unrecoverable client errors (should cancel)",
    prompt: "Smart unrecoverable error testing (amount must be number)",
    prompt_es: "Pruebas de errores irrecuperables inteligentes (cantidad debe ser número)",
    
    // VALIDATION EXPECTATIONS:
    // Purpose: Tests smart default cancel logic with predictable unrecoverable error
    // Test Intent: Validates system correctly identifies unrecoverable errors and cancels
    
    metadata: {
      author: "system",
      category: "testing",
      riskLevel: "high"  // This should trigger special financial error handling
    },
    
    steps: [
      {
        id: "financial-test-intro",
        type: "SAY",
        value: "Testing smart default onFail - expecting error: 'amount must be a number'",
        value_es: "Probando onFail inteligente - esperando error: 'amount must be number'"
      },
      {
        id: "failing-payment-call",
        type: "CALL-TOOL",
        tool: "GeneratePaymentLink",
        args: { accountNumber: "999999", amount: "should be ammount" },
        variable: "payment_result"
        // NO onFail handler - should trigger smart financial error handling
      },
      {
        id: "should-not-reach-here-after-error",
        type: "SAY",
        value: "Call result: '{{payment_result}}' - This message should not appear.",
        value_es: "Resultado de la llamada: '{{payment_result}}' - Este mensaje no debería aparecer."
      }
    ]
  },
  
  {
    id: "smart-onfail-data-test-v1.0",
    name: "SmartOnFailDataTest",
    version: "1.0.0", 
    description: "Tests smart default onFail for data validation errors (no explicit onFail handler)",
    prompt: "Smart data validation testing",
    prompt_es: "Pruebas de validación de datos inteligentes",
    
    // VALIDATION EXPECTATIONS:
    // Expected Warning: Tool "RestApiExample" has no schema for argument validation
    // Purpose: Tests smart default onFail for data validation errors without tool schema
    // Test Intent: Validates data error handling works with flexible argument generation
    
    metadata: {
      author: "system",
      category: "testing",
      riskLevel: "low"
    },
    
    steps: [
      {
        id: "data-test-intro",
        type: "SAY",
        value: "Testing smart default onFail for 'fetch failed' - should fail 3 times then cancel flow",
        value_es: "Probando onFail inteligente por defecto para 'fetch failed' - debería fallar 3 veces y luego cancelar el flujo"
      },
      {
        id: "failing-api-call",
        type: "CALL-TOOL",
        tool: "RestApiExample",
        args: { userId: "999" },  // Invalid user ID
        variable: "api_result"
        // NO onFail handler - should trigger a 404 error with default onFail recovery canceling the flow
      },
      {
        id: "should-not-reach-data",
        type: "SAY",
        value: "Result: '{{api_result}}' - This message should never appear.",
        value_es: "Resultado: '{{api_result}}' - Este mensaje nunca debería aparecer."
      }
    ]
  },
  
  {
    id: "smart-onfail-generic-test-v1.0", 
    name: "SmartOnFailGenericTest",
    version: "1.0.0",
    description: "Tests smart default onFail for generic errors (no explicit onFail handler)",
    prompt: "Smart generic error testing",
    prompt_es: "Pruebas de errores genéricos inteligentes",
    
    // VALIDATION EXPECTATIONS:
    // Expected Warning: Tool "ArrayProcessingExample" has no schema for argument validation
    // Purpose: Tests smart default onFail for generic errors without tool schema
    // Test Intent: Validates generic error handling works with flexible argument generation
    
    metadata: {
      author: "system",
      category: "testing",
      riskLevel: "low"
    },
    
    steps: [
      {
        id: "generic-test-intro",
        type: "SAY",
        value: "Testing smart default onFail for generic errors...",
        value_es: "Probando onFail inteligente por defecto para errores genéricos..."
      },
      {
        id: "failing-generic-call",
        type: "CALL-TOOL",
        tool: "ArrayProcessingExample",
        args: { limit: 1, tags: "invalid_format" },  // Invalid parameters
        variable: "generic_result"
        // NO onFail handler - should trigger smart generic error handling
      },
      {
        id: "should-not-reach-generic",
        type: "SAY",
        value: "This message should not appear if tool failed with unrecoverable error.",
        value_es: "Este mensaje no debería aparecer si la llamada genérica falló con un error irrecuperable."
      }
    ]
  },

  // Test say of globals
  {
    id: "test-say-globals",    
    name: "TestSayGlobals",
    version: "1.0.0",
    description: "Tests SAY step with global variables",
    prompt: "Testing global variables",
    prompt_es: "Probando variables globales",

    metadata: {
      author: "system",
      category: "testing",
      riskLevel: "low"
    },

    steps: [
      {
        id: "say-global-variables",
        type: "SAY",
        value: "Testing global variables {{caller_id}}, {{caller_name}}, {{thread_id}}...",
        value_es: "Probando variables globales {{caller_id}}, {{caller_name}}, {{thread_id}}..."
      }
    ]
  },

  // === SELF-REFERENCING RETRY DEMOS ===
  // Demonstrates elegant retry patterns using user-level variables and conditions  
  {
    id: "simple-self-retry-demo-v1.0",
    name: "SimpleSelfRetryDemo",
    version: "1.0.0",
    description: "Demonstrates simple self-referencing retry with callType replace",
    prompt: "Simple self-retry demonstration",
    prompt_es: "Demostración de auto-reintento simple",
    
    metadata: {
      author: "system",
      category: "demo",
      riskLevel: "low"
    },
    
    variables: {
      userId: { type: "string", scope: "flow" },
      user_data: { type: "object", scope: "flow" }
    },
    
    steps: [
      {
        id: "simple-retry-intro",
        type: "SAY-GET",
        value: "🔄 Simple Self-Retry Demo: Enter a user ID (1-10) to fetch user data:",
        value_es: "🔄 Demo de Auto-Reintento Simple: Ingrese un ID de usuario (1-10) para obtener datos de usuario:",
        variable: "userId"
      },
      {
        id: "attempt-api-call",
        type: "CALL-TOOL",
        tool: "RestApiExample",
        args: {
          userId: "{{userId}}"
        },
        variable: "user_data",
        onFail: {
          id: "simple-self-retry",
          type: "FLOW",
          value: "SimpleSelfRetryDemo",  // Self-reference!
          callType: "replace"
        }
      },
      {
        id: "simple-success-message",
        type: "SAY",
        value: "✅ Success! User: {{user_data.name}} ({{user_data.email}})",
        value_es: "✅ ¡Éxito! Usuario: {{user_data.name}} ({{user_data.email}})"
      }
    ]
  },
  {
    id: "smart-self-retry-demo-v1.0",
    name: "SmartSelfRetryDemo",
    version: "1.0.0",
    description: "Demonstrates self-referencing retry with attempt counter and condition-based limits",
    prompt: "Smart self-retry with attempt counter",
    prompt_es: "Auto-reintento inteligente con contador de intentos",
    
    // VALIDATION EXPECTATIONS:
    // Expected Warning 1: Tool "RestApiExample" has no schema for argument validation
    // Purpose: Tests flexible tool argument generation without strict schema constraints
    // Expected Warning 2: Circular flow reference detected: SmartSelfRetryDemo → SmartSelfRetryDemo
    // Purpose: Tests self-retry loop detection - validates that validator catches circular references
    // Test Intent: Demonstrates validation warning for recursive flow patterns
    
    metadata: {
      author: "system",
      category: "demo",
      riskLevel: "low"
    },
    
    variables: {
      userId: { type: "string", scope: "flow" },
      user_data: { type: "object", scope: "flow" },
      attempt_count: { type: "number", scope: "flow", value: 0 },
      max_attempts: { type: "number", scope: "flow", value: 3 },
    },
    
    steps: [
      {
        id: "increment-attempt-counter",
        type: "SET",
        variable: "attempt_count",
        value: "{{attempt_count + 1}}"
      },
      {
        id: "smart-retry-intro",
        type: "SAY-GET",
        value: "🎯 Smart Self-Retry Demo (Attempt {{attempt_count}}/{{max_attempts}}): Enter a user ID (1-10):",
        value_es: "🎯 Demo de Auto-Reintento Inteligente (Intento {{attempt_count}}/{{max_attempts}}): Ingrese un ID de usuario (1-10):",
        variable: "userId"
      },
      {
        id: "attempt-smart-api-call",
        type: "CALL-TOOL",
        tool: "RestApiExample",
        args: {
          userId: "{{userId}}"
        },
        variable: "user_data",
        onFail: {
          id: "smart-retry-condition",
          type: "CASE",
          branches: {
            "condition:{{attempt_count < max_attempts}}": {
              id: "continue-retrying",
              type: "FLOW",
              value: "SmartSelfRetryDemo",
              callType: "replace"
            },
            "default": {
              id: "max-attempts-reached",
              type: "SAY",
              value: "❌ Maximum attempts ({{max_attempts}}) reached. Unable to fetch user data. Please contact support.",
              value_es: "❌ Máximo de intentos ({{max_attempts}}) alcanzado. No se pueden obtener datos de usuario. Por favor, contacte a soporte."
            }
          }
        }
      },
      {
        id: "smart-success-message",
        type: "SAY",
        value: "🎉 Success on attempt {{attempt_count}}! User: {{user_data.name}} ({{user_data.email}})",
        value_es: "🎉 ¡Éxito en el intento {{attempt_count}}! Usuario: {{user_data.name}} ({{user_data.email}})"
      }
    ]
  },

  // Cryptocurrency Price Flow
  {
    id: 'crypto-price-check',
    name: 'Crypto Price Check',
    prompt: 'Check cryptocurrency prices',
    description: 'Provides current cryptocurrency prices and 24h changes',
    version: '1.0.0',
    metadata: {
      riskLevel: 'low',
      category: 'financial'
    },
    variables: {
      crypto: { type: 'string', scope: 'flow' },
      currency: { type: 'string', scope: 'flow', value: 'usd' }
    },
    steps: [
      {
        id: 'extract-crypto',
        type: 'SET',
        variable: 'crypto',
        value: '{{extractCryptoFromInput({{userInput}})}}'
      },
      {
        id: 'debug-crypto-var',
        type: 'SAY',
        value: 'I will check the price of {{crypto}}'
      },
      {
        id: 'get-crypto-price',
        type: 'CALL-TOOL',
        tool: 'crypto-price-api',
        variable: 'crypto_data',
        args: {
          crypto: '{{crypto}}',
          currency: 'usd'
        }
      },
      {
        id: 'debug-crypto-data',
        type: 'SAY',
        value: 'I found this info: {{crypto_data}}'
      },
      {
        id: 'format-crypto-response',
        type: 'SAY',
        value: '💰 {{crypto_data.crypto_name}} Price is ${{crypto_data.price}} - 24h Change: {{crypto_data.change_24h}}% - Last Updated: {{currentTime()}}'
      }
    ]
  },
];

//Get key from environment variable or configuration
const apiKeys = {
   openai: process.env.OPENAI_API_KEY
};

async function fetchAiResponse(systemInstruction, userMessage) {
  try {
    logger.info(`fetchAiResponse called with system instruction length: ${systemInstruction.length}, user message: "${userMessage}"`);
    
    //logger.warn(`System instruction: "${systemInstruction}"\nUser message: "${userMessage}"`);
    
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKeys.openai}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini-2025-04-14",
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
    const aiResponse = data.choices[0].message.content.trim();
    
    logger.debug(`fetchAiResponse completed, response length: ${aiResponse.length}`);
    return aiResponse;
    
  } catch (error) {
    logger.error(`fetchAiResponse error: ${error.message}`);
    throw new Error(`AI communication failed: ${error.message}`);
  }
}

async function handleQuery(context, input, chatContextManager) {

  // Create ContextEntry for user input
  const contextEntry = {
    role: 'user',
    content: input,
    timestamp: Date.now()
  };
  
  // Forward the input to the engine for conditional processing
  const result = await engine.updateActivity(contextEntry, context.sessionContext);
  if (result) {
    // Intent detected and handled, no need to proceed to normal reply generation
    return result;
  }

  // Call your normal Generate reply process as usual
  const reply = await yourConversationalReply(input);

  // Update the engine's context with the generated reply
  context.engine.updateActivity({
    role: 'assistant',
      content: reply,
      timestamp: Date.now()
    }, 
    context.sessionContext
  );

  return reply;
}

// Mock implementation - you will replace this with your actual conversational reply logic
async function yourConversationalReply(input) {      
  return `You said: "${input}". This is a mock reply.`;
}

const context = { userIdl: "<user@example.com>", caller_id: "(818)555-1212", thread_id: "test-thread-123" };
const chatContextManager = {};

// Fake global variables to share with the engine
const globalVariable = {
  caller_id: context.caller_id,
  caller_name: "Test User",
  thread_id: context.thread_id
};

// === INTERACTIVE SIMULATION WITH ENHANCED FEATURES ===
async function simulateLocalChat(simulatedInputs = null, language = 'en') {
  try {
      
    if (simulatedInputs) {
      console.log("\n🧪 Enhanced Workflow Engine - Test Simulation Mode");
      console.log("Session ID:", engine.sessionId);
      console.log(`Running ${simulatedInputs.length} simulated inputs...`);
      console.log("\n" + "=".repeat(60));
    } else {
      console.log("\n🚀 Enhanced Workflow Engine - Interactive Simulation");
      console.log("Session ID:", engine.sessionId);
      console.log("\nTry these commands:");
      console.log("• 'I need to make a payment'");
      console.log("• 'What's the weather in London?'");
      console.log("• 'exit' or 'quit' to end");
      console.log("\nPress Ctrl+C to force exit\n");
    }
    
    let rl = null;
    let inputIndex = 0;
    
    // Only set up readline for interactive mode
    if (!simulatedInputs) {
      const readline = await import('readline');
      rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      rl.on('SIGINT', () => {
        console.log('\n\n🛑 Received SIGINT. Ending session...');
        console.log(`Session duration: ${Date.now() - engine.createdAt.getTime()}ms`);
        rl.close();
        process.exit(0);
      });
    }
    
    function getUserInput(prompt) {
      if (simulatedInputs) {
        // Simulation mode - return next input from array
        if (inputIndex >= simulatedInputs.length) {
          return Promise.resolve('exit'); // Auto-exit when all inputs processed
        }
        const input = simulatedInputs[inputIndex++];

        if (typeof input !== 'string') {
          input = "EXIT";
        }

        console.info(`${prompt}${input} [SIMULATED]`);
        return Promise.resolve(input);
      } else {
        // Interactive mode
        return new Promise((resolve) => {
          rl.question(prompt, (answer) => {
            resolve(answer);
          });
        });
      }
    }
    
    let interactionCount = 0;
    
    while (true) {
      try {
        const userInput = await getUserInput("\nYou: ");
        interactionCount++;
        
        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
          console.log("\n👋 Ending simulation. Session summary:");
          console.log(`Interactions: ${interactionCount}`);
          console.log(`Session duration: ${Date.now() - engine.createdAt.getTime()}ms`);
          if (simulatedInputs) {
            console.log(`Simulated inputs processed: ${inputIndex}/${simulatedInputs.length}`);
          }
          
          // Check for pending flows - warn if test left engine in incomplete state
          if (engine.getCurrentStackLength() > 0) {
            const currentFlowFrame = engine.getCurrentFlowFrame();
            console.log(`\n⚠️  WARNING: Test ended with pending flow!`);
            console.log(`   Active flow: ${currentFlowFrame.flowName}`);
            console.log(`   Steps remaining: ${currentFlowFrame.flowStepsStack.length}`);
            console.log(`   Stack depth: ${engine.getCurrentStackLength()}`);
            console.log(`   🛠️  Consider adding inputs to complete the flow or 'cancel' to exit cleanly`);
          }
          
          break;
        }
        
        const startTime = Date.now();
        const userId = `user_${Math.random().toString(36).substr(2, 8)}`;
        
        // Only if debug command line argument is set
        if (process.argv.includes('--debug')) {
          console.log(`\n🔍 Debug Mode: Processing input "${userInput}" for user ID ${userId}`);
        }
        
        const response = await handleQuery(context, userInput, chatContextManager, userId);
        const processingTime = Date.now() - startTime;
        
        console.log(`\n🤖 AI: ${response}`);


        // Only if debug command line argument is set
        if (process.argv.includes('--debug')) {
          console.log(`⏱️  Processing time: ${processingTime}ms`);
          // Show current flow state for debugging
          if (engine.getCurrentStackLength() > 0) {
            const currentFlowFrame = engine.getCurrentFlowFrame();
            console.log(`\n📊 Flow State:`);
            console.log(`   Current: ${currentFlowFrame.flowName} (${currentFlowFrame.flowVersion})`);
            console.log(`   Steps remaining: ${currentFlowFrame.flowStepsStack.length}`);
            console.log(`   Transaction: ${currentFlowFrame.transaction.id.slice(0, 8)}`);
            console.log(`   Stack depth: ${engine.getCurrentStackLength()}`);
            console.log(`   Active stack: ${engine.flowStacks.length - 1}`);
          } else {
            console.log(`\n📊 No active flows`);
          }
          
          console.log(); // Empty line for readability
        }
        
      } catch (error) {
        console.error(`\n❌ Error processing input: ${error.message}`);
        console.error(error.stack);
        console.log("Please try again.\n");
        
        // Clear stuck flows on error
        if (getCurrentStack(engine)) {
          console.log("🧹 Clearing stuck flows due to error...");
          initializeFlowStacks(engine);
        }
      }
    }
    
    if (rl) {
      rl.close();
    }
  } catch (error) {
    console.error(`\n❌ Critical error in simulation: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// === TEST SCENARIOS ===
const TEST_SCENARIOS = {
  // Test the response mapping with weather
  weatherMappingTest: [
    'What\'s the weather in London?',
    'London',
  ],
  
  // Test payment workflow end-to-end  
  paymentWorkflowTest: [
    'I need to make a payment',
    '123456',
    '50.00',
  ],
  
  // Test weather in multiple cities
  multiWeatherTest: [
    'What\'s the weather in New York?',
    'New York',
    'What\'s the weather in Tokyo?',
    'Tokyo', 
    'What\'s the weather in London?',
    'London',
  ],
  
  // Test payment workflow with different amounts
  multiPaymentTest: [
    'I need to make a payment',
    '123456',
    '25.50',
    'I want to make another payment',
    '123456', 
    '100.00',
  ],
  
  // Test invalid account workflow
  invalidAccountTest: [
    'I need to make a payment',
    '999999',  // Invalid account
    'cancel',  // Exit the failed verification flow
  ],
  
  // Test workflow interruption and recovery
  interruptionTest: [
    'I need to make a payment',
    '123456',
    'cancel',  // Should exit flow
    'What\'s the weather in Paris?',
    'Paris',
  ],
  
  // === FOCUSED CATEGORY TESTS ===
  
  // Core Business Flows
  businessFlowsTest: [
    'What\'s the weather in Tokyo?',
    'Tokyo',
    'I need to make a payment', 
    '123456',
    '99.99',
  ],
  
  // Crypto Price Workflow
  cryptoPriceTest: [
    'What\'s the current Bitcoin price?',
  ],
  
  // API Integration & Tools  
  apiIntegrationTest: [
    'I want to test REST API functionality',
    '1',  // JSON API test
  ],
  
  // Response Mapping System
  responseMappingTest: [
    'I want to test response mapping',
    '1',  // JSONPath mapping
  ],
  
  // HTTP Tools Suite - Test all API types
  httpToolsTest: [
    'API testing suite',
    '1',  // JSON API test
    'API testing suite', 
    '2',  // Form Data test
    'API testing suite',
    '3',  // XML/SOAP test
  ],
  
  // Enhanced SWITCH Conditions
  switchConditionsTest: [
    'Enhanced SWITCH with Condition Support Test',
  ],
  
  // Test problematic scenario specifically
  problemScenarioTest: [
    'I want to test REST API functionality',
    '999',  // Invalid choice, should restart flow
    '1',    // Should continue with restarted flow, NOT start payment flow
  ],
    
  // Account Verification Failures
  accountVerificationTest: [
    'I need to make a payment',
    '999999',  // Invalid account to trigger VerifyAccountFailed
    '123456',  // Valid account for retry  
    '50.00',
  ],
  
  // Test Menu & Navigation
  navigationTest: [
    'Show me the test menu',
    'TestMenu',
  ],
  
  // Test 9: CallType Demonstrations
  callTypeDemoTest: [
    'CallTypeDemo',
    '1',  // Test 'call' option (changed from '2' due to flow lookup issue)
  ],
  
  // Test 10: REST API Demo
  restApiDemoTest: [
    'RestApiDemo',
    '7',  // Test with user ID 7
  ],
  
  // User Access Control
  accessControlTest: [
    'UserAccessControl',
    'admin',  // Test admin access
    'UserAccessControl',
    'invalid_role',  // Test invalid role with retry
    'manager',  // Test manager access after retry
    'exit'
  ],
  
  // Critical Error Recovery
  errorRecoveryTest: [
    'CriticalErrorRecovery',
  ],
  
  // === FLOW RESUMPTION AND SAY/SAY-GET PATTERN TEST ===
  flowResumptionTest: [
    // Start a payment flow and get interrupted by weather request
    'I need to make a payment',     // Starts MakePayment -> VerifyAccount
    // At this point, we should see SAY-GET: "Please enter your account number (6-12 digits)"
    
    'What\'s the weather in Paris?', // Strong intent interruption (should save VerifyAccount progress) 
    // At this point, we should see "Your previous progress has been saved" message
    
    'Paris',                        // Complete the weather flow
    // After weather completes, should auto-resume VerifyAccount asking for account number
    
    '123456',                       // Complete account verification
    // Should continue with payment amount request
    
    '75.50',                        // Complete payment
    // Should generate payment link and finish
  ],
  
  // Test all response mapping types
  mappingTypesTest: [
    'I want to test response mapping',
    '1',  // JSONPath mapping  
    'I want to test response mapping',
    '2',  // Array processing
    'I want to test response mapping', 
    '3',  // Template formatting
    'I want to test response mapping',
    '4',  // Comprehensive mapping
  ],

  // Test critical system flows
  systemFlowsTest: [
    'TestMenu',
    'CallTypeDemo', 
    'invalid',  // Should trigger error handling
    'CriticalErrorRecovery',
  ],
  
  // === SMART DEFAULT ONFAIL TEST ===
  // Test smart default onFail handling for tools without explicit onFail handlers
  smartOnFailTest: [
    // Test 1: Recoverable server error (should trigger retry logic)
    'Smart 503 Recovery should try and fail 3 times then cancel', // This will trigger the 503 server error
    
    // Test 2: Unrecoverable client error (should trigger cancel logic)
    'Smart On Fail Unrecoverable (amount must be number) Test should fail once and cancel', // This will trigger 'amount must be number' error

    // Test 3: Data validation error (should show smart validation error message)
    'Smart data validation testing - should try and fail once (HTTP 404) then cancel', // This will trigger the 'fetch failed' error

    // Test 4: Generic error handling (should show smart generic error message)
    'Smart generic error resting - should try and fail 3 times (fetch failed) then cancel', // This will trigger the generic error
  ],

  templateDebugTest: [
    'I want to test REST API functionality',
    '5',
  ],

  switchBranchingTest: [
    'I want to test REST API functionality',
    '1',  // Valid user ID  
    'I want to test REST API functionality', 
    '2',  // Valid user ID
    'I want to test REST API functionality',
    '3',  // Valid user ID
    'I want to test REST API functionality',
    '999', // Invalid user ID - test default branch
    'cancel' // Exit the retry flow
  ],

  enhancedSwitchConditionTest: [
    'enhanced-switch-condition-test',
    'cancel' // Exit any remaining flow from interruption
  ],
  
  // === FLOW FRAME INTEGRITY TEST ===

  // Specifically designed to test flow stack preservation under various conditions
  flowFrameIntegrityTest: [
    // Test 1: Normal nested flow completion
    'I need to make a payment',
    '123456',
    '50.00',
    
    // Test 2: Flow interruption and recovery  
    'What\'s the weather in Tokyo?',
    'Tokyo',
    
    // Test 3: Invalid input during active flow (should preserve context)
    'I need to make a payment',
    '123456',
    'invalid_amount_xyz', // This should trigger error but preserve flow
    '75.00', // This should continue the flow
    
    // Test 4: Rapid flow switching
    'What\'s the weather in London?',
    'London',
    'I need to make a payment',
    '123456',
    '100.00',
    
    // Test 5: Flow termination and new flow initiation
    'What\'s the weather in Paris?',
    'Paris',    
    'cancel' // Exit any remaining flows
  ],
  
  // === ENHANCED FLOW INTERRUPTION TEST ===
  // Test the flow interruption and resumption system
  enhancedFlowInterruptionTest: [
    // Start a payment flow
    'I need to make a payment',
    '123456',
    
    // Interrupt with weather request
    'What\'s the weather in Tokyo?',
    'Tokyo',   // Provide city name to complete weather flow
    
    // Should resume payment flow, complete it
    '50.00',  // Continue with payment after weather interruption
    
    // Test 4: Start new payment flow
    'I need to make a payment',
    '123456',
    
    // Test help command during payment
    'help',
    '75.00',  // Continue with payment after help
    
    // Test simple weather flow
    'What\'s the weather in London?',
    'London',    
    'cancel' // Exit any remaining flows
  ],
  
  // === FLOW CONTROL COMMANDS TEST ===
  // Test all universal flow control commands
  flowControlCommandsTest: [
    // Test cancel command
    'I need to make a payment',
    '123456',
    'cancel',
    
    // Test help command
    'What\'s the weather in Paris?',
    'help',
    'Paris',  // Continue after help
    
    // Test status command during active flow
    'What\'s the weather in Tokyo?',
    'status',  // Check status during flow
    'Tokyo',   // Continue after status
    
    // Test start over command during active flow
    'What\'s the weather in London?',
    'cancel',  // Test restart    
  ],

  // === BUG FIX VALIDATION TESTS ===
  // These tests validate the specific issues we identified and fixed
  
  // SWITCH Default Branch Fix
  switchDefaultBranchTest: [
    'CallTypeDemo',
    'invalid_input',  // Should trigger default branch with user-friendly message
    '1',              // Valid choice after error
  ],
  
  // RestApiExample Parameter Validation Fix  
  restApiParameterTest: [
    'RestApiDemo',
    '1',        // Valid user ID - should use template interpolation correctly
  ],
  
  // Improved Error Messages Test
  improvedErrorMessagesTest: [
    // Test user-friendly SWITCH error
    'CallTypeDemo',
    'continue',       // Invalid input should show friendly message with options
    '2',              // Valid choice after error
    
    // Test data validation error message improvement
    'SmartOnFailDataTest',
    'continue',       // Should show improved data validation message    
  ],
  
  // Smart OnFail Default Branch Test
  smartOnFailSwitchTest: [
    'SmartOnFailNetworkTest',
    'continue',       // Challanging AI detection - Should be ignored
  ],
  
  // API Tools Parameter Interpolation Test
  apiToolsParameterTest: [
    // Test that RestApiExample uses variables correctly
    'I want to test REST API functionality',
    '1',              // JSON API test - should work with proper parameters
    'RestApiDemo',
    '5',              // Test with user ID 5 - should interpolate correctly
  ],
  
  // Internationalized Error Messages Test  
  internationalizedErrorTest: [
    'CallTypeDemo',
    'trigger_switch_error', // This should cause a SWITCH error with no matching branch
  ],
  
  // Payment Tool Failure Context Test
  paymentToolFailureTest: [
    'I need to make a payment',
    '123456',         // Valid account - should proceed to payment amount
    'invalid_amount', // Invalid amount - should trigger payment tool failure  
    'cancel'          // Exit the retry flow
  ],

  // Enhanced Payment Retry Demonstration - Shows progressive retry behavior
  enhancedPaymentRetryTest: [
    'I need to make a payment',
    '123456',         // Valid account number
    'bad_format',     // First failure - should trigger retry with helpful message
    '50.00',          // Valid amount - should succeed after retry
    'cancel'          // Exit any remaining flows cleanly
  ],

  // === SELF-REFERENCING RETRY DEMO TESTS ===
  
  // Test simple self-retry pattern
  simpleSelfRetryTest: [
    'Simple self-retry demonstration',
    '999',  // Invalid user ID - should trigger self-retry
    '1',    // Valid user ID - should succeed
    'cancel' // Complete the interrupted payment flow cleanly
  ],
  
  // Test smart self-retry with attempt counter
  smartSelfRetryTest: [
    'Smart self-retry with attempt counter',
    '999',  // Invalid user ID - attempt 1
    '888',  // Invalid user ID - attempt 2
    'cancel' // Complete the flow cleanly
  ],
  
  // Test smart self-retry reaching max attempts
  smartSelfRetryMaxTest: [
    'Smart self-retry with attempt counter',
    '999',  // Invalid user ID - attempt 1
    '888',  // Invalid user ID - attempt 2
    '777',  // Invalid user ID - attempt 3
    'baduser666',  // Invalid - should reach max attempts and stop
  ],
  
  // NOTE: Advanced self-retry tests removed - they were redundant as the "backoff strategies" 
  // feature was never implemented and these tests fell back to SmartSelfRetryDemo anyway.
};

// Run specific test scenario
async function runTestScenario(scenarioName, language = 'en') {
  const scenario = TEST_SCENARIOS[scenarioName];
  if (!scenario) {
    console.error(`❌ Unknown test scenario: ${scenarioName}`);
    console.log(`Available scenarios: ${Object.keys(TEST_SCENARIOS).join(', ')}`);
    return;
  }
  
  console.log(`\n🧪 Running test scenario: ${scenarioName} in ${language}`);
  console.log(`📝 Inputs (${scenario.length}): ${scenario.join(' → ')}`);
  
  try {
    await simulateLocalChat(scenario, language);
    console.log(`\n✅ Test scenario '${scenarioName}' completed successfully!`);
  } catch (error) {
    console.error(`\n❌ Test scenario '${scenarioName}' failed:`, error.message);
  }
}

// Run all test scenarios sequentially
async function runAllTestScenarios(language = 'en') {
  const allScenarios = Object.keys(TEST_SCENARIOS);
  const totalScenarios = allScenarios.length;
  
  console.log(`\n🚀 Running ALL test scenarios (${totalScenarios} total) in ${language}`);
  console.log("=".repeat(80));

  let passed = 0;
  let failed = 0;
  const failedScenarios = [];
  
  for (let i = 0; i < allScenarios.length; i++) {
    const scenarioName = allScenarios[i];
    const scenario = TEST_SCENARIOS[scenarioName];
    
    console.log(`\n[${i + 1}/${totalScenarios}] 🧪 Running: ${scenarioName}`);
    console.log(`📝 Inputs: ${scenario.slice(0, Math.min(3, scenario.length - 1)).join(' → ')}${scenario.length > 4 ? '...' : ''}`);
    
    try {
      await simulateLocalChat(scenario, language);
      console.log(`✅ [${i + 1}/${totalScenarios}] ${scenarioName} - PASSED`);
      passed++;
    } catch (error) {
      console.error(`❌ [${i + 1}/${totalScenarios}] ${scenarioName} - FAILED: ${error.message}`);
      failed++;
      failedScenarios.push(scenarioName);
    }
    
    // Add a small delay between tests to prevent overwhelming the system
    if (i < allScenarios.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log(`🏁 ALL TESTS COMPLETED - Results Summary:`);
  console.log(`✅ Passed: ${passed}/${totalScenarios}`);
  console.log(`❌ Failed: ${failed}/${totalScenarios}`);
  
  if (failedScenarios.length > 0) {
    console.log(`\n🔍 Failed scenarios:`);
    failedScenarios.forEach(scenario => console.log(`   - ${scenario}`));
  }
  
  console.log(`\n📊 Success rate: ${((passed / totalScenarios) * 100).toFixed(1)}%`);
}

// Parse command line arguments using standard flag-based approach
function parseArgs(args) {
  const parsed = {
    test: null,
    lang: 'en',
    list: false,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--test':
      case '-t':
        if (i + 1 < args.length) {
          parsed.test = args[++i];
        } else {
          console.error('❌ Error: --test requires a test name or "all"');
          process.exit(1);
        }
        break;
        
      case '--lang':
      case '--language':
      case '-l':
        if (i + 1 < args.length) {
          parsed.lang = args[++i];
        } else {
          console.error('❌ Error: --lang requires a language code (e.g., "en", "es")');
          process.exit(1);
        }
        break;
        
      case '--list':
        parsed.list = true;
        break;
        
      case '--help':
      case '-h':
        parsed.help = true;
        break;
        
      default:
        console.error(`❌ Error: Unknown argument "${arg}"`);
        console.error('💡 Use --help for usage information');
        process.exit(1);
    }
  }
  
  return parsed;
}

function showHelp() {
  console.log('\n🧪 Enhanced Workflow Engine Test Suite');
  console.log('=====================================\n');
  
  console.log('📖 USAGE:');
  console.log('  node test-jsfe.js [OPTIONS]\n');
  
  console.log('🚩 OPTIONS:');
  console.log('  --test, -t <name|all>     Run specific test scenario or all tests');
  console.log('  --lang, -l <code>         Set language (en, es, etc.) [default: en]');
  console.log('  --list                    List all available test scenarios');
  console.log('  --help, -h                Show this help message\n');
  
  console.log('📝 EXAMPLES:');
  console.log('  node test-jsfe.js                           # Interactive mode');
  console.log('  node test-jsfe.js --test all                # Run all tests');
  console.log('  node test-jsfe.js --test weatherMappingTest # Run specific test');
  console.log('  node test-jsfe.js --test all --lang es      # Run all tests in Spanish');
  console.log('  node test-jsfe.js --list                    # List available tests');
  console.log('  node test-jsfe.js --test paymentWorkflowTest --lang es # Specific test in Spanish\n');
}

let engine = null;

function listTests() {
  console.log('\n📋 Available Test Scenarios:');
  console.log('============================\n');
  
  console.log('🎯 INDIVIDUAL TEST SCENARIOS:');
  Object.keys(TEST_SCENARIOS).forEach((name, index) => {
    const scenario = TEST_SCENARIOS[name];
    const previewInputs = scenario.slice(0, Math.min(2, scenario.length - 1)).join(' → ');
    console.log(`${(index + 1).toString().padStart(2)}. ${name.padEnd(30)} - ${previewInputs}${scenario.length > 3 ? '...' : ''}`);
  });
  
  console.log('\nSUMMARY:');
  console.log(`• Total scenarios available: ${Object.keys(TEST_SCENARIOS).length}`);
  console.log('• Use --test <scenario-name> to run a specific test');
  console.log('• Use --test all to run all tests sequentially\n');
}

// Check command line arguments for test mode


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

if (typeof process !== 'undefined' && process.argv) {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    const parsed = parseArgs(args);

    if (parsed.help) {
      showHelp();
      process.exit(0);
    }

    if (parsed.list) {
      listTests();
      process.exit(0);
    }

    engine = new WorkflowEngine(logger, fetchAiResponse, flowsMenu, toolsRegistry, APPROVED_FUNCTIONS, globalVariable, true, parsed.lang);
    context.engine = engine;

    // Initialize session context for testing
    context.sessionContext = engine.initSession(logger, 'test-user', 'test-session');

    if (parsed.test) {
      if (parsed.test === 'all') {
        // Run all test scenarios
        runAllTestScenarios(parsed.lang).catch(err => {
          console.error("❌ All tests execution failed:", err);
          process.exit(1);
        });
      } else {
        // Run specific test scenario
        if (!TEST_SCENARIOS[parsed.test]) {
          console.error(`❌ Error: Unknown test scenario "${parsed.test}"`);
          console.error('💡 Use --list to see available test scenarios');
          process.exit(1);
        }

        runTestScenario(parsed.test, parsed.lang).catch(err => {
          console.error("❌ Test execution failed:", err);
          process.exit(1);
        });
      }
    } else {
      // No test specified, start interactive mode supporting selected language
      console.log(`🚀 Starting interactive mode for language: ${parsed.lang}\n`);
      simulateLocalChat(null, parsed.lang).catch(err => {
        console.error("❌ Fatal error during simulation:", err);
        process.exit(1);
      });
    }
  } else {
    // Persist flowsMenu and toolsRegistry to tests.flow and tests.tools before engine instantiation
    try {
      fs.writeFileSync(path.resolve(__dirname, 'tests.flow'), JSON.stringify(flowsMenu, null, 2), 'utf8');
      fs.writeFileSync(path.resolve(__dirname, 'tests.tools'), JSON.stringify(toolsRegistry, null, 2), 'utf8');
      console.log('✅ Persisted flowsMenu and toolsRegistry to tests.flow and tests.tools');
    } catch (err) {
      console.error('❌ Failed to persist flows/tools:', err);
    }
    
    engine = new WorkflowEngine(logger, fetchAiResponse, flowsMenu, toolsRegistry, APPROVED_FUNCTIONS, "en", null, null, true, globalVariable );
    context.engine = engine;

    // Initialize session context for interactive mode
    context.sessionContext = engine.initSession ? engine.initSession(logger, 'interactive-user', 'interactive-session') : null;

    // No test specified, start interactive mode
    console.log('🚀 Starting interactive mode...\n');
    simulateLocalChat().catch(err => {
      console.error("❌ Fatal error during simulation:", err);
      process.exit(1);
    });
  }
} else {
  // Not in Node.js environment or no process.argv
  console.log('Module loaded successfully. Use runTestScenario() or simulateLocalChat() to start.');
}
