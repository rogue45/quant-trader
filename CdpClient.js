class CdpClient {
   constructor() {
      if (this.constructor === CdpClient) {
         // Or throw new Error("CdpClient is an abstract class and cannot be instantiated directly.");
         console.warn("[CdpClient] Base class constructor called. Ensure you are instantiating an implementation like CdpClientImpl.");
      }
   }
   getAccounts() {
      throw new Error("Method 'getAccounts' must be implemented.");
   }
   getAccountAssetHoldings() {
      throw new Error("Method 'getAccountAssetHoldings' must be implemented.");
   }

   placeMarketOrder() {
      throw new Error("Method 'placeMarketOrder' must be implemented.");
   }
   placeLimitBuyOrder() {
      throw new Error("Method 'placeLimitBuyOrder' must be implemented.");
   }
   placeLimitSellOrder() {
      throw new Error("Method 'placeLimitSellOrder' must be implemented.");
   }

   getOpenSellOrders() {
      throw new Error("Method 'getOpenSellOrders' must be implemented.");
   }

   listPortfolios() {
      throw new Error("Method 'getDefaultPortfolio' must be implemented.");
   }

   getPortfolio() {
      throw new Error("Method 'getDefaultPortfolio' must be implemented.");
   }

   getHistoricalOrdersByTicker() { // New method
      throw new Error("Method 'getHistoricalOrdersByTicker' must be implemented.");
   }
}

module.exports = CdpClient;