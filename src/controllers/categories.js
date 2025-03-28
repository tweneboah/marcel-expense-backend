import Category from "../models/Category.js";
import Expense from "../models/Expense.js";
import asyncHandler from "express-async-handler";
import ErrorResponse from "../utils/errorResponse.js";
import mongoose from "mongoose";

// @desc    Get all categories
// @route   GET /api/v1/categories
// @access  Private
export const getCategories = asyncHandler(async (req, res, next) => {
  let query;
  let matchQuery = {};

  // Copy req.query
  const reqQuery = { ...req.query };

  // Fields to exclude
  const removeFields = [
    "select",
    "sort",
    "page",
    "limit",
    "includeUsage",
    "includeBudgetAlerts",
    "includeRecentExpenses",
    "includeExpenseCounts",
    "search",
    "hasBudget",
    "isActive",
    "usageAbove",
    "usageBelow",
    "period",
    "compareWithPrevious",
    "withUserUsage",
    "sortByUserUsage",
  ];

  // Loop over removeFields and delete them from reqQuery
  removeFields.forEach((param) => delete reqQuery[param]);

  // Create query string
  let queryStr = JSON.stringify(reqQuery);

  // Create operators ($gt, $gte, etc)
  queryStr = queryStr.replace(
    /\b(gt|gte|lt|lte|in)\b/g,
    (match) => `$${match}`
  );

  // Parse the query string
  matchQuery = JSON.parse(queryStr);

  // Handle isActive filter
  if (req.query.isActive !== undefined) {
    matchQuery.isActive = req.query.isActive === "true";
  }

  // Handle search
  if (req.query.search) {
    matchQuery.$or = [
      { name: { $regex: req.query.search, $options: "i" } },
      { description: { $regex: req.query.search, $options: "i" } },
    ];
  }

  // Handle hasBudget filter
  if (req.query.hasBudget !== undefined) {
    if (req.query.hasBudget === "true") {
      matchQuery["budgetLimits.0"] = { $exists: true };
    } else {
      matchQuery["budgetLimits.0"] = { $exists: false };
    }
  }

  // Base aggregation pipeline
  let pipeline = [{ $match: matchQuery }];

  // Handle includeExpenseCounts
  if (req.query.includeExpenseCounts === "true") {
    pipeline.push({
      $lookup: {
        from: "expenses",
        localField: "_id",
        foreignField: "category",
        as: "expenseData",
      },
    });
    pipeline.push({
      $addFields: {
        expenseCount: { $size: "$expenseData" },
      },
    });
    pipeline.push({
      $project: {
        expenseData: 0,
      },
    });
  }

  // Handle includeRecentExpenses
  if (req.query.includeRecentExpenses) {
    const limit = parseInt(req.query.includeRecentExpenses) || 5;
    pipeline.push({
      $lookup: {
        from: "expenses",
        let: { catId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$category", "$$catId"] } } },
          { $sort: { journeyDate: -1 } },
          { $limit: limit },
        ],
        as: "recentExpenses",
      },
    });
  }

  // Handle withUserUsage - show categories with user's personal usage
  if (req.query.withUserUsage === "true") {
    const userId = req.user.id;

    pipeline.push({
      $lookup: {
        from: "expenses",
        let: { catId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$category", "$$catId"] },
                  { $eq: ["$user", new mongoose.Types.ObjectId(userId)] },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalAmount: { $sum: "$totalCost" },
              count: { $sum: 1 },
              mostRecent: { $max: "$journeyDate" },
            },
          },
        ],
        as: "userUsageData",
      },
    });

    pipeline.push({
      $addFields: {
        userUsage: {
          $cond: {
            if: { $gt: [{ $size: "$userUsageData" }, 0] },
            then: {
              amount: { $arrayElemAt: ["$userUsageData.totalAmount", 0] },
              count: { $arrayElemAt: ["$userUsageData.count", 0] },
              mostRecent: { $arrayElemAt: ["$userUsageData.mostRecent", 0] },
            },
            else: {
              amount: 0,
              count: 0,
              mostRecent: null,
            },
          },
        },
      },
    });

    pipeline.push({
      $project: {
        userUsageData: 0,
      },
    });
  }

  // Handle period-based statistics
  if (req.query.period) {
    let startDate, endDate;
    const now = new Date();

    switch (req.query.period) {
      case "current-month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case "current-quarter":
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterMonth, 1);
        endDate = new Date(now.getFullYear(), quarterMonth + 3, 0);
        break;
      case "current-year":
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        break;
      case "last-month":
        if (now.getMonth() === 0) {
          startDate = new Date(now.getFullYear() - 1, 11, 1);
          endDate = new Date(now.getFullYear() - 1, 11, 31);
        } else {
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        }
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    pipeline.push({
      $lookup: {
        from: "expenses",
        let: { catId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$category", "$$catId"] },
                  { $gte: ["$journeyDate", startDate] },
                  { $lte: ["$journeyDate", endDate] },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              periodTotal: { $sum: "$totalCost" },
              periodCount: { $sum: 1 },
            },
          },
        ],
        as: "periodData",
      },
    });

    pipeline.push({
      $addFields: {
        periodUsage: {
          $cond: {
            if: { $gt: [{ $size: "$periodData" }, 0] },
            then: {
              total: { $arrayElemAt: ["$periodData.periodTotal", 0] },
              count: { $arrayElemAt: ["$periodData.periodCount", 0] },
              period: req.query.period,
              startDate: startDate,
              endDate: endDate,
            },
            else: {
              total: 0,
              count: 0,
              period: req.query.period,
              startDate: startDate,
              endDate: endDate,
            },
          },
        },
      },
    });

    // Compare with previous period if requested
    if (req.query.compareWithPrevious === "true") {
      let prevStartDate, prevEndDate;

      switch (req.query.period) {
        case "current-month":
          if (now.getMonth() === 0) {
            prevStartDate = new Date(now.getFullYear() - 1, 11, 1);
            prevEndDate = new Date(now.getFullYear() - 1, 11, 31);
          } else {
            prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
          }
          break;
        case "current-quarter":
          const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
          if (quarterMonth === 0) {
            prevStartDate = new Date(now.getFullYear() - 1, 9, 1);
            prevEndDate = new Date(now.getFullYear() - 1, 11, 31);
          } else {
            prevStartDate = new Date(now.getFullYear(), quarterMonth - 3, 1);
            prevEndDate = new Date(now.getFullYear(), quarterMonth, 0);
          }
          break;
        case "current-year":
          prevStartDate = new Date(now.getFullYear() - 1, 0, 1);
          prevEndDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
          break;
        default:
          if (now.getMonth() === 0) {
            prevStartDate = new Date(now.getFullYear() - 1, 11, 1);
            prevEndDate = new Date(now.getFullYear() - 1, 11, 31);
          } else {
            prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
          }
      }

      pipeline.push({
        $lookup: {
          from: "expenses",
          let: { catId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$category", "$$catId"] },
                    { $gte: ["$journeyDate", prevStartDate] },
                    { $lte: ["$journeyDate", prevEndDate] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                prevPeriodTotal: { $sum: "$totalCost" },
                prevPeriodCount: { $sum: 1 },
              },
            },
          ],
          as: "prevPeriodData",
        },
      });

      pipeline.push({
        $addFields: {
          previousPeriodUsage: {
            $cond: {
              if: { $gt: [{ $size: "$prevPeriodData" }, 0] },
              then: {
                total: { $arrayElemAt: ["$prevPeriodData.prevPeriodTotal", 0] },
                count: { $arrayElemAt: ["$prevPeriodData.prevPeriodCount", 0] },
                startDate: prevStartDate,
                endDate: prevEndDate,
              },
              else: {
                total: 0,
                count: 0,
                startDate: prevStartDate,
                endDate: prevEndDate,
              },
            },
          },
          changeFromPreviousPeriod: {
            $cond: {
              if: {
                $and: [
                  { $gt: [{ $size: "$prevPeriodData" }, 0] },
                  {
                    $gt: [
                      { $arrayElemAt: ["$prevPeriodData.prevPeriodTotal", 0] },
                      0,
                    ],
                  },
                ],
              },
              then: {
                $multiply: [
                  {
                    $divide: [
                      {
                        $subtract: [
                          {
                            $cond: {
                              if: { $gt: [{ $size: "$periodData" }, 0] },
                              then: {
                                $arrayElemAt: ["$periodData.periodTotal", 0],
                              },
                              else: 0,
                            },
                          },
                          {
                            $arrayElemAt: [
                              "$prevPeriodData.prevPeriodTotal",
                              0,
                            ],
                          },
                        ],
                      },
                      { $arrayElemAt: ["$prevPeriodData.prevPeriodTotal", 0] },
                    ],
                  },
                  100,
                ],
              },
              else: null,
            },
          },
        },
      });

      pipeline.push({
        $project: {
          prevPeriodData: 0,
          periodData: 0,
        },
      });
    } else {
      pipeline.push({
        $project: {
          periodData: 0,
        },
      });
    }
  }

  // Handle usageAbove filter - filter categories with usage above certain percentage
  if (req.query.usageAbove) {
    const threshold = parseInt(req.query.usageAbove);

    // First get all categories
    const categories = await Category.aggregate(pipeline);

    // Then filter based on budget usage
    const filteredCategories = await Promise.all(
      categories.filter(async (category) => {
        if (!category.budgetLimits || category.budgetLimits.length === 0) {
          return false;
        }

        // Find active budget limits
        const activeBudgetLimits = category.budgetLimits.filter(
          (limit) => limit.isActive
        );

        // Check if any budget limit meets the threshold
        for (const limit of activeBudgetLimits) {
          const usage = await Category.calculateBudgetUsage(
            category._id,
            limit.startDate,
            limit.endDate
          );

          const percentUsed = (usage / limit.amount) * 100;

          if (percentUsed > threshold) {
            return true;
          }
        }

        return false;
      })
    );

    // Sort by name (default)
    let sortedCategories = filteredCategories;

    // Sorting
    if (req.query.sort) {
      const sortFields = req.query.sort.split(",");
      sortedCategories = sortedCategories.sort((a, b) => {
        for (const field of sortFields) {
          const sortOrder = field.startsWith("-") ? -1 : 1;
          const sortField = field.startsWith("-") ? field.substring(1) : field;

          if (a[sortField] < b[sortField]) return -1 * sortOrder;
          if (a[sortField] > b[sortField]) return 1 * sortOrder;
        }
        return 0;
      });
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = sortedCategories.length;

    const paginatedCategories = sortedCategories.slice(startIndex, endIndex);

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

    return res.status(200).json({
      success: true,
      count: paginatedCategories.length,
      pagination,
      data: paginatedCategories,
    });
  }

  // Handle sortByUserUsage
  if (req.query.sortByUserUsage === "true") {
    pipeline.push({
      $sort: { "userUsage.amount": -1 },
    });
  } else {
    // Sorting
    if (req.query.sort) {
      const sortBy = req.query.sort.split(",").join(" ");
      pipeline.push({
        $sort: { [sortBy.replace("-", "")]: sortBy.startsWith("-") ? -1 : 1 },
      });
    } else {
      pipeline.push({ $sort: { name: 1 } });
    }
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 25;
  const skip = (page - 1) * limit;

  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });

  // Select Fields
  if (req.query.select) {
    const fields = req.query.select.split(",").reduce((obj, field) => {
      obj[field] = 1;
      return obj;
    }, {});
    pipeline.push({ $project: fields });
  }

  // Include budget alerts if requested
  if (req.query.includeBudgetAlerts === "true") {
    // Get all categories first
    const categories = await Category.aggregate(pipeline);

    // Then calculate budget usage and alerts for each category
    const categoriesWithBudgetAlerts = await Promise.all(
      categories.map(async (category) => {
        if (!category.budgetLimits || category.budgetLimits.length === 0) {
          return { ...category, budgetAlerts: [] };
        }

        // Find active budget limits
        const activeBudgetLimits = category.budgetLimits.filter(
          (limit) => limit.isActive
        );

        // Calculate budget alerts
        const budgetAlerts = await Promise.all(
          activeBudgetLimits.map(async (limit) => {
            const usage = await Category.calculateBudgetUsage(
              category._id,
              limit.startDate,
              limit.endDate
            );

            const percentUsed = (usage / limit.amount) * 100;
            const isOverBudget = percentUsed > 100;
            const isNearThreshold =
              percentUsed >= limit.notificationThreshold && percentUsed <= 100;

            if (isOverBudget || isNearThreshold) {
              return {
                budgetId: limit._id,
                period: limit.period,
                startDate: limit.startDate,
                endDate: limit.endDate,
                budgetAmount: limit.amount,
                currentUsage: usage,
                percentUsed: Math.round(percentUsed * 100) / 100,
                isOverBudget,
                isNearThreshold,
                alertStatus: isOverBudget ? "exceeded" : "warning",
              };
            }

            return null;
          })
        );

        // Filter out null values
        const filteredAlerts = budgetAlerts.filter((alert) => alert !== null);

        return { ...category, budgetAlerts: filteredAlerts };
      })
    );

    // Count for the original query
    const total = await Category.countDocuments(matchQuery);

    // Pagination result
    const pagination = {};

    if (page * limit < total) {
      pagination.next = {
        page: page + 1,
        limit,
      };
    }

    if (page > 1) {
      pagination.prev = {
        page: page - 1,
        limit,
      };
    }

    return res.status(200).json({
      success: true,
      count: categoriesWithBudgetAlerts.length,
      pagination,
      data: categoriesWithBudgetAlerts,
    });
  }

  // If includeUsage is true, include current usage data for each category
  if (req.query.includeUsage === "true") {
    // Calculate total for count
    const total = await Category.countDocuments(matchQuery);

    // Execute aggregation
    const categories = await Category.aggregate(pipeline);

    // Calculate and add usage data
    const categoriesWithUsage = await Promise.all(
      categories.map(async (category) => {
        // Current date for reference
        const now = new Date();

        // Calculate monthly usage (current month)
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const monthlyUsage = await Category.calculateBudgetUsage(
          category._id,
          monthStart,
          monthEnd
        );

        // Calculate quarterly usage (current quarter)
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
        const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);
        const quarterEnd = new Date(now.getFullYear(), quarterMonth + 3, 0);
        const quarterlyUsage = await Category.calculateBudgetUsage(
          category._id,
          quarterStart,
          quarterEnd
        );

        // Calculate yearly usage (current year)
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const yearEnd = new Date(now.getFullYear(), 11, 31);
        const yearlyUsage = await Category.calculateBudgetUsage(
          category._id,
          yearStart,
          yearEnd
        );

        // Add usage data to the category
        return {
          ...category,
          usage: {
            monthly: {
              amount: monthlyUsage,
              period: {
                start: monthStart,
                end: monthEnd,
              },
            },
            quarterly: {
              amount: quarterlyUsage,
              period: {
                start: quarterStart,
                end: quarterEnd,
              },
            },
            yearly: {
              amount: yearlyUsage,
              period: {
                start: yearStart,
                end: yearEnd,
              },
            },
            lastUpdated: now,
          },
        };
      })
    );

    // Pagination result
    const pagination = {};

    if (page * limit < total) {
      pagination.next = {
        page: page + 1,
        limit,
      };
    }

    if (page > 1) {
      pagination.prev = {
        page: page - 1,
        limit,
      };
    }

    return res.status(200).json({
      success: true,
      count: categoriesWithUsage.length,
      pagination,
      data: categoriesWithUsage,
    });
  }

  // Execute aggregation
  const categories = await Category.aggregate(pipeline);

  // Calculate total for pagination
  const total = await Category.countDocuments(matchQuery);

  // Pagination result
  const pagination = {};

  if (page * limit < total) {
    pagination.next = {
      page: page + 1,
      limit,
    };
  }

  if (page > 1) {
    pagination.prev = {
      page: page - 1,
      limit,
    };
  }

  res.status(200).json({
    success: true,
    count: categories.length,
    pagination,
    data: categories,
  });
});

