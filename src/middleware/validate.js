import { validationResult } from "express-validator";
import ErrorResponse from "../utils/errorResponse.js";

/**
 * Middleware to validate request data
 * @returns {Function} Express middleware
 */
const validate = (validations) => {
  return async (req, res, next) => {
    // Run all validations
    await Promise.all(validations.map((validation) => validation.run(req)));

    // Check if there are validation errors
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    // Format errors and send response
    const extractedErrors = errors.array().map((err) => ({
      field: err.param,
      message: err.msg,
    }));

    const errorMsg = extractedErrors
      .map((err) => `${err.field}: ${err.message}`)
      .join(", ");
    return next(new ErrorResponse(errorMsg, 400));
  };
};

export default validate;
