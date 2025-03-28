import asyncHandler from "express-async-handler";
import ErrorResponse from "../utils/errorResponse.js";
import Expense from "../models/Expense.js";
import Category from "../models/Category.js";
import Budget from "../models/Budget.js";
import mongoose from "mongoose";
import { formatCHF, getMonthName } from "../utils/formatters.js";

/**
 * @desc    Get year-to-date expense report
 * @route   GET /api/v1/advanced-reports/ytd
 * @access  Private
 */
export const getYearToDateReport = asyncHandler(async (req, res, next) => {
  const { year = new Date().getFullYear(), compareWithPreviousYear = false } =
    req.query;

  // For debugging purposes
  console.log(`Getting YTD report for year: ${year}`);
  console.log(`User info: ${JSON.stringify(req.user)}`);

  // Parse year as integer
  const yearInt = parseInt(year);

  // Calculate date ranges with exact time to ensure no data is missed
  const currentYearStart = new Date(`${yearInt}-01-01T00:00:00.000Z`);
  const today = new Date();
  const currentYearEnd =
    yearInt === today.getFullYear()
      ? today
      : new Date(`${yearInt}-12-31T23:59:59.999Z`);

  // For admin users, don't filter by user ID - show all users' expenses
  // For regular users, only show their own expenses
  const userFilter = req.user.role === "admin" ? {} : { user: req.user._id };
  console.log(`Using user filter: ${JSON.stringify(userFilter)}`);

  // Get current YTD data
  const currentYTDData = await getYTDData(
    currentYearStart,
    currentYearEnd,
    userFilter,
    yearInt
  );

  // Get previous year data for comparison if requested
  let previousYearData = null;
  if (compareWithPreviousYear === "true") {
    const previousYear = yearInt - 1;
    const previousYearStart = new Date(`${previousYear}-01-01T00:00:00.000Z`);
    // Use same day/month as current year end to ensure fair comparison
    let previousYearEnd;
    if (yearInt === today.getFullYear()) {
      // If current year, use today's date in previous year
      previousYearEnd = new Date(today);
      previousYearEnd.setFullYear(previousYear);
    } else {
      // Otherwise use Dec 31 of previous year
      previousYearEnd = new Date(`${previousYear}-12-31T23:59:59.999Z`);
    }

    previousYearData = await getYTDData(
      previousYearStart,
      previousYearEnd,
      userFilter,
      previousYear
    );
  }

  // Calculate change percentages if comparing
  let changes = null;
  if (previousYearData) {
    changes = calculateChanges(previousYearData.totals, currentYTDData.totals);
  }

  res.status(200).json({
    success: true,
    data: {
      currentYear: {
        year: parseInt(year),
        startDate: currentYearStart,
        endDate: currentYearEnd,
        totals: currentYTDData.totals,
        monthlyData: currentYTDData.monthlyData,
        categoryBreakdown: currentYTDData.categoryBreakdown,
      },
      previousYear: previousYearData
        ? {
            year: parseInt(year) - 1,
            totals: previousYearData.totals,
            monthlyData: previousYearData.monthlyData,
            categoryBreakdown: previousYearData.categoryBreakdown,
          }
        : null,
      changes,
    },
  });
});

/**
 * Helper function to get YTD data with monthly and category breakdowns
 */