// @desc    Get summarized category data (aggregate view)
// @route   GET /api/v1/categories/summary
// @access  Private
export const getCategorySummary = asyncHandler(async (req, res, next) => {
  // Current date for reference
  const now = new Date();

  // Period parameters (default to current month)
  const period = req.query.period || "current-month";

  let startDate, endDate;

  switch (period) {
    case "current-month":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case "current-quarter":
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      startDate = new Date(now.getFullYear(), quarterMonth, 1);
      endDate = new Date(now.getFullYear(), quarterMonth + 3, 0);
      break;
    case "current-year":
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      break;
    case "last-month":
      if (now.getMonth() === 0) {
        startDate = new Date(now.getFullYear() - 1, 11, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31);
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
      }
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }

  // Get all categories with budget information
  const categories = await Category.find().select("name budgetLimits isActive");

  // Calculate total budget and usage
  let totalBudget = 0;
  let totalUsage = 0;
  let categoriesOverBudget = 0;
  let categoriesNearThreshold = 0;

  // Categories grouped by usage level
  const usageLevels = {
    high: [], // >75%
    medium: [], // 25-75%
    low: [], // <25%
  };

  // Process each category
  const categorySummaries = await Promise.all(
    categories.map(async (category) => {
      // Calculate usage for the period
      const usage = await Category.calculateBudgetUsage(
        category._id,
        startDate,
        endDate
      );

      // Find applicable budget limit
      let budget = 0;
      let percentUsed = 0;
      let usageLevel = "low";

      if (category.budgetLimits && category.budgetLimits.length > 0) {
        // Find a matching budget limit for the period
        const matchingLimit = category.budgetLimits.find((limit) => {
          const limitStart = new Date(limit.startDate);
          const limitEnd = new Date(limit.endDate);

          return (
            limit.isActive &&
            ((limitStart <= startDate && limitEnd >= startDate) ||
              (limitStart <= endDate && limitEnd >= endDate) ||
              (limitStart >= startDate && limitEnd <= endDate))
          );
        });

        if (matchingLimit) {
          budget = matchingLimit.amount;
          percentUsed = (usage / budget) * 100;

          // Determine usage level
          if (percentUsed > 75) {
            usageLevel = "high";
            if (percentUsed > 90) {
              categoriesNearThreshold++;
            }
            if (percentUsed > 100) {
              categoriesOverBudget++;
            }
          } else if (percentUsed >= 25) {
            usageLevel = "medium";
          }

          // Add category to the appropriate usage level group
          usageLevels[usageLevel].push({
            _id: category._id,
            name: category.name,
            budget,
            usage,
            percentUsed: Math.round(percentUsed * 100) / 100,
          });

          // Add to totals
          totalBudget += budget;
        }
      }

      totalUsage += usage;

      return {
        _id: category._id,
        name: category.name,
        budget,
        usage,
        percentUsed: Math.round(percentUsed * 100) / 100,
        usageLevel,
      };
    })
  );

  // Calculate overall percentage
  const overallPercentage =
    totalBudget > 0 ? (totalUsage / totalBudget) * 100 : 0;

  // Prepare response
  const summary = {
    period: {
      name: period,
      startDate,
      endDate,
    },
    totalBudget,
    totalUsage,
    overallPercentage: Math.round(overallPercentage * 100) / 100,
    categoriesCount: categories.length,
    categoriesOverBudget,
    categoriesNearThreshold,
    usageLevels,
    categories: categorySummaries,
  };

  res.status(200).json({
    success: true,
    data: summary,
  });
});

