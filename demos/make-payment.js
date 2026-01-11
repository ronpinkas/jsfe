/*
Instructions about scripting in this file:

SAY and SAY-GET Steps should use value and value_es for English and Spanish versions of the text.
The value and value_es of SAY and SAY-GET message is a sting template that can reference valid JavaScript expressions in double curly braces {{}}.
Escape (\) in strings literls (SAY/SAY-GET) do NOT require double escaping, except when inside {{}} because those are deffered expressions.
Similarly, escape sequences in expressions of RETURN/SET steps require double escaping because ALL expressions are deffered evaluations.
SET and RETURN steps excepect a value({{}} not required) and are expected to be valid JavaScript expressions.
SET steps can't use cargo.<property> as the variable directly but the assignment value can set cargo properties in the expression.
FLOW steps expect a flow name but may use {{}} to compute the flow name dynamically.
*/


/* Search and Replace '...' with your actual API end points, keys and secrets before running! */

import { WorkflowEngine } from '../dist/index.js';
//import { WorkflowEngine } from "jsfe";

import readline from "node:readline/promises";

import winston from 'winston';

const logger = winston.createLogger({
   level: process.env.LOG_LEVEL || 'warn',  // Enable debug logging to trace validation
   format: winston.format.printf(({ level, message }) => {
      return `${level}: ${message}`;
   }),
   transports: [
      new winston.transports.Console()
   ]
});

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

import crypto from "node:crypto";

import twilio from "twilio";
const TWILIO_AUTH_TOKEN = '...';
const TWILIO_ACCOUNT_SID = '...';

import nodemailer from "nodemailer";
const SMTP_HOST = "..."
const SMTP_PORT = 465
const SMTP_USER = "mailer@instantaiguru.com"
const SMTP_PASSWORD = "..."

const config = { dbPrefix: 'myaccount.icuracao.com' };

// Google API Key - used for both Generative AI and Maps Geocoding
const SEARCH_API_KEY = '...';

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

function validatePhone(phone) {
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

function validateEmail(email) {
   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
   return emailRegex.test(email);
}

function normalizeAndFindCapture(userInput, patterns) {
   if (!patterns || !Array.isArray(patterns)) return null;

   for (const pattern of patterns) {
      try {
         let val = userInput;
         // Apply normalizer first if present
         if (pattern.normalizer) {
            val = val.replace(new RegExp(pattern.normalizer, 'g'), '');
         }

         const regex = new RegExp(pattern.regex);
         if (regex.test(val)) {
            return { variable: pattern.variable, value: val };
         }
      } catch (e) {
         logger.warn(`Invalid regex in capture pattern: ${e.message}`);
      }
   }
   return null;
}

// Send email using our smtp server
async function sendEmail(to, cc, subject, body) {
   try {
      const transporter = nodemailer.createTransport({
         host: SMTP_HOST,
         port: SMTP_PORT,
         secure: true,
         auth: {
            user: SMTP_USER,
            pass: SMTP_PASSWORD
         }
      });

      const mailOptions = {
         from: '"instantAIguru" <mailer@instantaiguru.com>',
         to: to,
         subject: subject,
         text: body
      };
      if (cc) {
         mailOptions.cc = cc;
      }

      const info = await transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully: ${info.messageId} to ${to}`);
   } catch (error) {
      logger.error(`Error sending email: ${error}`);
      throw new Error(`Failed to send email: ${error.message}`);
   }
}

// Use same logic as in sendSMSOTP()
async function sendEmailOTP(to, container) {
   try {
      // Generate a 6-digit OTP
      const otp = crypto.randomInt(100000, 999999).toString();

      // Hash the OTP for storage
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

      // Store the hash and timestamp in the container
      container.otpHash = otpHash;
      container.otpTimestamp = Date.now();

      const domain = config.dbPrefix;
      const subject = `Your OTP Code for ${domain}`;
      const body = `Your One-Time Password (OTP) is: ${otp}\n\n`;

      await sendEmail(to, null, subject, body);
   } catch (error) {
      logger.error(`Error generating OTP for email ${to}:`, error);
      throw new Error(`Failed to generate OTP: ${error.message}`);
   }
}

// Send SMS using Twilio
async function sendTwilioSMS(accountSid, from, to, reply, messageSid = '') {
   const twilioClient = twilio(accountSid, TWILIO_AUTH_TOKEN);

   try {
      const sentMessage = await twilioClient.messages.create({
         body: reply,
         from: from,
         to: to,
      });
      logger.info(`Twilio SMS reply to message SID ${messageSid} sent: ${sentMessage.sid}`);
      return sentMessage.status
   } catch (error) {
      logger.error(`Error sending Twilio SMS reply to message SID ${messageSid}:`, error);
      throw new Error(`Failed to send Twilio SMS reply: ${error.message}`);
   }
}

// Generate a 6-digit OTP and send via SMS, return hash for persistence
async function sendSMSOTP(accountSid, from, to, container) {
   try {
      logger.info(`accountSid: ${accountSid}, from: ${from}, to: ${to} container: ${JSON.stringify(container)}`);

      // Use default Account SID if not provided (for non-SMS initiated requests)
      const effectiveAccountSid = accountSid || TWILIO_ACCOUNT_SID;

      // Generate a 6-digit OTP
      const otp = crypto.randomInt(100000, 999999).toString();

      // Hash the OTP for storage
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

      // Store the hash and timestamp in the container
      container.otpHash = otpHash;
      container.otpTimestamp = Date.now();

      // Send SMS with OTP
      const smsMessage = `Your verification code is: ${otp}. This code will expire in 10 minutes.`;
      await sendTwilioSMS(effectiveAccountSid, from, to, smsMessage, 'OTP');

      logger.info(`OTP sent to ${to} using AccountSid ${effectiveAccountSid}, hash stored in container`);
      return otpHash;
   } catch (error) {
      logger.error(`Error sending SMS OTP: ${error.message}`);
      throw error;
   }
}

// Validate OTP against stored hash with 10-minute expiration
async function validateOTP(otp, container) {
   try {
      // Check if OTP hash exists
      if (!container.otpHash || !container.otpTimestamp) {
         logger.warn(`No OTP found`);
         return false;
      }

      // Check if OTP has expired (10 minutes = 600000 milliseconds)
      const now = Date.now();
      const otpAge = now - container.otpTimestamp;
      const OTP_EXPIRY_TIME = 10 * 60 * 1000; // 10 minutes

      if (otpAge > OTP_EXPIRY_TIME) {
         logger.warn(`OTP expired`);
         // Clear expired OTP
         container.otpHash = null;
         container.otpTimestamp = null;
         container.otpVerified = false;
         return false;
      }

      // Hash the provided OTP and compare
      const providedOtpHash = crypto.createHash('sha256').update(otp.toString()).digest('hex');
      const isValid = providedOtpHash === container.otpHash;

      if (isValid) {
         logger.info(`OTP validated successfully`);
         // Clear the OTP after successful validation
         container.otpHash = null;
         container.otpTimestamp = null;
         // Set verified flag for downstream flows (e.g., Shopify order lookup)
         container.otpVerified = true;
         container.otpVerifiedAt = Date.now();
      } else {
         logger.warn(`Invalid OTP: ${otp}`);
      }

      return isValid;
   } catch (error) {
      logger.error(`Error validating OTP: ${error.message}`);
      throw error;
   }
}

// Geocoding with retry logic using Google Maps API
async function geocodeCity(city, retryCount = 0) {
   const MAX_RETRIES = 2;
   const GOOGLE_MAPS_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

   try {
      const geocodeUrl = `${GOOGLE_MAPS_URL}?address=${encodeURIComponent(city)}&key=${SEARCH_API_KEY}`;
      const response = await fetch(geocodeUrl, {
         signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (response.ok) {
         const data = await response.json();
         if (data.status === 'OK' && data.results && data.results.length > 0) {
            const location = data.results[0].geometry.location;
            const result = {
               lat: location.lat,
               lon: location.lng,
               source: 'google'
            };
            logger.info(`Geocoded ${city} via Google Maps: (${result.lat}, ${result.lon})`);
            return result;
         }
         logger.warn(`Google Maps failed for ${city}, status: ${data.status}`);
      } else {
         logger.warn(`Google Maps HTTP error for ${city}, status: ${response.status}`);
      }

      // Retry logic with exponential backoff
      if (retryCount < MAX_RETRIES) {
         const backoffMs = Math.pow(2, retryCount) * 1000;
         logger.info(`Retrying geocode for ${city} after ${backoffMs}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
         await new Promise(resolve => setTimeout(resolve, backoffMs));
         return geocodeCity(city, retryCount + 1);
      }

      throw new Error(`Could not geocode city: ${city} after ${MAX_RETRIES} retries`);

   } catch (error) {
      logger.error(`Geocoding failed for ${city}: ${error.message}`);
      throw error;
   }
}

// Find the closest location based on city
// Generic proximity utility that works with any location list containing lat/lon coordinates
async function findClosestLocation(city, locations) {
   try {
      logger.info(`Finding closest location for city: ${city}`);

      // Use production-grade geocoding with caching, rate limiting, and fallbacks
      const geocodeResult = await geocodeCity(city);
      const originLat = geocodeResult.lat;
      const originLon = geocodeResult.lon;

      logger.info(`Origin location: ${city} (${originLat}, ${originLon})`);

      // Calculate distances to all locations using pre-calculated coordinates
      const locationsWithDistances = locations.map(location => {
         // Validate that location has coordinates
         if (!location.lat || !location.lon) {
            logger.warn(`Location ${location.city} missing coordinates, skipping`);
            return null;
         }

         // Calculate distance using Haversine formula
         const distance = calculateDistance(originLat, originLon, location.lat, location.lon);

         logger.info(`Location ${location.city}: (${location.lat}, ${location.lon}) - ${distance.toFixed(1)} miles`);

         return {
            ...location,
            distance: distance
         };
      }).filter(location => location !== null);

      if (locationsWithDistances.length === 0) {
         throw new Error('No locations with valid coordinates found');
      }

      // Sort by distance and return closest
      locationsWithDistances.sort((a, b) => a.distance - b.distance);
      const closestLocation = locationsWithDistances[0];

      logger.info(`Found closest location: ${closestLocation.city} at distance ${closestLocation.distance.toFixed(1)} miles`);

      // Return generic result structure
      return {
         store: {
            name: closestLocation.name || `Location - ${closestLocation.city}`,
            address: closestLocation.address,
            city: closestLocation.city,
            state: closestLocation.state,
            phone: closestLocation.phone || "(800) 555-0123"
         },
         distance: closestLocation.distance.toFixed(1),
         directions: `From ${city}, head towards ${closestLocation.city}. The location is at ${closestLocation.address}.`
      };

   } catch (error) {
      logger.error(`Error finding closest location: ${error.message}`);
      throw new Error(`Failed to find location: ${error.message}`);
   }
}

// Haversine formula to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
   const R = 3959; // Earth's radius in miles
   const dLat = (lat2 - lat1) * Math.PI / 180;
   const dLon = (lon2 - lon1) * Math.PI / 180;
   const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
   return R * c;
}

// ============================================================================
// SHOPIFY MCP INTEGRATION
// ============================================================================

// Storefront MCP (public, no auth needed)
const SHOPIFY_STORE_DOMAIN = '...';
const SHOPIFY_MCP_ENDPOINT = `https://${SHOPIFY_STORE_DOMAIN}/api/mcp`;

