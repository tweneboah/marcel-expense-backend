import asyncHandler from "express-async-handler";
import ErrorResponse from "../utils/errorResponse.js";
import Expense from "../models/Expense.js";
import Category from "../models/Category.js";
import User from "../models/User.js";
import Setting from "../models/Setting.js";
import mongoose from "mongoose";

/**
 * Helper function to get date range for different period types
 * @param {string} periodType - Type of period (month, quarter, year)
 * @param {number} periodValue - Value of the period (e.g., month number, quarter number, year)
 * @param {number} year - Year for the period
 * @returns {Object} - Start and end dates for the period
 */
const getDateRangeForPeriod = (periodType, periodValue, year) => {
  let startDate, endDate;

  switch (periodType) {
    case "month":
      // Month is 0-indexed in JavaScript Date
      startDate = new Date(year, periodValue - 1, 1);
      endDate = new Date(year, periodValue, 0); // Last day of the month
      break;
    case "quarter":
      const quarterStartMonth = (periodValue - 1) * 3;
      startDate = new Date(year, quarterStartMonth, 1);
      endDate = new Date(year, quarterStartMonth + 3, 0); // Last day of the quarter
      break;
    case "year":
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31, 23, 59, 59, 999);
      break;
    default:
      throw new Error("Invalid period type. Use month, quarter, or year.");
  }

  return { startDate, endDate };
};

/**
 * @desc    Get expense summary by time period (month, quarter, year)
 * @route   GET /api/v1/analytics/expenses/time-summary
 * @access  Private
 */
export const getExpensesByTimePeriod = asyncHandler(async (req, res, next) => {
  const {
    periodType = "month",
    year = new Date().getFullYear(),
    userId,
  } = req.query;

  // Verify req.user exists
  if (!req.user) {
    return next(new ErrorResponse("User authentication required", 401));
  }

  // Admin can request data for any user, regular users only for themselves
  let userFilter = {};

  // Only filter by userId if it's explicitly provided and user is admin
  if (userId && req.user.role === "admin") {
    userFilter = { user: new mongoose.Types.ObjectId(userId) };
  } else if (req.user.role !== "admin") {
    // Non-admin users can only see their own data
    userFilter = { user: req.user._id };
  }
  // For admins without userId, don't filter by user (return all users' data)

  // Validate periodType
  if (!["month", "quarter", "year"].includes(periodType)) {
    return next(
      new ErrorResponse("Period type must be month, quarter, or year", 400)
    );
  }

  // Define the grouping based on period type
  let groupByPeriod;
  if (periodType === "month") {
    groupByPeriod = { $month: "$journeyDate" };
  } else if (periodType === "quarter") {
    // Calculate quarter from month: ceil(month/3)
    groupByPeriod = {
      $ceil: { $divide: [{ $month: "$journeyDate" }, 3] },
    };
  } else {
    groupByPeriod = { $year: "$journeyDate" };
  }

  // Set up year filter
  const yearFilter = { $year: "$journeyDate" };

  // Build the match condition for the aggregation
  const matchCondition = {
    journeyDate: {
      $gte: new Date(`${year}-01-01`),
      $lte: new Date(`${year}-12-31T23:59:59.999Z`),
    },
  };

  // Only add user filter if it's not empty
  if (Object.keys(userFilter).length > 0) {
    Object.assign(matchCondition, userFilter);
  }

  // Run aggregation
  const summary = await Expense.aggregate([
    {
      $match: matchCondition,
    },
    {
      $group: {
        _id: {
          period: groupByPeriod,
          year: yearFilter,
        },
        totalExpenses: { $sum: 1 },
        totalDistance: { $sum: "$distance" },
        totalCost: { $sum: "$totalCost" },
        avgDistance: { $avg: "$distance" },
        avgCost: { $avg: "$totalCost" },
        minCost: { $min: "$totalCost" },
        maxCost: { $max: "$totalCost" },
      },
    },
    {
      $sort: { "_id.period": 1 },
    },
    {
      $project: {
        _id: 0,
        period: "$_id.period",
        year: "$_id.year",
        totalExpenses: 1,
        totalDistance: 1,
        totalCost: 1,
        avgDistance: 1,
        avgCost: 1,
        minCost: 1,
        maxCost: 1,
      },
    },
  ]);

  // Format the response
  const formattedSummary = summary.map((item) => ({
    ...item,
    // Round decimal values for better readability
    totalDistance: Math.round(item.totalDistance * 100) / 100,
    totalCost: Math.round(item.totalCost * 100) / 100,
    avgDistance: Math.round(item.avgDistance * 100) / 100,
    avgCost: Math.round(item.avgCost * 100) / 100,
    minCost: Math.round(item.minCost * 100) / 100,
    maxCost: Math.round(item.maxCost * 100) / 100,
    // Format period label
    periodLabel:
      periodType === "month"
        ? new Date(0, item.period - 1).toLocaleString("default", {
            month: "long",
          })
        : periodType === "quarter"
        ? `Q${item.period}`
        : item.year.toString(),
  }));

  // Calculate totals and averages across all periods
  const totals = {
    totalExpenses: summary.reduce((sum, item) => sum + item.totalExpenses, 0),
    totalDistance:
      Math.round(
        summary.reduce((sum, item) => sum + item.totalDistance, 0) * 100
      ) / 100,
    totalCost:
      Math.round(summary.reduce((sum, item) => sum + item.totalCost, 0) * 100) /
      100,
  };

  if (totals.totalExpenses > 0) {
    totals.avgDistance =
      Math.round((totals.totalDistance / totals.totalExpenses) * 100) / 100;
    totals.avgCost =
      Math.round((totals.totalCost / totals.totalExpenses) * 100) / 100;
  }

  res.status(200).json({
    success: true,
    data: {
      summary: formattedSummary,
      totals,
      periodType,
      year,
    },
  });
});