// @desc    Get single category
// @route   GET /api/v1/categories/:id
// @access  Private
export const getCategory = asyncHandler(async (req, res, next) => {
  const includeUsage = req.query.includeUsage === "true";
  const includeRecentExpenses = req.query.includeRecentExpenses === "true";
  const includeBudgetAlerts = req.query.includeBudgetAlerts === "true";

  let category;

  if (includeUsage || includeRecentExpenses || includeBudgetAlerts) {
    // Use aggregation for advanced data
    let pipeline = [
      { $match: { _id: new mongoose.Types.ObjectId(req.params.id) } },
    ];

    if (includeRecentExpenses) {
      const limit = parseInt(req.query.expenseLimit) || 5;
      pipeline.push({
        $lookup: {
          from: "expenses",
          let: { catId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$category", "$$catId"] } } },
            { $sort: { journeyDate: -1 } },
            { $limit: limit },
          ],
          as: "recentExpenses",
        },
      });
    }

    // Execute aggregation
    const results = await Category.aggregate(pipeline);

    if (results.length === 0) {
      return next(
        new ErrorResponse(`Category not found with id of ${req.params.id}`, 404)
      );
    }

    category = results[0];

    // Add usage data if requested
    if (includeUsage) {
      // Current date for reference
      const now = new Date();

      // Calculate monthly usage (current month)
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const monthlyUsage = await Category.calculateBudgetUsage(
        category._id,
        monthStart,
        monthEnd
      );

      // Calculate quarterly usage (current quarter)
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);
      const quarterEnd = new Date(now.getFullYear(), quarterMonth + 3, 0);
      const quarterlyUsage = await Category.calculateBudgetUsage(
        category._id,
        quarterStart,
        quarterEnd
      );

      // Calculate yearly usage (current year)
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const yearEnd = new Date(now.getFullYear(), 11, 31);
      const yearlyUsage = await Category.calculateBudgetUsage(
        category._id,
        yearStart,
        yearEnd
      );

      // Add usage data to the category
      category.usage = {
        monthly: {
          amount: monthlyUsage,
          period: {
            start: monthStart,
            end: monthEnd,
          },
        },
        quarterly: {
          amount: quarterlyUsage,
          period: {
            start: quarterStart,
            end: quarterEnd,
          },
        },
        yearly: {
          amount: yearlyUsage,
          period: {
            start: yearStart,
            end: yearEnd,
          },
        },
        lastUpdated: now,
      };
    }

    // Add budget alerts if requested
    if (
      includeBudgetAlerts &&
      category.budgetLimits &&
      category.budgetLimits.length > 0
    ) {
      // Find active budget limits
      const activeBudgetLimits = category.budgetLimits.filter(
        (limit) => limit.isActive
      );

      // Calculate budget alerts
      const budgetAlerts = await Promise.all(
        activeBudgetLimits.map(async (limit) => {
          const usage = await Category.calculateBudgetUsage(
            category._id,
            limit.startDate,
            limit.endDate
          );

          const percentUsed = (usage / limit.amount) * 100;
          const isOverBudget = percentUsed > 100;
          const isNearThreshold =
            percentUsed >= limit.notificationThreshold && percentUsed <= 100;

          if (isOverBudget || isNearThreshold) {
            return {
              budgetId: limit._id,
              period: limit.period,
              startDate: limit.startDate,
              endDate: limit.endDate,
              budgetAmount: limit.amount,
              currentUsage: usage,
              percentUsed: Math.round(percentUsed * 100) / 100,
              isOverBudget,
              isNearThreshold,
              alertStatus: isOverBudget ? "exceeded" : "warning",
            };
          }

          return null;
        })
      );

      // Filter out null values
      category.budgetAlerts = budgetAlerts.filter((alert) => alert !== null);
    }
  } else {
    // Simple find for basic data
    category = await Category.findById(req.params.id);

    if (!category) {
      return next(
        new ErrorResponse(`Category not found with id of ${req.params.id}`, 404)
      );
    }
  }

  res.status(200).json({
    success: true,
    data: category,
  });
});

