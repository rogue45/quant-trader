/**
 * Calculates the Simple Moving Average (SMA) for a given set of prices over a specified period.
 * @param {Array<number>} prices - An array of historical prices.
 * @param {number} period - The number of periods to consider for the SMA.
 * @returns {number|null} The calculated SMA, or null if there aren't enough prices.
 */
function calculateSMA(prices, period) {
   if (!prices || prices.length < period) {
      return null;
   }
   const relevantPrices = prices.slice(-period); // Get the most recent prices for the period
   const sum = relevantPrices.reduce((acc, price) => acc + parseFloat(price), 0);
   return sum / period;
}

/**
 * Calculates the Standard Deviation for a given set of prices over a specified period.
 * @param {Array<number>} prices - An array of historical prices.
 * @param {number} period - The number of periods to consider for the standard deviation.
 * @returns {number|null} The calculated Standard Deviation, or null if there aren't enough prices or mean is null.
 */
function calculateStandardDeviation(prices, period) {
   if (!prices || prices.length < period) {
      return null;
   }
   const relevantPrices = prices.slice(-period);
   const mean = calculateSMA(relevantPrices, period);
   if (mean === null) {
      return null;
   }
   const variance = relevantPrices.reduce((acc, price) => acc + Math.pow(price - mean, 2), 0) / period;
   return Math.sqrt(variance);
}

/**
 * Calculates the Bollinger Bands (Middle, Upper, and Lower) for a given set of prices.
 * @param {Array<number>} prices - An array of historical prices.
 * @param {number} period - The number of periods for the SMA calculation.
 * @param {number} stdDevMultiplier - The multiplier for the standard deviation (e.g., 2.0 for 2 standard deviations).
 * @returns {object|null} An object containing middleBand, upperBand, and lowerBand, or null if calculations fail.
 */
function calculateBollingerBands(prices, period, stdDevMultiplier) {
   if (!prices || prices.length < period) {
      return null;
   }
   const middleBand = calculateSMA(prices, period);
   if (middleBand === null) {
      return { middleBand: null, upperBand: null, lowerBand: null };
   }
   const stdDev = calculateStandardDeviation(prices, period);
   if (stdDev === null) {
      return { middleBand, upperBand: null, lowerBand: null };
   }
   const upperBand = middleBand + (stdDev * stdDevMultiplier);
   const lowerBand = middleBand - (stdDev * stdDevMultiplier);
   return { middleBand, upperBand, lowerBand };
}

/**
 * Calculates the Rate of Change (ROC) for a given set of prices.
 * @param {Array<number>} prices - An array of historical prices.
 * @param {number} rocPeriod - The number of periods to look back for the ROC calculation.
 * @returns {number|null} The calculated ROC as a percentage, or null if there aren't enough prices or pastPrice is zero.
 */
function calculateROC(prices, rocPeriod) {
   if (!prices || prices.length < rocPeriod + 1) {
      return null;
   }
   const currentPrice = prices[prices.length - 1];
   const pastPrice = prices[prices.length - 1 - rocPeriod];

   if (pastPrice === 0 || pastPrice === null || currentPrice === null) {
      return null; // Avoid division by zero or invalid prices
   }

   return ((currentPrice - pastPrice) / pastPrice) * 100;
}

module.exports = {
   calculateSMA,
   calculateStandardDeviation,
   calculateBollingerBands,
   calculateROC,
};