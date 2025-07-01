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
let currentHoldings = [];
let currentMarketPrices = {};
let lastTradeTimestamp = 0;

/**
 * Starts the trading bot service.
 */
async function startService() {
   console.log(`[${new Date().toISOString()}] Starting trading bot service...`);
   runITTTEngine(); // Start the main trading loop
}
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
     const portfolios = await coinbaseClient.listPortfolios();
     const defaultPortfolio = portfolios.portfolios.find(p => p.name === "Default");
     // By default this bot only interacts with default portfolio
     const defaultPortfolioId = defaultPortfolio.uuid;
     const portfolioAssets = await coinbaseClient.getPortfolio(defaultPortfolioId);

     currentHoldings = responseParser.parsePortfolioAssets(portfolioAssets);
    console.log(`[${new Date().toISOString()}] Coinbase derived holdings:`, currentHoldings);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to fetch initial account balances:`, error);
  }

  // 2. Populate initial market prices
  for (const ticker of CONFIG.tickers_to_watch) {
    currentMarketPrices[ticker] = await influxClient.getLatestPrice(ticker);
    console.log(`[${new Date().toISOString()}] Latest price for ${ticker}: ${currentMarketPrices[ticker]}`);
  }
}

/**
 * The main trading engine loop.
 * Continuously checks for trading opportunities based on configured rules.
 */
async function runITTTEngine() {
  console.log(`\n[${new Date().toISOString()}] --- Starting Trading Engine Loop ---`);
  // Main loop interval (except when cooldown in effect)
  const intervalMinutes = CONFIG.polling_intervals.main_loop_minutes || 1;

  // 1. Refresh market data and account balances
  try {
    await initializeBotState();
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error refreshing data:`, error);
    return;
  }

  const usdBalance = parseFloat(currentHoldings.find(b => b.asset === 'USD')?.quantity || '0');
  console.log(`[${new Date().toISOString()}] Available USD: $${usdBalance.toFixed(2)}`);

  // 2. Evaluate Buy Opportunities
  // Loop through tickers to watch
  for (const ticker of CONFIG.tickers_to_watch) {
     // Evaluate cooldown per ticker so we don't just end up buying all assets at the same time on price redirection
     if(isCooldown(CONFIG.trade_cooldown_minutes, lastTradeTimestamp, intervalMinutes)) {
        setTimeout(runITTTEngine, intervalMinutes * 60 * 1000);
        return;
     }

    const currentPrice = parseFloat(currentMarketPrices[ticker]);
    if (currentPrice === null) continue; // Skip if no price data

    const baseCurrency = ticker.split('-')[0];

    // Only buy if we have sufficient USD and are not currently holding this asset
    if (usdBalance >= CONFIG.account.trade_allocation_usd) {
      // Ensure we have enough historical data for a ticker to analyze
       const historicalPrices = await influxClient.getHistoricalPrices(ticker, "-73h"); // Get 72 hours of data for indicators
      if (historicalPrices.length < 20) { // Check if enough data for common indicators (e.g., 20-period BB)
          console.warn(`[${new Date().toISOString()}] Not enough historical price data for ${ticker} (${historicalPrices.length} points). Skipping buy rule evaluation.`);
          continue;
      }

      for (const rule of CONFIG.buy_rules) {
        if (evaluateRuleCondition(ticker, rule, currentPrice, historicalPrices)) {
          console.log(`[${new Date().toISOString()}] BUY signal for ${ticker} detected by rule '${rule.id}'!`);

          const amountToBuyUSD = CONFIG.account.trade_allocation_usd;
          const quantityToBuy = amountToBuyUSD / currentPrice; // Calculate quantity based on USD allocation
          const adjustedQuantity = ticker === "XRP-USD" ? quantityToBuy.toFixed(6) : quantityToBuy.toFixed(8);

          try {
            const orderResult = await coinbaseClient.placeLimitBuyOrder(ticker, adjustedQuantity, currentPrice);

            if (orderResult && orderResult.success !== false) { // Check for success, assuming live API might return `undefined` for success
              console.log(`[${new Date().toISOString()}] ORDER PLACED: Successfully processed BUY for ${adjustedQuantity} ${baseCurrency} of ${ticker}.`);

              // Populated cool down timer to space out trades
              lastTradeTimestamp = Date.now();

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
  for (const asset of currentHoldings) {
    const assetName = asset.asset;
    const ticker = assetName + "-USD"
    const currentPrice = parseFloat(currentMarketPrices[ticker]);

    // Duh
    if(assetName === "USD") {
       continue;
    }

    if (currentPrice === null || currentPrice === undefined) {
      console.warn(`[${new Date().toISOString()}] No recent price data for ${ticker}. Skipping sell rule evaluation for this holding.`);
      continue; // Skip if no price data for this ticker
    }

    const heldQuantityFromBalance = parseFloat(asset.quantity || 0);


    if (heldQuantityFromBalance > 0) {
        const historicalPrices = await influxClient.getHistoricalPrices(ticker, "-25h"); // Get 24 hours of data for indicators
        if (historicalPrices.length < 20) {
            console.warn(`[${new Date().toISOString()}] Not enough historical price data for ${ticker} (${historicalPrices.length} points). Skipping sell rule evaluation.`);
            continue;
        }

        for (const rule of CONFIG.sell_rules) {
            if (evaluateRuleCondition(ticker, rule, currentPrice, historicalPrices, asset)) {
                console.log(`[${new Date().toISOString()}] SELL signal for ${ticker} detected by rule '${rule.id}'!`);

                const quantityToSell = asset.quantity;

                try {
                    const orderResult = await coinbaseClient.placeLimitSellOrder(ticker, quantityToSell, currentPrice)
                    if (orderResult && orderResult.success !== false) {
                        console.log(`[${new Date().toISOString()}] ORDER PLACED: Successfully processed SELL for ${quantityToSell.toFixed(8)} ${assetName} of ${ticker}.`);

                        // Populate cool down timer to space out trades
                        lastTradeTimestamp = Date.now();

                        break; // Execute only the first matching sell rule for this ticker
                    } else {
                        console.error(`[${new Date().toISOString()}] FAILED ORDER: Could not place SELL order for ${ticker}.`, orderResult);
                    }
                } catch (tradeError) {
                    console.error(`[${new Date().toISOString()}] TRADE ERROR: Failed to place SELL order for ${ticker}:`, tradeError.message);
                }
            }
        }
    } else if (heldQuantityFromBalance === 0 && asset.quantity > 0) {
        console.log(`[${new Date().toISOString()}] Tracked holding for ${ticker} but actual balance is zero.`);
    } else {
        console.log(`[${new Date().toISOString()}] No significant holdings found for ${ticker} or quantity is zero. Skipping sell check.`);
    }
  }

  console.log(`[${new Date().toISOString()}] --- Loop End. Current Holdings Tracked:`, currentHoldings);

  // Schedule the next run
  setTimeout(runITTTEngine, intervalMinutes * 60 * 1000);
}

/**
 * Evaluates a single trading rule condition.
 * @param ticker
 * @param {object} rule - The rule object from config.
 * @param {number} currentPrice - The current market price of the asset.
 * @param {Array<number>} historicalPrices - Array of historical prices needed for indicator calculations.
 * @param {object} [holdingDetails] - Details of the current holding for sell rules
 * @returns {boolean} True if the rule condition is met, false otherwise.
 */
function evaluateRuleCondition(ticker, rule, currentPrice, historicalPrices, holdingDetails = {}) {
   const params = rule.params;
   const hPrices = Array.isArray(historicalPrices) ? historicalPrices : [];

   switch (rule.type) {
      // Buy rule evals
      case "sma_dip_percentage":
         const sma = calculations.calculateSMA(hPrices, params.sma_days * 1440);
         if (sma === null) return false;
         const targetSmaPrice = sma * (1 - params.percentage_below_sma / 100);
         console.log("---------------------------");
         console.log(ticker + " buy evaluation")
         console.log("SMA target: " + targetSmaPrice);
         console.log("Current price: " + currentPrice);
         return currentPrice <= targetSmaPrice;

      case "bollinger_lower_band_cross":
         const bbLower = calculations.calculateBollingerBands(hPrices, params.period, params.std_dev_multiplier);
         console.log("---------------------------");
         console.log(ticker + " buy evaluation")
         console.log("BB lower: " + bbLower.lowerBand);
         console.log("Current price: " + currentPrice);
         return bbLower && bbLower.lowerBand !== null && currentPrice <= bbLower.lowerBand;

      case "roc_dip":
         // ROC needs current price and past prices.
         // Make sure there are enough prices for ROC calculation (roc_period + 1 values)
         if (hPrices.length < params.roc_period) return false; // Need at least `roc_period` historical prices
         const pricesForRocBuy = [...hPrices.slice(-(params.roc_period)), currentPrice];
         const rocBuy = calculations.calculateROC(pricesForRocBuy, params.roc_period);
         return rocBuy !== null && rocBuy <= params.dip_percentage_trigger;

      // Sell rule evals
      case "profit_percentage_target":
         if (!holdingDetails || typeof holdingDetails.average_usd_price !== 'number') return false;
         const targetProfitPrice = holdingDetails.average_usd_price * (1 + params.percentage_above_purchase / 100);

         console.log("----------------------------");
         console.log(ticker + " sell evaluation");
         console.log("profit_percentage_target evaluation: ");
         console.log("avg_purchase price: " + holdingDetails.average_usd_price);
         console.log("targetSellPrice: " + targetProfitPrice);
         console.log("meetsSellCriteria: " +  holdingDetails.average_usd_price >= targetProfitPrice);
         return currentPrice >= targetProfitPrice;

      case "bollinger_upper_band_cross":
         const bbUpper = calculations.calculateBollingerBands(hPrices, params.period, params.std_dev_multiplier);
         return bbUpper && bbUpper.upperBand !== null && currentPrice >= bbUpper.upperBand;

      case "roc_spike":
         if (!holdingDetails || typeof holdingDetails.average_usd_price !== 'number') return false;
         // Make sure there are enough prices for ROC calculation (roc_period + 1 values)
         if (hPrices.length < params.roc_period) return false;
         const pricesForRocSell = [...hPrices.slice(-(params.roc_period)), currentPrice];
         const rocSell = calculations.calculateROC(pricesForRocSell, params.roc_period);
         return rocSell !== null && rocSell >= params.spike_percentage_trigger && currentPrice > holdingDetails.average_usd_price;

      default:
         console.warn(`[${new Date().toISOString()}] Unknown rule type: ${rule.type} for rule ID '${rule.id}'.`);
         return false;
   }
}

function isCooldown(cooldownMinutes, lastTradeTimestamp, mainLoopPeriod) {
   const cooldownPeriodMs = (cooldownMinutes || 0) * 60 * 1000;
   const now = Date.now();

   if (now - lastTradeTimestamp < cooldownPeriodMs) {
      const remainingCooldownSeconds = Math.ceil((cooldownPeriodMs - (now - lastTradeTimestamp)) / 1000);
      console.log(`[${new Date().toISOString()}] Trade cooldown active. Skipping rule evaluation for ${remainingCooldownSeconds} seconds.`);
      return true;
   }
   return false;
}