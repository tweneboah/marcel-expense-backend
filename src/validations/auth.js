import { check } from "express-validator";

export const registerValidation = [
  check("name")
    .notEmpty()
    .withMessage("Name is required")
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage("Name must be between 3 and 50 characters"),

  check("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  check("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),

  check("role")
    .optional()
    .isIn(["admin", "sales_rep"])
    .withMessage("Role must be either admin or sales_rep"),

  check("status")
    .optional()
    .isIn(["active", "inactive"])
    .withMessage("Status must be either active or inactive"),
];

export const loginValidation = [
  check("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  check("password").notEmpty().withMessage("Password is required"),
];

export const updatePasswordValidation = [
  check("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),

  check("newPassword")
    .notEmpty()
    .withMessage("New password is required")
    .isLength({ min: 6 })
    .withMessage("New password must be at least 6 characters"),
];

export const forgotPasswordValidation = [
  check("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),
];

export const resetPasswordValidation = [
  check("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
];

export const updateProfileValidation = [
  check("name")
    .notEmpty()
    .withMessage("Name is required")
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage("Name must be between 3 and 50 characters"),

  check("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),
];
