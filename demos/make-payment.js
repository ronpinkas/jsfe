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

//import { WorkflowEngine } from '../dist/index.js';
import { WorkflowEngine } from "jsfe";

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
const SMTP_PORT = 587  // Use 587 with STARTTLS - MXroute auto-signs DKIM
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

function validateCardNumber(input) {
   const cleaned = (input || '').replace(/\D/g, '');

   // Outer length bound shared by all global card networks (e.g., Diners is 14, Visa/MC up to 19)
   if (cleaned.length < 12 || cleaned.length > 19) {
      logger.debug(`Invalid card number length: ${cleaned.length}`);
      return false;
   }

   // Luhn checksum - Handles 99% of typos safely across all brands
   let sum = 0;
   let double = false;
   for (let i = cleaned.length - 1; i >= 0; i--) {
      let d = parseInt(cleaned[i], 10);
      if (double) {
         d *= 2;
         if (d > 9) d -= 9;
      }
      sum += d;
      double = !double;
   }
   
   const valid = sum % 10 === 0;
   if (!valid) logger.debug('Card number failed Luhn check');
   return valid;
}

function validateExpiration(month, year) {
   const m = (month || '').replace(/\D/g, '');
   const y = (year || '').replace(/\D/g, '');
   if (m.length !== 2 || y.length !== 2) return false;
   const mNum = parseInt(m, 10);
   const yNum = parseInt(y, 10);
   if (mNum < 1 || mNum > 12) return false;
   const now = new Date();
   const curYear = now.getFullYear() % 100;
   const curMonth = now.getMonth() + 1;
   if (yNum < curYear) return false;
   if (yNum === curYear && mNum < curMonth) return false;
   if (yNum > curYear + 20) return false;
   return true;
}

function validatePhone(phone, acceptInternational = false) {
   // Remove any non-digit characters for validation
   const cleaned = phone.replace(/\D/g, '');
   logger.debug(`Validating phone format: ${cleaned}`);

   // US phone number: 10 digits or 11 if country code is included
   if (cleaned.length === 10 || (cleaned.length === 11 && cleaned.startsWith('1'))) {
      logger.debug(`Valid US phone number: ${cleaned}`);
      return true;
   }

   // International format: 11+ digits
   if (acceptInternational && cleaned.length >= 11 && cleaned.length <= 15) {
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
// MXroute auto-signs DKIM when using port 587 with STARTTLS
async function sendEmail(to, cc, subject, body) {
   try {
      const transporter = nodemailer.createTransport({
         host: SMTP_HOST,
         port: SMTP_PORT,
         secure: false,  // Use STARTTLS
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
      // TODO: Remove before production - testing only
      console.log(`[TEST OTP] Email OTP for ${to}: ${otp}`);

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
      // TODO: Remove before production - testing only
      console.log(`[TEST OTP] SMS OTP for ${to}: ${otp}`);

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
const SHOPIFY_STORE_DOMAIN = 'icuracao.com';
const SHOPIFY_MCP_ENDPOINT = `https://${SHOPIFY_STORE_DOMAIN}/api/mcp`;

// Admin API (for authenticated operations like order lookup)
const SHOPIFY_ADMIN_STORE = '439331-2';
const SHOPIFY_ADMIN_API_VERSION = '2025-01';
const SHOPIFY_ADMIN_API_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN || '...';
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

function amountToSpeech(amount, language = 'en', voice = true) {

   logger.info(`amountToSpeech: language=${language}`);

   try {
      if (!voice) {
         return String(amount);
      }
      if (language === 'en') {
         const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
         const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
         const scales = ["", "Thousand", "Million", "Billion"];

         function convertSmallNumber(num) {
            let words = "";
            if (num >= 100) {
               words += units[Math.floor(num / 100)] + " Hundred ";
               num %= 100;
            }
            if (num >= 20) {
               words += tens[Math.floor(num / 10)] + (num % 10 !== 0 ? " " + units[num % 10] : "") + " ";
            } else if (num > 0) {
               words += units[num] + " ";
            }
            return words;
         }

         // 0. Validate and normalize input
         if (typeof amount === 'string') {
            amount = amount.replace(/[^-0-9.]/g, ''); // Keep the minus sign!
         }

         const numAmount = parseFloat(amount);

         if (isNaN(numAmount)) {
            return "Invalid amount";
         }

         if (Math.abs(numAmount) >= 1000000000000) {
            return "Amount exceeds 999 Billion limit";
         }

         // 1. Handle "Negative" prefix and work with absolute value
         const isNegative = numAmount < 0;
         let absoluteAmount = Math.abs(numAmount);

         // 2. Split Dollars and Cents
         const parts = absoluteAmount.toFixed(2).split(".");
         let dollarVal = parseInt(parts[0]);
         let centVal = parseInt(parts[1]);

         // 3. Process Dollars
         let dollarWords = "";
         if (dollarVal === 0) {
            dollarWords = "Zero";
         } else {
            let scaleIdx = 0;
            while (dollarVal > 0) {
               let chunk = dollarVal % 1000;
               if (chunk > 0) {
                  dollarWords = convertSmallNumber(chunk) + scales[scaleIdx] + " " + dollarWords;
               }
               dollarVal = Math.floor(dollarVal / 1000);
               scaleIdx++;
            }
         }

         // 4. Formatting for TTS
         const dLabel = (parseInt(parts[0]) === 1) ? "Dollar" : "Dollars";
         const cLabel = (centVal === 1) ? "Cent" : "Cents";

         let finalSpeech = (isNegative ? "Negative " : "") + dollarWords.trim() + " " + dLabel;

         if (centVal > 0) {
            const centWords = convertSmallNumber(centVal);
            finalSpeech += " and " + centWords.trim() + " " + cLabel;
         }

         return finalSpeech.replace(/\s+/g, ' ');
      } else if (language === 'es') {
         // Spanish implementation
         const basics = ["", "Un", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete", "Ocho", "Nueve", "Diez", "Once", "Doce", "Trece", "Catorce", "Quince", "Dieciséis", "Diecisiete", "Dieciocho", "Diecinueve", "Veinte", "Veintiún", "Veintidós", "Veintitrés", "Veinticuatro", "Veinticinco", "Veintiséis", "Veintisiete", "Veintiocho", "Veintinueve"];
         const tens = ["", "", "Veinte", "Treinta", "Cuarenta", "Cincuenta", "Sesenta", "Setenta", "Ochenta", "Noventa"];
         const hundreds = ["", "Ciento", "Doscientos", "Trescientos", "Cuatrocientos", "Quinientos", "Seiscientos", "Setecientos", "Ochocientos", "Novecientos"];

         function convertGroup(n) {
            let output = "";
            if (n === 100) return "Cien";

            if (n >= 100) {
               output += hundreds[Math.floor(n / 100)] + " ";
               n %= 100;
            }

            if (n === 0 && output.length > 0) return output.trim();
            if (n === 0) return "";

            if (n < 30) {
               output += basics[n];
            } else {
               output += tens[Math.floor(n / 10)];
               if ((n % 10) > 0) {
                  output += " y " + basics[n % 10];
               }
            }
            return output.trim();
         }

         if (typeof amount === 'string') {
            amount = amount.replace(/[^-0-9.]/g, '');
         }

         const numAmount = parseFloat(amount);

         if (isNaN(numAmount)) {
            return "Cantidad no válida";
         }

         if (Math.abs(numAmount) >= 1000000000000) {
            return "Cantidad excede el límite de 999 billones";
         }

         const isNegative = numAmount < 0;
         let absoluteAmount = Math.abs(numAmount);

         const parts = absoluteAmount.toFixed(2).split(".");
         let dollarVal = parseInt(parts[0]);
         let centVal = parseInt(parts[1]);

         let dollarWords = "";
         if (dollarVal === 0) {
            dollarWords = "Cero";
         } else if (dollarVal === 1) {
            dollarWords = "Un";
         } else {
            let scaleIdx = 0;
            let tempDollars = dollarVal;
            let accumulated = "";

            while (tempDollars > 0) {
               let chunk = tempDollars % 1000;
               if (chunk > 0) {
                  let chunkText = convertGroup(chunk);

                  if (scaleIdx === 0) {
                     accumulated = chunkText + " " + accumulated;
                  } else if (scaleIdx === 1) {
                     // Thousands
                     if (chunk === 1) {
                        accumulated = "Mil " + accumulated;
                     } else {
                        accumulated = chunkText + " Mil " + accumulated;
                     }
                  } else if (scaleIdx === 2) {
                     // Millions
                     if (chunk === 1) {
                        accumulated = "Un Millón " + accumulated;
                     } else {
                        accumulated = chunkText + " Millones " + accumulated;
                     }
                  } else if (scaleIdx === 3) {
                     // Billions
                     if (chunk === 1) {
                        accumulated = "Un Billón " + accumulated;
                     } else {
                        accumulated = chunkText + " Billones " + accumulated;
                     }
                  }
               }
               tempDollars = Math.floor(tempDollars / 1000);
               scaleIdx++;
            }
            dollarWords = accumulated.trim();
         }

         const dLabel = (parseInt(parts[0]) === 1) ? "Dólar" : "Dólares";
         const cLabel = (centVal === 1) ? "Centavo" : "Centavos";

         // Add "de" for exact millions/billions
         if (dollarWords.endsWith("Millón") || dollarWords.endsWith("Millones") || dollarWords.endsWith("Billón") || dollarWords.endsWith("Billones")) {
            dollarWords += " de";
         }

         let finalSpeech = (isNegative ? "Negativo " : "") + dollarWords + " " + dLabel;

         if (centVal > 0) {
            let centWords = "";
            if (centVal === 1) centWords = "Un";
            else centWords = convertGroup(centVal);
            finalSpeech += " con " + centWords + " " + cLabel;
         }

         return finalSpeech.replace(/\s+/g, ' ').trim();
      } else {
         return `Language ${language} not supported for amount to speech conversion`;
      }
   } catch (error) {
      logger.error(`amountToSpeech error: ${error.message}`);
      return "Error converting amount to speech";
   }
}

function urlToSpeech(url, language = 'en') {
   try {
      if (!url || typeof url !== 'string') return '';

      const words = language === 'es'
         ? { dot: 'punto', slash: 'diagonal', dash: 'guión', underscore: 'guión bajo' }
         : { dot: 'dot', slash: 'slash', dash: 'dash', underscore: 'underscore' };

      let spoken = url
         .replace(/^https?:\/\//i, '')   // strip protocol
         .replace(/\?.*$/, '')           // strip query string
         .replace(/#.*$/, '')            // strip fragment
         .replace(/\/+$/, '');           // strip trailing slashes

      // Split into domain and path
      const slashIdx = spoken.indexOf('/');
      let domain = slashIdx >= 0 ? spoken.substring(0, slashIdx) : spoken;
      let path = slashIdx >= 0 ? spoken.substring(slashIdx) : '';

      // Domain: dots become spoken word, strip www
      domain = domain
         .replace(/^www\./i, '')
         .replace(/\./g, ` ${words.dot} `);

      // Path: slashes, hyphens, underscores become spoken words
      path = path
         .replace(/\//g, ` ${words.slash} `)
         .replace(/-/g, ` ${words.dash} `)
         .replace(/_/g, ` ${words.underscore} `);

      spoken = (domain + ' ' + path).replace(/\s+/g, ' ').trim();

      return spoken;
   } catch (error) {
      logger.error(`urlToSpeech error: ${error.message}`);
      return url || '';
   }
}

function textWithUrlToSpeech(text, language = 'en') {
   if (!text || typeof text !== 'string') return text;
   return text.replace(/https?:\/\/[^\s]+/gi, (url) => urlToSpeech(url, language));
}

// Strict word-aware option matching for flow CASE conditions — replaces the
// substring `.some(choice => input.includes(choice))` idiom, whose false
// positives broke branch routing ('si' inside "imposible"/"así" matched YES,
// prod-observed 2026-08-09). Rules (deliberately NO fuzzy/prefix matching):
//  - single-word choice: exact word membership
//  - multi-word choice: exact word-sequence containment
//  - plurals/inflections: enumerate them explicitly in the choice list
function matchesChoice(input, choices) {
   if (!input || !Array.isArray(choices)) {
      return false;
   }
   // One tokenizer for both sides: letters/digits/'*' are word chars, everything
   // else (commas, ¿?¡!, periods) separates — so callers need no pre-normalization.
   const tokenize = (s) => String(s).toLowerCase().split(/[^\p{L}\p{N}*]+/u).filter(Boolean);
   const words = tokenize(input);
   return choices.some(choice => {
      const choiceWords = tokenize(choice);
      if (choiceWords.length === 0) {
         return false;
      } else if (choiceWords.length === 1) {
         return words.includes(choiceWords[0]);
      } else {
         // multi-word entry ('thank you', 'por favor'): consecutive run of words
         for (let i = 0; i <= words.length - choiceWords.length; i++) {
            if (choiceWords.every((c, j) => words[i + j] === c)) {
               return true;
            }
         }
         return false;
      }
   });
}

/* ---------- Registries ---------- */
const APPROVED_FUNCTIONS = {
   "sendTwilioSMS": sendTwilioSMS,
   "sendSMSOTP": sendSMSOTP,
   "validateOTP": validateOTP,
   "validateDigits": validateDigits,
   "validateCardNumber": validateCardNumber,
   "validateExpiration": validateExpiration,
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
   // Utility functions
   "amountToSpeech": amountToSpeech,
   "urlToSpeech": urlToSpeech,
   "textWithUrlToSpeech": textWithUrlToSpeech,
   "matchesChoice": matchesChoice,
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
         "url": "https://wh-consumer.aws.icuracao.com/get-otp-link",
         "method": "POST",
         "contentType": "application/json",
         "timeout": 20000,
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
         "url": "https://ai-data-endpoint.aws.icuracao.com/create-case",
         "method": "POST",
         "contentType": "application/json",
         "timeout": 45000,
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
            },
            "dob": {
               "type": "string",
               "description": "Optional filter: customer's date of birth (YYYY-MM-DD) to disambiguate a cell shared by multiple accounts",
               "default": ""
            },
            "ssn": {
               "type": "string",
               "description": "Optional filter: last 4 digits of SSN to disambiguate a cell shared by multiple accounts",
               "default": ""
            },
            "zip": {
               "type": "string",
               "description": "Optional filter: 5-digit ZIP code to disambiguate a cell shared by multiple accounts",
               "default": ""
            }
         },
         "required": [],
         "additionalProperties": false
      },
      "implementation": {
         "type": "http",
         "url": "https://wh-consumer.aws.icuracao.com/lookup-account",
         "method": "POST",
         "contentType": "application/json",
         "timeout": 20000,
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
               "multiple_records": {
                  "path": "multiple_records",
                  "fallback": false
               },
               "error_reason": {
                  "path": "error_reason",
                  "fallback": ""
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
         "url": "https://wh-consumer.aws.icuracao.com/get-subaccounts",
         "method": "POST",
         "contentType": "application/json",
         "timeout": 20000,
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
   },
   {
      "id": "get-experian-link",
      "name": "Get Experian Link",
      "description": "Sends a Credit Monitoring service information link to the customer",
      "parameters": {
         "type": "object",
         "properties": {
            "cust_id": {
               "type": "string",
               "description": "Customer's account/customer ID"
            }
         },
         "required": ["cust_id"],
         "additionalProperties": false
      },
      "implementation": {
         "type": "http",
         "url": "https://wh-consumer.aws.icuracao.com/get-experian-link",
         "method": "POST",
         "contentType": "application/json",
         "timeout": 20000,
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
      "id": "create-service-case",
      "name": "Create Service Case",
      "description": "Creates a service case (incident) in the CRM system with ticket type, reason, and customer details",
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
               "description": "Case title/subject"
            },
            "description": {
               "type": "string",
               "description": "Detailed description of the request including context and chat history"
            },
            "ticket_type": {
               "type": "string",
               "description": "Type of ticket: Account Issue, Curacao Credit Card, Reissue Credit Card, Fraud, Credit, Cancellation, Store Call Back"
            },
            "ticket_reason": {
               "type": "string",
               "description": "Reason for the ticket, must match the ticket type"
            },
            "authenticated_phone": {
               "type": "boolean",
               "description": "Whether the customer's phone was OTP-authenticated",
               "default": false
            },
            "authenticated_email": {
               "type": "boolean",
               "description": "Whether the customer's email was OTP-authenticated",
               "default": false
            },
            "account_number": {
               "type": "string",
               "description": "Customer's AR account number, used to set Account Number on the CRM contact",
               "default": ""
            }
         },
         "required": [
            "firstname",
            "lastname",
            "phone",
            "title",
            "description",
            "ticket_type",
            "ticket_reason"
         ],
         "additionalProperties": false
      },
      "implementation": {
         "type": "http",
         "url": "https://ai-data-endpoint.aws.icuracao.com/create-service-case",
         "method": "POST",
         "contentType": "application/json",
         "timeout": 45000,
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
               "ticket_number": {
                  "path": "ticket_number",
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
         "requiresAuth": false,
         "auditLevel": "high",
         "dataClassification": "customer_service",
         "rateLimit": {
            "requests": 20,
            "window": 60000
         }
      }
   },
   {
      "id": "get-payment-profile",
      "name": "Get Payment Profile",
      "description": "Retrieves saved payment cards/profiles for a customer account",
      "parameters": {
         "type": "object",
         "properties": {
            "account_number": {
               "type": "string",
               "description": "The customer's account number"
            }
         },
         "required": [
            "account_number"
         ],
         "additionalProperties": false
      },
      "implementation": {
         "type": "http",
         "url": "https://wh-consumer.aws.icuracao.com/get-payment-profile",
         "method": "POST",
         "contentType": "application/json",
         "timeout": 20000,
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
               "profile_id": {
                  "path": "data.profile",
                  "fallback": null
               },
               "cards": {
                  "path": "data.cards",
                  "fallback": []
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
      "id": "charge-payment-profile",
      "name": "Charge Payment Profile",
      "description": "Processes a payment using a saved card on file",
      "parameters": {
         "type": "object",
         "properties": {
            "accountNumber": {
               "type": "string",
               "description": "The customer's account number"
            },
            "paymentProfileId": {
               "type": "string",
               "description": "The saved card's payment profile ID"
            },
            "fee": {
               "type": "number",
               "description": "Processing fee amount",
               "default": 0
            },
            "payments": {
               "type": "array",
               "description": "Array of payment objects with subaccount and amount, e.g. [{subaccount: '70', amount: 50.00}]"
            }
         },
         "required": [
            "accountNumber",
            "paymentProfileId",
            "payments"
         ],
         "additionalProperties": false
      },
      "implementation": {
         "type": "http",
         "url": "https://wh-consumer.aws.icuracao.com/charge-profile",
         "method": "POST",
         "contentType": "application/json",
         "timeout": 30000,
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
               "code": {
                  "path": "code",
                  "fallback": null
               },
               "message": {
                  "path": "error_message",
                  "fallback": "Unknown response"
               },
               "data": {
                  "path": "data",
                  "fallback": null
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
            "requests": 5,
            "window": 60000
         }
      }
   },
   {
      "id": "charge-new-card",
      "name": "Charge New Card",
      "description": "Processes a payment using a new credit or debit card",
      "parameters": {
         "type": "object",
         "properties": {
            "accountNumber": {
               "type": "string",
               "description": "The customer's account number"
            },
            "saveCard": {
               "description": "Whether to save the card for future payments",
               "default": false
            },
            "card": {
               "type": "object",
               "description": "Card details object with cardNumber, expirationMonth, expirationYear, cvv, zip"
            },
            "fee": {
               "type": "number",
               "description": "Processing fee amount",
               "default": 0
            },
            "payments": {
               "type": "array",
               "description": "Array of payment objects with subaccount and amount, e.g. [{subaccount: '70', amount: 50.00}]"
            }
         },
         "required": [
            "accountNumber",
            "card",
            "payments"
         ],
         "additionalProperties": false
      },
      "implementation": {
         "type": "http",
         "url": "https://wh-consumer.aws.icuracao.com/charge-card",
         "method": "POST",
         "contentType": "application/json",
         "timeout": 30000,
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
               "code": {
                  "path": "code",
                  "fallback": null
               },
               "message": {
                  "path": "error_message",
                  "fallback": "Unknown response"
               },
               "data": {
                  "path": "data",
                  "fallback": null
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
            "requests": 5,
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
      "description": "This flow allows the user to facilitate a payment by sending a 'Payment Link' to their cell or email. This flow should be triggered by prompts like 'make a payment', 'payment link', 'I want to pay my balance', 'I want to pay off / settle my balance', 'liquidar', 'liquidar toda la deuda', 'liquidar mi saldo', 'pagar todo', etc. (treat a request to pay off, settle, or 'liquidar' the balance as a payment intent). IMPORTANT: It should NEVER be triggered by prompts related to 'payment arrangement', 'financial difficulties', 'balance', 'how much do I owe?', 'what's my payment?' or 'when is my payment due?'. It should also NEVER be triggered when a customer reports trouble completing a payment (e.g. 'my payment won't go through', 'payment declined', 'error when paying'). Those are payment troubleshooting issues — provide guidance like 'please verify all information matches your credit/debit card exactly as issued' before considering a service case. Do NOT classify payment difficulties as 'missing payment'. It should also NEVER be triggered for billing inquiries ('why was I charged', 'what are these charges', 'explain my bill'), travel services, price matching, login/portal issues, or any intent that is not explicitly about sending a new payment link.",
      "prompt": "Payment",
      "prompt_es": "Pago",
      "primary": true,
      "parameters": [
         {
            "name": "acct_number",
            "type": "string",
            "description": "Customer account number (if user provided it in the query - must start with '5' and be 7-8 digits long)"
         },
         {
            "name": "cell_number",
            "type": "string",
            "description": "Customer phone number (if user provided it in the query)"
         },
         {
            "name": "email",
            "type": "string",
            "description": "Customer email address (if user provided it in the query - must be valid email format)"
         }
      ],
      "variables": {
         "payment_channel_choice": {
            "type": "string",
            "description": "User upfront choice: LINK (send payment link) vs. PAY (authenticate and process payment in-conversation)",
            "value": ""
         },
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
            "id": "ask_payment_channel",
            "type": "CASE",
            "branches": {
               "condition: cargo.accountNumber": {
                  "id": "skip_already_known_account",
                  "type": "SET",
                  "variable": "payment_channel_choice",
                  "value": "'pay'"
               },
               "default": {
                  "id": "prompt_payment_channel",
                  "type": "SAY-GET",
                  "variable": "payment_channel_choice",
                  "value": "Sure, I can help with your payment. Would you prefer to process the payment here, or would you like me to send you a secure payment link {{cell_number ? 'to ' + cell_number + ' ' : email ? 'to ' + email + ' ' : 'by text and email'}}? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} PAY to pay right now, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} LINK for a payment link.",
                  "value_es": "Claro, puedo ayudarle con su pago. ¿Prefiere procesar el pago aquí, o prefiere que le envíe un enlace de pago seguro {{cell_number ? 'a ' + cell_number + ' ' : email ? 'a ' + email + ' ' : 'por texto y correo electrónico'}}? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} PAGAR para pagar ahora mismo, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} ENLACE para un enlace de pago.",
                  "digits": { "min": 1, "max": 1 }
               }
            }
         },
         {
            "id": "normalize_payment_channel_choice",
            "type": "SET",
            "variable": "payment_channel_choice",
            "value": "payment_channel_choice.trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "branch_payment_channel_choice",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(payment_channel_choice, ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_payment_channel",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: matchesChoice(payment_channel_choice, ['pay','pagar','here','1','process','pay here','aqui','aquí','procesar','pagar aqui','pagar aquí','authenticate','autenticar','liquidar','liquidacion','liquidación','liquidate','pay off','payoff','settle']) || /\\b(ahora|ahorita|now|mismo)\\b/.test(payment_channel_choice)": {
                  "id": "route_to_authenticated_payment_upfront",
                  "type": "FLOW",
                  "value": "locate-account",
                  "callType": "replace",
                  "parameters": { "facilitatePayments": true }
               },
               "condition: matchesChoice(payment_channel_choice, ['link','2','send','enlace','envia','envía','enviar','sms','email','text','correo'])": {
                  "id": "chose_link_continue",
                  "type": "SET",
                  "variable": "noop_chose_link",
                  "value": "true"
               },
               "default": {
                  "id": "reask_payment_channel",
                  "type": "SAY-GET",
                  "variable": "payment_channel_choice",
                  "value": "Sorry, I didn't catch that. {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} PAY to pay right now, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} LINK for a payment link.",
                  "value_es": "Lo siento, no le entendí. {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} PAGAR para pagar ahora mismo, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} ENLACE para un enlace de pago.",
                  "digits": { "min": 1, "max": 1 }
               }
            }
         },
         {
            "id": "renormalize_payment_channel_choice",
            "type": "SET",
            "variable": "payment_channel_choice",
            "value": "payment_channel_choice.trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "branch_payment_channel_retry",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(payment_channel_choice, ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_payment_channel_retry",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: matchesChoice(payment_channel_choice, ['pay','pagar','here','1','process','pay here','aqui','aquí','procesar','pagar aqui','pagar aquí','authenticate','autenticar','liquidar','liquidacion','liquidación','liquidate','pay off','payoff','settle']) || /\\b(ahora|ahorita|now|mismo)\\b/.test(payment_channel_choice)": {
                  "id": "route_to_authenticated_payment_retry",
                  "type": "FLOW",
                  "value": "locate-account",
                  "callType": "replace",
                  "parameters": { "facilitatePayments": true }
               },
               "default": {
                  "id": "payment_channel_default_to_link",
                  "type": "SET",
                  "variable": "noop_chose_link",
                  "value": "true"
               }
            }
         },
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
                  "value": "To send you a payment link I need to locate your account. To use your caller ID please {{cargo.verb}} YES.\nOtherwise please enter{{cargo.voice ? ' or ' + cargo.verb : ''}} the account number, or the account's phone or email.\nTo exit at any time {{cargo.voice ? 'just press the star key, or ' : ''}}{{cargo.verb}} EXIT.{{cargo.voice ? ' When entering on the keypad, press the pound key when you are done.' : ''}}",
                  "value_es": "Para enviarte un enlace de pago, necesito localizar tu cuenta. Para usar tu identificador de llamada, por favor {{cargo.verb_es}} SÍ.\nDe lo contrario, por favor ingresa{{cargo.voice ? ' o ' + cargo.verb_es : ''}} el número de cuenta, o el teléfono o correo electrónico de la cuenta.\nPara salir en cualquier momento {{cargo.voice ? 'solo presiona la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR.{{cargo.voice ? ' Al ingresar con el teclado, presione la tecla numeral cuando termine.' : ''}}",
                  "digits": {
                     "min": 7,
                     "max": 12,
                     "autoSubmitChars": [
                        "1"
                     ],
                     "autoSubmitMs": 4500
                  }
               },
               "condition: !acct_number && !cell_number && !email": {
                  "id": "ask_account_number",
                  "type": "SAY-GET",
                  "variable": "payment_link_choice",
                  "value": "To send you a payment link I need to locate your account. Please enter{{cargo.voice ? ' or ' + cargo.verb : ''}} the account number, or the account's phone or email.\nTo exit at any time {{cargo.voice ? 'just press the star key, or ' : ''}}{{cargo.verb}} EXIT.{{cargo.voice ? ' When entering on the keypad, press the pound key when you are done.' : ''}}",
                  "value_es": "Para enviarte un enlace de pago, necesito localizar tu cuenta. Por favor ingresa{{cargo.voice ? ' o ' + cargo.verb_es : ''}} el número de cuenta, o el teléfono o correo electrónico de la cuenta.\nPara salir en cualquier momento {{cargo.voice ? 'solo presiona la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR.{{cargo.voice ? ' Al ingresar con el teclado, presione la tecla numeral cuando termine.' : ''}}",
                  "digits": {
                     "min": 7,
                     "max": 12,
                     "autoSubmitMs": 4500
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
            "id": "normalize_payment_link_choice",
            "type": "SET",
            "variable": "normalized_payment_link_choice",
            "value": "payment_link_choice.toLowerCase().replace(/\\s+/g, '')"
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
                     "cancel_flow": "contact-support-with-context",
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
               "condition: cargo.callerId && (matchesChoice(normalized_payment_link_choice, ['1', 'yes', 'yeah', 'yep', 'yup', 'sure', 'absolutely', 'definitely', 'of course', 'go ahead', 'sounds good', 'correct', 'please', 'ok', 'okay', 'thanks', 'thank you', 'pay', 'link', 'si', 'sí', 'claro', 'adelante', 'por supuesto', 'dale', 'está bien', 'esta bien', 'seguro', 'por favor', 'gracias', 'pago', 'enlace']) || matchesChoice(normalized_payment_link_choice, ['phone', 'cell', 'caller id', 'number', 'numero', 'número', 'telefono', 'teléfono', 'celular', 'identificador de llamadas']))": {
                  "id": "use_caller_id",
                  "type": "SET",
                  "variable": "cell_number",
                  "value": "cargo.callerId"
               },
               "condition: matchesChoice(normalized_payment_link_choice, ['live', 'agent', 'customer service', 'representative', 'agente', 'gente', 'gerente', 'al cliente', 'representante', 'servidor', 'hablar con alguien']) || normalized_payment_link_choice == '0'": {
                  "id": "goto_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "reboot"
               },
               "condition: matchesChoice(normalized_payment_link_choice, ['*', 'abort', 'exit', 'quit', 'salir'])": {
                  "id": "abort_process",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "payment",
                     "support_context_es": "pago"
                  }
               },
               "condition: cargo.callerId && prospective_cell_number && ! validatePhone(prospective_cell_number)": {
                  "id": "fallback_to_caller_id_invalid_phone",
                  "type": "SET",
                  "variable": "cell_number",
                  "value": "cargo.callerId"
               },
               "condition: prospective_cell_number && ! validatePhone(prospective_cell_number)": {
                  "id": "invalid_phone_number_format",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "Sorry, the phone number you provided isn't valid.",
                     "error_message_es": "Lo siento, el número de teléfono que proporcionó no es válido.",
                     "retry_flow": "start-payment",
                     "cancel_flow": "contact-support-with-context",
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
               "condition: cargo.callerId": {
                  "id": "fallback_to_caller_id_unrecognized",
                  "type": "SET",
                  "variable": "cell_number",
                  "value": "cargo.callerId"
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
                     "cancel_flow": "contact-support-with-context",
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
                     "cancel_flow": "contact-support-with-context",
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
         }
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
            "id": "preresolve_account_when_phone_only",
            "type": "CASE",
            "branches": {
               "condition: !normalized_account_number && normalized_phone_number": {
                  "id": "preresolve_phone_lookup",
                  "type": "CALL-TOOL",
                  "tool": "lookup-account",
                  "variable": "pl_lookup_result",
                  "args": {
                     "email": "",
                     "phone_number": "{{normalized_phone_number}}"
                  },
                  "onFail": {
                     "id": "preresolve_lookup_tool_failed",
                     "type": "SET",
                     "variable": "pl_lookup_result",
                     "value": "null"
                  }
               },
               "default": {
                  "id": "skip_preresolve",
                  "type": "SET",
                  "variable": "pl_lookup_result",
                  "value": "null"
               }
            }
         },
         {
            "id": "apply_preresolve_result",
            "type": "SET",
            "variable": "preresolve_side_effect",
            "value": "(function() { cargo.plNeedsDal = false; cargo.plResolvedAccount = ''; if (pl_lookup_result && pl_lookup_result.success && pl_lookup_result.customer_info && pl_lookup_result.customer_info.cust_id) { cargo.plResolvedAccount = pl_lookup_result.customer_info.cust_id + ''; } else if (pl_lookup_result && pl_lookup_result.multiple_records) { cargo.dalPhone = normalized_phone_number; cargo.dalSuccessFlow = 'payment-link-after-disambiguation'; cargo.dalNotFoundFlow = 'payment-link-failed'; cargo.dalAttempts = 0; cargo.plNeedsDal = true; } return true; })()"
         },
         {
            "id": "use_resolved_account_number",
            "type": "SET",
            "variable": "normalized_account_number",
            "value": "cargo.plResolvedAccount ? cargo.plResolvedAccount : normalized_account_number"
         },
         {
            "id": "prefer_account_over_phone",
            "type": "SET",
            "variable": "normalized_phone_number",
            "value": "normalized_account_number ? '' : normalized_phone_number"
         },
         {
            "id": "prefer_account_over_email",
            "type": "SET",
            "variable": "normalized_email",
            "value": "normalized_account_number ? '' : normalized_email"
         },
         {
            "id": "route_to_disambiguation_if_needed",
            "type": "CASE",
            "branches": {
               "condition: cargo.plNeedsDal === true": {
                  "id": "enter_link_disambiguation",
                  "type": "FLOW",
                  "value": "disambiguate-account-lookup",
                  "callType": "replace"
               },
               "default": {
                  "id": "noop_no_disambiguation_needed",
                  "type": "SET",
                  "variable": "noop_no_dal",
                  "value": "true"
               }
            }
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
            "value": "Would you like me to send a payment link for account ending with {{cargo.accountNumber.slice(-4).split('').join(', ')}}? To send the payment link {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES. To forget this account so you can select a different account, {{cargo.verb}} FORGET.",
            "value_es": "¿Le gustaría que le enviara un enlace de pago para la cuenta que termina en {{cargo.accountNumber.slice(-4).split('').join(', ')}}? Para enviar el enlace de pago {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ. Para olvidar esta cuenta y seleccionar una cuenta diferente, {{cargo.verb_es}} OLVIDAR.",
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
               "condition: matchesChoice(send_payment_link, ['1', 'yes', 'yeah', 'yep', 'yup', 'sure', 'absolutely', 'definitely', 'of course', 'go ahead', 'sounds good', 'correct', 'please', 'ok', 'okay', 'thanks', 'si', 'sí', 'claro', 'adelante', 'por supuesto', 'dale', 'está bien', 'esta bien', 'seguro', 'por favor', 'gracias'])": {
                  "id": "send_and_validate_payment_link",
                  "type": "FLOW",
                  "value": "generate-and-validate-payment-link",
                  "callType": "call"
               },
               "condition: matchesChoice(send_payment_link, ['forget', 'start over', 'olvidar', 'empezar de nuevo'])": {
                  "id": "forget_account_and_restart",
                  "type": "SET",
                  "variable": "forget_side_effect",
                  "value": "cargo.accountNumber = null"
               },
               "condition: matchesChoice(send_payment_link, ['*', 'abort', 'exit', 'quit', 'salir', 'no'])": {
                  "id": "abort_process",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "payment",
                     "support_context_es": "pago"
                  }
               },
               "condition: matchesChoice(send_payment_link, ['live', 'agent', 'customer service', 'representative', 'agente', 'gente', 'gerente', 'al cliente', 'representante', 'servidor', 'hablar con alguien']) || send_payment_link == '0'": {
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
      "id": "auth-failed-send-link",
      "name": "AuthFailedSendLink",
      "version": "1.0.0",
      "description": "Fallback when the customer cannot complete OTP authentication during the payment flow (cancels/exits or the code is invalid). Instead of dead-ending at contact-support, automatically attempt to send a secure payment link to the email or cell already collected during authentication, then confirm. Only the payment-link tool's own failure handling routes onward to contact-support.",
      "steps": [
         {
            "id": "check_contact_available_for_link",
            "type": "CASE",
            "branches": {
               "condition: cargo.accountNumber || cargo.otp_email || cargo.otp_cell_number": {
                  "id": "map_email_for_link",
                  "type": "SET",
                  "variable": "email",
                  "value": "cargo.otp_email || ''"
               },
               "default": {
                  "id": "no_contact_fallback_to_support",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "payment",
                     "support_context_es": "pago"
                  }
               }
            }
         },
         {
            "id": "map_cell_for_link",
            "type": "SET",
            "variable": "cell_number",
            "value": "cargo.otp_cell_number || ''"
         },
         {
            "id": "say_attempting_link",
            "type": "SAY",
            "value": "I couldn't verify your identity, but I can still send you a secure payment link using the contact information you provided.",
            "value_es": "No pude verificar su identidad, pero aún puedo enviarle un enlace de pago seguro utilizando la información de contacto que proporcionó."
         },
         {
            "id": "attempt_payment_link",
            "type": "FLOW",
            "value": "generate-and-validate-payment-link",
            "callType": "call"
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
               "cancel_flow": "contact-support-with-context",
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
      "id": "payment-link-after-disambiguation",
      "name": "PaymentLinkAfterDisambiguation",
      "version": "1.0.0",
      "description": "Resume the payment-link path after disambiguate-account-lookup resolved a phone number shared by multiple accounts. Copies the resolved account number into the link request, clears the ambiguous phone number and the disambiguation routing flags, then re-enters generate-and-validate-payment-link so the link is generated for the confirmed account instead of the backend guessing among the matches.",
      "steps": [
         {
            "id": "set_resolved_acct_number",
            "type": "SET",
            "variable": "acct_number",
            "value": "(lookup_result && lookup_result.customer_info && lookup_result.customer_info.cust_id) ? (lookup_result.customer_info.cust_id + '') : ''"
         },
         {
            "id": "clear_ambiguous_cell_number",
            "type": "SET",
            "variable": "cell_number",
            "value": "''"
         },
         {
            "id": "clear_dal_routing_flags",
            "type": "SET",
            "variable": "dal_flags_side_effect",
            "value": "cargo.dalPhone = '', cargo.dalSuccessFlow = '', cargo.dalNotFoundFlow = '', cargo.dalAttempts = 0, cargo.plNeedsDal = false"
         },
         {
            "id": "check_resolved_acct",
            "type": "CASE",
            "branches": {
               "condition: acct_number": {
                  "id": "regenerate_link_with_account",
                  "type": "FLOW",
                  "value": "generate-and-validate-payment-link",
                  "callType": "replace"
               },
               "default": {
                  "id": "resolved_acct_missing_fail",
                  "type": "FLOW",
                  "value": "payment-link-failed",
                  "callType": "reboot"
               }
            }
         }
      ]
   },
   {
      "id": "payment-link-succeeded",
      "name": "PaymentLinkSucceeded",
      "version": "1.0.0",
      "description": "Handle successful payment link delivery. IMPORTANT: The credit monitoring offer at the end of this flow should only be presented AFTER the payment link has been successfully sent and confirmed. Never interrupt the customer's primary payment intent with secondary offers. If the customer has expressed urgency or frustration, skip the CCM offer entirely.",
      "steps": [
         {
            "id": "set_account_number",
            "type": "SET",
            "variable": "validated_account_number",
            "value": "cargo.accountNumber = payment_link_result.customer_info?.cust_id || cargo.accountNumber"
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
            "id": "say_payment_succeeded_if_no_ccm",
            "type": "CASE",
            "branches": {
               "condition: cargo.experian_link_sent": {
                  "id": "say_payment_succeeded_terminal",
                  "type": "SAY",
                  "value": "Great! Payment link for account ending with {{cargo.accountNumber.slice(-4).split('').join(', ')}} was sent to {{payment_link_result.customer_info.email && payment_link_result.customer_info.cell ? 'your email ' + masked_email + ' and cell ending with ' + cell_last4 : payment_link_result.customer_info.email ? 'your email ' + masked_email : 'your cell ending with ' + cell_last4}}. Click the link and you'll already be logged in. Then, just select your payment options and click submit. It's that easy!",
                  "value_es": "¡Genial! El enlace de pago para la cuenta que termina en {{cargo.accountNumber.slice(-4).split('').join(', ')}} se envió a {{payment_link_result.customer_info.email && payment_link_result.customer_info.cell ? 'tu correo electrónico ' + masked_email + ' y celular que termina en ' + cell_last4 : payment_link_result.customer_info.email ? 'tu correo electrónico ' + masked_email : 'tu celular que termina en ' + cell_last4}}. Haz clic en el enlace y ya estarás conectado. Luego, solo selecciona tus opciones de pago y haz clic en enviar. ¡Es así de fácil!"
               },
               "default": {
                  "id": "noop_say_will_be_combined_with_ccm",
                  "type": "SET",
                  "variable": "noop_say_combined",
                  "value": "true"
               }
            }
         },
         {
            "id": "ask_credit_monitoring",
            "type": "CASE",
            "branches": {
               "condition: !cargo.experian_link_sent": {
                  "id": "ask_credit_monitoring_prompt",
                  "type": "SAY-GET",
                  "variable": "credit_monitoring_choice",
                  "value": "Great! Payment link for account ending with {{cargo.accountNumber.slice(-4).split('').join(', ')}} was sent to {{payment_link_result.customer_info.email && payment_link_result.customer_info.cell ? 'your email ' + masked_email + ' and cell ending with ' + cell_last4 : payment_link_result.customer_info.email ? 'your email ' + masked_email : 'your cell ending with ' + cell_last4}}. Click the link and you'll already be logged in. Then, just select your payment options and click submit. It's that easy!\n\nOne quick thing that can save you a headache later, Curacao's Credit Monitor helps you spot suspicious personal credit activity fast and it also includes identity theft support\nIf you want to receive a text with a secure link to review and enroll, just {{cargo.voice ? 'press 1 or ' : ''}}{{cargo.verb}} YES.",
                  "value_es": "¡Genial! El enlace de pago para la cuenta que termina en {{cargo.accountNumber.slice(-4).split('').join(', ')}} se envió a {{payment_link_result.customer_info.email && payment_link_result.customer_info.cell ? 'tu correo electrónico ' + masked_email + ' y celular que termina en ' + cell_last4 : payment_link_result.customer_info.email ? 'tu correo electrónico ' + masked_email : 'tu celular que termina en ' + cell_last4}}. Haz clic en el enlace y ya estarás conectado. Luego, solo selecciona tus opciones de pago y haz clic en enviar. ¡Es así de fácil!\n\nUna cosa rápida que puede ahorrarte un dolor de cabeza más adelante, el Monitor de Crédito de Curacao te ayuda a detectar actividad crediticia personal sospechosa rápidamente y también incluye soporte para robo de identidad\nSi deseas recibir un mensaje de texto con un enlace seguro para revisar y registrarte, solo {{cargo.voice ? 'presiona 1 o ' : ''}}{{cargo.verb_es}} SÍ.",
                  "digits": {
                     "min": 1,
                     "max": 1
                  }
               },
               "default": {
                  "id": "skip_credit_monitoring_already_sent",
                  "type": "SET",
                  "variable": "credit_monitoring_skipped",
                  "value": "true"
               }
            }
         },
         {
            "id": "process_credit_monitoring",
            "type": "CASE",
            "branches": {
               "condition: !cargo.experian_link_sent": {
                  "id": "run_credit_monitoring_process",
                  "type": "FLOW",
                  "value": "process-user-response-to-ccm-offer",
                  "callType": "call"
               },
               "default": {
                  "id": "skip_process_credit_monitoring",
                  "type": "SET",
                  "variable": "credit_monitoring_skipped",
                  "value": "true"
               }
            }
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
            "value": "(function() { var junk = /\\b(user|guest|customer|curacao|llamante|cliente|invitado|usuario|wireless|unavailable|unknown|anonymous|private|caller|restricted|name)\\b/i; var digitsOnly = /^[\\d\\s\\-()+.]+$/; var ok = function(s) { s = (s || '').trim(); return !!s && !junk.test(s) && !/curacao/i.test(s) && !digitsOnly.test(s); }; var cap = function(s) { return s.toLowerCase().replace(/(^|[\\s\\-'])([a-zà-öø-ÿ])/g, function(m, p, c) { return p + c.toUpperCase(); }).replace(/\\s+/g, ' ').trim(); }; if (typeof cargo.firstName !== 'undefined' && ok(cargo.firstName)) { return cargo.firstName.trim(); } var d = (display_name && display_name !== 'Not available') ? display_name.trim() : ''; if (!d || !ok(d)) { return ''; } d = d.replace(/\\d+/g, ''); if (d.indexOf(',') !== -1) { var f = d.split(',').slice(1).join(' ').replace(/\\s+/g, ' ').trim(); return f ? cap(f) : ''; } var first = d.replace(/\\s+/g, ' ').split(' ')[0]; return ok(first) ? cap(first) : ''; })()"
         },
         {
            "id": "extract_customer_last_name",
            "type": "SET",
            "variable": "customer_last_name",
            "value": "(function() { var junk = /\\b(user|guest|customer|curacao|llamante|cliente|invitado|usuario|wireless|unavailable|unknown|anonymous|private|caller|restricted|name)\\b/i; var digitsOnly = /^[\\d\\s\\-()+.]+$/; var ok = function(s) { s = (s || '').trim(); return !!s && !junk.test(s) && !/curacao/i.test(s) && !digitsOnly.test(s); }; var cap = function(s) { return s.toLowerCase().replace(/(^|[\\s\\-'])([a-zà-öø-ÿ])/g, function(m, p, c) { return p + c.toUpperCase(); }).replace(/\\s+/g, ' ').trim(); }; if (typeof cargo.lastName !== 'undefined' && ok(cargo.lastName)) { return cargo.lastName.trim(); } var d = (display_name && display_name !== 'Not available') ? display_name.trim() : ''; if (!d || !ok(d)) { return ''; } d = d.replace(/\\d+/g, ''); if (d.indexOf(',') !== -1) { var l = d.split(',')[0].replace(/\\s+/g, ' ').trim(); return l ? cap(l) : ''; } var parts = d.replace(/\\s+/g, ' ').split(' '); return parts.length > 1 ? cap(parts.slice(1).join(' ')) : ''; })()"
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
            "value_es": "Me disculpo, pero estoy teniendo problemas para crear tu ticket de soporte en este momento. Resultado: {{ticket_result}}",
            "outcome": "unresolved",
            "reason": "ticket_creation_failed"
         }
      ]
   },
   {
      "id": "offer-alt-contact",
      "name": "OfferAltContact",
      "version": "1.0.0",
      "description": "Sub-flow: reached when the account lookup found nothing for the contact the customer authenticated with. Offers the other contact method, or a different number of the same kind, and lets anything else fall through to the AI. Clears the verified-OTP state before restarting so authenticate-user re-verifies the new contact instead of short-circuiting on the old one. The caller passes target_flow so the customer resumes whatever they were originally doing; defaults to locate-account.",
      "parameters": [
         {
            "name": "target_flow",
            "type": "string",
            "description": "Flow to reboot once a new contact is supplied (default: locate-account)"
         }
      ],
      "variables": {
         "alt_contact": {
            "type": "string",
            "description": "Email address or phone number typed by the customer"
         }
      },
      "steps": [
         {
            "id": "build_alt_prompt",
            "type": "SET",
            "variable": "noop_build_alt_prompt",
            "value": "(function() { cargo.alt_target = (typeof target_flow !== 'undefined' && target_flow) ? target_flow : 'locate-account'; var usedPhone = cargo.alt_failed_contact ? (cargo.alt_failed_contact === 'phone') : (cargo.otp_cell_number ? true : false); cargo.alt_failed_contact = ''; cargo.alt_prompt = usedPhone ? 'Sorry, I could not locate your account with that phone number. We can try your email instead, or a different phone number. You can also ask me anything else' + (cargo.voice ? ', or press 9 or say TEXT to switch to texting.' : '.') : 'Sorry, I could not locate your account with that email address. We can try a phone number instead, or a different email address. You can also ask me anything else' + (cargo.voice ? ', or press 9 or say TEXT to switch to texting.' : '.'); cargo.alt_prompt_es = usedPhone ? 'Lo siento, no pude localizar su cuenta con ese numero de telefono. Podemos intentar con su correo electronico, o con otro numero de telefono. Tambien puede preguntarme cualquier otra cosa' + (cargo.voice ? ', o presione 9 o diga TEXTO para cambiar a mensajes de texto.' : '.') : 'Lo siento, no pude localizar su cuenta con ese correo electronico. Podemos intentar con un numero de telefono, o con otro correo electronico. Tambien puede preguntarme cualquier otra cosa' + (cargo.voice ? ', o presione 9 o diga TEXTO para cambiar a mensajes de texto.' : '.'); return true; })()"
         },
         {
            "id": "ask_alt_contact",
            "type": "SAY-GET",
            "variable": "alt_contact",
            "value": "{{cargo.alt_prompt}}",
            "value_es": "{{cargo.alt_prompt_es}}"
         },
         {
            "id": "normalize_alt_contact",
            "type": "SET",
            "variable": "alt_contact",
            "value": "(alt_contact || '').trim()"
         },
         {
            "id": "clear_verified_state",
            "type": "SET",
            "variable": "noop_clear_verified_state",
            "value": "cargo.otpVerified = false, cargo.otp_cell_number = null, cargo.otp_email = null, cargo.otpHash = null, cargo.otpTimestamp = null"
         },
         {
            "id": "route_alt_contact",
            "type": "CASE",
            "branches": {
               "condition: validateEmail(alt_contact)": {
                  "id": "retry_with_email",
                  "type": "FLOW",
                  "value": "{{cargo.alt_target}}",
                  "callType": "reboot",
                  "parameters": {
                     "email": "{{alt_contact}}"
                  }
               },
               "condition: validatePhone(alt_contact)": {
                  "id": "retry_with_phone",
                  "type": "FLOW",
                  "value": "{{cargo.alt_target}}",
                  "callType": "reboot",
                  "parameters": {
                     "cell_number": "{{alt_contact}}"
                  }
               },
               "condition: ['exit','quit','salir','abort','cancel','cancelar','stop','*'].indexOf((alt_contact || '').toLowerCase()) > -1": {
                  "id": "alt_contact_exit",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "account verification",
                     "support_context_es": "verificación de cuenta"
                  }
               },
               "condition: ['live agent','agent','agente','representative','representante','customer service','servicio al cliente','servidor','hablar con alguien','0'].indexOf((alt_contact || '').toLowerCase()) > -1": {
                  "id": "alt_contact_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "reboot"
               },
               "condition: ['text','texto','9'].indexOf((alt_contact || '').toLowerCase()) > -1": {
                  "id": "alt_contact_switch_to_text",
                  "type": "FLOW",
                  "value": "switch-to-text",
                  "callType": "reboot"
               },
               "default": {
                  "id": "alt_contact_forward_to_ai",
                  "type": "RETURN",
                  "value": "''"
               }
            }
         }
      ]
   },
   {
      "id": "locate-account",
      "name": "LocateAccount",
      "version": "1.0.0",
      "description": "This flow allows the user to get information about their account by authenticating their cell or email, to answer questions about their balance, payment due, available credit, etc.. IMPORTANT: This flow should NEVER trigger for prompts related to 'payment arrangements' as it requires negotiation and should be directed to a future arrangement flow. Similarly, PII related prompts related to 'Social Security number', or 'credit card account number' — those requests should go to the service case flow instead.",
      "prompt": "Account information",
      "prompt_es": "Información de la cuenta",
      "primary": true,
      "parameters": [
         {
            "name": "cell_number",
            "type": "string",
            "description": "Customer cell number (if user provided it in the query)"
         },
         {
            "name": "email",
            "type": "string",
            "description": "Customer email (if user provided it in the query)"
         },
         {
            "name": "facilitatePayments",
            "type": "boolean",
            "description": "When true, after authentication route into the in-conversation payment processing UI instead of just showing account info. Defaults to false."
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
            "value": ""
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
            "id": "set_facilitate_payments",
            "type": "SET",
            "variable": "facilitate_side_effect",
            "value": "cargo.facilitatePayments = (typeof facilitatePayments !== 'undefined' && facilitatePayments === true) || (cargo.facilitatePayments === true)"
         },
         {
            "id": "set_support_context",
            "type": "SET",
            "variable": "support_context_side_effect",
            "value": "cargo.support_context = 'account', cargo.support_context_es = 'cuenta'"
         },
         {
            "id": "check_account_info_already_provided",
            "type": "CASE",
            "branches": {
               "condition: cargo.facilitatePayments === true && cargo.authenticatedAccount === true && cargo.accountNumber": {
                  "id": "already_provided_route_to_payment",
                  "type": "FLOW",
                  "value": "load-subaccounts-and-pay",
                  "callType": "reboot"
               },
               "condition: cargo.authenticatedAccount === true && cargo.userContext": {
                  "id": "account_info_already_provided",
                  "type": "RETURN",
                  "value": "''"
               },
               "default": {
                  "id": "noop_account_info_not_yet_provided",
                  "type": "SET",
                  "variable": "noop_account_info_check",
                  "value": "true"
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
               "condition: cargo.facilitatePayments === true && cargo.accountCell": {
                  "id": "facilitate_use_existing_cell",
                  "type": "SET",
                  "variable": "cell_number",
                  "value": "cargo.accountCell"
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
            "id": "preface-prompt",
            "type": "SAY",
            "value": "To secure access to your account you must have access to the account's phone or email.",
            "value_es": "Para asegurar el acceso a tu cuenta, debes tener acceso al teléfono o al correo electrónico de la cuenta."
         },
         {
            "id": "authenticate_user",
            "type": "FLOW",
            "value": "authenticate-user",
            "callType": "call",
            "parameters": {
               "retry_flow": "locate-account",
               "cancel_flow": "auth-failed-send-link",
               "cell_number": "{{cell_number}}",
               "email": "{{email}}",
               "email_validator": "validate-email-has-account"
            }
         },
         {
            "id": "perform_lookup",
            "type": "CASE",
            "branches": {
               "condition: cargo.facilitatePayments === true && cargo.accountNumber": {
                  "id": "skip_lookup_for_payment",
                  "type": "FLOW",
                  "value": "load-subaccounts-and-pay",
                  "callType": "reboot"
               },
               "default": {
                  "id": "do_normal_lookup",
                  "type": "FLOW",
                  "value": "validate-otp-result-and-perform-account-lookup",
                  "callType": "call"
               }
            }
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
               "condition: matchesChoice(use_existing_contact, ['1', 'yes', 'yeah', 'yep', 'yup', 'sure', 'absolutely', 'definitely', 'of course', 'go ahead', 'sounds good', 'correct', 'please', 'ok', 'okay', 'thanks', 'si', 'sí', 'claro', 'adelante', 'por supuesto', 'dale', 'está bien', 'esta bien', 'seguro', 'por favor', 'gracias'])": {
                  "id": "use_existing_contact_info",
                  "type": "SET",
                  "variable": "cell_number",
                  "value": "cargo.accountCell"
               },
               "condition: matchesChoice(use_existing_contact, ['2', 'no', 'nope', 'nah', 'no thanks', 'not really', 'negative'])": {
                  "id": "goto_manual_entry",
                  "type": "FLOW",
                  "value": "get-cell-or-email",
                  "callType": "replace"
               },
               "condition: matchesChoice(use_existing_contact, ['*', 'abort', 'exit', 'quit', 'salir'])": {
                  "id": "abort_process",
                  "type": "FLOW",
                  "value": "cancel-process",
                  "callType": "reboot"
               },
               "condition: matchesChoice(use_existing_contact, ['live', 'agent', 'customer service', 'representative', 'agente', 'gente', 'gerente', 'al cliente', 'representante', 'servidor', 'hablar con alguien']) || use_existing_contact == '0'": {
                  "id": "goto_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "reboot"
               },
               "default": {
                  "id": "retry_existing_contact_choice",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "account verification",
                     "support_context_es": "verificación de cuenta"
                  }
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
            "id": "record_failed_contact",
            "type": "SET",
            "variable": "noop_record_failed_contact",
            "value": "cargo.alt_failed_contact = cargo.otp_cell_number ? 'phone' : 'email'"
         },
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
            "id": "invoke_alt_contact",
            "type": "FLOW",
            "value": "offer-alt-contact",
            "callType": "replace"
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
            "id": "reset_dal_routing_flags",
            "type": "SET",
            "variable": "dal_flags_reset_side_effect",
            "value": "cargo.dalPhone = '', cargo.dalSuccessFlow = '', cargo.dalNotFoundFlow = '', cargo.dalAttempts = 0, cargo.plNeedsDal = false"
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
                     "cancel_flow": "contact-support-with-context"
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
               "condition: lookup_result && lookup_result.multiple_records": {
                  "id": "route_disambiguation",
                  "type": "FLOW",
                  "value": "disambiguate-account-lookup",
                  "callType": "replace"
               },
               "default": {
                  "id": "account_not_found",
                  "type": "FLOW",
                  "value": "offer-alt-contact",
                  "callType": "replace"
               }
            }
         }
      ]
   },
   {
      "id": "disambiguate-account-lookup",
      "name": "DisambiguateAccountLookup",
      "version": "1.0.0",
      "description": "When a phone lookup matches multiple accounts, collect one extra identifier (ZIP code, date of birth, or last 4 of SSN) and retry the lookup with the filter.",
      "variables": {
         "dal_choice": {
            "type": "string",
            "description": "Which extra identifier the user wants to provide",
            "value": ""
         },
         "dal_value": {
            "type": "string",
            "description": "The identifier value entered by the user",
            "value": ""
         },
         "dal_valid": {
            "type": "boolean",
            "description": "Whether the entered identifier passed format validation",
            "value": false
         },
         "lookup_result": {
            "type": "object",
            "description": "Result from the filtered lookup-account call"
         }
      },
      "steps": [
         {
            "id": "count_attempt",
            "type": "SET",
            "variable": "dal_attempts_side_effect",
            "value": "cargo.dalAttempts = (cargo.dalAttempts || 0) + 1"
         },
         {
            "id": "check_attempt_limit",
            "type": "CASE",
            "branches": {
               "condition: cargo.dalAttempts > 3": {
                  "id": "too_many_dal_attempts",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "reboot"
               },
               "default": {
                  "id": "noop_attempts_ok",
                  "type": "SET",
                  "variable": "noop_attempts_ok",
                  "value": "true"
               }
            }
         },
         {
            "id": "ask_extra_id",
            "type": "SAY-GET",
            "variable": "dal_choice",
            "value": "I found more than one account associated with that cell number. To locate yours, I need one more piece of identification.\n{{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} ZIP for your ZIP code\n{{cargo.voice ? 'Press 2 or ' : ''}}{{cargo.verb}} BIRTH for your date of birth\n{{cargo.voice ? 'Press 3 or ' : ''}}{{cargo.verb}} SOCIAL for the last four digits of your Social Security number\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
            "value_es": "Encontré más de una cuenta asociada con ese número de celular. Para ubicar la suya, necesito un dato de identificación adicional.\n{{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} CÓDIGO para su código postal\n{{cargo.voice ? 'Presione 2 o ' : ''}}{{cargo.verb_es}} NACIMIENTO para su fecha de nacimiento\n{{cargo.voice ? 'Presione 3 o ' : ''}}{{cargo.verb_es}} SOCIAL para los últimos cuatro dígitos de su número de Seguro Social\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR.",
            "digits": { "min": 1, "max": 1 }
         },
         {
            "id": "normalize_dal_choice",
            "type": "SET",
            "variable": "dal_choice",
            "value": "(dal_choice || '').trim().toLowerCase()"
         },
         {
            "id": "branch_dal_choice",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(dal_choice, ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person']) || dal_choice === '0'": {
                  "id": "route_live_agent_dal",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: matchesChoice(dal_choice, ['*', 'exit', 'quit', 'salir', 'abort'])": {
                  "id": "exit_dal",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "account verification",
                     "support_context_es": "verificación de cuenta"
                  }
               },
               "condition: /^\\d{5}$/.test(dal_choice.replace(/[^0-9]/g, ''))": {
                  "id": "dal_smart_zip",
                  "type": "SET",
                  "variable": "dal_mode_side_effect",
                  "value": "cargo.dalMode = 'zip', cargo.dalPrefill = dal_choice"
               },
               "condition: /^\\d{8}$/.test(dal_choice.replace(/[^0-9]/g, '')) || /^\\d{1,2}[\\/\\.\\-]\\d{1,2}[\\/\\.\\-]\\d{4}$/.test(dal_choice)": {
                  "id": "dal_smart_dob",
                  "type": "SET",
                  "variable": "dal_mode_side_effect",
                  "value": "cargo.dalMode = 'dob', cargo.dalPrefill = dal_choice"
               },
               "condition: /^\\d{4}$/.test(dal_choice.replace(/[^0-9]/g, ''))": {
                  "id": "dal_smart_ssn",
                  "type": "SET",
                  "variable": "dal_mode_side_effect",
                  "value": "cargo.dalMode = 'ssn', cargo.dalPrefill = dal_choice"
               },
               "condition: dal_choice === '1' || matchesChoice(dal_choice, ['zip', 'codigo', 'código', 'postal'])": {
                  "id": "dal_mode_zip",
                  "type": "SET",
                  "variable": "dal_mode_side_effect",
                  "value": "cargo.dalMode = 'zip'"
               },
               "condition: dal_choice === '2' || matchesChoice(dal_choice, ['birth', 'dob', 'nacimiento', 'fecha'])": {
                  "id": "dal_mode_dob",
                  "type": "SET",
                  "variable": "dal_mode_side_effect",
                  "value": "cargo.dalMode = 'dob'"
               },
               "condition: dal_choice === '3' || matchesChoice(dal_choice, ['social', 'ssn', 'seguro'])": {
                  "id": "dal_mode_ssn",
                  "type": "SET",
                  "variable": "dal_mode_side_effect",
                  "value": "cargo.dalMode = 'ssn'"
               },
               "default": {
                  "id": "dal_choice_retry",
                  "type": "FLOW",
                  "value": "disambiguate-account-lookup",
                  "callType": "replace"
               }
            }
         },
         {
            "id": "ask_dal_value",
            "type": "CASE",
            "branches": {
               "condition: cargo.dalPrefill": {
                  "id": "use_dal_prefill",
                  "type": "SET",
                  "variable": "dal_value",
                  "value": "(function() { var v = cargo.dalPrefill; cargo.dalPrefill = ''; return v; })()"
               },
               "condition: cargo.dalMode === 'zip'": {
                  "id": "ask_dal_zip",
                  "type": "SAY-GET",
                  "variable": "dal_value",
                  "value": "Please {{cargo.verb}} your 5 digit ZIP code.{{cargo.voice ? ' When entering on the keypad, press the pound key when you are done.' : ''}}",
                  "value_es": "Por favor {{cargo.verb_es}} su código postal de 5 dígitos.{{cargo.voice ? ' Al ingresar con el teclado, presione la tecla numeral cuando termine.' : ''}}",
                  "digits": { "min": 5, "max": 5, "autoSubmitMs": 2500 }
               },
               "condition: cargo.dalMode === 'dob'": {
                  "id": "ask_dal_dob",
                  "type": "SAY-GET",
                  "variable": "dal_value",
                  "value": "Please {{cargo.verb}} your date of birth as 8 digits: two digit month, two digit day, and four digit year.{{cargo.voice ? ' When entering on the keypad, press the pound key when you are done.' : ''}}",
                  "value_es": "Por favor {{cargo.verb_es}} su fecha de nacimiento en 8 dígitos: mes de dos dígitos, día de dos dígitos y año de cuatro dígitos.{{cargo.voice ? ' Al ingresar con el teclado, presione la tecla numeral cuando termine.' : ''}}",
                  "digits": { "min": 8, "max": 8, "autoSubmitMs": 2500 }
               },
               "default": {
                  "id": "ask_dal_ssn",
                  "type": "SAY-GET",
                  "variable": "dal_value",
                  "value": "Please {{cargo.verb}} the last four digits of your Social Security number.{{cargo.voice ? ' When entering on the keypad, press the pound key when you are done.' : ''}}",
                  "value_es": "Por favor {{cargo.verb_es}} los últimos cuatro dígitos de su número de Seguro Social.{{cargo.voice ? ' Al ingresar con el teclado, presione la tecla numeral cuando termine.' : ''}}",
                  "digits": { "min": 4, "max": 4, "autoSubmitMs": 2500 }
               }
            }
         },
         {
            "id": "validate_dal_value",
            "type": "SET",
            "variable": "dal_valid",
            "value": "(function() { var d = (dal_value || '').replace(/[^0-9]/g, ''); cargo.dalFilter = { zip: '', dob: '', ssn: '' }; if (cargo.dalMode === 'zip') { if (d.length === 5) { cargo.dalFilter.zip = d; return true; } return false; } if (cargo.dalMode === 'dob') { if (d.length === 8) { var mm, dd, yyyy; if (d.slice(0, 2) === '19' || d.slice(0, 2) === '20') { yyyy = d.slice(0, 4); mm = d.slice(4, 6); dd = d.slice(6, 8); } else { mm = d.slice(0, 2); dd = d.slice(2, 4); yyyy = d.slice(4, 8); } if (parseInt(mm, 10) >= 1 && parseInt(mm, 10) <= 12 && parseInt(dd, 10) >= 1 && parseInt(dd, 10) <= 31) { cargo.dalFilter.dob = yyyy + '-' + mm + '-' + dd; return true; } } return false; } if (d.length === 4) { cargo.dalFilter.ssn = d; return true; } return false; })()"
         },
         {
            "id": "check_dal_valid",
            "type": "CASE",
            "branches": {
               "condition: dal_valid === true": {
                  "id": "dal_value_ok",
                  "type": "SET",
                  "variable": "noop_dal_value_ok",
                  "value": "true"
               },
               "default": {
                  "id": "dal_value_invalid_retry",
                  "type": "FLOW",
                  "value": "disambiguate-account-lookup",
                  "callType": "replace"
               }
            }
         },
         {
            "id": "resolve_dal_lookup_phone",
            "type": "SET",
            "variable": "dal_lookup_phone",
            "value": "cargo.dalPhone || cargo.otp_cell_number || ''"
         },
         {
            "id": "retry_lookup_with_filter",
            "type": "CALL-TOOL",
            "tool": "lookup-account",
            "variable": "lookup_result",
            "args": {
               "email": "",
               "phone_number": "{{dal_lookup_phone}}",
               "dob": "{{cargo.dalFilter.dob}}",
               "ssn": "{{cargo.dalFilter.ssn}}",
               "zip": "{{cargo.dalFilter.zip}}"
            },
            "onFail": {
               "id": "dal_lookup_failed",
               "type": "FLOW",
               "value": "lookup-account-failed-handler",
               "callType": "reboot"
            }
         },
         {
            "id": "resolve_dal_route_targets",
            "type": "SET",
            "variable": "dal_route_targets_side_effect",
            "value": "cargo.dalSuccessTarget = cargo.dalSuccessFlow || 'account-found', cargo.dalNotFoundTarget = cargo.dalNotFoundFlow || 'offer-alt-contact'"
         },
         {
            "id": "check_filtered_result",
            "type": "CASE",
            "branches": {
               "condition: lookup_result && lookup_result.success && lookup_result.customer_info.cust_id": {
                  "id": "dal_account_found",
                  "type": "FLOW",
                  "value": "{{cargo.dalSuccessTarget}}",
                  "callType": "replace"
               },
               "condition: lookup_result && lookup_result.multiple_records": {
                  "id": "dal_still_multiple",
                  "type": "FLOW",
                  "value": "disambiguate-account-lookup",
                  "callType": "replace"
               },
               "default": {
                  "id": "dal_not_found",
                  "type": "FLOW",
                  "value": "{{cargo.dalNotFoundTarget}}",
                  "callType": "replace"
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
      "variables": {
         "af_next_choice": {
            "type": "string",
            "description": "User's choice after balance delivery: payment, agent, exit, or free-form",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "set_authenticated_account",
            "type": "SET",
            "variable": "authenticated_account",
            "value": "(cargo.dalAttempts = 0, cargo.authenticatedAccount = true)"
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
            "id": "branch_facilitate_payments",
            "type": "CASE",
            "branches": {
               "condition: cargo.facilitatePayments === true": {
                  "id": "route_to_authenticated_payment",
                  "type": "FLOW",
                  "value": "load-subaccounts-and-pay",
                  "callType": "reboot"
               },
               "default": {
                  "id": "noop_continue_lookup",
                  "type": "SET",
                  "variable": "continue_normal_lookup",
                  "value": "true"
               }
            }
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
            "value": "Hi {{cargo.firstName}} {{cargo.lastName}}, I found your account ending with {{cargo.accountNumber.slice(-4).split('').join(', ')}} with {{cargo.subAccounts?.length || 'no' }} sub accounts\n{{typeof cargo.subAccountsBalance === 'string' ? 'Your current balance is ' + amountToSpeech(cargo.subAccountsBalance, 'en', cargo.voice) + '\\n' : ''}}{{cargo.statementInformation?.statementSummary?.totalBalance ? 'Your latest statement balance was ' + amountToSpeech(cargo.statementInformation.statementSummary.totalBalance, 'en', cargo.voice) + '\\n' : ''}}{{cargo.statementInformation?.statementSummary?.availableCredit ? 'Your available credit as of the last statement was ' + amountToSpeech(cargo.statementInformation.statementSummary.availableCredit, 'en', cargo.voice) + '\\n' : ''}}",
            "value_es": "Hola {{cargo.firstName}} {{cargo.lastName}}, encontré tu cuenta que termina en {{cargo.accountNumber.slice(-4).split('').join(', ')}} con {{cargo.subAccounts?.length || 'ninguna' }} subcuentas\n{{typeof cargo.subAccountsBalance === 'string' ? 'Su saldo actual es ' + amountToSpeech(cargo.subAccountsBalance, 'es', cargo.voice) + '\\n' : ''}}{{cargo.statementInformation?.statementSummary?.totalBalance ? 'El saldo de tu último estado de cuenta fue ' + amountToSpeech(cargo.statementInformation.statementSummary.totalBalance, 'es', cargo.voice) + '\\n' : ''}}{{cargo.statementInformation?.statementSummary?.availableCredit ? 'Su crédito disponible la fecha del último estado de cuenta fue ' + amountToSpeech(cargo.statementInformation.statementSummary.availableCredit, 'es', cargo.voice) + '\\n' : ''}}"
         },
         {
            "id": "ask_next_step",
            "type": "SAY-GET",
            "variable": "af_next_choice",
            "value": "What would you like to do next? Make a payment, or anything else?\n{{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} PAYMENT to make a payment\n{{cargo.voice ? 'Press 2 or ' : ''}}{{cargo.verb}} EXIT to finish\nOr just describe what you need.",
            "value_es": "¿Qué le gustaría hacer ahora? ¿Hacer un pago, o algo más?\n{{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} PAGO para hacer un pago\n{{cargo.voice ? 'Presione 2 o ' : ''}}{{cargo.verb_es}} SALIR para terminar\nO simplemente describa lo que necesita.",
            "digits": { "min": 1, "max": 1 }
         },
         {
            "id": "normalize_af_next_choice",
            "type": "SET",
            "variable": "af_next_choice",
            "value": "(af_next_choice || '').trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "branch_af_next_choice",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(af_next_choice, ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person','agent','agente'])": {
                  "id": "route_live_agent_after_balance",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: ['no', 'nope', 'nada', 'nothing', 'exit', 'quit', 'salir', 'done', 'gracias', 'thanks', '*', '2'].some(function(c) { return af_next_choice === c; })": {
                  "id": "exit_with_balance_goodbye",
                  "type": "RETURN",
                  "value": "language === 'es' ? 'Me alegra haber ayudado. ¡Que tenga un buen día!' : 'Glad I could help. Have a great day!'"
               },
               "condition: ['yes', 'yeah', 'sure', 'ok', 'okay', 'sí', 'si', '1'].some(function(c) { return af_next_choice === c; }) || (!/(ya\\s+(hice|pagu|realic)|already\\s+(made|paid|did)|no\\s+quiero|dont\\s+want|didnt|cant|no\\s+puedo)/.test(af_next_choice) && (/\\b(pagos?|pagar|payments?|pay)\\b/.test(af_next_choice) || matchesChoice(af_next_choice, ['liquidar', 'liquidacion', 'liquidación', 'liquidate', 'pay off', 'payoff', 'settle'])))": {
                  "id": "route_to_start_payment",
                  "type": "FLOW",
                  "value": "start-payment",
                  "callType": "reboot"
               },
               "default": {
                  "id": "af_forward_to_ai",
                  "type": "RETURN",
                  "value": "''"
               }
            }
         }
      ]
   },
   {
      "id": "find-locations",
      "name": "FindLocations",
      "version": "1.0.0",
      "description": "Helps customers find Curacao closest store locations (note: 'Curacao' is the company/brand name, NOT a city or geographic location — never use it as a city value). This flow should NOT be activated when customer asks about store hours, nor when they ask about Curacao in general or product availability in a given location — it should be activated conservatively - only when the user explicitly requests to find a store location.",
      "prompt": "Find location",
      "prompt_es": "Encontrar ubicación",
      "primary": true,
      "parameters": [
         {
            "name": "user_city",
            "description": "The city or geographic area the user wants to search near. Must be an actual city/area name — 'Curacao' is the brand name and must NOT be extracted as a city. Leave empty string if the user did not specify a city.",
            "type": "string"
         }
      ],
      "variables": {
         "user_city": {
            "type": "string",
            "value": "",
            "description": "User's city for location search — defaults to empty so the flow prompts the user"
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
               "condition: ['1', 'yes', 'sure', 'please', 'ok', 'okay', 'thanks', 'si', 'sí', 'seguro', 'por favor', 'gracias'].includes(send_sms_choice) && !cargo.callerId": {
                  "id": "no_caller_id_available",
                  "type": "SAY",
                  "value": "I'm unable to send texts at this time. However, you can text our support number at (213) 205-3155 and ask for store locations - we'll send you the directions right away!",
                  "value_es": "No puedo enviar mensajes de texto en este momento. Sin embargo, puedes enviar un mensaje de texto a nuestro número de soporte al (213) 205-3155 y pedir las ubicaciones de las tiendas - ¡te enviaremos las direcciones de inmediato!",
                  "outcome": "unresolved",
                  "reason": "sms_directions_no_caller_id"
               },
               "condition: ['1', 'yes', 'sure', 'please', 'ok', 'okay', 'thanks', 'si', 'sí', 'seguro', 'por favor', 'gracias'].includes(send_sms_choice) && cargo.callerId": {
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
               "condition: matchesChoice(send_sms_choice, ['live', 'agent', 'customer service', 'representative', 'agente', 'gente', 'gerente', 'al cliente', 'representante', 'servidor', 'hablar con alguien']) || send_sms_choice == '0'": {
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
               "condition: ['*', 'abort', 'exit', 'quit', 'salir'].includes(user_city.toLowerCase())": {
                  "id": "abort_process",
                  "type": "FLOW",
                  "value": "cancel-process",
                  "callType": "reboot"
               },
               "condition: matchesChoice(user_city.toLowerCase(), ['live', 'agent', 'customer service', 'representative', 'agente', 'gente', 'gerente', 'al cliente', 'representante', 'servidor', 'hablar con alguien']) || user_city == '0'": {
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
         }
      ]
   },
   {
      "id": "contact-support-with-context",
      "name": "ContactSupportWithContext",
      "version": "1.0.0",
      "description": "Sets cargo.support_context so the contact-support fallback explains what failed before showing contact info, then reboots into contact-support.",
      "parameters": [
         {
            "name": "support_context",
            "type": "string",
            "description": "English context phrase, e.g. 'payment'"
         },
         {
            "name": "support_context_es",
            "type": "string",
            "description": "Spanish context phrase, e.g. 'pago'"
         }
      ],
      "steps": [
         {
            "id": "set_support_context",
            "type": "SET",
            "variable": "support_context_side_effect",
            "value": "cargo.support_context = (typeof support_context !== 'undefined' && support_context) ? support_context : 'payment', cargo.support_context_es = (typeof support_context_es !== 'undefined' && support_context_es) ? support_context_es : 'pago'"
         },
         {
            "id": "goto_contact_support",
            "type": "FLOW",
            "value": "contact-support",
            "callType": "reboot"
         }
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
            "id": "store_search_failed_handoff",
            "type": "RETURN",
            "value": "''",
            "outcome": "unresolved",
            "reason": "store_location_not_found"
         },
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
               "condition: ['1', 'yes', 'sure', 'please', 'ok', 'okay', 'thanks', 'si', 'sí', 'seguro', 'por favor', 'gracias'].includes(user_choice)": {
                  "id": "retry_location_search",
                  "type": "FLOW",
                  "value": "find-locations",
                  "callType": "reboot"
               },
               "condition: ['2', 'no'].includes(user_choice)": {
                  "id": "provide_contact_info",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "store location search",
                     "support_context_es": "búsqueda de tiendas"
                  }
               },
               "condition: matchesChoice(user_choice, ['live', 'agent', 'customer service', 'representative', 'agente', 'gente', 'gerente', 'al cliente', 'representante', 'servidor', 'hablar con alguien']) || user_choice == '0'": {
                  "id": "goto_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "reboot"
               },
               "default": {
                  "id": "provide_contact_info_default",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "store location search",
                     "support_context_es": "búsqueda de tiendas"
                  }
               }
            }
         }
      ]
   },
   {
      "id": "start-credit-monitoring",
      "name": "StartCreditMonitoring",
      "version": "1.0.0",
      "description": "This flow allows customers to learn about and enroll in Curacao's Credit Monitoring service powered by Experian. It helps them spot suspicious credit activity and includes identity theft support. The flow authenticates the user if needed, then sends a secure enrollment link via text.",
      "prompt": "Credit Monitoring",
      "prompt_es": "Monitoreo de Crédito",
      "primary": true,
      "parameters": [
         {
            "name": "cell_number",
            "type": "string",
            "description": "Phone already supplied by the caller; forwarded so the contact prompt is skipped"
         },
         {
            "name": "email",
            "type": "string",
            "description": "Email already supplied by the caller; forwarded so the contact prompt is skipped"
         }
      ],
      "variables": {
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
            "value": "cargo.support_context = 'credit_monitoring', cargo.support_context_es = 'monitoreo de crédito'"
         },
         {
            "id": "check_already_has_account",
            "type": "CASE",
            "branches": {
               "condition: cargo.accountNumber": {
                  "id": "already_has_account",
                  "type": "FLOW",
                  "value": "credit-monitoring-offer",
                  "callType": "replace"
               },
               "default": {
                  "id": "proceed_to_auth",
                  "type": "SET",
                  "variable": "proceed",
                  "value": true
               }
            }
         },
         {
            "id": "check_existing_contact_info",
            "type": "CASE",
            "branches": {
               "condition: cargo.otpVerified && cargo.otp_cell_number": {
                  "id": "otp_verified_with_cell",
                  "type": "FLOW",
                  "value": "credit-monitoring-lookup-and-offer",
                  "callType": "replace"
               },
               "condition: cargo.otpVerified && cargo.otp_email": {
                  "id": "otp_verified_with_email",
                  "type": "FLOW",
                  "value": "credit-monitoring-lookup-and-offer",
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
            "id": "prompt-to-authenticate",
            "type": "SAY",
            "value": "Curacao offers various credit services, let's start by locating your account.",
            "value_es": "Curacao ofrece varios servicios de crédito, comencemos por localizar tu cuenta."
         },
         {
            "id": "authenticate_user",
            "type": "FLOW",
            "value": "authenticate-user",
            "callType": "call",
            "parameters": {
               "retry_flow": "start-credit-monitoring",
               "cancel_flow": "contact-support",
               "cell_number": "{{cell_number}}",
               "email": "{{email}}",
               "email_validator": "validate-email-has-account"
            }
         },
         {
            "id": "perform_lookup_and_offer",
            "type": "FLOW",
            "value": "credit-monitoring-lookup-and-offer",
            "callType": "call"
         }
      ]
   },
   {
      "id": "credit-monitoring-lookup-and-offer",
      "name": "CreditMonitoringLookupAndOffer",
      "version": "1.0.0",
      "description": "Perform account lookup after OTP verification, then offer credit monitoring",
      "variables": {
         "lookup_result": {
            "type": "object",
            "description": "Result from account lookup"
         },
         "otp_validation_result": {
            "type": "boolean",
            "description": "Result from OTP validation"
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
         }
      },
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
                     "value": "offer-alt-contact",
                     "callType": "replace",
                     "parameters": {
                        "target_flow": "start-credit-monitoring"
                     }
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
                     "retry_flow": "start-credit-monitoring",
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
                  "id": "account_found_set_number",
                  "type": "SET",
                  "variable": "account_number_side_effect",
                  "value": "cargo.accountNumber = lookup_result.customer_info.cust_id"
               },
               "default": {
                  "id": "account_not_found",
                  "type": "FLOW",
                  "value": "offer-alt-contact",
                  "callType": "replace",
                  "parameters": {
                     "target_flow": "start-credit-monitoring"
                  }
               }
            }
         },
         {
            "id": "proceed_to_offer",
            "type": "FLOW",
            "value": "credit-monitoring-offer",
            "callType": "replace"
         }
      ]
   },
   {
      "id": "process-user-response-to-ccm-offer",
      "name": "CreditMonitoringProcess",
      "version": "1.0.0",
      "description": "Process credit monitoring choice: normalize input, call Experian API if accepted, show result. Caller must set credit_monitoring_choice variable before calling.",
      "variables": {
         "experian_link_result": {
            "type": "object",
            "description": "Result from Experian link API"
         },
         "credit_monitoring_skipped": {
            "type": "boolean",
            "description": "Whether user declined credit monitoring"
         }
      },
      "steps": [
         {
            "id": "init_credit_monitoring_skipped",
            "type": "SET",
            "variable": "credit_monitoring_skipped",
            "value": "false"
         },
         {
            "id": "normalize_credit_monitoring_choice",
            "type": "SET",
            "variable": "credit_monitoring_choice",
            "value": "credit_monitoring_choice.trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "handle_credit_monitoring_choice",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(credit_monitoring_choice, ['live', 'agent', 'customer service', 'representative', 'agente', 'gente', 'gerente', 'al cliente', 'representante', 'operador', 'hablar con', 'servidor']) || credit_monitoring_choice == '0'": {
                  "id": "goto_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "reboot"
               },
               "condition: ['*', 'abort', 'exit', 'quit', 'salir'].includes(credit_monitoring_choice)": {
                  "id": "abort_process",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "Credit Monitoring enrollment",
                     "support_context_es": "inscripción en Monitoreo de Crédito"
                  }
               },
               "condition: matchesChoice(credit_monitoring_choice, ['1', 'yes', 'sure', 'please', 'ok', 'okay', 'thanks', 'si', 'sí', 'seguro', 'por favor', 'gracias'])": {
                  "id": "call_get_experian_link",
                  "type": "CALL-TOOL",
                  "tool": "get-experian-link",
                  "variable": "experian_link_result",
                  "args": {
                     "cust_id": "{{cargo.accountNumber}}"
                  },
                  "onFail": {
                     "id": "experian_link_failed",
                     "type": "SET",
                     "variable": "experian_link_result",
                     "value": {
                        "success": false
                     }
                  }
               },
               "default": {
                  "id": "unrecognized-response-forward-to-ai-WARNING-will-not-return-to-caller",
                  "type": "RETURN",
                  "value": "''"
               }
            }
         },
         {
            "id": "show_experian_result",
            "type": "CASE",
            "branches": {
               "condition: credit_monitoring_skipped": {
                  "id": "no_action_needed",
                  "type": "RETURN",
                  "value": "''"
               },
               "condition: experian_link_result && experian_link_result.success": {
                  "id": "experian_link_sent",
                  "type": "SAY",
                  "value": "Great, I texted you the Credit Monitoring link. Anything else I can help you with today?",
                  "value_es": "Listo, te envié el enlace de Monitoreo de Crédito por mensaje de texto. ¿Hay algo más en lo que te pueda ayudar hoy?"
               },
               "condition: experian_link_result && !experian_link_result.success": {
                  "id": "experian_link_api_error",
                  "type": "SAY",
                  "value": "Sorry, I was not able to send you the link. Please try again later. Anything else I can help you with today?",
                  "value_es": "Lo siento, no pude enviarte el enlace. Por favor, inténtalo más tarde. ¿Hay algo más en lo que pueda ayudarte hoy?",
                  "outcome": "unresolved",
                  "reason": "experian_link_send_failed"
               },
               "default": {
                  "id": "no_experian_action",
                  "type": "SAY",
                  "value": "No problem! Is there anything else I can help you with today?",
                  "value_es": "¡No hay problema! ¿Hay algo más en lo que pueda ayudarte hoy?"
               }
            }
         },
         {
            "id": "set_experian_sent_flag",
            "type": "CASE",
            "branches": {
               "condition: experian_link_result && experian_link_result.success": {
                  "id": "mark_experian_sent",
                  "type": "SET",
                  "variable": "experian_sent_side_effect",
                  "value": "cargo.experian_link_sent = true"
               },
               "default": {
                  "id": "experian_send_failed_or_skipped",
                  "type": "SET",
                  "variable": "experian_sent_side_effect",
                  "value": "false"
               }
            }
         }
      ]
   },
   {
      "id": "credit-monitoring-offer",
      "name": "CreditMonitoringOffer",
      "version": "1.0.0",
      "description": "Offer credit monitoring enrollment and send Experian link",
      "variables": {
         "credit_monitoring_choice": {
            "type": "string",
            "description": "User response to credit monitoring offer"
         },
         "experian_link_result": {
            "type": "object",
            "description": "Result from Experian link API"
         },
         "credit_monitoring_skipped": {
            "type": "boolean",
            "description": "Whether user declined credit monitoring"
         }
      },
      "steps": [
         {
            "id": "ask_credit_monitoring",
            "type": "CASE",
            "branches": {
               "condition: cargo.experian_link_sent": {
                  "id": "ask_resend_link",
                  "type": "SAY-GET",
                  "variable": "credit_monitoring_choice",
                  "value": "It looks like we already sent you a credit monitoring enrollment link. Would you like us to resend it?\nJust {{cargo.voice ? 'press 1 or ' : ''}}{{cargo.verb}} YES to resend.\nTo exit {{cargo.voice ? 'press star or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "Parece que ya te enviamos un enlace de inscripción para monitoreo de crédito. ¿Te gustaría que lo reenviemos?\nSolo {{cargo.voice ? 'presiona 1 o ' : ''}}{{cargo.verb_es}} SÍ para reenviar.\nPara salir {{cargo.voice ? 'presiona estrella o ' : ''}}{{cargo.verb_es}} SALIR.",
                  "digits": {
                     "min": 1,
                     "max": 1
                  }
               },
               "default": {
                  "id": "ask_first_time",
                  "type": "SAY-GET",
                  "variable": "credit_monitoring_choice",
                  "value": "Great! I was able to locate your account. Curacao's Credit Monitor helps you spot suspicious personal credit activity fast and it also includes identity theft support\nIf you want to receive a text with a secure link to review and enroll, just {{cargo.voice ? 'press 1 or ' : ''}}{{cargo.verb}} YES.\nTo exit {{cargo.voice ? 'press star or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "¡Excelente! Pude localizar tu cuenta. El Monitor de Crédito de Curacao te ayuda a detectar actividad crediticia personal sospechosa rápidamente y también incluye soporte para robo de identidad\nSi deseas recibir un mensaje de texto con un enlace seguro para revisar y registrarte, solo {{cargo.voice ? 'presiona 1 o ' : ''}}{{cargo.verb_es}} SÍ.\nPara salir {{cargo.voice ? 'presiona estrella o ' : ''}}{{cargo.verb_es}} SALIR.",
                  "digits": {
                     "min": 1,
                     "max": 1
                  }
               }
            }
         },
         {
            "id": "check_live_agent_ccm",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice((credit_monitoring_choice || '').toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_ccm",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "default": {
                  "id": "noop_continue_ccm",
                  "type": "SET",
                  "variable": "noop_continue_ccm",
                  "value": "true"
               }
            }
         },
         {
            "id": "process_credit_monitoring",
            "type": "FLOW",
            "value": "process-user-response-to-ccm-offer",
            "callType": "call"
         }
      ]
   },

   /* ===== SERVICE CASE FLOWS ===== */

   /* --- sc-handle-failure --- */
   {
      "id": "sc-handle-failure",
      "name": "SCHandleFailure",
      "version": "1.0.0",
      "description": "Handles service case creation failure by notifying the user and offering retry or live support",
      "variables": {
         "sc_failure_choice": {
            "type": "string",
            "description": "User's choice after failure: retry or live agent",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "say_failure",
            "type": "SAY-GET",
            "variable": "sc_failure_choice",
            "value": "I apologize, but I'm having trouble creating your service case at the moment.\n1. Try again{{cargo.agentPhoneNumber ? '\\n2. Connect me with a support agent' : ''}}\n\nPlease {{cargo.verb}} the option number.",
            "value_es": "Lo siento, pero estoy teniendo problemas para crear su caso de servicio en este momento.\n1. Intentar de nuevo{{cargo.agentPhoneNumber ? '\\n2. Conectarme con un agente de soporte' : ''}}\n\nPor favor {{cargo.verb_es}} el número de opción.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "handle_failure_choice",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_failure_choice.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_failure",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(1|try|retry|intentar|again)/i.test(sc_failure_choice.trim())": {
                  "id": "retry_submission",
                  "type": "FLOW",
                  "value": "create-service-case",
                  "callType": "reboot"
               },
               "default": {
                  "id": "route_to_support",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               }
            }
         }
      ]
   },

   /* --- sc-collect-address --- */
   {
      "id": "sc-collect-address",
      "name": "SCCollectAddress",
      "version": "1.0.0",
      "description": "Collects a new mailing address: street, apartment (optional), city, state, and zip code with confirmation, then submits the service case",
      "parameters": [
         {
            "name": "sc_authenticated_phone",
            "type": "string",
            "description": "OTP-authenticated phone number"
         },
         {
            "name": "sc_authenticated_email",
            "type": "string",
            "description": "OTP-authenticated email address"
         }
      ],
      "variables": {
         "sc_new_street": {
            "type": "string",
            "description": "New street address",
            "value": ""
         },
         "sc_new_apt": {
            "type": "string",
            "description": "Apt/unit number (empty if not applicable)",
            "value": ""
         },
         "sc_new_city": {
            "type": "string",
            "description": "City",
            "value": ""
         },
         "sc_new_state": {
            "type": "string",
            "description": "State abbreviation",
            "value": ""
         },
         "sc_new_zip": {
            "type": "string",
            "description": "5-digit zip code",
            "value": ""
         },
         "sc_new_address": {
            "type": "string",
            "description": "Assembled full address",
            "value": ""
         },
         "sc_extra_details": {
            "type": "string",
            "description": "Extra details for service case",
            "value": ""
         },
         "sc_addr_confirm": {
            "type": "string",
            "description": "User confirmation of address",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "show_current_address",
            "type": "CASE",
            "branches": {
               "condition: cargo.sc_current_street": {
                  "id": "say_current_address",
                  "type": "SAY",
                  "value": "Your current address on file is:\n{{cargo.sc_current_street}}, {{cargo.sc_current_city}}, {{cargo.sc_current_state}} {{cargo.sc_current_zip}}\n\nLet's collect your new address now.",
                  "value_es": "Su dirección actual registrada es:\n{{cargo.sc_current_street}}, {{cargo.sc_current_city}}, {{cargo.sc_current_state}} {{cargo.sc_current_zip}}\n\nAhora recopilaremos su nueva dirección."
               },
               "default": {
                  "id": "no_current_address",
                  "type": "SET",
                  "variable": "sc_addr_skip_current",
                  "value": "true"
               }
            }
         },
         {
            "id": "ask_street",
            "type": "SAY-GET",
            "variable": "sc_new_street",
            "value": "Please {{cargo.verb}} your new street address (e.g. 123 Main Street).\nTo exit at any time {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
            "value_es": "Por favor {{cargo.verb_es}} su nueva dirección (por ejemplo, 123 Main Street).\nPara salir en cualquier momento {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
         },
         {
            "id": "check_street_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_new_street.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_street",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_new_street.trim())": {
                  "id": "exit_address",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "trim_street",
                  "type": "SET",
                  "variable": "sc_new_street",
                  "value": "sc_new_street.trim()"
               }
            }
         },
         {
            "id": "ask_apt",
            "type": "SAY-GET",
            "variable": "sc_new_apt",
            "value": "{{cargo.verb}} your apartment or unit number, or {{cargo.verb}} SKIP if not applicable.",
            "value_es": "{{cargo.verb_es}} su número de apartamento o unidad, o {{cargo.verb_es}} OMITIR si no aplica."
         },
         {
            "id": "check_apt_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_new_apt.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_apt",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(skip|omitir|none|na|n\\/a|no aplica|no apt|no apartment|no unit)$/i.test(sc_new_apt.trim())": {
                  "id": "clear_apt_skip",
                  "type": "SET",
                  "variable": "sc_new_apt",
                  "value": "''"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_new_apt.trim())": {
                  "id": "exit_apt",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "normalize_apt",
                  "type": "SET",
                  "variable": "sc_new_apt",
                  "value": "/^(skip|omitir|no|n\\/a|none|ninguno|na|\\-)$/i.test(sc_new_apt.trim()) ? '' : sc_new_apt.trim()"
               }
            }
         },
         {
            "id": "ask_city",
            "type": "SAY-GET",
            "variable": "sc_new_city",
            "value": "{{cargo.verb}} the city.",
            "value_es": "{{cargo.verb_es}} la ciudad."
         },
         {
            "id": "check_city_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_new_city.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_city",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_new_city.trim())": {
                  "id": "exit_city",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "trim_city",
                  "type": "SET",
                  "variable": "sc_new_city",
                  "value": "sc_new_city.trim()"
               }
            }
         },
         {
            "id": "ask_state",
            "type": "SAY-GET",
            "variable": "sc_new_state",
            "value": "{{cargo.verb}} the state abbreviation (e.g. CA, NV, AZ).",
            "value_es": "{{cargo.verb_es}} la abreviatura del estado (por ejemplo, CA, NV, AZ)."
         },
         {
            "id": "check_state_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_new_state.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_state",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_new_state.trim())": {
                  "id": "exit_state",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "normalize_state",
                  "type": "SET",
                  "variable": "sc_new_state",
                  "value": "sc_new_state.trim().toUpperCase()"
               }
            }
         },
         {
            "id": "ask_zip",
            "type": "SAY-GET",
            "variable": "sc_new_zip",
            "value": "Please {{cargo.verb}} the 5-digit zip code.{{cargo.voice ? ' When entering on the keypad, press the pound key when you are done.' : ''}}",
            "value_es": "Por favor {{cargo.verb_es}} el código postal de 5 dígitos.{{cargo.voice ? ' Al ingresar con el teclado, presione la tecla numeral cuando termine.' : ''}}",
            "digits": {
               "min": 5,
               "max": 5,
               "autoSubmitMs": 3500
            }
         },
         {
            "id": "check_zip_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_new_zip.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_zip",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_new_zip.trim())": {
                  "id": "exit_zip",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "zip_exit_ok",
                  "type": "SET",
                  "variable": "sc_new_zip",
                  "value": "sc_new_zip.trim()"
               }
            }
         },
         {
            "id": "validate_zip",
            "type": "CASE",
            "branches": {
               "condition: validateDigits(sc_new_zip.trim(), 5, 5)": {
                  "id": "zip_ok",
                  "type": "SET",
                  "variable": "sc_new_zip",
                  "value": "sc_new_zip.trim()"
               },
               "default": {
                  "id": "zip_invalid",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "The zip code must be exactly 5 digits.",
                     "error_message_es": "El código postal debe tener exactamente 5 dígitos.",
                     "retry_flow": "sc-collect-address",
                     "cancel_flow": "contact-support"
                  }
               }
            }
         },
         {
            "id": "assemble_address",
            "type": "SET",
            "variable": "sc_new_address",
            "value": "sc_new_street + (sc_new_apt ? ' ' + sc_new_apt : '') + ', ' + sc_new_city + ', ' + sc_new_state + ' ' + sc_new_zip"
         },
         {
            "id": "set_extra_details_pre",
            "type": "SET",
            "variable": "sc_extra_details",
            "value": "'New Address: ' + sc_new_street + (sc_new_apt ? ' ' + sc_new_apt : '') + ', ' + sc_new_city + ', ' + sc_new_state + ' ' + sc_new_zip"
         },
         {
            "id": "confirm_address",
            "type": "SAY-GET",
            "variable": "sc_addr_confirm",
            "value": "Your new address is:\n{{sc_new_address}}\n\nIs this correct? {{cargo.verb}} YES to confirm or NO to re-enter.",
            "value_es": "Su nueva dirección es:\n{{sc_new_address}}\n\n¿Es correcto? {{cargo.verb_es}} SÍ para confirmar o NO para volver a ingresar."
         },
         {
            "id": "branch_confirm",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_addr_confirm.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_addr_confirm",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(yes|y|si|sí|1)$/i.test(sc_addr_confirm.trim())": {
                  "id": "addr_confirmed",
                  "type": "SET",
                  "variable": "sc_addr_confirmed",
                  "value": "true"
               },
               "condition: /^(no|n|2)$/i.test(sc_addr_confirm.trim())": {
                  "id": "reenter_address",
                  "type": "FLOW",
                  "value": "sc-collect-address",
                  "callType": "reboot"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_addr_confirm.trim())": {
                  "id": "exit_confirm",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "reenter_address_default",
                  "type": "FLOW",
                  "value": "sc-collect-address",
                  "callType": "reboot"
               }
            }
         },
         {
            "id": "submit_address",
            "type": "FLOW",
            "value": "sc-submit",
            "callType": "replace",
            "parameters": {
               "sc_ticket_type": "Account Issue",
               "sc_ticket_reason": "Change of address",
               "sc_extra_details": "{{sc_extra_details}}",
               "sc_authenticated_phone": "{{sc_authenticated_phone}}",
               "sc_authenticated_email": "{{sc_authenticated_email}}"
            }
         }
      ]
   },
   {
      "id": "sc-collect-missing-payment",
      "name": "SCCollectMissingPayment",
      "version": "1.0.0",
      "description": "Collects details for a missing payment: account number, date of payment, and payment channel, then submits the service case. This flow should ONLY be reached when the customer has explicitly confirmed they made a payment that is not reflected on their account. If the customer expresses confusion or says this is not their issue at any point, exit this flow and return to the service case menu.",
      "parameters": [
         {
            "name": "sc_authenticated_phone",
            "type": "string",
            "description": "OTP-authenticated phone number"
         },
         {
            "name": "sc_authenticated_email",
            "type": "string",
            "description": "OTP-authenticated email address"
         }
      ],
      "variables": {
         "sc_mp_account_number": {
            "type": "string",
            "description": "Account number for the missing payment",
            "value": ""
         },
         "sc_mp_acct_confirm": {
            "type": "string",
            "description": "User confirmation when account number is pre-filled from lookup",
            "value": ""
         },
         "sc_mp_payment_date": {
            "type": "string",
            "description": "Date the payment was made",
            "value": ""
         },
         "sc_mp_channel": {
            "type": "string",
            "description": "Channel used for the payment",
            "value": ""
         },
         "sc_extra_details": {
            "type": "string",
            "description": "Extra details for service case",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "check_prefilled_account",
            "type": "CASE",
            "branches": {
               "condition: cargo.accountNumber": {
                  "id": "confirm_prefilled_account",
                  "type": "SAY-GET",
                  "variable": "sc_mp_acct_confirm",
                  "value": "I have your account ending with {{cargo.accountNumber.slice(-4).split('').join(', ')}}. Is this the account with the missing payment?\n{{cargo.verb}} YES to confirm, or {{cargo.verb}} a different account number.\nTo exit at any time {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "Tengo su cuenta que termina en {{cargo.accountNumber.slice(-4).split('').join(', ')}}. ¿Es esta la cuenta con el pago faltante?\n{{cargo.verb_es}} SÍ para confirmar, o {{cargo.verb_es}} un número de cuenta diferente.\nPara salir en cualquier momento {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
               },
               "default": {
                  "id": "ask_mp_account",
                  "type": "SAY-GET",
                  "variable": "sc_mp_account_number",
                  "value": "Please {{cargo.verb}} the account number related to the missing payment.\nTo exit at any time {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "Por favor {{cargo.verb_es}} el número de cuenta relacionado con el pago faltante.\nPara salir en cualquier momento {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
               }
            }
         },
         {
            "id": "apply_acct_confirm",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(((sc_mp_acct_confirm || '') + ' ' + (sc_mp_account_number || '')).toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_mp_acct",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: typeof sc_mp_acct_confirm !== 'undefined' && /^(exit|quit|salir|abort|\\*)$/i.test((sc_mp_acct_confirm || '').trim())": {
                  "id": "exit_mp_confirm",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "condition: typeof sc_mp_acct_confirm !== 'undefined' && /^(yes|y|si|sí|1)$/i.test((sc_mp_acct_confirm || '').trim())": {
                  "id": "use_prefilled_account",
                  "type": "SET",
                  "variable": "sc_mp_account_number",
                  "value": "cargo.accountNumber"
               },
               "condition: typeof sc_mp_acct_confirm !== 'undefined' && sc_mp_acct_confirm && sc_mp_acct_confirm.trim()": {
                  "id": "use_typed_account",
                  "type": "SET",
                  "variable": "sc_mp_account_number",
                  "value": "sc_mp_acct_confirm.trim()"
               },
               "default": {
                  "id": "check_mp_acct_exit",
                  "type": "CASE",
                  "branches": {
                     "condition: /^(exit|quit|salir|abort|\\*)$/i.test((sc_mp_account_number || '').trim())": {
                        "id": "exit_mp",
                        "type": "FLOW",
                        "value": "contact-support-with-context",
                        "callType": "reboot",
                        "parameters": {
                           "support_context": "service request",
                           "support_context_es": "solicitud de servicio"
                        }
                     },
                     "default": {
                        "id": "trim_mp_acct",
                        "type": "SET",
                        "variable": "sc_mp_account_number",
                        "value": "sc_mp_account_number.trim()"
                     }
                  }
               }
            }
         },
         {
            "id": "ask_mp_date",
            "type": "SAY-GET",
            "variable": "sc_mp_payment_date",
            "value": "What was the date of the payment? (e.g. 03/15/2026) If you don't remember the exact date, {{cargo.verb}} UNKNOWN.",
            "value_es": "¿Cuál fue la fecha del pago? (por ejemplo, 15/03/2026) Si no recuerda la fecha exacta, {{cargo.verb_es}} DESCONOCIDA."
         },
         {
            "id": "check_mp_date_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_mp_payment_date.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_mp_date",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_mp_payment_date.trim())": {
                  "id": "exit_mp_date",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "condition: /^(unknown|don'?t know|do not know|i don'?t remember|no recuerdo|desconocida|desconocido|no s[eé])$/i.test(sc_mp_payment_date.trim())": {
                  "id": "set_mp_date_unknown",
                  "type": "SET",
                  "variable": "sc_mp_payment_date",
                  "value": "'Customer does not remember the exact date'"
               },
               "condition: /(\\d{1,2}[\\/\\-\\.]\\d{1,2}[\\/\\-\\.]\\d{2,4})|(\\d{1,2}\\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ene|febr|marzo|abr|mayo|junio|julio|agosto|sept|octu|novi|dici))|((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ene|feb|mar|abr|mayo|jun|jul|ago|sept|oct|nov|dic)[a-z]*\\s+\\d{1,2})|(yesterday|today|last\\s+(week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|ayer|hoy|la\\s+semana\\s+pasada)/i.test(sc_mp_payment_date.trim())": {
                  "id": "trim_mp_date",
                  "type": "SET",
                  "variable": "sc_mp_payment_date",
                  "value": "sc_mp_payment_date.trim()"
               },
               "default": {
                  "id": "mp_date_store_with_note",
                  "type": "SET",
                  "variable": "sc_mp_payment_date",
                  "value": "'Customer provided: ' + sc_mp_payment_date.trim() + ' (format not standard, please verify)'"
               }
            }
         },
         {
            "id": "ask_mp_channel",
            "type": "SAY-GET",
            "variable": "sc_mp_channel",
            "value": "What channel was used to make the payment?\n1. In-store\n2. Online\n3. Phone\n4. Other\n\nPlease {{cargo.verb}} the option number or describe the channel.",
            "value_es": "¿Qué canal se utilizó para realizar el pago?\n1. En tienda\n2. En línea\n3. Teléfono\n4. Otro\n\nPor favor {{cargo.verb_es}} el número de opción o describa el canal.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "check_mp_channel_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_mp_channel.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_mp_channel",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_mp_channel.trim())": {
                  "id": "exit_mp_channel",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "normalize_mp_channel",
                  "type": "SET",
                  "variable": "sc_mp_channel",
                  "value": "sc_mp_channel.trim() === '1' ? 'In-store' : sc_mp_channel.trim() === '2' ? 'Online' : sc_mp_channel.trim() === '3' ? 'Phone' : sc_mp_channel.trim() === '4' ? 'Other' : sc_mp_channel.trim()"
               }
            }
         },
         {
            "id": "set_extra_details_mp",
            "type": "SET",
            "variable": "sc_extra_details",
            "value": "'Account Number: ' + sc_mp_account_number + ' | Payment Date: ' + sc_mp_payment_date + ' | Payment Channel: ' + sc_mp_channel"
         },
         {
            "id": "submit_mp",
            "type": "FLOW",
            "value": "sc-submit",
            "callType": "replace",
            "parameters": {
               "sc_ticket_type": "Account Issue",
               "sc_ticket_reason": "Missing Payment",
               "sc_extra_details": "{{sc_extra_details}}",
               "sc_authenticated_phone": "{{sc_authenticated_phone}}",
               "sc_authenticated_email": "{{sc_authenticated_email}}"
            }
         }
      ]
   },

   /* --- sc-collect-refund --- */
   {
      "id": "sc-collect-refund",
      "name": "SCCollectRefund",
      "version": "1.0.0",
      "description": "Collects details for a refund request: invoice number and date of purchase, then submits the service case",
      "parameters": [
         {
            "name": "sc_authenticated_phone",
            "type": "string",
            "description": "OTP-authenticated phone number"
         },
         {
            "name": "sc_authenticated_email",
            "type": "string",
            "description": "OTP-authenticated email address"
         }
      ],
      "variables": {
         "sc_rf_invoice_number": {
            "type": "string",
            "description": "Invoice number for the refund",
            "value": ""
         },
         "sc_rf_purchase_date": {
            "type": "string",
            "description": "Date of the purchase",
            "value": ""
         },
         "sc_extra_details": {
            "type": "string",
            "description": "Extra details for service case",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "ask_rf_invoice",
            "type": "SAY-GET",
            "variable": "sc_rf_invoice_number",
            "value": "Please {{cargo.verb}} the invoice number for the purchase you would like refunded. If you don't have the invoice number, {{cargo.verb}} UNKNOWN and our team will look it up.",
            "value_es": "Por favor {{cargo.verb_es}} el número de factura de la compra que desea que se le reembolse. Si no tiene el número de factura, {{cargo.verb_es}} DESCONOCIDO y nuestro equipo lo buscará."
         },
         {
            "id": "check_rf_invoice_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_rf_invoice_number.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_rf_invoice",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_rf_invoice_number.trim())": {
                  "id": "exit_rf_invoice",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "condition: /^(unknown|don'?t know|do not know|i don'?t have|don'?t have it|desconocido|desconocida|no tengo|no s[eé]|no recuerdo)$/i.test(sc_rf_invoice_number.trim())": {
                  "id": "set_rf_invoice_unknown",
                  "type": "SET",
                  "variable": "sc_rf_invoice_number",
                  "value": "'Customer does not have the invoice number — needs lookup'"
               },
               "condition: /^[0-9\\s\\-]+$/.test(sc_rf_invoice_number.trim())": {
                  "id": "trim_rf_invoice",
                  "type": "SET",
                  "variable": "sc_rf_invoice_number",
                  "value": "sc_rf_invoice_number.trim()"
               },
               "default": {
                  "id": "rf_invoice_unrecognized_note",
                  "type": "SET",
                  "variable": "sc_rf_invoice_number",
                  "value": "'Customer provided: ' + sc_rf_invoice_number.trim() + ' (format not standard, please verify)'"
               }
            }
         },
         {
            "id": "ask_rf_date",
            "type": "SAY-GET",
            "variable": "sc_rf_purchase_date",
            "value": "What was the date of the purchase? (e.g. 03/15/2026) If you don't remember the exact date, {{cargo.verb}} UNKNOWN.",
            "value_es": "¿Cuál fue la fecha de la compra? (por ejemplo, 15/03/2026) Si no recuerda la fecha exacta, {{cargo.verb_es}} DESCONOCIDA."
         },
         {
            "id": "check_rf_date_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_rf_purchase_date.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_rf_date",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_rf_purchase_date.trim())": {
                  "id": "exit_rf_date",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "condition: /^(unknown|don'?t know|do not know|i don'?t remember|no recuerdo|desconocida|desconocido|no s[eé])$/i.test(sc_rf_purchase_date.trim())": {
                  "id": "set_rf_date_unknown",
                  "type": "SET",
                  "variable": "sc_rf_purchase_date",
                  "value": "'Customer does not remember the exact date'"
               },
               "default": {
                  "id": "trim_rf_date",
                  "type": "SET",
                  "variable": "sc_rf_purchase_date",
                  "value": "sc_rf_purchase_date.trim()"
               }
            }
         },
         {
            "id": "set_extra_details_rf",
            "type": "SET",
            "variable": "sc_extra_details",
            "value": "'Invoice Number: ' + sc_rf_invoice_number + ' | Purchase Date: ' + sc_rf_purchase_date"
         },
         {
            "id": "submit_rf",
            "type": "FLOW",
            "value": "sc-submit",
            "callType": "replace",
            "parameters": {
               "sc_ticket_type": "Account Issue",
               "sc_ticket_reason": "Refund",
               "sc_extra_details": "{{sc_extra_details}}",
               "sc_authenticated_phone": "{{sc_authenticated_phone}}",
               "sc_authenticated_email": "{{sc_authenticated_email}}"
            }
         }
      ]
   },

   /* --- sc-submit --- */
   {
      "id": "sc-submit",
      "name": "SCSubmit",
      "version": "1.0.0",
      "description": "Assembles contact info and description, then calls the create-service-case tool to submit the case",
      "parameters": [
         {
            "name": "sc_ticket_type",
            "type": "string",
            "description": "Ticket type category"
         },
         {
            "name": "sc_ticket_reason",
            "type": "string",
            "description": "Ticket reason"
         },
         {
            "name": "sc_extra_details",
            "type": "string",
            "description": "Additional details collected from user"
         },
         {
            "name": "sc_authenticated_phone",
            "type": "string",
            "description": "OTP-authenticated phone number"
         },
         {
            "name": "sc_authenticated_email",
            "type": "string",
            "description": "OTP-authenticated email address"
         }
      ],
      "variables": {
         "sc_display_name": {
            "type": "string",
            "description": "Customer display name",
            "value": ""
         },
         "sc_caller_id": {
            "type": "string",
            "description": "Caller ID",
            "value": ""
         },
         "sc_chat_history": {
            "type": "string",
            "description": "Chat history",
            "value": ""
         },
         "sc_first_name": {
            "type": "string",
            "description": "Customer first name",
            "value": ""
         },
         "sc_last_name": {
            "type": "string",
            "description": "Customer last name",
            "value": ""
         },
         "sc_phone": {
            "type": "string",
            "description": "Customer phone",
            "value": ""
         },
         "sc_email": {
            "type": "string",
            "description": "Customer email",
            "value": ""
         },
         "sc_is_auth_phone": {
            "type": "boolean",
            "description": "Whether phone was OTP-authenticated",
            "value": false
         },
         "sc_is_auth_email": {
            "type": "boolean",
            "description": "Whether email was OTP-authenticated",
            "value": false
         },
         "sc_description": {
            "type": "string",
            "description": "Assembled case description",
            "value": ""
         },
         "sc_contact_input": {
            "type": "string",
            "description": "Contact info provided by user when cargo has none",
            "value": ""
         },
         "sc_name_input": {
            "type": "string",
            "description": "Customer name provided by user when cargo has none",
            "value": ""
         },
         "sc_case_result": {
            "type": "object",
            "description": "Result from create-service-case tool call"
         },
         "sc_case_id_display": {
            "type": "string",
            "description": "Case ID for display, with fallback if missing",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "extract_display_name",
            "type": "SET",
            "variable": "sc_display_name",
            "value": "(typeof cargo.displayName !== 'undefined' && cargo.displayName) ? cargo.displayName : 'Not available'"
         },
         {
            "id": "normalize_display_name",
            "type": "SET",
            "variable": "sc_display_name",
            "value": "(sc_display_name !== 'Not available' && sc_display_name.includes(',')) ? sc_display_name.split(',').map(function(p){ return p.trim().toLowerCase().replace(/(^|[\\s\\-'])([a-zà-öø-ÿ])/g, function(m, pre, c) { return pre + c.toUpperCase(); }).replace(/\\s+/g, ' '); }).reverse().filter(function(p){ return p; }).join(' ').trim() : sc_display_name"
         },
         {
            "id": "extract_caller_id",
            "type": "SET",
            "variable": "sc_caller_id",
            "value": "(typeof cargo.callerId !== 'undefined' && cargo.callerId) ? cargo.callerId : 'Not available'"
         },
         {
            "id": "extract_chat_history",
            "type": "SET",
            "variable": "sc_chat_history",
            "value": "(typeof cargo.chatHistory !== 'undefined' && cargo.chatHistory) ? cargo.chatHistory : 'No chat history available'"
         },
         {
            "id": "extract_first_name",
            "type": "SET",
            "variable": "sc_first_name",
            "value": "(typeof cargo.firstName !== 'undefined' && cargo.firstName && !/\\b(user|guest|customer|curacao|llamante|cliente|invitado|usuario|wireless|unavailable|unknown|anonymous|private|caller|restricted|name)\\b/i.test(cargo.firstName.trim()) && !/^[\\d\\s\\-()+.]+$/.test(cargo.firstName.trim())) ? cargo.firstName : (sc_display_name !== 'Not available' && !/\\b(user|guest|customer|curacao|llamante|cliente|invitado|usuario|wireless|unavailable|unknown|anonymous|private|caller|restricted|name)\\b/i.test(sc_display_name.split(' ')[0].trim()) && !/^[\\d\\s\\-()+.]+$/.test(sc_display_name.split(' ')[0].trim()) ? sc_display_name.split(' ')[0] : '')"
         },
         {
            "id": "extract_last_name",
            "type": "SET",
            "variable": "sc_last_name",
            "value": "(typeof cargo.lastName !== 'undefined' && cargo.lastName && !/\\b(user|guest|customer|curacao|llamante|cliente|invitado|usuario|wireless|unavailable|unknown|anonymous|private|caller|restricted|name)\\b/i.test(cargo.lastName.trim()) && !/^[\\d\\s\\-()+.]+$/.test(cargo.lastName.trim())) ? cargo.lastName : (sc_display_name !== 'Not available' && !/\\b(user|guest|customer|curacao|llamante|cliente|invitado|usuario|wireless|unavailable|unknown|anonymous|private|caller|restricted|name)\\b/i.test(sc_display_name.trim()) && !/^[\\d\\s\\-()+.]+$/.test(sc_display_name.trim()) && sc_display_name.split(' ').length > 1 ? sc_display_name.split(' ').slice(1).join(' ') : '')"
         },
         {
            "id": "extract_phone",
            "type": "SET",
            "variable": "sc_phone",
            "value": "(typeof sc_authenticated_phone !== 'undefined' && sc_authenticated_phone) ? sc_authenticated_phone : (typeof cargo.otp_cell_number !== 'undefined' && cargo.otp_cell_number) ? cargo.otp_cell_number : (typeof cargo.lookup_cell !== 'undefined' && cargo.lookup_cell) ? cargo.lookup_cell : sc_caller_id !== 'Not available' ? sc_caller_id : ''"
         },
         {
            "id": "extract_email",
            "type": "SET",
            "variable": "sc_email",
            "value": "(typeof sc_authenticated_email !== 'undefined' && sc_authenticated_email) ? sc_authenticated_email : (typeof cargo.otp_email !== 'undefined' && cargo.otp_email) ? cargo.otp_email : (typeof cargo.lookup_email !== 'undefined' && cargo.lookup_email) ? cargo.lookup_email : ''"
         },
         {
            "id": "set_auth_phone_flag",
            "type": "SET",
            "variable": "sc_is_auth_phone",
            "value": "!!(typeof cargo.otpVerified !== 'undefined' && cargo.otpVerified && typeof cargo.otp_cell_number !== 'undefined' && cargo.otp_cell_number)"
         },
         {
            "id": "set_auth_email_flag",
            "type": "SET",
            "variable": "sc_is_auth_email",
            "value": "!!(typeof cargo.otpVerified !== 'undefined' && cargo.otpVerified && typeof cargo.otp_email !== 'undefined' && cargo.otp_email)"
         },
         {
            "id": "check_name_info",
            "type": "CASE",
            "branches": {
               "condition: sc_first_name || sc_last_name": {
                  "id": "name_exists",
                  "type": "SET",
                  "variable": "sc_name_input",
                  "value": "''"
               },
               "default": {
                  "id": "ask_name_info",
                  "type": "SAY-GET",
                  "variable": "sc_name_input",
                  "value": "I don't have your name on file. Please {{cargo.verb}} your first and last name.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "No tengo su nombre registrado. Por favor {{cargo.verb_es}} su nombre y apellido.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
               }
            },
            "_branchOrder": [
               "condition: sc_first_name || sc_last_name",
               "default"
            ]
         },
         {
            "id": "presanitize_name",
            "type": "SET",
            "variable": "sc_name_input",
            "value": "(function(){ var s = (sc_name_input || '').trim(); if(!s) return ''; var w = s.split(/\\s+/); if(w.length > 6 || /\\d/.test(s)){ return ''; } return s; })()"
         },
         {
            "id": "apply_name_input",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice((sc_name_input || '').toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_name",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test((sc_name_input || '').trim())": {
                  "id": "exit_name",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "condition: sc_name_input && sc_name_input.trim().indexOf(' ') !== -1": {
                  "id": "set_first_from_full_name",
                  "type": "SET",
                  "variable": "sc_first_name",
                  "value": "sc_name_input.trim().split(' ')[0]"
               },
               "condition: sc_name_input && sc_name_input.trim()": {
                  "id": "set_first_name_only",
                  "type": "SET",
                  "variable": "sc_first_name",
                  "value": "sc_name_input.trim()"
               },
               "default": {
                  "id": "no_name_change",
                  "type": "SET",
                  "variable": "sc_name_input",
                  "value": "''"
               }
            },
            "_branchOrder": [
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test((sc_name_input || '').trim())",
               "condition: sc_name_input && sc_name_input.trim().indexOf(' ') !== -1",
               "condition: sc_name_input && sc_name_input.trim()",
               "default"
            ]
         },
         {
            "id": "reask_name_if_empty",
            "type": "CASE",
            "branches": {
               "condition: sc_first_name || sc_last_name": {
                  "id": "name_collected_skip_reask",
                  "type": "SET",
                  "variable": "sc_name_input",
                  "value": "sc_name_input || ''"
               },
               "default": {
                  "id": "reask_name_info",
                  "type": "SAY-GET",
                  "variable": "sc_name_input",
                  "value": "I still need your name to create the case. Please {{cargo.verb}} your first and last name.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "Aún necesito su nombre para crear el caso. Por favor {{cargo.verb_es}} su nombre y apellido.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
               }
            },
            "_branchOrder": [
               "condition: sc_first_name || sc_last_name",
               "default"
            ]
         },
         {
            "id": "presanitize_name_reask",
            "type": "SET",
            "variable": "sc_name_input",
            "value": "(function(){ if(sc_first_name || sc_last_name) return (sc_name_input || ''); var s = (sc_name_input || '').trim(); if(!s) return ''; var w = s.split(/\\s+/); if(w.length > 6 || /\\d/.test(s)){ return ''; } return s; })()"
         },
         {
            "id": "reapply_name_input",
            "type": "CASE",
            "branches": {
               "condition: sc_first_name || sc_last_name": {
                  "id": "name_already_collected_noop",
                  "type": "SET",
                  "variable": "sc_name_input",
                  "value": "sc_name_input || ''"
               },
               "condition: matchesChoice((sc_name_input || '').toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_reask_name",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test((sc_name_input || '').trim())": {
                  "id": "exit_reask_name",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "condition: sc_name_input && sc_name_input.trim().indexOf(' ') !== -1": {
                  "id": "reask_set_first_from_full_name",
                  "type": "SET",
                  "variable": "sc_first_name",
                  "value": "sc_name_input.trim().split(' ')[0]"
               },
               "condition: sc_name_input && sc_name_input.trim()": {
                  "id": "reask_set_first_name_only",
                  "type": "SET",
                  "variable": "sc_first_name",
                  "value": "sc_name_input.trim()"
               },
               "default": {
                  "id": "reask_no_name_change",
                  "type": "SET",
                  "variable": "sc_name_input",
                  "value": "''"
               }
            },
            "_branchOrder": [
               "condition: sc_first_name || sc_last_name",
               "condition: matchesChoice((sc_name_input || '').toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])",
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test((sc_name_input || '').trim())",
               "condition: sc_name_input && sc_name_input.trim().indexOf(' ') !== -1",
               "condition: sc_name_input && sc_name_input.trim()",
               "default"
            ]
         },
         {
            "id": "apply_name_last",
            "type": "CASE",
            "branches": {
               "condition: sc_name_input && sc_name_input.trim().indexOf(' ') !== -1": {
                  "id": "set_last_from_full_name",
                  "type": "SET",
                  "variable": "sc_last_name",
                  "value": "sc_name_input.trim().split(' ').slice(1).join(' ')"
               },
               "default": {
                  "id": "no_last_name_change",
                  "type": "SET",
                  "variable": "sc_name_input",
                  "value": "sc_name_input || ''"
               }
            },
            "_branchOrder": [
               "condition: sc_name_input && sc_name_input.trim().indexOf(' ') !== -1",
               "default"
            ]
         },
         {
            "id": "check_last_name_missing",
            "type": "CASE",
            "branches": {
               "condition: sc_last_name || !sc_first_name": {
                  "id": "last_name_ok",
                  "type": "SET",
                  "variable": "sc_name_input",
                  "value": "sc_name_input || ''"
               },
               "default": {
                  "id": "ask_last_name",
                  "type": "SAY-GET",
                  "variable": "sc_last_name",
                  "value": "Thank you, {{sc_first_name}}. Please {{cargo.verb}} your last name.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "Gracias, {{sc_first_name}}. Por favor {{cargo.verb_es}} su apellido.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
               }
            },
            "_branchOrder": [
               "condition: sc_last_name || !sc_first_name",
               "default"
            ]
         },
         {
            "id": "check_last_name_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice((sc_last_name || '').toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_lastname",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test((sc_last_name || '').trim())": {
                  "id": "exit_last_name",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "condition: sc_last_name && sc_last_name.trim()": {
                  "id": "clean_last_name",
                  "type": "SET",
                  "variable": "sc_last_name",
                  "value": "sc_last_name.trim()"
               },
               "default": {
                  "id": "no_last_name_provided",
                  "type": "SET",
                  "variable": "sc_last_name",
                  "value": "''"
               }
            },
            "_branchOrder": [
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test((sc_last_name || '').trim())",
               "condition: sc_last_name && sc_last_name.trim()",
               "default"
            ]
         },
         {
            "id": "cap_name_length",
            "type": "SET",
            "variable": "noop_cap_name_length",
            "value": "sc_first_name = (sc_first_name || '').toString().trim().slice(0, 50), sc_last_name = (sc_last_name || '').toString().trim().slice(0, 50)"
         },
         {
            "id": "update_display_name",
            "type": "SET",
            "variable": "sc_display_name",
            "value": "(sc_first_name || sc_last_name) ? ((sc_first_name || '') + (sc_first_name && sc_last_name ? ' ' : '') + (sc_last_name || '')).trim() : sc_display_name"
         },
         {
            "id": "check_contact_info",
            "type": "CASE",
            "branches": {
               "condition: (typeof cargo.callerId !== 'undefined' && cargo.callerId) || (typeof cargo.otp_cell_number !== 'undefined' && cargo.otp_cell_number) || (typeof cargo.otp_email !== 'undefined' && cargo.otp_email) || (typeof sc_authenticated_phone !== 'undefined' && sc_authenticated_phone) || (typeof sc_authenticated_email !== 'undefined' && sc_authenticated_email)": {
                  "id": "contact_exists",
                  "type": "SET",
                  "variable": "sc_contact_input",
                  "value": "''"
               },
               "default": {
                  "id": "ask_contact_info",
                  "type": "SAY-GET",
                  "variable": "sc_contact_input",
                  "value": "So we can follow up with you, please {{cargo.verb}} your phone number or email address.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "Para poder darle seguimiento, por favor {{cargo.verb_es}} su número de teléfono o correo electrónico.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
               }
            }
         },
         {
            "id": "apply_contact_input",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice((sc_contact_input || '').toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_contact",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: !sc_contact_input || !sc_contact_input.trim()": {
                  "id": "no_contact_provided",
                  "type": "SET",
                  "variable": "sc_contact_input",
                  "value": "''"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_contact_input.trim())": {
                  "id": "exit_contact",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "condition: sc_contact_input && /\\S+@\\S+\\.\\S+/.test(sc_contact_input.trim())": {
                  "id": "set_email_from_input",
                  "type": "SET",
                  "variable": "sc_email",
                  "value": "sc_contact_input.trim()"
               },
               "condition: sc_contact_input && /^\\d{7,}$/.test(sc_contact_input.trim().replace(/[^\\d]/g, ''))": {
                  "id": "set_phone_from_input",
                  "type": "SET",
                  "variable": "sc_phone",
                  "value": "sc_contact_input.trim().replace(/[^\\d]/g, '')"
               },
               "default": {
                  "id": "retry_contact_input",
                  "type": "SAY-GET",
                  "variable": "sc_contact_input",
                  "value": "I didn't recognize that as a valid phone number or email address. Please {{cargo.verb}} a 10-digit phone number or an email address.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "No reconocí eso como un número de teléfono o correo electrónico válido. Por favor {{cargo.verb_es}} un número de teléfono de 10 dígitos o una dirección de correo electrónico.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
               }
            }
         },
         {
            "id": "apply_contact_retry",
            "type": "CASE",
            "branches": {
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test((sc_contact_input || '').trim())": {
                  "id": "exit_contact_retry",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "condition: sc_contact_input && /\\S+@\\S+\\.\\S+/.test(sc_contact_input.trim())": {
                  "id": "set_email_from_retry",
                  "type": "SET",
                  "variable": "sc_email",
                  "value": "sc_contact_input.trim()"
               },
               "condition: sc_contact_input && /^\\d{7,}$/.test(sc_contact_input.trim().replace(/[^\\d]/g, ''))": {
                  "id": "set_phone_from_retry",
                  "type": "SET",
                  "variable": "sc_phone",
                  "value": "sc_contact_input.trim().replace(/[^\\d]/g, '')"
               },
               "default": {
                  "id": "contact_fallback",
                  "type": "SET",
                  "variable": "sc_contact_input",
                  "value": "''"
               }
            }
         },
         {
            "id": "maybe_lookup_account_for_case",
            "type": "CASE",
            "branches": {
               "condition: !cargo.accountNumber && ((typeof sc_phone !== 'undefined' && sc_phone) || (typeof sc_email !== 'undefined' && sc_email))": {
                  "id": "do_lookup_for_case",
                  "type": "CALL-TOOL",
                  "tool": "lookup-account",
                  "variable": "sc_case_lookup",
                  "args": {
                     "email": "{{sc_email}}",
                     "phone_number": "{{sc_phone}}"
                  },
                  "onFail": {
                     "id": "case_lookup_failed",
                     "type": "SET",
                     "variable": "noop_case_lookup_failed",
                     "value": "true"
                  }
               },
               "default": {
                  "id": "skip_case_lookup",
                  "type": "SET",
                  "variable": "noop_skip_case_lookup",
                  "value": "true"
               }
            }
         },
         {
            "id": "set_account_from_case_lookup",
            "type": "SET",
            "variable": "noop_set_account_from_lookup",
            "value": "cargo.accountNumber = (cargo.accountNumber || ((typeof sc_case_lookup !== 'undefined' && sc_case_lookup && sc_case_lookup.success && sc_case_lookup.customer_info && sc_case_lookup.customer_info.cust_id) ? sc_case_lookup.customer_info.cust_id : '') || '')"
         },
         {
            "id": "fill_email_from_case_lookup",
            "type": "SET",
            "variable": "sc_email",
            "value": "(sc_email || ((typeof sc_case_lookup !== 'undefined' && sc_case_lookup && sc_case_lookup.customer_info && sc_case_lookup.customer_info.email) ? sc_case_lookup.customer_info.email : '') || '')"
         },
         {
            "id": "fill_phone_from_case_lookup",
            "type": "SET",
            "variable": "sc_phone",
            "value": "(sc_phone || ((typeof sc_case_lookup !== 'undefined' && sc_case_lookup && sc_case_lookup.customer_info && sc_case_lookup.customer_info.cell) ? sc_case_lookup.customer_info.cell : '') || '')"
         },
         {
            "id": "say_submitting",
            "type": "SAY",
            "value": "Thank you! Submitting your service case now, please wait...",
            "value_es": "¡Gracias! Enviando su caso de servicio ahora, por favor espere..."
         },
         {
            "id": "build_description",
            "type": "SET",
            "variable": "sc_description",
            "value": "'Service case submitted via AI assistant.\\nTicket Type: ' + sc_ticket_type + '\\nTicket Reason: ' + sc_ticket_reason + ((typeof sc_extra_details !== 'undefined' && sc_extra_details) ? '\\nAdditional Details: ' + sc_extra_details : '') + '\\nCustomer Name: ' + sc_display_name + '\\nCaller ID: ' + sc_caller_id + '\\n\\nChat History:\\n' + sc_chat_history"
         },
         {
            "id": "call_create_service_case",
            "type": "CALL-TOOL",
            "tool": "create-service-case",
            "variable": "sc_case_result",
            "args": {
               "firstname": "{{sc_first_name}}",
               "lastname": "{{sc_last_name}}",
               "email": "{{sc_email}}",
               "phone": "{{sc_phone}}",
               "title": "{{sc_ticket_type}}: {{sc_ticket_reason}}",
               "description": "{{sc_description}}",
               "ticket_type": "{{sc_ticket_type}}",
               "ticket_reason": "{{sc_ticket_reason}}",
               "authenticated_phone": "{{sc_is_auth_phone}}",
               "authenticated_email": "{{sc_is_auth_email}}",
               "account_number": "{{cargo.accountNumber}}"
            },
            "onFail": {
               "id": "tool_fail",
               "type": "FLOW",
               "value": "sc-handle-failure",
               "callType": "reboot"
            }
         },
         {
            "id": "set_case_id_display",
            "type": "SET",
            "variable": "sc_case_id_display",
            "value": "(sc_case_result && sc_case_result.ticket_number) ? 'VA-' + sc_case_result.ticket_number.split('-')[1] : ((sc_case_result && sc_case_result.case_id) ? sc_case_result.case_id : 'pending')"
         },
         {
            "id": "check_result",
            "type": "CASE",
            "branches": {
               "condition: sc_case_result && sc_case_result.success && (sc_case_result.ticket_number || sc_case_result.case_id)": {
                  "id": "say_success",
                  "type": "CASE",
                  "branches": {
                     "condition: sc_ticket_type === 'Reissue Credit Card'": {
                        "id": "success_reissue_card",
                        "type": "SAY",
                        "value": "Your request to reissue your credit card has been submitted! Your case number is {{sc_case_id_display}}. Please allow 3-5 business days for your new card to arrive by mail.",
                        "value_es": "¡Su solicitud para reemitir su tarjeta de crédito ha sido enviada! Su número de caso es {{sc_case_id_display}}. Por favor permita de 3 a 5 días hábiles para que su nueva tarjeta llegue por correo."
                     },
                     "condition: sc_ticket_reason === 'Account Number'": {
                        "id": "success_acct_number",
                        "type": "SAY",
                        "value": "Your request for your account number has been submitted! Your case number is {{sc_case_id_display}}. A representative will reach out to you with your account details.",
                        "value_es": "¡Su solicitud de número de cuenta ha sido enviada! Su número de caso es {{sc_case_id_display}}. Un representante se comunicará con usted con los detalles de su cuenta."
                     },
                     "condition: sc_ticket_reason === 'Place Alert'": {
                        "id": "success_fraud_alert",
                        "type": "SAY",
                        "value": "Your fraud alert request has been submitted! Your case number is {{sc_case_id_display}}. Our fraud team will review and place the alert on your account promptly.",
                        "value_es": "¡Su solicitud de alerta de fraude ha sido enviada! Su número de caso es {{sc_case_id_display}}. Nuestro equipo de fraude revisará y colocará la alerta en su cuenta a la brevedad."
                     },
                     "condition: sc_ticket_reason === 'Unauthorized Purchase'": {
                        "id": "success_unauthorized",
                        "type": "SAY",
                        "value": "Your unauthorized purchase report has been submitted! Your case number is {{sc_case_id_display}}. Our fraud team will investigate and follow up with you.",
                        "value_es": "¡Su reporte de compra no autorizada ha sido enviado! Su número de caso es {{sc_case_id_display}}. Nuestro equipo de fraude investigará y se comunicará con usted."
                     },
                     "condition: sc_ticket_reason === 'Change of address'": {
                        "id": "success_change_address",
                        "type": "SAY",
                        "value": "Your address change request has been submitted! Your case number is {{sc_case_id_display}}. Your records will be updated shortly.",
                        "value_es": "¡Su solicitud de cambio de dirección ha sido enviada! Su número de caso es {{sc_case_id_display}}. Sus registros serán actualizados en breve."
                     },
                     "condition: sc_ticket_reason === 'Missing Payment'": {
                        "id": "success_missing_payment",
                        "type": "SAY",
                        "value": "Your missing payment report has been submitted! Your case number is {{sc_case_id_display}}. Our team will research the payment and follow up with you.",
                        "value_es": "¡Su reporte de pago faltante ha sido enviado! Su número de caso es {{sc_case_id_display}}. Nuestro equipo investigará el pago y se comunicará con usted."
                     },
                     "condition: sc_ticket_reason === 'Refund'": {
                        "id": "success_refund",
                        "type": "SAY",
                        "value": "Your refund request has been submitted! Your case number is {{sc_case_id_display}}. Our team will review your request and process it as quickly as possible.",
                        "value_es": "¡Su solicitud de reembolso ha sido enviada! Su número de caso es {{sc_case_id_display}}. Nuestro equipo revisará su solicitud y la procesará lo antes posible."
                     },
                     "condition: sc_ticket_reason === 'Credit Increase'": {
                        "id": "success_credit_increase",
                        "type": "SAY",
                        "value": "Your credit increase request has been submitted! Your case number is {{sc_case_id_display}}. Our credit team will review your account and get back to you.",
                        "value_es": "¡Su solicitud de aumento de crédito ha sido enviada! Su número de caso es {{sc_case_id_display}}. Nuestro equipo de crédito revisará su cuenta y se comunicará con usted."
                     },
                     "condition: sc_ticket_reason === 'Activate Account'": {
                        "id": "success_activate",
                        "type": "SAY",
                        "value": "Your account activation request has been submitted! Your case number is {{sc_case_id_display}}. Our team will process the activation and follow up with you.",
                        "value_es": "¡Su solicitud de activación de cuenta ha sido enviada! Su número de caso es {{sc_case_id_display}}. Nuestro equipo procesará la activación y se comunicará con usted."
                     },
                     "condition: sc_ticket_type === 'Cancellation'": {
                        "id": "success_cancellation",
                        "type": "SAY",
                        "value": "Your cancellation request has been submitted! Your case number is {{sc_case_id_display}}. Our team will process your cancellation and confirm once it's complete.",
                        "value_es": "¡Su solicitud de cancelación ha sido enviada! Su número de caso es {{sc_case_id_display}}. Nuestro equipo procesará su cancelación y confirmará cuando esté completa."
                     },
                     "condition: sc_ticket_type === 'Store Call Back'": {
                        "id": "success_store_callback",
                        "type": "SAY",
                        "value": "Your callback request has been sent to our {{sc_ticket_reason}} store! Your case number is {{sc_case_id_display}}. A store representative will call you back as soon as possible.",
                        "value_es": "¡Su solicitud de devolución de llamada ha sido enviada a nuestra tienda de {{sc_ticket_reason}}! Su número de caso es {{sc_case_id_display}}. Un representante de la tienda le devolverá la llamada lo antes posible."
                     },
                     "default": {
                        "id": "success_generic",
                        "type": "SAY",
                        "value": "Your service case has been created successfully! Your case number is {{sc_case_id_display}}. Our team will review your request and get back to you as soon as possible.",
                        "value_es": "¡Su caso de servicio ha sido creado exitosamente! Su número de caso es {{sc_case_id_display}}. Nuestro equipo revisará su solicitud y se comunicará con usted lo antes posible."
                     }
                  },
                  "_branchOrder": [
                     "condition: sc_ticket_type === 'Reissue Credit Card'",
                     "condition: sc_ticket_reason === 'Account Number'",
                     "condition: sc_ticket_reason === 'Place Alert'",
                     "condition: sc_ticket_reason === 'Unauthorized Purchase'",
                     "condition: sc_ticket_reason === 'Change of address'",
                     "condition: sc_ticket_reason === 'Missing Payment'",
                     "condition: sc_ticket_reason === 'Refund'",
                     "condition: sc_ticket_reason === 'Credit Increase'",
                     "condition: sc_ticket_reason === 'Activate Account'",
                     "condition: sc_ticket_type === 'Cancellation'",
                     "condition: sc_ticket_type === 'Store Call Back'",
                     "default"
                  ]
               },
               "default": {
                  "id": "result_fail",
                  "type": "FLOW",
                  "value": "sc-handle-failure",
                  "callType": "reboot"
               }
            },
         },
         {
            "id": "ask_anything_else_after_success",
            "type": "CASE",
            "branches": {
               "condition: sc_case_result && sc_case_result.success && (sc_case_result.ticket_number || sc_case_result.case_id)": {
                  "id": "follow_up_anything_else",
                  "type": "SAY",
                  "value": "Is there anything else I can help you with today?",
                  "value_es": "¿Hay algo más en lo que pueda ayudarle hoy?"
               },
               "default": {
                  "id": "no_followup_on_failure",
                  "type": "SET",
                  "variable": "noop_no_followup",
                  "value": "true"
               }
            }
         },
         {
            "id": "remember_last_submitted_case",
            "type": "CASE",
            "branches": {
               "condition: sc_case_result && sc_case_result.success && (sc_case_result.ticket_number || sc_case_result.case_id)": {
                  "id": "store_last_submitted_case",
                  "type": "SET",
                  "variable": "remember_side_effect",
                  "value": "cargo.lastSubmittedCase = { ticket_type: sc_ticket_type, ticket_reason: sc_ticket_reason, ticket_number: sc_case_id_display, submitted_at: Date.now() }"
               },
               "default": {
                  "id": "no_remember_on_failure",
                  "type": "SET",
                  "variable": "noop_no_remember",
                  "value": "true"
               }
            }
         },
         {
            "id": "end_submit",
            "type": "SET",
            "variable": "sc_completed",
            "value": "true"
         }
      ]
   },

   /* --- sc-credit-card --- */
   {
      "id": "sc-reissue-get-account-number",
      "name": "SCReissueGetAccountNumber",
      "version": "1.0.0",
      "description": "Sub-flow: when a Reissue Credit Card case cannot resolve the customer's account number from their phone/email, ask the customer for it directly. Reissue REQUIRES an account number (the API rejects the case with a 422 without one), so submitting without it guarantees failure. Validates the account number (starts with 5, 7-8 digits), re-asks once on invalid input, and escalates to a live agent if it still cannot be resolved.",
      "variables": {
         "acct_input": {
            "type": "string",
            "description": "Account number entered by the customer"
         }
      },
      "steps": [
         {
            "id": "init_acct_tries",
            "type": "SET",
            "variable": "noop_init_acct_tries",
            "value": "(function(){ if(typeof cargo.reissue_acct_tries === 'undefined' || cargo.reissue_acct_tries === '') cargo.reissue_acct_tries = 0; return true; })()"
         },
         {
            "id": "ask_acct",
            "type": "SAY-GET",
            "variable": "acct_input",
            "value": "{{cargo.reissue_acct_reask ? cargo.reissue_acct_reask + ' ' : \"I couldn't find your account from your phone number. \"}}To reissue your card I need to link it to your account. Please {{cargo.verb}} your account number. It starts with 5 and is 7 to 8 digits long.\nTo speak with a representative {{cargo.verb}} AGENT.",
            "value_es": "{{cargo.reissue_acct_reask_es ? cargo.reissue_acct_reask_es + ' ' : 'No pude encontrar su cuenta con su número de teléfono. '}}Para reemitir su tarjeta necesito vincularla a su cuenta. Por favor {{cargo.verb_es}} su número de cuenta. Comienza con 5 y tiene de 7 a 8 dígitos.\nPara hablar con un representante {{cargo.verb_es}} AGENTE.",
            "digits": {
               "min": 7,
               "max": 8
            }
         },
         {
            "id": "clear_acct_reask",
            "type": "SET",
            "variable": "noop_clear_acct_reask",
            "value": "cargo.reissue_acct_reask = '', cargo.reissue_acct_reask_es = ''"
         },
         {
            "id": "normalize_acct",
            "type": "SET",
            "variable": "acct_input",
            "value": "(acct_input || '').trim()"
         },
         {
            "id": "classify_acct",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice((acct_input || '').toLowerCase(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent','agente','human','persona','hablar con alguien'])": {
                  "id": "acct_route_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test((acct_input || '').trim())": {
                  "id": "acct_exit",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "condition: /^5\\d{6,7}$/.test((acct_input || '').replace(/[^0-9]/g, ''))": {
                  "id": "acct_valid",
                  "type": "SET",
                  "variable": "noop_acct_valid",
                  "value": "cargo.accountNumber = (acct_input || '').replace(/[^0-9]/g, ''), cargo.reissue_acct_tries = 0"
               },
               "default": {
                  "id": "acct_invalid",
                  "type": "SET",
                  "variable": "noop_acct_invalid",
                  "value": "cargo.reissue_acct_tries = (cargo.reissue_acct_tries || 0) + 1, cargo.reissue_acct_reask = 'Sorry, that account number does not look right.', cargo.reissue_acct_reask_es = 'Lo siento, ese número de cuenta no parece correcto.'"
               }
            }
         },
         {
            "id": "route_acct",
            "type": "CASE",
            "branches": {
               "condition: cargo.accountNumber": {
                  "id": "acct_resolved",
                  "type": "SET",
                  "variable": "noop_acct_resolved",
                  "value": "true"
               },
               "condition: (cargo.reissue_acct_tries || 0) >= 2": {
                  "id": "acct_give_up_to_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "default": {
                  "id": "loop_acct",
                  "type": "FLOW",
                  "value": "sc-reissue-get-account-number",
                  "callType": "call"
               }
            }
         }
      ]
   },
   {
      "id": "sc-credit-card",
      "name": "SCCreditCard",
      "version": "1.0.0",
      "description": "Service case sub-flow for credit card issues. Branches to Account Number (under 'Curacao Credit Card' ticket type, no auth required) or to one of six Reissue reasons (Lost, Damaged, Lost-In-Store, Never Received, New Card, Stolen — under 'Reissue Credit Card' ticket type, requires OTP authentication and account lookup before submission so the case is properly linked to the customer's account number).",
      "parameters": [
         {
            "name": "ticket_reason",
            "type": "string",
            "description": "Pre-detected ticket reason from AI"
         },
         {
            "name": "ticket_detail",
            "type": "string",
            "description": "Pre-detected detail from user's initial message (e.g. lost, stolen, damaged, broken, never received)"
         }
      ],
      "variables": {
         "sc_cc_choice": {
            "type": "string",
            "description": "User's credit card reason choice",
            "value": ""
         },
         "sc_ticket_type": {
            "type": "string",
            "description": "Ticket type (defaults to Curacao Credit Card; switched to 'Reissue Credit Card' at submit time when applicable)",
            "value": "Curacao Credit Card"
         },
         "sc_ticket_reason": {
            "type": "string",
            "description": "Ticket reason",
            "value": ""
         },
         "sc_extra_details": {
            "type": "string",
            "description": "Additional details",
            "value": ""
         },
         "sc_confirm_intent": {
            "type": "string",
            "description": "User confirmation that this is the right ticket type",
            "value": ""
         },
         "sc_reissue_reason": {
            "type": "string",
            "description": "Specific reissue sub-reason: Lost, Damaged, Lost-In-Store, Never Received, New Card, or Stolen",
            "value": ""
         },
         "sc_reissue_choice": {
            "type": "string",
            "description": "User's menu selection for the reissue sub-reason",
            "value": ""
         },
         "sc_cc_lookup_result": {
            "type": "object",
            "description": "Result from lookup-account tool when authenticating for Reissue Credit Card",
            "value": null
         },
         "sc_cc_lookup_email": {
            "type": "string",
            "description": "Email captured from OTP for the lookup-account call",
            "value": ""
         },
         "sc_cc_lookup_phone": {
            "type": "string",
            "description": "Phone captured from OTP for the lookup-account call",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "confirm_intent",
            "type": "SAY-GET",
            "variable": "sc_confirm_intent",
            "value": "It sounds like you need help with your Curacao credit card. Should I go ahead? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to continue, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO if I misunderstood and you need help with something else.",
            "value_es": "Parece que necesita ayuda con su tarjeta de crédito Curacao. ¿Procedo? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ para continuar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO si entendí mal y necesita ayuda con otra cosa.",
            "digits": { "min": 1, "max": 1 }
         },
         {
            "id": "normalize_confirm_intent",
            "type": "SET",
            "variable": "sc_confirm_intent",
            "value": "sc_confirm_intent.trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "branch_confirm_intent",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_confirm_intent.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: ['yes', 'y', '1', 'sure', 'si', 'sí', 'ok', 'okay'].includes(sc_confirm_intent)": {
                  "id": "confirmed_proceed",
                  "type": "SET",
                  "variable": "noop_confirmed",
                  "value": "true"
               },
               "default": {
                  "id": "abort_no_intent_forward_to_ai",
                  "type": "RETURN",
                  "value": "''"
               }
            }
         },
         {
            "id": "check_recent_duplicate_reissue",
            "type": "CASE",
            "branches": {
               "condition: cargo.lastSubmittedCase && cargo.lastSubmittedCase.ticket_type === 'Reissue Credit Card' && (Date.now() - (cargo.lastSubmittedCase.submitted_at || 0)) < 30 * 60 * 1000": {
                  "id": "ask_confirm_duplicate_reissue",
                  "type": "SAY-GET",
                  "variable": "sc_dup_confirm",
                  "value": "I see you just submitted a card reissue request a moment ago (case {{cargo.lastSubmittedCase.ticket_number}}). Are you sure you want to submit another one? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to continue, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO if that's already been handled.",
                  "value_es": "Veo que acaba de enviar una solicitud de reemisión de tarjeta hace un momento (caso {{cargo.lastSubmittedCase.ticket_number}}). ¿Está seguro de que desea enviar otra? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ para continuar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO si ya fue atendido.",
                  "digits": { "min": 1, "max": 1 }
               },
               "default": {
                  "id": "no_recent_dup_reissue",
                  "type": "SET",
                  "variable": "noop_no_dup_reissue",
                  "value": "true"
               }
            }
         },
         {
            "id": "handle_dup_confirm_reissue",
            "type": "CASE",
            "branches": {
               "condition: cargo.lastSubmittedCase && cargo.lastSubmittedCase.ticket_type === 'Reissue Credit Card' && (Date.now() - (cargo.lastSubmittedCase.submitted_at || 0)) < 30 * 60 * 1000 && /^(no|n|2|nope|nah)$/i.test((sc_dup_confirm || '').trim())": {
                  "id": "skip_duplicate_reissue",
                  "type": "FLOW",
                  "value": "no-action-needed",
                  "callType": "reboot"
               },
               "default": {
                  "id": "proceed_with_reissue",
                  "type": "SET",
                  "variable": "noop_proceed_reissue",
                  "value": "true"
               }
            }
         },
         {
            "id": "check_predetected_reason",
            "type": "CASE",
            "branches": {
               "condition: typeof ticket_reason !== 'undefined' && /account\\s*number|número.*cuenta/i.test(ticket_reason)": {
                  "id": "set_acct_number",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Account Number'"
               },
               "condition: /reissue|tarjeta|\\blost\\b|damaged|broken|stolen|robad|never\\s*received|didn'?t\\s*receive|nunca.*recib|new\\s*card|tarjeta\\s*nueva|lost.in.store|perdid|da\\u00f1ad|danad|roto|rota/i.test((typeof ticket_reason !== 'undefined' ? ticket_reason : '') + ' ' + (typeof ticket_detail !== 'undefined' ? ticket_detail : ''))": {
                  "id": "set_reissue",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Reissue Credit Card'"
               },
               "default": {
                  "id": "ask_cc_reason",
                  "type": "SAY-GET",
                  "variable": "sc_cc_choice",
                  "value": "What do you need help with regarding your Curacao Credit Card?\n1. Reissue Credit Card\n2. Account Number\n\nPlease {{cargo.verb}} the option number.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "¿Con qué necesita ayuda respecto a su Tarjeta de Crédito Curacao?\n1. Reemitir Tarjeta de Crédito\n2. Número de Cuenta\n\nPor favor {{cargo.verb_es}} el número de opción.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR.",
                  "digits": {
                     "min": 1,
                     "max": 1
                  }
               }
            }
         },
         {
            "id": "branch_cc_reason",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason": {
                  "id": "reason_already_set",
                  "type": "SET",
                  "variable": "sc_cc_proceed",
                  "value": "true"
               },
               "condition: /^(1|reissue|tarjeta)/i.test(sc_cc_choice.trim())": {
                  "id": "set_reissue_from_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Reissue Credit Card'"
               },
               "condition: /^(2|account|número|numero)/i.test(sc_cc_choice.trim())": {
                  "id": "set_acct_from_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Account Number'"
               },
               "condition: matchesChoice(sc_cc_choice.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_cc",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_cc_choice.trim())": {
                  "id": "exit_cc",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "retry_cc",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "I didn't understand your selection. Please try again.",
                     "error_message_es": "No entendí su selección. Por favor intente de nuevo.",
                     "retry_flow": "sc-credit-card",
                     "cancel_flow": "contact-support"
                  }
               }
            }
         },
         {
            "id": "say_reissue_needs_auth",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason === 'Reissue Credit Card' && !cargo.otpVerified": {
                  "id": "announce_reissue_auth",
                  "type": "SAY",
                  "value": "For your security, I need to verify your identity before reissuing your card — I'll send a one-time code to the phone number or email on your account.",
                  "value_es": "Por su seguridad, necesito verificar su identidad antes de reemitir su tarjeta — le enviaré un código único al número de teléfono o correo electrónico registrado en su cuenta."
               },
               "default": {
                  "id": "no_auth_needed_for_cc",
                  "type": "SET",
                  "variable": "noop_no_auth_cc",
                  "value": "true"
               }
            }
         },
         {
            "id": "run_reissue_auth",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason === 'Reissue Credit Card' && !cargo.otpVerified": {
                  "id": "call_authenticate_for_reissue",
                  "type": "FLOW",
                  "value": "authenticate-user",
                  "callType": "call",
                  "parameters": {
                     "retry_flow": "sc-credit-card",
                     "cancel_flow": "contact-support",
                     "email_validator": "validate-email-has-account"
                  }
               },
               "default": {
                  "id": "skip_auth_for_cc",
                  "type": "SET",
                  "variable": "noop_skip_auth_cc",
                  "value": "true"
               }
            }
         },
         {
            "id": "verify_reissue_auth_succeeded",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason === 'Reissue Credit Card' && !cargo.otpVerified": {
                  "id": "reissue_auth_failed",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "We were unable to verify your identity. Please try again.",
                     "error_message_es": "No pudimos verificar su identidad. Por favor intente de nuevo.",
                     "retry_flow": "sc-credit-card",
                     "cancel_flow": "contact-support"
                  }
               },
               "default": {
                  "id": "reissue_auth_ok_or_not_needed",
                  "type": "SET",
                  "variable": "noop_reissue_auth_ok",
                  "value": "true"
               }
            }
         },
         {
            "id": "set_reissue_lookup_email",
            "type": "SET",
            "variable": "sc_cc_lookup_email",
            "value": "cargo.otp_email || ''"
         },
         {
            "id": "set_reissue_lookup_phone",
            "type": "SET",
            "variable": "sc_cc_lookup_phone",
            "value": "cargo.otp_cell_number || cargo.callerId || ''"
         },
         {
            "id": "lookup_account_for_reissue",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason === 'Reissue Credit Card' && cargo.otpVerified && !cargo.accountNumber": {
                  "id": "do_lookup_for_reissue",
                  "type": "CALL-TOOL",
                  "tool": "lookup-account",
                  "variable": "sc_cc_lookup_result",
                  "args": {
                     "email": "{{sc_cc_lookup_email}}",
                     "phone_number": "{{sc_cc_lookup_phone}}"
                  },
                  "onFail": {
                     "id": "lookup_soft_fail_cc",
                     "type": "SET",
                     "variable": "sc_cc_lookup_result",
                     "value": "{ success: false }"
                  }
               },
               "default": {
                  "id": "skip_lookup_for_cc",
                  "type": "SET",
                  "variable": "noop_skip_lookup_cc",
                  "value": "true"
               }
            }
         },
         {
            "id": "store_reissue_account_info",
            "type": "CASE",
            "branches": {
               "condition: typeof sc_cc_lookup_result !== 'undefined' && sc_cc_lookup_result && sc_cc_lookup_result.success && sc_cc_lookup_result.customer_info && sc_cc_lookup_result.customer_info.cust_id": {
                  "id": "store_cc_customer_info",
                  "type": "SET",
                  "variable": "sc_cc_lookup_stored",
                  "value": "cargo.firstName = sc_cc_lookup_result.customer_info.first_name, cargo.lastName = sc_cc_lookup_result.customer_info.last_name, cargo.accountNumber = sc_cc_lookup_result.customer_info.cust_id, cargo.lookup_email = sc_cc_lookup_result.customer_info.email || '', cargo.lookup_cell = sc_cc_lookup_result.customer_info.cell || ''"
               },
               "default": {
                  "id": "no_cc_lookup_data",
                  "type": "SET",
                  "variable": "noop_no_cc_lookup",
                  "value": "true"
               }
            }
         },
         {
            "id": "ensure_reissue_account_number",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason === 'Reissue Credit Card' && !cargo.accountNumber": {
                  "id": "get_reissue_account_number",
                  "type": "FLOW",
                  "value": "sc-reissue-get-account-number",
                  "callType": "call"
               },
               "default": {
                  "id": "have_reissue_account_number",
                  "type": "SET",
                  "variable": "noop_have_reissue_acct",
                  "value": "true"
               }
            }
         },
         {
            "id": "greet_reissue_customer",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason === 'Reissue Credit Card' && cargo.firstName && typeof sc_cc_lookup_result !== 'undefined' && sc_cc_lookup_result && sc_cc_lookup_result.success": {
                  "id": "greet_reissue",
                  "type": "SAY",
                  "value": "Thank you, {{cargo.firstName}}! I found your account.",
                  "value_es": "¡Gracias, {{cargo.firstName}}! Encontré su cuenta."
               },
               "default": {
                  "id": "no_greet_reissue",
                  "type": "SET",
                  "variable": "noop_no_greet_reissue",
                  "value": "true"
               }
            }
         },
         {
            "id": "map_reissue_detail",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason !== 'Reissue Credit Card'": {
                  "id": "skip_detail_map_not_reissue",
                  "type": "SET",
                  "variable": "sc_reissue_reason",
                  "value": "sc_reissue_reason"
               },
               "condition: /lost.?in.?store|perdid[oa]\\s*en\\s*la\\s*tienda/i.test((typeof ticket_reason !== 'undefined' ? ticket_reason : '') + ' ' + (typeof ticket_detail !== 'undefined' ? ticket_detail : ''))": {
                  "id": "detail_lost_in_store",
                  "type": "SET",
                  "variable": "sc_reissue_reason",
                  "value": "'Lost-In-Store'"
               },
               "condition: /stolen|robad/i.test((typeof ticket_reason !== 'undefined' ? ticket_reason : '') + ' ' + (typeof ticket_detail !== 'undefined' ? ticket_detail : ''))": {
                  "id": "detail_stolen",
                  "type": "SET",
                  "variable": "sc_reissue_reason",
                  "value": "'Stolen'"
               },
               "condition: /damaged|broken|da\\u00f1ad|danad|roto|rota/i.test((typeof ticket_reason !== 'undefined' ? ticket_reason : '') + ' ' + (typeof ticket_detail !== 'undefined' ? ticket_detail : ''))": {
                  "id": "detail_damaged",
                  "type": "SET",
                  "variable": "sc_reissue_reason",
                  "value": "'Damaged'"
               },
               "condition: /never\\s*received|didn'?t\\s*receive|nunca.*recib|no.*recib/i.test((typeof ticket_reason !== 'undefined' ? ticket_reason : '') + ' ' + (typeof ticket_detail !== 'undefined' ? ticket_detail : ''))": {
                  "id": "detail_never_received",
                  "type": "SET",
                  "variable": "sc_reissue_reason",
                  "value": "'Never Received'"
               },
               "condition: /\\blost\\b|perdid/i.test((typeof ticket_reason !== 'undefined' ? ticket_reason : '') + ' ' + (typeof ticket_detail !== 'undefined' ? ticket_detail : ''))": {
                  "id": "detail_lost",
                  "type": "SET",
                  "variable": "sc_reissue_reason",
                  "value": "'Lost'"
               },
               "default": {
                  "id": "detail_unknown",
                  "type": "SET",
                  "variable": "sc_reissue_reason",
                  "value": "sc_reissue_reason"
               }
            },
            "_branchOrder": [
               "condition: sc_ticket_reason !== 'Reissue Credit Card'",
               "condition: /lost.?in.?store|perdid[oa]\\s*en\\s*la\\s*tienda/i.test((typeof ticket_reason !== 'undefined' ? ticket_reason : '') + ' ' + (typeof ticket_detail !== 'undefined' ? ticket_detail : ''))",
               "condition: /stolen|robad/i.test((typeof ticket_reason !== 'undefined' ? ticket_reason : '') + ' ' + (typeof ticket_detail !== 'undefined' ? ticket_detail : ''))",
               "condition: /damaged|broken|da\\u00f1ad|danad|roto|rota/i.test((typeof ticket_reason !== 'undefined' ? ticket_reason : '') + ' ' + (typeof ticket_detail !== 'undefined' ? ticket_detail : ''))",
               "condition: /never\\s*received|didn'?t\\s*receive|nunca.*recib|no.*recib/i.test((typeof ticket_reason !== 'undefined' ? ticket_reason : '') + ' ' + (typeof ticket_detail !== 'undefined' ? ticket_detail : ''))",
               "condition: /\\blost\\b|perdid/i.test((typeof ticket_reason !== 'undefined' ? ticket_reason : '') + ' ' + (typeof ticket_detail !== 'undefined' ? ticket_detail : ''))",
               "default"
            ]
         },
         {
            "id": "ask_cc_details",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason === 'Reissue Credit Card' && sc_reissue_reason": {
                  "id": "reissue_reason_predetected",
                  "type": "SET",
                  "variable": "sc_reissue_choice",
                  "value": "sc_reissue_reason"
               },
               "condition: sc_ticket_reason === 'Reissue Credit Card'": {
                  "id": "ask_reissue_menu",
                  "type": "SAY-GET",
                  "variable": "sc_reissue_choice",
                  "value": "What is the reason you need a new card?\n1. Lost\n2. Damaged\n3. Lost in store\n4. Never received\n5. New card\n6. Stolen\n\nPlease {{cargo.verb}} the option number.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "¿Cuál es la razón por la que necesita una nueva tarjeta?\n1. Perdida\n2. Dañada\n3. Perdida en la tienda\n4. Nunca recibida\n5. Tarjeta nueva\n6. Robada\n\nPor favor {{cargo.verb_es}} el número de opción.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR.",
                  "digits": {
                     "min": 1,
                     "max": 1
                  }
               },
               "default": {
                  "id": "ask_acct_num_details",
                  "type": "SAY-GET",
                  "variable": "sc_extra_details",
                  "value": "Would you like to add any details to your request? {{cargo.verb}} SKIP if not.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "¿Desea agregar algún detalle a su solicitud? {{cargo.verb_es}} OMITIR si no.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
               }
            }
         },
         {
            "id": "handle_reissue_choice",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason !== 'Reissue Credit Card' || sc_reissue_reason": {
                  "id": "skip_reissue_mapping",
                  "type": "SET",
                  "variable": "sc_reissue_reason",
                  "value": "sc_reissue_reason"
               },
               "condition: matchesChoice(sc_reissue_choice.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_reissue",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_reissue_choice.trim())": {
                  "id": "exit_reissue",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "condition: /^3\\b|lost\\s*in\\s*store|perdid[oa]\\s*en\\s*la\\s*tienda/i.test(sc_reissue_choice.trim())": {
                  "id": "choice_lost_in_store",
                  "type": "SET",
                  "variable": "sc_reissue_reason",
                  "value": "'Lost-In-Store'"
               },
               "condition: /^6\\b|stolen|robad/i.test(sc_reissue_choice.trim())": {
                  "id": "choice_stolen",
                  "type": "SET",
                  "variable": "sc_reissue_reason",
                  "value": "'Stolen'"
               },
               "condition: /^2\\b|damaged|broken|da\\u00f1ad|danad|roto|rota/i.test(sc_reissue_choice.trim())": {
                  "id": "choice_damaged",
                  "type": "SET",
                  "variable": "sc_reissue_reason",
                  "value": "'Damaged'"
               },
               "condition: /^4\\b|never\\s*received|didn'?t\\s*receive|nunca.*recib|no.*recib/i.test(sc_reissue_choice.trim())": {
                  "id": "choice_never_received",
                  "type": "SET",
                  "variable": "sc_reissue_reason",
                  "value": "'Never Received'"
               },
               "condition: /^5\\b|new\\s*card|tarjeta\\s*nueva/i.test(sc_reissue_choice.trim())": {
                  "id": "choice_new_card",
                  "type": "SET",
                  "variable": "sc_reissue_reason",
                  "value": "'New Card'"
               },
               "condition: /^1\\b|\\blost\\b|perdid/i.test(sc_reissue_choice.trim())": {
                  "id": "choice_lost",
                  "type": "SET",
                  "variable": "sc_reissue_reason",
                  "value": "'Lost'"
               },
               "default": {
                  "id": "retry_reissue",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "I didn't understand your selection. Please try again.",
                     "error_message_es": "No entendí su selección. Por favor intente de nuevo.",
                     "retry_flow": "sc-credit-card",
                     "cancel_flow": "contact-support"
                  }
               }
            },
            "_branchOrder": [
               "condition: sc_ticket_reason !== 'Reissue Credit Card' || sc_reissue_reason",
               "condition: matchesChoice(sc_reissue_choice.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])",
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_reissue_choice.trim())",
               "condition: /^3\\b|lost\\s*in\\s*store|perdid[oa]\\s*en\\s*la\\s*tienda/i.test(sc_reissue_choice.trim())",
               "condition: /^6\\b|stolen|robad/i.test(sc_reissue_choice.trim())",
               "condition: /^2\\b|damaged|broken|da\\u00f1ad|danad|roto|rota/i.test(sc_reissue_choice.trim())",
               "condition: /^4\\b|never\\s*received|didn'?t\\s*receive|nunca.*recib|no.*recib/i.test(sc_reissue_choice.trim())",
               "condition: /^5\\b|new\\s*card|tarjeta\\s*nueva/i.test(sc_reissue_choice.trim())",
               "condition: /^1\\b|\\blost\\b|perdid/i.test(sc_reissue_choice.trim())",
               "default"
            ]
         },
         {
            "id": "check_cc_details_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_extra_details.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_cc_details",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_extra_details.trim())": {
                  "id": "exit_cc_details",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "clean_cc_skip",
                  "type": "SET",
                  "variable": "sc_extra_details",
                  "value": "/^(skip|omitir|no)$/i.test(sc_extra_details.trim()) ? '' : sc_extra_details"
               }
            }
         },
         {
            "id": "prep_submit_type",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason === 'Reissue Credit Card' && sc_reissue_reason": {
                  "id": "swap_to_reissue_type",
                  "type": "SET",
                  "variable": "sc_ticket_type",
                  "value": "'Reissue Credit Card'"
               },
               "default": {
                  "id": "keep_type",
                  "type": "SET",
                  "variable": "sc_ticket_type",
                  "value": "sc_ticket_type"
               }
            }
         },
         {
            "id": "prep_submit_reason",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_type === 'Reissue Credit Card' && sc_reissue_reason": {
                  "id": "swap_reason_to_sub",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "sc_reissue_reason"
               },
               "default": {
                  "id": "keep_reason",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "sc_ticket_reason"
               }
            }
         },
         {
            "id": "submit_cc",
            "type": "FLOW",
            "value": "sc-submit",
            "callType": "replace",
            "parameters": {
               "sc_ticket_type": "{{sc_ticket_type}}",
               "sc_ticket_reason": "{{sc_ticket_reason}}",
               "sc_extra_details": "{{sc_extra_details}}"
            }
         }
      ]
   },

   /* --- sc-fraud --- */
   {
      "id": "sc-fraud",
      "name": "SCFraud",
      "version": "1.0.0",
      "description": "Service case sub-flow for Fraud issues: Place Alert or Unauthorized Purchase",
      "parameters": [
         {
            "name": "ticket_reason",
            "type": "string",
            "description": "Pre-detected ticket reason from AI"
         }
      ],
      "variables": {
         "sc_fraud_choice": {
            "type": "string",
            "description": "User's fraud reason choice",
            "value": ""
         },
         "sc_ticket_type": {
            "type": "string",
            "description": "Ticket type",
            "value": "Fraud"
         },
         "sc_ticket_reason": {
            "type": "string",
            "description": "Ticket reason",
            "value": ""
         },
         "sc_extra_details": {
            "type": "string",
            "description": "Additional details",
            "value": ""
         },
         "sc_confirm_intent": {
            "type": "string",
            "description": "User confirmation that this is the right ticket type",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "confirm_intent",
            "type": "SAY-GET",
            "variable": "sc_confirm_intent",
            "value": "It sounds like you want to report a fraud issue. Should I go ahead? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to continue, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO if I misunderstood and you need help with something else.",
            "value_es": "Parece que desea reportar un problema de fraude. ¿Procedo? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ para continuar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO si entendí mal y necesita ayuda con otra cosa.",
            "digits": { "min": 1, "max": 1 }
         },
         {
            "id": "normalize_confirm_intent",
            "type": "SET",
            "variable": "sc_confirm_intent",
            "value": "sc_confirm_intent.trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "branch_confirm_intent",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_confirm_intent.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: ['yes', 'y', '1', 'sure', 'si', 'sí', 'ok', 'okay'].includes(sc_confirm_intent)": {
                  "id": "confirmed_proceed",
                  "type": "SET",
                  "variable": "noop_confirmed",
                  "value": "true"
               },
               "default": {
                  "id": "abort_no_intent_forward_to_ai",
                  "type": "RETURN",
                  "value": "''"
               }
            }
         },
         {
            "id": "check_predetected_reason",
            "type": "CASE",
            "branches": {
               "condition: typeof ticket_reason !== 'undefined' && /alert|alerta/i.test(ticket_reason)": {
                  "id": "set_alert",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Place Alert'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /unauthorized|no\\s*autoriz/i.test(ticket_reason)": {
                  "id": "set_unauthorized",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Unauthorized Purchase'"
               },
               "default": {
                  "id": "ask_fraud_reason",
                  "type": "SAY-GET",
                  "variable": "sc_fraud_choice",
                  "value": "What type of fraud issue would you like to report?\n1. Place Alert\n2. Unauthorized Purchase\n\nPlease {{cargo.verb}} the option number.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "¿Qué tipo de problema de fraude desea reportar?\n1. Colocar Alerta\n2. Compra No Autorizada\n\nPor favor {{cargo.verb_es}} el número de opción.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR.",
                  "digits": {
                     "min": 1,
                     "max": 1
                  }
               }
            }
         },
         {
            "id": "branch_fraud_reason",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason": {
                  "id": "reason_already_set",
                  "type": "SET",
                  "variable": "sc_fraud_proceed",
                  "value": "true"
               },
               "condition: /^(1|place|alert|alerta)/i.test(sc_fraud_choice.trim())": {
                  "id": "set_alert_from_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Place Alert'"
               },
               "condition: /^(2|unauthorized|no\\s*autoriz|compra)/i.test(sc_fraud_choice.trim())": {
                  "id": "set_unauthorized_from_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Unauthorized Purchase'"
               },
               "condition: matchesChoice(sc_fraud_choice.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_fraud",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_fraud_choice.trim())": {
                  "id": "exit_fraud",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "retry_fraud",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "I didn't understand your selection. Please try again.",
                     "error_message_es": "No entendí su selección. Por favor intente de nuevo.",
                     "retry_flow": "sc-fraud",
                     "cancel_flow": "contact-support"
                  }
               }
            }
         },
         {
            "id": "ask_fraud_details",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason === 'Place Alert'": {
                  "id": "ask_alert_details",
                  "type": "SAY-GET",
                  "variable": "sc_extra_details",
                  "value": "Please briefly describe the suspicious activity you've noticed.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "Por favor describa brevemente la actividad sospechosa que ha notado.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
               },
               "default": {
                  "id": "ask_unauth_details",
                  "type": "SAY-GET",
                  "variable": "sc_extra_details",
                  "value": "Please describe the unauthorized purchase, including the approximate amount, and date if known.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "Por favor describa la compra no autorizada, incluyendo el monto aproximado, y fecha si lo conoce.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
               }
            }
         },
         {
            "id": "check_fraud_details_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_extra_details.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_fraud_details",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_extra_details.trim())": {
                  "id": "exit_fraud_details",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "submit_fraud",
                  "type": "FLOW",
                  "value": "sc-submit",
                  "callType": "replace",
                  "parameters": {
                     "sc_ticket_type": "{{sc_ticket_type}}",
                     "sc_ticket_reason": "{{sc_ticket_reason}}",
                     "sc_extra_details": "{{sc_extra_details}}"
                  }
               }
            }
         }
      ]
   },

   /* --- sc-credit --- */
   {
      "id": "sc-credit",
      "name": "SCCredit",
      "version": "1.0.0",
      "description": "Service case sub-flow for Credit issues: Credit Increase or Activate Account",
      "parameters": [
         {
            "name": "ticket_reason",
            "type": "string",
            "description": "Pre-detected ticket reason from AI"
         }
      ],
      "variables": {
         "sc_credit_choice": {
            "type": "string",
            "description": "User's credit reason choice",
            "value": ""
         },
         "sc_ticket_type": {
            "type": "string",
            "description": "Ticket type",
            "value": "Credit"
         },
         "sc_ticket_reason": {
            "type": "string",
            "description": "Ticket reason",
            "value": ""
         },
         "sc_extra_details": {
            "type": "string",
            "description": "Additional details",
            "value": ""
         },
         "sc_confirm_intent": {
            "type": "string",
            "description": "User confirmation that this is the right ticket type",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "confirm_intent",
            "type": "SAY-GET",
            "variable": "sc_confirm_intent",
            "value": "It sounds like you need help with credit — increase or activate. Should I go ahead? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to continue, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO if I misunderstood and you need help with something else.",
            "value_es": "Parece que necesita ayuda con crédito — aumentar o activar. ¿Procedo? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ para continuar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO si entendí mal y necesita ayuda con otra cosa.",
            "digits": { "min": 1, "max": 1 }
         },
         {
            "id": "normalize_confirm_intent",
            "type": "SET",
            "variable": "sc_confirm_intent",
            "value": "sc_confirm_intent.trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "branch_confirm_intent",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_confirm_intent.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: ['yes', 'y', '1', 'sure', 'si', 'sí', 'ok', 'okay'].includes(sc_confirm_intent)": {
                  "id": "confirmed_proceed",
                  "type": "SET",
                  "variable": "noop_confirmed",
                  "value": "true"
               },
               "default": {
                  "id": "abort_no_intent_forward_to_ai",
                  "type": "RETURN",
                  "value": "''"
               }
            }
         },
         {
            "id": "check_predetected_reason",
            "type": "CASE",
            "branches": {
               "condition: typeof ticket_reason !== 'undefined' && /increase|aumento|incremento/i.test(ticket_reason)": {
                  "id": "set_increase",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Credit Increase'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /activate|activar/i.test(ticket_reason)": {
                  "id": "set_activate",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Activate Account'"
               },
               "default": {
                  "id": "ask_credit_reason",
                  "type": "SAY-GET",
                  "variable": "sc_credit_choice",
                  "value": "What credit service do you need?\n1. Credit Increase\n2. Activate Account\n\nPlease {{cargo.verb}} the option number.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "¿Qué servicio de crédito necesita?\n1. Aumento de Crédito\n2. Activar Cuenta\n\nPor favor {{cargo.verb_es}} el número de opción.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR.",
                  "digits": {
                     "min": 1,
                     "max": 1
                  }
               }
            }
         },
         {
            "id": "branch_credit_reason",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason": {
                  "id": "reason_already_set",
                  "type": "SET",
                  "variable": "sc_credit_proceed",
                  "value": "true"
               },
               "condition: /^(1|increase|aumento|incremento)/i.test(sc_credit_choice.trim())": {
                  "id": "set_increase_from_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Credit Increase'"
               },
               "condition: /^(2|activate|activar)/i.test(sc_credit_choice.trim())": {
                  "id": "set_activate_from_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Activate Account'"
               },
               "condition: matchesChoice(sc_credit_choice.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_credit",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_credit_choice.trim())": {
                  "id": "exit_credit",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "retry_credit",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "I didn't understand your selection. Please try again.",
                     "error_message_es": "No entendí su selección. Por favor intente de nuevo.",
                     "retry_flow": "sc-credit",
                     "cancel_flow": "contact-support"
                  }
               }
            }
         },
         {
            "id": "ask_credit_details",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason === 'Credit Increase'": {
                  "id": "ask_increase_amount",
                  "type": "SAY-GET",
                  "variable": "sc_extra_details",
                  "value": "How much of a credit increase are you requesting?\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "¿Cuánto aumento de crédito está solicitando?\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
               },
               "default": {
                  "id": "ask_activate_details",
                  "type": "SAY-GET",
                  "variable": "sc_extra_details",
                  "value": "Please provide your account number so we can locate your account.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "Por favor proporcione su número de cuenta para poder localizar su cuenta.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
               }
            }
         },
         {
            "id": "check_credit_details_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_extra_details.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_credit_details",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_extra_details.trim())": {
                  "id": "exit_credit_details",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "submit_credit",
                  "type": "FLOW",
                  "value": "sc-submit",
                  "callType": "replace",
                  "parameters": {
                     "sc_ticket_type": "{{sc_ticket_type}}",
                     "sc_ticket_reason": "{{sc_ticket_reason}}",
                     "sc_extra_details": "{{sc_extra_details}}"
                  }
               }
            }
         }
      ]
   },

   /* --- sc-cancellation --- */
   {
      "id": "sc-cancellation",
      "name": "SCCancellation",
      "version": "1.0.0",
      "description": "Service case sub-flow for Cancellation requests. This flow is ONLY for cancelling the following services: Cricket, Delivery, Verizon, Curacao Credit Shield, or Curacao Club. This is NOT for cancelling a credit card or a Curacao account.",
      "parameters": [
         {
            "name": "ticket_reason",
            "type": "string",
            "description": "Pre-detected ticket reason from AI"
         }
      ],
      "variables": {
         "sc_cancel_choice": {
            "type": "string",
            "description": "User's cancellation choice",
            "value": ""
         },
         "sc_ticket_type": {
            "type": "string",
            "description": "Ticket type",
            "value": "Cancellation"
         },
         "sc_ticket_reason": {
            "type": "string",
            "description": "Ticket reason",
            "value": ""
         },
         "sc_extra_details": {
            "type": "string",
            "description": "Additional details",
            "value": ""
         },
         "sc_service_name": {
            "type": "string",
            "description": "Friendly name of the service being cancelled, for use in the reason prompt",
            "value": ""
         },
         "sc_confirm_intent": {
            "type": "string",
            "description": "User confirmation that this is the right ticket type",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "set_confirm_service_name",
            "type": "SET",
            "variable": "sc_service_name",
            "value": "(function() { var r = typeof ticket_reason !== 'undefined' && ticket_reason ? ticket_reason : ''; var map = [ { re: /cricket/i, en: 'Cricket', es: 'Cricket' }, { re: /delivery|entrega/i, en: 'your delivery', es: 'la entrega' }, { re: /verizon/i, en: 'Verizon', es: 'Verizon' }, { re: /shield|protec/i, en: 'Credit Shield', es: 'Credit Shield' }, { re: /club/i, en: 'Curacao Club', es: 'Curacao Club' } ]; for (var i = 0; i < map.length; i++) { if (map[i].re.test(r)) { return language === 'es' ? map[i].es : map[i].en; } } return language === 'es' ? 'un servicio' : 'a service'; })()"
         },
         {
            "id": "confirm_intent",
            "type": "SAY-GET",
            "variable": "sc_confirm_intent",
            "value": "It sounds like you want to cancel {{sc_service_name}}. Should I go ahead? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to continue, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO if I misunderstood and you need help with something else.",
            "value_es": "Parece que desea cancelar {{sc_service_name}}. ¿Procedo? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ para continuar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO si entendí mal y necesita ayuda con otra cosa.",
            "digits": { "min": 1, "max": 1 }
         },
         {
            "id": "normalize_confirm_intent",
            "type": "SET",
            "variable": "sc_confirm_intent",
            "value": "sc_confirm_intent.trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "branch_confirm_intent",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_confirm_intent.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: ['yes', 'y', '1', 'sure', 'si', 'sí', 'ok', 'okay'].includes(sc_confirm_intent)": {
                  "id": "confirmed_proceed",
                  "type": "SET",
                  "variable": "noop_confirmed",
                  "value": "true"
               },
               "default": {
                  "id": "abort_no_intent_forward_to_ai",
                  "type": "RETURN",
                  "value": "''"
               }
            }
         },
         {
            "id": "check_predetected_reason",
            "type": "CASE",
            "branches": {
               "condition: typeof ticket_reason !== 'undefined' && /cricket/i.test(ticket_reason)": {
                  "id": "set_cricket",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Cancel Cricket'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /delivery|entrega/i.test(ticket_reason)": {
                  "id": "set_delivery",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Cancel Delivery'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /verizon/i.test(ticket_reason)": {
                  "id": "set_verizon",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Cancel Verizon'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /shield|protec/i.test(ticket_reason)": {
                  "id": "set_shield",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Credit Shield'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /club/i.test(ticket_reason)": {
                  "id": "set_club",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Curacao club Cancelation'"
               },
               "default": {
                  "id": "ask_cancel_reason",
                  "type": "SAY-GET",
                  "variable": "sc_cancel_choice",
                  "value": "What would you like to cancel?\n1. Cricket\n2. Delivery\n3. Verizon\n4. Credit Shield\n5. Curacao Club\n\nPlease {{cargo.verb}} the option number.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "¿Qué desea cancelar?\n1. Cricket\n2. Entrega\n3. Verizon\n4. Credit Shield\n5. Curacao Club\n\nPor favor {{cargo.verb_es}} el número de opción.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR.",
                  "digits": {
                     "min": 1,
                     "max": 1
                  }
               }
            }
         },
         {
            "id": "branch_cancel_reason",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason": {
                  "id": "reason_already_set",
                  "type": "SET",
                  "variable": "sc_cancel_proceed",
                  "value": "true"
               },
               "condition: /^(1|cricket)/i.test(sc_cancel_choice.trim())": {
                  "id": "set_cricket_from_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Cancel Cricket'"
               },
               "condition: /^(2|delivery|entrega)/i.test(sc_cancel_choice.trim())": {
                  "id": "set_delivery_from_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Cancel Delivery'"
               },
               "condition: /^(3|verizon)/i.test(sc_cancel_choice.trim())": {
                  "id": "set_verizon_from_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Cancel Verizon'"
               },
               "condition: /^(4|shield|credit\\s*shield)/i.test(sc_cancel_choice.trim())": {
                  "id": "set_shield_from_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Credit Shield'"
               },
               "condition: /^(5|club|curacao\\s*club)/i.test(sc_cancel_choice.trim())": {
                  "id": "set_club_from_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Curacao club Cancelation'"
               },
               "condition: matchesChoice(sc_cancel_choice.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_cancel",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_cancel_choice.trim())": {
                  "id": "exit_cancel",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "retry_cancel",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "I didn't understand your selection. Please try again.",
                     "error_message_es": "No entendí su selección. Por favor intente de nuevo.",
                     "retry_flow": "sc-cancellation",
                     "cancel_flow": "contact-support"
                  }
               }
            }
         },
         {
            "id": "set_cancel_service_name",
            "type": "SET",
            "variable": "sc_service_name",
            "value": "({ 'Cancel Cricket': { en: 'Cricket', es: 'Cricket' }, 'Cancel Delivery': { en: 'delivery', es: 'la entrega' }, 'Cancel Verizon': { en: 'Verizon', es: 'Verizon' }, 'Credit Shield': { en: 'Credit Shield', es: 'Credit Shield' }, 'Curacao club Cancelation': { en: 'Curacao Club', es: 'Curacao Club' } }[sc_ticket_reason] || { en: 'this service', es: 'este servicio' })[language === 'es' ? 'es' : 'en']"
         },
         {
            "id": "ask_cancel_details",
            "type": "SAY-GET",
            "variable": "sc_extra_details",
            "value": "Can you share the reason for cancelling {{sc_service_name}}?\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
            "value_es": "¿Puede compartir la razón de su cancelación de {{sc_service_name}}?\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
         },
         {
            "id": "check_cancel_details_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_extra_details.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_cancel_details",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_extra_details.trim())": {
                  "id": "exit_cancel_details",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "submit_cancel",
                  "type": "FLOW",
                  "value": "sc-submit",
                  "callType": "replace",
                  "parameters": {
                     "sc_ticket_type": "{{sc_ticket_type}}",
                     "sc_ticket_reason": "{{sc_ticket_reason}}",
                     "sc_extra_details": "{{sc_extra_details}}"
                  }
               }
            }
         }
      ]
   },

   /* --- sc-store-callback --- */
   {
      "id": "sc-store-callback",
      "name": "SCStoreCallback",
      "version": "1.0.0",
      "description": "Service case sub-flow for Store Call Back requests - select from 14 store locations",
      "parameters": [
         {
            "name": "ticket_reason",
            "type": "string",
            "description": "Pre-detected store location from AI"
         }
      ],
      "variables": {
         "sc_store_choice": {
            "type": "string",
            "description": "User's store selection",
            "value": ""
         },
         "sc_ticket_type": {
            "type": "string",
            "description": "Ticket type",
            "value": "Store Call Back"
         },
         "sc_ticket_reason": {
            "type": "string",
            "description": "Store location name",
            "value": ""
         },
         "sc_extra_details": {
            "type": "string",
            "description": "Additional details",
            "value": ""
         },
         "sc_confirm_intent": {
            "type": "string",
            "description": "User confirmation that this is the right ticket type",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "confirm_intent",
            "type": "SAY-GET",
            "variable": "sc_confirm_intent",
            "value": "It sounds like you want a callback from a store. Should I go ahead? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to continue, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO if I misunderstood and you need help with something else.",
            "value_es": "Parece que desea una devolución de llamada de una tienda. ¿Procedo? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ para continuar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO si entendí mal y necesita ayuda con otra cosa.",
            "digits": { "min": 1, "max": 1 }
         },
         {
            "id": "normalize_confirm_intent",
            "type": "SET",
            "variable": "sc_confirm_intent",
            "value": "sc_confirm_intent.trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "branch_confirm_intent",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_confirm_intent.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: ['yes', 'y', '1', 'sure', 'si', 'sí', 'ok', 'okay'].includes(sc_confirm_intent)": {
                  "id": "confirmed_proceed",
                  "type": "SET",
                  "variable": "noop_confirmed",
                  "value": "true"
               },
               "default": {
                  "id": "abort_no_intent_forward_to_ai",
                  "type": "RETURN",
                  "value": "''"
               }
            }
         },
         {
            "id": "check_predetected_store",
            "type": "CASE",
            "branches": {
               "condition: typeof ticket_reason !== 'undefined' && /anaheim/i.test(ticket_reason)": {
                  "id": "set_anaheim",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Anaheim'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /chino/i.test(ticket_reason)": {
                  "id": "set_chino",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Chino'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /chula/i.test(ticket_reason)": {
                  "id": "set_chula",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Chula Vista'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /huntington/i.test(ticket_reason)": {
                  "id": "set_hp",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Huntington Park'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /las\\s*vegas/i.test(ticket_reason)": {
                  "id": "set_lv",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Las Vegas'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /los\\s*angeles/i.test(ticket_reason)": {
                  "id": "set_la",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Los Angeles'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /lynwood/i.test(ticket_reason)": {
                  "id": "set_lynwood",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Lynwood'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /northridge/i.test(ticket_reason)": {
                  "id": "set_northridge",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Northridge'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /panorama/i.test(ticket_reason)": {
                  "id": "set_panorama",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Panorama City'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /phoenix/i.test(ticket_reason)": {
                  "id": "set_phoenix",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Phoenix'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /san\\s*bernardino/i.test(ticket_reason)": {
                  "id": "set_sb",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'San Bernardino'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /santa\\s*ana/i.test(ticket_reason)": {
                  "id": "set_sa",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Santa Ana'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /south\\s*gate/i.test(ticket_reason)": {
                  "id": "set_sg",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'South Gate'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /tucson/i.test(ticket_reason)": {
                  "id": "set_tucson",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Tucson'"
               },
               "default": {
                  "id": "ask_store",
                  "type": "SAY-GET",
                  "variable": "sc_store_choice",
                  "value": "Which store location would you like a call back from?\n1. Anaheim\n2. Chino\n3. Chula Vista\n4. Huntington Park\n5. Las Vegas\n6. Los Angeles\n7. Lynwood\n8. Northridge\n9. Panorama City\n10. Phoenix\n11. San Bernardino\n12. Santa Ana\n13. South Gate\n14. Tucson\n\nPlease {{cargo.verb}} the option number or the store name.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.{{cargo.voice ? ' When entering on the keypad, press the pound key when you are done.' : ''}}",
                  "value_es": "¿De qué tienda le gustaría recibir una llamada?\n1. Anaheim\n2. Chino\n3. Chula Vista\n4. Huntington Park\n5. Las Vegas\n6. Los Angeles\n7. Lynwood\n8. Northridge\n9. Panorama City\n10. Phoenix\n11. San Bernardino\n12. Santa Ana\n13. South Gate\n14. Tucson\n\nPor favor {{cargo.verb_es}} el número de opción o el nombre de la tienda.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR.{{cargo.voice ? ' Al ingresar con el teclado, presione la tecla numeral cuando termine.' : ''}}",
                  "digits": {
                     "min": 1,
                     "max": 2,
                     "autoSubmitMs": 2500
                  }
               }
            }
         },
         {
            "id": "branch_store",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason": {
                  "id": "store_already_set",
                  "type": "SET",
                  "variable": "sc_store_proceed",
                  "value": "true"
               },
               "condition: /^(1|anaheim)/i.test(sc_store_choice.trim())": {
                  "id": "set_anaheim_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Anaheim'"
               },
               "condition: /^(2|chino)/i.test(sc_store_choice.trim())": {
                  "id": "set_chino_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Chino'"
               },
               "condition: /^(3|chula)/i.test(sc_store_choice.trim())": {
                  "id": "set_chula_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Chula Vista'"
               },
               "condition: /^(4|huntington)/i.test(sc_store_choice.trim())": {
                  "id": "set_hp_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Huntington Park'"
               },
               "condition: /^(5|las\\s*vegas|vegas)/i.test(sc_store_choice.trim())": {
                  "id": "set_lv_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Las Vegas'"
               },
               "condition: /^(6|los\\s*angeles)/i.test(sc_store_choice.trim())": {
                  "id": "set_la_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Los Angeles'"
               },
               "condition: /^(7|lynwood)/i.test(sc_store_choice.trim())": {
                  "id": "set_lynwood_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Lynwood'"
               },
               "condition: /^(8|northridge)/i.test(sc_store_choice.trim())": {
                  "id": "set_northridge_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Northridge'"
               },
               "condition: /^(9|panorama)/i.test(sc_store_choice.trim())": {
                  "id": "set_panorama_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Panorama City'"
               },
               "condition: /^(10|phoenix)/i.test(sc_store_choice.trim())": {
                  "id": "set_phoenix_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Phoenix'"
               },
               "condition: /^(11|san\\s*bernardino)/i.test(sc_store_choice.trim())": {
                  "id": "set_sb_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'San Bernardino'"
               },
               "condition: /^(12|santa\\s*ana)/i.test(sc_store_choice.trim())": {
                  "id": "set_sa_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Santa Ana'"
               },
               "condition: /^(13|south\\s*gate)/i.test(sc_store_choice.trim())": {
                  "id": "set_sg_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'South Gate'"
               },
               "condition: /^(14|tucson)/i.test(sc_store_choice.trim())": {
                  "id": "set_tucson_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Tucson'"
               },
               "condition: matchesChoice(sc_store_choice.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_store",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_store_choice.trim())": {
                  "id": "exit_store",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "retry_store",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "I didn't recognize that store location. Please try again.",
                     "error_message_es": "No reconocí esa ubicación de tienda. Por favor intente de nuevo.",
                     "retry_flow": "sc-store-callback",
                     "cancel_flow": "contact-support"
                  }
               }
            }
         },
         {
            "id": "ask_store_details",
            "type": "SAY-GET",
            "variable": "sc_extra_details",
            "value": "What do you need assistance with? Please briefly describe your request.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
            "value_es": "¿Con qué necesita ayuda? Por favor describa brevemente su solicitud.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
         },
         {
            "id": "check_store_details_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_extra_details.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_store_details",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_extra_details.trim())": {
                  "id": "exit_store_details",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "submit_store",
                  "type": "FLOW",
                  "value": "sc-submit",
                  "callType": "replace",
                  "parameters": {
                     "sc_ticket_type": "{{sc_ticket_type}}",
                     "sc_ticket_reason": "{{sc_ticket_reason}}",
                     "sc_extra_details": "{{sc_extra_details}}"
                  }
               }
            }
         }
      ]
   },

   /* --- sc-account-issue --- */
   {
      "id": "sc-account-issue",
      "name": "SCAccountIssue",
      "version": "1.0.0",
      "description": "Service case sub-flow for Account Issue: Change of Address, Missing Payment, or Refund. Auth is handled before this flow is entered. NOT for account balance, available credit, payment-due, or account-number inquiries; if such a request reaches this menu it is rerouted back to the general AI intent layer rather than looping.",
      "parameters": [
         {
            "name": "ticket_reason",
            "type": "string",
            "description": "Pre-detected ticket reason from AI"
         }
      ],
      "variables": {
         "sc_acct_choice": {
            "type": "string",
            "description": "User's account issue choice",
            "value": ""
         },
         "sc_ticket_type": {
            "type": "string",
            "description": "Ticket type",
            "value": "Account Issue"
         },
         "sc_ticket_reason": {
            "type": "string",
            "description": "Ticket reason",
            "value": ""
         },
         "sc_extra_details": {
            "type": "string",
            "description": "Additional details from collection sub-flows",
            "value": ""
         },
         "sc_authenticated_phone": {
            "type": "string",
            "description": "Authenticated phone number",
            "value": ""
         },
         "sc_authenticated_email": {
            "type": "string",
            "description": "Authenticated email address",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "set_auth_phone",
            "type": "SET",
            "variable": "sc_authenticated_phone",
            "value": "(typeof cargo.otp_cell_number !== 'undefined' && cargo.otp_cell_number) ? cargo.otp_cell_number : ''"
         },
         {
            "id": "set_auth_email",
            "type": "SET",
            "variable": "sc_authenticated_email",
            "value": "(typeof cargo.otp_email !== 'undefined' && cargo.otp_email) ? cargo.otp_email : ''"
         },
         {
            "id": "check_predetected_reason",
            "type": "CASE",
            "branches": {
               "condition: typeof ticket_reason !== 'undefined' && /address|dirección|direccion/i.test(ticket_reason)": {
                  "id": "set_address",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Change of address'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /missing|faltante|payment/i.test(ticket_reason)": {
                  "id": "set_missing",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Missing Payment'"
               },
               "condition: typeof ticket_reason !== 'undefined' && /refund|reembolso/i.test(ticket_reason)": {
                  "id": "set_refund",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Refund'"
               },
               "default": {
                  "id": "ask_acct_reason",
                  "type": "SAY-GET",
                  "variable": "sc_acct_choice",
                  "value": "What account issue do you need help with?\n1. Change of Address\n2. Missing Payment\n3. Refund\n\nPlease {{cargo.verb}} the option number.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "¿Con qué problema de cuenta necesita ayuda?\n1. Cambio de Dirección\n2. Pago Faltante\n3. Reembolso\n\nPor favor {{cargo.verb_es}} el número de opción.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR.",
                  "digits": {
                     "min": 1,
                     "max": 1
                  }
               }
            }
         },
         {
            "id": "branch_acct_reason",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason": {
                  "id": "reason_already_set",
                  "type": "SET",
                  "variable": "sc_acct_proceed",
                  "value": "true"
               },
               "condition: /^(1|address|dirección|direccion|cambio)/i.test(sc_acct_choice.trim())": {
                  "id": "set_address_from_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Change of address'"
               },
               "condition: /^(2|missing|faltante|pago)/i.test(sc_acct_choice.trim())": {
                  "id": "set_missing_from_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Missing Payment'"
               },
               "condition: /^(3|refund|reembolso)/i.test(sc_acct_choice.trim())": {
                  "id": "set_refund_from_menu",
                  "type": "SET",
                  "variable": "sc_ticket_reason",
                  "value": "'Refund'"
               },
               "condition: matchesChoice(sc_acct_choice.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_acct",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_acct_choice.trim())": {
                  "id": "exit_acct",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "condition: /balance|saldo|available\\s*credit|cr[ée]dito\\s*disponible|how\\s*much\\s*do\\s*i\\s*owe|cu[áa]nto\\s*debo|payment\\s*due|pago\\s*pendiente/i.test(sc_acct_choice)": {
                  "id": "reroute_account_info_inquiry",
                  "type": "RETURN",
                  "value": "''"
               },
               "default": {
                  "id": "retry_acct",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "I didn't understand your selection. Please try again.",
                     "error_message_es": "No entendí su selección. Por favor intente de nuevo.",
                     "retry_flow": "sc-account-issue",
                     "cancel_flow": "contact-support"
                  }
               }
            }
         },
         {
            "id": "collect_after_menu",
            "type": "CASE",
            "branches": {
               "condition: sc_ticket_reason === 'Change of address'": {
                  "id": "collect_address_after_menu",
                  "type": "FLOW",
                  "value": "sc-collect-address",
                  "callType": "reboot",
                  "parameters": {
                     "sc_authenticated_phone": "{{sc_authenticated_phone}}",
                     "sc_authenticated_email": "{{sc_authenticated_email}}"
                  }
               },
               "condition: sc_ticket_reason === 'Missing Payment'": {
                  "id": "collect_mp_after_menu",
                  "type": "FLOW",
                  "value": "sc-collect-missing-payment",
                  "callType": "reboot",
                  "parameters": {
                     "sc_authenticated_phone": "{{sc_authenticated_phone}}",
                     "sc_authenticated_email": "{{sc_authenticated_email}}"
                  }
               },
               "condition: sc_ticket_reason === 'Refund'": {
                  "id": "collect_rf_after_menu",
                  "type": "FLOW",
                  "value": "sc-collect-refund",
                  "callType": "reboot",
                  "parameters": {
                     "sc_authenticated_phone": "{{sc_authenticated_phone}}",
                     "sc_authenticated_email": "{{sc_authenticated_email}}"
                  }
               },
               "default": {
                  "id": "no_collection_needed",
                  "type": "SET",
                  "variable": "sc_acct_proceed",
                  "value": "true"
               }
            }
         },
         {
            "id": "submit_acct",
            "type": "FLOW",
            "value": "sc-submit",
            "callType": "replace",
            "parameters": {
               "sc_ticket_type": "{{sc_ticket_type}}",
               "sc_ticket_reason": "{{sc_ticket_reason}}",
               "sc_extra_details": "{{sc_extra_details}}",
               "sc_authenticated_phone": "{{sc_authenticated_phone}}",
               "sc_authenticated_email": "{{sc_authenticated_email}}"
            }
         }
      ]
   },

   /* --- sc-auth-and-route-account --- */
   {
      "id": "sc-auth-and-route-account",
      "name": "SCAuthAndRouteAccount",
      "version": "1.0.0",
      "description": "Authentication wrapper for Account Issue: verifies identity via OTP before routing to sc-account-issue",
      "parameters": [
         {
            "name": "ticket_reason",
            "type": "string",
            "description": "Pre-detected ticket reason to pass through to sc-account-issue"
         }
      ],
      "variables": {
         "sc_confirm_intent": {
            "type": "string",
            "description": "User confirmation that this is the right ticket type",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "confirm_intent",
            "type": "CASE",
            "branches": {
               "condition: typeof ticket_reason !== 'undefined' && /address|dirección|direccion/i.test(ticket_reason)": {
                  "id": "confirm_address",
                  "type": "SAY-GET",
                  "variable": "sc_confirm_intent",
                  "value": "It sounds like you want to update the address on your account. Should I go ahead? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to continue, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO if I misunderstood and you need help with something else.",
                  "value_es": "Parece que desea actualizar la dirección de su cuenta. ¿Procedo? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ para continuar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO si entendí mal y necesita ayuda con otra cosa.",
                  "digits": { "min": 1, "max": 1 }
               },
               "condition: typeof ticket_reason !== 'undefined' && /missing|faltante|payment|pago/i.test(ticket_reason)": {
                  "id": "confirm_missing_payment",
                  "type": "SAY-GET",
                  "variable": "sc_confirm_intent",
                  "value": "It sounds like you want to look into a missing payment. Should I go ahead? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to continue, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO if I misunderstood and you need help with something else.",
                  "value_es": "Parece que desea investigar un pago faltante. ¿Procedo? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ para continuar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO si entendí mal y necesita ayuda con otra cosa.",
                  "digits": { "min": 1, "max": 1 }
               },
               "condition: typeof ticket_reason !== 'undefined' && /refund|reembolso/i.test(ticket_reason)": {
                  "id": "confirm_refund",
                  "type": "SAY-GET",
                  "variable": "sc_confirm_intent",
                  "value": "It sounds like you want to request a refund. Should I go ahead? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to continue, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO if I misunderstood and you need help with something else.",
                  "value_es": "Parece que desea solicitar un reembolso. ¿Procedo? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ para continuar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO si entendí mal y necesita ayuda con otra cosa.",
                  "digits": { "min": 1, "max": 1 }
               },
               "default": {
                  "id": "confirm_account_issue_generic",
                  "type": "SAY-GET",
                  "variable": "sc_confirm_intent",
                  "value": "It sounds like you have an account issue you need help with. Should I go ahead? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to continue, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO if I misunderstood and you need help with something else.",
                  "value_es": "Parece que tiene un problema de cuenta con el que necesita ayuda. ¿Procedo? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ para continuar, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO si entendí mal y necesita ayuda con otra cosa.",
                  "digits": { "min": 1, "max": 1 }
               }
            }
         },
         {
            "id": "normalize_confirm_intent",
            "type": "SET",
            "variable": "sc_confirm_intent",
            "value": "sc_confirm_intent.trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "branch_confirm_intent",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sc_confirm_intent.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: ['yes', 'y', '1', 'sure', 'si', 'sí', 'ok', 'okay'].includes(sc_confirm_intent)": {
                  "id": "confirmed_proceed",
                  "type": "SET",
                  "variable": "noop_confirmed",
                  "value": "true"
               },
               "default": {
                  "id": "abort_no_intent_forward_to_ai",
                  "type": "RETURN",
                  "value": "''"
               }
            }
         },
         {
            "id": "check_already_auth",
            "type": "CASE",
            "branches": {
               "condition: cargo.otpVerified": {
                  "id": "already_verified",
                  "type": "SET",
                  "variable": "sc_auth_skip",
                  "value": "true"
               },
               "default": {
                  "id": "say_need_auth",
                  "type": "SAY",
                  "value": "For your security, I need to verify your identity — I'll send a one-time code to the phone number or email on your account.",
                  "value_es": "Por su seguridad, necesito verificar su identidad — le enviaré un código único al número de teléfono o correo electrónico registrado en su cuenta."
               }
            }
         },
         {
            "id": "run_auth",
            "type": "CASE",
            "branches": {
               "condition: cargo.otpVerified": {
                  "id": "skip_auth",
                  "type": "SET",
                  "variable": "sc_auth_skip",
                  "value": "true"
               },
               "default": {
                  "id": "call_auth",
                  "type": "FLOW",
                  "value": "authenticate-user",
                  "callType": "call",
                  "parameters": {
                     "retry_flow": "create-service-case",
                     "cancel_flow": "contact-support",
                     "email_validator": "validate-email-has-account"
                  }
               }
            }
         },
         {
            "id": "verify_auth_succeeded",
            "type": "CASE",
            "branches": {
               "condition: cargo.otpVerified": {
                  "id": "route_to_account_lookup",
                  "type": "FLOW",
                  "value": "sc-account-lookup",
                  "callType": "reboot",
                  "parameters": {
                     "ticket_reason": "{{ticket_reason}}"
                  }
               },
               "default": {
                  "id": "auth_failed",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "We were unable to verify your identity. Please try again.",
                     "error_message_es": "No pudimos verificar su identidad. Por favor intente de nuevo.",
                     "retry_flow": "create-service-case",
                     "cancel_flow": "contact-support"
                  }
               }
            }
         }
      ]
   },

   /* --- sc-account-lookup --- */
   {
      "id": "sc-account-lookup",
      "name": "SCAccountLookup",
      "version": "1.0.0",
      "description": "Calls lookup-account after OTP auth to retrieve customer info (name, account number, address) for service case pre-population. Soft-fails silently so case creation is never blocked.",
      "parameters": [
         {
            "name": "ticket_reason",
            "type": "string",
            "description": "Pre-detected ticket reason to pass through to sc-account-issue"
         }
      ],
      "variables": {
         "sc_lookup_email": {
            "type": "string",
            "description": "Email from OTP verification",
            "value": ""
         },
         "sc_lookup_phone": {
            "type": "string",
            "description": "Phone from OTP verification",
            "value": ""
         },
         "sc_lookup_result": {
            "type": "object",
            "description": "Result from lookup-account tool",
            "value": null
         }
      },
      "steps": [
         {
            "id": "set_lookup_email",
            "type": "SET",
            "variable": "sc_lookup_email",
            "value": "cargo.otp_email || ''"
         },
         {
            "id": "set_lookup_phone",
            "type": "SET",
            "variable": "sc_lookup_phone",
            "value": "cargo.otp_cell_number || ''"
         },
         {
            "id": "perform_account_lookup",
            "type": "CALL-TOOL",
            "tool": "lookup-account",
            "variable": "sc_lookup_result",
            "args": {
               "email": "{{sc_lookup_email}}",
               "phone_number": "{{sc_lookup_phone}}"
            },
            "onFail": {
               "id": "lookup_soft_fail",
               "type": "SET",
               "variable": "sc_lookup_result",
               "value": "{ success: false }"
            }
         },
         {
            "id": "check_lookup_success",
            "type": "CASE",
            "branches": {
               "condition: sc_lookup_result && sc_lookup_result.success && sc_lookup_result.customer_info && sc_lookup_result.customer_info.cust_id": {
                  "id": "store_customer_info",
                  "type": "SET",
                  "variable": "sc_lookup_stored",
                  "value": "cargo.firstName = sc_lookup_result.customer_info.first_name, cargo.lastName = sc_lookup_result.customer_info.last_name, cargo.accountNumber = sc_lookup_result.customer_info.cust_id, cargo.sc_current_street = sc_lookup_result.customer_info.street || '', cargo.sc_current_city = sc_lookup_result.customer_info.city || '', cargo.sc_current_state = sc_lookup_result.customer_info.state || '', cargo.sc_current_zip = sc_lookup_result.customer_info.zip || '', cargo.sc_account_lookup_success = true"
               },
               "default": {
                  "id": "lookup_no_data",
                  "type": "SET",
                  "variable": "sc_lookup_skip",
                  "value": "cargo.sc_account_lookup_success = false"
               }
            }
         },
         {
            "id": "greet_if_name_found",
            "type": "CASE",
            "branches": {
               "condition: cargo.sc_account_lookup_success && cargo.firstName": {
                  "id": "greet_customer",
                  "type": "SAY",
                  "value": "Thank you, {{cargo.firstName}}! I found your account.",
                  "value_es": "¡Gracias, {{cargo.firstName}}! Encontré su cuenta."
               },
               "default": {
                  "id": "no_greet",
                  "type": "SET",
                  "variable": "sc_greet_skip",
                  "value": "true"
               }
            }
         },
         {
            "id": "route_to_account_issue",
            "type": "FLOW",
            "value": "sc-account-issue",
            "callType": "reboot",
            "parameters": {
               "ticket_reason": "{{ticket_reason}}"
            }
         }
      ]
   },

   /* --- create-service-case (PRIMARY ROUTER) --- */
   {
      "id": "create-service-case",
      "name": "CreateServiceCase",
      "version": "1.0.0",
      "description": "Primary router for creating service case (support ticket) in the CRM. Routes to the appropriate subflow based on ticket type. Ticket types and reasons: (1) Account Issue [REQUIRES AUTH] — Change of address, Missing Payment, Refund. Routes through sc-auth-and-route-account for OTP verification, then to sc-account-issue which delegates to sc-collect-address, sc-collect-missing-payment, or sc-collect-refund. (2) Curacao Credit Card. Routes to sc-credit-card. Do NOT route plain account-number lookups here — if the customer simply asks 'what is my account number' / 'cuál es mi número de cuenta', use the AccountNumber flow instead, which hands back to the general AI. (2b) Reissue Credit Card [REQUIRES AUTH] — Lost, Damaged, Lost-In-Store, Never Received, New Card, Stolen. Use this when the customer needs a new physical card ('I lost my card', 'my card was stolen', 'my card is broken/damaged', 'never received my card', 'I need a new card'). Routes to sc-credit-card, which performs OTP verification (phone or email) and an account lookup before collecting the reissue sub-reason — this ensures the customer's account number is attached to the case and prevents fraudulent card-reissue requests. The AI pre-detects the sub-reason from words like lost/stolen/damaged/broken/never received to skip the sub-reason menu prompt. (3) Fraud — Place Alert, Unauthorized Purchase. Routes to sc-fraud. (4) Credit — Credit Increase, Activate Account. Routes to sc-credit. (5) Cancellation — ONLY for cancelling these services: Cancel Cricket, Cancel Delivery, Cancel Verizon, Curacao Credit Shield, Curacao Club. This is NOT for cancelling a credit card or a Curacao account. When the customer wants the current card cancelled ONLY so a replacement can be sent ('cancel this card and send me a new one', 'cancel my card, I need a replacement'), use 'Reissue Credit Card' with reason 'New Card'. When the customer wants the card or the credit account CLOSED with no replacement ('close my credit account', 'I don't want the card anymore', 'ya no quiero la tarjeta'), or when a bare 'cancel my credit card' gives no indication that they want a new card, do NOT route here — use the CancelCreditCard flow, which hands back to the general AI. Routes to sc-cancellation. (6) Store Call Back — Anaheim, Chino, Chula Vista, Huntington Park, Las Vegas, Los Angeles, Lynwood, Northridge, Panorama City, Phoenix, San Bernardino, Santa Ana, South Gate, Tucson. Routes to sc-store-callback. All subflows submit via sc-submit, which collects customer name and contact info (phone/email) when not already available. The CRM uses phone or email to look up existing contacts — phone is the most reliable identifier. IMPORTANT: This flow should NEVER trigger for prompts like 'payment arrangement', 'returns', 'travel services', 'price match', login/portal issues, billing inquiries ('why was I charged', 'explain my bill'), account balance / available credit / payment due inquiries ('what's my balance', 'how much do I owe', 'cuánto debo', 'available credit' — these go to LocateAccount, NOT a service case), plain account-number lookups ('what is my account number', 'cuál es mi número de cuenta' — these go to the AccountNumber flow, NOT a service case), order/delivery/shipment status questions ('is my order arriving today', 'where is my delivery', 'when will it arrive'), callback follow-ups ('they were going to call me and never did', 'no one has called me back'), or anything else that is not explicitly listed in the ticket types and reasons. CRITICAL ROUTING RULES: 'Missing Payment' means the customer EXPLICITLY says they ALREADY MADE a payment and it is not showing on their account (e.g. 'I paid last week but it's not posted'). It does NOT mean: trouble making a payment, payment declined, payment won't go through, can't complete payment, any billing question, OR any other situation where the customer hasn't explicitly mentioned a payment they made. If the customer talks about an order, delivery, shipment, callback, or just wants to communicate/speak/talk with someone, do NOT pre-detect 'Missing Payment' — those are not missing payment scenarios. If a customer is having difficulty completing a payment, do NOT route here — provide troubleshooting guidance instead. If the customer explicitly contradicts the detected intent (e.g. 'that's not what I need', 'no it's not a missing payment', 'none of these'), STOP the current flow immediately, acknowledge the correction, and ask what they actually need help with. Never continue a flow the customer has rejected. Never use confirmation language ('noted', 'saved', 'your information has been recorded') unless the customer has been authenticated via OTP. If unauthenticated, clearly state that the information cannot be saved without verification. 'Price match' requests should be answered with price match policy information, not routed to a service case. 'Travel services' inquiries should be answered with travel information or transferred to an agent, not routed to missing payment or any service case. Also return None (the request-live-agent flow will handle it) if the customer asks for a live agent, customer service representative, 'customer service', 'servicio al cliente', or any escalation to a person — those are not requests to file a support ticket. Also return None if the customer is just informing about a future payment ('mañana paso a pagarles') without requesting action.",
      "prompt": "Sevice Case",
      "prompt_es": "Caso de servicio",
      "primary": true,
      "parameters": [
         {
            "name": "ticket_type",
            "type": "string",
            "description": "Pre-detected ticket type — MUST be one of these exact values based on user intent: 'Fraud' (when user mentions fraud, unauthorized purchase, suspicious activity, or fraud alert), 'Account Issue' (ONLY for change of address, missing payment, or refund — never for fraud. CRITICAL: 'Missing Payment' means the customer explicitly states they ALREADY MADE a payment that is not reflected on their account (e.g. 'I paid last week but it is not posted'). It does NOT apply to: trouble completing a payment, payment declined, payment errors, billing questions, charges the customer doesn't understand, requests to RECOVER, RESET, UPDATE, or CHANGE an account PIN, password, or login credential, or any request that merely contains the word 'payment' or 'account' without explicitly stating that a payment was made and is missing. The word 'PIN' or 'pin' in the customer query is a STRONG SIGNAL that this is NOT a Missing Payment request — do not pre-detect Account Issue in that case), 'Curacao Credit Card' (ONLY for Curacao store account number lookup — NOT social security number, SSN, or government IDs), 'Reissue Credit Card' (customer needs a new physical Curacao credit card — lost, damaged/broken, stolen, never received, lost in store, or simply wants a new card), 'Credit' (credit increase, activate account), 'Cancellation' (ONLY for cancelling Cricket, Delivery, Verizon, Curacao Credit Shield, or Curacao Club — NOT for cancelling a credit card or Curacao account; use 'Reissue Credit Card' with reason 'New Card' only when the customer wants a replacement card, and do NOT pre-detect any ticket type when the customer wants the card or credit account closed with no replacement or the cancellation request is bare and ambiguous — those belong to the CancelCreditCard flow), 'Store Call Back' (request callback from store). If the customer's intent does not clearly match one of these types, do NOT pre-detect — leave empty and let the menu be shown. When in doubt, show the menu."
         },
         {
            "name": "ticket_reason",
            "type": "string",
            "description": "Pre-detected ticket reason. For Account Issue: 'Change of address', 'Missing Payment', or 'Refund'. CRITICAL: Only pre-detect 'Missing Payment' when the customer explicitly says they ALREADY MADE a payment and it is not showing on their account (e.g. 'I paid last week but it's not showing', 'my payment from Tuesday hasn't posted'). The customer MUST reference a payment they have already submitted — past tense, specific, and unambiguous. NEVER pre-detect 'Missing Payment' for: trouble making a payment, payment won't go through, billing questions, charges they don't understand, requests to RECOVER, RESET, UPDATE, or CHANGE an account PIN, password, or login credential, or any other scenario. If the customer query contains the word 'PIN' or 'pin', it is NOT a Missing Payment request — leave ticket_reason empty. When in doubt, leave empty and let the menu disambiguate. For Curacao Credit Card: 'Account Number' (Curacao store account number ONLY — never for SSN, social security number, tax ID, or government ID). For Reissue Credit Card: 'Lost', 'Damaged', 'Lost-In-Store', 'Never Received', or 'Stolen' — pre-detect ONLY when the customer explicitly states one of these causes (e.g. 'I lost my card', 'my card is broken', 'it was stolen', 'never received my card', 'lost it in your store'). NEVER pre-detect 'New Card' — it is a menu-only catch-all for customers who just say 'I need a new card' / 'I want a replacement' / 'send me a new one' without naming a cause; in those cases leave ticket_reason empty so the sub-reason menu is shown. For Fraud: 'Place Alert' or 'Unauthorized Purchase'. For Credit: 'Credit Increase' or 'Activate Account'. For Cancellation: 'Cancel Cricket', 'Cancel Delivery', 'Cancel Verizon', 'Credit Shield', or 'Curacao club Cancelation' — ONLY pre-detect a reason if the user explicitly names one of these services; if the request is vague (e.g. 'cancel a service', 'cancel something'), leave ticket_reason empty so the user is shown the menu. For Store Call Back: store name (e.g. 'Anaheim', 'Los Angeles', 'Phoenix'). GENERAL RULE: If the customer's intent is ambiguous or does not clearly match a reason, leave ticket_reason empty to let the user choose from the menu."
         },
         {
            "name": "ticket_detail",
            "type": "string",
            "description": "Additional detail extracted from the user's initial message. For Reissue Credit Card: the cause of needing a new card (e.g. 'lost', 'stolen', 'damaged', 'broken', 'never received', 'lost in store'). This is used to auto-map to the correct ticket_reason and skip the menu prompt. Do NOT put generic phrasings like 'new card' or 'replacement' here — those are not causes and should leave the menu to disambiguate. For other ticket types, leave empty."
         }
      ],
      "variables": {
         "sc_type_choice": {
            "type": "string",
            "description": "User's ticket type selection",
            "value": ""
         },
         "sc_no_match": {
            "type": "boolean",
            "description": "Flag set to true when user input matched none of the menu options",
            "value": false
         }
      },
      "steps": [
         {
            "id": "set_support_context",
            "type": "SET",
            "variable": "support_context_side_effect",
            "value": "cargo.support_context = 'service case', cargo.support_context_es = 'caso de servicio'"
         },
         {
            "id": "route_predetected",
            "type": "CASE",
            "branches": {
               "condition: typeof ticket_type !== 'undefined' && /account\\s*issue|problema.*cuenta/i.test(ticket_type)": {
                  "id": "predetect_account",
                  "type": "FLOW",
                  "value": "sc-auth-and-route-account",
                  "callType": "call",
                  "parameters": {
                     "ticket_reason": "{{ticket_reason}}"
                  }
               },
               "condition: typeof ticket_type !== 'undefined' && /credit\\s*card|tarjeta.*cr[eé]dito/i.test(ticket_type)": {
                  "id": "predetect_credit_card",
                  "type": "FLOW",
                  "value": "sc-credit-card",
                  "callType": "reboot",
                  "parameters": {
                     "ticket_reason": "{{ticket_reason}}",
                     "ticket_detail": "{{ticket_detail}}"
                  }
               },
               "condition: typeof ticket_type !== 'undefined' && /fraud|fraude/i.test(ticket_type)": {
                  "id": "predetect_fraud",
                  "type": "FLOW",
                  "value": "sc-fraud",
                  "callType": "reboot",
                  "parameters": {
                     "ticket_reason": "{{ticket_reason}}"
                  }
               },
               "condition: typeof ticket_type !== 'undefined' && /^credit$|^cr[eé]dito$/i.test(ticket_type.trim())": {
                  "id": "predetect_credit",
                  "type": "FLOW",
                  "value": "sc-credit",
                  "callType": "reboot",
                  "parameters": {
                     "ticket_reason": "{{ticket_reason}}"
                  }
               },
               "condition: typeof ticket_type !== 'undefined' && /cancell?ation|cancelaci[oó]n|cancel/i.test(ticket_type)": {
                  "id": "predetect_cancellation",
                  "type": "FLOW",
                  "value": "sc-cancellation",
                  "callType": "reboot",
                  "parameters": {
                     "ticket_reason": "{{ticket_reason}}"
                  }
               },
               "condition: typeof ticket_type !== 'undefined' && /store|tienda|call\\s*back|devoluci[oó]n/i.test(ticket_type)": {
                  "id": "predetect_store",
                  "type": "FLOW",
                  "value": "sc-store-callback",
                  "callType": "reboot",
                  "parameters": {
                     "ticket_reason": "{{ticket_reason}}"
                  }
               },
               "default": {
                  "id": "show_menu",
                  "type": "SET",
                  "variable": "sc_needs_menu",
                  "value": "true"
               }
            }
         },
         {
            "id": "ask_ticket_type",
            "type": "SAY-GET",
            "variable": "sc_type_choice",
            "value": "I can help you create a service case. What type of issue do you need help with?\n1. Account Issue (change of address, missing payment, refund)\n2. Credit Card (reissue card, account number)\n3. Fraud (place alert, unauthorized purchase)\n4. Credit (credit increase, activate account)\n5. Cancellation (cricket, delivery, verizon, credit shield, curacao club)\n6. Store Call Back\n{{cargo.agentPhoneNumber ? '0. Speak with customer service\\n' : ''}}\n{{cargo.voice ? 'Press the corresponding number on your keypad, or say ' : 'Type '}}the option number.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
            "value_es": "Puedo ayudarle a crear un caso de servicio. ¿Con qué tipo de problema necesita ayuda?\n1. Problema de Cuenta (cambio de dirección, pago faltante, reembolso)\n2. Tarjeta de Crédito (reemitir tarjeta, número de cuenta)\n3. Fraude (colocar alerta, compra no autorizada)\n4. Crédito (aumento de crédito, activar cuenta)\n5. Cancelación (cricket, entrega, verizon, credit shield, curacao club)\n6. Devolución de Llamada de Tienda\n{{cargo.agentPhoneNumber ? '0. Hablar con servicio al cliente\\n' : ''}}\n{{cargo.voice ? 'Presione el número correspondiente en su teclado, o diga ' : 'Escriba '}}el número de opción.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "branch_type_choice",
            "type": "CASE",
            "branches": {
               "condition: /^(1|account|cuenta)/i.test(sc_type_choice.trim())": {
                  "id": "route_account",
                  "type": "FLOW",
                  "value": "sc-auth-and-route-account",
                  "callType": "reboot"
               },
               "condition: /^(2|credit\\s*card|tarjeta)/i.test(sc_type_choice.trim())": {
                  "id": "route_credit_card",
                  "type": "FLOW",
                  "value": "sc-credit-card",
                  "callType": "reboot"
               },
               "condition: /^(3|fraud|fraude)/i.test(sc_type_choice.trim())": {
                  "id": "route_fraud",
                  "type": "FLOW",
                  "value": "sc-fraud",
                  "callType": "reboot"
               },
               "condition: /^(4|credit|crédito|credito)/i.test(sc_type_choice.trim())": {
                  "id": "route_credit",
                  "type": "FLOW",
                  "value": "sc-credit",
                  "callType": "reboot"
               },
               "condition: /^(5|cancel|cancelar|cancelaci)/i.test(sc_type_choice.trim())": {
                  "id": "route_cancellation",
                  "type": "FLOW",
                  "value": "sc-cancellation",
                  "callType": "reboot"
               },
               "condition: /^(6|store|tienda|call\\s*back)/i.test(sc_type_choice.trim())": {
                  "id": "route_store",
                  "type": "FLOW",
                  "value": "sc-store-callback",
                  "callType": "reboot"
               },
               "condition: /^(0|customer\\s*service|live\\s*agent|representative|representante|servicio\\s*al\\s*cliente|atenci[oó]n\\s*al\\s*cliente|hablar\\s*con|speak\\s*with\\s*a\\s*person|talk\\s*to\\s*a\\s*person|human|persona)/i.test(sc_type_choice.trim())": {
                  "id": "route_to_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(sc_type_choice.trim())": {
                  "id": "exit_menu",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "service request",
                     "support_context_es": "solicitud de servicio"
                  }
               },
               "default": {
                  "id": "mark_no_match",
                  "type": "SET",
                  "variable": "sc_no_match",
                  "value": "true"
               }
            }
         },
         {
            "id": "graceful_handoff_say",
            "type": "CASE",
            "branches": {
               "condition: sc_no_match === true || sc_no_match === 'true'": {
                  "id": "say_no_match_handoff",
                  "type": "SAY",
                  "value": "I didn't catch that. {{cargo.agentPhoneNumber ? 'Let me connect you with a customer service representative who can help.' : 'Let me share our contact information so we can still help you.'}}",
                  "value_es": "No entendí eso. {{cargo.agentPhoneNumber ? 'Permítame conectarlo con un representante de servicio al cliente que pueda ayudarle.' : 'Permítame compartirle nuestra información de contacto para que podamos ayudarle.'}}"
               },
               "default": {
                  "id": "noop_match_found",
                  "type": "SET",
                  "variable": "noop_matched",
                  "value": "true"
               }
            }
         },
         {
            "id": "graceful_handoff_flow",
            "type": "CASE",
            "branches": {
               "condition: sc_no_match === true || sc_no_match === 'true'": {
                  "id": "do_handoff_to_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "default": {
                  "id": "noop_no_handoff_needed",
                  "type": "SET",
                  "variable": "noop_no_handoff",
                  "value": "true"
               }
            }
         }
      ]
   },

   /* --- request-live-agent (PRIMARY) --- */
   {
      "id": "request-live-agent",
      "name": "RequestLiveAgent",
      "version": "1.0.0",
      "description": "Customer is asking to speak/talk/communicate with a live person — customer service representative, live agent, or human support. Use this flow when the customer's primary intent is to reach a human, including: explicit requests for an agent/representative/customer service, callback follow-ups ('they said they'd call me and never did', 'no one has called me'), and order/delivery/shipment status questions where there isn't a dedicated flow to handle them ('is my order arriving today', 'where is my delivery'). Also triggered by phrases like 'communicate with someone', 'I need to talk to someone', 'speak to a person', 'I need help from a human', 'comunicarme con alguien', 'hablar con una persona', 'hablar con alguien'. Do NOT trigger this flow for specific issue requests (account issue, fraud, credit card, etc.) — those are service case requests handled by create-service-case.",
      "prompt": "Live agent request",
      "prompt_es": "Solicitud de agente en vivo",
      "primary": true,
      "steps": [
         {
            "id": "route_to_live_agent",
            "type": "FLOW",
            "value": "live-agent-requested",
            "callType": "replace"
         }
      ]
   },

   /* --- myaccount-help (PRIMARY) --- */
   {
      "id": "myaccount-help",
      "name": "MyAccountHelp",
      "version": "1.0.0",
      "description": "Helps customers who are having trouble logging in to their MyAccount portal (myaccount.icuracao.com). This flow handles forgotten usernames, forgotten passwords, and general login issues. It authenticates the customer via OTP first, then sends them a direct link to recover their username or reset their password via SMS. This is NOT for account balance inquiries, payment issues, or service cases — only for MyAccount portal login problems.",
      "prompt": "MyAccount help",
      "prompt_es": "Ayuda de MiCuenta",
      "primary": true,
      "parameters": [
         {
            "name": "issue_type",
            "type": "string",
            "description": "Pre-detected issue: 'username' if user forgot/needs username, 'password' if user forgot/needs to reset password"
         }
      ],
      "variables": {
         "ma_choice": {
            "type": "string",
            "description": "User's selection: username or password",
            "value": ""
         },
         "ma_issue": {
            "type": "string",
            "description": "Resolved issue type: username or password",
            "value": ""
         },
         "sms_result": {
            "type": "object",
            "description": "Result from SMS send"
         }
      },
      "steps": [
         {
            "id": "set_support_context",
            "type": "SET",
            "variable": "support_context_side_effect",
            "value": "cargo.support_context = 'MyAccount login', cargo.support_context_es = 'inicio de sesión de MiCuenta'"
         },
         {
            "id": "check_predetected_issue",
            "type": "CASE",
            "branches": {
               "condition: typeof issue_type !== 'undefined' && /user/i.test(issue_type)": {
                  "id": "set_username",
                  "type": "SET",
                  "variable": "ma_issue",
                  "value": "'username'"
               },
               "condition: typeof issue_type !== 'undefined' && /pass/i.test(issue_type)": {
                  "id": "set_password",
                  "type": "SET",
                  "variable": "ma_issue",
                  "value": "'password'"
               },
               "default": {
                  "id": "ask_issue_type",
                  "type": "SAY-GET",
                  "variable": "ma_choice",
                  "value": "I can help you access your MyAccount portal. What do you need help with?\n1. Forgot Username\n2. Forgot Password\n\nPlease {{cargo.verb}} the option number.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "Puedo ayudarte a acceder a tu portal MiCuenta. ¿Con qué necesitas ayuda?\n1. Olvidé mi Usuario\n2. Olvidé mi Contraseña\n\nPor favor {{cargo.verb_es}} el número de opción.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR.",
                  "digits": {
                     "min": 1,
                     "max": 1
                  }
               }
            }
         },
         {
            "id": "resolve_issue_type",
            "type": "CASE",
            "branches": {
               "condition: ma_issue": {
                  "id": "issue_already_set",
                  "type": "SET",
                  "variable": "ma_proceed",
                  "value": "true"
               },
               "condition: /^(1|user|usuario)/i.test(ma_choice.trim())": {
                  "id": "set_username_from_menu",
                  "type": "SET",
                  "variable": "ma_issue",
                  "value": "'username'"
               },
               "condition: /^(2|pass|contra)/i.test(ma_choice.trim())": {
                  "id": "set_password_from_menu",
                  "type": "SET",
                  "variable": "ma_issue",
                  "value": "'password'"
               },
               "condition: matchesChoice(ma_choice.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_myaccount",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(ma_choice.trim())": {
                  "id": "exit_myaccount",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "account access",
                     "support_context_es": "acceso a su cuenta"
                  }
               },
               "default": {
                  "id": "retry_myaccount",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "I didn't understand your selection. Please try again.",
                     "error_message_es": "No entendí su selección. Por favor intente de nuevo.",
                     "retry_flow": "myaccount-help",
                     "cancel_flow": "contact-support"
                  }
               }
            }
         },
         {
            "id": "authenticate",
            "type": "FLOW",
            "value": "authenticate-user",
            "callType": "call",
            "parameters": {
               "retry_flow": "myaccount-help",
               "cancel_flow": "contact-support",
               "email_validator": "validate-email-has-account"
            }
         },
         {
            "id": "check_auth_result",
            "type": "CASE",
            "branches": {
               "condition: !cargo.otpVerified": {
                  "id": "auth_failed",
                  "type": "FLOW",
                  "value": "generic-retry-with-options",
                  "callType": "reboot",
                  "parameters": {
                     "error_message": "We were unable to verify your identity. Please try again.",
                     "error_message_es": "No pudimos verificar su identidad. Por favor intente de nuevo.",
                     "retry_flow": "myaccount-help",
                     "cancel_flow": "contact-support"
                  }
               },
               "default": {
                  "id": "auth_succeeded",
                  "type": "SET",
                  "variable": "ma_proceed_to_link",
                  "value": "true"
               }
            }
         },
         {
            "id": "send_recovery_link",
            "type": "CASE",
            "branches": {
               "condition: ma_issue === 'username' && cargo.callerId": {
                  "id": "send_username_link",
                  "type": "CALL-TOOL",
                  "tool": "send-twilio-sms",
                  "variable": "sms_result",
                  "args": {
                     "accountSid": "...",
                     "from": "{{cargo.twilioNumber}}",
                     "to": "{{cargo.callerId}}",
                     "message": "iCuracao MyAccount - Username Recovery\n\nClick the link below to recover your username:\nhttps://myaccount.icuracao.com/forgot-username\n\nIf you did not request this, please ignore this message.",
                     "messageSid": ""
                  },
                  "onFail": {
                     "id": "sms_username_failed",
                     "type": "SAY",
                     "value": "I wasn't able to send the text, but you can recover your username directly at: https://myaccount.icuracao.com/forgot-username\n\nIs there anything else I can help you with?",
                     "value_es": "No pude enviar el mensaje de texto, pero puede recuperar su usuario directamente en: https://myaccount.icuracao.com/forgot-username\n\n¿Hay algo más en lo que pueda ayudarle?"
                  }
               },
               "condition: ma_issue === 'password' && cargo.callerId": {
                  "id": "send_password_link",
                  "type": "CALL-TOOL",
                  "tool": "send-twilio-sms",
                  "variable": "sms_result",
                  "args": {
                     "accountSid": "...",
                     "from": "{{cargo.twilioNumber}}",
                     "to": "{{cargo.callerId}}",
                     "message": "iCuracao MyAccount - Password Reset\n\nClick the link below to reset your password:\nhttps://myaccount.icuracao.com/forgot-password\n\nIf you did not request this, please ignore this message.",
                     "messageSid": ""
                  },
                  "onFail": {
                     "id": "sms_password_failed",
                     "type": "SAY",
                     "value": "I wasn't able to send the text, but you can reset your password directly at: https://myaccount.icuracao.com/forgot-password\n\nIs there anything else I can help you with?",
                     "value_es": "No pude enviar el mensaje de texto, pero puede restablecer su contraseña directamente en: https://myaccount.icuracao.com/forgot-password\n\n¿Hay algo más en lo que pueda ayudarle?"
                  }
               },
               "condition: ma_issue === 'username'": {
                  "id": "say_username_link_no_sms",
                  "type": "SAY",
                  "value": "You can recover your username at: https://myaccount.icuracao.com/forgot-username\n\nIs there anything else I can help you with?",
                  "value_es": "Puede recuperar su usuario en: https://myaccount.icuracao.com/forgot-username\n\n¿Hay algo más en lo que pueda ayudarle?"
               },
               "default": {
                  "id": "say_password_link_no_sms",
                  "type": "SAY",
                  "value": "You can reset your password at: https://myaccount.icuracao.com/forgot-password\n\nIs there anything else I can help you with?",
                  "value_es": "Puede restablecer su contraseña en: https://myaccount.icuracao.com/forgot-password\n\n¿Hay algo más en lo que pueda ayudarle?"
               }
            }
         },
         {
            "id": "confirm_sent",
            "type": "CASE",
            "branches": {
               "condition: sms_result && sms_result.success !== false": {
                  "id": "sms_sent_confirmation",
                  "type": "SAY",
                  "value": "I've sent a {{ma_issue === 'username' ? 'username recovery' : 'password reset'}} link via text message to {{cargo.callerId}}. Please check your text messages and follow the instructions. Is there anything else I can help you with?",
                  "value_es": "Le he enviado un enlace de {{ma_issue === 'username' ? 'recuperación de usuario' : 'restablecimiento de contraseña'}} por mensaje de texto al {{cargo.callerId}}. Por favor revise sus mensajes de texto y siga las instrucciones. ¿Hay algo más en lo que pueda ayudarle?"
               },
               "default": {
                  "id": "no_sms_confirmation",
                  "type": "SET",
                  "variable": "ma_done",
                  "value": "true"
               }
            }
         }
      ]
   },

   /* ===== AUTHENTICATED PAYMENT PROCESSING FLOWS ===== */

   {
      "id": "load-subaccounts-and-pay",
      "name": "LoadSubaccountsAndPay",
      "version": "1.0.0",
      "description": "Load subaccounts for the account and then show payment options. Entry point for authenticated in-conversation payment processing.",
      "variables": {
         "lsap_subaccounts_result": {
            "type": "object",
            "description": "Result from get-subaccounts tool"
         }
      },
      "steps": [
         {
            "id": "reset_facilitate_payments_flag",
            "type": "SET",
            "variable": "reset_facilitate_side_effect",
            "value": "cargo.facilitatePayments = false, cargo.authenticatedAccount = true"
         },
         {
            "id": "call_get_subaccounts",
            "type": "CALL-TOOL",
            "tool": "get-subaccounts",
            "variable": "lsap_subaccounts_result",
            "args": {
               "account_number": "{{cargo.accountNumber}}"
            },
            "onFail": {
               "id": "subaccounts_failed",
               "type": "SET",
               "variable": "lsap_subaccounts_result",
               "value": "{ success: false, subAccounts: [] }"
            }
         },
         {
            "id": "store_subaccounts",
            "type": "SET",
            "variable": "store_subs_side_effect",
            "value": "cargo.subAccounts = lsap_subaccounts_result.success && Array.isArray(lsap_subaccounts_result.subAccounts) ? lsap_subaccounts_result.subAccounts : [], cargo.subAccountsBalance = cargo.subAccounts.length > 0 ? cargo.subAccounts.reduce(function(acc, sub) { return acc + (sub.balance || 0); }, 0).toFixed(2) : '0.00'"
         },
         {
            "id": "try_express_pay",
            "type": "FLOW",
            "value": "express-pay-offer",
            "callType": "call"
         },
         {
            "id": "goto_payment_options",
            "type": "FLOW",
            "value": "process-payment-direct",
            "callType": "reboot"
         }
      ]
   },
   {
      "id": "express-pay-offer",
      "name": "ExpressPayOffer",
      "version": "1.0.0",
      "description": "After authentication, offer a one-step express payment using the customer's most-recently-used non-expired saved card for the full balance due across all sub-accounts. Falls through to the regular sub-account picker if there's no balance, no usable card, the customer chooses OPTIONS, or the payment-profile fetch fails.",
      "variables": {
         "epo_profile_result": {
            "type": "object",
            "description": "Result from get-payment-profile tool"
         },
         "epo_choice": {
            "type": "string",
            "description": "Customer's CONFIRM vs OPTIONS response",
            "value": ""
         },
         "epo_charge_result": {
            "type": "object",
            "description": "Result from charge-payment-profile tool"
         }
      },
      "steps": [
         {
            "id": "compute_express_total",
            "type": "SET",
            "variable": "express_total_side_effect",
            "value": "cargo.expressPayTotal = (cargo.subAccounts || []).filter(function(s) { return (s.totalDueAmt || 0) > 0; }).reduce(function(acc, s) { return acc + (s.totalDueAmt || 0); }, 0).toFixed(2)"
         },
         {
            "id": "compute_express_monthly_total",
            "type": "SET",
            "variable": "express_monthly_side_effect",
            "value": "cargo.expressMonthlyTotal = (cargo.subAccounts || []).map(function(s) { return Math.min(s.monthPmtAmt || 0, s.balance || 0); }).filter(function(a) { return a > 0; }).reduce(function(acc, a) { return acc + a; }, 0).toFixed(2)"
         },
         {
            "id": "check_balance_eligible",
            "type": "CASE",
            "branches": {
               "condition: !cargo.subAccounts || cargo.subAccounts.length === 0 || parseFloat(cargo.expressPayTotal || '0') < 0.5": {
                  "id": "skip_no_balance",
                  "type": "FLOW",
                  "value": "process-payment-direct",
                  "callType": "reboot"
               },
               "default": {
                  "id": "balance_ok",
                  "type": "SET",
                  "variable": "noop_balance_ok",
                  "value": "true"
               }
            }
         },
         {
            "id": "fetch_payment_profile",
            "type": "CALL-TOOL",
            "tool": "get-payment-profile",
            "variable": "epo_profile_result",
            "args": {
               "account_number": "{{cargo.accountNumber}}"
            },
            "onFail": {
               "id": "skip_profile_fetch_failed",
               "type": "FLOW",
               "value": "process-payment-direct",
               "callType": "reboot"
            }
         },
         {
            "id": "pick_default_card",
            "type": "SET",
            "variable": "epo_card_side_effect",
            "value": "(function() { var cards = (epo_profile_result && epo_profile_result.cards) || []; var valid = cards.filter(function(c) { return !c.isExpired; }); if (valid.length === 0) { cargo.epoCard = null; return null; } cargo.epoCard = valid.reduce(function(a, b) { return (b.recentUsedTime || '') > (a.recentUsedTime || '') ? b : a; }); return cargo.epoCard; })()"
         },
         {
            "id": "check_card_eligible",
            "type": "CASE",
            "branches": {
               "condition: !cargo.epoCard": {
                  "id": "skip_no_card",
                  "type": "FLOW",
                  "value": "process-payment-direct",
                  "callType": "reboot"
               },
               "default": {
                  "id": "card_ok",
                  "type": "SET",
                  "variable": "noop_card_ok",
                  "value": "true"
               }
            }
         },
         {
            "id": "ask_express_confirm",
            "type": "SAY-GET",
            "variable": "epo_choice",
            "value": "{{typeof cargo.subAccountsBalance === 'string' && cargo.subAccountsBalance ? 'Your account has a total balance of ' + amountToSpeech(cargo.subAccountsBalance, 'en', cargo.voice) + ', with ' + amountToSpeech(cargo.expressPayTotal, 'en', cargo.voice) + ' currently due. ' : ''}}Would you like to pay your current total due of {{amountToSpeech(cargo.expressPayTotal, 'en', cargo.voice)}} using your {{cargo.epoCard.cardType}} card ending in {{cargo.voice ? cargo.epoCard.cardNumber.split('').join(' ') : cargo.epoCard.cardNumber}}?\n{{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} CONFIRM to pay {{amountToSpeech(cargo.expressPayTotal, 'en', cargo.voice)}} now, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} OPTIONS for other choices, including a payment link to pay your full balance.{{parseFloat(cargo.expressMonthlyTotal || '0') > 0 ? '\\n' + (cargo.voice ? 'Press 3 or ' : '') + cargo.verb + ' MONTHLY to pay your monthly payment of ' + amountToSpeech(cargo.expressMonthlyTotal, 'en', cargo.voice) + ' instead.' : ''}}\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
            "value_es": "{{typeof cargo.subAccountsBalance === 'string' && cargo.subAccountsBalance ? 'Su cuenta tiene un saldo total de ' + amountToSpeech(cargo.subAccountsBalance, 'es', cargo.voice) + ', con ' + amountToSpeech(cargo.expressPayTotal, 'es', cargo.voice) + ' actualmente a pagar. ' : ''}}¿Le gustaría pagar su total a pagar actual de {{amountToSpeech(cargo.expressPayTotal, 'es', cargo.voice)}} con su tarjeta {{cargo.epoCard.cardType}} terminada en {{cargo.voice ? cargo.epoCard.cardNumber.split('').join(' ') : cargo.epoCard.cardNumber}}?\n{{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} CONFIRMAR para pagar {{amountToSpeech(cargo.expressPayTotal, 'es', cargo.voice)}} ahora, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} OPCIONES para más opciones, incluyendo un enlace de pago para pagar su saldo completo.{{parseFloat(cargo.expressMonthlyTotal || '0') > 0 ? '\\n' + (cargo.voice ? 'Presione 3 o ' : '') + cargo.verb_es + ' MENSUAL para pagar su pago mensual de ' + amountToSpeech(cargo.expressMonthlyTotal, 'es', cargo.voice) + '.' : ''}}\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR.",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "handle_express_choice",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice((epo_choice || '').toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "epo_route_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test((epo_choice || '').trim())": {
                  "id": "epo_exit",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "payment",
                     "support_context_es": "pago"
                  }
               },
               "condition: parseFloat(cargo.expressMonthlyTotal || '0') > 0 && ['3','monthly','mensual','mensualidad'].indexOf((epo_choice || '').trim().toLowerCase().replace(/^[¡¿ ]+|[ .,!?;:]+$/g, '')) > -1": {
                  "id": "epo_monthly_setup",
                  "type": "SET",
                  "variable": "epo_monthly_side_effect",
                  "value": "cargo.pendingPayments = (cargo.subAccounts || []).map(function(s) { var amt = Math.min(s.monthPmtAmt || 0, s.balance || 0); return { subaccount: s.subAccNumber, amount: parseFloat(amt.toFixed(2)) }; }).filter(function(p) { return p.amount > 0; }), cargo.pendingPaymentTotal = cargo.expressMonthlyTotal"
               },
               "condition: ['1','confirm','confirmar','yes','yeah','yep','sí','sure','pay','pagar','proceed','go ahead','do it','okay'].indexOf((epo_choice || '').trim().toLowerCase().replace(/^[¡¿ ]+|[ .,!?;:]+$/g, '')) > -1": {
                  "id": "epo_confirm_setup",
                  "type": "SET",
                  "variable": "epo_confirm_side_effect",
                  "value": "cargo.pendingPayments = (cargo.subAccounts || []).filter(function(s) { return (s.totalDueAmt || 0) > 0; }).map(function(s) { return { subaccount: s.subAccNumber, amount: parseFloat((s.totalDueAmt || 0).toFixed(2)) }; }), cargo.pendingPaymentTotal = cargo.expressPayTotal"
               },
               "default": {
                  "id": "epo_fallthrough_to_options",
                  "type": "FLOW",
                  "value": "process-payment-direct",
                  "callType": "reboot"
               }
            }
         },
         {
            "id": "stringify_epo_payment_profile_id",
            "type": "SET",
            "variable": "epo_payment_profile_id_str",
            "value": "(cargo.epoCard && cargo.epoCard.paymentProfileId != null) ? (cargo.epoCard.paymentProfileId + '') : ''"
         },
         {
            "id": "process_express_charge",
            "type": "CALL-TOOL",
            "tool": "charge-payment-profile",
            "variable": "epo_charge_result",
            "args": {
               "accountNumber": "{{cargo.accountNumber}}",
               "paymentProfileId": "{{epo_payment_profile_id_str}}",
               "fee": 0,
               "payments": "{{cargo.pendingPayments}}"
            },
            "onFail": {
               "id": "epo_charge_tool_failed",
               "type": "FLOW",
               "value": "direct-payment-failed",
               "callType": "replace",
               "parameters": {
                  "dp_error_code": "CHARGE_FAILED",
                  "dp_error_message": "Sorry, the payment could not be processed. Would you like to try again or receive a payment link instead?",
                  "dp_error_message_es": "Lo siento, no se pudo procesar el pago. ¿Le gustaría intentar de nuevo o recibir un enlace de pago?"
               }
            }
         },
         {
            "id": "epo_extract_trans_id",
            "type": "SET",
            "variable": "epo_trans_id_str",
            "value": "(epo_charge_result && epo_charge_result.data && epo_charge_result.data.TransId != null) ? (epo_charge_result.data.TransId + '') : ''"
         },
         {
            "id": "check_express_charge_result",
            "type": "CASE",
            "branches": {
               "condition: epo_charge_result && epo_charge_result.success": {
                  "id": "epo_goto_success",
                  "type": "FLOW",
                  "value": "direct-payment-success",
                  "callType": "replace",
                  "parameters": {
                     "dp_trans_id": "{{epo_trans_id_str}}"
                  }
               },
               "default": {
                  "id": "epo_goto_failure",
                  "type": "FLOW",
                  "value": "direct-payment-failed",
                  "callType": "replace",
                  "parameters": {
                     "dp_error_code": "{{epo_charge_result ? epo_charge_result.code : 'UNKNOWN'}}",
                     "dp_error_message": "{{epo_charge_result && epo_charge_result.message ? epo_charge_result.message : 'The payment could not be processed.'}}",
                     "dp_error_message_es": "No se pudo procesar el pago."
                  }
               }
            }
         }
      ]
   },
   {
      "id": "process-payment-direct",
      "name": "ProcessPaymentDirect",
      "version": "3.0.0",
      "description": "Show subaccounts, select what to pay, select amount, then choose payment method. Used for authenticated in-conversation payment processing.",
      "variables": {
         "sp_sub_choice": {
            "type": "string",
            "description": "User choice: ALL or specific subaccount number",
            "value": ""
         },
         "sp_amount_choice": {
            "type": "string",
            "description": "User choice: FULL or custom amount",
            "value": ""
         },
         "sp_selected_sub": {
            "type": "object",
            "description": "The selected subaccount object"
         },
         "sp_payments": {
            "type": "array",
            "description": "Built payments array",
            "value": []
         },
         "sp_total_amount": {
            "type": "string",
            "description": "Total payment amount",
            "value": "0"
         },
         "sp_confirm": {
            "type": "string",
            "description": "User confirmation",
            "value": ""
         },
         "payment_method_choice": {
            "type": "string",
            "description": "User's selected payment method",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "reset_dp_retry_count",
            "type": "SET",
            "variable": "reset_side_effect",
            "value": "cargo.dp_retry_in_progress ? (cargo.dp_retry_in_progress = false) : (cargo.dp_retry_count = 0)"
         },
         {
            "id": "check_payable_subaccounts",
            "type": "CASE",
            "branches": {
               "condition: !cargo.subAccounts || cargo.subAccounts.length === 0 || cargo.subAccounts.filter(function(s) { return (s.totalDueAmt || 0) > 0; }).length === 0": {
                  "id": "offer_link_when_nothing_due",
                  "type": "SAY-GET",
                  "variable": "nothing_due_choice",
                  "value": "Your account has no balances currently due{{typeof cargo.subAccountsBalance === 'string' && cargo.subAccountsBalance ? ', and your total balance is ' + amountToSpeech(cargo.subAccountsBalance, 'en', cargo.voice) : ''}}\n If you'd like to pay anyway, I can send you a payment link\n{{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} LINK to receive a payment link, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO if there's nothing else.\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
                  "value_es": "Su cuenta no tiene saldos actualmente a pagar{{typeof cargo.subAccountsBalance === 'string' && cargo.subAccountsBalance ? ', y su saldo total es ' + amountToSpeech(cargo.subAccountsBalance, 'es', cargo.voice) : ''}}\n Si desea pagar de todos modos, puedo enviarle un enlace de pago\n{{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} ENLACE para recibir un enlace de pago, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO si no hay nada más.\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR.",
                  "digits": {
                     "min": 1,
                     "max": 1
                  }
               },
               "default": {
                  "id": "noop_has_payable_subaccounts",
                  "type": "SET",
                  "variable": "noop_has_payable",
                  "value": "true"
               }
            }
         },
         {
            "id": "handle_nothing_due_choice",
            "type": "CASE",
            "branches": {
               "condition: typeof nothing_due_choice === 'undefined' || nothing_due_choice === ''": {
                  "id": "noop_had_payable_passthrough",
                  "type": "SET",
                  "variable": "noop_passthrough",
                  "value": "true"
               },
               "condition: matchesChoice((nothing_due_choice || '').toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "nothing_due_route_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test((nothing_due_choice || '').trim())": {
                  "id": "nothing_due_exit",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "payment",
                     "support_context_es": "pago"
                  }
               },
               "condition: /^1\\b/.test((nothing_due_choice || '').trim()) || matchesChoice((nothing_due_choice || '').toLowerCase().trim(), ['link','enlace','text','sms','texto','pay','pago','yes','si','sí','sure','okay','ok','please','por favor'])": {
                  "id": "nothing_due_send_link",
                  "type": "FLOW",
                  "value": "generate-and-validate-payment-link",
                  "callType": "replace"
               },
               "default": {
                  "id": "nothing_due_forward_to_ai",
                  "type": "RETURN",
                  "value": "''"
               }
            }
         },
         {
            "id": "filter_payable_subaccounts",
            "type": "SET",
            "variable": "filter_payable_side_effect",
            "value": "cargo.subAccounts = (cargo.subAccounts || []).filter(function(sub) { return (sub.totalDueAmt || 0) > 0; })"
         },
         {
            "id": "show_subaccounts_and_ask",
            "type": "SAY-GET",
            "variable": "sp_sub_choice",
            "value": "Account ending with {{cargo.accountNumber.slice(-4).split('').join(', ')}}{{cargo.firstName ? ', ' + cargo.firstName : ''}}. You have {{cargo.subAccounts && cargo.subAccounts.length ? cargo.subAccounts.length : 'no'}} sub account{{cargo.subAccounts && cargo.subAccounts.length !== 1 ? 's' : ''}} with {{cargo.subAccounts && cargo.subAccounts.length === 1 ? 'a balance' : 'balances'}} due{{cargo.subAccounts && cargo.subAccounts.length > 0 ? ':\\n' + cargo.subAccounts.map(function(sub) { return 'Sub account ' + sub.subAccNumber + ': ' + amountToSpeech((sub.totalDueAmt || 0).toFixed(2), language, cargo.voice) + ' due'; }).join('\\n') : ''}}.\n\n{{cargo.subAccounts && cargo.subAccounts.length === 1 ? ((cargo.voice ? 'Press 1 or ' : '') + cargo.verb + ' PAY to pay it now, or ' + (cargo.voice ? 'press 2 or ' : '') + cargo.verb + ' LINK to receive a payment link instead.\\nTo exit ' + (cargo.voice ? 'press the star key or ' : '') + cargo.verb + ' EXIT.') : ('Which sub account would you like to pay? ' + cargo.verb + ' ALL to pay all sub accounts, or ' + cargo.verb + ' the sub account number.\\nTo receive a payment link instead, ' + cargo.verb + ' LINK.\\nTo exit ' + (cargo.voice ? 'press the star key or ' : '') + cargo.verb + ' EXIT.')}}",
            "value_es": "Cuenta que termina en {{cargo.accountNumber.slice(-4).split('').join(', ')}}{{cargo.firstName ? ', ' + cargo.firstName : ''}}. Tiene {{cargo.subAccounts && cargo.subAccounts.length ? cargo.subAccounts.length : 'ninguna'}} subcuenta{{cargo.subAccounts && cargo.subAccounts.length !== 1 ? 's' : ''}} con {{cargo.subAccounts && cargo.subAccounts.length === 1 ? 'saldo pendiente' : 'saldos pendientes'}}{{cargo.subAccounts && cargo.subAccounts.length > 0 ? ':\\n' + cargo.subAccounts.map(function(sub) { return 'Subcuenta ' + sub.subAccNumber + ': ' + amountToSpeech((sub.totalDueAmt || 0).toFixed(2), language, cargo.voice) + ' pendiente'; }).join('\\n') : ''}}.\n\n{{cargo.subAccounts && cargo.subAccounts.length === 1 ? ((cargo.voice ? 'Presione 1 o ' : '') + cargo.verb_es + ' PAGAR para pagarla ahora, o ' + (cargo.voice ? 'presione 2 o ' : '') + cargo.verb_es + ' ENLACE para recibir un enlace de pago.\\nPara salir ' + (cargo.voice ? 'presione la tecla de estrella o ' : '') + cargo.verb_es + ' SALIR.') : ('¿Cuál subcuenta desea pagar? ' + cargo.verb_es + ' TODAS para pagar todas las subcuentas, o ' + cargo.verb_es + ' el número de subcuenta.\\nPara recibir un enlace de pago, ' + cargo.verb_es + ' ENLACE.\\nPara salir ' + (cargo.voice ? 'presione la tecla de estrella o ' : '') + cargo.verb_es + ' SALIR.')}}"
         },
         {
            "id": "normalize_sub_choice",
            "type": "SET",
            "variable": "sp_sub_choice",
            "value": "sp_sub_choice.trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "handle_sub_choice",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(sp_sub_choice, ['all', 'todas', 'todo', 'all of them']) || (cargo.subAccounts && cargo.subAccounts.length === 1 && (/^1\\b/.test(sp_sub_choice) || matchesChoice(sp_sub_choice, ['pay', 'pague', 'pagar', 'pago', 'yes', 'si', 'sí', 'sure', 'ok', 'okay', 'options', 'opciones'])))": {
                  "id": "build_all_payments",
                  "type": "SET",
                  "variable": "sp_payments",
                  "value": "(function() { if (cargo.subAccounts && cargo.subAccounts.length === 1) { cargo.selectedSubAccount = cargo.subAccounts[0]; } return cargo.subAccounts.filter(function(sub) { return (sub.totalDueAmt || 0) > 0; }).map(function(sub) { return { subaccount: sub.subAccNumber, amount: sub.totalDueAmt }; }); })()"
               },
               "condition: matchesChoice(sp_sub_choice, ['link', 'text', 'sms', 'enlace', 'texto']) || (cargo.subAccounts && cargo.subAccounts.length === 1 && /^2\\b/.test(sp_sub_choice))": {
                  "id": "goto_payment_link",
                  "type": "FLOW",
                  "value": "generate-and-validate-payment-link",
                  "callType": "call"
               },
               "condition: matchesChoice(sp_sub_choice, ['forget', 'start over', 'olvidar', 'empezar de nuevo'])": {
                  "id": "forget_account_and_restart",
                  "type": "SET",
                  "variable": "forget_side_effect",
                  "value": "cargo.accountNumber = null"
               },
               "condition: matchesChoice(sp_sub_choice, ['*', 'abort', 'exit', 'quit', 'salir', 'no'])": {
                  "id": "abort_process",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "payment",
                     "support_context_es": "pago"
                  }
               },
               "condition: matchesChoice(sp_sub_choice, ['live', 'agent', 'customer service', 'representative', 'agente', 'servidor', 'hablar con alguien']) || sp_sub_choice === '0'": {
                  "id": "goto_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "reboot"
               },
               "default": {
                  "id": "try_match_subaccount_to_cargo",
                  "type": "SET",
                  "variable": "match_side_effect",
                  "value": "(function() { var num = sp_sub_choice.replace(/[^0-9]/g, ''); var match = cargo.subAccounts.find(function(sub) { return sub.subAccNumber === num || sub.subAccNumber === sp_sub_choice; }); if (match) { cargo.selectedSubAccount = match; } else { cargo.selectedSubAccount = null; } return true; })()"
               }
            }
         },
         {
            "id": "route_after_sub_choice",
            "type": "CASE",
            "branches": {
               "condition: sp_payments && sp_payments.length > 0": {
                  "id": "all_selected_proceed",
                  "type": "SET",
                  "variable": "noop_all",
                  "value": "true"
               },
               "condition: cargo.selectedSubAccount && (cargo.selectedSubAccount.totalDueAmt || 0) > 0": {
                  "id": "goto_specific_sub_flow",
                  "type": "FLOW",
                  "value": "pay-specific-subaccount",
                  "callType": "call"
               },
               "condition: cargo.selectedSubAccount && (cargo.selectedSubAccount.totalDueAmt || 0) <= 0": {
                  "id": "zero_due_sub",
                  "type": "SAY",
                  "value": "Sub account {{cargo.selectedSubAccount.subAccNumber}} has no amount due, so there's nothing to pay on it. Let's pick a different one.",
                  "value_es": "La subcuenta {{cargo.selectedSubAccount.subAccNumber}} no tiene monto pendiente, así que no hay nada que pagar. Vamos a seleccionar otra."
               },
               "default": {
                  "id": "invalid_sub_restart",
                  "type": "SAY",
                  "value": "Sorry, I couldn't find that sub account. Let's try again.",
                  "value_es": "Lo siento, no pude encontrar esa subcuenta. Intentemos de nuevo."
               }
            }
         },
         {
            "id": "handle_invalid_sub_restart",
            "type": "CASE",
            "branches": {
               "condition: (!cargo.pendingPayments || cargo.pendingPayments.length === 0) && (!sp_payments || sp_payments.length === 0)": {
                  "id": "restart_sub_selection",
                  "type": "FLOW",
                  "value": "process-payment-direct",
                  "callType": "replace"
               },
               "default": {
                  "id": "noop_sub_valid",
                  "type": "SET",
                  "variable": "noop_sub",
                  "value": "true"
               }
            }
         },
         {
            "id": "store_all_payments_if_needed",
            "type": "CASE",
            "branches": {
               "condition: sp_payments && sp_payments.length > 0 && (!cargo.pendingPayments || cargo.pendingPayments.length === 0)": {
                  "id": "store_all_to_cargo",
                  "type": "SET",
                  "variable": "store_all_side_effect",
                  "value": "cargo.pendingPayments = sp_payments, cargo.pendingPaymentTotal = sp_payments.reduce(function(acc, p) { return acc + p.amount; }, 0).toFixed(2)"
               },
               "default": {
                  "id": "noop_already_stored",
                  "type": "SET",
                  "variable": "noop_stored",
                  "value": "true"
               }
            }
         },
         {
            "id": "check_any_payments_ready",
            "type": "CASE",
            "branches": {
               "condition: cargo.pendingPayments && cargo.pendingPayments.length > 0 && parseFloat(cargo.pendingPaymentTotal) > 0": {
                  "id": "noop_ready",
                  "type": "SET",
                  "variable": "noop_ready",
                  "value": "true"
               },
               "default": {
                  "id": "restart_no_payments",
                  "type": "FLOW",
                  "value": "process-payment-direct",
                  "callType": "reboot"
               }
            }
         },
         {
            "id": "placeholder_noop",
            "type": "SET",
            "variable": "noop_placeholder",
            "value": "true"
         },
         {
            "id": "reset_pm_attempts",
            "type": "SET",
            "variable": "reset_pm_attempts_side_effect",
            "value": "(function() { cargo.pm_attempts = 0; return true; })()"
         },
         {
            "id": "ask_payment_method",
            "type": "FLOW",
            "value": "select-payment-method",
            "callType": "call"
         }
      ]
   },
   {
      "id": "select-payment-method",
      "name": "SelectPaymentMethod",
      "version": "1.0.0",
      "description": "Ask how the customer wants to pay and route to the chosen method. On an unrecognized answer it RE-PROMPTS (bounded by cargo.pm_attempts) and escalates to a live agent, instead of relegating a payment turn to the conversational AI. Extracted from process-payment-direct so the menu can be re-asked without re-running sub-account selection.",
      "variables": {
         "payment_method_choice": {
            "type": "string",
            "description": "User's payment method selection",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "bump_pm_attempts",
            "type": "SET",
            "variable": "bump_pm_attempts_side_effect",
            "value": "(function() { cargo.pm_attempts = (cargo.pm_attempts || 0) + 1; return true; })()"
         },
         {
            "id": "escalate_if_too_many",
            "type": "CASE",
            "branches": {
               "condition: (cargo.pm_attempts || 0) > 3": {
                  "id": "pm_escalate_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "reboot"
               },
               "default": {
                  "id": "pm_continue",
                  "type": "SET",
                  "variable": "pm_continue_side_effect",
                  "value": "true"
               }
            }
         },
         {
            "id": "confirm_and_ask_method",
            "type": "SAY-GET",
            "variable": "payment_method_choice",
            "value": "{{(cargo.pm_attempts || 0) > 1 ? 'Sorry, I missed that. ' : ''}}You'd like to pay {{amountToSpeech(cargo.pendingPaymentTotal, language, cargo.voice)}}. How would you like to pay?\n{{cargo.epoCard ? (cargo.voice ? 'Press 1 ' : '') + 'to use ' + cargo.epoCard.cardType + ' ending in ' + (cargo.voice ? cargo.epoCard.cardNumber.split('').join(' ') : cargo.epoCard.cardNumber) + '\\n' : ''}}{{cargo.voice ? 'Press ' + (cargo.epoCard ? '2' : '1') + ' or ' : ''}}{{cargo.verb}} CARD ON FILE to pay with {{cargo.epoCard ? 'another saved card' : 'a saved card'}}\n{{cargo.voice ? 'Press ' + (cargo.epoCard ? '3' : '2') + ' or ' : ''}}{{cargo.verb}} NEW CARD to pay with a different card\n{{cargo.voice ? 'Press ' + (cargo.epoCard ? '4' : '3') + ' or ' : ''}}{{cargo.verb}} LINK to receive a payment link via text\n{{cargo.verb}} BACK to go back\nTo exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT",
            "value_es": "{{(cargo.pm_attempts || 0) > 1 ? 'No entendí. ' : ''}}Desea pagar {{amountToSpeech(cargo.pendingPaymentTotal, language, cargo.voice)}}. ¿Cómo le gustaría pagar?\n{{cargo.epoCard ? (cargo.voice ? 'Presione 1 ' : '') + 'para usar su ' + cargo.epoCard.cardType + ' terminada en ' + (cargo.voice ? cargo.epoCard.cardNumber.split('').join(' ') : cargo.epoCard.cardNumber) + '\\n' : ''}}{{cargo.voice ? 'Presione ' + (cargo.epoCard ? '2' : '1') + ' o ' : ''}}{{cargo.verb_es}} TARJETA EN ARCHIVO para pagar con {{cargo.epoCard ? 'otra tarjeta guardada' : 'una tarjeta guardada'}}\n{{cargo.voice ? 'Presione ' + (cargo.epoCard ? '3' : '2') + ' o ' : ''}}{{cargo.verb_es}} NUEVA TARJETA para pagar con otra tarjeta\n{{cargo.voice ? 'Presione ' + (cargo.epoCard ? '4' : '3') + ' o ' : ''}}{{cargo.verb_es}} ENLACE para recibir un enlace de pago por texto\n{{cargo.verb_es}} ATRÁS para volver\nPara salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR",
            "digits": {
               "min": 1,
               "max": 1
            }
         },
         {
            "id": "normalize_payment_method",
            "type": "SET",
            "variable": "payment_method_choice",
            "value": "payment_method_choice.trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "handle_payment_method",
            "type": "CASE",
            "branches": {
               "condition: cargo.epoCard && payment_method_choice === '1'": {
                  "id": "goto_recent_card",
                  "type": "FLOW",
                  "value": "pay-with-recent-card",
                  "callType": "call"
               },
               "condition: (cargo.epoCard && payment_method_choice === '2') || (!cargo.epoCard && payment_method_choice === '1') || matchesChoice(payment_method_choice, ['card on file', 'saved card', 'card file', 'tarjeta en archivo', 'tarjeta guardada', 'archiv', 'guardad', 'on file', 'saved'])": {
                  "id": "goto_card_on_file",
                  "type": "FLOW",
                  "value": "pay-with-card-on-file",
                  "callType": "call"
               },
               "condition: (cargo.epoCard && payment_method_choice === '3') || (!cargo.epoCard && payment_method_choice === '2') || matchesChoice(payment_method_choice, ['new card', 'different card', 'nueva tarjeta', 'otra tarjeta', 'nuev', 'different', 'diferente'])": {
                  "id": "goto_new_card",
                  "type": "FLOW",
                  "value": "pay-with-new-card",
                  "callType": "call"
               },
               "condition: (cargo.epoCard && payment_method_choice === '4') || (!cargo.epoCard && payment_method_choice === '3') || matchesChoice(payment_method_choice, ['link', 'text', 'sms', 'enlace', 'texto'])": {
                  "id": "send_and_validate_payment_link",
                  "type": "FLOW",
                  "value": "generate-and-validate-payment-link",
                  "callType": "call"
               },
               "condition: matchesChoice(payment_method_choice, ['back', 'atrás', 'atras', 'volver'])": {
                  "id": "go_back_to_sub_selection",
                  "type": "FLOW",
                  "value": "process-payment-direct",
                  "callType": "reboot"
               },
               "condition: matchesChoice(payment_method_choice, ['*', 'abort', 'exit', 'quit', 'salir', 'no'])": {
                  "id": "abort_process",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "payment",
                     "support_context_es": "pago"
                  }
               },
               "condition: matchesChoice(payment_method_choice, ['live', 'agent', 'customer service', 'representative', 'agente', 'servidor', 'hablar con alguien']) || payment_method_choice === '0'": {
                  "id": "goto_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "reboot"
               },
               "condition: (function() { var digits = (payment_method_choice || '').replace(/[^0-9.]/g, ''); var n = digits ? parseFloat(digits) : NaN; return !isNaN(n) && n > 0 && digits.length >= 1 && payment_method_choice.trim() !== '1' && payment_method_choice.trim() !== '2' && payment_method_choice.trim() !== '3' && payment_method_choice.trim() !== '4' && payment_method_choice.trim() !== '0'; })()": {
                  "id": "restated_amount_redo",
                  "type": "FLOW",
                  "value": "pay-specific-subaccount",
                  "callType": "replace"
               },
               "condition: matchesChoice(payment_method_choice, ['card', 'tarjeta', 'targeta', 'tarjet', 'pay', 'pagar', 'proceed', 'proceder', 'go ahead', 'seguir', 'do it', 'hacer', 'okay', 'ok', 'confirmar', 'sí', 'sure'])": {
                  "id": "assume_new_card",
                  "type": "FLOW",
                  "value": "pay-with-new-card",
                  "callType": "call"
               },
               "default": {
                  "id": "reprompt_payment_method",
                  "type": "FLOW",
                  "value": "select-payment-method",
                  "callType": "replace"
               }
            }
         }
      ]
   },
   {
      "id": "pay-specific-subaccount",
      "name": "PaySpecificSubaccount",
      "version": "1.0.0",
      "description": "Ask how much to pay on a specific subaccount and store the payment",
      "variables": {
         "pss_amount_choice": {
            "type": "string",
            "description": "User input: FULL or a dollar amount",
            "value": ""
         },
         "pss_confirm_choice": {
            "type": "string",
            "description": "User's YES/NO answer when confirming an interpreted or over-due amount",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "ensure_selected_subaccount",
            "type": "CASE",
            "branches": {
               "condition: !cargo.selectedSubAccount && cargo.subAccounts && cargo.subAccounts.length === 1": {
                  "id": "auto_select_single_sub",
                  "type": "SET",
                  "variable": "ensure_sub_side_effect",
                  "value": "(function() { cargo.selectedSubAccount = cargo.subAccounts[0]; return true; })()"
               },
               "condition: !cargo.selectedSubAccount": {
                  "id": "recover_to_sub_selection",
                  "type": "FLOW",
                  "value": "process-payment-direct",
                  "callType": "reboot"
               },
               "default": {
                  "id": "selected_sub_ok",
                  "type": "SET",
                  "variable": "ensure_sub_side_effect",
                  "value": "true"
               }
            }
         },
         {
            "id": "show_error_if_any",
            "type": "SET",
            "variable": "pss_error_prefix",
            "value": "(function() { var msg = ''; if (cargo.paymentAmountError === 'exceeds') msg = language === 'es' ? 'El monto ingresado excede el monto adeudado. ' : 'The amount you entered exceeds the amount due. '; if (cargo.paymentAmountError === 'minimum') msg = language === 'es' ? 'El monto minimo que podemos procesar es cincuenta centavos. ' : 'The smallest amount we can process is fifty cents. '; if (cargo.paymentAmountError === 'invalid') msg = language === 'es' ? 'Lo siento, no pude entender el monto. ' : 'Sorry, I couldn\\'t understand the amount. '; cargo.paymentAmountError = ''; return msg; })()"
         },
         {
            "id": "ask_amount",
            "type": "SAY-GET",
            "variable": "pss_amount_choice",
            "value": "{{pss_error_prefix}}Sub account {{cargo.selectedSubAccount.subAccNumber}} has {{amountToSpeech((cargo.selectedSubAccount.totalDueAmt || 0).toFixed(2), language, cargo.voice)}} due. {{cargo.verb}} FULL to pay the full amount due, or {{cargo.verb}} the amount you'd like to pay.\n{{cargo.verb}} BACK to go back. To exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
            "value_es": "{{cargo.paymentAmountError === 'exceeds' ? 'El monto ingresado excede el monto adeudado. ' : cargo.paymentAmountError === 'invalid' ? 'Lo siento, no pude entender el monto. ' : ''}}La subcuenta {{cargo.selectedSubAccount.subAccNumber}} tiene {{amountToSpeech((cargo.selectedSubAccount.totalDueAmt || 0).toFixed(2), language, cargo.voice)}} pendiente. {{cargo.verb_es}} COMPLETO para pagar el monto total, o {{cargo.verb_es}} la cantidad que desea pagar.\n{{cargo.verb_es}} ATRÁS para volver. Para salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
         },
         {
            "id": "check_back_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(pss_amount_choice.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_pss",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: matchesChoice(pss_amount_choice.trim().toLowerCase(), ['back', 'atrás', 'atras', 'volver'])": {
                  "id": "go_back_to_sub_selection",
                  "type": "FLOW",
                  "value": "process-payment-direct",
                  "callType": "reboot"
               },
               "condition: matchesChoice(pss_amount_choice.trim().toLowerCase(), ['*', 'exit', 'quit', 'salir', 'abort'])": {
                  "id": "exit_payment",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "payment",
                     "support_context_es": "pago"
                  }
               },
               "default": {
                  "id": "build_payment",
                  "type": "SET",
                  "variable": "build_payment_side_effect",
                  "value": "(function() { var choice = (pss_amount_choice || '').trim().toLowerCase(); var sub = cargo.selectedSubAccount; if (!sub) { cargo.pendingPayments = []; cargo.pendingPaymentTotal = '0'; cargo.paymentAmountError = 'invalid'; return true; } var due = sub.totalDueAmt || 0; if (choice.includes('-')) { cargo.pendingPayments = []; cargo.pendingPaymentTotal = '0'; cargo.paymentAmountError = 'invalid'; return true; } var digits = choice.replace(/[^0-9.]/g, ''); var amt = digits ? parseFloat(digits) : NaN; if (!isNaN(amt) && amt > 0 && amt < 0.5) { cargo.pendingPayments = []; cargo.pendingPaymentTotal = '0'; cargo.paymentAmountError = 'minimum'; return true; } if (!isNaN(amt) && amt >= 0.5 && amt <= due) { var rounded = parseFloat(amt.toFixed(2)); cargo.pendingPayments = [{ subaccount: sub.subAccNumber, amount: rounded }]; cargo.pendingPaymentTotal = rounded.toFixed(2); cargo.paymentAmountError = ''; return true; } if (!isNaN(amt) && amt > due) { var noDecimal = digits.indexOf('.') === -1; var cents = amt / 100; cargo.pssEnteredAmount = parseFloat(amt.toFixed(2)); if (noDecimal && digits.length >= 3 && cents >= 0.5 && cents <= due) { cargo.pssInterpretedAmount = parseFloat(cents.toFixed(2)); cargo.paymentAmountError = 'confirm_cents'; } else { cargo.paymentAmountError = 'confirm_overpay'; } cargo.pendingPayments = []; cargo.pendingPaymentTotal = '0'; return true; } if (/\\b(full|completo|todo|todos|total)\\b/i.test(choice)) { cargo.pendingPayments = [{ subaccount: sub.subAccNumber, amount: due }]; cargo.pendingPaymentTotal = due.toFixed(2); cargo.paymentAmountError = ''; return true; } cargo.pendingPayments = []; cargo.pendingPaymentTotal = '0'; cargo.paymentAmountError = 'invalid'; return true; })()"
               }
            }
         },
         {
            "id": "confirm_amount_if_needed",
            "type": "CASE",
            "branches": {
               "condition: cargo.paymentAmountError === 'confirm_cents'": {
                  "id": "ask_confirm_cents",
                  "type": "SAY-GET",
                  "variable": "pss_confirm_choice",
                  "value": "Just to confirm, did you mean {{amountToSpeech(cargo.pssInterpretedAmount.toFixed(2), language, cargo.voice)}}? {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to pay that amount, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO to enter a different amount.",
                  "value_es": "Solo para confirmar, ¿quiso decir {{amountToSpeech(cargo.pssInterpretedAmount.toFixed(2), language, cargo.voice)}}? {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ para pagar ese monto, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO para ingresar un monto diferente.",
                  "digits": { "min": 1, "max": 1 }
               },
               "condition: cargo.paymentAmountError === 'confirm_overpay'": {
                  "id": "ask_confirm_overpay",
                  "type": "SAY-GET",
                  "variable": "pss_confirm_choice",
                  "value": "The amount {{amountToSpeech(cargo.pssEnteredAmount.toFixed(2), language, cargo.voice)}} is more than the {{amountToSpeech((cargo.selectedSubAccount.totalDueAmt || 0).toFixed(2), language, cargo.voice)}} due. {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to pay it anyway, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO to enter a different amount.",
                  "value_es": "El monto {{amountToSpeech(cargo.pssEnteredAmount.toFixed(2), language, cargo.voice)}} es mayor que los {{amountToSpeech((cargo.selectedSubAccount.totalDueAmt || 0).toFixed(2), language, cargo.voice)}} adeudados. {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ para pagarlo de todos modos, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO para ingresar un monto diferente.",
                  "digits": { "min": 1, "max": 1 }
               },
               "default": {
                  "id": "noop_no_confirmation_needed",
                  "type": "SET",
                  "variable": "noop_confirm",
                  "value": "true"
               }
            }
         },
         {
            "id": "apply_amount_confirmation",
            "type": "CASE",
            "branches": {
               "condition: (cargo.paymentAmountError === 'confirm_cents' || cargo.paymentAmountError === 'confirm_overpay') && ['1','yes','yeah','yep','yup','sure','ok','okay','correct','si','sí','claro'].indexOf((pss_confirm_choice || '').trim().toLowerCase()) > -1": {
                  "id": "apply_confirmed_amount",
                  "type": "SET",
                  "variable": "apply_confirmed_side_effect",
                  "value": "(function() { var sub = cargo.selectedSubAccount; var amount = cargo.paymentAmountError === 'confirm_cents' ? cargo.pssInterpretedAmount : cargo.pssEnteredAmount; cargo.pendingPayments = [{ subaccount: sub.subAccNumber, amount: amount }]; cargo.pendingPaymentTotal = amount.toFixed(2); cargo.paymentAmountError = ''; cargo.pssInterpretedAmount = null; cargo.pssEnteredAmount = null; return true; })()"
               },
               "condition: cargo.paymentAmountError === 'confirm_cents'": {
                  "id": "cents_declined_offer_overpay",
                  "type": "SET",
                  "variable": "cents_declined_side_effect",
                  "value": "(function() { cargo.paymentAmountError = 'confirm_overpay_second'; cargo.pssInterpretedAmount = null; return true; })()"
               },
               "condition: cargo.paymentAmountError === 'confirm_overpay'": {
                  "id": "declined_confirmation_reask",
                  "type": "FLOW",
                  "value": "pay-specific-subaccount",
                  "callType": "replace"
               },
               "default": {
                  "id": "noop_no_confirmation_to_apply",
                  "type": "SET",
                  "variable": "noop_confirm_apply",
                  "value": "true"
               }
            }
         },
         {
            "id": "confirm_overpay_after_cents_declined",
            "type": "CASE",
            "branches": {
               "condition: cargo.paymentAmountError === 'confirm_overpay_second'": {
                  "id": "ask_confirm_overpay_second",
                  "type": "SAY-GET",
                  "variable": "pss_confirm_choice",
                  "value": "Understood. You entered {{amountToSpeech(cargo.pssEnteredAmount.toFixed(2), language, cargo.voice)}}, which is more than the {{amountToSpeech((cargo.selectedSubAccount.totalDueAmt || 0).toFixed(2), language, cargo.voice)}} due. {{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to pay it anyway, or {{cargo.voice ? 'press 2 or ' : ''}}{{cargo.verb}} NO to enter a different amount.",
                  "value_es": "Entendido. Usted ingresó {{amountToSpeech(cargo.pssEnteredAmount.toFixed(2), language, cargo.voice)}}, que es mayor que los {{amountToSpeech((cargo.selectedSubAccount.totalDueAmt || 0).toFixed(2), language, cargo.voice)}} adeudados. {{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ para pagarlo de todos modos, o {{cargo.voice ? 'presione 2 o ' : ''}}{{cargo.verb_es}} NO para ingresar un monto diferente.",
                  "digits": { "min": 1, "max": 1 }
               },
               "default": {
                  "id": "noop_no_second_confirmation",
                  "type": "SET",
                  "variable": "noop_confirm_second",
                  "value": "true"
               }
            }
         },
         {
            "id": "apply_overpay_after_cents_declined",
            "type": "CASE",
            "branches": {
               "condition: cargo.paymentAmountError === 'confirm_overpay_second' && ['1','yes','yeah','yep','yup','sure','ok','okay','correct','si','sí','claro'].indexOf((pss_confirm_choice || '').trim().toLowerCase()) > -1": {
                  "id": "apply_confirmed_overpay_second",
                  "type": "SET",
                  "variable": "apply_overpay_second_side_effect",
                  "value": "(function() { var sub = cargo.selectedSubAccount; var amount = cargo.pssEnteredAmount; cargo.pendingPayments = [{ subaccount: sub.subAccNumber, amount: amount }]; cargo.pendingPaymentTotal = amount.toFixed(2); cargo.paymentAmountError = ''; cargo.pssEnteredAmount = null; return true; })()"
               },
               "condition: cargo.paymentAmountError === 'confirm_overpay_second'": {
                  "id": "declined_overpay_second_reask",
                  "type": "FLOW",
                  "value": "pay-specific-subaccount",
                  "callType": "replace"
               },
               "default": {
                  "id": "noop_no_second_confirmation_to_apply",
                  "type": "SET",
                  "variable": "noop_confirm_second_apply",
                  "value": "true"
               }
            }
         },
         {
            "id": "check_valid",
            "type": "CASE",
            "branches": {
               "condition: !cargo.pendingPayments || cargo.pendingPayments.length === 0 || parseFloat(cargo.pendingPaymentTotal) <= 0": {
                  "id": "invalid_amount",
                  "type": "SAY",
                  "value": "Sorry, I couldn't understand the payment amount. Let's try again.",
                  "value_es": "Lo siento, no pude entender el monto del pago. Intentemos de nuevo."
               },
               "default": {
                  "id": "amount_valid",
                  "type": "SET",
                  "variable": "noop_valid",
                  "value": "true"
               }
            }
         },
         {
            "id": "handle_invalid",
            "type": "CASE",
            "branches": {
               "condition: cargo.paymentAmountError || !cargo.pendingPayments || cargo.pendingPayments.length === 0 || parseFloat(cargo.pendingPaymentTotal) <= 0": {
                  "id": "retry_amount",
                  "type": "FLOW",
                  "value": "pay-specific-subaccount",
                  "callType": "replace"
               },
               "default": {
                  "id": "noop_done",
                  "type": "SET",
                  "variable": "noop_done",
                  "value": "true"
               }
            }
         }
      ]
   },
   {
      "id": "pay-with-card-on-file",
      "name": "PayWithCardOnFile",
      "version": "1.0.0",
      "description": "Retrieve saved cards and process payment with a card on file",
      "variables": {
         "cof_profile_result": {
            "type": "object",
            "description": "Result from get-payment-profile tool"
         },
         "cof_card_choice": {
            "type": "string",
            "description": "User's card selection",
            "value": ""
         },
         "cof_selected_card": {
            "type": "object",
            "description": "The selected card object"
         },
         "cof_valid_cards": {
            "type": "array",
            "description": "Non-expired cards",
            "value": []
         },
         "cof_charge_confirm": {
            "type": "string",
            "description": "User confirmation before charging",
            "value": ""
         },
         "cof_charge_result": {
            "type": "object",
            "description": "Result from charge-payment-profile tool"
         }
      },
      "steps": [
         {
            "id": "fetch_profiles",
            "type": "CALL-TOOL",
            "tool": "get-payment-profile",
            "variable": "cof_profile_result",
            "args": {
               "account_number": "{{cargo.accountNumber}}"
            },
            "onFail": {
               "id": "profile_fetch_failed",
               "type": "FLOW",
               "value": "direct-payment-failed",
               "callType": "replace",
               "parameters": {
                  "dp_error_code": "PROFILE_FETCH_FAILED",
                  "dp_error_message": "Sorry, I wasn't able to retrieve your saved cards. Would you like to pay with a new card or receive a payment link instead?",
                  "dp_error_message_es": "Lo siento, no pude recuperar sus tarjetas guardadas. ¿Le gustaría pagar con una nueva tarjeta o recibir un enlace de pago?"
               }
            }
         },
         {
            "id": "filter_valid_cards",
            "type": "SET",
            "variable": "cof_valid_cards",
            "value": "cof_profile_result.cards ? cof_profile_result.cards.filter(function(c) { return !c.isExpired; }) : []"
         },
         {
            "id": "check_cards_available",
            "type": "CASE",
            "branches": {
               "condition: cof_valid_cards.length === 0": {
                  "id": "no_cards_found",
                  "type": "SAY-GET",
                  "variable": "cof_card_choice",
                  "value": "You don't have any cards on file. Would you like to pay with a new card instead? {{cargo.verb}} YES or NO.",
                  "value_es": "No tiene tarjetas guardadas. ¿Le gustaría pagar con una nueva tarjeta? {{cargo.verb_es}} SÍ o NO."
               },
               "condition: cof_valid_cards.length === 1": {
                  "id": "single_card",
                  "type": "SET",
                  "variable": "cof_selected_card",
                  "value": "cof_valid_cards[0]"
               },
               "default": {
                  "id": "list_multiple_cards",
                  "type": "SAY-GET",
                  "variable": "cof_card_choice",
                  "value": "I found {{cof_valid_cards.length}} cards on file:\n{{cof_valid_cards.map(function(c, i) { return (i + 1) + '. ' + c.cardType + ' ending in ' + c.cardNumber + ' (expires ' + c.expirationUIDate + ')'; }).join('\\n')}}\nPlease {{cargo.verb}} the number of the card you'd like to use.",
                  "value_es": "Encontré {{cof_valid_cards.length}} tarjetas guardadas:\n{{cof_valid_cards.map(function(c, i) { return (i + 1) + '. ' + c.cardType + ' terminada en ' + c.cardNumber + ' (vence ' + c.expirationUIDate + ')'; }).join('\\n')}}\nPor favor {{cargo.verb_es}} el número de la tarjeta que desea usar."
               }
            }
         },
         {
            "id": "handle_no_cards_response",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice((cof_card_choice || '').toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_cof_card",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: cof_valid_cards.length === 0 && matchesChoice((cof_card_choice || '').trim().toLowerCase(), ['yes', '1', 'si', 'sí'])": {
                  "id": "redirect_to_new_card",
                  "type": "FLOW",
                  "value": "pay-with-new-card",
                  "callType": "call"
               },
               "condition: cof_valid_cards.length === 0": {
                  "id": "redirect_to_payment_link",
                  "type": "FLOW",
                  "value": "generate-and-validate-payment-link",
                  "callType": "call"
               },
               "condition: cof_valid_cards.length > 1 && cof_card_choice": {
                  "id": "select_card_by_number",
                  "type": "SET",
                  "variable": "cof_selected_card",
                  "value": "(function() { var idx = parseInt(cof_card_choice.trim()) - 1; return (idx >= 0 && idx < cof_valid_cards.length) ? cof_valid_cards[idx] : cof_valid_cards[0]; })()"
               },
               "default": {
                  "id": "card_already_selected",
                  "type": "SET",
                  "variable": "cof_noop",
                  "value": "true"
               }
            }
         },
         {
            "id": "check_card_selected",
            "type": "CASE",
            "branches": {
               "condition: !cof_selected_card": {
                  "id": "cof_done_no_card",
                  "type": "SET",
                  "variable": "cof_noop",
                  "value": "true"
               },
               "default": {
                  "id": "cof_card_ready",
                  "type": "SET",
                  "variable": "cof_noop",
                  "value": "true"
               }
            }
         },
         {
            "id": "confirm_charge",
            "type": "SAY-GET",
            "variable": "cof_charge_confirm",
            "value": "I'll charge {{amountToSpeech(cargo.pendingPaymentTotal, language, cargo.voice)}} to your {{cof_selected_card.cardType}} ending in {{cof_selected_card.cardNumber}}. Shall I proceed? {{cargo.verb}} YES or NO.\n{{cargo.verb}} BACK to go back. To exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
            "value_es": "Voy a cobrar {{amountToSpeech(cargo.pendingPaymentTotal, language, cargo.voice)}} a su {{cof_selected_card.cardType}} terminada en {{cof_selected_card.cardNumber}}. ¿Desea proceder? {{cargo.verb_es}} SÍ o NO.\n{{cargo.verb_es}} ATRÁS para volver. Para salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
         },
         {
            "id": "stringify_cof_payment_profile_id",
            "type": "SET",
            "variable": "cof_payment_profile_id_str",
            "value": "(cof_selected_card && cof_selected_card.paymentProfileId != null) ? (cof_selected_card.paymentProfileId + '') : ''"
         },
         {
            "id": "handle_charge_confirm",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(cof_charge_confirm.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_cof_confirm",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: ['1','one','uno','y','yes','yes please','yeah','yea','yep','yup','sure','ok','okay','okey','k','alright','all right','correct','confirm','confirmed','proceed','go ahead','do it','please do','absolutely','definitely','affirmative','sounds good','perfect','that is right','thats right','yes sir','yes maam','si','sí','si por favor','sí por favor','claro','claro que si','claro que sí','correcto','confirmo','confirmar','confirmado','proceder','adelante','dale','de acuerdo','esta bien','está bien','vale','por supuesto','exacto','asi es','así es','hagalo','hágalo','perfecto'].indexOf(cof_charge_confirm.trim().toLowerCase().replace(/^[¡¿ ]+|[ .,!?;:]+$/g, '')) > -1": {
                  "id": "process_charge",
                  "type": "CALL-TOOL",
                  "tool": "charge-payment-profile",
                  "variable": "cof_charge_result",
                  "args": {
                     "accountNumber": "{{cargo.accountNumber}}",
                     "paymentProfileId": "{{cof_payment_profile_id_str}}",
                     "fee": 0,
                     "payments": "{{cargo.pendingPayments}}"
                  },
                  "onFail": {
                     "id": "charge_tool_failed",
                     "type": "FLOW",
                     "value": "direct-payment-failed",
                     "callType": "replace",
                     "parameters": {
                        "dp_error_code": "CHARGE_FAILED",
                        "dp_error_message": "Sorry, the payment could not be processed. Would you like to try again or receive a payment link instead?",
                        "dp_error_message_es": "Lo siento, no se pudo procesar el pago. ¿Le gustaría intentar de nuevo o recibir un enlace de pago?"
                     }
                  }
               },
               "default": {
                  "id": "charge_cancelled",
                  "type": "FLOW",
                  "value": "process-payment-direct",
                  "callType": "replace"
               }
            }
         },
         {
            "id": "cof_extract_trans_id",
            "type": "SET",
            "variable": "cof_trans_id_str",
            "value": "(cof_charge_result && cof_charge_result.data && cof_charge_result.data.TransId != null) ? (cof_charge_result.data.TransId + '') : ''"
         },
         {
            "id": "check_charge_result",
            "type": "CASE",
            "branches": {
               "condition: cof_charge_result && cof_charge_result.success": {
                  "id": "goto_success",
                  "type": "FLOW",
                  "value": "direct-payment-success",
                  "callType": "call",
                  "parameters": {
                     "dp_trans_id": "{{cof_trans_id_str}}"
                  }
               },
               "default": {
                  "id": "goto_failure",
                  "type": "FLOW",
                  "value": "direct-payment-failed",
                  "callType": "replace",
                  "parameters": {
                     "dp_error_code": "{{cof_charge_result ? cof_charge_result.code : 'UNKNOWN'}}",
                     "dp_error_message": "{{cof_charge_result && cof_charge_result.message ? cof_charge_result.message : 'The payment could not be processed.'}}",
                     "dp_error_message_es": "No se pudo procesar el pago."
                  }
               }
            }
         }
      ]
   },
   {
      "id": "pay-with-recent-card",
      "name": "PayWithRecentCard",
      "version": "1.0.0",
      "description": "Charge the customer's most-recently-used non-expired card (cargo.epoCard) for the pre-built cargo.pendingPayments total. Asks for a final yes/no confirmation, then calls charge-payment-profile. Mirrors the confirm-and-charge tail of pay-with-card-on-file, but skips card selection since the card is already chosen.",
      "variables": {
         "prc_confirm": {
            "type": "string",
            "description": "User confirmation before charging",
            "value": ""
         },
         "prc_charge_result": {
            "type": "object",
            "description": "Result from charge-payment-profile tool"
         }
      },
      "steps": [
         {
            "id": "prc_confirm_charge",
            "type": "SAY-GET",
            "variable": "prc_confirm",
            "value": "I'll charge {{amountToSpeech(cargo.pendingPaymentTotal, language, cargo.voice)}} to your {{cargo.epoCard.cardType}} ending in {{cargo.voice ? cargo.epoCard.cardNumber.split('').join(' ') : cargo.epoCard.cardNumber}}. Shall I proceed? {{cargo.verb}} YES or NO.\n{{cargo.verb}} BACK to go back. To exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
            "value_es": "Voy a cobrar {{amountToSpeech(cargo.pendingPaymentTotal, language, cargo.voice)}} a su {{cargo.epoCard.cardType}} terminada en {{cargo.voice ? cargo.epoCard.cardNumber.split('').join(' ') : cargo.epoCard.cardNumber}}. ¿Desea proceder? {{cargo.verb_es}} SÍ o NO.\n{{cargo.verb_es}} ATRÁS para volver. Para salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
         },
         {
            "id": "stringify_prc_payment_profile_id",
            "type": "SET",
            "variable": "prc_payment_profile_id_str",
            "value": "(cargo.epoCard && cargo.epoCard.paymentProfileId != null) ? (cargo.epoCard.paymentProfileId + '') : ''"
         },
         {
            "id": "prc_handle_confirm",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(prc_confirm.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "prc_route_live_agent",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: matchesChoice(prc_confirm.toLowerCase().trim(), ['back', 'atrás', 'atras', 'volver'])": {
                  "id": "prc_go_back",
                  "type": "FLOW",
                  "value": "process-payment-direct",
                  "callType": "replace"
               },
               "condition: /^(exit|quit|salir|abort|\\*)$/i.test(prc_confirm.trim())": {
                  "id": "prc_exit",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "payment",
                     "support_context_es": "pago"
                  }
               },
               "condition: ['1','one','uno','y','yes','yes please','yeah','yea','yep','yup','sure','ok','okay','okey','k','alright','all right','correct','confirm','confirmed','proceed','go ahead','do it','please do','absolutely','definitely','affirmative','sounds good','perfect','that is right','thats right','yes sir','yes maam','si','sí','si por favor','sí por favor','claro','claro que si','claro que sí','correcto','confirmo','confirmar','confirmado','proceder','adelante','dale','de acuerdo','esta bien','está bien','vale','por supuesto','exacto','asi es','así es','hagalo','hágalo','perfecto'].indexOf(prc_confirm.trim().toLowerCase().replace(/^[¡¿ ]+|[ .,!?;:]+$/g, '')) > -1": {
                  "id": "prc_process_charge",
                  "type": "CALL-TOOL",
                  "tool": "charge-payment-profile",
                  "variable": "prc_charge_result",
                  "args": {
                     "accountNumber": "{{cargo.accountNumber}}",
                     "paymentProfileId": "{{prc_payment_profile_id_str}}",
                     "fee": 0,
                     "payments": "{{cargo.pendingPayments}}"
                  },
                  "onFail": {
                     "id": "prc_charge_tool_failed",
                     "type": "FLOW",
                     "value": "direct-payment-failed",
                     "callType": "replace",
                     "parameters": {
                        "dp_error_code": "CHARGE_FAILED",
                        "dp_error_message": "Sorry, the payment could not be processed. Would you like to try again or receive a payment link instead?",
                        "dp_error_message_es": "Lo siento, no se pudo procesar el pago. ¿Le gustaría intentar de nuevo o recibir un enlace de pago?"
                     }
                  }
               },
               "default": {
                  "id": "prc_charge_cancelled",
                  "type": "FLOW",
                  "value": "process-payment-direct",
                  "callType": "replace"
               }
            }
         },
         {
            "id": "prc_extract_trans_id",
            "type": "SET",
            "variable": "prc_trans_id_str",
            "value": "(prc_charge_result && prc_charge_result.data && prc_charge_result.data.TransId != null) ? (prc_charge_result.data.TransId + '') : ''"
         },
         {
            "id": "prc_check_charge_result",
            "type": "CASE",
            "branches": {
               "condition: prc_charge_result && prc_charge_result.success": {
                  "id": "prc_goto_success",
                  "type": "FLOW",
                  "value": "direct-payment-success",
                  "callType": "call",
                  "parameters": {
                     "dp_trans_id": "{{prc_trans_id_str}}"
                  }
               },
               "default": {
                  "id": "prc_goto_failure",
                  "type": "FLOW",
                  "value": "direct-payment-failed",
                  "callType": "replace",
                  "parameters": {
                     "dp_error_code": "{{prc_charge_result ? prc_charge_result.code : 'UNKNOWN'}}",
                     "dp_error_message": "{{prc_charge_result && prc_charge_result.message ? prc_charge_result.message : 'The payment could not be processed.'}}",
                     "dp_error_message_es": "No se pudo procesar el pago."
                  }
               }
            }
         }
      ]
   },
   {
      "id": "pay-with-new-card",
      "name": "PayWithNewCard",
      "version": "1.0.0",
      "description": "Collect new card details and process payment",
      "variables": {
         "nc_card_number": {
            "type": "string",
            "description": "Card number",
            "value": ""
         },
         "nc_exp_month": {
            "type": "string",
            "description": "Expiration month",
            "value": ""
         },
         "nc_exp_year": {
            "type": "string",
            "description": "Expiration year",
            "value": ""
         },
         "nc_cvv": {
            "type": "string",
            "description": "CVV security code",
            "value": ""
         },
         "nc_zip": {
            "type": "string",
            "description": "Billing zip code",
            "value": ""
         },
         "nc_save_card": {
            "type": "string",
            "description": "Whether to save card",
            "value": ""
         },
         "nc_charge_confirm": {
            "type": "string",
            "description": "User confirmation before charging",
            "value": ""
         },
         "nc_charge_result": {
            "type": "object",
            "description": "Result from charge-new-card tool"
         },
         "nc_intro_error": {
            "type": "string",
            "description": "Optional error message spoken before restarting card collection",
            "value": ""
         },
         "nc_intro_error_es": {
            "type": "string",
            "description": "Optional Spanish error message spoken before restarting card collection",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "ask_card_number",
            "type": "SAY-GET",
            "variable": "nc_card_number",
            "value": "{{nc_intro_error ? nc_intro_error + ' We will start over. ' : ''}}Please {{cargo.verb}} your card number. {{cargo.verb}} BACK to go back or EXIT to cancel at any time.",
            "value_es": "{{nc_intro_error_es ? nc_intro_error_es + ' Comencemos de nuevo. ' : ''}}Por favor {{cargo.verb_es}} su número de tarjeta. {{cargo.verb_es}} ATRÁS para volver o SALIR para cancelar en cualquier momento.",
            "digits": {
               "min": 13,
               "max": 19,
               "autoSubmitMs": 4500
            }
         },
         {
            "id": "check_card_back_exit",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(nc_card_number.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_nc_card",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: matchesChoice(nc_card_number.trim().toLowerCase(), ['link', 'enlace', 'text', 'texto', 'sms', 'mensaje'])": {
                  "id": "card_switch_to_link",
                  "type": "FLOW",
                  "value": "generate-and-validate-payment-link",
                  "callType": "replace"
               },
               "condition: matchesChoice(nc_card_number.trim().toLowerCase(), ['back', 'atrás', 'atras', 'volver'])": {
                  "id": "card_go_back",
                  "type": "FLOW",
                  "value": "process-payment-direct",
                  "callType": "replace"
               },
               "condition: matchesChoice(nc_card_number.trim().toLowerCase(), ['exit', 'quit', 'salir', 'abort', 'cancel'])": {
                  "id": "card_exit",
                  "type": "FLOW",
                  "value": "contact-support-with-context",
                  "callType": "reboot",
                  "parameters": {
                     "support_context": "payment",
                     "support_context_es": "pago"
                  }
               },
               "default": {
                  "id": "clean_card_number",
                  "type": "SET",
                  "variable": "nc_card_number",
                  "value": "nc_card_number.replace(/[^0-9]/g, '')"
               }
            }
         },
         {
            "id": "validate_card_number",
            "type": "CASE",
            "branches": {
               "condition: validateCardNumber(nc_card_number)": {
                  "id": "card_number_ok",
                  "type": "SET",
                  "variable": "noop_card_number_ok",
                  "value": "true"
               },
               "default": {
                  "id": "reask_card_number",
                  "type": "SAY-GET",
                  "variable": "nc_card_number",
                  "value": "That doesn't appear to be a valid card number. Please {{cargo.verb}} the full card number, 13 to 19 digits.",
                  "value_es": "Ese no parece ser un número de tarjeta válido. Por favor {{cargo.verb_es}} el número de tarjeta completo, de 13 a 19 dígitos.",
                  "digits": {
                     "min": 13,
                     "max": 19,
                     "autoSubmitMs": 4500
                  }
               }
            }
         },
         {
            "id": "validate_card_number_retry",
            "type": "CASE",
            "branches": {
               "condition: validateCardNumber(nc_card_number.replace(/[^0-9]/g, ''))": {
                  "id": "card_number_retry_ok",
                  "type": "SET",
                  "variable": "nc_card_number",
                  "value": "nc_card_number.replace(/[^0-9]/g, '')"
               },
               "default": {
                  "id": "card_number_invalid",
                  "type": "FLOW",
                  "value": "pay-with-new-card",
                  "callType": "reboot",
                  "parameters": {
                     "nc_intro_error": "The card number entered is not valid.",
                     "nc_intro_error_es": "El número de tarjeta ingresado no es válido."
                  }
               }
            }
         },
         {
            "id": "ask_exp_month",
            "type": "SAY-GET",
            "variable": "nc_exp_month",
            "value": "Please {{cargo.verb}} the expiration month, two digits. You may also {{cargo.verb}} the month and year together as four digits.{{cargo.voice ? ' When entering on the keypad, press the pound key when you are done.' : ''}}",
            "value_es": "Por favor {{cargo.verb_es}} el mes de vencimiento, dos dígitos. También puede {{cargo.verb_es}} el mes y el año juntos como cuatro dígitos.{{cargo.voice ? ' Al ingresar con el teclado, presione la tecla numeral cuando termine.' : ''}}",
            "digits": {
               "min": 2,
               "max": 4,
               "autoSubmitMs": 2500
            }
         },
         {
            "id": "check_live_agent_exp_month",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(nc_exp_month.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_nc_exp_month",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: matchesChoice(nc_exp_month.trim().toLowerCase(), ['link', 'enlace', 'text', 'texto', 'sms', 'mensaje'])": {
                  "id": "exp_month_switch_to_link",
                  "type": "FLOW",
                  "value": "generate-and-validate-payment-link",
                  "callType": "replace"
               },
               "default": {
                  "id": "noop_continue_exp_month",
                  "type": "SET",
                  "variable": "noop_continue_exp_month",
                  "value": "true"
               }
            }
         },
         {
            "id": "clean_exp_month",
            "type": "SET",
            "variable": "nc_exp_month",
            "value": "(function() { var d = nc_exp_month.replace(/[^0-9]/g, ''); if (d.length === 4) { var mm = d.slice(0, 2); var yy = d.slice(2); if (parseInt(mm, 10) >= 1 && parseInt(mm, 10) <= 12) { cargo.mmyyYear = yy; return mm; } } cargo.mmyyYear = ''; return d.padStart(2, '0'); })()"
         },
         {
            "id": "validate_exp_month",
            "type": "CASE",
            "branches": {
               "condition: validateDigits(nc_exp_month, 2, 2) && parseInt(nc_exp_month, 10) >= 1 && parseInt(nc_exp_month, 10) <= 12": {
                  "id": "exp_month_ok",
                  "type": "SET",
                  "variable": "noop_exp_month_ok",
                  "value": "true"
               },
               "default": {
                  "id": "reask_exp_month",
                  "type": "SAY-GET",
                  "variable": "nc_exp_month",
                  "value": "That's not a valid month. Please {{cargo.verb}} the expiration month as two digits, 01 through 12.",
                  "value_es": "Ese no es un mes válido. Por favor {{cargo.verb_es}} el mes de vencimiento en dos dígitos, del 01 al 12.",
                  "digits": {
                     "min": 2,
                     "max": 2,
                     "autoSubmitMs": 2500
                  }
               }
            }
         },
         {
            "id": "validate_exp_month_retry",
            "type": "CASE",
            "branches": {
               "condition: validateDigits(nc_exp_month.replace(/[^0-9]/g, '').padStart(2, '0'), 2, 2) && parseInt(nc_exp_month.replace(/[^0-9]/g, ''), 10) >= 1 && parseInt(nc_exp_month.replace(/[^0-9]/g, ''), 10) <= 12": {
                  "id": "exp_month_retry_ok",
                  "type": "SET",
                  "variable": "nc_exp_month",
                  "value": "nc_exp_month.replace(/[^0-9]/g, '').padStart(2, '0')"
               },
               "default": {
                  "id": "exp_month_invalid",
                  "type": "FLOW",
                  "value": "pay-with-new-card",
                  "callType": "reboot",
                  "parameters": {
                     "nc_intro_error": "The expiration month entered is not valid.",
                     "nc_intro_error_es": "El mes de vencimiento ingresado no es válido."
                  }
               }
            }
         },
         {
            "id": "ask_exp_year",
            "type": "CASE",
            "branches": {
               "condition: cargo.mmyyYear && cargo.mmyyYear.length === 2": {
                  "id": "use_mmyy_year",
                  "type": "SET",
                  "variable": "nc_exp_year",
                  "value": "(function() { var yy = cargo.mmyyYear; cargo.mmyyYear = ''; return yy; })()"
               },
               "default": {
                  "id": "ask_exp_year_prompt",
                  "type": "SAY-GET",
                  "variable": "nc_exp_year",
                  "value": "Please {{cargo.verb}} the expiration year, two digits.{{cargo.voice ? ' When entering on the keypad, press the pound key when you are done.' : ''}}",
                  "value_es": "Por favor {{cargo.verb_es}} el año de vencimiento, dos dígitos.{{cargo.voice ? ' Al ingresar con el teclado, presione la tecla numeral cuando termine.' : ''}}",
                  "digits": {
                     "min": 2,
                     "max": 2,
                     "autoSubmitMs": 2500
                  }
               }
            }
         },
         {
            "id": "check_live_agent_exp_year",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(nc_exp_year.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_nc_exp_year",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: matchesChoice(nc_exp_year.trim().toLowerCase(), ['link', 'enlace', 'text', 'texto', 'sms', 'mensaje'])": {
                  "id": "exp_year_switch_to_link",
                  "type": "FLOW",
                  "value": "generate-and-validate-payment-link",
                  "callType": "replace"
               },
               "default": {
                  "id": "noop_continue_exp_year",
                  "type": "SET",
                  "variable": "noop_continue_exp_year",
                  "value": "true"
               }
            }
         },
         {
            "id": "clean_exp_year",
            "type": "SET",
            "variable": "nc_exp_year",
            "value": "nc_exp_year.replace(/[^0-9]/g, '').slice(-2)"
         },
         {
            "id": "validate_expiration",
            "type": "CASE",
            "branches": {
               "condition: validateExpiration(nc_exp_month, nc_exp_year)": {
                  "id": "expiration_ok",
                  "type": "SET",
                  "variable": "noop_expiration_ok",
                  "value": "true"
               },
               "default": {
                  "id": "reask_exp_year",
                  "type": "SAY-GET",
                  "variable": "nc_exp_year",
                  "value": "That doesn't appear to be a valid expiration date. Please {{cargo.verb}} the expiration year as two digits. For example, for 2030 {{cargo.verb}} 3 0.",
                  "value_es": "Esa no parece ser una fecha de vencimiento válida. Por favor {{cargo.verb_es}} el año de vencimiento en dos dígitos. Por ejemplo, para 2030 {{cargo.verb_es}} 3 0.",
                  "digits": {
                     "min": 2,
                     "max": 2,
                     "autoSubmitMs": 2500
                  }
               }
            }
         },
         {
            "id": "validate_expiration_retry",
            "type": "CASE",
            "branches": {
               "condition: validateExpiration(nc_exp_month, nc_exp_year.replace(/[^0-9]/g, '').slice(-2))": {
                  "id": "expiration_retry_ok",
                  "type": "SET",
                  "variable": "nc_exp_year",
                  "value": "nc_exp_year.replace(/[^0-9]/g, '').slice(-2)"
               },
               "default": {
                  "id": "expiration_invalid",
                  "type": "FLOW",
                  "value": "pay-with-new-card",
                  "callType": "reboot",
                  "parameters": {
                     "nc_intro_error": "The card expiration date entered is not valid.",
                     "nc_intro_error_es": "La fecha de vencimiento de la tarjeta no es válida."
                  }
               }
            }
         },
         {
            "id": "ask_cvv",
            "type": "SAY-GET",
            "variable": "nc_cvv",
            "value": "Please {{cargo.verb}} the C V V, the 3 or 4 digit security code on the back of your card.{{cargo.voice ? ' When entering on the keypad, press the pound key when you are done.' : ''}}",
            "value_es": "Por favor {{cargo.verb_es}} el C V V, el código de seguridad de 3 o 4 dígitos en el reverso de su tarjeta.{{cargo.voice ? ' Al ingresar con el teclado, presione la tecla numeral cuando termine.' : ''}}",
            "digits": {
               "min": 3,
               "max": 4,
               "autoSubmitMs": 2500
            }
         },
         {
            "id": "check_live_agent_cvv",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(nc_cvv.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_nc_cvv",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: matchesChoice(nc_cvv.trim().toLowerCase(), ['link', 'enlace', 'text', 'texto', 'sms', 'mensaje'])": {
                  "id": "cvv_switch_to_link",
                  "type": "FLOW",
                  "value": "generate-and-validate-payment-link",
                  "callType": "replace"
               },
               "default": {
                  "id": "noop_continue_cvv",
                  "type": "SET",
                  "variable": "noop_continue_cvv",
                  "value": "true"
               }
            }
         },
         {
            "id": "clean_cvv",
            "type": "SET",
            "variable": "nc_cvv",
            "value": "nc_cvv.replace(/[^0-9]/g, '')"
         },
         {
            "id": "validate_cvv",
            "type": "CASE",
            "branches": {
               "condition: validateDigits(nc_cvv, 3, 4)": {
                  "id": "cvv_ok",
                  "type": "SET",
                  "variable": "noop_cvv_ok",
                  "value": "true"
               },
               "default": {
                  "id": "reask_cvv",
                  "type": "SAY-GET",
                  "variable": "nc_cvv",
                  "value": "That's not a valid security code. Please {{cargo.verb}} the C V V, the 3 or 4 digit code on your card.",
                  "value_es": "Ese no es un código de seguridad válido. Por favor {{cargo.verb_es}} el C V V, el código de 3 o 4 dígitos de su tarjeta.",
                  "digits": {
                     "min": 3,
                     "max": 4,
                     "autoSubmitMs": 2500
                  }
               }
            }
         },
         {
            "id": "validate_cvv_retry",
            "type": "CASE",
            "branches": {
               "condition: validateDigits(nc_cvv.replace(/[^0-9]/g, ''), 3, 4)": {
                  "id": "cvv_retry_ok",
                  "type": "SET",
                  "variable": "nc_cvv",
                  "value": "nc_cvv.replace(/[^0-9]/g, '')"
               },
               "default": {
                  "id": "cvv_invalid",
                  "type": "FLOW",
                  "value": "pay-with-new-card",
                  "callType": "reboot",
                  "parameters": {
                     "nc_intro_error": "The security code entered is not valid.",
                     "nc_intro_error_es": "El código de seguridad ingresado no es válido."
                  }
               }
            }
         },
         {
            "id": "ask_zip",
            "type": "SAY-GET",
            "variable": "nc_zip",
            "value": "Please {{cargo.verb}} your billing zip code.{{cargo.voice ? ' When entering on the keypad, press the pound key when you are done.' : ''}}",
            "value_es": "Por favor {{cargo.verb_es}} su código postal de facturación.{{cargo.voice ? ' Al ingresar con el teclado, presione la tecla numeral cuando termine.' : ''}}",
            "digits": {
               "min": 5,
               "max": 5,
               "autoSubmitMs": 3500
            }
         },
         {
            "id": "check_live_agent_zip",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(nc_zip.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_nc_zip",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: matchesChoice(nc_zip.trim().toLowerCase(), ['link', 'enlace', 'text', 'texto', 'sms', 'mensaje'])": {
                  "id": "zip_switch_to_link",
                  "type": "FLOW",
                  "value": "generate-and-validate-payment-link",
                  "callType": "replace"
               },
               "default": {
                  "id": "noop_continue_zip",
                  "type": "SET",
                  "variable": "noop_continue_zip",
                  "value": "true"
               }
            }
         },
         {
            "id": "clean_zip",
            "type": "SET",
            "variable": "nc_zip",
            "value": "nc_zip.replace(/[^0-9]/g, '')"
         },
         {
            "id": "validate_nc_zip",
            "type": "CASE",
            "branches": {
               "condition: validateDigits(nc_zip, 5, 5)": {
                  "id": "nc_zip_ok",
                  "type": "SET",
                  "variable": "noop_nc_zip_ok",
                  "value": "true"
               },
               "default": {
                  "id": "reask_nc_zip",
                  "type": "SAY-GET",
                  "variable": "nc_zip",
                  "value": "The zip code must be exactly 5 digits. Please {{cargo.verb}} the billing zip code for this card. It must match the address on your card statement.",
                  "value_es": "El código postal debe tener exactamente 5 dígitos. Por favor {{cargo.verb_es}} el código postal de facturación de esta tarjeta. Debe coincidir con la dirección de su estado de cuenta.",
                  "digits": {
                     "min": 5,
                     "max": 5,
                     "autoSubmitMs": 3500
                  }
               }
            }
         },
         {
            "id": "validate_nc_zip_retry",
            "type": "CASE",
            "branches": {
               "condition: validateDigits(nc_zip.replace(/[^0-9]/g, ''), 5, 5)": {
                  "id": "nc_zip_retry_ok",
                  "type": "SET",
                  "variable": "nc_zip",
                  "value": "nc_zip.replace(/[^0-9]/g, '')"
               },
               "default": {
                  "id": "nc_zip_invalid",
                  "type": "FLOW",
                  "value": "pay-with-new-card",
                  "callType": "reboot",
                  "parameters": {
                     "nc_intro_error": "The billing zip code entered is not valid.",
                     "nc_intro_error_es": "El código postal de facturación no es válido."
                  }
               }
            }
         },
         {
            "id": "ask_save_card",
            "type": "SAY-GET",
            "variable": "nc_save_card",
            "value": "Would you like to save this card for future payments? {{cargo.verb}} YES or NO.",
            "value_es": "¿Le gustaría guardar esta tarjeta para futuros pagos? {{cargo.verb_es}} SÍ o NO."
         },
         {
            "id": "check_live_agent_save_card",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice((nc_save_card || '').toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_nc_save_card",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "default": {
                  "id": "noop_continue_save_card",
                  "type": "SET",
                  "variable": "noop_continue_save_card",
                  "value": "true"
               }
            }
         },
         {
            "id": "compute_save_card",
            "type": "SET",
            "variable": "nc_save_card_bool",
            "value": "matchesChoice((nc_save_card || '').trim().toLowerCase(), ['yes', '1', 'si', 'sí'])"
         },
         {
            "id": "build_card_object",
            "type": "SET",
            "variable": "nc_card_object",
            "value": "({ cardNumber: nc_card_number, expirationMonth: nc_exp_month, expirationYear: nc_exp_year, cvv: nc_cvv, zip: nc_zip })"
         },
         {
            "id": "confirm_charge",
            "type": "SAY-GET",
            "variable": "nc_charge_confirm",
            "value": "I'll charge {{amountToSpeech(cargo.pendingPaymentTotal, language, cargo.voice)}} to the card ending in {{nc_card_number.slice(-4)}}. Shall I proceed? {{cargo.verb}} YES or NO.\n{{cargo.verb}} BACK to go back. To exit {{cargo.voice ? 'press the star key or ' : ''}}{{cargo.verb}} EXIT.",
            "value_es": "Voy a cobrar {{amountToSpeech(cargo.pendingPaymentTotal, language, cargo.voice)}} a la tarjeta terminada en {{nc_card_number.slice(-4)}}. ¿Desea proceder? {{cargo.verb_es}} SÍ o NO.\n{{cargo.verb_es}} ATRÁS para volver. Para salir {{cargo.voice ? 'presione la tecla de estrella o ' : ''}}{{cargo.verb_es}} SALIR."
         },
         {
            "id": "handle_charge_confirm",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(nc_charge_confirm.toLowerCase().trim(), ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person'])": {
                  "id": "route_live_agent_nc_confirm",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: ['1','one','uno','y','yes','yes please','yeah','yea','yep','yup','sure','ok','okay','okey','k','alright','all right','correct','confirm','confirmed','proceed','go ahead','do it','please do','absolutely','definitely','affirmative','sounds good','perfect','that is right','thats right','yes sir','yes maam','si','sí','si por favor','sí por favor','claro','claro que si','claro que sí','correcto','confirmo','confirmar','confirmado','proceder','adelante','dale','de acuerdo','esta bien','está bien','vale','por supuesto','exacto','asi es','así es','hagalo','hágalo','perfecto'].indexOf(nc_charge_confirm.trim().toLowerCase().replace(/^[¡¿ ]+|[ .,!?;:]+$/g, '')) > -1": {
                  "id": "process_new_card_charge",
                  "type": "CALL-TOOL",
                  "tool": "charge-new-card",
                  "variable": "nc_charge_result",
                  "args": {
                     "accountNumber": "{{cargo.accountNumber}}",
                     "saveCard": "{{nc_save_card_bool}}",
                     "card": "{{nc_card_object}}",
                     "fee": 0,
                     "payments": "{{cargo.pendingPayments}}"
                  },
                  "onFail": {
                     "id": "new_card_charge_tool_failed",
                     "type": "FLOW",
                     "value": "direct-payment-failed",
                     "callType": "replace",
                     "parameters": {
                        "dp_error_code": "CHARGE_FAILED",
                        "dp_error_message": "Sorry, the payment could not be processed. Would you like to try again or receive a payment link instead?",
                        "dp_error_message_es": "Lo siento, no se pudo procesar el pago. ¿Le gustaría intentar de nuevo o recibir un enlace de pago?"
                     }
                  }
               },
               "default": {
                  "id": "new_card_charge_cancelled",
                  "type": "FLOW",
                  "value": "process-payment-direct",
                  "callType": "replace"
               }
            }
         },
         {
            "id": "nc_extract_trans_id",
            "type": "SET",
            "variable": "nc_trans_id_str",
            "value": "(nc_charge_result && nc_charge_result.data && nc_charge_result.data.TransId != null) ? (nc_charge_result.data.TransId + '') : ''"
         },
         {
            "id": "check_new_card_result",
            "type": "CASE",
            "branches": {
               "condition: nc_charge_result && nc_charge_result.success": {
                  "id": "goto_success",
                  "type": "FLOW",
                  "value": "direct-payment-success",
                  "callType": "call",
                  "parameters": {
                     "dp_trans_id": "{{nc_trans_id_str}}"
                  }
               },
               "default": {
                  "id": "goto_failure",
                  "type": "FLOW",
                  "value": "direct-payment-failed",
                  "callType": "replace",
                  "parameters": {
                     "dp_error_code": "{{nc_charge_result ? nc_charge_result.code : 'UNKNOWN'}}",
                     "dp_error_message": "{{nc_charge_result && nc_charge_result.message ? nc_charge_result.message : 'The payment could not be processed.'}}",
                     "dp_error_message_es": "No se pudo procesar el pago."
                  }
               }
            }
         }
      ]
   },
   {
      "id": "direct-payment-success",
      "name": "DirectPaymentSuccess",
      "version": "1.1.0",
      "description": "Handle successful direct payment. Speaks back the confirmation/transaction number returned by the charge API, then asks whether the customer needs anything else so the call doesn't go silent after the success message.",
      "parameters": [
         {
            "name": "dp_trans_id",
            "type": "string",
            "description": "Transaction ID / confirmation number returned by the charge API. May be empty if the upstream did not surface one — the success message degrades gracefully in that case."
         }
      ],
      "variables": {
         "dps_next_choice": {
            "type": "string",
            "description": "Customer's response to the anything-else follow-up",
            "value": ""
         }
      },
      "steps": [
         {
            "id": "announce_success",
            "type": "SAY",
            "value": "Your payment of {{amountToSpeech(cargo.pendingPaymentTotal, 'en', cargo.voice)}} has been processed successfully.{{dp_trans_id ? (' Your confirmation number is ' + (cargo.voice ? String(dp_trans_id).split('').join(' ') : String(dp_trans_id)) + '.') : ''}}",
            "value_es": "Su pago de {{amountToSpeech(cargo.pendingPaymentTotal, 'es', cargo.voice)}} se ha procesado exitosamente.{{dp_trans_id ? (' Su número de confirmación es ' + (cargo.voice ? String(dp_trans_id).split('').join(' ') : String(dp_trans_id)) + '.') : ''}}"
         },
         {
            "id": "clear_payment_state_after_success",
            "type": "SET",
            "variable": "clear_payment_state_side_effect",
            "value": "(function() { cargo.lastPaymentReceipt = { amount: cargo.pendingPaymentTotal, confirmation: (typeof dp_trans_id !== 'undefined' && dp_trans_id) ? String(dp_trans_id) : '', account: String(cargo.accountNumber || '').slice(-4), date: new Date().toISOString().slice(0, 10) }; cargo.selectedSubAccount = null; cargo.sp_payments = []; cargo.pendingPayments = []; cargo.pendingPaymentTotal = '0'; cargo.paymentAmountError = ''; cargo.pm_attempts = 0; return true; })()"
         },
         {
            "id": "ask_anything_else",
            "type": "SAY-GET",
            "variable": "dps_next_choice",
            "value": "Is there anything else I can help you with?{{cargo.callerId ? ' For a text receipt of this payment, ' + cargo.verb + ' RECEIPT.' : ''}}",
            "value_es": "¿Hay algo más en lo que pueda ayudarle?{{cargo.callerId ? ' Para un recibo de este pago por texto, ' + cargo.verb_es + ' RECIBO.' : ''}}",
            "autoSubmitMs": 8000
         },
         {
            "id": "handle_next_choice",
            "type": "SET",
            "variable": "dps_next_choice",
            "value": "(dps_next_choice || '').toString().trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '').trim()"
         },
         {
            "id": "route_next_choice",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(dps_next_choice, ['receipt', 'recibo', 'comprobante'])": {
                  "id": "goto_send_receipt",
                  "type": "FLOW",
                  "value": "send-payment-receipt",
                  "callType": "replace"
               },
               "condition: ['no', 'nope', 'nada', 'thanks', 'gracias', 'thats all', 'eso es todo', 'goodbye', 'bye', 'adios', 'adiós', 'exit', 'salir', 'quit'].some(function(c) { return dps_next_choice === c; })": {
                  "id": "say_goodbye",
                  "type": "RETURN",
                  "value": "language === 'es' ? '¡Gracias por su pago! Que tenga un excelente día.' : 'Thanks for your payment! Have a great day.'"
               },
               "default": {
                  "id": "forward_unrecognized_prompt_to_ai",
                  "type": "RETURN",
                  "value": "''"
               }
            }
         }
      ]
   },
   {
      "id": "send-payment-receipt",
      "name": "SendPaymentReceipt",
      "version": "1.0.0",
      "description": "Texts the customer a receipt for the most recent successful payment in this conversation.",
      "variables": {
         "receipt_sms_result": {
            "type": "object",
            "description": "Result of the receipt SMS send"
         }
      },
      "steps": [
         {
            "id": "check_receipt_available",
            "type": "CASE",
            "branches": {
               "condition: !cargo.lastPaymentReceipt": {
                  "id": "no_receipt_data",
                  "type": "RETURN",
                  "value": "language === 'es' ? 'No tengo un pago reciente registrado en esta conversación.' : 'I do not have a recent payment on record for this conversation.'"
               },
               "condition: !cargo.callerId": {
                  "id": "no_receipt_destination",
                  "type": "RETURN",
                  "value": "language === 'es' ? 'No puedo enviar mensajes de texto en esta conversación, pero su número de confirmación es ' + (cargo.lastPaymentReceipt.confirmation || 'no disponible') + '.' : 'I am not able to send texts in this conversation, but your confirmation number is ' + (cargo.lastPaymentReceipt.confirmation || 'not available') + '.'"
               },
               "default": {
                  "id": "noop_receipt_ok",
                  "type": "SET",
                  "variable": "noop_receipt_ok",
                  "value": "true"
               }
            }
         },
         {
            "id": "send_receipt_sms",
            "type": "CALL-TOOL",
            "tool": "send-twilio-sms",
            "variable": "receipt_sms_result",
            "args": {
               "accountSid": "...",
               "from": "{{cargo.twilioNumber}}",
               "to": "{{cargo.callerId}}",
               "message": "Curacao Payment Receipt\nAccount ending: {{cargo.lastPaymentReceipt.account}}\nAmount: ${{cargo.lastPaymentReceipt.amount}}\nConfirmation: {{cargo.lastPaymentReceipt.confirmation || 'N/A'}}\nDate: {{cargo.lastPaymentReceipt.date}}\nThank you for your payment!"
            }
         },
         {
            "id": "confirm_receipt_sent",
            "type": "CASE",
            "branches": {
               "condition: typeof receipt_sms_result !== 'undefined' && receipt_sms_result": {
                  "id": "receipt_sent_msg",
                  "type": "SAY",
                  "value": "Done! I texted your receipt to the number ending in {{String(cargo.callerId || '').slice(-4)}}. Is there anything else I can help you with?",
                  "value_es": "¡Listo! Le envié su recibo por texto al número que termina en {{String(cargo.callerId || '').slice(-4)}}. ¿Hay algo más en lo que pueda ayudarle?"
               },
               "default": {
                  "id": "receipt_send_failed_msg",
                  "type": "SAY",
                  "value": "Sorry, I was not able to send the receipt right now. Your confirmation number is {{cargo.lastPaymentReceipt.confirmation || 'not available'}}.",
                  "value_es": "Lo siento, no pude enviar el recibo en este momento. Su número de confirmación es {{cargo.lastPaymentReceipt.confirmation || 'no disponible'}}.",
                  "outcome": "unresolved",
                  "reason": "receipt_sms_send_failed"
               }
            }
         }
      ]
   },
   {
      "id": "direct-payment-failed",
      "name": "DirectPaymentFailed",
      "version": "1.0.0",
      "description": "Handle failed direct payment with error mapping and retry options",
      "parameters": [
         {
            "name": "dp_error_code",
            "type": "string",
            "description": "Error code from the charge API"
         },
         {
            "name": "dp_error_message",
            "type": "string",
            "description": "Error message to display"
         },
         {
            "name": "dp_error_message_es",
            "type": "string",
            "description": "Error message in Spanish"
         }
      ],
      "variables": {
         "dp_user_friendly_message": {
            "type": "string",
            "description": "Mapped user-friendly error message",
            "value": ""
         },
         "dp_retry_choice": {
            "type": "string",
            "description": "User choice to retry or get payment link",
            "value": ""
         },
         "dp_is_avs_mismatch": {
            "type": "boolean",
            "description": "Whether the charge failure was an AVS decline (upstream code 27 — billing ZIP/address mismatch)",
            "value": false
         }
      },
      "steps": [
         {
            "id": "increment_retry_count",
            "type": "SET",
            "variable": "increment_side_effect",
            "value": "cargo.dp_retry_count = (cargo.dp_retry_count || 0) + 1"
         },
         {
            "id": "detect_avs_mismatch",
            "type": "SET",
            "variable": "dp_is_avs_mismatch",
            "value": "(function() { var txt = ((dp_error_code || '') + ' ' + (dp_error_message || '')).toLowerCase(); return txt.indexOf('avs') > -1 || txt.indexOf('code:27') > -1 || txt.indexOf('code: 27') > -1; })()"
         },
         {
            "id": "map_error_message",
            "type": "SET",
            "variable": "dp_user_friendly_message",
            "value": "(function() { if (dp_is_avs_mismatch) return language === 'es' ? 'El código postal asociado a su tarjeta no coincide con el que su banco tiene registrado.' : 'The ZIP code associated with your card does not match the one your bank has on file.'; var code = dp_error_code || ''; var errors = { 'PA94': 'The card information is invalid. Please verify your card details.', 'PA99': 'A payment processing error occurred. Please try again.', 'PA96': 'Unable to retrieve your payment profile. Please try again.', 'PA92': 'Unable to process the payment. Please try again.', 'PV72': 'The payment amount is greater than the payoff amount.', 'PV88': 'The payment amount cannot be zero.', 'PV87': 'The payment amount cannot be zero.', 'PV74': 'The card payment could not be processed. Please verify your card details.', 'PV77': 'The card information could not be validated. Please check your card number, expiration date, and C V V.', 'PV94': 'The sub account selected does not exist.', 'PV73': 'A duplicate payment was detected. Please wait and try again.', 'PV97': 'There was an issue with the sub account data. Please try again.' }; var errorsEs = { 'PA94': 'La información de la tarjeta no es válida. Por favor verifique los datos.', 'PA99': 'Ocurrió un error de procesamiento. Por favor intente de nuevo.', 'PA96': 'No se pudo obtener su perfil de pago. Por favor intente de nuevo.', 'PA92': 'No se pudo procesar el pago. Por favor intente de nuevo.', 'PV72': 'El monto del pago es mayor al saldo de la cuenta.', 'PV88': 'El monto del pago no puede ser cero.', 'PV87': 'El monto del pago no puede ser cero.', 'PV74': 'No se pudo procesar el pago con tarjeta. Por favor verifique los datos.', 'PV77': 'No se pudieron validar los datos de la tarjeta. Por favor verifique el número, fecha de vencimiento y C V V.', 'PV94': 'La subcuenta seleccionada no existe.', 'PV73': 'Se detectó un pago duplicado. Por favor espere e intente de nuevo.', 'PV97': 'Hubo un problema con los datos de la subcuenta. Por favor intente de nuevo.' }; for (var key in errors) { if (code.includes(key)) return language === 'es' ? errorsEs[key] : errors[key]; } if (code.includes('INVALID_AMOUNT') || code.includes('ZERO_DUE')) return language === 'es' ? (dp_error_message_es || 'Monto no válido.') : (dp_error_message || 'Invalid amount.'); return language === 'es' ? (dp_error_message_es || 'No se pudo procesar el pago.') : (dp_error_message || 'The payment could not be processed.'); })()"
         },
         {
            "id": "show_error_and_offer_retry",
            "type": "CASE",
            "branches": {
               "condition: dp_is_avs_mismatch && cargo.dp_retry_count < 2": {
                  "id": "show_avs_mismatch_offer",
                  "type": "SAY-GET",
                  "variable": "dp_retry_choice",
                  "value": "The ZIP code associated with your saved card doesn't match the one your bank has on file.\nWould you like to update your card information and try again?\n{{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} YES to update your card and try again\n{{cargo.voice ? 'Press 2 or ' : ''}}{{cargo.verb}} LINK for a payment link\n{{cargo.agentPhoneNumber ? (cargo.voice ? 'Press 3 or ' : '') + cargo.verb + ' AGENT to speak with customer service\\n' : ''}}{{cargo.voice ? 'Press 4 or ' : ''}}{{cargo.verb}} EXIT to cancel",
                  "value_es": "El código postal asociado a su tarjeta guardada no coincide con el que su banco tiene registrado.\n¿Le gustaría actualizar la información de su tarjeta e intentar de nuevo?\n{{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} SÍ para actualizar su tarjeta e intentar de nuevo\n{{cargo.voice ? 'Presione 2 o ' : ''}}{{cargo.verb_es}} ENLACE para un enlace de pago\n{{cargo.agentPhoneNumber ? (cargo.voice ? 'Presione 3 o ' : '') + cargo.verb_es + ' AGENTE para hablar con servicio al cliente\\n' : ''}}{{cargo.voice ? 'Presione 4 o ' : ''}}{{cargo.verb_es}} SALIR para cancelar",
                  "digits": { "min": 1, "max": 1 }
               },
               "condition: cargo.dp_retry_count >= 2": {
                  "id": "show_terminal_failure",
                  "type": "SAY-GET",
                  "variable": "dp_retry_choice",
                  "value": "{{dp_user_friendly_message}}\nWe've been unable to process your payment after 2 attempts. Please verify your card information is correct, or try again later. In the meantime, would you like me to send you a payment link by text{{cargo.agentPhoneNumber ? ', or connect you with customer service' : ''}}?\n{{cargo.voice ? 'Press 2 or ' : ''}}{{cargo.verb}} LINK for a payment link\n{{cargo.agentPhoneNumber ? (cargo.voice ? 'Press 3 or ' : '') + cargo.verb + ' AGENT to speak with customer service\\n' : ''}}{{cargo.voice ? 'Press 4 or ' : ''}}{{cargo.verb}} EXIT to cancel",
                  "value_es": "{{dp_user_friendly_message}}\nNo hemos podido procesar su pago después de 2 intentos. Por favor verifique que la información de su tarjeta sea correcta, o intente más tarde. Mientras tanto, ¿le gustaría que le envíe un enlace de pago por mensaje de texto{{cargo.agentPhoneNumber ? ', o conectarle con servicio al cliente' : ''}}?\n{{cargo.voice ? 'Presione 2 o ' : ''}}{{cargo.verb_es}} ENLACE para un enlace de pago\n{{cargo.agentPhoneNumber ? (cargo.voice ? 'Presione 3 o ' : '') + cargo.verb_es + ' AGENTE para hablar con servicio al cliente\\n' : ''}}{{cargo.voice ? 'Presione 4 o ' : ''}}{{cargo.verb_es}} SALIR para cancelar",
                  "digits": { "min": 1, "max": 1 }
               },
               "default": {
                  "id": "show_under_limit_offer",
                  "type": "SAY-GET",
                  "variable": "dp_retry_choice",
                  "value": "{{dp_user_friendly_message}}\nWould you like to try again with a different card{{cargo.agentPhoneNumber ? ', receive a payment link by text, or speak with customer service' : ', or receive a payment link by text'}}?\n{{cargo.voice ? 'Press 1 or ' : ''}}{{cargo.verb}} CARD to try a different card\n{{cargo.voice ? 'Press 2 or ' : ''}}{{cargo.verb}} LINK for a payment link\n{{cargo.agentPhoneNumber ? (cargo.voice ? 'Press 3 or ' : '') + cargo.verb + ' AGENT to speak with customer service\\n' : ''}}{{cargo.voice ? 'Press 4 or ' : ''}}{{cargo.verb}} EXIT to cancel",
                  "value_es": "{{dp_user_friendly_message}}\n¿Le gustaría intentar de nuevo con una tarjeta diferente{{cargo.agentPhoneNumber ? ', recibir un enlace de pago por mensaje de texto, o hablar con servicio al cliente' : ', o recibir un enlace de pago por mensaje de texto'}}?\n{{cargo.voice ? 'Presione 1 o ' : ''}}{{cargo.verb_es}} TARJETA para intentar con otra tarjeta\n{{cargo.voice ? 'Presione 2 o ' : ''}}{{cargo.verb_es}} ENLACE para un enlace de pago\n{{cargo.agentPhoneNumber ? (cargo.voice ? 'Presione 3 o ' : '') + cargo.verb_es + ' AGENTE para hablar con servicio al cliente\\n' : ''}}{{cargo.voice ? 'Presione 4 o ' : ''}}{{cargo.verb_es}} SALIR para cancelar",
                  "digits": { "min": 1, "max": 1 }
               }
            }
         },
         {
            "id": "normalize_retry_choice",
            "type": "SET",
            "variable": "dp_retry_choice",
            "value": "(dp_retry_choice || '').trim().toLowerCase().replace(/[^\\w\\s\\*áéíóúüñ]+/g, '')"
         },
         {
            "id": "handle_retry_choice",
            "type": "CASE",
            "branches": {
               "condition: matchesChoice(dp_retry_choice, ['live agent','customer service','representative','representante','servicio al cliente','servidor','atención al cliente','atencion al cliente','agent please','human agent','speak with a person','talk to a person','hablar con un agente','hablar con una persona','hablar con alguien','real person','real human','live person','agent','agente','3'])": {
                  "id": "route_live_agent_dp_retry",
                  "type": "FLOW",
                  "value": "live-agent-requested",
                  "callType": "replace"
               },
               "condition: matchesChoice(dp_retry_choice, ['link', 'enlace', 'text', 'texto', 'sms', 'mensaje', '2'])": {
                  "id": "fallback_to_link",
                  "type": "FLOW",
                  "value": "generate-and-validate-payment-link",
                  "callType": "call"
               },
               "condition: matchesChoice(dp_retry_choice, ['no', 'nope', 'cancel', 'exit', 'quit', 'salir', 'cancelar', '*', '4'])": {
                  "id": "exit_with_payment_goodbye",
                  "type": "RETURN",
                  "value": "language === 'es' ? 'Está bien, me detendré aquí. Si desea intentar pagar más tarde o necesita ayuda, puede ' + cargo.verb_es + ' PAGO' + (cargo.agentPhoneNumber ? ' o ' + cargo.verb_es + ' AGENTE' : '') + ' en cualquier momento.' : 'Okay, I\\'ll stop here. If you\\'d like to try paying again later or need help, you can ' + cargo.verb + ' PAYMENT' + (cargo.agentPhoneNumber ? ' or ' + cargo.verb + ' AGENT' : '') + ' anytime.'"
               },
               "condition: dp_is_avs_mismatch && cargo.dp_retry_count < 2 && matchesChoice(dp_retry_choice, ['yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'sí', 'si', 'claro', 'update', 'actualizar', 'card', 'tarjeta', '1'])": {
                  "id": "avs_update_card_and_retry",
                  "type": "FLOW",
                  "value": "pay-with-new-card",
                  "callType": "replace"
               },
               "condition: cargo.dp_retry_count < 2 && matchesChoice(dp_retry_choice, ['retry', 'try again', 'again', 'reintentar', 'de nuevo', 'card', 'different card', 'new card', 'tarjeta', 'otra tarjeta', 'yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'sí', 'si', '1'])": {
                  "id": "retry_with_new_card",
                  "type": "FLOW",
                  "value": "pay-with-new-card",
                  "callType": "replace"
               },
               "condition: cargo.dp_retry_count >= 2 && matchesChoice(dp_retry_choice, ['retry', 'try again', 'again', 'reintentar', 'de nuevo', 'card', 'different card', 'new card', 'tarjeta', 'otra tarjeta', 'yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'sí', 'si', '1'])": {
                  "id": "limit_reached_default_to_link",
                  "type": "FLOW",
                  "value": "generate-and-validate-payment-link",
                  "callType": "call"
               },
               "default": {
                  "id": "abort_no_intent_forward_to_ai",
                  "type": "RETURN",
                  "value": "''"
               }
            }
         },
         {
            "id": "trigger_retry_if_set",
            "type": "CASE",
            "branches": {
               "condition: cargo.dp_retry_in_progress": {
                  "id": "reboot_process_payment",
                  "type": "FLOW",
                  "value": "process-payment-direct",
                  "callType": "reboot"
               },
               "default": {
                  "id": "noop_no_retry",
                  "type": "SET",
                  "variable": "noop_no_retry",
                  "value": "true"
               }
            }
         }
      ]
   },

   /* --- payment-arrangement (PRIMARY, AI hand-off) --- */
   {
      "id": "payment-arrangement",
      "name": "PaymentArrangement",
      "version": "1.0.0",
      "description": "Triggered when a customer asks about a payment arrangement, payment plan, settling a balance, financial hardship, extending or deferring a due date, or otherwise negotiating how or when they pay. These requests require human-style negotiation that the scripted flows cannot perform, so this flow intentionally has no steps other than a RETURN of an empty string to hand the conversation back to the general AI. Do NOT trigger this flow for: actually paying now via a payment link (use StartPayment), generic balance or due-date lookup (use LocateAccount), or payment troubleshooting such as 'payment declined' or 'won\\'t go through'.",
      "prompt": "Payment arrangement",
      "prompt_es": "Arreglo de pago",
      "primary": true,
      "steps": [
         {
            "id": "hand_off_to_general_ai",
            "type": "RETURN",
            "value": "''"
         }
      ]
   },

   /* --- product-issue (PRIMARY, AI hand-off) --- */
   {
      "id": "product-issue",
      "name": "ProductIssue",
      "version": "1.0.0",
      "description": "Triggered when a customer has a problem with a PRODUCT they purchased, or asks to exchange, replace, return, or repair one, or asks about the return window or warranty. This INCLUDES: a product that is defective, broken, damaged, or not working or performing as expected ('the air conditioner isn't cooling', 'no me está enfriando', 'el aire acondicionado no funciona', 'la lavadora se dañó', 'it stopped working', 'llegó dañado'); requests to exchange or swap a product for the same item or a different brand ('me lo pueden cambiar', 'quiero cambiar el producto', 'can I exchange it for another brand'); requests to return a product or asking about the return/exchange window ('puedo devolverlo', 'quiero hacer una devolución'); and warranty or repair questions ('garantía', 'is it under warranty', 'needs repair', 'servicio técnico'). These requests require judgment about policy, condition, and timing that the scripted flows cannot perform, so this flow intentionally has no steps other than a RETURN of an empty string to hand the conversation back to the general AI. This flow takes PRIORITY over CreateServiceCase: a product problem is NOT an 'Account Issue' and must never be filed as one. The word 'cambiar' / 'change' in reference to a PRODUCT means an exchange, NOT 'Change of Address' — only treat it as Change of Address when the customer is clearly referring to their mailing or home address. Do NOT trigger this flow for: a damaged, broken, or lost CREDIT CARD (use CreateServiceCase / Reissue Credit Card — a card is not a product); cancelling a scheduled delivery (use CreateServiceCase / Cancellation / Cancel Delivery); order, delivery, or shipment status questions such as 'where is my order' or 'when will it arrive'; price match requests; or billing questions about what a customer was charged.",
      "prompt": "Product issue",
      "prompt_es": "Problema con un producto",
      "primary": true,
      "steps": [
         {
            "id": "hand_off_to_general_ai",
            "type": "RETURN",
            "value": "''"
         }
      ]
   },

   /* --- money-transfer (PRIMARY, AI hand-off) --- */
   {
      "id": "money-transfer",
      "name": "MoneyTransfer",
      "version": "1.0.0",
      "description": "Triggered whenever a customer mentions Curacao Financial money transfers / remittances OR mentions sending, receiving, picking up, tracking, or having ANY problem with a transfer involving Mexico, Guatemala, El Salvador, Honduras, or Nicaragua. This INCLUDES problems where a transfer (envío, remesa, giro) hasn't arrived, the recipient cannot withdraw or pick up the money, the transfer is delayed, missing, lost, stuck, or not showing up at the destination — regardless of whether the customer phrases it as a 'missing payment', 'pago faltante', 'envío faltante', 'no llegó el dinero', or 'no pueden retirar el dinero'. Money-transfer takes PRIORITY over CreateServiceCase / Missing Payment whenever any of these five countries (Mexico, Guatemala, El Salvador, Honduras, Nicaragua) is mentioned in connection with sending money, a transfer, an envío, a remesa, or a giro. These requests require human-style guidance that the scripted flows cannot perform, so this flow intentionally has no steps other than a RETURN of an empty string to hand the conversation back to the general AI. Do NOT trigger this flow for: making a payment on a Curacao credit account (use StartPayment), account balance lookup on a Curacao credit account (use LocateAccount), or payment arrangements on a Curacao credit account (use PaymentArrangement).",
      "prompt": "Money transfer",
      "prompt_es": "Transferencia de dinero",
      "primary": true,
      "steps": [
         {
            "id": "hand_off_to_general_ai",
            "type": "RETURN",
            "value": "''"
         }
      ]
   },

   /* --- account-number (PRIMARY, AI hand-off) --- */
   {
      "id": "account-number",
      "name": "AccountNumber",
      "version": "1.0.0",
      "description": "Triggered when a customer asks for their Curacao store account number — e.g. 'what is my account number', 'cuál es mi número de cuenta', 'I don't know my account number', 'I need my account number', 'no sé mi número de cuenta'. This refers to the Curacao store/credit account number — NOT a Social Security number, tax ID, credit card number, or any government ID. This flow intentionally has no steps other than a RETURN of an empty string to hand the conversation back to the general AI, which knows how to look up or guide the customer to their account number. Do NOT trigger this flow for: making a payment (use StartPayment), account balance / available credit / payment-due inquiries (use LocateAccount), or reissuing a physical credit card (use CreateServiceCase / Reissue Credit Card). This flow takes priority over CreateServiceCase for plain account-number requests so they are not filed as a credit-card service case.",
      "prompt": "Account number",
      "prompt_es": "Número de cuenta",
      "primary": true,
      "steps": [
         {
            "id": "hand_off_to_general_ai",
            "type": "RETURN",
            "value": "''"
         }
      ]
   },

   /* --- account-pin-recovery (PRIMARY, AI hand-off) --- */
   {
      "id": "account-pin-recovery",
      "name": "AccountPinRecovery",
      "version": "1.0.0",
      "description": "Triggered when a customer asks about anything related to their account PIN — recovering, resetting, updating, changing, forgetting, or being locked out by an account PIN. This is NOT a payment-related request and is NOT a Missing Payment service case, even though the query may contain the word 'account'. This flow intentionally has no steps other than a RETURN of an empty string to hand the conversation back to the general AI so it can provide PIN-recovery guidance. Do NOT trigger this flow for: MyAccount portal login/username/password issues (use MyAccountHelp), payments (use StartPayment), or service cases.",
      "prompt": "Account PIN",
      "prompt_es": "PIN de cuenta",
      "primary": true,
      "steps": [
         {
            "id": "hand_off_to_general_ai",
            "type": "RETURN",
            "value": "''"
         }
      ]
   },

   /* --- cancel-credit-card (PRIMARY, AI hand-off) --- */
   {
      "id": "cancel-credit-card",
      "name": "CancelCreditCard",
      "version": "1.0.0",
      "description": "Triggered when a customer wants to CLOSE, cancel, terminate, or deactivate their Curacao credit card or Curacao credit account and does NOT want a replacement card — e.g. 'I want to close my credit account', 'cierre mi cuenta de crédito', 'cancel my credit line', 'I don't want the card anymore', 'ya no quiero la tarjeta', 'dar de baja mi tarjeta', 'deactivate my card permanently', 'stop my Curacao credit'. ALSO use this flow for a bare, ambiguous cancellation request such as 'I want to cancel my credit card' / 'quiero cancelar mi tarjeta de crédito' / 'cancel my card' where the customer gives no indication that they want a new card: the general AI can ask what they mean, whereas filing a card-reissue case for a customer who wanted to close their account is a wrong and hard-to-undo outcome. Closing a credit line requires balance review, retention handling, and account-closure judgment that the scripted flows cannot perform, so this flow intentionally has no steps other than a RETURN of an empty string to hand the conversation back to the general AI. Do NOT trigger this flow when the customer wants the current card cancelled ONLY so a new one can be issued ('cancel this card and send me a new one', 'cancel my card, I need a replacement'), or when the card is lost, stolen, damaged, lost in store, or never received — those are CreateServiceCase / Reissue Credit Card. Do NOT trigger this flow for: cancelling Cricket, Delivery, Verizon, Curacao Credit Shield, or Curacao Club (use CreateServiceCase / Cancellation); cancelling a scheduled delivery or an order (use CreateServiceCase / Cancellation / Cancel Delivery); reporting fraud or unauthorized charges (use CreateServiceCase / Fraud); making a payment (use StartPayment); or balance, available credit, and payment-due inquiries (use LocateAccount).",
      "prompt": "Cancel credit card",
      "prompt_es": "Cancelar tarjeta de crédito",
      "primary": true,
      "steps": [
         {
            "id": "hand_off_to_general_ai",
            "type": "RETURN",
            "value": "''"
         }
      ]
   },
   {
      "id": "validate-email-has-account",
      "name": "ValidateEmailHasAccount",
      "version": "1.0.0",
      "description": "Contact validator supplied to authenticate-user as its email_validator. Confirms a spoken/typed email resolves to a Curacao account BEFORE an OTP is emailed to it, so a mis-captured address is never mailed — that is what generates the SES bounces. Sets contact_valid, which authenticate-user gates the send on. multiple_records counts as VALID: duplicates prove the address is real and deliverable, and the caller (validate-otp-result-and-perform-account-lookup) already routes to disambiguate-account-lookup to ask for more identification — rejecting here would break a path that works. Not a user-facing flow: it is never selected by intent detection, only called by name. MUST NOT use RETURN — that terminates every flow on the stack, not just this one; ending by completion is what returns control to the caller.",
      "parameters": [
         {
            "name": "email",
            "type": "string",
            "description": "Address to verify before an OTP is sent to it"
         }
      ],
      "variables": {
         "email_validation_lookup": {
            "type": "object",
            "description": "Raw lookup-account result; only its success flag is consulted here"
         }
      },
      "steps": [
         {
            "id": "lookup_account_by_email",
            "type": "CALL-TOOL",
            "tool": "lookup-account",
            "variable": "email_validation_lookup",
            "args": {
               "email": "{{email}}",
               "phone_number": ""
            },
            "onFail": {
               "id": "email_lookup_unavailable",
               "type": "SET",
               "variable": "email_validation_lookup",
               "value": "null"
            }
         },
         {
            "id": "set_contact_valid_from_lookup",
            "type": "SET",
            "variable": "contact_valid",
            "value": "!!(email_validation_lookup && (email_validation_lookup.success || email_validation_lookup.multiple_records))"
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
      const systemFlows = JSON.parse(fs.readFileSync('./system.flows.dev.json', 'utf8'));
      const systemTools = JSON.parse(fs.readFileSync('./system.tools.dev.json', 'utf8'));

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
      if (fs.existsSync('./shopify.flows.dev.json') && fs.existsSync('./shopify.tools.dev.json')) {
         console.log('Loading Shopify flows and tools...');
         const shopifyFlows = JSON.parse(fs.readFileSync('./shopify.flows.dev.json', 'utf8'));
         const shopifyTools = JSON.parse(fs.readFileSync('./shopify.tools.dev.json', 'utf8'));

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
      30000 // AI Timeout in ms
   );
   engine.disableCommands(); // Disable default flow commands for this demo

   let session = engine.initSession("user-001", "session-001");
   // You can set session variables like this:
   session.cargo.test_var = "test value";

   // Simulate caller ID detection - in a real system, this would come from your telephony system
   session.cargo.twilioNumber = "12132053155"; // Example: Twilio number
   session.cargo.callerId = "17862639556";   // Example: Caller ID
   session.cargo.voice = true; // Simulate voice interaction
   session.cargo.verb = "say"; // "type";
   session.cargo.verb_es = "diga"; // "ingrese";

   // Set contact info based on channel (voice vs text)
   session.cargo.contact_info = "Web: https://icuracao.com/pages/contact - Phone: (877)287-2226 - Phone Payment: (877)495-6774 - Repair & installations: (800)737-8424" + (session.cargo.agentPhoneNumber ? " - or ask for \"Live Agent\" to escalate to live support." : ".");

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
