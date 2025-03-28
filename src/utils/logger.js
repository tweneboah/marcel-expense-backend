import winston from "winston";
import "winston-daily-rotate-file";
import path from "path";
import fs from "fs";

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaString = Object.keys(meta).length
      ? JSON.stringify(meta, null, 2)
      : "";
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaString}`;
  })
);

// Console transport configuration
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaString = Object.keys(meta).length
      ? JSON.stringify(meta, null, 2)
      : "";
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaString}`;
  })
);

// File transport for all logs
const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename: "logs/application-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxSize: "20m",
  maxFiles: "14d",
  format: logFormat,
});

// File transport for error logs
const errorFileRotateTransport = new winston.transports.DailyRotateFile({
  filename: "logs/error-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxSize: "20m",
  maxFiles: "14d",
  level: "error",
  format: logFormat,
});

// Database specific logger
const dbFileRotateTransport = new winston.transports.DailyRotateFile({
  filename: "logs/database-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxSize: "20m",
  maxFiles: "14d",
  format: logFormat,
});

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: logFormat,
  defaultMeta: { service: "expense-tracker" },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
    fileRotateTransport,
    errorFileRotateTransport,
  ],
  exitOnError: false,
});

// Create database specific logger
const dbLogger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: logFormat,
  defaultMeta: { service: "database-connection" },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
    dbFileRotateTransport,
    errorFileRotateTransport,
  ],
  exitOnError: false,
});

// Log uncaught exceptions and unhandled rejections
logger.exceptions.handle(
  new winston.transports.File({
    filename: "logs/exceptions.log",
    format: logFormat,
  })
);

if (process.env.NODE_ENV !== "production") {
  logger.debug("Logging initialized at debug level");
}

export { logger, dbLogger };
