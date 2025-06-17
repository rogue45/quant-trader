/**
 * @fileoverview A utility script to manually log a cryptocurrency purchase
 * to the InfluxDB 'trade_logs' bucket.
 * This is useful for accounting for trades made outside the bot.
 */

const fs = require('fs');
const path = require('path');
const { InfluxDB, Point } = require('@influxdata/influxdb-client');

// --- Configuration Loading ---
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

// --- InfluxDB Client Setup ---
let writeApi;
if (CONFIG.influxdb && CONFIG.influxdb.url && CONFIG.influxdb.token && CONFIG.influxdb.org && CONFIG.influxdb.trade_events_bucket) {
   const influxDB = new InfluxDB({ url: CONFIG.influxdb.url, token: CONFIG.influxdb.token });
   writeApi = influxDB.getWriteApi(CONFIG.influxdb.org, CONFIG.influxdb.trade_events_bucket);
   console.log(`[${new Date().toISOString()}] InfluxDB: Initialized write API for bucket '${CONFIG.influxdb.trade_events_bucket}'.`);
} else {
   console.error(`[${new Date().toISOString()}] FATAL: InfluxDB trade events configuration incomplete (url, token, org, trade_events_bucket). Exiting.`);
   process.exit(1);
}

/**
 * Logs a manual purchase event to InfluxDB.
 * This simulates a 'BUY_EXECUTION' event as if the bot had made the trade.
 *
 * @param {string} ticker - The trading pair (ee.g., "ETH-USD", "BTC-USD").
 * @param {number} quantity - The amount of base currency purchased.
 * @param {number} price - The purchase price per unit of base currency (e.g., USD/ETH).
 * @param {string} [timestamp] - Optional ISO string timestamp for the event. Defaults to now.
 */
async function logManualPurchase(ticker, quantity, price, timestamp = new Date().toISOString()) {
   if (!writeApi) {
      console.error(`[${new Date().toISOString()}] InfluxDB write API not initialized. Cannot log manual purchase.`);
      return;
   }

   const usdAmount = quantity * price; // Calculate total USD spent for the log

   const tradeMeasurement = CONFIG.influxdb.trade_events_measurement || 'trading_events';
   const point = new Point(tradeMeasurement)
      .tag('ticker', ticker)
      .tag('event_type', "MANUAL_BUY_EXECUTION") // Use a distinct event type for manual logs
      .tag('rule_id', "Manual_Entry")
      .tag('rule_type', "Manual");

   point.floatField('price', price);
   point.floatField('quantity', quantity);
   point.floatField('usdAmount', usdAmount);
   point.timestamp(new Date(timestamp));

   try {
      writeApi.writePoint(point);
      await writeApi.flush();
      console.log(`[${new Date().toISOString()}] Successfully logged manual purchase for ${ticker}: ${quantity.toFixed(8)} units at $${price.toFixed(2)} ($${usdAmount.toFixed(2)} total).`);
   } catch (error) {
      console.error(`[${new Date().toISOString()}] Error writing manual trade event to InfluxDB:`, error);
   } finally {
      if (writeApi) {
         try {
            await writeApi.close();
            console.log(`[${new Date().toISOString()}] InfluxDB write API closed.`);
         } catch (closeError) {
            console.error(`[${new Date().toISOString()}] Error closing InfluxDB write API:`, closeError);
         }
      }
   }
}

// --- Example Usage ---
// To run this, uncomment one of the lines below and adjust values.
// You can then run this file using 'node logManualTrade.js'

// Example 1: Log a manual purchase of 0.05 ETH at $1800 per ETH
// logManualPurchase("ETH-USD", 0.05, 1800);

// Example 2: Log a manual purchase of 0.0005 BTC at $65000 per BTC
// logManualPurchase("BTC-USD", 0.0005, 65000);

// Example 3: Log a manual purchase with a specific historical timestamp
// logManualPurchase("XRP-USD", 100, 0.50, "2024-01-15T10:30:00.000Z");

// Remember to uncomment only one line or modify to suit your needs before running.
// If you run this multiple times with the same ticker, the 'getHoldingDetailsFromInfluxDB'
// in your main bot will calculate a weighted average purchase price.

// IMPORTANT: Replace the example calls below with your actual manual purchase details.
// Make sure to call the function when running the script.
async function runScript() {
   // Replace these values with your actual manual purchase details
   const ticker = "ETH-USD";
   const quantity = 0.03898803; // Example quantity
   const price = 2549.50;   // Example purchase price

   console.log(`[${new Date().toISOString()}] Attempting to log manual purchase: ${quantity} ${ticker.split('-')[0]} at $${price}.`);
   await logManualPurchase(ticker, quantity, price);
   console.log(`[${new Date().toISOString()}] Manual purchase logging script finished.`);
}

runScript().catch(error => {
   console.error(`[${new Date().toISOString()}] Uncaught error in manual logging script:`, error);
   process.exit(1);
});