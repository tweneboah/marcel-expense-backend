import asyncHandler from "express-async-handler";
import Expense from "../models/Expense.js";
import Report from "../models/Report.js";
import ErrorResponse from "../utils/errorResponse.js";
import Setting from "../models/Setting.js";
import axios from "axios";

// @desc    Get all expenses
// @route   GET /api/v1/expenses
// @access  Private
export const getExpenses = asyncHandler(async (req, res) => {
  let query;

  // Copy req.query
  const reqQuery = { ...req.query };

  // Fields to exclude
  const removeFields = ["select", "sort", "page", "limit"];

  // Loop over removeFields and delete them from reqQuery
  removeFields.forEach((param) => delete reqQuery[param]);

  // Create query string
  let queryStr = JSON.stringify(reqQuery);

  // Create operators ($gt, $gte, etc)
  queryStr = queryStr.replace(
    /\b(gt|gte|lt|lte|in)\b/g,
    (match) => `$${match}`
  );

  // Finding resource - restrict to logged in user if not admin
  if (req.user.role !== "admin") {
    query = Expense.find({ user: req.user.id, ...JSON.parse(queryStr) });
  } else {
    query = Expense.find(JSON.parse(queryStr));
  }

  // Select Fields
  if (req.query.select) {
    const fields = req.query.select.split(",").join(" ");
    query = query.select(fields);
  }

  // Sort
  if (req.query.sort) {
    const sortBy = req.query.sort.split(",").join(" ");
    query = query.sort(sortBy);
  } else {
    query = query.sort("-createdAt");
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await Expense.countDocuments();

  query = query.skip(startIndex).limit(limit);

  // Populate
  query = query.populate("category");

  // Executing query
  const expenses = await query;

  // Pagination result
  const pagination = {};

  if (endIndex < total) {
    pagination.next = {
      page: page + 1,
      limit,
    };
  }

  if (startIndex > 0) {
    pagination.prev = {
      page: page - 1,
      limit,
    };
  }

  res.status(200).json({
    success: true,
    count: expenses.length,
    pagination,
    data: expenses,
  });
});

// @desc    Get single expense
// @route   GET /api/v1/expenses/:id
// @access  Private
export const getExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id).populate("category");

  if (!expense) {
    throw new ErrorResponse(
      `No expense found with id of ${req.params.id}`,
      404
    );
  }

  // Make sure user is expense owner or admin
  if (expense.user.toString() !== req.user.id && req.user.role !== "admin") {
    throw new ErrorResponse("Not authorized to access this expense", 403);
  }

  res.status(200).json({
    success: true,
    data: expense,
  });
});

// Add this function to check budget limits after expense is created or updated
const checkBudgetLimits = async (expense) => {
  try {
    // Call the internal API to update usage statistics for the category
    const response = await axios.post(
      `${process.env.BASE_URL}/api/v1/categories/${expense.category}/budget/update-usage`,
      {},
      {
        headers: {
          Authorization: `Bearer ${process.env.API_INTERNAL_TOKEN}`,
        },
      }
    );

    // Get budget usage with alert status
    const usageResponse = await axios.get(
      `${process.env.BASE_URL}/api/v1/categories/${expense.category}/budget/usage`,
      {
        headers: {
          Authorization: `Bearer ${process.env.API_INTERNAL_TOKEN}`,
        },
      }
    );

    // Check if any budget limits are near threshold or exceeded
    const budgetAlerts = usageResponse.data.data.filter(
      (budget) =>
        budget.alertStatus === "warning" || budget.alertStatus === "exceeded"
    );

    // Return any alerts that need to be shown to the user
    return budgetAlerts;
  } catch (error) {
    console.error("Error checking budget limits:", error.message);
    return [];
  }
};