// @desc    Create new category
// @route   POST /api/v1/categories
// @access  Private/Admin
export const createCategory = asyncHandler(async (req, res, next) => {
  const { name, description, isActive, budgetLimits } = req.body;

  // Validate that name is not already taken
  const existingCategory = await Category.findOne({ name });
  if (existingCategory) {
    return next(
      new ErrorResponse(`Category with name '${name}' already exists`, 400)
    );
  }

  // Set default values
  const now = new Date();
  const categoryData = {
    name,
    description,
    isActive: isActive !== undefined ? isActive : true,
    currentUsage: {
      monthly: { amount: 0, lastUpdated: now },
      quarterly: { amount: 0, lastUpdated: now },
      yearly: { amount: 0, lastUpdated: now },
    },
  };

  // Process and validate budget limits if provided
  if (budgetLimits && budgetLimits.length > 0) {
    // Validate each budget limit
    const processedBudgetLimits = [];

    for (const limit of budgetLimits) {
      // Validate required fields
      if (!limit.amount || !limit.period || !limit.startDate) {
        return next(
          new ErrorResponse(
            "Budget limits require amount, period, and startDate",
            400
          )
        );
      }

      // Validate amount is positive
      if (limit.amount <= 0) {
        return next(
          new ErrorResponse("Budget amount must be greater than zero", 400)
        );
      }

      // Validate period is valid
      const validPeriods = ["monthly", "quarterly", "yearly"];
      if (!validPeriods.includes(limit.period)) {
        return next(
          new ErrorResponse(
            `Period must be one of: ${validPeriods.join(", ")}`,
            400
          )
        );
      }

      // Calculate end date based on period
      const startDate = new Date(limit.startDate);
      let endDate;

      if (limit.period === "monthly") {
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0); // Last day of the month
      } else if (limit.period === "quarterly") {
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 3);
        endDate.setDate(0); // Last day of the quarter
      } else if (limit.period === "yearly") {
        endDate = new Date(startDate);
        endDate.setFullYear(endDate.getFullYear() + 1);
        endDate.setDate(0); // Last day of the year
      }

      // Create budget limit object
      const budgetLimit = {
        amount: limit.amount,
        period: limit.period,
        startDate,
        endDate,
        isActive: limit.isActive !== undefined ? limit.isActive : true,
        notificationThreshold: limit.notificationThreshold || 80,
      };

      // Check for overlapping periods
      const hasOverlap = processedBudgetLimits.some((existing) => {
        if (existing.period !== budgetLimit.period) return false;

        const existingStart = new Date(existing.startDate);
        const existingEnd = new Date(existing.endDate);

        // Check if date ranges overlap
        return (
          (startDate >= existingStart && startDate <= existingEnd) ||
          (endDate >= existingStart && endDate <= existingEnd) ||
          (startDate <= existingStart && endDate >= existingEnd)
        );
      });

      if (hasOverlap) {
        return next(
          new ErrorResponse(
            `Budget periods of the same type cannot overlap`,
            400
          )
        );
      }

      processedBudgetLimits.push(budgetLimit);
    }

    // Add validated budget limits to category data
    categoryData.budgetLimits = processedBudgetLimits;
  }

  // Create the category
  const category = await Category.create(categoryData);

  res.status(201).json({
    success: true,
    data: category,
  });
});

