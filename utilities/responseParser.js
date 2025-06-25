const responseParser = {
   parseAccountBalances: function(response) {
      return response.accounts.map(account => ({
         currency: account.available_balance.currency,
         value: account.available_balance.value,
      }));
   },

   parsePortfolioAssets: function(portfolioAssets) {
      const positions = portfolioAssets?.breakdown?.spot_positions;
      const holdings = [];

      if (positions && positions.length > 0) {
         for (const position of positions) {
            holdings.push({
               asset: position.asset,
               quantity: position.total_balance_crypto,
               average_usd_price: parseFloat(position.average_entry_price.value)
            });
         }
      }
      return holdings;
   }

}

module.exports = responseParser;
;