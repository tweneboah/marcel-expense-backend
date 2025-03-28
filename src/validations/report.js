import { check } from "express-validator";

export const reportStatusValidation = [
  check("status")
    .notEmpty()
    .withMessage("Status is required")
    .isIn(["draft", "submitted", "approved", "rejected"])
    .withMessage("Status must be one of: draft, submitted, approved, rejected"),

  check("comments")
    .optional()
    .isLength({ max: 1000 })
    .withMessage("Comments cannot be more than 1000 characters"),
];

export const reportReimbursementValidation = [
  check("reimbursedAmount")
    .notEmpty()
    .withMessage("Reimbursed amount is required")
    .isFloat({ min: 0 })
    .withMessage("Reimbursed amount must be a positive number")
    .toFloat(),

  check("comments")
    .optional()
    .isLength({ max: 1000 })
    .withMessage("Comments cannot be more than 1000 characters"),
];

export const createReportValidation = [
  check("month")
    .notEmpty()
    .withMessage("Month is required")
    .isInt({ min: 1, max: 12 })
    .withMessage("Month must be between 1 and 12")
    .toInt(),

  check("year")
    .notEmpty()
    .withMessage("Year is required")
    .isInt({ min: 2000, max: 2100 })
    .withMessage("Year must be between 2000 and 2100")
    .toInt(),
];
