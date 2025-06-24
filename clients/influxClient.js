const { InfluxDB, Point } = require('@influxdata/influxdb-client');

let CONFIG;
let writeApiMarketData; // Dedicated write API for market_data
let writeApiTradeLogs;  // Dedicated write API for trade_logs
let queryApi;

/**
 * Initializes the InfluxDB client with provided configuration.
 * Call this once at the start of your application.
 * @param {object} config - The configuration object containing InfluxDB details.
 */
function initializeInfluxClient(config) {
   CONFIG = config;
   const url = CONFIG.influxdb.url;
   const token = process.env.INFLUX_DB_TOKEN;
   const org = CONFIG.influxdb.org;
   const marketDataBucket = CONFIG.influxdb.bucket; // market_data
   const tradeLogsBucket = CONFIG.influxdb.trade_events_bucket; // trade_logs

   if (!url || !token || !org || !marketDataBucket || !tradeLogsBucket) {
      console.error("InfluxDB configuration is incomplete. Skipping InfluxDB initialization.");
      return;
   }

   const client = new InfluxDB({ url, token });
   writeApiMarketData = client.getWriteApi(org, marketDataBucket); // For market data
   writeApiTradeLogs = client.getWriteApi(org, tradeLogsBucket); // For trade logs
   queryApi = client.getQueryApi(org);

   console.log(`[${new Date().toISOString()}] InfluxDB client initialized.`);
}

/**
 * Logs a trade event to InfluxDB.
 * @param {object} eventData - Details of the trade event.
 * @param {string} eventData.ticker - The trading pair.
 * @param {string} eventData.event_type - Type of event (e.g., "BUY_TRIGGER", "SELL_EXECUTION").
 * @param {number} eventData.price - The price at which the event occurred.
 * @param {string} [eventData.rule_id] - ID of the rule that triggered the event.
 * @param {string} [eventData.rule_type] - Type of the rule.
 * @param {object} [eventData.details] - Additional details for the event.
 */
async function logTradeEvent(eventData) {
   if (!writeApiTradeLogs) { // Use the dedicated trade logs write API
      console.log(`[${new Date().toISOString()}] InfluxDB logging skipped (no writeApiTradeLogs): ${JSON.stringify(eventData)}`);
      return;
   }
   const tradeMeasurement = CONFIG.influxdb.trade_events_measurement || 'trading_events';
   const point = new Point(tradeMeasurement)
      .tag('ticker', eventData.ticker)
      .tag('event_type', eventData.event_type)
      .tag('rule_id', eventData.rule_id)
      .tag('rule_type', eventData.rule_type);

   point.floatField('price', eventData.price);
   if (eventData.quantity !== undefined) point.floatField('quantity', eventData.quantity);
   if (eventData.usdAmount !== undefined) point.floatField('usdAmount', eventData.usdAmount);


   // Add any additional details as fields
   if (eventData.details) {
      Object.entries(eventData.details).forEach(([key, value]) => {
         if (typeof value === 'number' && !isNaN(value)) point.floatField(key, value);
         else if (typeof value === 'boolean') point.booleanField(key, value);
         else point.stringField(key, String(value));
      });
   }
   point.timestamp(eventData.timestamp || new Date());

   try {
      writeApiTradeLogs.writePoint(point); // Write to trade logs bucket
      await writeApiTradeLogs.flush();
      console.log(`[${new Date().toISOString()}] InfluxDB: Logged ${eventData.event_type} for ${eventData.ticker} via rule '${eventData.rule_id}'.`);
   } catch (error) {
      console.error(`[${new Date().toISOString()}] Error writing trade event to InfluxDB:`, error);
   }
}

/**
 * Fetches historical price data for a given ticker from InfluxDB.
 * @param {string} ticker - The trading pair (e.g., "BTC-USD").
 * @param {string} range - Time range for the query (e.g., "-1h", "-7d").
 * @returns {Promise<Array<number>>} An array of historical prices, or an empty array if none found.
 */
async function getHistoricalPrices(ticker, range = "-1h") {
   const priceMeasurement = CONFIG.influxdb.price_measurement || 'spot_price';
   const fluxQuery = `from(bucket: "${CONFIG.influxdb.bucket}") // Reads from market_data bucket
    |> range(start: ${range})
    |> filter(fn: (r) => r._measurement == "${priceMeasurement}")
    |> filter(fn: (r) => r._field == "price")
    |> filter(fn: (r) => r["source"] == "coinbase")
    |> filter(fn: (r) => r["ticker"] == "${ticker}")
    |> yield(name: "prices")`;

   const prices = [];
   try {
      for await (const { values, tableMeta } of queryApi.iterateRows(fluxQuery)) {
         const o = rowsParser(tableMeta, values);

         prices.push(o._value);
      }
   } catch (error) {
      console.error(`[${new Date().toISOString()}] Error querying historical prices for ${ticker}:`, error);
   }
   return prices;
}