/**
 * @desc    Get expense data for a specific time period
 * @route   GET /api/v1/analytics/expenses/period-detail
 * @access  Private
 */
export const getExpensesForPeriod = asyncHandler(async (req, res, next) => {
  const {
    periodType,
    periodValue,
    year = new Date().getFullYear(),
    userId,
    debug = "false",
  } = req.query;

  // Validate required parameters
  if (!periodType || !periodValue) {
    return next(new ErrorResponse("Period type and value are required", 400));
  }

  // Validate periodType
  if (!["month", "quarter", "year"].includes(periodType)) {
    return next(
      new ErrorResponse("Period type must be month, quarter, or year", 400)
    );
  }

  // Verify req.user exists
  if (!req.user) {
    return next(new ErrorResponse("User authentication required", 401));
  }

  // Admin can request data for any user, regular users only for themselves
  let userFilter = {};

  // Only filter by userId if it's explicitly provided and user is admin
  if (userId && req.user.role === "admin") {
    userFilter = { user: new mongoose.Types.ObjectId(userId) };
  } else if (req.user.role !== "admin") {
    // Non-admin users can only see their own data
    userFilter = { user: req.user._id };
  }
  // For admins without userId, don't filter by user (return all users' data)

  // Get date range for the period
  const { startDate, endDate } = getDateRangeForPeriod(
    periodType,
    periodValue,
    year
  );

  // Add debugging info if requested
  if (debug === "true") {
    console.log(
      `Period type: ${periodType}, Value: ${periodValue}, Year: ${year}`
    );
    console.log(
      `Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`
    );
    console.log(`User filter: ${JSON.stringify(userFilter)}`);
    console.log(`User role: ${req.user.role}`);

    // Check if any expenses exist for this filter
    const totalExpenses =
      Object.keys(userFilter).length > 0
        ? await Expense.countDocuments(userFilter)
        : await Expense.countDocuments();
    console.log(`Total expenses for filter: ${totalExpenses}`);

    // Get sample of expenses to check dates
    if (totalExpenses > 0) {
      const sampleExpenses = await Expense.find(userFilter)
        .select("journeyDate user")
        .sort("-journeyDate")
        .limit(5);

      console.log("Sample expense dates:");
      sampleExpenses.forEach((exp) => {
        console.log(
          `- ${exp._id}: ${exp.journeyDate.toISOString()} User: ${exp.user}`
        );
      });
    }
  }

  // Query filter
  const filter = {
    journeyDate: {
      $gte: startDate,
      $lte: endDate,
    },
  };

  // Only add user filter if it's not empty
  if (Object.keys(userFilter).length > 0) {
    Object.assign(filter, userFilter);
  }

  if (debug === "true") {
    console.log(`Final query filter: ${JSON.stringify(filter)}`);
  }

  // Query expenses for the specified period
  const expenses = await Expense.find(filter)
    .populate("category", "name color")
    .populate("user", "name email");

  if (debug === "true") {
    console.log(`Found ${expenses.length} expenses in the specified period`);

    // If no results, check if any expenses exist in a wider date range
    if (expenses.length === 0) {
      // Extend the date range by 1 year in both directions
      const widerStartDate = new Date(startDate);
      widerStartDate.setFullYear(widerStartDate.getFullYear() - 1);

      const widerEndDate = new Date(endDate);
      widerEndDate.setFullYear(widerEndDate.getFullYear() + 1);

      const widerFilter = {
        journeyDate: {
          $gte: widerStartDate,
          $lte: widerEndDate,
        },
      };

      // Only add user filter if it's not empty
      if (Object.keys(userFilter).length > 0) {
        Object.assign(widerFilter, userFilter);
      }

      const widerExpenses = await Expense.find(widerFilter)
        .select("journeyDate")
        .sort("journeyDate");

      console.log(
        `Found ${
          widerExpenses.length
        } expenses in wider date range: ${widerStartDate.toISOString()} to ${widerEndDate.toISOString()}`
      );

      if (widerExpenses.length > 0) {
        console.log(
          "First expense date:",
          widerExpenses[0].journeyDate.toISOString()
        );
        console.log(
          "Last expense date:",
          widerExpenses[widerExpenses.length - 1].journeyDate.toISOString()
        );
      }
    }
  }

  // Calculate summaries
  const summary = {
    totalExpenses: expenses.length,
    totalDistance:
      Math.round(
        expenses.reduce((sum, expense) => sum + expense.distance, 0) * 100
      ) / 100,
    totalCost:
      Math.round(
        expenses.reduce((sum, expense) => sum + expense.totalCost, 0) * 100
      ) / 100,
    averageCost:
      expenses.length > 0
        ? Math.round(
            (expenses.reduce((sum, expense) => sum + expense.totalCost, 0) /
              expenses.length) *
              100
          ) / 100
        : 0,
    averageDistance:
      expenses.length > 0
        ? Math.round(
            (expenses.reduce((sum, expense) => sum + expense.distance, 0) /
              expenses.length) *
              100
          ) / 100
        : 0,
  };

  // Format period information
  let periodInfo = {
    type: periodType,
    value: periodValue,
    year,
    startDate,
    endDate,
  };

  // Add human-readable label
  if (periodType === "month") {
    periodInfo.label = new Date(year, periodValue - 1, 1).toLocaleString(
      "default",
      { month: "long", year: "numeric" }
    );
  } else if (periodType === "quarter") {
    periodInfo.label = `Q${periodValue} ${year}`;
  } else {
    periodInfo.label = year.toString();
  }

  res.status(200).json({
    success: true,
    data: {
      summary,
      periodInfo,
      expenses: expenses.map((expense) => ({
        id: expense._id,
        date: expense.journeyDate,
        from: expense.startingPoint,
        to: expense.destinationPoint,
        distance: expense.distance,
        cost: expense.totalCost,
        category: expense.category
          ? {
              id: expense.category._id,
              name: expense.category.name,
              color: expense.category.color,
            }
          : null,
        status: expense.status,
      })),
    },
  });
});