// @desc    Update category
// @route   PUT /api/v1/categories/:id
// @access  Private/Admin
export const updateCategory = asyncHandler(async (req, res, next) => {
  const { name, description, isActive, budgetLimits } = req.body;

  // Find the category
  let category = await Category.findById(req.params.id);

  if (!category) {
    return next(
      new ErrorResponse(`Category not found with id of ${req.params.id}`, 404)
    );
  }

  // Check if updating name and it already exists
  if (name && name !== category.name) {
    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return next(
        new ErrorResponse(`Category with name '${name}' already exists`, 400)
      );
    }
  }

  // Prepare update data
  const updateData = {};
  if (name) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (isActive !== undefined) updateData.isActive = isActive;

  // Process and validate budget limits if provided
  if (budgetLimits && budgetLimits.length > 0) {
    // Validate each budget limit
    const processedBudgetLimits = [];

    for (const limit of budgetLimits) {
      // Validate required fields
      if (!limit.amount || !limit.period || !limit.startDate) {
        return next(
          new ErrorResponse(
            "Budget limits require amount, period, and startDate",
            400
          )
        );
      }

      // Validate amount is positive
      if (limit.amount <= 0) {
        return next(
          new ErrorResponse("Budget amount must be greater than zero", 400)
        );
      }

      // Validate period is valid
      const validPeriods = ["monthly", "quarterly", "yearly"];
      if (!validPeriods.includes(limit.period)) {
        return next(
          new ErrorResponse(
            `Period must be one of: ${validPeriods.join(", ")}`,
            400
          )
        );
      }

      // Calculate end date based on period
      const startDate = new Date(limit.startDate);
      let endDate;

      if (limit.period === "monthly") {
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0); // Last day of the month
      } else if (limit.period === "quarterly") {
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 3);
        endDate.setDate(0); // Last day of the quarter
      } else if (limit.period === "yearly") {
        endDate = new Date(startDate);
        endDate.setFullYear(endDate.getFullYear() + 1);
        endDate.setDate(0); // Last day of the year
      }

      // Create budget limit object
      const budgetLimit = {
        amount: limit.amount,
        period: limit.period,
        startDate,
        endDate,
        isActive: limit.isActive !== undefined ? limit.isActive : true,
        notificationThreshold: limit.notificationThreshold || 80,
      };

      // If updating existing limit, preserve its ID
      if (limit._id) {
        budgetLimit._id = limit._id;
      }

      // Check for overlapping periods (excluding the current limit if it has an ID)
      const hasOverlap = processedBudgetLimits.some((existing) => {
        // Skip if comparing the same limit (by ID)
        if (
          limit._id &&
          existing._id &&
          limit._id.toString() === existing._id.toString()
        ) {
          return false;
        }

        // Skip if different period types
        if (existing.period !== budgetLimit.period) return false;

        const existingStart = new Date(existing.startDate);
        const existingEnd = new Date(existing.endDate);

        // Check if date ranges overlap
        return (
          (startDate >= existingStart && startDate <= existingEnd) ||
          (endDate >= existingStart && endDate <= existingEnd) ||
          (startDate <= existingStart && endDate >= existingEnd)
        );
      });

      if (hasOverlap) {
        return next(
          new ErrorResponse(
            `Budget periods of the same type cannot overlap`,
            400
          )
        );
      }

      processedBudgetLimits.push(budgetLimit);
    }

    // Add validated budget limits to update data
    updateData.budgetLimits = processedBudgetLimits;
  }

  // Update the category
  category = await Category.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: category,
  });
});

