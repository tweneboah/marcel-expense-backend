import asyncHandler from "express-async-handler";
import ErrorResponse from "../utils/errorResponse.js";
import {
  getPlacePredictions,
  getPlaceDetails as fetchPlaceDetails,
  calculateDistance,
  calculateRouteWithWaypoints,
  getRouteFromSnapshot,
} from "../utils/googleMaps.js";
import Expense from "../models/Expense.js";

/**
 * @desc    Get place suggestions based on input
 * @route   GET /api/v1/maps/places/autocomplete?input=...
 * @access  Private
 */
export const getPlaceSuggestions = asyncHandler(async (req, res, next) => {
  const { input } = req.query;

  if (!input) {
    return next(new ErrorResponse("Please provide an input query", 400));
  }

  const predictions = await getPlacePredictions(input);

  res.status(200).json({
    success: true,
    count: predictions.length,
    data: predictions,
  });
});

/**
 * @desc    Get details for a specific place
 * @route   GET /api/v1/maps/places/details/:placeId
 * @access  Private
 */
export const getPlaceDetails = asyncHandler(async (req, res, next) => {
  const { placeId } = req.params;

  if (!placeId) {
    return next(new ErrorResponse("Please provide a place ID", 400));
  }

  const placeDetails = await fetchPlaceDetails(placeId);

  res.status(200).json({
    success: true,
    data: placeDetails,
  });
});

/**
 * @desc    Calculate distance between two points
 * @route   POST /api/v1/maps/distance
 * @access  Private
 */
export const calculateRoute = asyncHandler(async (req, res, next) => {
  const { originPlaceId, destinationPlaceId, waypoints } = req.body;

  if (!originPlaceId || !destinationPlaceId) {
    return next(
      new ErrorResponse("Please provide origin and destination place IDs", 400)
    );
  }

  try {
    let routeData;

    // If waypoints are provided, calculate a route with waypoints
    if (waypoints && waypoints.length > 0) {
      // Validate waypoints structure
      for (const waypoint of waypoints) {
        if (typeof waypoint === "object" && !waypoint.placeId) {
          return next(
            new ErrorResponse(
              "Each waypoint object must have a placeId property",
              400
            )
          );
        }
      }

      routeData = await calculateRouteWithWaypoints(
        originPlaceId,
        destinationPlaceId,
        waypoints,
        { optimize: false, alternatives: false }
      );
    } else {
      // Otherwise, just calculate direct distance
      routeData = await calculateDistance(originPlaceId, destinationPlaceId);
    }

    res.status(200).json({
      success: true,
      data: routeData,
    });
  } catch (error) {
    console.error(`Error in route calculation: ${error.message}`);
    return next(
      new ErrorResponse(`Error calculating route: ${error.message}`, 500)
    );
  }
});

/**
 * @desc    Calculate optimized route with multiple waypoints
 * @route   POST /api/v1/maps/route/optimize
 * @access  Private
 */
export const calculateOptimizedRoute = asyncHandler(async (req, res, next) => {
  const {
    originPlaceId,
    destinationPlaceId,
    waypoints,
    optimizeWaypoints = false,
    includeAlternatives,
  } = req.body;

  if (!originPlaceId || !destinationPlaceId) {
    return next(
      new ErrorResponse("Please provide origin and destination place IDs", 400)
    );
  }

  if (!waypoints || !Array.isArray(waypoints) || waypoints.length === 0) {
    return next(new ErrorResponse("Please provide at least one waypoint", 400));
  }

  // Validate waypoints structure
  for (const waypoint of waypoints) {
    if (typeof waypoint === "object" && !waypoint.placeId) {
      return next(
        new ErrorResponse(
          "Each waypoint object must have a placeId property",
          400
        )
      );
    }
  }

  try {
    const options = {
      optimize: optimizeWaypoints === true,
      alternatives: includeAlternatives === true,
    };

    const routeData = await calculateRouteWithWaypoints(
      originPlaceId,
      destinationPlaceId,
      waypoints,
      options
    );

    res.status(200).json({
      success: true,
      data: routeData,
    });
  } catch (error) {
    console.error(`Error in route optimization: ${error.message}`);
    return next(
      new ErrorResponse(`Error calculating route: ${error.message}`, 500)
    );
  }
});

/**
 * @desc    Get trip detail from a stored route snapshot
 * @route   GET /api/v1/maps/route/snapshot/:expenseId
 * @access  Private
 */
export const getRouteSnapshot = asyncHandler(async (req, res, next) => {
  const { expenseId } = req.params;

  const expense = await Expense.findById(expenseId);

  if (!expense) {
    return next(
      new ErrorResponse(`No expense found with id of ${expenseId}`, 404)
    );
  }

  // Check if user is authorized to access this expense
  if (expense.user.toString() !== req.user.id && req.user.role !== "admin") {
    return next(
      new ErrorResponse(`User not authorized to access this expense`, 403)
    );
  }

  // Check if there's a route snapshot stored
  if (!expense.routeSnapshot) {
    return next(
      new ErrorResponse(`No route snapshot found for this expense`, 404)
    );
  }

  // Format the route data from the snapshot
  const routeData = getRouteFromSnapshot(expense.routeSnapshot);

  res.status(200).json({
    success: true,
    data: {
      expense: {
        id: expense._id,
        startingPoint: expense.startingPoint,
        destinationPoint: expense.destinationPoint,
        distance: expense.distance,
        journeyDate: expense.journeyDate,
      },
      route: routeData,
    },
  });
});

/**
 * @desc    Store route snapshot for an expense
 * @route   POST /api/v1/maps/route/snapshot/:expenseId
 * @access  Private
 */
export const storeRouteSnapshot = asyncHandler(async (req, res, next) => {
  const { expenseId } = req.params;
  const { routeData } = req.body;

  if (!routeData) {
    return next(new ErrorResponse("Please provide route data to store", 400));
  }

  const expense = await Expense.findById(expenseId);

  if (!expense) {
    return next(
      new ErrorResponse(`No expense found with id of ${expenseId}`, 404)
    );
  }

  // Check if user is authorized to update this expense
  if (expense.user.toString() !== req.user.id && req.user.role !== "admin") {
    return next(
      new ErrorResponse(`User not authorized to update this expense`, 403)
    );
  }

  // Update the expense with the route snapshot
  expense.routeSnapshot = routeData;
  expense.updatedBy = req.user.id;

  await expense.save();

  res.status(200).json({
    success: true,
    data: {
      message: "Route snapshot stored successfully",
      expenseId: expense._id,
    },
  });
});