/**
 * @desc    Get expense breakdown by category
 * @route   GET /api/v1/analytics/expenses/category-breakdown
 * @access  Private
 */
export const getExpensesByCategory = asyncHandler(async (req, res, next) => {
  const { startDate, endDate, userId } = req.query;

  // Validate date range if provided
  let dateFilter = {};
  if (startDate && endDate) {
    dateFilter = {
      journeyDate: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
    };
  } else if (startDate) {
    dateFilter = {
      journeyDate: {
        $gte: new Date(startDate),
      },
    };
  } else if (endDate) {
    dateFilter = {
      journeyDate: {
        $lte: new Date(endDate),
      },
    };
  }

  // Verify req.user exists
  if (!req.user) {
    return next(new ErrorResponse("User authentication required", 401));
  }

  // Admin can request data for any user, regular users only for themselves
  let userFilter = {};

  // Only filter by userId if it's explicitly provided and user is admin
  if (userId && req.user.role === "admin") {
    userFilter = { user: new mongoose.Types.ObjectId(userId) };
  } else if (req.user.role !== "admin") {
    // Non-admin users can only see their own data
    userFilter = { user: req.user._id };
  }
  // For admins without userId, don't filter by user (return all users' data)

  // Build match condition for aggregation
  const matchCondition = { ...dateFilter };

  // Only add user filter if it's not empty
  if (Object.keys(userFilter).length > 0) {
    Object.assign(matchCondition, userFilter);
  }

  // Run aggregation
  const categoryBreakdown = await Expense.aggregate([
    {
      $match: matchCondition,
    },
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "categoryInfo",
      },
    },
    {
      $unwind: "$categoryInfo",
    },
    {
      $group: {
        _id: "$category",
        categoryName: { $first: "$categoryInfo.name" },
        categoryColor: { $first: "$categoryInfo.color" },
        totalExpenses: { $sum: 1 },
        totalDistance: { $sum: "$distance" },
        totalCost: { $sum: "$totalCost" },
        avgCost: { $avg: "$totalCost" },
        avgDistance: { $avg: "$distance" },
      },
    },
    {
      $sort: { totalCost: -1 },
    },
    {
      $project: {
        _id: 0,
        categoryId: "$_id",
        categoryName: 1,
        categoryColor: 1,
        totalExpenses: 1,
        totalDistance: 1,
        totalCost: 1,
        avgCost: 1,
        avgDistance: 1,
      },
    },
  ]);

  // Calculate overall totals
  const totalExpenses = categoryBreakdown.reduce(
    (sum, cat) => sum + cat.totalExpenses,
    0
  );
  const totalCost = categoryBreakdown.reduce(
    (sum, cat) => sum + cat.totalCost,
    0
  );

  // Add percentage of total to each category
  const formattedBreakdown = categoryBreakdown.map((cat) => ({
    ...cat,
    // Round decimal values
    totalDistance: Math.round(cat.totalDistance * 100) / 100,
    totalCost: Math.round(cat.totalCost * 100) / 100,
    avgCost: Math.round(cat.avgCost * 100) / 100,
    avgDistance: Math.round(cat.avgDistance * 100) / 100,
    // Calculate percentages
    percentageOfTotalCost:
      totalCost > 0 ? Math.round((cat.totalCost / totalCost) * 10000) / 100 : 0,
    percentageOfTotalExpenses:
      totalExpenses > 0
        ? Math.round((cat.totalExpenses / totalExpenses) * 10000) / 100
        : 0,
  }));

  res.status(200).json({
    success: true,
    data: {
      categories: formattedBreakdown,
      totals: {
        totalCategories: formattedBreakdown.length,
        totalExpenses,
        totalCost: Math.round(totalCost * 100) / 100,
      },
      dateRange: {
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    },
  });
});

