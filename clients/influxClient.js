const { InfluxDB, Point } = require('@influxdata/influxdb-client');

let CONFIG;
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
   queryApi = client.getQueryApi(org);

   console.log(`[${new Date().toISOString()}] InfluxDB client initialized.`);
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
         const rowObject = tableMeta.toObject(values);
         prices.push(parseFloat(rowObject._value));
      }
   } catch (error) {
      console.error(`[${new Date().toISOString()}] Error querying historical prices for ${ticker}:`, error);
   }
   return prices;
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
      for await (const { values, tableMeta } of queryApi.iterateRows(fluxQuery)) {
         const rowObject = tableMeta.toObject(values);
         latestPrice = rowObject._value;
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
   getLatestPrice,
};