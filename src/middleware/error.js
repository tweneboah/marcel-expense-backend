import ErrorResponse from "../utils/errorResponse.js";
import { logger } from "../utils/logger.js";

/**
 * Global error handling middleware for Express
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log detailed error information
  logger.error({
    message: "Error encountered",
    errorName: err.name,
    errorCode: err.code,
    errorMessage: err.message,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip || req.headers["x-forwarded-for"] || "unknown",
    stack: err.stack,
    body:
      req.body && Object.keys(req.body).length
        ? "(request body present)"
        : "(no request body)",
  });

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    const message = `Resource not found with id of ${err.value}`;
    error = new ErrorResponse(message, 404);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = "Duplicate field value entered";
    error = new ErrorResponse(message, 400);
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
    error = new ErrorResponse(message, 400);
  }

  // Express-validator errors
  if (err.array && typeof err.array === "function") {
    const message = err
      .array()
      .map((err) => `${err.param}: ${err.msg}`)
      .join(", ");
    error = new ErrorResponse(message, 400);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || "Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

export default errorHandler;