/**
 * @desc    Get expense trend data over time
 * @route   GET /api/v1/analytics/expenses/trends
 * @access  Private
 */
export const getExpenseTrends = asyncHandler(async (req, res, next) => {
  const { periodType = "month", months = 12, userId } = req.query;

  // Validate periodType
  if (!["day", "week", "month"].includes(periodType)) {
    return next(
      new ErrorResponse("Period type must be day, week, or month", 400)
    );
  }

  // Calculate date range
  const endDate = new Date();
  let startDate;

  if (periodType === "day") {
    startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - parseInt(months) * 30); // Approximate days
  } else if (periodType === "week") {
    startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - parseInt(months) * 30); // Approximate weeks
  } else {
    startDate = new Date(endDate);
    startDate.setMonth(endDate.getMonth() - parseInt(months));
  }

  // Admin can request data for any user, regular users only for themselves
  const userFilter =
    req.user.role === "admin" && userId
      ? { user: new mongoose.Types.ObjectId(userId) }
      : { user: req.user._id };

  // Define grouping
  let groupByDate;
  let dateFormat;

  if (periodType === "day") {
    groupByDate = {
      year: { $year: "$journeyDate" },
      month: { $month: "$journeyDate" },
      day: { $dayOfMonth: "$journeyDate" },
    };
    dateFormat = "%Y-%m-%d";
  } else if (periodType === "week") {
    groupByDate = {
      year: { $year: "$journeyDate" },
      week: { $week: "$journeyDate" },
    };
    dateFormat = "Week %V, %Y";
  } else {
    groupByDate = {
      year: { $year: "$journeyDate" },
      month: { $month: "$journeyDate" },
    };
    dateFormat = "%Y-%m";
  }

  // Run aggregation
  const trendData = await Expense.aggregate([
    {
      $match: {
        ...userFilter,
        journeyDate: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $group: {
        _id: groupByDate,
        dateString: {
          $first: {
            $dateToString: { format: dateFormat, date: "$journeyDate" },
          },
        },
        totalExpenses: { $sum: 1 },
        totalDistance: { $sum: "$distance" },
        totalCost: { $sum: "$totalCost" },
      },
    },
    {
      $sort: {
        "_id.year": 1,
        "_id.month": 1,
        "_id.day": 1,
        "_id.week": 1,
      },
    },
    {
      $project: {
        _id: 0,
        dateParts: "$_id",
        dateString: 1,
        totalExpenses: 1,
        totalDistance: 1,
        totalCost: 1,
      },
    },
  ]);

  // Format trend data with proper date objects
  const formattedTrendData = trendData.map((item) => {
    let date;

    if (periodType === "day") {
      date = new Date(
        item.dateParts.year,
        item.dateParts.month - 1,
        item.dateParts.day
      );
    } else if (periodType === "week") {
      // Calculate the date of the first day of the week
      const janFirst = new Date(item.dateParts.year, 0, 1);
      date = new Date(janFirst);
      date.setDate(janFirst.getDate() + (item.dateParts.week - 1) * 7);
    } else {
      date = new Date(item.dateParts.year, item.dateParts.month - 1, 1);
    }

    return {
      date,
      dateString: item.dateString,
      totalExpenses: item.totalExpenses,
      totalDistance: Math.round(item.totalDistance * 100) / 100,
      totalCost: Math.round(item.totalCost * 100) / 100,
    };
  });

  // Calculate moving averages
  const movingAveragePeriods = [3, 6]; // 3-period and 6-period moving averages

  // Helper function to calculate moving average for a given period
  const calculateMovingAverage = (data, period, field) => {
    return data.map((item, index) => {
      if (index < period - 1) return null;

      let sum = 0;
      for (let i = 0; i < period; i++) {
        sum += data[index - i][field];
      }
      return Math.round((sum / period) * 100) / 100;
    });
  };

  // Calculate moving averages for total cost
  const movingAverages = {};

  movingAveragePeriods.forEach((period) => {
    if (formattedTrendData.length >= period) {
      movingAverages[`ma${period}`] = calculateMovingAverage(
        formattedTrendData,
        period,
        "totalCost"
      );
    }
  });

  res.status(200).json({
    success: true,
    data: {
      trends: formattedTrendData,
      movingAverages,
      dateRange: {
        startDate,
        endDate,
      },
      periodType,
    },
  });
});