// @desc    Create new expense
// @route   POST /api/v1/expenses
// @access  Private
export const createExpense = asyncHandler(async (req, res, next) => {
  // Add user to req.body
  req.body.user = req.user.id;

  // Check if using Google Maps place IDs for calculation
  if (req.body.startingPointPlaceId && req.body.destinationPointPlaceId) {
    try {
      // Import here to avoid circular dependency
      const { calculateDistance, calculateRouteWithWaypoints } = await import(
        "../utils/googleMaps.js"
      );

      let routeData;

      // Calculate with or without waypoints
      if (req.body.waypoints && req.body.waypoints.length > 0) {
        // Format waypoints for the API - support both simple placeIds and full waypoint objects
        const formattedWaypoints = req.body.waypoints
          .map((wp) => {
            if (typeof wp === "string") {
              return wp;
            } else if (wp.placeId) {
              return {
                placeId: wp.placeId,
                stopover: wp.stopover !== false,
                description: wp.description || "",
              };
            }
            return null;
          })
          .filter(Boolean); // Remove any null values

        // Check if optimization is requested
        const options = {
          optimize: req.body.optimizeWaypoints === true,
          alternatives: req.body.includeAlternatives === true,
        };

        routeData = await calculateRouteWithWaypoints(
          req.body.startingPointPlaceId,
          req.body.destinationPointPlaceId,
          formattedWaypoints,
          options
        );

        // If we have detailed waypoint information, update the req.body.waypoints with formatted addresses
        if (routeData.waypoints && routeData.waypoints.length > 0) {
          // Store enhanced waypoint data
          req.body.waypoints = routeData.waypoints.map((wp, index) => ({
            placeId:
              formattedWaypoints[index].placeId || formattedWaypoints[index],
            description: wp.name || "",
            formattedAddress: wp.formattedAddress || "",
          }));
        }
      } else {
        routeData = await calculateDistance(
          req.body.startingPointPlaceId,
          req.body.destinationPointPlaceId
        );
      }

      // Update request with calculated values
      req.body.distance = routeData.distanceValue;
      req.body.duration = routeData.durationText;
      req.body.durationInSeconds = routeData.durationValue;
      req.body.isCalculatedDistance = true;

      // Store detailed route information
      req.body.routeSnapshot = {
        distanceValue: routeData.distanceValue,
        durationValue: routeData.durationValue,
        durationText: routeData.durationText,
        origin: routeData.origin,
        destination: routeData.destination,
        waypoints: routeData.waypoints || [],
        legs: routeData.legs || [],
        optimizedWaypointOrder: routeData.optimizedWaypointOrder || null,
        route: routeData.route || null,
      };

      // Store formatted addresses if available
      if (routeData.origin) {
        req.body.formattedStartingAddress = routeData.origin.formattedAddress;
      }

      if (routeData.destination) {
        req.body.formattedDestinationAddress =
          routeData.destination.formattedAddress;
      }

      console.log("Google Maps calculation successful:", {
        distance: req.body.distance,
        duration: req.body.duration,
        waypoints: req.body.waypoints?.length || 0,
      });
    } catch (error) {
      console.error("Error calculating route with Google Maps:", error);

      // Check if API key is missing
      if (error.message && error.message.includes("API key is missing")) {
        return next(
          new ErrorResponse(
            "Google Maps API key is missing. Please configure it in the server or provide distance manually.",
            500
          )
        );
      }

      // If Google Maps fails, we need either manual distance or we'll get validation errors
      if (!req.body.distance || !req.body.costPerKm) {
        return next(
          new ErrorResponse(
            "Google Maps calculation failed. Please provide distance and costPerKm manually.",
            400
          )
        );
      }
    }
  } else if (!req.body.distance) {
    return next(
      new ErrorResponse(
        "Either provide Google Maps place IDs or specify distance manually.",
        400
      )
    );
  }

  // Check if costPerKm is provided, otherwise use default from settings
  if (!req.body.costPerKm) {
    try {
      const costSetting = await Setting.findOne({ key: "defaultCostPerKm" });
      if (costSetting) {
        req.body.costPerKm = parseFloat(costSetting.value);
        console.log(
          "Using default costPerKm from settings:",
          req.body.costPerKm
        );
      } else {
        return next(
          new ErrorResponse(
            "Cost per km is required and no default is set",
            400
          )
        );
      }
    } catch (error) {
      console.error("Error fetching default cost per km:", error);
      return next(
        new ErrorResponse(
          "Error fetching default cost settings. Please provide costPerKm manually.",
          500
        )
      );
    }
  }

  // Validate journey date is not in the future
  const journeyDate = new Date(req.body.journeyDate);
  if (journeyDate > new Date()) {
    return next(new ErrorResponse("Journey date cannot be in the future", 400));
  }

  // Calculate totalCost if not provided
  if (!req.body.totalCost) {
    req.body.totalCost = req.body.distance * req.body.costPerKm;
  }

  // Additional logging to help debug
  console.log("Creating expense with data:", {
    category: req.body.category,
    startingPoint: req.body.startingPoint,
    destinationPoint: req.body.destinationPoint,
    distance: req.body.distance,
    costPerKm: req.body.costPerKm,
    totalCost: req.body.totalCost,
  });

  try {
    const expense = await Expense.create(req.body);

    // Update or create monthly report
    const month = journeyDate.getMonth() + 1; // 1-12
    const year = journeyDate.getFullYear();

    let report = await Report.findOne({
      user: req.user.id,
      month,
      year,
    });

    if (report) {
      // Update existing report
      report.totalDistance += expense.distance;
      report.totalExpenseAmount += expense.totalCost;
      report.pendingAmount += expense.totalCost;
      report.expenses.push(expense._id);

      // If report was already submitted or approved, revert to draft
      if (report.status === "submitted" || report.status === "approved") {
        report.status = "draft";
        report.comments = `Report reverted to draft due to new expense added on ${
          new Date().toISOString().split("T")[0]
        }`;
      }

      await report.save();
    } else {
      // Create new report
      await Report.create({
        user: req.user.id,
        month,
        year,
        status: "draft",
        totalDistance: expense.distance,
        totalExpenseAmount: expense.totalCost,
        reimbursedAmount: 0,
        pendingAmount: expense.totalCost,
        expenses: [expense._id],
      });
    }

    // Check budget limits after creating expense
    const budgetAlerts = await checkBudgetLimits(expense);

    res.status(201).json({
      success: true,
      data: expense,
      budgetAlerts: budgetAlerts.length > 0 ? budgetAlerts : null,
    });
  } catch (error) {
    console.error("Error creating expense:", error);
    return next(
      new ErrorResponse(`Error creating expense: ${error.message}`, 500)
    );
  }
});