const getYTDData = async (startDate, endDate, userFilter, reportYear) => {
  console.log(
    `Finding expenses for user with date filter for year: ${reportYear}`
  );
  console.log(
    `Date range: startDate=${startDate.toISOString()}, endDate=${endDate.toISOString()}`
  );
  console.log(`User filter: ${JSON.stringify(userFilter)}`);

  // Ensure reportYear is an integer
  const reportYearInt = parseInt(reportYear);

  // Check if we need to fetch all data (admin with empty filter)
  const isAdminFetchingAll = Object.keys(userFilter).length === 0;
  console.log(`Is admin fetching all data: ${isAdminFetchingAll}`);

  // Get total expenses (for debugging)
  const totalExpenses = await Expense.countDocuments({});
  console.log(`Total expenses in database: ${totalExpenses}`);

  // For admin fetching all, check if we have any expenses at all
  if (isAdminFetchingAll && totalExpenses === 0) {
    console.log("No expenses found in the database at all");
    return {
      totals: { totalExpenses: 0, totalDistance: 0, totalCost: 0 },
      monthlyData: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        monthName: getMonthName(i + 1),
        year: reportYearInt,
        totalExpenses: 0,
        totalDistance: 0,
        totalCost: 0,
      })),
      categoryBreakdown: [],
    };
  }

  // Use $expr for year extraction - this works for Date objects in MongoDB
  const yearMatchFilter = {
    ...userFilter,
    $expr: { $eq: [{ $year: "$journeyDate" }, reportYearInt] },
  };

  console.log(`Using filter: ${JSON.stringify(yearMatchFilter)}`);

  // Get monthly data
  const monthlyData = await Expense.aggregate([
    {
      $match: yearMatchFilter,
    },
    {
      $group: {
        _id: {
          month: { $month: "$journeyDate" },
          year: { $year: "$journeyDate" },
        },
        totalExpenses: { $sum: 1 },
        totalDistance: { $sum: "$distance" },
        totalCost: { $sum: "$totalCost" },
      },
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1 },
    },
    {
      $project: {
        _id: 0,
        month: "$_id.month",
        year: "$_id.year",
        totalExpenses: 1,
        totalDistance: { $round: ["$totalDistance", 2] },
        totalCost: { $round: ["$totalCost", 2] },
      },
    },
  ]);

  console.log(`Found ${monthlyData.length} months with data`);

  // Add month names and ensure all months are included
  const formattedMonthlyData = [];
  // For a full year, we want months 1-12
  const endMonth = 12;
  const startMonth = 1;

  for (let month = startMonth; month <= endMonth; month++) {
    const monthEntry = monthlyData.find(
      (m) => m.month === month && m.year === reportYearInt
    );
    formattedMonthlyData.push({
      month,
      monthName: getMonthName(month),
      year: reportYearInt,
      totalExpenses: monthEntry?.totalExpenses || 0,
      totalDistance: monthEntry?.totalDistance || 0,
      totalCost: monthEntry?.totalCost || 0,
    });
  }

  // Get category breakdown for expenses in the report year using same approach
  const categoryData = await Expense.aggregate([
    {
      $match: yearMatchFilter,
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
      $unwind: {
        path: "$categoryInfo",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $group: {
        _id: "$category",
        categoryName: {
          $first: { $ifNull: ["$categoryInfo.name", "Uncategorized"] },
        },
        categoryColor: {
          $first: { $ifNull: ["$categoryInfo.color", "#CCCCCC"] },
        },
        totalExpenses: { $sum: 1 },
        totalDistance: { $sum: "$distance" },
        totalCost: { $sum: "$totalCost" },
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
        totalDistance: { $round: ["$totalDistance", 2] },
        totalCost: { $round: ["$totalCost", 2] },
      },
    },
  ]);

  console.log(`Found ${categoryData.length} categories with expenses`);

  // Calculate totals
  const totals = {
    totalExpenses: formattedMonthlyData.reduce(
      (sum, month) => sum + month.totalExpenses,
      0
    ),
    totalDistance: parseFloat(
      formattedMonthlyData
        .reduce((sum, month) => sum + month.totalDistance, 0)
        .toFixed(2)
    ),
    totalCost: parseFloat(
      formattedMonthlyData
        .reduce((sum, month) => sum + month.totalCost, 0)
        .toFixed(2)
    ),
  };

  // Calculate averages if there are expenses
  if (totals.totalExpenses > 0) {
    // Only count months with expenses
    const activeMonths =
      formattedMonthlyData.filter((m) => m.totalExpenses > 0).length || 1;

    totals.avgDistance = parseFloat(
      (totals.totalDistance / activeMonths).toFixed(2)
    );
    totals.avgCost = parseFloat((totals.totalCost / activeMonths).toFixed(2));
    totals.avgExpenseValue = parseFloat(
      (totals.totalCost / totals.totalExpenses).toFixed(2)
    );
  }

  // Calculate percentages for category breakdown
  if (totals.totalCost > 0) {
    categoryData.forEach((category) => {
      category.percentageOfTotal = parseFloat(
        ((category.totalCost / totals.totalCost) * 100).toFixed(2)
      );
    });
  }

  return {
    totals,
    monthlyData: formattedMonthlyData,
    categoryBreakdown: categoryData,
  };
};

/**
 * Helper function to calculate changes between two periods
 */
const calculateChanges = (previousPeriod, currentPeriod) => {
  const calculatePercentageChange = (prev, current) => {
    if (prev === 0) return current === 0 ? 0 : 100;
    return parseFloat((((current - prev) / prev) * 100).toFixed(2));
  };

  return {
    totalExpenses: calculatePercentageChange(
      previousPeriod.totalExpenses,
      currentPeriod.totalExpenses
    ),
    totalDistance: calculatePercentageChange(
      previousPeriod.totalDistance,
      currentPeriod.totalDistance
    ),
    totalCost: calculatePercentageChange(
      previousPeriod.totalCost,
      currentPeriod.totalCost
    ),
    avgCost:
      previousPeriod.avgCost && currentPeriod.avgCost
        ? calculatePercentageChange(
            previousPeriod.avgCost,
            currentPeriod.avgCost
          )
        : null,
  };
};

/**
 * @desc    Get expense data for chart visualization
 * @route   GET /api/v1/advanced-reports/chart-data
 * @access  Private
 */
export const getChartData = asyncHandler(async (req, res, next) => {
  const {
    chartType,
    startDate,
    endDate,
    period = "month",
    categories,
    year,
  } = req.query;

  if (!chartType) {
    return next(new ErrorResponse("Chart type is required", 400));
  }

  // Parse dates or use year if provided
  let start, end;
  if (year) {
    // If year is provided, use it to filter instead of date range
    console.log(`Chart data requested for specific year: ${year}`);
    start = new Date(`${year}-01-01`);
    end = new Date(`${year}-12-31`);
  } else {
    start = startDate
      ? new Date(startDate)
      : new Date(new Date().getFullYear(), 0, 1);
    end = endDate ? new Date(endDate) : new Date();
  }

  // For admin users, don't filter by user ID
  const userFilter = req.user.role === "admin" ? {} : { user: req.user._id };
  console.log(`Using user filter: ${JSON.stringify(userFilter)}`);

  // Add category filter if provided
  let categoryFilter = {};
  if (categories) {
    const categoryIds = categories
      .split(",")
      .map((id) => new mongoose.Types.ObjectId(id.trim()));
    categoryFilter = { category: { $in: categoryIds } };
  }

  // Create year filter if year parameter is provided
  const yearFilter = year ? parseInt(year) : null;

  let chartData;

  switch (chartType) {
    case "pie":
      chartData = await generatePieChartData(
        start,
        end,
        userFilter,
        categoryFilter,
        yearFilter
      );
      break;

    case "bar":
      chartData = await generateBarChartData(
        start,
        end,
        userFilter,
        categoryFilter,
        period,
        yearFilter
      );
      break;

    case "line":
      chartData = await generateLineChartData(
        start,
        end,
        userFilter,
        categoryFilter,
        period,
        yearFilter
      );
      break;

    default:
      return next(
        new ErrorResponse(`Unsupported chart type: ${chartType}`, 400)
      );
  }

  res.status(200).json({
    success: true,
    data: {
      chartType,
      period: period,
      dateRange: {
        startDate: start,
        endDate: end,
      },
      chartData,
    },
  });
});

