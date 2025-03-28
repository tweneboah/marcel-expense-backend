/**
 * Format a number as CHF currency
 * @param {number} amount - The amount to format
 * @returns {string} - Formatted amount in CHF
 */
export const formatCHF = (amount) => {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Format a date to a short readable format
 * @param {Date|string} date - The date to format
 * @returns {string} - Formatted date
 */
export const formatDate = (date) => {
  if (!date) return "";
  const dateObj = new Date(date);
  return dateObj.toLocaleDateString("de-CH");
};

/**
 * Get month name from month number
 * @param {number} month - Month number (1-12)
 * @returns {string} - Month name
 */
export const getMonthName = (month) => {
  const date = new Date(2000, month - 1, 1);
  return date.toLocaleString("default", { month: "long" });
};

/**
 * Get quarter name from quarter number
 * @param {number} quarter - Quarter number (1-4)
 * @returns {string} - Quarter name
 */
export const getQuarterName = (quarter) => {
  return `Q${quarter}`;
};

/**
 * Format a duration in seconds to a readable format
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration
 */
export const formatDuration = (seconds) => {
  if (!seconds) return "N/A";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} hr ${minutes} min`;
  }
  return `${minutes} min`;
};

/**
 * Format distance in kilometers
 * @param {number} distance - Distance in kilometers
 * @returns {string} - Formatted distance
 */
export const formatDistance = (distance) => {
  if (distance === undefined || distance === null) return "N/A";
  return `${distance.toFixed(2)} km`;
};

/**
 * Format expense status with proper capitalization
 * @param {string} status - The expense status
 * @returns {string} - Formatted status
 */
export const formatStatus = (status) => {
  if (!status) return "";
  return status.charAt(0).toUpperCase() + status.slice(1);
};

export default {
  formatCHF,
  formatDate,
  getMonthName,
  getQuarterName,
  formatDuration,
  formatDistance,
  formatStatus,
};
