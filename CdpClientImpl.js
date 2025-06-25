/**
 * @fileoverview Implements actual interactions with the Coinbase Advanced Trade API.
 * This client is used for live trading.
 */

// Import necessary modules
const { getAuthToken } = require('./auth/auth'); // Your provided auth.js
const axios = require('axios'); // For making HTTP requests

// Coinbase API Base URL (should ideally come from config, but hardcoding for simplicity here)
const COINBASE_API_BASE_URL = "https://api.coinbase.com"; // From config.json

/**
 * A client for interacting with the Coinbase Advanced Trade API.
 * This class handles actual HTTP requests for live trading operations.
 */
class CdpClientImpl {
   constructor() {
      console.log(`[CdpClientImpl] Initialized for LIVE trading.`);
   }

   /**
    * Fetches account balances from Coinbase.
    * Makes a GET request to /api/v3/brokerage/accounts.
    * @returns {Promise<object>} The raw response object from Coinbase API.
    * @throws {Error} If the API call fails.
    */
   async getAccounts() {
      console.log(`[CdpClientImpl] Fetching accounts from LIVE API...`);
      try {
         const method = 'GET';
         const requestPath = '/api/v3/brokerage/accounts';
         const token = await getAuthToken(method, requestPath);
         const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
         };
         const response = await axios.get(`${COINBASE_API_BASE_URL}${requestPath}`, { headers });
         return response.data;
      } catch (error) {
         console.error(`[CdpClientImpl] Error fetching accounts from LIVE API:`, error.response ? error.response.data : error.message);
         // Re-throw to be handled by the calling function (e.g., in tradebot.js)
         throw new Error(`Failed to fetch accounts: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
      }
   }

   /**
    * Places a market order on Coinbase.
    * Makes a POST request to /api/v3/brokerage/orders.
    * @param {string} ticker - The trading pair (e.g., "BTC-USD").
    * @param {'BUY'|'SELL'} side - The order side.
    * @param {number} quantity - The amount of base currency to buy/sell.
    * @returns {Promise<object>} The raw order response from Coinbase API.
    * @throws {Error} If the API call fails.
    */
   async placeMarketOrder(ticker, side, quantity) {
      const orderDetails = {
         ticker,
         side,
         quantity,
         type: 'MARKET',
         timestamp: new Date().toISOString(),
      };
      console.log(`[CdpClientImpl] Attempting to place LIVE order:`, orderDetails);
      try {
         const method = 'POST';
         const requestPath = '/api/v3/brokerage/orders';
         const token = await getAuthToken(method, requestPath);
         const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
         };

         const payload = {
            client_order_id: `my-bot-order-${Date.now()}`,
            product_id: ticker,
            side: side === 'BUY' ? 'BUY' : 'SELL', // Ensure Coinbase's expected 'BUY'/'SELL'
            order_configuration: {
               market_market_ioc: { // Instant-or-Cancel for market orders
                  // For market orders, use base_size for crypto amount.
                  // For BUY, quantity is the amount of crypto to receive.
                  // For SELL, quantity is the amount of crypto to sell.
                  base_size: quantity.toString(),
               }
            }
         };

         const response = await axios.post(`${COINBASE_API_BASE_URL}${requestPath}`, payload, { headers });
         console.log(`[CdpClientImpl] LIVE order placed successfully for ${ticker}:`, response.data);
         return response.data;
      } catch (error) {
         console.error(`[CdpClientImpl] Error placing LIVE order for ${ticker}:`, error.response ? error.response.data : error.message);
         throw new Error(`Failed to place order: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
      }
   }

   /**
    * Placeholder for fetching current market price.
    * In a real live trading scenario, you'd fetch the latest price from Coinbase.
    * For this bot, the main loop sources prices from InfluxDB.
    * @param {string} ticker - The trading pair (e.g., "BTC-USD").
    * @returns {number|null} The current price, or null.
    */
   async getMarketPrice(ticker) {
      console.warn(`[CdpClientImpl] getMarketPrice is a placeholder. Prices should be sourced from InfluxDB or another reliable stream.`);
      return null; // The bot will get prices from InfluxDB instead
   }

