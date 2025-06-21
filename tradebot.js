/**
 * @fileoverview Main Node.js Trading Bot application.
 * This script initializes the bot, manages trading state,
 * evaluates buy/sell rules, and executes simulated or live trades.
 */

// Required modules
const fs = require('fs');
const path = require('path');
const { InfluxDB, Point, flux } = require('@influxdata/influxdb-client');

// Import both the actual client and the mock client
const CdpClientImpl = require("./CdpClientImpl"); // Actual Coinbase API client
const CdpClientMock = require("./CdpClientMock"); // Mock client for simulation
const influxClient = require("./clients/influxClient");

const responseParser = require("./utilities/responseParser"); // Your response parsing utilities
const calculations = require("./utilities/calculations");

// --- Configuration Loading ---
let CONFIG = {};
try {
  const configPath = process.env.CONFIG_PATH || path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    const configFile = fs.readFileSync(configPath, 'utf8');
    CONFIG = JSON.parse(configFile);
  } else {
    console.error(`[${new Date().toISOString()}] FATAL: Configuration file not found at ${configPath}. Exiting.`);
    process.exit(1);
  }
} catch (e) {
  console.error(`[${new Date().toISOString()}] FATAL: Error loading or parsing configuration file. Exiting.`, e);
  process.exit(1);
}

// --- InfluxDB Client Setup ---
influxClient.initializeInfluxClient(CONFIG);

// --- Coinbase API Client Initialization ---
let coinbaseClient;
if (CONFIG.mode === "live_trading") {
  coinbaseClient = new CdpClientImpl();
  console.log(`[${new Date().toISOString()}] Mode: live_trading. This bot will attempt real trades.`);
} else { // Default to simulation if mode is not 'live_trading' or is 'simulation'
  coinbaseClient = new CdpClientMock();
  console.log(`[${new Date().toISOString()}] Mode: simulation. No real trades will be executed.`);
}

// --- Global Trading State ---
let currentAccountBalances = []; // [{ currency: "USD", value: "1000.00" }, { currency: "ETH", value: "0.05" }]
// currentHoldings will track the purchase details of assets currently held.
let currentHoldings = {}; // { "ETH-USD": { purchasePrice: 1800, quantity: 0.05, timestamp: Date } }
let currentMarketPrices = {}; // { "BTC-USD": 60000, "ETH-USD": 1800 }

/**
 * Starts the trading bot service.
 */
async function startService() {
   console.log(`[${new Date().toISOString()}] Starting trading bot service...`);
   await initializeBotState(); // Fetch initial balances and market data
   runITTTEngine(); // Start the main trading loop
}

// Start the service when the script is executed
startService().catch(error => {
   console.error(`[${new Date().toISOString()}] Uncaught error in startService:`, error);
   process.exit(1);
});


/**
 * Initializes the bot's state, fetching account balances and historical data.
 */
