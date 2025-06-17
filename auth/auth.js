const { sign } = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const authConfig = require('./cdp_api_key.json')

// --- Configuration Loading (simplified to get API key names) ---
let CONFIG = {};


/**
 * Generates a JWT token for authenticating with Coinbase APIs (like Advanced Trade).
 * The URI in the token is specific to the request being made.
 * @param {string} method - The HTTP method of the request (e.g., 'GET', 'POST').
 * @param {string} requestPath - The request path (e.g., '/api/v3/brokerage/accounts').
 * @returns {string|null} The generated JWT, or null if an error occurs.
 */
async function getAuthToken(method, requestPath) {

   const key_name = authConfig.name;
   const key_secret = authConfig.privateKey;
   const request_method = method;
   const request_path = requestPath;
   const url = 'api.coinbase.com';


   const algorithm = 'ES256';
   const uri = request_method + ' ' + url + request_path;

   const token = sign(
      {
         iss: 'cdp',
         nbf: Math.floor(Date.now() / 1000),
         exp: Math.floor(Date.now() / 1000) + 120,
         sub: key_name,
         uri,
      },
      key_secret,
      {
         algorithm,
         header: {
            kid: key_name,
            nonce: crypto.randomBytes(16).toString('hex'),
         },
      }
   );
   return token;
}

module.exports = {
   getAuthToken,
};
