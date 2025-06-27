/**
 * @fileoverview Mock implementation for Coinbase Advanced Trade API interactions,
 * used specifically for simulation/test mode.
 */

const CdpClient = require("./CdpClient");

/**
 * A mock representation of the Coinbase Advanced Trade API client.
 * This class simulates API responses without making actual network requests.
 */
class CdpClientMock extends CdpClient {
   constructor() {
      super();
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
      console.log(`[CdpClientMock] SIMULATION: Would have placed a ${side} market order for ${quantity} of ${ticker}.`);
      return Promise.resolve({ success: true, message: "Simulated order placed." });
   }

   async placeLimitBuyOrder(ticker, quantity, limitPrice, timeInForce = 'GTC') {
      console.log(`[CdpClientMock] SIMULATION: Would have placed a ${side} limit BUY order for ${quantity} of ${ticker}.`);
   }

   placeLimitSellOrder() {
      console.log(`[CdpClientMock] SIMULATION: Would have placed a ${side} limit SELL order for ${quantity} of ${ticker}.`);
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

   /**
    * Mocks listing portfolios.
    * @returns {Promise<object>} A mock response object with a list of portfolios.
    */
   async listPortfolios() {
      console.log(`[CdpClientMock] Listing portfolios (mocked in SIMULATION mode)...`);
      return Promise.resolve({
         "portfolios": [
            {
               "uuid": "mock-portfolio-1-uuid",
               "name": "Default Portfolio",
               "accounts": [
                  {
                     "uuid": "mock-eth-uuid",
                     "name": "ETH Wallet",
                     "currency": "ETH",
                     "available_balance": { "value": "0.03898803", "currency": "ETH" },
                     "type": "ACCOUNT_TYPE_CRYPTO",
                  },
                  {
                     "uuid": "mock-usd-uuid",
                     "name": "Cash (USD)",
                     "currency": "USD",
                     "available_balance": { "value": "1000.00", "currency": "USD" },
                     "type": "ACCOUNT_TYPE_FIAT",
                  }
               ],
               "created_at": "2023-01-01T00:00:00Z",
               "updated_at": "2023-01-01T00:00:00Z"
            },
            {
               "uuid": "mock-portfolio-2-uuid",
               "name": "Investment Portfolio",
               "accounts": [
                  {
                     "uuid": "mock-btc-uuid",
                     "name": "BTC Wallet",
                     "currency": "BTC",
                     "available_balance": { "value": "0.5", "currency": "BTC" },
                     "type": "ACCOUNT_TYPE_CRYPTO",
                  }
               ],
               "created_at": "2023-02-01T00:00:00Z",
               "updated_at": "2023-02-01T00:00:00Z"
            }
         ]
      });
   }

   /**
    * Mocks getting a specific portfolio by ID.
    * @param {string} portfolioId - The UUID of the portfolio to retrieve.
    * @returns {Promise<object|null>} A mock portfolio object, or null if not found.
    */
   async getPortfolio(portfolioId) {
      console.log(`[CdpClientMock] Fetching portfolio ${portfolioId} (mocked in SIMULATION mode)...`);
      const mockPortfolios = {
         "mock-portfolio-1-uuid": {
            "uuid": "mock-portfolio-1-uuid",
            "name": "Default Portfolio",
            "accounts": [
               {
                  "uuid": "mock-eth-uuid",
                  "name": "ETH Wallet",
                  "currency": "ETH",
                  "available_balance": { "value": "0.03898803", "currency": "ETH" },
                  "type": "ACCOUNT_TYPE_CRYPTO",
               },
               {
                  "uuid": "mock-usd-uuid",
                  "name": "Cash (USD)",
                  "currency": "USD",
                  "available_balance": { "value": "1000.00", "currency": "USD" },
                  "type": "ACCOUNT_TYPE_FIAT",
               }
            ],
            "created_at": "2023-01-01T00:00:00Z",
            "updated_at": "2023-01-01T00:00:00Z"
         },
         "mock-portfolio-2-uuid": {
            "uuid": "mock-portfolio-2-uuid",
            "name": "Investment Portfolio",
            "accounts": [
               {
                  "uuid": "mock-btc-uuid",
                  "name": "BTC Wallet",
                  "currency": "BTC",
                  "available_balance": { "value": "0.5", "currency": "BTC" },
                  "type": "ACCOUNT_TYPE_CRYPTO",
               }
            ],
            "created_at": "2023-02-01T00:00:00Z",
            "updated_at": "2023-02-01T00:00:00Z"
         }
      };
      return Promise.resolve(mockPortfolios[portfolioId] || null);
   }

   /**
    * Mocks fetching historical orders filtered by ticker.
    * @param {string} ticker - The trading pair (e.g., "BTC-USD").
    * @param {Array<string>} [statuses=['FILLED', 'DONE']] - Array of order statuses to filter by.
    * @param {number} [limit=100] - The number of orders to return per page.
    * @param {string} [cursor] - Cursor for pagination.
    * @returns {Promise<object>} A mock response object with a list of historical orders.
    */
   async getHistoricalOrdersByTicker(ticker, statuses = ['FILLED', 'DONE'], limit = 100, cursor = '') {
      console.log(`[CdpClientMock] SIMULATION: Fetching historical orders for ${ticker}...`);

      const mockOrders = [
         {
            "order_id": "mock-order-btc-1",
            "client_order_id": "my-bot-order-1678886400000",
            "product_id": "BTC-USD",
            "side": "BUY",
            "order_configuration": {
               "market_market_ioc": {
                  "base_size": "0.001"
               }
            },
            "status": "FILLED",
            "created_at": "2023-03-15T10:00:00Z",
            "filled_quantity": "0.001",
            "filled_value": "25.00",
            "average_filled_price": "25000.00",
            "commission": "0.025",
            "liquidity": "TAKER",
            "time_in_force": "IOC",
            "settled": true
         },
         {
            "order_id": "mock-order-eth-1",
            "client_order_id": "my-bot-order-1678886500000",
            "product_id": "ETH-USD",
            "side": "BUY",
            "order_configuration": {
               "limit_limit_gtc": {
                  "base_size": "0.05",
                  "limit_price": "1800.00"
               }
            },
            "status": "FILLED",
            "created_at": "2023-03-15T10:01:00Z",
            "filled_quantity": "0.05",
            "filled_value": "90.00",
            "average_filled_price": "1800.00",
            "commission": "0.09",
            "liquidity": "MAKER",
            "time_in_force": "GTC",
            "settled": true
         },
         {
            "order_id": "mock-order-btc-2",
            "client_order_id": "my-bot-order-1678886600000",
            "product_id": "BTC-USD",
            "side": "SELL",
            "order_configuration": {
               "market_market_ioc": {
                  "base_size": "0.0005"
               }
            },
            "status": "FILLED",
            "created_at": "2023-03-15T10:02:00Z",
            "filled_quantity": "0.0005",
            "filled_value": "13.00",
            "average_filled_price": "26000.00",
            "commission": "0.013",
            "liquidity": "TAKER",
            "time_in_force": "IOC",
            "settled": true
         }
      ];

      // Filter by ticker and status for the mock response
      const filteredOrders = mockOrders.filter(order =>
         order.product_id === ticker && statuses.includes(order.status)
      );

      // Simulate pagination (very basic)
      const startIndex = cursor ? parseInt(cursor, 10) : 0;
      const endIndex = startIndex + limit;
      const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

      const hasNext = endIndex < filteredOrders.length;
      const nextCursor = hasNext ? endIndex.toString() : "";

      return Promise.resolve({
         "orders": paginatedOrders,
         "pagination": {
            "next_cursor": nextCursor,
            "sort_direction": "DESC", // Assuming descending order by default
            "has_next": hasNext
         }
      });
   }
}



module.exports = CdpClientMock;