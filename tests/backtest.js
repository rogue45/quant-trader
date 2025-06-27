/* Back test a buy and sell config to see if it would have triggered at all in last month */
/* Does not buy or sell anything. It just collects data about what would have happened    */
const fs = require('fs');
const path = require('path');
const influxClient = require("../clients/influxClient"); // Your InfluxDB client
const calculations = require("../utilities/calculations"); // Your calculation utilities

let CONFIG = {};
try {
   const configPath = process.env.CONFIG_PATH || path.join(__dirname, '../config.json');
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

// Initialize InfluxDB client
influxClient.initializeInfluxClient(CONFIG);

// Global array to store successful buys
const successfulBuys = [];

/**
 * Main backtesting function.
 * @param {string} ticker - The trading pair (e.g., "BTC-USD").
 * @param {string} startDateString - Start date in 'YYYY-MM-DDTHH:mm:ssZ' format (e.g., '2023-01-01T00:00:00Z').
 * @param {string} endDateString - End date in 'YYYY-MM-DDTHH:mm:ssZ' format (e.g., '2023-01-02T00:00:00Z').
 */
async function runBacktest(ticker, startDateString, endDateString) {
   console.log(`[${new Date().toISOString()}] Starting backtest for ${ticker} from ${startDateString} to ${endDateString}`);

   const startDate = new Date(startDateString);
   const endDate = new Date(endDateString);

   if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.error("Invalid start or end date. Please use 'YYYY-MM-DDTHH:mm:ssZ' format.");
      return;
   }
   if (startDate >= endDate) {
      console.error("Start date must be before end date.");
      return;
   }

   // Define the range for historical data needed for indicators (e.g., 72 hours for 20-period BB)
   // This should be dynamic based on the max period required by any buy rule.
   // For simplicity, we'll use a fixed large range for now.
   const historicalDataRange = "-73h"; // Sufficient for most common indicators

   // The backtesting loop will increment by 5 minutes
   const intervalMs = 5 * 60 * 1000; // 5 minutes in milliseconds

   let currentTime = new Date(startDate);

   while (currentTime <= endDate) {
      // Construct the range string for InfluxDB based on current time
      // We need data up to 'currentTime' and back by 'historicalDataRange'
      const rangeStart = new Date(currentTime.getTime() - (73 * 60 * 60 * 1000)).toISOString(); // 73 hours before current time
      const rangeEnd = currentTime.toISOString(); // Current timestamp

      const fluxRange = `${rangeStart}, stop: ${rangeEnd}`;

      // Fetch historical prices up to the current simulation time point
      // getHistoricalPrices expects a relative range, so we'll adjust our query to fetch data ending at `currentTime`
      const historicalPrices = await influxClient.getHistoricalPrices(ticker, fluxRange);

      if (historicalPrices.length === 0) {
         console.log(`[${currentTime.toISOString()}] No historical data for ${ticker} at this time. Skipping.`);
         currentTime = new Date(currentTime.getTime() + intervalMs);
         continue;
      }

      // The "current price" for this iteration is the latest price in the fetched historical data
      const currentPrice = parseFloat(historicalPrices[historicalPrices.length - 1]);

      if (isNaN(currentPrice)) {
         console.warn(`[${currentTime.toISOString()}] Invalid current price for ${ticker}. Skipping.`);
         currentTime = new Date(currentTime.getTime() + intervalMs);
         continue;
      }

      // Evaluate Buy Opportunities
      for (const rule of CONFIG.buy_rules) {
         // Re-use the evaluateRuleCondition function from tradebot.js
         // We need to ensure it's accessible or re-implement its core logic here.
         // For now, let's include a simplified version or assume it's imported.
         // In a real scenario, you'd refactor evaluateRuleCondition into a shared utility.
         if (evaluateRuleCondition(ticker, rule, currentPrice, historicalPrices)) {
            console.log(`[${currentTime.toISOString()}] BUY signal for ${ticker} detected by rule '${rule.id}' at price ${currentPrice.toFixed(2)}`);
            successfulBuys.push({
               timestamp: currentTime.toISOString(),
               price: currentPrice
            });
            // In a backtest, you might want to simulate holding and then selling
            // For this request, we are only tracking buys.
            break; // Log only the first matching buy rule for this ticker at this time
         }
      }

      currentTime = new Date(currentTime.getTime() + intervalMs);
   }

   console.log(`[${new Date().toISOString()}] Backtest complete for ${ticker}.`);
   console.log("--- Successful Buy Signals ---");
   successfulBuys.forEach(buy => {
      console.log(`Time: ${buy.timestamp}, Price: ${buy.price.toFixed(2)}`);
   });
   console.log(`Total Buy Signals: ${successfulBuys.length}`);
}