// @desc    Delete category
// @route   DELETE /api/v1/categories/:id
// @access  Private/Admin
export const deleteCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(
      new ErrorResponse(`Category not found with id of ${req.params.id}`, 404)
    );
  }

  // Check if there are any expenses associated with this category
  const expenseCount = await Expense.countDocuments({
    category: req.params.id,
  });

  if (expenseCount > 0) {
    // Get sample of recent expenses for this category
    const recentExpenses = await Expense.find({ category: req.params.id })
      .select("journeyDate totalCost")
      .sort({ journeyDate: -1 })
      .limit(3);

    const formattedExpenses = recentExpenses
      .map((exp) => {
        const date = new Date(exp.journeyDate).toLocaleDateString();
        return `CHF ${exp.totalCost.toFixed(2)} (${date})`;
      })
      .join(", ");

    return next(
      new ErrorResponse(
        `Cannot delete category "${category.name}" because it has ${expenseCount} associated expenses. ` +
          `Most recent expenses: ${formattedExpenses}. ` +
          `To maintain data integrity, categories with expenses cannot be deleted. ` +
          `Instead, you can update the category and set "isActive": false to hide it from active use.`,
        400
      )
    );
  }

  await category.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Add budget limit to category
// @route   POST /api/v1/categories/:id/budget
// @access  Private/Admin
export const addBudgetLimit = asyncHandler(async (req, res, next) => {
  const { amount, period, startDate, notificationThreshold } = req.body;

  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(
      new ErrorResponse(`Category not found with id of ${req.params.id}`, 404)
    );
  }

  // Calculate end date based on period
  let endDate;
  const start = new Date(startDate);

  if (period === "monthly") {
    endDate = new Date(start);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0); // Last day of the month
  } else if (period === "quarterly") {
    endDate = new Date(start);
    endDate.setMonth(endDate.getMonth() + 3);
    endDate.setDate(0); // Last day of the quarter
  } else if (period === "yearly") {
    endDate = new Date(start);
    endDate.setFullYear(endDate.getFullYear() + 1);
    endDate.setDate(0); // Last day of the year
  }

  // Create new budget limit
  const budgetLimit = {
    amount,
    period,
    startDate: start,
    endDate,
    isActive: true,
    notificationThreshold: notificationThreshold || 80,
  };

  // Add to budget limits array
  category.budgetLimits.push(budgetLimit);

  await category.save();

  res.status(201).json({
    success: true,
    data: category,
  });
});