/**
 * Retrieves the effective purchase price and quantity for a currently held asset from InfluxDB.
 * This function calculates a weighted average purchase price based on BUY and SELL events.
 * @param {string} ticker - The trading pair (e.g., "ETH-USD").
 * @returns {Promise<{purchasePrice: number, quantity: number}|null>} An object with the weighted
 * average purchase price and the net quantity, or null if no historical data.
 */
async function getHoldingDetailsFromInfluxDB(ticker) {
   // Use the dedicated trade events bucket for reading holdings
   const tradeEventsBucket = CONFIG.influxdb.trade_events_bucket || 'trade_logs';
   const tradeMeasurement = CONFIG.influxdb.trade_events_measurement || 'trading_events';

   const fluxQuery = `from(bucket: "${tradeEventsBucket}") // Reads from trade_logs bucket
    |> range(start: 0) // Query all historical data
    |> filter(fn: (r) => r._measurement == "${tradeMeasurement}")
    |> filter(fn: (r) => r.ticker == "${ticker}")
        |> filter(fn: (r) => r.ticker == "${ticker}")
      |> filter(fn: (r) =>
      r._field == "price" or
      r._field == "quantity" or
      r._field == "usdAmount"
    )
    |> filter(fn: (r) => 
      r.event_type == "MANUAL_BUY_EXECUTION" or
      r.event_type == "BUY_EXECUTION")
    |> pivot(rowKey:["_time", "ticker", "event_type", "rule_id", "rule_type"], columnKey: ["_field"], valueColumn: "_value")
    |> sort(columns: ["_time"], desc: false)`; // Ensure chronological order

   let totalQuantity = 0;
   let totalCost = 0;
   let lastTradeTime = null;

   try {
      // Destructure 'values' and 'tableMeta' from iterateRows
      for await (const { values, tableMeta } of queryApi.iterateRows(fluxQuery)) {
         // Use flux.getRows to get a structured object for the current row
         const o = rowsParser(tableMeta, values);

         const eventType = o.event_type;
         const quantity = parseFloat(o.quantity || '0');
         const price = parseFloat(o.price || '0');
         const usdAmount = parseFloat(o.usdAmount || '0');
         const eventTime = new Date(o._time);

         if (eventType.includes("BUY")) {
            totalQuantity += quantity;
            totalCost += usdAmount;
         } else if (eventType.includes("SELL")) {
            if (totalQuantity > 0) {
               const avgCostPerUnit = totalCost / totalQuantity;
               totalQuantity -= quantity;
               totalCost -= (quantity * avgCostPerUnit);
               if (totalQuantity < 0) totalQuantity = 0;
               if (totalCost < 0) totalCost = 0;
            }
         }
         lastTradeTime = eventTime;
      }
   } catch (error) {
      console.error(`[${new Date().toISOString()}] Error querying historical trade events for ${ticker}:`, error);
      return null;
   }

   if (totalQuantity > 0 && totalCost >= 0) {
      return {
         purchasePrice: totalCost / totalQuantity,
         quantity: totalQuantity,
         timestamp: lastTradeTime ? lastTradeTime.toISOString() : new Date().toISOString()
      };
   }
   return null;
}

/**
 * Fetches the latest spot price for a given ticker from InfluxDB.
 * @param {string} ticker - The trading pair (e.g., "BTC-USD").
 * @returns {Promise<number|null>} The latest price, or null if not found.
 */
async function getLatestPrice(ticker) {
   const priceMeasurement = CONFIG.influxdb.price_measurement || 'spot_price';
   const fluxQuery = `from(bucket: "${CONFIG.influxdb.bucket}") // Reads from market_data bucket
    |> range(start: -5m)
    |> filter(fn: (r) => r._measurement == "${priceMeasurement}")
    |> filter(fn: (r) => r.ticker == "${ticker}")
    |> filter(fn: (r) => r._field == "price")
    |> last()
    |> yield(name: "last_price")`;

   let latestPrice = null;
   try {
      for await (const { values } of queryApi.iterateRows(fluxQuery)) {
         latestPrice = values[5];
         break;
      }
   } catch (error) {
      console.error(`[${new Date().toISOString()}] Error querying latest price for ${ticker}:`, error);
   }
   return latestPrice;
}



function rowsParser(keyObjectArray, valuesArray) {
   const resultObject = {};

   let keysArray = keyObjectArray.columns.map(obj => obj.label);

   // Validate inputs
   if (!Array.isArray(valuesArray)) {
      console.error("Values Input must be arrays.");
      return resultObject;
   }

   if (keysArray.length !== valuesArray.length) {
      console.error("Arrays must be of equal length to create a valid object.");
      return resultObject;
   }

   // Iterate over the arrays and populate the object
   for (let i = 0; i < keysArray.length; i++) {
      const key = String(keysArray[i]);   // Ensure key is a string
      const value = String(valuesArray[i]); // Ensure value is a string
      resultObject[key] = value;
   }

   return resultObject;
}

module.exports = {
   initializeInfluxClient,
   getHistoricalPrices,
   logTradeEvent,
   getHoldingDetailsFromInfluxDB,
   getLatestPrice,
};