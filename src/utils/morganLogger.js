import morgan from "morgan";
import { logger } from "./logger.js";

// Create a stream object with a 'write' function that will be used by Morgan
const stream = {
  // Use the Winston logger to write log entries
  write: (message) => {
    // Remove trailing newline that Morgan adds
    const logMessage = message.trim();
    logger.http(logMessage);
  },
};

// Define custom Morgan token for request body
morgan.token("body", (req) => {
  if (req.method === "POST" || req.method === "PUT") {
    const sanitizedBody = { ...req.body };

    // Sanitize sensitive fields if they exist
    if (sanitizedBody.password) sanitizedBody.password = "[REDACTED]";
    if (sanitizedBody.token) sanitizedBody.token = "[REDACTED]";
    if (sanitizedBody.jwt) sanitizedBody.jwt = "[REDACTED]";

    // Only log body if not empty
    return Object.keys(sanitizedBody).length
      ? JSON.stringify(sanitizedBody)
      : "";
  }
  return "";
});

// Define custom token for response time in a more readable format
morgan.token("response-time-formatted", (req, res) => {
  // Get response time from Morgan's built-in token (in ms)
  const time = morgan["response-time"](req, res);

  // Format based on the time
  if (time < 100) return `${time}ms`;
  if (time < 1000) return `${time}ms`;
  return `${(time / 1000).toFixed(2)}s`;
});

// Define custom token for colorized status code (for console only)
morgan.token("status-colored", (req, res) => {
  const status = res.statusCode;
  let color = "\x1b[32m"; // Green

  if (status >= 400 && status < 500) {
    color = "\x1b[33m"; // Yellow
  } else if (status >= 500) {
    color = "\x1b[31m"; // Red
  }

  return `${color}${status}\x1b[0m`; // Reset color after status
});

// Development format - more verbose, colorized
const developmentFormat =
  ":method :url :status-colored :response-time-formatted :body";

// Production format - more concise
const productionFormat =
  ":remote-addr :method :url :status :response-time-formatted";

// Create a middleware function that decides which format to use based on the environment
const morganMiddleware = morgan(
  process.env.NODE_ENV === "production" ? productionFormat : developmentFormat,
  { stream }
);

export default morganMiddleware;