// @desc    Update budget limit
// @route   PUT /api/v1/categories/:id/budget/:budgetId
// @access  Private/Admin
export const updateBudgetLimit = asyncHandler(async (req, res, next) => {
  const { amount, period, startDate, isActive, notificationThreshold } =
    req.body;

  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(
      new ErrorResponse(`Category not found with id of ${req.params.id}`, 404)
    );
  }

  // Find the budget limit to update
  const budgetLimit = category.budgetLimits.id(req.params.budgetId);

  if (!budgetLimit) {
    return next(
      new ErrorResponse(
        `Budget limit not found with id of ${req.params.budgetId}`,
        404
      )
    );
  }

  // Update fields
  if (amount) budgetLimit.amount = amount;
  if (notificationThreshold)
    budgetLimit.notificationThreshold = notificationThreshold;
  if (isActive !== undefined) budgetLimit.isActive = isActive;

  // If period or start date changes, recalculate end date
  if (period || startDate) {
    const start = startDate ? new Date(startDate) : budgetLimit.startDate;
    const newPeriod = period || budgetLimit.period;

    budgetLimit.period = newPeriod;
    budgetLimit.startDate = start;

    let endDate;
    if (newPeriod === "monthly") {
      endDate = new Date(start);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);
    } else if (newPeriod === "quarterly") {
      endDate = new Date(start);
      endDate.setMonth(endDate.getMonth() + 3);
      endDate.setDate(0);
    } else if (newPeriod === "yearly") {
      endDate = new Date(start);
      endDate.setFullYear(endDate.getFullYear() + 1);
      endDate.setDate(0);
    }

    budgetLimit.endDate = endDate;
  }

  await category.save();

  res.status(200).json({
    success: true,
    data: category,
  });
});

