import asyncHandler from "express-async-handler";
import ErrorResponse from "../utils/errorResponse.js";
import Expense from "../models/Expense.js";
import Category from "../models/Category.js";
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

  // Admin can request data for any user, regular users only for themselves
  const userFilter =
    req.user.role === "admin" && userId
      ? { user: new mongoose.Types.ObjectId(userId) }
      : { user: req.user._id };

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

  // Run aggregation
  const summary = await Expense.aggregate([
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

  // Admin can request data for any user, regular users only for themselves
  const userFilter =
    req.user.role === "admin" && userId
      ? { user: new mongoose.Types.ObjectId(userId) }
      : { user: req.user._id };

  // Get date range for the period
  const { startDate, endDate } = getDateRangeForPeriod(
    periodType,
    periodValue,
    year
  );

  // Query expenses for the specified period
  const expenses = await Expense.find({
    ...userFilter,
    journeyDate: {
      $gte: startDate,
      $lte: endDate,
    },
  }).populate("category", "name color");

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

  // Admin can request data for any user, regular users only for themselves
  const userFilter =
    req.user.role === "admin" && userId
      ? { user: new mongoose.Types.ObjectId(userId) }
      : { user: req.user._id };

  // Run aggregation
  const categoryBreakdown = await Expense.aggregate([
    {
      $match: {
        ...userFilter,
        ...dateFilter,
      },
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

export default {
  getExpensesByTimePeriod,
  getExpensesForPeriod,
  getExpensesByCategory,
  getExpenseTrends,
  getYearlyComparison,
};