/**
 * @desc    Get yearly comparison data
 * @route   GET /api/v1/analytics/expenses/yearly-comparison
 * @access  Private
 */
export const getYearlyComparison = asyncHandler(async (req, res, next) => {
  const { year1, year2, userId } = req.query;

  // Validate years
  if (!year1 || !year2) {
    return next(
      new ErrorResponse("Two years are required for comparison", 400)
    );
  }

  // Admin can request data for any user, regular users only for themselves
  const userFilter =
    req.user.role === "admin" && userId
      ? { user: new mongoose.Types.ObjectId(userId) }
      : { user: req.user._id };

  // Function to get data for a specific year
  const getYearData = async (year) => {
    return Expense.aggregate([
      {
        $match: {
          ...userFilter,
          journeyDate: {
            $gte: new Date(`${year}-01-01`),
            $lte: new Date(`${year}-12-31T23:59:59.999Z`),
          },
        },
      },
      {
        $group: {
          _id: { $month: "$journeyDate" },
          totalExpenses: { $sum: 1 },
          totalDistance: { $sum: "$distance" },
          totalCost: { $sum: "$totalCost" },
        },
      },
      {
        $sort: { _id: 1 },
      },
      {
        $project: {
          _id: 0,
          month: "$_id",
          totalExpenses: 1,
          totalDistance: 1,
          totalCost: 1,
        },
      },
    ]);
  };

  // Get data for both years
  const [data1, data2] = await Promise.all([
    getYearData(year1),
    getYearData(year2),
  ]);

  // Helper function to create a full 12-month array with zeros for missing months
  const createFullYearData = (yearData) => {
    const fullYear = [];
    for (let month = 1; month <= 12; month++) {
      const monthData = yearData.find((item) => item.month === month);
      if (monthData) {
        fullYear.push({
          ...monthData,
          totalDistance: Math.round(monthData.totalDistance * 100) / 100,
          totalCost: Math.round(monthData.totalCost * 100) / 100,
        });
      } else {
        fullYear.push({
          month,
          totalExpenses: 0,
          totalDistance: 0,
          totalCost: 0,
        });
      }
    }
    return fullYear;
  };

  // Format data with all 12 months and calculate year totals
  const fullYear1Data = createFullYearData(data1);
  const fullYear2Data = createFullYearData(data2);

  // Calculate yearly totals
  const calculateYearTotals = (yearData) => {
    return {
      totalExpenses: yearData.reduce(
        (sum, month) => sum + month.totalExpenses,
        0
      ),
      totalDistance:
        Math.round(
          yearData.reduce((sum, month) => sum + month.totalDistance, 0) * 100
        ) / 100,
      totalCost:
        Math.round(
          yearData.reduce((sum, month) => sum + month.totalCost, 0) * 100
        ) / 100,
    };
  };

  const year1Totals = calculateYearTotals(fullYear1Data);
  const year2Totals = calculateYearTotals(fullYear2Data);

  // Calculate change percentages
  const calculateChange = (value1, value2) => {
    if (value1 === 0) return value2 === 0 ? 0 : 100; // Handle division by zero
    return Math.round(((value2 - value1) / value1) * 10000) / 100;
  };

  const changes = {
    totalExpenses: calculateChange(
      year1Totals.totalExpenses,
      year2Totals.totalExpenses
    ),
    totalDistance: calculateChange(
      year1Totals.totalDistance,
      year2Totals.totalDistance
    ),
    totalCost: calculateChange(year1Totals.totalCost, year2Totals.totalCost),
  };

  res.status(200).json({
    success: true,
    data: {
      year1: {
        year: parseInt(year1),
        months: fullYear1Data,
        totals: year1Totals,
      },
      year2: {
        year: parseInt(year2),
        months: fullYear2Data,
        totals: year2Totals,
      },
      changes,
      // Add month names for easier chart labeling
      monthNames: fullYear1Data.map((_, index) => {
        return new Date(2000, index).toLocaleString("default", {
          month: "short",
        });
      }),
    },
  });
});