   /**
    * Fetches a list of portfolios from Coinbase.
    * Makes a GET request to /api/v3/brokerage/portfolios.
    * @returns {Promise<object>} The raw response object from Coinbase API.
    * @throws {Error} If the API call fails.
    */
   async listPortfolios() {
      console.log(`[CdpClientImpl] Listing portfolios from LIVE API...`);
      try {
         const method = 'GET';
         const requestPath = '/api/v3/brokerage/portfolios';
         const token = await getAuthToken(method, requestPath);
         const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
         };
         const response = await axios.get(`${COINBASE_API_BASE_URL}${requestPath}`, { headers });
         return response.data;
      } catch (error) {
         console.error(`[CdpClientImpl] Error listing portfolios from LIVE API:`, error.response ? error.response.data : error.message);
         throw new Error(`Failed to list portfolios: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
      }
   }

   /**
    * Fetches a specific portfolio by its ID from Coinbase.
    * Makes a GET request to /api/v3/brokerage/portfolios/{portfolio_uuid}.
    * @param {string} portfolioId - The UUID of the portfolio to retrieve.
    * @returns {Promise<object>} The raw response object from Coinbase API.
    * @throws {Error} If the API call fails.
    */
   async getPortfolio(portfolioId) {
      console.log(`[CdpClientImpl] Fetching portfolio ${portfolioId} from LIVE API...`);
      try {
         const method = 'GET';
         const requestPath = `/api/v3/brokerage/portfolios/${portfolioId}`;
         const token = await getAuthToken(method, requestPath);
         const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
         };
         const response = await axios.get(`${COINBASE_API_BASE_URL}${requestPath}`, { headers });
         return response.data;
      } catch (error) {
         console.error(`[CdpClientImpl] Error fetching portfolio ${portfolioId} from LIVE API:`, error.response ? error.response.data : error.message);
         throw new Error(`Failed to fetch portfolio: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
      }
   }

   /**
    * Fetches historical orders filtered by ticker.
    * Uses the /api/v3/brokerage/orders/historical/batch endpoint.
    * @param {string} ticker - The trading pair (e.g., "BTC-USD").
    * @param {Array<string>} [statuses=['FILLED', 'DONE']] - Array of order statuses to filter by.
    * @param {number} [limit=100] - The number of orders to return per page (max 250).
    * @param {string} [cursor] - Cursor for pagination.
    * @returns {Promise<object>} The raw response object from Coinbase API.
    * @throws {Error} If the API call fails.
    */
   async getHistoricalOrdersByTicker(ticker, statuses = ['FILLED', 'DONE'], limit = 100, cursor = '') {
      console.log(`[CdpClientImpl] Fetching historical orders for ${ticker} from LIVE API...`);
      try {
         const method = 'GET';
         const requestPath = '/api/v3/brokerage/orders/historical/batch';
         // Construct query parameters
         const queryParams = new URLSearchParams({
            product_id: ticker,
            limit: limit.toString(),
            // The API expects `status` as a query parameter for each status
            // e.g., ?status=FILLED&status=DONE
         });
         statuses.forEach(status => queryParams.append('status', status));

         if (cursor) {
            queryParams.append('cursor', cursor);
         }

         const fullRequestPath = `${requestPath}?${queryParams.toString()}`;
         const token = await getAuthToken(method, fullRequestPath); // Auth token needs full path with query params

         const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
         };

         const response = await axios.get(`${COINBASE_API_BASE_URL}${fullRequestPath}`, { headers });
         return response.data;
      } catch (error) {
         console.error(`[CdpClientImpl] Error fetching historical orders for ${ticker} from LIVE API:`, error.response ? error.response.data : error.message);
         throw new Error(`Failed to fetch historical orders: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
      }
   }

}

module.exports = CdpClientImpl;