async function initializeBotState() {
  console.log(`[${new Date().toISOString()}] Initializing bot state...`);

  // 1. Get initial account balances
  try {
    const rawAccountInfo = await coinbaseClient.getAccounts();
    currentAccountBalances = responseParser.parseAccountBalances(rawAccountInfo);
    console.log(`[${new Date().toISOString()}] Initial Account Balances:`, currentAccountBalances);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to fetch initial account balances:`, error);
    currentAccountBalances = [];
  }

  // 2. Populate initial market prices
  for (const ticker of CONFIG.tickers_to_watch) {
    currentMarketPrices[ticker] = await influxClient.getLatestPrice(ticker);
    console.log(`[${new Date().toISOString()}] Latest price for ${ticker}: ${currentMarketPrices[ticker]}`);
  }

  // 3. Reconstruct current holdings from InfluxDB trade logs
  currentHoldings = {}; // Clear previous state
  const nonUSDBalances = currentAccountBalances.filter(b => b.currency !== 'USD' && parseFloat(b.value) > 0);
  for (const balance of nonUSDBalances) {
      const baseCurrency = balance.currency;
      const ticker = `${baseCurrency}-USD`; // Assuming USD pairs
      const holdingDetails = await influxClient.getHoldingDetailsFromInfluxDB(ticker);
      if (holdingDetails && holdingDetails.quantity > 0) {
          // Only add to holdings if we actually have a quantity in our Coinbase balance
          // and InfluxDB suggests we have a holding.
          // Use the quantity from the actual Coinbase balance, but the purchase price from InfluxDB.
          currentHoldings[ticker] = {
              purchasePrice: holdingDetails.purchasePrice,
              quantity: parseFloat(balance.value), // Use current actual balance quantity
              timestamp: holdingDetails.timestamp,
              ruleId: 'Derived_from_InfluxDB'
          };
      }
  }
  console.log(`[${new Date().toISOString()}] Current Holdings initialized from InfluxDB:`, currentHoldings);

  console.log(`[${new Date().toISOString()}] Bot state initialization complete.`);
}

/**
 * The main trading engine loop.
 * Continuously checks for trading opportunities based on configured rules.
 */
async function runITTTEngine() {
  console.log(`\n[${new Date().toISOString()}] --- Starting Trading Engine Loop ---`);

  // 1. Refresh market data and account balances
  try {
    const rawAccountInfo = await coinbaseClient.getAccounts();
    currentAccountBalances = responseParser.parseAccountBalances(rawAccountInfo);
    console.log(`[${new Date().toISOString()}] Current Balances:`, currentAccountBalances.map(b => `${parseFloat(b.value).toFixed(6)} ${b.currency}`).join(', '));

    for (const ticker of CONFIG.tickers_to_watch) {
      currentMarketPrices[ticker] = await influxClient.getLatestPrice(ticker);
      if (currentMarketPrices[ticker] === null) {
        console.warn(`[${new Date().toISOString()}] No recent price data for ${ticker}. Skipping rule evaluation for this ticker.`);
      }
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error refreshing data:`, error);
    return; // Skip this loop iteration if data refresh fails
  }

  const usdBalance = parseFloat(currentAccountBalances.find(b => b.currency === 'USD')?.value || '0');
  console.log(`[${new Date().toISOString()}] Available USD: $${usdBalance.toFixed(2)}`);

  // 2. Evaluate Buy Opportunities
  // Loop through tickers to watch
  for (const ticker of CONFIG.tickers_to_watch) {
    const currentPrice = currentMarketPrices[ticker];
    if (currentPrice === null) continue; // Skip if no price data

    // Check if we already hold this asset (to avoid double buying unless intended)
    // Note: This check relies on the currentAccountBalances, which reflects real holdings.
    const baseCurrency = ticker.split('-')[0];
    const heldQuantity = parseFloat(currentAccountBalances.find(b => b.currency === baseCurrency)?.value || '0');

    // Only buy if we have sufficient USD and are not currently holding this asset
    if (usdBalance >= CONFIG.account.trade_allocation_usd) {
      const historicalPrices = await influxClient.getHistoricalPrices(ticker, "-24h"); // Get 24 hours of data for indicators
      if (historicalPrices.length < 20) { // Check if enough data for common indicators (e.g., 20-period BB)
          console.warn(`[${new Date().toISOString()}] Not enough historical price data for ${ticker} (${historicalPrices.length} points). Skipping buy rule evaluation.`);
          continue;
      }

      for (const rule of CONFIG.buy_rules) {
        if (evaluateRuleCondition(rule, currentPrice, historicalPrices)) {
          console.log(`[${new Date().toISOString()}] BUY signal for ${ticker} detected by rule '${rule.id}'!`);

          const amountToBuyUSD = CONFIG.account.trade_allocation_usd;
          const quantityToBuy = amountToBuyUSD / currentPrice; // Calculate quantity based on USD allocation

          const adjustedQuantity = ticker === "XRP-USD" ? quantityToBuy.toFixed(6) : quantityToBuy.toFixed(8);

          try {
            const orderResult = await coinbaseClient.placeMarketOrder(ticker, 'BUY', adjustedQuantity);
            if (orderResult && orderResult.success !== false) { // Check for success, assuming live API might return `undefined` for success
              console.log(`[${new Date().toISOString()}] ORDER PLACED: Successfully processed BUY for ${adjustedQuantity} ${baseCurrency} of ${ticker}.`);

              // Update currentHoldings after a successful buy
              currentHoldings[ticker] = {
                  purchasePrice: currentPrice, // The price at this buy event
                  quantity: (currentHoldings[ticker] ? currentHoldings[ticker].quantity : 0) + adjustedQuantity, // Add to existing quantity
                  timestamp: new Date().toISOString(),
                  ruleId: rule.id
              };

              if (CONFIG.mode == 'live_trading') {
                 await influxClient.logTradeEvent({
                    ticker, event_type: "BUY_EXECUTION",
                    price: currentPrice,
                    quantity: adjustedQuantity,
                    usdAmount: amountToBuyUSD,
                    rule_id: rule.id,
                    rule_type: rule.type
                 });
              }

              // Re-fetch balances to reflect the trade (important for live, good for simulation demo)
              const rawAccountInfo = await coinbaseClient.getAccounts();
              currentAccountBalances = responseParser.parseAccountBalances(rawAccountInfo);
              break; // Execute only the first matching buy rule for this ticker
            } else {
              console.error(`[${new Date().toISOString()}] FAILED ORDER: Could not place BUY order for ${ticker}.`, orderResult);
            }
          } catch (tradeError) {
            console.error(`[${new Date().toISOString()}] TRADE ERROR: Failed to place BUY order for ${ticker}:`, tradeError.message);
          }
        }
      }
    } else {
        console.log(`[${new Date().toISOString()}] Not enough USD to buy ${ticker} ($${usdBalance.toFixed(2)} available, $${CONFIG.account.trade_allocation_usd.toFixed(2)} needed).`);
    }
  }


  // 3. Evaluate Sell Opportunities
  // Iterate through non-USD balances that are also present in our currentHoldings tracking
  for (const ticker in currentHoldings) {
    const holding = currentHoldings[ticker]; // Get holding details from our tracked state
    const currentPrice = currentMarketPrices[ticker];

    if (currentPrice === null || currentPrice === undefined) {
      console.warn(`[${new Date().toISOString()}] No recent price data for ${ticker}. Skipping sell rule evaluation for this holding.`);
      continue; // Skip if no price data for this ticker
    }

    const baseCurrency = ticker.split('-')[0];
    const heldQuantityFromBalance = parseFloat(currentAccountBalances.find(b => b.currency === baseCurrency)?.value || '0');

    // Only consider selling if the actual account balance shows we hold a significant quantity
    if (heldQuantityFromBalance > 0 && holding.quantity > 0 && heldQuantityFromBalance >= holding.quantity * 0.99) { // Check for a close match
        const historicalPrices = await influxClient.getHistoricalPrices(ticker, "-24h"); // Get 24 hours of data for indicators
        if (historicalPrices.length < 20) {
            console.warn(`[${new Date().toISOString()}] Not enough historical price data for ${ticker} (${historicalPrices.length} points). Skipping sell rule evaluation.`);
            continue;
        }

        for (const rule of CONFIG.sell_rules) {
            if (evaluateRuleCondition(rule, currentPrice, historicalPrices, holding)) {
                console.log(`[${new Date().toISOString()}] SELL signal for ${ticker} detected by rule '${rule.id}'!`);

                const quantityToSell = holding.quantity;
                const estimatedUSDValue = quantityToSell * currentPrice;

                try {
                    const orderResult = await coinbaseClient.placeMarketOrder(ticker, 'SELL', quantityToSell);
                    if (orderResult && orderResult.success !== false) {
                        console.log(`[${new Date().toISOString()}] ORDER PLACED: Successfully processed SELL for ${quantityToSell.toFixed(8)} ${baseCurrency} of ${ticker}.`);
                        delete currentHoldings[ticker]; // Remove from holdings after sale

                        await influxClient.logTradeEvent({
                            ticker, event_type: (CONFIG.mode === "live_trading" ? "SELL_EXECUTION" : "SELL_SIMULATION"), price: currentPrice,
                            quantity: quantityToSell, usdAmount: estimatedUSDValue,
                            rule_id: rule.id, rule_type: rule.type,
                            purchasePrice: holding.purchasePrice // Using the actual tracked purchase price
                        });
                         // Re-fetch balances to reflect the trade
                        const rawAccountInfo = await coinbaseClient.getAccounts();
                        currentAccountBalances = responseParser.parseAccountBalances(rawAccountInfo);
                        break; // Execute only the first matching sell rule for this ticker
                    } else {
                        console.error(`[${new Date().toISOString()}] FAILED ORDER: Could not place SELL order for ${ticker}.`, orderResult);
                    }
                } catch (tradeError) {
                    console.error(`[${new Date().toISOString()}] TRADE ERROR: Failed to place SELL order for ${ticker}:`, tradeError.message);
                }
            }
        }
    } else if (heldQuantityFromBalance === 0 && holding.quantity > 0) {
        console.log(`[${new Date().toISOString()}] Tracked holding for ${ticker} but actual balance is zero. Removing from holdings.`);
        delete currentHoldings[ticker]; // Clean up inconsistencies
    } else {
        console.log(`[${new Date().toISOString()}] No significant holdings found for ${ticker} or quantity is zero. Skipping sell check.`);
    }
  }

  console.log(`[${new Date().toISOString()}] --- Loop End. Current Holdings Tracked:`, currentHoldings);


  // Schedule the next run
  const intervalMinutes = CONFIG.polling_intervals.main_loop_minutes || 1;
  setTimeout(runITTTEngine, intervalMinutes * 60 * 1000);
}

