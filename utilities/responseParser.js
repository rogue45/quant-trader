const responseParser = {
   parseAccountBalances: function(response) {
      return response.accounts.map(account => ({
         currency: account.available_balance.currency,
         value: account.available_balance.value,
      }));
   },

}

module.exports = responseParser;
;