// @desc    Delete budget limit
// @route   DELETE /api/v1/categories/:id/budget/:budgetId
// @access  Private/Admin
export const deleteBudgetLimit = asyncHandler(async (req, res, next) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(
      new ErrorResponse(`Category not found with id of ${req.params.id}`, 404)
    );
  }

  // Find and remove the budget limit
  const budgetLimit = category.budgetLimits.id(req.params.budgetId);

  if (!budgetLimit) {
    return next(
      new ErrorResponse(
        `Budget limit not found with id of ${req.params.budgetId}`,
        404
      )
    );
  }

  budgetLimit.remove();
  await category.save();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Get budget usage for a category
// @route   GET /api/v1/categories/:id/budget/usage
// @access  Private
export const getBudgetUsage = asyncHandler(async (req, res, next) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(
      new ErrorResponse(`Category not found with id of ${req.params.id}`, 404)
    );
  }

  // Get active budget limits
  const activeBudgetLimits = category.budgetLimits.filter(
    (limit) => limit.isActive
  );

  // Calculate current usage for each active budget limit
  const budgetUsage = await Promise.all(
    activeBudgetLimits.map(async (limit) => {
      const usage = await Category.calculateBudgetUsage(
        category._id,
        limit.startDate,
        limit.endDate
      );

      const percentUsed = (usage / limit.amount) * 100;
      const isOverBudget = percentUsed > 100;
      const isNearThreshold =
        percentUsed >= limit.notificationThreshold && percentUsed <= 100;

      return {
        budgetId: limit._id,
        period: limit.period,
        startDate: limit.startDate,
        endDate: limit.endDate,
        budgetAmount: limit.amount,
        currentUsage: usage,
        percentUsed: Math.round(percentUsed * 100) / 100,
        isOverBudget,
        isNearThreshold,
        alertStatus: isOverBudget
          ? "exceeded"
          : isNearThreshold
          ? "warning"
          : "normal",
      };
    })
  );

  res.status(200).json({
    success: true,
    data: budgetUsage,
  });
});

// @desc    Update budget usage after new expense
// @route   POST /api/v1/categories/:id/budget/update-usage
// @access  Private (Internal use)
export const updateBudgetUsage = asyncHandler(async (req, res, next) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(
      new ErrorResponse(`Category not found with id of ${req.params.id}`, 404)
    );
  }

  const now = new Date();

  // Calculate monthly usage (current month)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthlyUsage = await Category.calculateBudgetUsage(
    category._id,
    monthStart,
    monthEnd
  );

  // Calculate quarterly usage (current quarter)
  const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
  const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);
  const quarterEnd = new Date(now.getFullYear(), quarterMonth + 3, 0);
  const quarterlyUsage = await Category.calculateBudgetUsage(
    category._id,
    quarterStart,
    quarterEnd
  );

  // Calculate yearly usage (current year)
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31);
  const yearlyUsage = await Category.calculateBudgetUsage(
    category._id,
    yearStart,
    yearEnd
  );

  // Update the category with current usage data
  category.currentUsage = {
    monthly: {
      amount: monthlyUsage,
      lastUpdated: now,
    },
    quarterly: {
      amount: quarterlyUsage,
      lastUpdated: now,
    },
    yearly: {
      amount: yearlyUsage,
      lastUpdated: now,
    },
  };

  await category.save();

  res.status(200).json({
    success: true,
    data: category.currentUsage,
  });
});