/**
 * Generate data for pie charts
 */
const generatePieChartData = async (
  startDate,
  endDate,
  userFilter,
  categoryFilter,
  yearFilter
) => {
  // Create the match filter
  let dateFilter;
  if (yearFilter) {
    // Use year extraction with $expr - works for Date objects
    const yearInt = parseInt(yearFilter);
    dateFilter = {
      $expr: { $eq: [{ $year: "$journeyDate" }, yearInt] },
    };
  } else {
    dateFilter = { journeyDate: { $gte: startDate, $lte: endDate } };
  }

  // Get category breakdown for pie chart
  const categoryData = await Expense.aggregate([
    {
      $match: {
        ...userFilter,
        ...categoryFilter,
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
      $unwind: {
        path: "$categoryInfo",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $group: {
        _id: "$category",
        label: { $first: { $ifNull: ["$categoryInfo.name", "Uncategorized"] } },
        color: { $first: { $ifNull: ["$categoryInfo.color", "#CCCCCC"] } },
        value: { $sum: "$totalCost" },
      },
    },
    {
      $project: {
        _id: 0,
        id: "$_id",
        label: 1,
        color: 1,
        value: { $round: ["$value", 2] },
      },
    },
  ]);

  const total = categoryData.reduce((sum, item) => sum + item.value, 0);

  // Add percentage to each slice
  return categoryData.map((item) => ({
    ...item,
    percentage: parseFloat(((item.value / total) * 100).toFixed(2)),
  }));
};

/**
 * Generate data for bar charts
 */
const generateBarChartData = async (
  startDate,
  endDate,
  userFilter,
  categoryFilter,
  period,
  yearFilter
) => {
  let groupByDate;
  let dateFormat;

  // Set up grouping based on period
  switch (period) {
    case "day":
      groupByDate = {
        year: { $year: "$journeyDate" },
        month: { $month: "$journeyDate" },
        day: { $dayOfMonth: "$journeyDate" },
      };
      dateFormat = "%Y-%m-%d";
      break;

    case "week":
      groupByDate = {
        year: { $year: "$journeyDate" },
        week: { $week: "$journeyDate" },
      };
      dateFormat = "W%V, %Y";
      break;

    case "month":
    default:
      groupByDate = {
        year: { $year: "$journeyDate" },
        month: { $month: "$journeyDate" },
      };
      dateFormat = "%b %Y";
      break;

    case "quarter":
      groupByDate = {
        year: { $year: "$journeyDate" },
        quarter: { $ceil: { $divide: [{ $month: "$journeyDate" }, 3] } },
      };
      dateFormat = "Q%q %Y";
      break;

    case "year":
      groupByDate = {
        year: { $year: "$journeyDate" },
      };
      dateFormat = "%Y";
      break;
  }

  // Create the match filter
  let dateFilter;
  if (yearFilter) {
    // Use year extraction with $expr - works for Date objects
    const yearInt = parseInt(yearFilter);
    dateFilter = {
      $expr: { $eq: [{ $year: "$journeyDate" }, yearInt] },
    };
  } else {
    dateFilter = { journeyDate: { $gte: startDate, $lte: endDate } };
  }

  // Get category breakdown by time period for bar chart
  const data = await Expense.aggregate([
    {
      $match: {
        ...userFilter,
        ...categoryFilter,
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
      $unwind: {
        path: "$categoryInfo",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $group: {
        _id: {
          timePeriod: groupByDate,
          category: "$category",
        },
        categoryName: {
          $first: { $ifNull: ["$categoryInfo.name", "Uncategorized"] },
        },
        categoryColor: {
          $first: { $ifNull: ["$categoryInfo.color", "#CCCCCC"] },
        },
        totalCost: { $sum: "$totalCost" },
        dateString: {
          $first: {
            $dateToString: {
              format: dateFormat,
              date: "$journeyDate",
            },
          },
        },
      },
    },
    {
      $sort: {
        "_id.timePeriod.year": 1,
        "_id.timePeriod.month": 1,
        "_id.timePeriod.day": 1,
        "_id.timePeriod.week": 1,
        "_id.timePeriod.quarter": 1,
      },
    },
    {
      $group: {
        _id: "$_id.timePeriod",
        dateString: { $first: "$dateString" },
        categories: {
          $push: {
            id: "$_id.category",
            name: "$categoryName",
            color: "$categoryColor",
            value: { $round: ["$totalCost", 2] },
          },
        },
        totalValue: { $sum: "$totalCost" },
      },
    },
    {
      $sort: {
        "_id.year": 1,
        "_id.month": 1,
        "_id.day": 1,
        "_id.week": 1,
        "_id.quarter": 1,
      },
    },
    {
      $project: {
        _id: 0,
        period: "$_id",
        dateString: 1,
        categories: 1,
        totalValue: { $round: ["$totalValue", 2] },
      },
    },
  ]);

  // Format response for bar chart
  return {
    labels: data.map((item) => item.dateString),
    datasets: data.map((item) => ({
      period: item.period,
      label: item.dateString,
      totalValue: item.totalValue,
      categoryValues: item.categories,
    })),
  };
};

/**
 * Generate data for line charts
 */
const generateLineChartData = async (
  startDate,
  endDate,
  userFilter,
  categoryFilter,
  period,
  yearFilter
) => {
  let groupByDate;
  let dateFormat;

  // Set up grouping based on period
  switch (period) {
    case "day":
      groupByDate = {
        year: { $year: "$journeyDate" },
        month: { $month: "$journeyDate" },
        day: { $dayOfMonth: "$journeyDate" },
      };
      dateFormat = "%Y-%m-%d";
      break;

    case "week":
      groupByDate = {
        year: { $year: "$journeyDate" },
        week: { $week: "$journeyDate" },
      };
      dateFormat = "W%V, %Y";
      break;

    case "month":
    default:
      groupByDate = {
        year: { $year: "$journeyDate" },
        month: { $month: "$journeyDate" },
      };
      dateFormat = "%b %Y";
      break;
  }

  // Create the match filter
  let dateFilter;
  if (yearFilter) {
    // Use year extraction with $expr - works for Date objects
    const yearInt = parseInt(yearFilter);
    dateFilter = {
      $expr: { $eq: [{ $year: "$journeyDate" }, yearInt] },
    };
  } else {
    dateFilter = { journeyDate: { $gte: startDate, $lte: endDate } };
  }

  // Get time series data for line chart
  const timeData = await Expense.aggregate([
    {
      $match: {
        ...userFilter,
        ...categoryFilter,
        ...dateFilter,
      },
    },
    {
      $group: {
        _id: groupByDate,
        totalCost: { $sum: "$totalCost" },
        totalDistance: { $sum: "$distance" },
        count: { $sum: 1 },
        dateString: {
          $first: {
            $dateToString: {
              format: dateFormat,
              date: "$journeyDate",
            },
          },
        },
      },
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.week": 1 },
    },
    {
      $project: {
        _id: 0,
        period: "$_id",
        dateString: 1,
        totalCost: { $round: ["$totalCost", 2] },
        totalDistance: { $round: ["$totalDistance", 2] },
        count: 1,
      },
    },
  ]);

  // Calculate moving averages
  const costValues = timeData.map((item) => item.totalCost);
  const distanceValues = timeData.map((item) => item.totalDistance);

  const calculateMovingAverage = (values, window) => {
    return values.map((_, index) => {
      if (index < window - 1) return null;

      let sum = 0;
      for (let i = 0; i < window; i++) {
        sum += values[index - i];
      }
      return parseFloat((sum / window).toFixed(2));
    });
  };

  // Format response for line chart
  return {
    labels: timeData.map((item) => item.dateString),
    datasets: [
      {
        id: "cost",
        label: "Total Cost (CHF)",
        data: costValues,
        borderColor: "#4a90e2",
        fill: false,
      },
      {
        id: "distance",
        label: "Total Distance (km)",
        data: distanceValues,
        borderColor: "#50c878",
        fill: false,
      },
      {
        id: "cost-ma3",
        label: "Cost 3-Period MA",
        data: calculateMovingAverage(costValues, 3),
        borderColor: "#8884d8",
        borderDash: [5, 5],
        fill: false,
      },
    ],
  };
};

/**
 * @desc    Generate expense forecast
 * @route   GET /api/v1/advanced-reports/forecast
 * @access  Private
 */
export const generateForecast = asyncHandler(async (req, res, next) => {
  const { months = 3, method = "average", year } = req.query;

  // Validate parameters
  const forecastMonths = Math.min(Math.max(parseInt(months), 1), 12);

  // Set up date ranges and filters
  const today = new Date();
  const endDate = today;
  const historicalStartDate = new Date();

  // Use 12 months of historical data by default
  historicalStartDate.setMonth(today.getMonth() - 12);

  // For admin users, don't filter by user ID
  const userFilter = req.user.role === "admin" ? {} : { user: req.user._id };
  console.log(`Using user filter for forecast: ${JSON.stringify(userFilter)}`);

  // Create year filter for historical data if specified
  const yearFilter = year ? parseInt(year) : null;

  // Log for debugging
  if (yearFilter) {
    console.log(`Generating forecast using data from year: ${yearFilter}`);
  }

  let historicalData;

  if (yearFilter) {
    // If year is specified, get data from that specific year
    const yearStart = new Date(`${yearFilter}-01-01`);
    const yearEnd = new Date(`${yearFilter}-12-31`);
    historicalData = await getMonthlyDataByYear(userFilter, yearFilter);
  } else {
    // Otherwise use the default date range
    historicalData = await getMonthlyData(
      historicalStartDate,
      endDate,
      userFilter
    );
  }

  // Log for debugging
  console.log(`Found ${historicalData.length} months of historical data`);

  // Generate forecast
  const forecast = [];
  const forecastStartDate = new Date(today);
  forecastStartDate.setDate(1); // Start at the beginning of the month

  // If year filter was used, forecast for the next year
  if (yearFilter) {
    forecastStartDate.setFullYear(yearFilter + 1);
    forecastStartDate.setMonth(0); // Start from January of next year
  } else {
    forecastStartDate.setMonth(today.getMonth() + 1); // Start from next month
  }

  // Calculate average monthly values from historical data
  const totalMonths = historicalData.length || 1; // Avoid division by zero
  const avgMonthlyCost =
    historicalData.reduce((sum, month) => sum + month.totalCost, 0) /
    totalMonths;
  const avgMonthlyDistance =
    historicalData.reduce((sum, month) => sum + month.totalDistance, 0) /
    totalMonths;
  const avgMonthlyCount =
    historicalData.reduce((sum, month) => sum + month.count, 0) / totalMonths;

  // Get month-by-month historical patterns
  const monthlyPatterns = {};
  historicalData.forEach((month) => {
    const monthNum = month.period.month;
    if (!monthlyPatterns[monthNum]) {
      monthlyPatterns[monthNum] = {
        costs: [],
        distances: [],
        counts: [],
      };
    }

    monthlyPatterns[monthNum].costs.push(month.totalCost);
    monthlyPatterns[monthNum].distances.push(month.totalDistance);
    monthlyPatterns[monthNum].counts.push(month.count);
  });

  // Calculate monthly averages
  Object.keys(monthlyPatterns).forEach((monthNum) => {
    const pattern = monthlyPatterns[monthNum];
    if (pattern.costs.length > 0) {
      pattern.avgCost =
        pattern.costs.reduce((sum, cost) => sum + cost, 0) /
        pattern.costs.length;
      pattern.avgDistance =
        pattern.distances.reduce((sum, dist) => sum + dist, 0) /
        pattern.distances.length;
      pattern.avgCount =
        pattern.counts.reduce((sum, count) => sum + count, 0) /
        pattern.counts.length;
    }
  });

  // Generate forecast for each month
  for (let i = 0; i < forecastMonths; i++) {
    const forecastDate = new Date(forecastStartDate);
    forecastDate.setMonth(forecastStartDate.getMonth() + i);

    const monthNum = forecastDate.getMonth() + 1;
    const year = forecastDate.getFullYear();
    const monthName = getMonthName(monthNum);

    // Calculate forecast values based on selected method
    let forecastedCost, forecastedDistance, forecastedCount;

    if (
      method === "seasonal" &&
      monthlyPatterns[monthNum] &&
      monthlyPatterns[monthNum].costs.length > 0
    ) {
      // Use seasonal pattern (month-specific average)
      forecastedCost = monthlyPatterns[monthNum].avgCost;
      forecastedDistance = monthlyPatterns[monthNum].avgDistance;
      forecastedCount = monthlyPatterns[monthNum].avgCount;
    } else {
      // Use simple average
      forecastedCost = avgMonthlyCost;
      forecastedDistance = avgMonthlyDistance;
      forecastedCount = avgMonthlyCount;
    }

    // Add confidence intervals (±10% by default)
    const confidenceInterval = 0.1;

    forecast.push({
      month: monthNum,
      year,
      monthName,
      forecast: {
        totalCost: parseFloat(forecastedCost.toFixed(2)),
        totalDistance: parseFloat(forecastedDistance.toFixed(2)),
        expenseCount: Math.round(forecastedCount),
        lowerBound: parseFloat(
          (forecastedCost * (1 - confidenceInterval)).toFixed(2)
        ),
        upperBound: parseFloat(
          (forecastedCost * (1 + confidenceInterval)).toFixed(2)
        ),
      },
    });
  }

  res.status(200).json({
    success: true,
    data: {
      historical: {
        data: historicalData,
        summary: {
          totalCost: parseFloat(
            historicalData
              .reduce((sum, month) => sum + month.totalCost, 0)
              .toFixed(2)
          ),
          totalDistance: parseFloat(
            historicalData
              .reduce((sum, month) => sum + month.totalDistance, 0)
              .toFixed(2)
          ),
          avgMonthlyCost: parseFloat(avgMonthlyCost.toFixed(2)),
          months: historicalData.length,
        },
      },
      forecast: {
        data: forecast,
        summary: {
          totalForecastedCost: parseFloat(
            forecast
              .reduce((sum, month) => sum + month.forecast.totalCost, 0)
              .toFixed(2)
          ),
          totalForecastedDistance: parseFloat(
            forecast
              .reduce((sum, month) => sum + month.forecast.totalDistance, 0)
              .toFixed(2)
          ),
          totalForecastedExpenses: forecast.reduce(
            (sum, month) => sum + month.forecast.expenseCount,
            0
          ),
          avgMonthlyCost: parseFloat(
            (
              forecast.reduce(
                (sum, month) => sum + month.forecast.totalCost,
                0
              ) / forecast.length
            ).toFixed(2)
          ),
          forecastMethod: method,
          forecastMonths: forecastMonths,
        },
      },
    },
  });
});

/**
 * Helper function to get monthly data by year
 */
const getMonthlyDataByYear = async (userFilter, year) => {
  // Use year extraction with $expr - works for Date objects
  const yearInt = parseInt(year);

  const yearMatchFilter = {
    ...userFilter,
    $expr: { $eq: [{ $year: "$journeyDate" }, yearInt] },
  };

  console.log(
    `Getting monthly data for year ${year} with filter:`,
    JSON.stringify(yearMatchFilter)
  );

  return Expense.aggregate([
    {
      $match: yearMatchFilter,
    },
    {
      $group: {
        _id: {
          year: { $year: "$journeyDate" },
          month: { $month: "$journeyDate" },
        },
        totalCost: { $sum: "$totalCost" },
        totalDistance: { $sum: "$distance" },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1 },
    },
    {
      $project: {
        _id: 0,
        period: "$_id",
        totalCost: { $round: ["$totalCost", 2] },
        totalDistance: { $round: ["$totalDistance", 2] },
        count: 1,
        monthName: {
          $let: {
            vars: {
              monthNames: [
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
              $arrayElemAt: ["$$monthNames", { $subtract: ["$_id.month", 1] }],
            },
          },
        },
      },
    },
  ]);
};

/**
 * Helper function to get monthly expense data
 */
const getMonthlyData = async (startDate, endDate, userFilter) => {
  return Expense.aggregate([
    {
      $match: {
        ...userFilter,
        journeyDate: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$journeyDate" },
          month: { $month: "$journeyDate" },
        },
        totalCost: { $sum: "$totalCost" },
        totalDistance: { $sum: "$distance" },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1 },
    },
    {
      $project: {
        _id: 0,
        period: "$_id",
        totalCost: { $round: ["$totalCost", 2] },
        totalDistance: { $round: ["$totalDistance", 2] },
        count: 1,
        monthName: {
          $let: {
            vars: {
              monthNames: [
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
              $arrayElemAt: ["$$monthNames", { $subtract: ["$_id.month", 1] }],
            },
          },
        },
      },
    },
  ]);
};

/**
 * @desc    Get budget comparison report
 * @route   GET /api/v1/advanced-reports/budget-comparison
 * @access  Private
 */
export const getBudgetComparison = asyncHandler(async (req, res, next) => {
  const { year = new Date().getFullYear(), month, debug = "false" } = req.query;

  console.log(
    `Getting budget comparison for year: ${year}, month: ${month || "all"}`
  );

  // Convert year to integer
  const yearInt = parseInt(year);

  // Set up date filters
  let startDate, endDate;
  let periodType;

  if (month) {
    // Monthly budget comparison
    const monthInt = parseInt(month);
    startDate = new Date(yearInt, monthInt - 1, 1); // Month is 0-indexed in Date constructor
    endDate = new Date(yearInt, monthInt, 0); // Last day of the month
    periodType = "month";
  } else {
    // Annual budget comparison
    startDate = new Date(yearInt, 0, 1); // January 1
    endDate = new Date(yearInt, 11, 31); // December 31
    periodType = "year";
  }

  // For admin users, don't filter by user ID
  const userFilter = req.user.role === "admin" ? {} : { user: req.user._id };
  console.log(
    `Using user filter for budget comparison: ${JSON.stringify(userFilter)}`
  );

  // Debugging log for date and user info
  if (debug === "true") {
    console.log(`User role: ${req.user.role}, User ID: ${req.user._id}`);
    console.log(
      `Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`
    );

    // Check if there are any expenses at all for this user
    const totalExpenses = await Expense.countDocuments(userFilter);
    console.log(`Total expenses for user filter: ${totalExpenses}`);

    // Get a sample of expenses to verify dates and categories
    if (totalExpenses > 0) {
      const sampleExpenses = await Expense.find(userFilter)
        .select("journeyDate category")
        .sort("-journeyDate")
        .limit(5);

      console.log("Sample expense dates:");
      for (const exp of sampleExpenses) {
        console.log(
          `- ${exp._id}: Date: ${exp.journeyDate.toISOString()}, Category: ${
            exp.category
          }`
        );
      }
    }
  }

  const budgetFilter = {
    year: yearInt,
    isActive: true,
  };

  if (month) {
    budgetFilter.month = parseInt(month);
  } else {
    budgetFilter.month = 0; // Annual budget
  }

  // Debugging log for filter criteria
  if (debug === "true") {
    console.log(`Budget filter: ${JSON.stringify(budgetFilter)}`);
  }

  const budgets = await Budget.find({
    ...userFilter,
    ...budgetFilter,
  }).populate("category", "name color");

  console.log(`Found ${budgets.length} budgets matching the criteria`);

  if (debug === "true" && budgets.length > 0) {
    console.log("Budget details:");
    for (const budget of budgets) {
      console.log(
        `- ID: ${budget._id}, Category: ${
          budget.category ? budget.category._id : "null"
        }, Amount: ${budget.amount}`
      );
    }
  }

  // When no budgets found, return empty data rather than error
  if (budgets.length === 0) {
    console.log(
      `No budgets found for period: ${year}/${
        month || "all"
      }, returning empty data`
    );

    return res.status(200).json({
      success: true,
      data: {
        period: {
          type: periodType,
          month: month ? parseInt(month) : null,
          year: yearInt,
          label: month ? `${getMonthName(parseInt(month))} ${year}` : `${year}`,
        },
        categories: [],
        totals: {
          budgetAmount: 0,
          actualCost: 0,
          variance: 0,
          usagePercentage: 0,
          status: "none",
          categoryCount: 0,
        },
        message: "No budgets found for the specified period",
      },
    });
  }

  // Create expense match filter
  let expenseMatchFilter = { ...userFilter };

  // Use direct date comparison instead of $expr for better reliability
  if (month) {
    // For monthly comparison, set exact date range
    const monthInt = parseInt(month);
    startDate = new Date(yearInt, monthInt - 1, 1); // Month is 0-indexed in Date
    // Add milliseconds to make sure we capture the entire last day of the month
    endDate = new Date(yearInt, monthInt, 0, 23, 59, 59, 999); // Last day of month

    expenseMatchFilter.journeyDate = {
      $gte: startDate,
      $lte: endDate,
    };

    console.log(
      `Monthly date range: ${startDate.toISOString()} to ${endDate.toISOString()}`
    );
  } else {
    // For annual comparison
    startDate = new Date(yearInt, 0, 1);
    endDate = new Date(yearInt, 11, 31, 23, 59, 59, 999);

    expenseMatchFilter.journeyDate = {
      $gte: startDate,
      $lte: endDate,
    };

    console.log(
      `Annual date range: ${startDate.toISOString()} to ${endDate.toISOString()}`
    );
  }

  if (debug === "true") {
    console.log(`Expense match filter: ${JSON.stringify(expenseMatchFilter)}`);

    // Check for expenses in this date range
    const expensesInRange = await Expense.countDocuments(expenseMatchFilter);
    console.log(`Found ${expensesInRange} expenses in the date range`);

    // Check for specific expenses for the specified categories
    if (budgets.length > 0) {
      console.log(`Checking for specific expenses for budget categories:`);
      for (const budget of budgets) {
        if (!budget.category) continue;

        const categoryId = budget.category._id;
        const categoryExpenses = await Expense.find({
          ...userFilter,
          category: categoryId,
        })
          .select("_id journeyDate category totalCost")
          .sort("-journeyDate")
          .limit(3);

        console.log(
          `Category ${budget.category.name} (${categoryId}) has ${categoryExpenses.length} sample expenses:`
        );
        for (const exp of categoryExpenses) {
          const isInDateRange =
            exp.journeyDate >= startDate && exp.journeyDate <= endDate;
          console.log(
            `- Expense ${
              exp._id
            }: Date: ${exp.journeyDate.toISOString()}, In range: ${isInDateRange}, Amount: ${
              exp.totalCost
            } CHF`
          );
        }
      }
    }
  }

  // Get expenses grouped by category
  const expensesByCategory = await Expense.aggregate([
    {
      $match: expenseMatchFilter,
    },
    {
      $group: {
        _id: "$category",
        actualCost: { $sum: "$totalCost" },
        actualDistance: { $sum: "$distance" },
        expenseCount: { $sum: 1 },
      },
    },
    {
      $project: {
        categoryId: "$_id",
        actualCost: { $round: ["$actualCost", 2] },
        actualDistance: { $round: ["$actualDistance", 2] },
        expenseCount: 1,
        _id: 0,
      },
    },
  ]);

  console.log(`Found ${expensesByCategory.length} categories with expenses`);

  if (debug === "true" && expensesByCategory.length > 0) {
    console.log("Expenses by category:");
    for (const cat of expensesByCategory) {
      console.log(
        `- Category ID: ${cat.categoryId}, Cost: ${cat.actualCost}, Count: ${cat.expenseCount}`
      );
    }
  }

  // Organize budget data by category
  const categoryData = [];
  let totalBudgetAmount = 0;
  let totalActualCost = 0;

  // Process each budget
  for (const budget of budgets) {
    // Handle null category case
    if (!budget.category) {
      console.warn(`Budget ${budget._id} has null category, skipping`);
      continue;
    }

    const categoryId = budget.category._id.toString();

    // Find matching expenses for this budget category
    const expenses = expensesByCategory.find(
      (expense) =>
        expense.categoryId && expense.categoryId.toString() === categoryId
    ) || {
      actualCost: 0,
      actualDistance: 0,
      expenseCount: 0,
    };

    if (debug === "true") {
      if (expenses.expenseCount > 0) {
        console.log(
          `Found ${expenses.expenseCount} expenses for budget category ${categoryId}`
        );
      } else {
        console.log(`No expenses found for budget category ${categoryId}`);

        // Check if there are any expenses at all for this category
        Expense.find({ category: categoryId })
          .select("journeyDate totalCost")
          .sort("-journeyDate")
          .limit(3)
          .then((samples) => {
            if (samples.length > 0) {
              console.log(`Sample expenses for category ${categoryId}:`);
              for (const exp of samples) {
                console.log(
                  `- ${
                    exp._id
                  }: Date: ${exp.journeyDate.toISOString()}, Cost: ${
                    exp.totalCost
                  }`
                );
              }
            } else {
              console.log(`No expenses at all for category ${categoryId}`);
            }
          });
      }
    }

    // Calculate variance and percentage used
    const actualCost = expenses.actualCost;
    const budgetAmount = budget.amount;
    const variance = parseFloat((budgetAmount - actualCost).toFixed(2));
    const usagePercentage = parseFloat(
      ((actualCost / budgetAmount) * 100).toFixed(1)
    );

    // Determine budget status based on thresholds
    let status = "under";
    if (usagePercentage >= budget.criticalThreshold) {
      status = "critical";
    } else if (usagePercentage >= budget.warningThreshold) {
      status = "warning";
    }

    categoryData.push({
      categoryId,
      categoryName: budget.category.name,
      categoryColor: budget.category.color,
      budgetAmount,
      actualCost,
      variance,
      usagePercentage,
      status,
      actualDistance: expenses.actualDistance,
      budgetedDistance: budget.maxDistance,
      expenseCount: expenses.expenseCount,
    });

    totalBudgetAmount += budgetAmount;
    totalActualCost += actualCost;
  }

  // Calculate overall totals
  const totalVariance = parseFloat(
    (totalBudgetAmount - totalActualCost).toFixed(2)
  );
  let totalUsagePercentage = 0;
  if (totalBudgetAmount > 0) {
    totalUsagePercentage = parseFloat(
      ((totalActualCost / totalBudgetAmount) * 100).toFixed(1)
    );
  }

  let totalStatus = "under";

  // Using the first budget's thresholds for overall status (could be refined if needed)
  if (budgets.length > 0 && categoryData.length > 0) {
    if (totalUsagePercentage >= budgets[0].criticalThreshold) {
      totalStatus = "critical";
    } else if (totalUsagePercentage >= budgets[0].warningThreshold) {
      totalStatus = "warning";
    }
  } else {
    totalStatus = "none";
  }

  // Format response
  res.status(200).json({
    success: true,
    data: {
      period: {
        type: periodType,
        month: month ? parseInt(month) : null,
        year: yearInt,
        label: month ? `${getMonthName(parseInt(month))} ${year}` : `${year}`,
      },
      categories: categoryData,
      totals: {
        budgetAmount: parseFloat(totalBudgetAmount.toFixed(2)),
        actualCost: parseFloat(totalActualCost.toFixed(2)),
        variance: totalVariance,
        usagePercentage: totalUsagePercentage,
        status: totalStatus,
      },
    },
  });
});

/**
 * @desc    Get expenses with advanced filtering
 * @route   GET /api/v1/advanced-reports/expenses
 * @access  Private
 */
export const getExpensesWithFilters = asyncHandler(async (req, res, next) => {
  // Extract filter parameters
  const {
    startDate,
    endDate,
    categories,
    minAmount,
    maxAmount,
    minDistance,
    maxDistance,
    status,
    sortBy = "journeyDate",
    sortOrder = "desc",
    page = 1,
    limit = 10,
    filterOperator = "AND",
    year,
  } = req.query;

  // Convert year to integer if provided
  const yearInt = year ? parseInt(year) : null;

  // Base filter conditions
  const filterConditions = [];

  // For admin users, don't filter by user ID, for regular users, only show their expenses
  if (req.user.role !== "admin") {
    filterConditions.push({ user: req.user._id });
  }

  console.log(
    `User role: ${req.user.role}, filtering${
      req.user.role === "admin" ? " for all users" : " by user ID"
    }`
  );

  // Year filter (takes precedence over date range if specified)
  if (year) {
    console.log(`Filtering expenses by year: ${yearInt}`);

    // Use $expr for year extraction - works for Date objects
    filterConditions.push({
      $expr: { $eq: [{ $year: "$journeyDate" }, yearInt] },
    });
  } else {
    // Date range filter (only applied if year is not specified)
    if (startDate) {
      filterConditions.push({ journeyDate: { $gte: new Date(startDate) } });
    }

    if (endDate) {
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);
      filterConditions.push({ journeyDate: { $lte: endDateObj } });
    }
  }

  // Category filter
  if (categories) {
    const categoryIds = categories
      .split(",")
      .map((id) => new mongoose.Types.ObjectId(id.trim()));
    filterConditions.push({ category: { $in: categoryIds } });
  }

  // Amount range filter
  if (minAmount) {
    filterConditions.push({ totalCost: { $gte: parseFloat(minAmount) } });
  }

  if (maxAmount) {
    filterConditions.push({ totalCost: { $lte: parseFloat(maxAmount) } });
  }

  // Distance range filter
  if (minDistance) {
    filterConditions.push({ distance: { $gte: parseFloat(minDistance) } });
  }

  if (maxDistance) {
    filterConditions.push({ distance: { $lte: parseFloat(maxDistance) } });
  }

  // Status filter
  if (status) {
    filterConditions.push({ status });
  }

  // Build the filter object based on the operator
  let filter;
  if (filterOperator === "OR" && filterConditions.length > 1) {
    filter = { $or: filterConditions };
  } else {
    filter = { $and: filterConditions };
  }

  // Set up sorting
  const sort = {};
  sort[sortBy] = sortOrder === "asc" ? 1 : -1;

  // Pagination
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  // Execute query with populate
  const expenses = await Expense.find(filter)
    .populate("category", "name color")
    .sort(sort)
    .skip(skip)
    .limit(limitNum);

  // Get total count for pagination
  const total = await Expense.countDocuments(filter);

  // Calculate pagination info
  const pagination = {
    total,
    page: pageNum,
    limit: limitNum,
    pages: Math.ceil(total / limitNum),
  };

  // Calculate summary statistics for filtered expenses
  const summary = {
    count: expenses.length,
    totalCost: parseFloat(
      expenses.reduce((sum, exp) => sum + exp.totalCost, 0).toFixed(2)
    ),
    totalDistance: parseFloat(
      expenses.reduce((sum, exp) => sum + exp.distance, 0).toFixed(2)
    ),
    avgCost:
      expenses.length > 0
        ? parseFloat(
            (
              expenses.reduce((sum, exp) => sum + exp.totalCost, 0) /
              expenses.length
            ).toFixed(2)
          )
        : 0,
    avgDistance:
      expenses.length > 0
        ? parseFloat(
            (
              expenses.reduce((sum, exp) => sum + exp.distance, 0) /
              expenses.length
            ).toFixed(2)
          )
        : 0,
  };

  res.status(200).json({
    success: true,
    data: {
      expenses,
      pagination,
      summary,
      filters: {
        filterOperator,
        appliedFilters: Object.keys(req.query).filter(
          (key) => !["page", "limit", "sortBy", "sortOrder"].includes(key)
        ),
      },
    },
  });
});

export default {
  getYearToDateReport,
  getChartData,
  generateForecast,
  getBudgetComparison,
  getExpensesWithFilters,
};
