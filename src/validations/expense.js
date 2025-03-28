import { check, oneOf, body } from "express-validator";

export const createExpenseValidation = [
  check("category")
    .notEmpty()
    .withMessage("Category is required")
    .isMongoId()
    .withMessage("Invalid category ID"),

  check("startingPoint")
    .notEmpty()
    .withMessage("Starting point is required")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Starting point must be between 2 and 100 characters"),

  check("destinationPoint")
    .notEmpty()
    .withMessage("Destination point is required")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Destination point must be between 2 and 100 characters"),

  check("startingPointPlaceId")
    .optional()
    .trim()
    .isString()
    .withMessage("Starting point place ID must be a string"),

  check("destinationPointPlaceId")
    .optional()
    .trim()
    .isString()
    .withMessage("Destination point place ID must be a string"),

  check("formattedStartingAddress")
    .optional()
    .trim()
    .isString()
    .withMessage("Formatted starting address must be a string"),

  check("formattedDestinationAddress")
    .optional()
    .trim()
    .isString()
    .withMessage("Formatted destination address must be a string"),

  check("waypoints")
    .optional()
    .isArray()
    .withMessage("Waypoints must be an array"),

  check("waypoints.*.placeId")
    .optional()
    .isString()
    .withMessage("Waypoint place ID must be a string"),

  // Conditionally require distance and costPerKm if place IDs aren't provided
  oneOf(
    [
      [
        check("startingPointPlaceId").exists(),
        check("destinationPointPlaceId").exists(),
      ],
      [
        check("distance")
          .notEmpty()
          .withMessage("Distance is required")
          .isFloat({ min: 0.1 })
          .withMessage("Distance must be a positive number")
          .toFloat(),
        check("costPerKm")
          .notEmpty()
          .withMessage("Cost per km is required")
          .isFloat({ min: 0.01 })
          .withMessage("Cost per km must be a positive number")
          .toFloat(),
      ],
    ],
    "Either provide both place IDs for automatic calculation or manually enter distance and costPerKm"
  ),

  // Make these optional but still validate if provided
  check("distance")
    .optional()
    .isFloat({ min: 0.1 })
    .withMessage("Distance must be a positive number")
    .toFloat(),

  check("costPerKm")
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage("Cost per km must be a positive number")
    .toFloat(),

  check("journeyDate")
    .notEmpty()
    .withMessage("Journey date is required")
    .isISO8601()
    .withMessage("Journey date must be a valid date"),

  check("notes")
    .optional()
    .isLength({ max: 1000 })
    .withMessage("Notes cannot be more than 1000 characters"),
];

export const updateExpenseValidation = [
  check("category").optional().isMongoId().withMessage("Invalid category ID"),

  check("startingPoint")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Starting point must be between 2 and 100 characters"),

  check("destinationPoint")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Destination point must be between 2 and 100 characters"),

  check("startingPointPlaceId")
    .optional()
    .trim()
    .isString()
    .withMessage("Starting point place ID must be a string"),

  check("destinationPointPlaceId")
    .optional()
    .trim()
    .isString()
    .withMessage("Destination point place ID must be a string"),

  check("formattedStartingAddress")
    .optional()
    .trim()
    .isString()
    .withMessage("Formatted starting address must be a string"),

  check("formattedDestinationAddress")
    .optional()
    .trim()
    .isString()
    .withMessage("Formatted destination address must be a string"),

  check("waypoints")
    .optional()
    .isArray()
    .withMessage("Waypoints must be an array"),

  check("waypoints.*.placeId")
    .optional()
    .isString()
    .withMessage("Waypoint place ID must be a string"),

  check("distance")
    .optional()
    .isFloat({ min: 0.1 })
    .withMessage("Distance must be a positive number")
    .toFloat(),

  check("costPerKm")
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage("Cost per km must be a positive number")
    .toFloat(),

  check("journeyDate")
    .optional()
    .isISO8601()
    .withMessage("Journey date must be a valid date"),

  check("notes")
    .optional()
    .isLength({ max: 1000 })
    .withMessage("Notes cannot be more than 1000 characters"),
];