/**
 * Evaluates a single trading rule condition.
 * This is a simplified version adapted for backtesting, primarily for buy rules.
 * @param ticker
 * @param {object} rule - The rule object from config.
 * @param {number} currentPrice - The current market price of the asset.
 * @param {Array<number>} historicalPrices - Array of historical prices needed for indicator calculations.
 * @param {object} [holdingDetails] - Details of the current holding (not used for buy rules)
 * @returns {boolean} True if the rule condition is met, false otherwise.
 */
function evaluateRuleCondition(ticker, rule, currentPrice, historicalPrices, holdingDetails = {}) {
   const params = rule.params;
   const hPrices = Array.isArray(historicalPrices) ? historicalPrices : [];

   // Ensure enough historical data for calculations
   // This check is crucial for indicators like SMA, Bollinger Bands, ROC
   if (hPrices.length === 0) {
      return false;
   }

   switch (rule.type) {
      case "sma_dip_percentage":
         const smaPeriod = params.sma_days * 1440; // Convert days to minutes (1440 minutes per day)
         if (hPrices.length < smaPeriod) return false; // Not enough data for SMA calculation
         const sma = calculations.calculateSMA(hPrices, smaPeriod);
         if (sma === null) return false;
         const targetSmaPrice = sma * (1 - params.percentage_below_sma / 100);
         if(currentPrice <= targetSmaPrice) {
            console.log("TargetSMAPrice: " + targetSmaPrice);
         }

         return currentPrice <= targetSmaPrice;

      case "bollinger_lower_band_cross":
         const bbPeriod = params.period;
         if (hPrices.length < bbPeriod) return false; // Not enough data for BB calculation
         const bbLower = calculations.calculateBollingerBands(hPrices, bbPeriod, params.std_dev_multiplier);
         return bbLower && bbLower.lowerBand !== null && currentPrice <= bbLower.lowerBand;

      case "roc_dip":
         const rocPeriodBuy = params.roc_period;
         if (hPrices.length < rocPeriodBuy + 1) return false; // Need roc_period + 1 values for ROC
         // The `slice` ensures we get the exact window for ROC calculation ending with `currentPrice`
         const pricesForRocBuy = [...hPrices.slice(-(rocPeriodBuy)), currentPrice];
         const rocBuy = calculations.calculateROC(pricesForRocBuy, rocPeriodBuy);
         return rocBuy !== null && rocBuy <= params.dip_percentage_trigger;

      default:
         // Ignore sell rules for backtesting buy signals
         if (rule.type.startsWith("profit_percentage_target") ||
            rule.type.startsWith("bollinger_upper_band_cross") ||
            rule.type.startsWith("roc_spike")) {
            return false;
         }
         console.warn(`[${new Date().toISOString()}] Unknown or unsupported rule type for buy backtest: ${rule.type} for rule ID '${rule.id}'.`);
         return false;
   }
}


// Example Usage:
// To run the backtest, save this file as `backtest.js`
// and run it using Node.js:
// node backtest.js <ticker> <start_date> <end_date>
// Example: node backtest.js BTC-USD 2023-01-01T00:00:00Z 2023-01-02T00:00:00Z

if (require.main === module) {
   const args = process.argv.slice(2);
   if (args.length < 3) {
      console.error("Usage: node backtest.js <ticker> <start_date_ISO> <end_date_ISO>");
      console.error("Example: node backtest.js BTC-USD 2023-01-01T00:00:00Z 2023-01-02T00:00:00Z");
      process.exit(1);
   }
   const [ticker, startDate, endDate] = args;
   runBacktest(ticker, startDate, endDate).catch(error => {
      console.error(`[${new Date().toISOString()}] Backtest failed:`, error);
      process.exit(1);
   });
}