// @desc    Update expense
// @route   PUT /api/v1/expenses/:id
// @access  Private
export const updateExpense = asyncHandler(async (req, res, next) => {
  let expense = await Expense.findById(req.params.id);

  if (!expense) {
    return next(
      new ErrorResponse(`No expense found with id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is the expense owner or an admin
  if (expense.user.toString() !== req.user.id && req.user.role !== "admin") {
    return next(
      new ErrorResponse(`User not authorized to update this expense`, 403)
    );
  }

  // Check if route calculation has changed
  const recalculateRoute =
    (req.body.startingPointPlaceId &&
      req.body.startingPointPlaceId !== expense.startingPointPlaceId) ||
    (req.body.destinationPointPlaceId &&
      req.body.destinationPointPlaceId !== expense.destinationPointPlaceId) ||
    (req.body.waypoints &&
      JSON.stringify(req.body.waypoints) !== JSON.stringify(expense.waypoints));

  // If using Google Maps and route has changed, recalculate
  if (
    recalculateRoute &&
    req.body.startingPointPlaceId &&
    req.body.destinationPointPlaceId
  ) {
    try {
      // Import here to avoid circular dependency
      const { calculateDistance, calculateRouteWithWaypoints } = await import(
        "../utils/googleMaps.js"
      );

      let routeData;

      // Calculate with or without waypoints
      if (req.body.waypoints && req.body.waypoints.length > 0) {
        // Format waypoints for the API - support both simple placeIds and full waypoint objects
        const formattedWaypoints = req.body.waypoints
          .map((wp) => {
            if (typeof wp === "string") {
              return wp;
            } else if (wp.placeId) {
              return {
                placeId: wp.placeId,
                stopover: wp.stopover !== false,
                description: wp.description || "",
              };
            }
            return null;
          })
          .filter(Boolean);

        // Check if optimization is requested
        const options = {
          optimize: req.body.optimizeWaypoints === true,
          alternatives: req.body.includeAlternatives === true,
        };

        routeData = await calculateRouteWithWaypoints(
          req.body.startingPointPlaceId,
          req.body.destinationPointPlaceId,
          formattedWaypoints,
          options
        );

        // If we have detailed waypoint information, update the req.body.waypoints with formatted addresses
        if (routeData.waypoints && routeData.waypoints.length > 0) {
          // Store enhanced waypoint data
          req.body.waypoints = routeData.waypoints.map((wp, index) => ({
            placeId:
              formattedWaypoints[index].placeId || formattedWaypoints[index],
            description: wp.name || "",
            formattedAddress: wp.formattedAddress || "",
          }));
        }
      } else {
        routeData = await calculateDistance(
          req.body.startingPointPlaceId,
          req.body.destinationPointPlaceId
        );
      }

      // Update request with calculated values
      req.body.distance = routeData.distanceValue;
      req.body.duration = routeData.durationText;
      req.body.durationInSeconds = routeData.durationValue;
      req.body.isCalculatedDistance = true;

      // Store detailed route information
      req.body.routeSnapshot = {
        distanceValue: routeData.distanceValue,
        durationValue: routeData.durationValue,
        durationText: routeData.durationText,
        origin: routeData.origin,
        destination: routeData.destination,
        waypoints: routeData.waypoints || [],
        legs: routeData.legs || [],
        optimizedWaypointOrder: routeData.optimizedWaypointOrder || null,
        route: routeData.route || null,
      };

      // Store formatted addresses if available
      if (routeData.origin) {
        req.body.formattedStartingAddress = routeData.origin.formattedAddress;
      }

      if (routeData.destination) {
        req.body.formattedDestinationAddress =
          routeData.destination.formattedAddress;
      }

      console.log("Google Maps calculation successful for update:", {
        distance: req.body.distance,
        duration: req.body.duration,
        waypoints: req.body.waypoints?.length || 0,
      });
    } catch (error) {
      console.error("Error calculating route with Google Maps:", error);

      // Check if API key is missing
      if (error.message && error.message.includes("API key is missing")) {
        return next(
          new ErrorResponse(
            "Google Maps API key is missing. Please configure it in the server or provide distance manually.",
            500
          )
        );
      }

      // If Google Maps fails, we need either manual distance or we'll get validation errors
      if (!req.body.distance) {
        return next(
          new ErrorResponse(
            "Google Maps calculation failed. Please provide distance manually.",
            400
          )
        );
      }
    }
  }

  // Update the totalCost if distance or costPerKm has changed
  if (req.body.distance || req.body.costPerKm) {
    const distance = req.body.distance || expense.distance;
    const costPerKm = req.body.costPerKm || expense.costPerKm;
    req.body.totalCost = distance * costPerKm;
  }

  // Add updatedBy field
  req.body.updatedBy = req.user.id;

  // Store previous values for report updating
  const previousDistance = expense.distance;
  const previousTotalCost = expense.totalCost;
  const previousDate = new Date(expense.journeyDate);
  const previousMonth = previousDate.getMonth() + 1;
  const previousYear = previousDate.getFullYear();

  // Get new date from request or use previous
  let newJourneyDate = req.body.journeyDate
    ? new Date(req.body.journeyDate)
    : previousDate;
  const newMonth = newJourneyDate.getMonth() + 1;
  const newYear = newJourneyDate.getFullYear();

  // Update the expense
  expense = await Expense.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  // Update reports
  if (previousMonth === newMonth && previousYear === newYear) {
    // Same month, just update totals
    let report = await Report.findOne({
      user: expense.user,
      month: newMonth,
      year: newYear,
    });

    if (report) {
      report.totalDistance =
        report.totalDistance - previousDistance + expense.distance;
      report.totalExpenseAmount =
        report.totalExpenseAmount - previousTotalCost + expense.totalCost;
      report.pendingAmount =
        report.pendingAmount - previousTotalCost + expense.totalCost;

      // If report was already submitted or approved, revert to draft
      if (report.status === "submitted" || report.status === "approved") {
        report.status = "draft";
        report.comments = `Report reverted to draft due to expense update on ${
          new Date().toISOString().split("T")[0]
        }`;
      }

      await report.save();
    }
  } else {
    // Different month, need to update both reports
    // Update old report
    let oldReport = await Report.findOne({
      user: expense.user,
      month: previousMonth,
      year: previousYear,
    });

    if (oldReport) {
      // Remove expense from old report
      oldReport.expenses = oldReport.expenses.filter(
        (expId) => expId.toString() !== expense._id.toString()
      );
      oldReport.totalDistance -= previousDistance;
      oldReport.totalExpenseAmount -= previousTotalCost;
      oldReport.pendingAmount -= previousTotalCost;

      // If report was already submitted or approved, revert to draft
      if (oldReport.status === "submitted" || oldReport.status === "approved") {
        oldReport.status = "draft";
        oldReport.comments = `Report reverted to draft due to expense moved to different month on ${
          new Date().toISOString().split("T")[0]
        }`;
      }

      await oldReport.save();
    }

    // Update or create new report
    let newReport = await Report.findOne({
      user: expense.user,
      month: newMonth,
      year: newYear,
    });

    if (newReport) {
      // Add to existing report
      newReport.expenses.push(expense._id);
      newReport.totalDistance += expense.distance;
      newReport.totalExpenseAmount += expense.totalCost;
      newReport.pendingAmount += expense.totalCost;

      // If report was already submitted or approved, revert to draft
      if (newReport.status === "submitted" || newReport.status === "approved") {
        newReport.status = "draft";
        newReport.comments = `Report reverted to draft due to expense added from another month on ${
          new Date().toISOString().split("T")[0]
        }`;
      }

      await newReport.save();
    } else {
      // Create new report
      await Report.create({
        user: expense.user,
        month: newMonth,
        year: newYear,
        status: "draft",
        totalDistance: expense.distance,
        totalExpenseAmount: expense.totalCost,
        reimbursedAmount: 0,
        pendingAmount: expense.totalCost,
        expenses: [expense._id],
      });
    }
  }

  // Check budget limits after updating expense
  const budgetAlerts = await checkBudgetLimits(expense);

  res.status(200).json({
    success: true,
    data: expense,
    budgetAlerts: budgetAlerts.length > 0 ? budgetAlerts : null,
  });
});

// @desc    Delete expense
// @route   DELETE /api/v1/expenses/:id
// @access  Private
export const deleteExpense = asyncHandler(async (req, res, next) => {
  const expense = await Expense.findById(req.params.id);

  if (!expense) {
    return next(
      new ErrorResponse(`No expense found with id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is expense owner or admin
  if (expense.user.toString() !== req.user.id && req.user.role !== "admin") {
    return next(
      new ErrorResponse("Not authorized to delete this expense", 403)
    );
  }

  // Update report
  const journeyDate = new Date(expense.journeyDate);
  const month = journeyDate.getMonth() + 1;
  const year = journeyDate.getFullYear();

  let report = await Report.findOne({
    user: expense.user,
    month,
    year,
  });

  if (report) {
    // Remove expense from report
    report.expenses = report.expenses.filter(
      (expId) => expId.toString() !== expense._id.toString()
    );
    report.totalDistance -= expense.distance;
    report.totalExpenseAmount -= expense.totalCost;
    report.pendingAmount -= expense.totalCost;

    // If report was already submitted or approved, revert to draft
    if (report.status === "submitted" || report.status === "approved") {
      report.status = "draft";
      report.comments = `Report reverted to draft due to expense deletion on ${
        new Date().toISOString().split("T")[0]
      }`;
    }

    // If this was the last expense in the report, delete the report
    if (report.expenses.length === 0) {
      await Report.findByIdAndDelete(report._id);
    } else {
      await report.save();
    }
  }

  await expense.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

/**
 * @desc    Get expenses with route data for visualization
 * @route   GET /api/v1/expenses/routes
 * @access  Private
 */
export const getExpensesWithRoutes = asyncHandler(async (req, res, next) => {
  // Parse query parameters for filtering
  const { startDate, endDate, limit = 10 } = req.query;

  // Build query
  const query = { user: req.user.id };

  // Add date filtering if provided
  if (startDate || endDate) {
    query.journeyDate = {};
    if (startDate) {
      query.journeyDate.$gte = new Date(startDate);
    }
    if (endDate) {
      query.journeyDate.$lte = new Date(endDate);
    }
  }

  // Only include expenses with route snapshots
  query.routeSnapshot = { $ne: null };

  // Find expenses with route data
  const expenses = await Expense.find(query)
    .sort({ journeyDate: -1 })
    .limit(parseInt(limit, 10))
    .populate({
      path: "category",
      select: "name color",
    });

  // Import getRouteFromSnapshot to format route data
  const { getRouteFromSnapshot } = await import("../utils/googleMaps.js");

  // Format the response with key route information
  const formattedExpenses = expenses.map((expense) => {
    const routeData = getRouteFromSnapshot(expense.routeSnapshot);

    return {
      id: expense._id,
      startingPoint: expense.startingPoint,
      destinationPoint: expense.destinationPoint,
      formattedStartingAddress: expense.formattedStartingAddress,
      formattedDestinationAddress: expense.formattedDestinationAddress,
      distance: expense.distance,
      duration: expense.duration,
      journeyDate: expense.journeyDate,
      totalCost: expense.totalCost,
      category: expense.category,
      status: expense.status,
      waypoints: expense.waypoints || [],
      route: routeData
        ? {
            polyline: routeData.route?.polyline,
            bounds: routeData.route?.bounds,
          }
        : null,
    };
  });

  res.status(200).json({
    success: true,
    count: formattedExpenses.length,
    data: formattedExpenses,
  });
});