// Admin API (for authenticated operations like order lookup)
const SHOPIFY_ADMIN_STORE = '...';
const SHOPIFY_ADMIN_API_VERSION = '2025-01';
const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
const SHOPIFY_ADMIN_API_URL = `https://${SHOPIFY_ADMIN_STORE}.myshopify.com/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;

/**
 * Make a request to the Shopify MCP endpoint
 */
async function shopifyMcpRequest(toolName, args) {
   try {
      logger.debug(`Shopify MCP Request: ${toolName} with args: ${JSON.stringify(args)}`);

      const response = await fetch(SHOPIFY_MCP_ENDPOINT, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'tools/call',
            id: Date.now(),
            params: {
               name: toolName,
               arguments: args,
            },
         }),
      });

      if (!response.ok) {
         logger.error(`Shopify MCP HTTP error: ${response.status} ${response.statusText}`);
         throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      logger.debug(`Shopify MCP Response: ${JSON.stringify(data).substring(0, 500)}`);

      if (data.error) {
         logger.error(`Shopify MCP error: ${JSON.stringify(data.error)}`);
         throw new Error(data.error.message || 'MCP request failed');
      }

      // Parse text content from MCP response
      if (data.result?.content) {
         const textContent = data.result.content.find(item => item.type === 'text');
         if (textContent?.text) {
            try {
               return JSON.parse(textContent.text);
            } catch {
               return textContent.text;
            }
         }
      }

      return data.result;
   } catch (error) {
      logger.error(`Shopify MCP exception: ${error.message}`);
      throw error;
   }
}

/**
 * Search products in the Shopify catalog
 */
async function searchShopifyProducts(query, context = 'Customer browsing', limit = 5) {
   // Ensure query is a string
   const queryStr = String(query || '');

   // Sanitize query: replace " (inch mark) with 'inch', handle special chars
   const sanitizedQuery = queryStr
      .replace(/"/g, ' inch')           // Replace " with inch
      .replace(/'/g, "'")               // Normalize apostrophes
      .replace(/[^\w\s\-.']/g, ' ')     // Remove other special chars
      .replace(/\s+/g, ' ')             // Collapse multiple spaces
      .trim();

   logger.debug(`Shopify search: original="${queryStr}" sanitized="${sanitizedQuery}"`);

   return shopifyMcpRequest('search_shop_catalog', {
      query: sanitizedQuery,
      context: String(context || 'Customer browsing'),
      limit: parseInt(limit) || 5,
      country: 'US',
      language: 'EN',
   });
}

/**
 * Get details for a specific product
 */
async function getShopifyProductDetails(productId, variantOptions = null) {
   const params = { product_id: productId };
   if (variantOptions) {
      params.options = variantOptions;
   }
   return shopifyMcpRequest('get_product_details', params);
}

/**
 * Get current cart contents
 */
async function getShopifyCart(cartId) {
   return shopifyMcpRequest('get_cart', { cart_id: cartId });
}

/**
 * Add items to cart (convenience wrapper)
 */
async function addToShopifyCart(cartId, items) {
   const params = {
      add_items: items.map(item => ({
         product_variant_id: item.variantId,
         quantity: item.quantity || 1,
      })),
   };

   if (cartId) {
      params.cart_id = cartId;
   }

   return shopifyMcpRequest('update_cart', params);
}

/**
 * Update delivery address on cart
 */
async function updateShopifyDeliveryAddress(cartId, address) {
   return shopifyMcpRequest('update_cart', {
      cart_id: cartId,
      delivery_addresses_to_replace: [{
         selected: true,
         delivery_address: {
            first_name: address.firstName,
            last_name: address.lastName,
            address1: address.address1,
            address2: address.address2 || '',
            city: address.city,
            province_code: address.provinceCode,
            zip: address.zip,
            country_code: address.countryCode || 'US',
            phone: address.phone,
         },
      }],
   });
}

/**
 * Apply discount code to cart
 */
async function applyShopifyDiscount(cartId, discountCode) {
   return shopifyMcpRequest('update_cart', {
      cart_id: cartId,
      discount_codes: Array.isArray(discountCode) ? discountCode : [discountCode],
   });
}

/**
 * Search store policies and FAQs
 */
async function searchShopifyPolicies(query, context = '') {
   return shopifyMcpRequest('search_shop_policies_and_faqs', {
      query: String(query || ''),
      context: String(context || ''),
   });
}

/**
 * Get inventory levels per store location for a product variant
 * Uses Admin API to query inventory at all locations
 */
async function getStoreInventory(variantId) {
   logger.debug(`getStoreInventory called for variantId: ${variantId}`);

   const query = `
      query getVariantInventory($variantId: ID!) {
         productVariant(id: $variantId) {
            id
            title
            product {
               title
            }
            inventoryItem {
               id
               inventoryLevels(first: 20) {
                  edges {
                     node {
                        quantities(names: ["available"]) {
                           name
                           quantity
                        }
                        location {
                           id
                           name
                           address {
                              address1
                              city
                              province
                              zip
                           }
                        }
                     }
                  }
               }
            }
         }
      }
   `;

   try {
      const response = await fetch(SHOPIFY_ADMIN_API_URL, {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN,
         },
         body: JSON.stringify({
            query,
            variables: { variantId },
         }),
      });

      const data = await response.json();

      if (data.errors) {
         logger.error(`getStoreInventory error: ${JSON.stringify(data.errors)}`);
         return { success: false, error: data.errors[0]?.message || 'Failed to fetch inventory' };
      }

      const variant = data.data?.productVariant;
      if (!variant) {
         return { success: false, error: 'Product variant not found' };
      }

      const inventoryLevels = variant.inventoryItem?.inventoryLevels?.edges || [];

      // Filter to only retail stores (exclude warehouse/ecom locations)
      const storeInventory = inventoryLevels
         .map(edge => ({
            locationId: edge.node.location.id,
            locationName: edge.node.location.name,
            city: edge.node.location.address?.city,
            address: edge.node.location.address?.address1,
            province: edge.node.location.address?.province,
            zip: edge.node.location.address?.zip,
            available: edge.node.quantities.find(q => q.name === 'available')?.quantity || 0,
         }))
         .filter(loc =>
            !loc.locationName.toLowerCase().includes('warehouse') &&
            !loc.locationName.toLowerCase().includes('ecom')
         );

      return {
         success: true,
         productTitle: variant.product?.title,
         variantTitle: variant.title,
         inventory: storeInventory,
      };
   } catch (error) {
      logger.error(`getStoreInventory exception: ${error.message}`);
      return { success: false, error: error.message };
   }
}

/**
 * Find nearest stores with stock for a product variant
 * Combines inventory lookup with distance calculation
 */
async function findNearestStoresWithStock(variantId, city, storeLocations, maxStores = 3) {
   logger.debug(`findNearestStoresWithStock: variantId=${variantId}, city=${city}`);

   try {
      // Get inventory at all stores
      const inventoryResult = await getStoreInventory(variantId);
      if (!inventoryResult.success) {
         return { success: false, error: inventoryResult.error };
      }

      // Geocode the user's city
      const geocodeResult = await geocodeCity(city);
      const originLat = geocodeResult.lat;
      const originLon = geocodeResult.lon;

      // Match inventory with store locations (which have lat/lon)
      const storesWithStockAndDistance = [];

      for (const inv of inventoryResult.inventory) {
         if (inv.available <= 0) continue; // Skip out-of-stock locations

         // Find matching store in storeLocations by city name
         const matchingStore = storeLocations.find(store =>
            store.city.toLowerCase() === inv.city?.toLowerCase() ||
            store.name.toLowerCase().includes(inv.locationName.toLowerCase()) ||
            inv.locationName.toLowerCase().includes(store.city.toLowerCase())
         );

         if (matchingStore && matchingStore.lat && matchingStore.lon) {
            const distance = calculateDistance(originLat, originLon, matchingStore.lat, matchingStore.lon);
            storesWithStockAndDistance.push({
               name: matchingStore.name,
               city: matchingStore.city,
               address: matchingStore.address,
               state: matchingStore.state,
               phone: matchingStore.phone,
               available: inv.available,
               distance: distance,
            });
         }
      }

      // Sort by distance and take top N
      storesWithStockAndDistance.sort((a, b) => a.distance - b.distance);
      const nearestStores = storesWithStockAndDistance.slice(0, maxStores);

      if (nearestStores.length === 0) {
         return {
            success: true,
            found: false,
            message: 'This product is currently not available for in-store pickup at any location.',
            productTitle: inventoryResult.productTitle,
            variantTitle: inventoryResult.variantTitle,
         };
      }

      return {
         success: true,
         found: true,
         productTitle: inventoryResult.productTitle,
         variantTitle: inventoryResult.variantTitle,
         stores: nearestStores,
         totalStoresWithStock: storesWithStockAndDistance.length,
      };
   } catch (error) {
      logger.error(`findNearestStoresWithStock error: ${error.message}`);
      return { success: false, error: error.message };
   }
}

/**
 * Lookup customer orders using Admin API (after OTP verification)
 */
async function lookupCustomerOrders(identifier, container) {
   logger.debug(`lookupCustomerOrders called with identifier: ${identifier}, container type: ${typeof container}`);

   // Handle case where container might be passed as string or undefined
   if (!container || typeof container !== 'object') {
      logger.error(`lookupCustomerOrders: Invalid container - ${typeof container}`);
      return {
         success: false,
         error: 'Session container is invalid',
         requiresOTP: true,
      };
   }

   if (!container.otpVerified) {
      return {
         success: false,
         error: 'OTP verification required before order lookup',
         requiresOTP: true,
      };
   }

   // Determine if identifier is email or phone
   const isEmail = identifier && identifier.includes('@');
   const queryFilter = isEmail ? `email:${identifier}` : `phone:${identifier}`;

   const query = `
      query getCustomerOrders($queryFilter: String!) {
         customers(first: 1, query: $queryFilter) {
            edges {
               node {
                  id
                  email
                  phone
                  firstName
                  lastName
                  orders(first: 10, sortKey: CREATED_AT, reverse: true) {
                     edges {
                        node {
                           id
                           name
                           createdAt
                           displayFinancialStatus
                           displayFulfillmentStatus
                           cancelledAt
                           cancelReason
                           totalPriceSet {
                              shopMoney {
                                 amount
                                 currencyCode
                              }
                           }
                           fulfillments {
                              trackingInfo {
                                 number
                                 url
                              }
                              status
                           }
                           shippingAddress {
                              address1
                              city
                              province
                              zip
                           }
                        }
                     }
                  }
               }
            }
         }
      }
   `;

   try {
      const response = await fetch(SHOPIFY_ADMIN_API_URL, {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN,
         },
         body: JSON.stringify({
            query,
            variables: { queryFilter },
         }),
      });

      const data = await response.json();

      if (data.errors) {
         return {
            success: false,
            error: data.errors[0]?.message || 'Failed to fetch orders',
         };
      }

      const customer = data.data?.customers?.edges?.[0]?.node;

      if (!customer) {
         return {
            success: true,
            orders: [],
            message: `No orders found for this ${isEmail ? 'email' : 'phone'}`,
         };
      }

      function overallStatus(order) {
         let status = order.displayFulfillmentStatus;
         if (order.cancelledAt) {
            status = `CANCELLED${order.cancelReason && order.cancelReason !== 'OTHER' ? `:${order.cancelReason}` : ''}`;
         }
         if (order.displayFinancialStatus) {
            status += ` ${order.displayFinancialStatus}`;
         }
         return status;
      }

      const orders = customer.orders.edges.map(edge => ({
         orderNumber: edge.node.name,
         orderId: edge.node.id,
         createdAt: edge.node.createdAt,
         financialStatus: edge.node.displayFinancialStatus,
         overallStatus: overallStatus(edge.node),
         total: edge.node.totalPriceSet?.shopMoney,
         tracking: edge.node.fulfillments?.[0]?.trackingInfo,
         shippingAddress: edge.node.shippingAddress,
      }));

      return {
         success: true,
         customer: {
            firstName: customer.firstName,
            lastName: customer.lastName,
            email: customer.email,
            phone: customer.phone,
         },
         orders,
      };
   } catch (error) {
      return {
         success: false,
         error: error.message || 'Failed to lookup orders',
      };
   }
}

/**
 * Get specific order status (after OTP verification)
 */
async function getShopifyOrderStatus(orderNumber, identifier, container, validateIdentifier = true) {
   logger.debug(`getShopifyOrderStatus called with orderNumber: ${orderNumber}, identifier: ${identifier}`);
   if (!container.otpVerified) {
      return {
         success: false,
         error: 'OTP verification required',
         requiresOTP: true,
      };
   }

   // Determine if identifier is email or phone
   const isEmail = identifier && identifier.includes('@');

   const query = `
      query getOrder($query: String!) {
         orders(first: 1, query: $query) {
            edges {
               node {
                  id
                  name
                  email
                  phone
                  createdAt
                  displayFinancialStatus
                  displayFulfillmentStatus
                  cancelledAt
                  cancelReason
                  totalPriceSet {
                     shopMoney {
                        amount
                        currencyCode
                     }
                  }
                  lineItems(first: 50) {
                     edges {
                        node {
                           title
                           quantity
                        }
                     }
                  }
                  fulfillments {
                     status
                     trackingInfo {
                        number
                        url
                        company
                     }
                     estimatedDeliveryAt
                  }
                  shippingAddress {
                     firstName
                     lastName
                     address1
                     city
                     province
                     zip
                  }
               }
            }
         }
      }
   `;

   try {
      const cleanOrderNumber = orderNumber.replace(/^#/, '');
      const queryFilter = isEmail ? `email:${identifier}` : `phone:${identifier}`;

      const response = await fetch(SHOPIFY_ADMIN_API_URL, {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_TOKEN,
         },
         body: JSON.stringify({
            query,
            variables: { query: `name:${cleanOrderNumber} ${queryFilter}` },
         }),
      });

      const data = await response.json();

      if (data.errors) {
         return {
            success: false,
            error: data.errors[0]?.message || 'Failed to fetch order',
         };
      }

      const order = data.data?.orders?.edges?.[0]?.node;

      if (!order) {
         return {
            success: false,
            error: 'Order not found. Please verify the order number.',
         };
      }

      // Validate that the order matches the identifier
      if (validateIdentifier && isEmail && order.email.toLowerCase() !== identifier.toLowerCase()) {
         logger.warn(`Order email ${order.email} does not match identifier ${identifier}`);
         return {
            success: false,
            error: 'Order email does not match the provided email.',
         };
      }
      if (validateIdentifier && !isEmail && order.phone !== identifier) {
         logger.warn(`Order phone ${order.phone} does not match identifier ${identifier}`);
         return {
            success: false,
            error: 'Order phone number does not match the provided phone number.',
         };
      }

      return {
         success: true,
         order: {
            orderNumber: order.name,
            createdAt: order.createdAt,
            financialStatus: order.displayFinancialStatus,
            fulfillmentStatus: order.displayFulfillmentStatus,
            cancelled: !!order.cancelledAt,
            total: order.totalPriceSet?.shopMoney,
            items: order.lineItems.edges.map(edge => ({
               title: edge.node.title,
               quantity: edge.node.quantity,
            })),
            fulfillments: order.fulfillments.map(f => ({
               status: f.status,
               tracking: f.trackingInfo,
               estimatedDelivery: f.estimatedDeliveryAt,
            })),
            shippingAddress: order.shippingAddress,
         },
      };
   } catch (error) {
      return {
         success: false,
         error: error.message || 'Failed to fetch order status',
      };
   }
}

/* ---------- Registries ---------- */
const APPROVED_FUNCTIONS = {
   "sendTwilioSMS": sendTwilioSMS,
   "sendSMSOTP": sendSMSOTP,
   "validateOTP": validateOTP,
   "validateDigits": validateDigits,
   "validatePhone": validatePhone,
   "validateEmail": validateEmail,
   "normalizeAndFindCapture": normalizeAndFindCapture,
   "sendEmail": sendEmail,
   "sendEmailOTP": sendEmailOTP,
   "findClosestLocation": findClosestLocation,
   // Shopify MCP functions
   "searchShopifyProducts": searchShopifyProducts,
   "getShopifyProductDetails": getShopifyProductDetails,
   "getShopifyCart": getShopifyCart,
   "addToShopifyCart": addToShopifyCart,
   "updateShopifyDeliveryAddress": updateShopifyDeliveryAddress,
   "applyShopifyDiscount": applyShopifyDiscount,
   "searchShopifyPolicies": searchShopifyPolicies,
   "lookupCustomerOrders": lookupCustomerOrders,
   "getShopifyOrderStatus": getShopifyOrderStatus,
   // Store inventory functions
   "getStoreInventory": getStoreInventory,
   "findNearestStoresWithStock": findNearestStoresWithStock,
};

const toolsRegistry = [
   {
      "id": "get-payment-link",
      "name": "Get Payment Link",
      "description": "Generates a one-time payment link and sends it to the user via SMS and optionally email",
      "parameters": {
         "type": "object",
         "properties": {
            "email": {
               "type": "string",
               "description": "Customer's email address",
               "default": ""
            },
            "phone_number": {
               "type": "string",
               "description": "Customer's phone number",
               "default": ""
            },
            "account_number": {
               "type": "string",
               "description": "Customer's account number",
               "default": ""
            }
         },
         "required": [],
         "additionalProperties": false
      },
      "implementation": {
         "type": "http",
         "url": "https://...",
         "method": "POST",
         "contentType": "application/json",
         "timeout": 10000,
         "retries": 0,
         "headers": {
            "Authorization": "Bearer ..."
         },
         "responseMapping": {
            "type": "object",
            "mappings": {
               "success": {
                  "path": "success",
                  "fallback": false
               },
               "error": {
                  "path": "error",
                  "fallback": 1
               },
               "customer_info": {
                  "type": "object",
                  "mappings": {
                     "cust_id": "cust_id",
                     "first_name": "first_name",
                     "last_name": "last_name",
                     "phone": "phone",
                     "cell": "cell",
                     "email": "email",
                     "address": {
                        "type": "template",
                        "template": "{{street}}, {{city}}, {{state}} {{zip}}"
                     }
                  }
               }
            }
         }
      },
      "security": {
         "requiresAuth": false,
         "auditLevel": "high",
         "dataClassification": "financial",
         "rateLimit": {
            "requests": 10,
            "window": 60000
         }
      }
   },
   {
      "id": "create-crm-ticket",
      "name": "Create CRM Ticket",
      "description": "Creates a CRM ticket when customer requests live agent assistance",
      "parameters": {
         "type": "object",
         "properties": {
            "firstname": {
               "type": "string",
               "description": "Customer's first name",
               "default": ""
            },
            "lastname": {
               "type": "string",
               "description": "Customer's last name",
               "default": ""
            },
            "email": {
               "type": "string",
               "description": "Customer's email address",
               "default": ""
            },
            "phone": {
               "type": "string",
               "description": "Customer's phone number",
               "default": ""
            },
            "title": {
               "type": "string",
               "description": "Ticket title/subject",
               "default": "Live Agent Request"
            },
            "description": {
               "type": "string",
               "description": "Detailed description of the request including chat history",
               "default": ""
            }
         },
         "required": [
            "title",
            "description"
         ],
         "additionalProperties": false
      },
      "implementation": {
         "type": "http",
         "url": "https://...",
         "method": "POST",
         "contentType": "application/json",
         "timeout": 5000,
         "retries": 0,
         "headers": {
            "Authorization": "Bearer ..."
         },
         "responseMapping": {
            "type": "object",
            "mappings": {
               "success": {
                  "path": "status",
                  "transform": "value === 'success'"
               },
               "case_id": {
                  "path": "case_id",
                  "fallback": null
               },
               "message": {
                  "path": "message",
                  "fallback": "Unknown response"
               },
               "error_message": {
                  "path": "message",
                  "fallback": "Unknown error occurred"
               }
            }
         }
      },
      "security": {
         "requiresAuth": true,
         "auditLevel": "high",
         "dataClassification": "customer_service",
         "rateLimit": {
            "requests": 20,
            "window": 60000
         }
      }
   },
   {
      "id": "lookup-account",
      "name": "Lookup Account",
      "description": "Finds and validates account info based on phone, email, or account number",
      "parameters": {
         "type": "object",
         "properties": {
            "email": {
               "type": "string",
               "description": "Customer's email address",
               "default": ""
            },
            "phone_number": {
               "type": "string",
               "description": "Customer's phone number",
               "default": ""
            },
            "account_number": {
               "type": "string",
               "description": "Customer's account number",
               "default": ""
            }
         },
         "required": [],
         "additionalProperties": false
      },
      "implementation": {
         "type": "http",
         "url": "https://...",
         "method": "POST",
         "contentType": "application/json",
         "timeout": 10000,
         "retries": 0,
         "headers": {
            "Authorization": "Bearer ..."
         },
         "responseMapping": {
            "type": "object",
            "mappings": {
               "success": {
                  "path": "success",
                  "fallback": false
               },
               "error": {
                  "path": "error",
                  "fallback": 1
               },
               "customer_info": {
                  "type": "object",
                  "mappings": {
                     "cust_id": "cust_id",
                     "first_name": "first_name",
                     "last_name": "last_name",
                     "phone": "phone",
                     "cell": "cell",
                     "email": "email",
                     "street": "street",
                     "city": "city",
                     "state": "state",
                     "zip": "zip"
                  }
               }
            }
         }
      },
      "security": {
         "requiresAuth": false,
         "auditLevel": "high",
         "dataClassification": "financial",
         "rateLimit": {
            "requests": 10,
            "window": 60000
         }
      }
   },
   {
      "id": "get-subaccounts",
      "name": "Get Subaccounts",
      "description": "Retrieve subaccount information for a given account number",
      "parameters": {
         "type": "object",
         "properties": {
            "account_number": {
               "type": "string",
               "description": "The main account number to get subaccounts for",
               "default": ""
            }
         },
         "required": [
            "account_number"
         ],
         "additionalProperties": false
      },
      "implementation": {
         "type": "http",
         "url": "https://...",
         "method": "POST",
         "contentType": "application/json",
         "timeout": 10000,
         "retries": 0,
         "headers": {
            "Authorization": "Bearer ..."
         },
         "responseMapping": {
            "type": "object",
            "mappings": {
               "success": {
                  "path": "success",
                  "fallback": false
               },
               "subAccounts": {
                  "path": "data.subAccounts",
                  "fallback": []
               },
               "statementInformation": {
                  "path": "data.statementInformation",
                  "fallback": {}
               },
               "error": {
                  "path": "error",
                  "fallback": null
               }
            }
         }
      },
      "security": {
         "requiresAuth": false,
         "auditLevel": "high",
         "dataClassification": "financial",
         "rateLimit": {
            "requests": 10,
            "window": 60000
         }
      }
   },
   {
      "id": "find-closest-location",
      "name": "Find Closest Location",
      "description": "Find the closest store location based on user's city",
      "parameters": {
         "userCity": {
            "type": "string",
            "description": "User's city for location search"
         },
         "stores": {
            "type": "array",
            "description": "List of store locations with coordinates"
         }
      },
      "required": [
         "userCity",
         "stores"
      ],
      "additionalProperties": false,
      "implementation": {
         "type": "local",
         "function": "findClosestLocation",
         "args": [
            "userCity",
            "stores"
         ],
         "timeout": 5000
      },
      "security": {
         "requiresAuth": false,
         "auditLevel": "low",
         "dataClassification": "public",
         "rateLimit": {
            "requests": 20,
            "window": 60000
         }
      }
   }
];

const flowsMenu = [
   {
      "id": "start-payment",
      "name": "StartPayment",
      "version": "1.0.0",
      "description": "This flow allows the user to request a payment link to be sent to the phone number or email address on file with their account. The user may provide their account number, or if unknown, they may provide the cell phone number or email address associated with the account. The payment link will then be sent via text and/or email to the corresponding contact information. Requests for payment arrangements, reporting financial difficulties in making a payment, or questions about amount due or due date should NOT trigger this flow.",
      "prompt": "Payment",
      "prompt_es": "Pago",
      "primary": true,
      "parameters": [
         {
            "name": "acct_number",
            "type": "string",
            "description": "Customer account number (if user provided it in the query - must start with '5' and be 7-8 digits long)",
         },
         {
            "name": "cell_number",
            "type": "string",
            "description": "Customer phone number (if user provided it in the query)",
         },
         {
            "name": "email",
            "type": "string",
            "description": "Customer email address (if user provided it in the query - must be valid email format)",
         }
      ],
      "variables": {
         "payment_link_choice": {
            "type": "string",
            "description": "User response for knowing account number"
         },
         "acct_number": {
            "type": "string",
            "description": "Customer account number",
            "value": ""
         },
         "cell_or_email": {
            "type": "string",
            "description": "User choice between cell or email",
            "value": ""
         },
         "cell_number": {
            "type": "string",
            "description": "Customer cell phone number",
            "value": ""
         },
         "email": {
            "type": "string",
            "description": "Customer email address",
            "value": ""
         },
         "payment_link_result": {
            "type": "object",
            "description": "Result from OTP link generation"
         },
         "error_message": {
            "type": "string",
            "description": "Error message to convey to user",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "set_support_context",
            "type": "SET",
            "variable": "support_context_side_effect",
            "value": "cargo.support_context = 'payment', cargo.support_context_es = 'pago'"
         },
         {
            "id": "send-payment-link-or-proceed",
            "type": "CASE",
            "branches": {
               "condition: cargo.accountNumber": {
                  "id": "send_payment_link",
                  "type": "FLOW",
                  "value": "send-payment-link",
                  "callType": "reboot"
               },
               "default": {
                  "id": "proceed_to_send_otp",
                  "type": "SET",
                  "variable": "proceed_to_send_otp",
                  "value": true
               }
            }
         },
         {
            "id": "ask-acct_info-if-no-param",
            "type": "CASE",
            "branches": {
               "condition: !acct_number && !cell_number && !email && cargo.callerId": {
                  "id": "ask_account_number_with_caller_id",
                  "type": "SAY-GET",
                  "variable": "payment_link_choice",
                  "value": "To send you a payment link I can locate your account using phone, email or account number. To use your caller id, please {{cargo.verb}} yes. Otherwise, please enter {{cargo.voice ? 'or ' : ''}}{{cargo.verb}} the account number{{cargo.voice ? ' followed by the pound key' : ''}} or, either the phone or email associated with your account{{cargo.voice ? ' followed by the pound key' : ''}}. To exit at any time {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "Para enviarte un enlace de pago, puedo localizar su cuenta utilizando el teléfono, el correo electrónico o el número de cuenta. Para usar su identificación de llamada, por favor {{cargo.verb_es}} sí. De lo contrario, por favor ingrese {{cargo.voice ? 'o ' : ''}}{{cargo.verb_es}} el número de cuenta{{cargo.voice ? ' seguido de la tecla numeral' : ''}} o, ya sea el teléfono o el correo electrónico asociado con su cuenta{{cargo.voice ? ' seguido de la tecla numeral' : ''}}. Para salir en cualquier momento {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR.",
                  "digits": {
                     "min": 7,
                     "max": 12
                  }
               },
               "condition: !acct_number && !cell_number && !email": {
                  "id": "ask_account_number",
                  "type": "SAY-GET",
                  "variable": "payment_link_choice",
                  "value": "To send you a payment link I can locate your account using phone, email or account number. Please enter {{cargo.voice ? 'or ' : ''}}{{cargo.verb}} the account number{{cargo.voice ? ' followed by the pound key' : ''}} or, either the phone or email associated with your account{{cargo.voice ? ' followed by the pound key' : ''}}. To exit at any time {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "Para enviarte un enlace de pago, puedo localizar su cuenta utilizando el teléfono, el correo electrónico o el número de cuenta. Por favor, ingrese {{cargo.voice ? 'o ' : ''}}{{cargo.verb_es}} el número de cuenta{{cargo.voice ? ' seguido de la tecla numeral' : ''}} o, ya sea el teléfono o el correo electrónico asociado con su cuenta{{cargo.voice ? ' seguido de la tecla numeral' : ''}}. Para salir en cualquier momento {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR.",
                  "digits": {
                     "min": 7,
                     "max": 12
                  }
               },
               "default": {
                  "id": "proceed_to_locate_account",
                  "type": "SET",
                  "variable": "payment_link_choice",
                  "value": "acct_number"
               }
            }
         },
         {
            "id": "start_payment_process_input",
            "type": "FLOW",
            "value": "start-payment-process-input",
            "callType": "call"
         }
      ]
   },
   {
      "id": "start-payment-process-input",
      "name": "StartPaymentProcessInput",
      "version": "1.0.0",
      "description": "Get account number, phone, or email from user to start payment link process",
      "steps": [
         {
            "id": "treat_as_account_number",
            "type": "SET",
            "variable": "prospective_acct_number",
            "value": "acct_number || payment_link_choice.replace(/[^0-9]/g, '')"
         },
         {
            "id": "treat_as_cell_number",
            "type": "SET",
            "variable": "prospective_cell_number",
            "value": "cell_number || payment_link_choice.replace(/[^0-9]/g, '')"
         },
         {
            "id": "treat_as_email",
            "type": "SET",
            "variable": "prospective_email",
            "value": "email || payment_link_choice.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/)?.[0]"
         },
         {
            "id": "treat_as_email_allow_spaces",
            "type": "SET",
            "variable": "prospective_email2",
            "value": "email || payment_link_choice.match(/[a-zA-Z0-9._%+\\s-]+@[a-zA-Z0-9.\\s-]+\\s*\\.\\s*[a-zA-Z\\s]{2,}/)?.[0]"
         },
         {
            "id": "normalize_prospective_email",
            "type": "SET",
            "variable": "prospective_email",
            "value": "prospective_email ? prospective_email : (prospective_email2 ? prospective_email2.replace(/\\s+/g, '') : '')"
         },
         {
            "id": "branch_on_account_knowledge",
            "type": "CASE",
            "branches": {
               "condition: prospective_acct_number[0] == '5' && validateDigits(prospective_acct_number, 7, 9)": {
                  "id": "treat_as_account_number",
                  "type": "SET",
                  "variable": "acct_number",
                  "value": "prospective_acct_number"
               },
               "condition: validateDigits(prospective_acct_number, 7, 9)": {
                  "id": "invalid_account_number_format",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "Sorry, I need an account number starting with 5, 7 to 8 digits long.",
                     "error_message_es": "Lo siento, necesito un número de cuenta que comience con 5, de 7 a 8 dígitos de longitud.",
                     "retry_flow": "start-payment",
                     "cancel_flow": "contact-support",
                     "capture_patterns": [
                        {
                           "variable": "acct_number",
                           "regex": "^5\\d{6,7}$",
                           "normalizer": "[^0-9]"
                        },
                        {
                           "variable": "cell_number",
                           "regex": "[0-9\\-\\(\\)\\.\\s]{7,}",
                           "normalizer": "[^0-9]"
                        },
                        {
                           "variable": "email",
                           "regex": "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"
                        }
                     ]
                  }
               },
               "condition: validatePhone(prospective_cell_number)": {
                  "id": "treat_as_phone_number",
                  "type": "SET",
                  "variable": "cell_number",
                  "value": "prospective_cell_number"
               },
               "condition: validateEmail(prospective_email)": {
                  "id": "treat_as_email_address",
                  "type": "SET",
                  "variable": "email",
                  "value": "prospective_email"
               },
               "condition: cargo.callerId && (['1', 'yes', 'si', 'sí'].includes(payment_link_choice) || ['phone', 'cell', 'caller id', 'number', 'numero', 'número', 'telefono', 'teléfono', 'celular', 'identificador de llamadas'].some(p => payment_link_choice.includes(p)))": {
                  "id": "use_caller_id",
                  "type": "SET",
                  "variable": "cell_number",
                  "value": "cargo.callerId"
               },
               "condition: ['live', 'agent', 'customer service', 'agente', 'gente', 'gerente', 'al cliente'].some(choice => payment_link_choice.toLowerCase().includes(choice)) || payment_link_choice.trim() == '0'": {
                  "id": "goto_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "reboot"
               },
               "condition: ['*', 'abort', 'exit', 'quit', 'salir'].includes(payment_link_choice.toLowerCase())": {
                  "id": "abort_process",
                  "type": "FLOW",
                  "value": "contact-support",
                  "callType": "reboot"
               },
               "default": {
                  "id": "offer_retry_invalid_choice",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "Sorry, I didn't understand that.",
                     "error_message_es": "Lo siento, no entendí eso.",
                     "retry_flow": "start-payment",
                     "cancel_flow": "contact-support",
                     "capture_patterns": [
                        {
                           "variable": "acct_number",
                           "regex": "^5\\d{6,7}$",
                           "normalizer": "[^0-9]"
                        },
                        {
                           "variable": "cell_number",
                           "regex": "[0-9\\-\\(\\)\\.\\s]{7,}",
                           "normalizer": "[^0-9]"
                        },
                        {
                           "variable": "email",
                           "regex": "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"
                        }
                     ]
                  }
               }
            }
         },
         {
            "id": "conditional_generate_payment_link",
            "type": "CASE",
            "branches": {
               "condition: (typeof cell_number !== 'undefined' && cell_number) || (typeof email !== 'undefined' && email) || (typeof acct_number !== 'undefined' && acct_number)": {
                  "id": "generate_payment_link",
                  "type": "FLOW",
                  "value": "generate-and-validate-payment-link",
                  "callType": "call"
               },
               "default": {
                  "id": "should-never-get-here",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "Sorry, I need an account number starting with 5, 7 to 8 digits long, or either the phone or email associated with your account to proceed.",
                     "error_message_es": "Lo siento, necesito un número de cuenta que comience con 5, de 7 a 8 dígitos de longitud, o el teléfono o correo electrónico asociado con su cuenta para continuar.",
                     "retry_flow": "start-payment",
                     "cancel_flow": "contact-support",
                     "capture_patterns": [
                        {
                           "variable": "acct_number",
                           "regex": "^5\\d{6,7}$",
                           "normalizer": "[^0-9]"
                        },
                        {
                           "variable": "cell_number",
                           "regex": "[0-9\\-\\(\\)\\.\\s]{7,}",
                           "normalizer": "[^0-9]"
                        },
                        {
                           "variable": "email",
                           "regex": "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"
                        }
                     ]
                  }
               }
            }
         },
      ]
   },
   {
      "id": "generate-and-validate-payment-link",
      "name": "GenerateOtpLink",
      "version": "1.0.0",
      "description": "Generate OTP link using collected contact information",
      "steps": [
         {
            "id": "normalize_account_number",
            "type": "SET",
            "variable": "normalized_account_number",
            "value": "cargo.accountNumber || (typeof acct_number !== 'undefined' ? acct_number : '')"
         },
         {
            "id": "normalize_email",
            "type": "SET",
            "variable": "normalized_email",
            "value": "typeof email !== 'undefined' ? email : ''"
         },
         {
            "id": "normalize_phone_number",
            "type": "SET",
            "variable": "normalized_phone_number",
            "value": "{{typeof cell_number !== 'undefined' ? cell_number : ''}}"
         },
         {
            "id": "call_get_payment_link",
            "type": "CALL-TOOL",
            "tool": "get-payment-link",
            "variable": "payment_link_result",
            "args": {
               "account_number": "{{normalized_account_number}}",
               "email": "{{normalized_email}}",
               "phone_number": "{{normalized_phone_number}}"
            },
            "onFail": {
               "id": "otp_generation_failed",
               "type": "FLOW",
               "value": "payment-link-failed",
               "callType": "replace"
            }
         },
         {
            "id": "validate_payment_link",
            "type": "FLOW",
            "value": "validate-payment-link",
            "callType": "call"
         }
      ]
   },
   {
      "id": "send-payment-link",
      "name": "SendPaymentLink",
      "version": "1.0.0",
      "description": "Ask if user wants a payment link for their account ending with ...",
      "steps": [
         {
            "id": "ask_send_payment_link",
            "type": "SAY-GET",
            "variable": "send_payment_link",
            "value": "Would you like me to send a payment link for account ending with {{cargo.accountNumber.slice(-4).split('').join(', ')}}? To send the payment link {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES. To forget this account so you can start over, {{cargo.verb}} FORGET.",
            "value_es": "¿Le gustaría que le enviara un enlace de pago para la cuenta que termina en {{cargo.accountNumber.slice(-4).split('').join(', ')}}? Para enviar el enlace de pago {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ. Para olvidar esta cuenta y comenzar de nuevo, {{cargo.verb_es}} OLVIDAR.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "normalize_send_payment_link",
            "type": "SET",
            "variable": "send_payment_link",
            "value": "send_payment_link.trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "handle_send_payment_link",
            "type": "CASE",
            "branches": {
               "condition: ['1', 'yes', 'sure', 'please', 'ok', 'thanks', 'si', 'sí', 'seguro', 'por favor', 'gracias'].some(choice => send_payment_link.includes(choice))": {
                  "id": "send_and_validate_payment_link",
                  "type": "FLOW",
                  "value": "generate-and-validate-payment-link",
                  "callType": "call"
               },
               "condition: ['forget', 'start over', 'olvidar', 'empezar de nuevo'].some(choice => send_payment_link.includes(choice))": {
                  "id": "forget_account_and_restart",
                  "type": "SET",
                  "variable": "forget_side_effect",
                  "value": "cargo.accountNumber = null"
               },
               "condition: ['*', 'abort', 'exit', 'quit', 'salir', 'no'].some(choice => send_payment_link.includes(choice))": {
                  "id": "abort_process",
                  "type": "FLOW",
                  "value": "contact-support",
                  "callType": "reboot"
               },
               "condition: ['live', 'agent', 'customer service', 'agente', 'gente', 'gerente', 'al cliente'].some(choice => send_payment_link.includes(choice)) || send_payment_link == '0'": {
                  "id": "goto_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "reboot"
               },
               "default": {
                  "id": "forward_to_gen_ai",
                  "type": "FLOW",
                  "value": "no-action-needed",
                  "callType": "reboot"
               }
            }
         }
      ]
   },
   {
      "id": "validate-payment-link",
      "name": "ValidatePaymentLink",
      "version": "1.0.0",
      "description": "Validate payment link generation result and provide appropriate response",
      "steps": [
         {
            "id": "validate_payment_link_result",
            "type": "CASE",
            "branches": {
               "condition: payment_link_result.success": {
                  "id": "goto-payment-succeeded",
                  "type": "FLOW",
                  "value": "payment-link-succeeded",
                  "callType": "call"
               },
               "default": {
                  "id": "retry_payment",
                  "type": "FLOW",
                  "value": "payment-link-failed",
                  "callType": "reboot"
               }
            }
         }
      ]
   },
   {
      "id": "payment-link-failed",
      "name": "PaymentLinkFailed",
      "version": "1.0.0",
      "description": "Handle payment failure",
      "steps": [
         {
            "id": "offer_retry_start_payment",
            "type": "FLOW",
            "value": "generic-retry-with-options",
            "callType": "reboot",
            "parameters": {
               "error_message": "Sorry, either the account could not be found or it doesn't have a cell number on file so I couldn't text the link.",
               "error_message_es": "Lo siento, o que no se pudo encontrar la cuenta o no tiene un número de celular en el archivo, por lo que no pude enviar el enlace por texto.",
               "retry_flow": "start-payment",
               "cancel_flow": "contact-support",
               "capture_patterns": [
                  {
                     "variable": "acct_number",
                     "regex": "^5\\d{6,7}$",
                     "normalizer": "[^0-9]"
                  },
                  {
                     "variable": "cell_number",
                     "regex": "[0-9\\-\\(\\)\\.\\s]{7,}",
                     "normalizer": "[^0-9]"
                  },
                  {
                     "variable": "email",
                     "regex": "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"
                  }
               ]
            }
         }
      ]
   },
   {
      "id": "payment-link-succeeded",
      "name": "PaymentLinkSucceeded",
      "version": "1.0.0",
      "description": "Handle successful payment",
      "steps": [
         {
            "id": "set_account_number",
            "type": "SET",
            "variable": "validated_account_number",
            "value": "cargo.accountNumber = payment_link_result.customer_info.cust_id"
         },
         {
            "id": "set_acccount_cell",
            "type": "SET",
            "variable": "validated_account_cell",
            "value": "cargo.accountCell = payment_link_result.customer_info.cell"
         },
         {
            "id": "set_account_email",
            "type": "SET",
            "variable": "validated_account_email",
            "value": "cargo.accountEmail = payment_link_result.customer_info.email"
         },
         {
            "id": "mask_email",
            "type": "SET",
            "variable": "masked_email",
            "value": "payment_link_result.customer_info.email ? payment_link_result.customer_info.email.replace(/^(.{2})(.*)(@.*)$/, (match, p1, p2, p3) => p1 + '*' + p3) : ''"
         },
         {
            "id": "get_cell_last4",
            "type": "SET",
            "variable": "cell_last4",
            "value": "payment_link_result.customer_info.cell ? payment_link_result.customer_info.cell.slice(-4) : ''"
         },
         {
            "id": "say_payment_succeeded",
            "type": "SAY",
            "value": "Great! Payment link for account ending with {{cargo.accountNumber.slice(-4).split('').join(', ')}} was sent to {{payment_link_result.customer_info.email && payment_link_result.customer_info.cell ? 'your email ' + masked_email + ' and cell ending with ' + cell_last4 : payment_link_result.customer_info.email ? 'your email ' + masked_email : 'your cell ending with ' + cell_last4}}. Please click the link to complete your payment. You'll already be logged in, simply select your payment options and submit, it's that easy!",
            "value_es": "¡Genial! El enlace de pago para la cuenta que termina en {{cargo.accountNumber.slice(-4).split('').join(', ')}} fue enviado a {{payment_link_result.customer_info.email && payment_link_result.customer_info.cell ? 'tu correo electrónico ' + masked_email + ' y celular que termina en ' + cell_last4 : payment_link_result.customer_info.email ? 'tu correo electrónico ' + masked_email : 'tu celular que termina en ' + cell_last4}}. Haga clic en el enlace para completar tu pago. ¡Ya estará conectado, simplemente seleccione sus opciones de pago y envíelas, es así de fácil!"
         }
      ]
   },
   {
      "id": "create-crm-ticket",
      "name": "CreateLiveAgentTicket",
      "version": "1.0.0",
      "description": "Creates a CRM ticket when customer requests live agent assistance",
      "prompt": "Creating a CRM ticket",
      "prompt_es": "Creando un ticket de CRM",
      "variables": {
         "ticket_result": {
            "type": "object",
            "description": "Result from CRM ticket creation"
         },
         "customer_first_name": {
            "type": "string",
            "description": "Customer's first name extracted from displayName"
         },
         "customer_last_name": {
            "type": "string",
            "description": "Customer's last name extracted from displayName"
         },
         "caller_id": {
            "type": "string",
            "description": "Caller ID phone number"
         },
         "display_name": {
            "type": "string",
            "description": "Customer display name"
         },
         "chat_history": {
            "type": "string",
            "description": "Complete chat history"
         }
      },
      "steps": [
         {
            "id": "extract_cargo_values",
            "type": "SET",
            "variable": "display_name",
            "value": "cargo.displayName ? cargo.displayName : 'Not available'"
         },
         {
            "id": "extract_caller_id",
            "type": "SET",
            "variable": "caller_id",
            "value": "cargo.callerId ? cargo.callerId : 'Not available'"
         },
         {
            "id": "extract_chat_history",
            "type": "SET",
            "variable": "chat_history",
            "value": "cargo.chatHistory ? cargo.chatHistory : 'No chat history available'"
         },
         {
            "id": "extract_customer_names",
            "type": "SET",
            "variable": "customer_first_name",
            "value": "display_name ? display_name.split(' ')[0] || '' : ''"
         },
         {
            "id": "extract_customer_last_name",
            "type": "SET",
            "variable": "customer_last_name",
            "value": "display_name ? display_name.split(' ').slice(1).join(' ') || '' : ''"
         },
         {
            "id": "create_ticket",
            "type": "CALL-TOOL",
            "tool": "create-crm-ticket",
            "variable": "ticket_result",
            "args": {
               "firstname": "{{customer_first_name}}",
               "lastname": "{{customer_last_name}}",
               "email": "",
               "phone": "{{caller_id}}",
               "title": "Live Agent Request",
               "description": "Customer requested live agent assistance.\n\nCustomer Display Name: {{display_name}}\nCaller ID: {{caller_id}}\n\nChat History:\n{{chat_history}}"
            },
            "onFail": {
               "id": "ticket_creation_failed",
               "type": "FLOW",
               "value": "handle-ticket-creation-failure",
               "callType": "call"
            }
         },
         {
            "id": "confirm_ticket_creation",
            "type": "CASE",
            "branches": {
               "condition: ticket_result.success": {
                  "id": "ticket_success_msg",
                  "type": "SAY",
                  "value": "I've created a support ticket for you{{ticket_result.case_id ? ' (Case #' + ticket_result.case_id + ')' : ''}}. A live agent will contact you shortly.",
                  "value_es": "He creado un ticket de soporte para usted{{ticket_result.case_id ? ' (Caso #' + ticket_result.case_id + ')' : ''}}. Un agente en vivo se comunicará con usted en breve."
               },
               "default": {
                  "id": "ticket_failure_fallback",
                  "type": "FLOW",
                  "value": "handle-ticket-creation-failure",
                  "callType": "call"
               }
            }
         }
      ]
   },
   {
      "id": "handle-ticket-creation-failure",
      "name": "HandleTicketCreationFailure",
      "version": "1.0.0",
      "description": "Handle failures in CRM ticket creation",
      "steps": [
         {
            "id": "ticket_failure_msg",
            "type": "SAY",
            "value": "I apologize, but I'm having trouble creating your support ticket at the moment. Result: {{ticket_result}}",
            "value_es": "Me disculpo, pero estoy teniendo problemas para crear tu ticket de soporte en este momento. Resultado: {{ticket_result}}"
         }
      ]
   },
   {
      "id": "locate-account",
      "name": "LocateAccount",
      "version": "1.0.0",
      "description": "This flow allows the user to get information about their account, to answer questions about their balance, payment due, available credit, etc., by locating and authenticating their account using either their cell phone number or email address.",
      "prompt": "account information",
      "prompt_es": "información de la cuenta",
      "primary": true,
      "parameters": [
         {
            "name": "cell_number",
            "type": "string",
            "description": "Customer cell number (if user provided it in the query)",
         }
      ],
      "variables": {
         "cell_or_email": {
            "type": "string",
            "description": "User choice between cell or email"
         },
         "cell_number": {
            "type": "string",
            "description": "Customer cell phone number",
            "value": "",
         },
         "email": {
            "type": "string",
            "description": "Customer email address",
            "value": ""
         },
         "otp_code": {
            "type": "string",
            "description": "OTP code entered by user"
         },
         "otp_container": {
            "type": "object",
            "description": "Container for OTP hash and timestamp"
         },
         "otp_validation_result": {
            "type": "boolean",
            "description": "Result from OTP validation"
         },
         "lookup_result": {
            "type": "object",
            "description": "Result from account lookup"
         },
         "account_lookup_aborted": {
            "type": "boolean",
            "description": "Flag to indicate if account lookup was aborted",
            "value": false
         },
         "error_message": {
            "type": "string",
            "description": "Error message to display"
         }
      },
      "steps": [
         {
            "id": "set_support_context",
            "type": "SET",
            "variable": "support_context_side_effect",
            "value": "cargo.support_context = 'account', cargo.support_context_es = 'cuenta'"
         },
         {
            "id": "abort-if-already-located-account",
            "type": "CASE",
            "branches": {
               "condition: cargo.authenticatedAccount": {
                  "id": "already_authenticated",
                  "type": "FLOW",
                  "value": "no-action-needed",
                  "callType": "reboot"
               },
               "default": {
                  "id": "proceed_to_lookup",
                  "type": "SET",
                  "variable": "proceed_to_lookup",
                  "value": true
               }
            }
         },
         {
            "id": "check_existing_contact_info",
            "type": "CASE",
            "branches": {
               "condition: cargo.otpVerified && cargo.otp_cell_number": {
                  "id": "already_authenticated_proceed_to_lookup",
                  "type": "FLOW",
                  "value": "validate-otp-result-and-perform-account-lookup",
                  "callType": "replace"
               },
               "condition: cargo.otpVerified && cargo.otp_email": {
                  "id": "already_authenticated_proceed_to_lookup_email",
                  "type": "FLOW",
                  "value": "validate-otp-result-and-perform-account-lookup",
                  "callType": "replace"
               },
               "condition: cargo.accountCell": {
                  "id": "confirm_existing_contact_info",
                  "type": "FLOW",
                  "value": "confirm-existing-contact-info",
                  "callType": "call"
               },
               "default": {
                  "id": "proceed_to_authentication",
                  "type": "SET",
                  "variable": "proceed",
                  "value": true
               }
            }
         },
         {
            "id": "authenticate_user",
            "type": "FLOW",
            "value": "authenticate-user",
            "callType": "call",
            "parameters": {
               "retry_flow": "locate-account",
               "cancel_flow": "contact-support"
            }
         },
         {
            "id": "perform_lookup",
            "type": "FLOW",
            "value": "validate-otp-result-and-perform-account-lookup",
            "callType": "call"
         }
      ]
   },
   {
      "id": "confirm-existing-contact-info",
      "name": "ConfirmExistingContactInfo",
      "version": "1.0.0",
      "description": "Confirm with user if they want to use existing contact info on file",
      "variables": {
         "use_existing_contact": {
            "type": "string",
            "description": "User choice to use existing contact info"
         }
      },
      "steps": [
         {
            "id": "offer_existing_contact",
            "type": "SAY-GET",
            "variable": "use_existing_contact",
            "value": "Do you want to authenticate access to account ending with {{cargo.accountNumber.slice(-4).split('').join(', ')}} using the cell ending with {{cargo.accountCell.slice(-4).split('').join(', ')}}? To use this contact info {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES. To provide different contact info {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO.",
            "value_es": "¿Desea autenticar el acceso a la cuenta que termina en {{cargo.accountNumber.slice(-4).split('').join(', ')}} utilizando el celular que termina en {{cargo.accountCell.slice(-4).split('').join(', ')}}? Para usar esta información de contacto {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ. Para proporcionar una información de contacto diferente {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "normalize_use_existing_contact",
            "type": "SET",
            "variable": "use_existing_contact",
            "value": "use_existing_contact.trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "treat_as_phone_number",
            "type": "SET",
            "variable": "prospective_cell_number",
            "value": "use_existing_contact.replace(/[^0-9]/g, '')"
         },
         {
            "id": "handle_existing_contact_choice",
            "type": "CASE",
            "branches": {
               "condition: validatePhone(prospective_cell_number)": {
                  "id": "treat_as_manual_entry",
                  "type": "SET",
                  "variable": "cell_number",
                  "value": "prospective_cell_number"
               },
               "condition: ['1', 'yes', 'sure', 'please', 'ok', 'thanks', 'si', 'sí', 'seguro', 'por favor', 'gracias'].includes(use_existing_contact)": {
                  "id": "use_existing_contact_info",
                  "type": "SET",
                  "variable": "cell_number",
                  "value": "cargo.accountCell"
               },
               "condition: ['2', 'no'].includes(use_existing_contact)": {
                  "id": "goto_manual_entry",
                  "type": "FLOW",
                  "value": "get-cell-or-email",
                  "callType": "replace"
               },
               "condition: ['*', 'abort', 'exit', 'quit', 'salir'].includes(use_existing_contact)": {
                  "id": "abort_process",
                  "type": "FLOW",
                  "value": "cancel-process",
                  "callType": "reboot"
               },
               "condition: ['live', 'agent', 'customer service', 'agente', 'gente', 'gerente', 'al cliente'].some(choice => use_existing_contact.includes(choice)) || use_existing_contact == '0'": {
                  "id": "goto_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "reboot"
               },
               "default": {
                  "id": "retry_existing_contact_choice",
                  "type": "FLOW",
                  "value": "contact-support",
                  "callType": "reboot"
               }
            }
         }
      ]
   },
   {
      "id": "lookup-account-failed-handler",
      "name": "LookupAccountFailedHandler",
      "version": "1.0.0",
      "description": "Handle unexpected failure of lookup-account tool",
      "steps": [
         {
            "id": "clear_cell",
            "type": "SET",
            "variable": "cell",
            "value": "''"
         },
         {
            "id": "clear_email",
            "type": "SET",
            "variable": "email",
            "value": "''"
         },
         {
            "id": "clear_otp_verified",
            "type": "SET",
            "variable": "clear_otp_side_effect",
            "value": "cargo.otpVerified = false, cargo.otp_cell_number = null, cargo.otp_email = null"
         },
         {
            "id": "invoke_generic_retry",
            "type": "FLOW",
            "value": "generic-retry-with-options",
            "callType": "replace",
            "parameters": {
               "error_message": "Sorry, I couldn't locate your account with that information.",
               "error_message_es": "Lo siento, no pude localizar su cuenta con esa información.",
               "retry_flow": "locate-account",
               "cancel_flow": "contact-support",
               "capture_patterns": [
                  {
                     "variable": "cell_number",
                     "regex": "[0-9\\-\\(\\)\\.\\s]{7,}",
                     "normalizer": "[^0-9]"
                  },
                  {
                     "variable": "email",
                     "regex": "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"
                  }
               ]
            }
         }
      ]
   },
   {
      "id": "validate-otp-result-and-perform-account-lookup",
      "name": "ValidateOtpResultAndPerformAccountLookup",
      "version": "1.0.0",
      "description": "Validate OTP result and perform account lookup",
      "steps": [
         {
            "id": "set_email_from_cargo_otp",
            "type": "SET",
            "variable": "email",
            "value": "cargo.otp_email || ''"
         },
         {
            "id": "set_cell_number_from_cargo_otp",
            "type": "SET",
            "variable": "cell_number",
            "value": "cargo.otp_cell_number || ''"
         },
         {
            "id": "set_otp_validation_result_if_validated",
            "type": "SET",
            "variable": "otp_validation_result",
            "value": "cargo.otp_email || cargo.otp_cell_number ? true : false"
         },
         {
            "id": "perform_lookup_if_validated",
            "type": "CASE",
            "branches": {
               "condition: otp_validation_result": {
                  "id": "perform_account_lookup",
                  "type": "CALL-TOOL",
                  "tool": "lookup-account",
                  "variable": "lookup_result",
                  "args": {
                     "email": "{{email}}",
                     "phone_number": "{{cell_number}}"
                  },
                  "onFail": {
                     "id": "lookup_failed",
                     "type": "FLOW",
                     "value": "lookup-account-failed-handler",
                     "callType": "reboot"
                  }
               },
               "default": {
                  "id": "unexpected_otp_failure",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "Sorry, there was an unexpected error validating your information.",
                     "error_message_es": "Lo siento, hubo un error inesperado al validar su información.",
                     "retry_flow": "locate-account",
                     "cancel_flow": "contact-support"
                  }
               }
            }
         },
         {
            "id": "show_lookup_results",
            "type": "CASE",
            "branches": {
               "condition: lookup_result && lookup_result.success && lookup_result.customer_info.cust_id": {
                  "id": "account_found",
                  "type": "FLOW",
                  "value": "account-found",
                  "callType": "replace"
               },
               "default": {
                  "id": "account_not_found",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "Sorry, I couldn't locate your account with that information.",
                     "error_message_es": "Lo siento, no pude localizar su cuenta con esa información.",
                     "retry_flow": "locate-account",
                     "cancel_flow": "contact-support"
                  }
               }
            }
         }
      ]
   },
   {
      "id": "account-found",
      "name": "AccountFound",
      "version": "1.0.0",
      "description": "Handle successful account lookup",
      "steps": [
         {
            "id": "set_authenticated_account",
            "type": "SET",
            "variable": "authenticated_account",
            "value": "cargo.authenticatedAccount = true"
         },
         {
            "id": "set_acct_number",
            "type": "SET",
            "variable": "acct_number",
            "value": "cargo.accountNumber = lookup_result.customer_info.cust_id"
         },
         {
            "id": "set_first_name",
            "type": "SET",
            "variable": "first_name",
            "value": "cargo.firstName = lookup_result.customer_info.first_name"
         },
         {
            "id": "set_last_name",
            "type": "SET",
            "variable": "last_name",
            "value": "cargo.lastName = lookup_result.customer_info.last_name"
         },
         {
            "id": "get_subaccounts",
            "type": "CALL-TOOL",
            "tool": "get-subaccounts",
            "variable": "subaccounts_result",
            "args": {
               "account_number": "{{cargo.accountNumber}}"
            },
            "onFail": {
               "id": "subaccounts_failed",
               "type": "SET",
               "variable": "subaccounts_result",
               "value": "{ success: false, subAccounts: [] }"
            }
         },
         {
            "id": "set_subaccounts_to_cargo",
            "type": "SET",
            "variable": "sub_accounts",
            "value": "cargo.subAccounts = subaccounts_result.success && Array.isArray(subaccounts_result.subAccounts) ? subaccounts_result.subAccounts : []"
         },
         {
            "id": "set_subaccountsBalance_to_cargo",
            "type": "SET",
            "variable": "sub_accounts_balance",
            "value": "cargo.subAccountsBalance = subaccounts_result.success && Array.isArray(subaccounts_result.subAccounts) && subaccounts_result.subAccounts.length > 0 ? subaccounts_result.subAccounts.reduce((acc, sub) => acc + (sub.balance || 0), 0).toFixed(2) : undefined"
         },
         {
            "id": "set_statement_information_to_cargo",
            "type": "SET",
            "variable": "statement_information",
            "value": "cargo.statementInformation = subaccounts_result.success && subaccounts_result.statementInformation ? subaccounts_result.statementInformation : {}"
         },
         {
            "id": "set-user-context",
            "type": "SET",
            "variable": "user_context",
            "value": "cargo.userContext = { firstName: cargo.firstName, lastName: cargo.lastName, accountNumber: cargo.accountNumber, subAccounts: cargo.subAccounts, statementInformation: cargo.statementInformation, subAccountsBalance: cargo.subAccountsBalance }"
         },
         {
            "id": "confirm_account_found",
            "type": "SAY",
            "value": "Hi {{cargo.firstName}} {{cargo.lastName}}, I found your account ending with {{cargo.accountNumber.slice(-4).split('').join(', ')}} with {{cargo.subAccounts?.length || 'no' }} sub accounts. {{typeof cargo.subAccountsBalance === 'string' ? 'Your current balance is ' + cargo.subAccountsBalance + '. ' : ''}}{{cargo.statementInformation?.statementSummary?.totalBalance ? 'Your latest statement balance was ' + cargo.statementInformation.statementSummary.totalBalance + '. ' : ''}}{{cargo.statementInformation?.statementSummary?.availableCredit ? 'Your available credit as of the last statement was ' + cargo.statementInformation.statementSummary.availableCredit + '. ' : ''}}Any other assistance I can help you with?",
            "value_es": "Hola {{cargo.firstName}} {{cargo.lastName}}, encontré tu cuenta que termina en {{cargo.accountNumber.slice(-4).split('').join(', ')}} con {{cargo.subAccounts?.length || 'ninguna' }} subcuentas. {{typeof cargo.subAccountsBalance === 'string' ? 'Su saldo actual es ' + cargo.subAccountsBalance + '. ' : ''}}{{cargo.statementInformation?.statementSummary?.totalBalance ? 'El saldo de tu último estado de cuenta fue ' + cargo.statementInformation.statementSummary.totalBalance + '. ' : ''}}{{cargo.statementInformation?.statementSummary?.availableCredit ? 'Su crédito disponible la fecha del último estado de cuenta fue ' + cargo.statementInformation.statementSummary.availableCredit + '. ' : ''}}Con qué más puedo ayudarte?"
         }
      ]
   },
   {
      "id": "find-locations",
      "name": "FindLocations",
      "version": "1.0.0",
      "description": "Helps customers find our locations, locating the closest location and optionally getting an SMS link with directions. This flow should NOT be activated when customer asks about store hours, nor when they ask about product availability in a given location - it should be activated only when the user explicitly requests to find a store location.",
      "prompt": "find location",
      "prompt_es": "encontrar ubicación",
      "primary": true,
      parameters: [
         {
            name: "user_city",
            description: "The city the user specified for location search",
            type: "string"
         }
      ],
      "variables": {
         "user_city": {
            "type": "string",
            "description": "User's city for location search"
         },
         "location_result": {
            "type": "object",
            "description": "Result from location search"
         },
         "send_sms_choice": {
            "type": "string",
            "description": "User choice to send SMS directions"
         },
         "sms_result": {
            "type": "object",
            "description": "Result from SMS sending"
         }
      },
      "steps": [
         {
            "id": "ask_for_city_if_no_param",
            "type": "CASE",
            "branches": {
               "condition: !user_city": {
                  "id": "get_city_from_user",
                  "type": "FLOW",
                  "value": "get-user-city-for-location",
                  "callType": "call"
               },
               "default": {
                  "id": "proceed_with_city",
                  "type": "SET",
                  "variable": "proceed",
                  "value": "true"
               }
            }
         },
         {
            "id": "find_location",
            "type": "CALL-TOOL",
            "tool": "find-closest-location",
            "variable": "location_result",
            "args": {
               "userCity": "{{user_city}}",
               "stores": "{{global_store_locations}}"
            },
            "onFail": {
               "id": "location_search_failed",
               "type": "FLOW",
               "value": "store-location-failed",
               "callType": "replace"
            }
         },
         {
            "id": "validate_location_result",
            "type": "CASE",
            "branches": {
               "condition: !location_result || !location_result.store || !location_result.store.address || !location_result.distance || !location_result.directions": {
                  "id": "invalid_location_result",
                  "type": "FLOW",
                  "value": "store-location-failed",
                  "callType": "replace"
               },
               "default": {
                  "id": "location_valid",
                  "type": "SET",
                  "variable": "location_valid",
                  "value": "true"
               }
            }
         },
         {
            "id": "build_maps_urls",
            "type": "SET",
            "variable": "maps_address",
            "value": "encodeURIComponent(location_result.store.address + ', ' + location_result.store.city + ', ' + location_result.store.state)"
         },
         {
            "id": "display_location_info",
            "type": "CASE",
            "branches": {
               "condition: !cargo.voice": {
                  "id": "display_with_links",
                  "type": "SAY",
                  "value": "The closest store to {{user_city}} is:\n\n{{location_result.store.name}}\n{{location_result.store.address}}\n{{location_result.store.city}}, {{location_result.store.state}}\nPhone: {{location_result.store.phone}}\nDistance: {{location_result.distance}} miles\n\nGet Directions:\n🗺️ Google Maps: https://www.google.com/maps/dir/?api=1&destination={{maps_address}}\n🍎 Apple Maps: https://maps.apple.com/?daddr={{maps_address}}&dirflg=d",
                  "value_es": "La tienda más cercana a {{user_city}} es:\n\n{{location_result.store.name}}\n{{location_result.store.address}}\n{{location_result.store.city}}, {{location_result.store.state}}\nTeléfono: {{location_result.store.phone}}\nDistancia: {{location_result.distance}} millas\n\nObtener Direcciones:\n🗺️ Google Maps: https://www.google.com/maps/dir/?api=1&destination={{maps_address}}\n🍎 Apple Maps: https://maps.apple.com/?daddr={{maps_address}}&dirflg=d"
               },
               "default": {
                  "id": "display_voice_only",
                  "type": "SAY",
                  "value": "The closest store to {{user_city}} is:\n\n{{location_result.store.name}}\n{{location_result.store.address}}\n{{location_result.store.city}}, {{location_result.store.state}}\nPhone: {{location_result.store.phone}}\nDistance: {{location_result.distance}} miles\n\nDirections: {{location_result.directions}}",
                  "value_es": "La tienda más cercana a {{user_city}} es:\n\n{{location_result.store.name}}\n{{location_result.store.address}}\n{{location_result.store.city}}, {{location_result.store.state}}\nTeléfono: {{location_result.store.phone}}\nDistancia: {{location_result.distance}} millas\n\nDirecciones: {{location_result.directions}}"
               }
            }
         },
         {
            "id": "ask_send_sms",
            "type": "CASE",
            "branches": {
               "condition: !cargo.voice": {
                  "id": "skip_sms_for_chat",
                  "type": "SET",
                  "variable": "send_sms_choice",
                  "value": "'no'"
               },
               "default": {
                  "id": "ask_sms_for_voice",
                  "type": "SAY-GET",
                  "variable": "send_sms_choice",
                  "value": "Would you like me to text these directions to your phone? To send by text {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES. To skip {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO.",
                  "value_es": "¿Le gustaría que enviara estas direcciones a tu teléfono por texto? Para enviar por texto {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ. Para omitir {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO.",
                  "digits": {
                     "min": 1,
                     "max": 1
                  }
               }
            }
         },
         {
            "id": "normalize_sms_choice",
            "type": "SET",
            "variable": "send_sms_choice",
            "value": "send_sms_choice.trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "handle_sms_choice",
            "type": "CASE",
            "branches": {
               "condition: ['1', 'yes', 'sure', 'please', 'ok', 'thanks', 'si', 'sí', 'seguro', 'por favor', 'gracias'].includes(send_sms_choice) && !cargo.callerId": {
                  "id": "no_caller_id_available",
                  "type": "SAY",
                  "value": "I'm unable to send texts at this time. However, you can text our support number at (213) 205-3155 and ask for store locations - we'll send you the directions right away!",
                  "value_es": "No puedo enviar mensajes de texto en este momento. Sin embargo, puedes enviar un mensaje de texto a nuestro número de soporte al (213) 205-3155 y pedir las ubicaciones de las tiendas - ¡te enviaremos las direcciones de inmediato!"
               },
               "condition: ['1', 'yes', 'sure', 'please', 'ok', 'thanks', 'si', 'sí', 'seguro', 'por favor', 'gracias'].includes(send_sms_choice) && cargo.callerId": {
                  "id": "send_sms_directions",
                  "type": "CALL-TOOL",
                  "tool": "send-twilio-sms",
                  "variable": "sms_result",
                  "args": {
                     "accountSid": "...",
                     "from": "{{cargo.twilioNumber}}",
                     "to": "{{cargo.callerId}}",
                     "message": "{{location_result.store.name}}\n{{location_result.store.address}}, {{location_result.store.city}}, {{location_result.store.state}}\nPhone: {{location_result.store.phone}}\nDistance: {{location_result.distance}} miles\n\nDirections:\nGoogle Maps: https://www.google.com/maps/dir/?api=1&destination={{maps_address}}\n\nApple Maps: https://maps.apple.com/?daddr={{maps_address}}&dirflg=d",
                     "messageSid": ""
                  },
                  "onFail": {
                     "id": "sms_failed",
                     "type": "SAY",
                     "value": "I couldn't send the text message at this time, but here are your directions again:\n\n{{location_result.store.name}}\n{{location_result.store.address}}\n{{location_result.store.city}}, {{location_result.store.state}}\nPhone: {{location_result.store.phone}}",
                     "value_es": "No pude enviar el mensaje de texto en este momento, pero aquí están tus direcciones nuevamente:\n\n{{location_result.store.name}}\n{{location_result.store.address}}\n{{location_result.store.city}}, {{location_result.store.state}}\nTeléfono: {{location_result.store.phone}}"
                  }
               },
               "condition: ['2', 'no'].includes(send_sms_choice)": {
                  "id": "skip_sms",
                  "type": "SAY",
                  "value": "Feel free to visit us at {{location_result.store.name}} or call {{location_result.store.phone}} for more information. Anything else I can help you with?",
                  "value_es": "Siéntete libre de visitarnos en {{location_result.store.name}} o llamar al {{location_result.store.phone}} para más información. ¿Hay algo más en lo que pueda ayudarte?"
               },
               "condition: ['*', 'abort', 'exit', 'quit', 'salir'].includes(send_sms_choice)": {
                  "id": "abort_process",
                  "type": "FLOW",
                  "value": "cancel-process",
                  "callType": "reboot"
               },
               "condition: ['live', 'agent', 'customer service', 'agente', 'gente', 'gerente', 'al cliente'].some(choice => send_sms_choice.includes(choice)) || send_sms_choice == '0'": {
                  "id": "goto_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "reboot"
               },
               "default": {
                  "id": "invalid_choice",
                  "type": "SAY",
                  "value": "I didn't understand that choice. The directions have been displayed above. Is there anything else I can help you with?",
                  "value_es": "No entendí esa opción. Las direcciones se han mostrado arriba. ¿Hay algo más en lo que pueda ayudarte?"
               }
            }
         },
         {
            "id": "sms_confirmation",
            "type": "CASE",
            "branches": {
               "condition: typeof sms_result !== 'undefined' && sms_result": {
                  "id": "sms_sent_successfully",
                  "type": "SAY",
                  "value": "Perfect! I've sent the store directions to your phone with Google Maps and Apple Maps links. You should receive the text message shortly.",
                  "value_es": "¡Perfecto! He enviado las direcciones de la tienda a tu teléfono con enlaces de Google Maps y Apple Maps. Deberías recibir el mensaje de texto en breve."
               },
               "default": {
                  "id": "no_sms_sent",
                  "type": "SET",
                  "variable": "sms_skipped",
                  "value": true
               }
            }
         }
      ]
   },
   {
      "id": "get-user-city-for-location",
      "name": "AskForUserCity",
      "version": "1.0.0",
      "description": "Ask user for their city to find nearest store location",
      "steps": [
         {
            "id": "ask_user_city",
            "type": "SAY-GET",
            "variable": "user_city",
            "value": "I'd be happy to help you find our closest location. What city are you in?",
            "value_es": "Me encantaría ayudarte a encontrar nuestra ubicación más cercana. ¿En qué ciudad te encuentras?"
         },
         {
            "id": "normalize_city",
            "type": "SET",
            "variable": "user_city",
            "value": "user_city.trim()"
         },
         {
            "id": "validate_city_input",
            "type": "CASE",
            "branches": {
               "condition: ['*', 'abort', 'exit', 'quit', 'salir'].includes(search_query.toLowerCase())": {
                  "id": "abort_process",
                  "type": "FLOW",
                  "value": "cancel-process",
                  "callType": "reboot"
               },
               "condition: ['live', 'agent', 'customer service', 'agente', 'gente', 'gerente', 'al cliente'].some(choice => user_city.toLowerCase().includes(choice)) || user_city == '0'": {
                  "id": "goto_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "reboot"
               },
               "default": {
                  "id": "proceed_with_city",
                  "type": "SET",
                  "variable": "proceed",
                  "value": "true"
               }
            }
         },
      ]
   },
   {
      "id": "store-location-failed",
      "name": "StoreLocationFailed",
      "version": "1.0.0",
      "description": "Handle failed store location search gracefully",
      "variables": {
         "user_choice": {
            "type": "string",
            "description": "User choice for retry or exit"
         }
      },
      "steps": [
         {
            "id": "explain_failure",
            "type": "SAY",
            "value": "I'm sorry, I couldn't find store locations near {{user_city}}. This might be because the city name wasn't recognized or there was an issue with the search.",
            "value_es": "Lo siento, no pude encontrar ubicaciones de tiendas cerca de {{user_city}}. Esto podría ser porque el nombre de la ciudad no fue reconocido o hubo un problema con la búsqueda."
         },
         {
            "id": "offer_retry",
            "type": "SAY-GET",
            "variable": "user_choice",
            "value": "Would you like to try again with a different city? To retry {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES. For customer service contact information {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO.",
            "value_es": "¿Le gustaría intentar de nuevo con una ciudad diferente? Para reintentar {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ. Para información de contacto del servicio al cliente {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "normalize_choice",
            "type": "SET",
            "variable": "user_choice",
            "value": "user_choice.trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "handle_choice",
            "type": "CASE",
            "branches": {
               "condition: ['1', 'yes', 'sure', 'please', 'ok', 'thanks', 'si', 'sí', 'seguro', 'por favor', 'gracias'].includes(user_choice)": {
                  "id": "retry_location_search",
                  "type": "FLOW",
                  "value": "find-locations",
                  "callType": "reboot"
               },
               "condition: ['2', 'no'].includes(user_choice)": {
                  "id": "provide_contact_info",
                  "type": "FLOW",
                  "value": "contact-support",
                  "callType": "reboot"
               },
               "condition: ['live', 'agent', 'customer service', 'agente', 'gente', 'gerente', 'al cliente'].some(choice => user_choice.includes(choice)) || user_choice == '0'": {
                  "id": "goto_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "reboot"
               },
               "default": {
                  "id": "provide_contact_info_default",
                  "type": "FLOW",
                  "value": "contact-support",
                  "callType": "reboot"
               }
            }
         }
      ]
   }
];

/* ---------- Global Variables ---------- */
const globalVariables = {
   "global_acct_required_digits": 7,
   "global_acct_max_digits": 8,
   "global_store_locations": [
      {
         "name": "Curacao Anaheim",
         "city": "Anaheim",
         "address": "1520 North Lemon Street",
         "zip": "92801",
         "state": "CA",
         "lat": 33.8464,
         "lon": -117.9196,
         "phone": "+1 714-738-4900"
      },
      {
         "name": "Curacao Chino",
         "city": "Chino",
         "address": "5459 Philadelphia Street",
         "zip": "91710",
         "state": "CA",
         "lat": 34.0335,
         "lon": -117.6858,
         "phone": "+1 909-628-1919"
      },
      {
         "name": "Curacao Chula Vista Center",
         "city": "Chula Vista",
         "address": "555 Broadway suite 900",
         "zip": "91910",
         "state": "CA",
         "lat": 32.6298,
         "lon": -117.0851,
         "phone": "(877) 287-2226"
      },
      {
         "name": "Curacao Huntington Park",
         "city": "Huntington Park",
         "address": "5980 Pacific Boulevard",
         "zip": "90255",
         "state": "CA",
         "lat": 33.9877,
         "lon": -118.2251,
         "phone": "+1 323-826-3000"
      },
      {
         "name": "Curacao Las Vegas",
         "city": "Las Vegas",
         "address": "4200 Meadows Lane",
         "zip": "89107",
         "state": "NV",
         "lat": 36.1702,
         "lon": -115.2045,
         "phone": "+1 702-822-6891"
      },
      {
         "name": "Curacao Los Angeles",
         "city": "Los Angeles",
         "address": "1605 W Olympic Boulevard",
         "zip": "90015",
         "state": "CA",
         "lat": 34.0493,
         "lon": -118.2743,
         "phone": "+1 213-639-2100"
      },
      {
         "name": "Curacao Lynwood",
         "city": "Lynwood",
         "address": "3160 East Imperial Highway",
         "zip": "90262",
         "state": "CA",
         "lat": 33.9305,
         "lon": -118.2152,
         "phone": "+1 310-632-7711"
      },
      {
         "name": "Curacao Northridge",
         "city": "Northridge",
         "address": "9301 Tampa Avenue suite 545",
         "zip": "91324",
         "state": "CA",
         "lat": 34.2383,
         "lon": -118.5554,
         "phone": "+1 818-672-7023"
      },
      {
         "name": "Curacao Phoenix",
         "city": "Phoenix",
         "address": "7815 West Thomas Road",
         "zip": "85033",
         "state": "AZ",
         "lat": 33.4800,
         "lon": -112.2259,
         "phone": "+1 623-848-0040"
      },
      {
         "name": "Curacao San Bernardino",
         "city": "San Bernardino",
         "address": "885 Harriman Place",
         "zip": "92408",
         "state": "CA",
         "lat": 34.0658,
         "lon": -117.2687,
         "phone": "+1 909-383-5099"
      },
      {
         "name": "Curacao Santa Ana",
         "city": "Santa Ana",
         "address": "16111 Harbor Boulevard",
         "zip": "92708",
         "state": "CA",
         "lat": 33.7098,
         "lon": -117.9198,
         "phone": "+1 714-775-9700"
      },
      {
         "name": "Curacao South Gate",
         "city": "South Gate",
         "address": "8618 Garfield Avenue",
         "zip": "90280",
         "state": "CA",
         "lat": 33.9529,
         "lon": -118.1640,
         "phone": "+1 562-927-3027"
      },
      {
         "name": "Curacao Tucson Mall",
         "city": "Tucson",
         "address": "4510 North Oracle Road",
         "zip": "85705",
         "state": "AZ",
         "lat": 32.2885,
         "lon": -110.9784,
         "phone": "+1 520-576-5565"
      }
   ]
};

/* ---------- Simple REPL ---------- */
async function main() {

   try {
      fs.writeFileSync(path.resolve(__dirname, 'make-payment.flows'), JSON.stringify(flowsMenu, null, 2), 'utf8');
      fs.writeFileSync(path.resolve(__dirname, 'make-payment.tools'), JSON.stringify(toolsRegistry, null, 2), 'utf8');
      console.log('✅ Persisted flowsMenu and toolsRegistry to make-payment.flows and make-payment.tools');
   } catch (err) {
      console.error('❌ Failed to persist flows/tools:', err);
   }

   // Load system flows and tools
   try {
      console.log('Loading system flows and tools...');
      const systemFlows = JSON.parse(fs.readFileSync('./system.flows.json', 'utf8'));
      const systemTools = JSON.parse(fs.readFileSync('./system.tools.json', 'utf8'));

      // Merge system flows into flowsMenu (at the beginning)
      flowsMenu.unshift(...systemFlows);

      // Merge system tools into toolsRegistry (at the beginning)
      toolsRegistry.unshift(...systemTools);

      console.log(`Loaded ${systemFlows.length} system flows and ${systemTools.length} system tools.`);
   } catch (error) {
      console.error('Error loading system flows/tools:', error);
   }

   // Load Shopify flows and tools if available
   try {
      if (fs.existsSync('./shopify.flows.json') && fs.existsSync('./shopify.tools.json')) {
         console.log('Loading Shopify flows and tools...');
         const shopifyFlows = JSON.parse(fs.readFileSync('./shopify.flows.json', 'utf8'));
         const shopifyTools = JSON.parse(fs.readFileSync('./shopify.tools.json', 'utf8'));

         // Merge Shopify flows into flowsMenu
         flowsMenu.push(...shopifyFlows);

         // Merge Shopify tools into toolsRegistry
         toolsRegistry.push(...shopifyTools);

         console.log(`Loaded ${shopifyFlows.length} Shopify flows and ${shopifyTools.length} Shopify tools.`);
      } else {
         console.log('No Shopify flows/tools found, skipping.');
      }
   } catch (error) {
      console.error('Error loading Shopify flows/tools:', error);
   }

   /* ---------- Engine Boot ---------- */
   const engine = new WorkflowEngine(
      logger,
      aiCallback,
      flowsMenu,
      toolsRegistry,
      APPROVED_FUNCTIONS,
      globalVariables,
      true, //Validate on Init
      '', // Auto-detect Language
      3000 // AI Timeout in ms
   );
   engine.disableCommands(); // Disable default flow commands for this demo

   let session = engine.initSession("user-001", "session-001");
   // You can set session variables like this:
   session.cargo.test_var = "test value";

   // Simulate caller ID detection - in a real system, this would come from your telephony system
   session.cargo.twilioNumber = "..."; // Example: Twilio number
   session.cargo.callerId = "...";   // Example: Caller ID
   session.cargo.voice = true; // Simulate voice interaction
   session.cargo.verb = "say"; // "type";
   session.cargo.verb_es = "diga"; // "ingrese";

   // Set contact info based on channel (voice vs text)
   session.cargo.contact_info = "Web: ... - Phone: ... - ... - or ask for \"Live Agent\" to escalate to live support.";

   console.log(`Simulated caller ID: ${session.cargo.callerId}`);

   console.log("Type anything like: 'I need to make a payment' or 'payment' to test the enhanced caller ID flow");
   console.log("NOTE: This test includes JSON serialization/deserialization to simulate the remote widget");

   const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
   while (true) {
      const user = await rl.question("> ");

      // SIMULATE REMOTE WIDGET: Serialize session before sending to engine (like chat-widget.js does)
      //console.log("🔄 Simulating JSON serialization (like remote widget)...");
      const serializedSession = JSON.stringify(session);
      const deserializedSession = JSON.parse(serializedSession);

      // Use the deserialized session (this breaks object references without our fix)
      const result = await engine.updateActivity({ role: "user", content: user }, deserializedSession);
      session = result

      // SIMULATE REMOTE WIDGET: Serialize session again after engine response
      const serializedResult = JSON.stringify(session);
      session = JSON.parse(serializedResult);

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