/**
 * @desc    Get dashboard summary for the main frontend dashboard
 * @route   GET /api/v1/analytics/dashboard
 * @access  Private
 */
export const getDashboardSummary = asyncHandler(async (req, res, next) => {
  // Verify user authentication
  if (!req.user) {
    return next(new ErrorResponse("User authentication required", 401));
  }

  // Determine user filter based on role
  let userFilter = {};
  if (req.user.role !== "admin") {
    // Regular users can only see their own data
    userFilter = { user: req.user._id };
  }

  // Get current date info
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // Months are 0-indexed in JS

  // Calculate current quarter
  const currentQuarter = Math.ceil(currentMonth / 3);

  // Set up date ranges
  const yearStartDate = new Date(currentYear, 0, 1);
  const yearEndDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);

  const monthStartDate = new Date(currentYear, currentMonth - 1, 1);
  const monthEndDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

  const quarterStartMonth = (currentQuarter - 1) * 3;
  const quarterStartDate = new Date(currentYear, quarterStartMonth, 1);
  const quarterEndDate = new Date(
    currentYear,
    quarterStartMonth + 3,
    0,
    23,
    59,
    59,
    999
  );

  // Get key metrics - yearly totals
  const yearlyMetrics = await Expense.aggregate([
    {
      $match: {
        ...userFilter,
        journeyDate: {
          $gte: yearStartDate,
          $lte: yearEndDate,
        },
      },
    },
    {
      $group: {
        _id: null,
        totalTrips: { $sum: 1 },
        totalDistance: { $sum: "$distance" },
        totalCost: { $sum: "$totalCost" },
        avgDistance: { $avg: "$distance" },
        avgCost: { $avg: "$totalCost" },
      },
    },
  ]);

  // Get key metrics - monthly totals
  const monthlyMetrics = await Expense.aggregate([
    {
      $match: {
        ...userFilter,
        journeyDate: {
          $gte: monthStartDate,
          $lte: monthEndDate,
        },
      },
    },
    {
      $group: {
        _id: null,
        totalTrips: { $sum: 1 },
        totalDistance: { $sum: "$distance" },
        totalCost: { $sum: "$totalCost" },
        avgDistance: { $avg: "$distance" },
        avgCost: { $avg: "$totalCost" },
      },
    },
  ]);

  // Get key metrics - quarterly totals
  const quarterlyMetrics = await Expense.aggregate([
    {
      $match: {
        ...userFilter,
        journeyDate: {
          $gte: quarterStartDate,
          $lte: quarterEndDate,
        },
      },
    },
    {
      $group: {
        _id: null,
        totalTrips: { $sum: 1 },
        totalDistance: { $sum: "$distance" },
        totalCost: { $sum: "$totalCost" },
        avgDistance: { $avg: "$distance" },
        avgCost: { $avg: "$totalCost" },
      },
    },
  ]);

  // Get recent expenses
  const recentExpenses = await Expense.find(userFilter)
    .sort({ journeyDate: -1 })
    .limit(5)
    .populate("category", "name color")
    .populate("user", "name");

  // Get category breakdown for current year
  const categoryBreakdown = await Expense.aggregate([
    {
      $match: {
        ...userFilter,
        journeyDate: {
          $gte: yearStartDate,
          $lte: yearEndDate,
        },
      },
    },
    {
      $group: {
        _id: "$category",
        totalTrips: { $sum: 1 },
        totalDistance: { $sum: "$distance" },
        totalCost: { $sum: "$totalCost" },
      },
    },
    {
      $lookup: {
        from: "categories",
        localField: "_id",
        foreignField: "_id",
        as: "categoryInfo",
      },
    },
    {
      $unwind: "$categoryInfo",
    },
    {
      $project: {
        _id: 0,
        categoryId: "$_id",
        categoryName: "$categoryInfo.name",
        color: "$categoryInfo.color",
        totalTrips: 1,
        totalDistance: 1,
        totalCost: 1,
      },
    },
    {
      $sort: { totalCost: -1 },
    },
  ]);

  // Monthly expenses for current year (for chart)
  const monthlyExpensesChart = await Expense.aggregate([
    {
      $match: {
        ...userFilter,
        journeyDate: {
          $gte: yearStartDate,
          $lte: yearEndDate,
        },
      },
    },
    {
      $group: {
        _id: { month: { $month: "$journeyDate" } },
        totalTrips: { $sum: 1 },
        totalDistance: { $sum: "$distance" },
        totalCost: { $sum: "$totalCost" },
      },
    },
    {
      $sort: { "_id.month": 1 },
    },
    {
      $project: {
        _id: 0,
        month: "$_id.month",
        monthName: {
          $let: {
            vars: {
              monthsArray: [
                "January",
                "February",
                "March",
                "April",
                "May",
                "June",
                "July",
                "August",
                "September",
                "October",
                "November",
                "December",
              ],
            },
            in: {
              $arrayElemAt: ["$$monthsArray", { $subtract: ["$_id.month", 1] }],
            },
          },
        },
        totalTrips: 1,
        totalDistance: 1,
        totalCost: 1,
      },
    },
  ]);

  // Get active users count
  const activeUsersCount = await User.countDocuments({ status: "active" });

  // Get current rate per km from settings
  const ratePerKmSetting = await Setting.findOne({ key: "ratePerKm" });
  const ratePerKm = ratePerKmSetting ? ratePerKmSetting.value : 0.3; // Default to 0.3 if not set

  // Format numbers to 2 decimal places
  const formatMetrics = (metrics) => {
    if (metrics.length === 0) {
      return {
        totalTrips: 0,
        totalDistance: 0,
        totalCost: 0,
        avgDistance: 0,
        avgCost: 0,
      };
    }

    return {
      totalTrips: metrics[0].totalTrips,
      totalDistance: parseFloat(metrics[0].totalDistance.toFixed(2)),
      totalCost: parseFloat(metrics[0].totalCost.toFixed(2)),
      avgDistance: parseFloat(metrics[0].avgDistance.toFixed(2)),
      avgCost: parseFloat(metrics[0].avgCost.toFixed(2)),
    };
  };

  // Format the response
  const dashboardData = {
    yearlyMetrics: formatMetrics(yearlyMetrics),
    monthlyMetrics: formatMetrics(monthlyMetrics),
    quarterlyMetrics: formatMetrics(quarterlyMetrics),
    recentExpenses,
    categoryBreakdown,
    monthlyExpensesChart,
    timeInfo: {
      currentYear,
      currentMonth,
      currentMonthName: new Date(currentYear, currentMonth - 1).toLocaleString(
        "default",
        { month: "long" }
      ),
      currentQuarter,
    },
    settings: {
      activeUsers: activeUsersCount,
      ratePerKm: ratePerKm,
    },
    currency: "CHF", // Using Swiss Francs as specified in requirements
  };

  res.status(200).json({
    success: true,
    data: dashboardData,
  });
});