/**
 * Evaluates a single trading rule condition.
 * @param {object} rule - The rule object from config.
 * @param {number} currentPrice - The current market price of the asset.
 * @param {Array<number>} historicalPrices - Array of historical prices needed for indicator calculations.
 * @param {object} [holdingDetails] - Details of the current holding for sell rules (e.g., { purchasePrice: number }).
 * @returns {boolean} True if the rule condition is met, false otherwise.
 */
function evaluateRuleCondition(rule, currentPrice, historicalPrices, holdingDetails = {}) {
   const params = rule.params;
   const hPrices = Array.isArray(historicalPrices) ? historicalPrices : [];

   switch (rule.type) {
      case "sma_dip_percentage":
         const sma = calculations.calculateSMA(hPrices, params.sma_days);
         if (sma === null) return false;
         const targetSmaPrice = sma * (1 - params.percentage_below_sma / 100);
         return currentPrice <= targetSmaPrice;

      case "profit_percentage_target":
         if (!holdingDetails || typeof holdingDetails.purchasePrice !== 'number') return false;
         const targetProfitPrice = holdingDetails.purchasePrice * (1 + params.percentage_above_purchase / 100);

         console.log("profit_percentage_target evaluation: ");
         console.log("purchase price: " + holdingDetails.purchasePrice);
         console.log("targetSellPrice: " + targetProfitPrice);
         console.log("meetsSellCriteria: " + holdingDetails.purchasePrice >= targetProfitPrice);
         return currentPrice >= targetProfitPrice;

      case "stop_loss_percentage":
         if (!holdingDetails || typeof holdingDetails.purchasePrice !== 'number') return false;
         const targetStopPrice = holdingDetails.purchasePrice * (1 - params.percentage_below_purchase / 100);
         return currentPrice <= targetStopPrice;

      case "bollinger_lower_band_cross":
         const bbLower = calculations.calculateBollingerBands(hPrices, params.period, params.std_dev_multiplier);

         console.log("BB lower: " + bbLower.lowerBand);
         console.log("Current price: " + currentPrice);
         console.log("---------------------------");
         return bbLower && bbLower.lowerBand !== null && currentPrice <= bbLower.lowerBand;

      case "bollinger_upper_band_cross":
         const bbUpper = calculations.calculateBollingerBands(hPrices, params.period, params.std_dev_multiplier);
         return bbUpper && bbUpper.upperBand !== null && currentPrice >= bbUpper.upperBand;

      case "bollinger_middle_band_cross":
         const bbMiddle = calculations.calculateBollingerBands(hPrices, params.period, params.std_dev_multiplier);
         return bbMiddle && bbMiddle.middleBand !== null && currentPrice >= bbMiddle.middleBand;

      case "roc_dip":
         // ROC needs current price and past prices.
         // Make sure there are enough prices for ROC calculation (roc_period + 1 values)
         if (hPrices.length < params.roc_period) return false; // Need at least `roc_period` historical prices
         const pricesForRocBuy = [...hPrices.slice(-(params.roc_period)), currentPrice];
         const rocBuy = calculations.calculateROC(pricesForRocBuy, params.roc_period);
         return rocBuy !== null && rocBuy <= params.dip_percentage_trigger;

      case "roc_spike":
         if (!holdingDetails || typeof holdingDetails.purchasePrice !== 'number') return false;
         // Make sure there are enough prices for ROC calculation (roc_period + 1 values)
         if (hPrices.length < params.roc_period) return false;
         const pricesForRocSell = [...hPrices.slice(-(params.roc_period)), currentPrice];
         const rocSell = calculations.calculateROC(pricesForRocSell, params.roc_period);
         return rocSell !== null && rocSell >= params.spike_percentage_trigger && currentPrice > holdingDetails.purchasePrice;

      default:
         console.warn(`[${new Date().toISOString()}] Unknown rule type: ${rule.type} for rule ID '${rule.id}'.`);
         return false;
   }
}