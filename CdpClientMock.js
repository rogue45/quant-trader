/**
 * @fileoverview Mock implementation for Coinbase Advanced Trade API interactions,
 * used specifically for simulation/test mode.
 */

/**
 * A mock representation of the Coinbase Advanced Trade API client.
 * This class simulates API responses without making actual network requests.
 */
class CdpClientMock {
   constructor() {
      console.log(`[CdpClientMock] Initialized for SIMULATION mode.`);
      // You can initialize mock state here if needed
   }

   /**
    * Mocks fetching account balances.
    * @returns {Promise<object>} A mock response object structure similar to Coinbase API.
    */
   async getAccounts() {
      console.log(`[CdpClientMock] Fetching accounts (mocked in SIMULATION mode)...`);
      // Mock response for simulation mode
      return Promise.resolve({ // Wrap in Promise.resolve to match async signature
         "accounts": [
            {
               "uuid": "mock-eth-uuid",
               "name": "ETH Wallet",
               "currency": "ETH",
               "available_balance": { "value": "0.03898803", "currency": "ETH" },
               "type": "ACCOUNT_TYPE_CRYPTO",
            },
            {
               "uuid": "mock-btc-uuid",
               "name": "BTC Wallet",
               "currency": "BTC",
               "available_balance": { "value": "0", "currency": "BTC" },
               "type": "ACCOUNT_TYPE_CRYPTO",
            },
            {
               "uuid": "mock-usd-uuid",
               "name": "Cash (USD)",
               "currency": "USD",
               "available_balance": { "value": "1000.00", "currency": "USD" }, // Example USD balance
               "type": "ACCOUNT_TYPE_FIAT",
            }
         ],
         "has_next": false,
         "cursor": "",
         "size": 3
      });
   }

   /**
    * Mocks placing a market order.
    * @param {string} ticker - The trading pair (e.g., "BTC-USD").
    * @param {'BUY'|'SELL'} side - The order side.
    * @param {number} quantity - The amount of base currency to buy/sell.
    * @returns {Promise<object>} A mock order response.
    */
   async placeMarketOrder(ticker, side, quantity) {
      const orderDetails = {
         ticker,
         side,
         quantity,
         type: 'MARKET',
         timestamp: new Date().toISOString(),
      };
      console.log(`[CdpClientMock] SIMULATION: Would have placed a ${side} market order for ${quantity} of ${ticker}.`);
      return Promise.resolve({ success: true, message: "Simulated order placed." });
   }

   /**
    * Placeholder for fetching current market price.
    * @param {string} ticker - The trading pair (e.g., "BTC-USD").
    * @returns {Promise<number|null>} The current mock price, or null.
    */
   async getMarketPrice(ticker) {
      console.warn(`[CdpClientMock] getMarketPrice is a placeholder. Prices should be sourced from InfluxDB or another reliable stream.`);
      return Promise.resolve(null);
   }

   // Add more mock methods as needed for other API interactions
}

module.exports = CdpClientMock;