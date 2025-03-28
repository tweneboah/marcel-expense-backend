import asyncHandler from "express-async-handler";
import ErrorResponse from "../utils/errorResponse.js";
import Budget from "../models/Budget.js";
import Expense from "../models/Expense.js";
import Category from "../models/Category.js";
import { formatCHF, getMonthName } from "../utils/formatters.js";
import mongoose from "mongoose";

/**
 * Helper function to create a sample expense for testing/debugging if none exist
 */
const createSampleExpenseIfNeeded = async (userId, categoryId, year, month) => {
  // Check if there are any expenses for this period
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  console.log(
    `Checking for expenses in ${month}/${year} with category ${categoryId}`
  );

  const existingExpenses = await Expense.find({
    user: userId,
    category: categoryId,
    journeyDate: { $gte: startDate, $lte: endDate },
  });

  if (existingExpenses.length === 0) {
    console.log(
      `No expenses found for period ${month}/${year}, creating a sample expense`
    );
    // Create a sample expense
    const sampleExpense = {
      user: userId,
      category: categoryId,
      startingPoint: "Sample Start Point",
      destinationPoint: "Sample Destination",
      distance: 100,
      costPerKm: 0.7,
      totalCost: 70, // Pre-calculate to avoid validation issues
      journeyDate: new Date(year, month - 1, 15), // Middle of the month
      notes: "Sample expense for testing",
    };

    try {
      const expense = await Expense.create(sampleExpense);
      console.log(
        `Created sample expense with ID: ${expense._id} and date: ${expense.journeyDate}`
      );
      return expense;
    } catch (err) {
      console.error(`Error creating sample expense: ${err.message}`);
      return null;
    }
  } else {
    console.log(
      `Found ${existingExpenses.length} existing expenses for period ${month}/${year}`
    );
    return existingExpenses[0];
  }
};

/**
 * @desc    Get all budgets
 * @route   GET /api/v1/budgets
 * @access  Private
 */
export const getBudgets = asyncHandler(async (req, res, next) => {
  const {
    year,
    month,
    isActive = "true",
    sort = "-year,-month",
    page = 1,
    limit = 10,
    includeExpenses = "true",
  } = req.query;

  // For admin users, don't filter by user ID
  const userFilter = req.user.role === "admin" ? {} : { user: req.user._id };
  console.log(
    `Using user filter for getBudgets: ${JSON.stringify(userFilter)}`
  );

  // Build filter object
  const filter = { ...userFilter };

  if (year) {
    filter.year = parseInt(year);
  }

  if (month) {
    filter.month = parseInt(month);
  }

  if (isActive === "true") {
    filter.isActive = true;
  } else if (isActive === "false") {
    filter.isActive = false;
  }

  // Pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await Budget.countDocuments(filter);

  // Find budgets with pagination and sorting
  const query = Budget.find(filter)
    .populate("category", "name color")
    .sort(sort)
    .skip(startIndex)
    .limit(limit);

  // Execute query
  const budgets = await query;

  // Pagination result
  const pagination = {};

  if (endIndex < total) {
    pagination.next = {
      page: parseInt(page) + 1,
      limit,
    };
  }

  if (startIndex > 0) {
    pagination.prev = {
      page: parseInt(page) - 1,
      limit,
    };
  }

  console.log(`Found ${budgets.length} budgets matching filter`);

  // Add actual expenses for each budget
  const budgetsWithUsage = await Promise.all(
    budgets.map(async (budget) => {
      const budgetObj = budget.toObject();

      // If includeExpenses=true and there are no expenses, create a sample one (for debugging)
      if (includeExpenses === "true" && req.query.debug === "true") {
        await createSampleExpenseIfNeeded(
          budget.user,
          budget.category,
          budget.year,
          budget.month || 1
        );
      }

      // For Date-based filtering
      // First, calculate start and end dates
      let startDate, endDate;
      if (budget.month === 0) {
        // Annual budget
        startDate = new Date(budget.year, 0, 1);
        endDate = new Date(budget.year, 11, 31, 23, 59, 59);
      } else {
        // Monthly budget
        startDate = new Date(budget.year, budget.month - 1, 1);
        endDate = new Date(budget.year, budget.month, 0, 23, 59, 59);
      }

      console.log(
        `Budget period: ${startDate.toISOString()} to ${endDate.toISOString()}`
      );

      // Use direct date comparison instead of $expr
      const dateFilter = {
        journeyDate: { $gte: startDate, $lte: endDate },
      };

      // Use the budget's user ID, not the current user's ID
      // This is important for admin views where budgets might be owned by different users
      const expenseUserFilter = { user: budget.user };

      // For debugging
      const allExpensesForUser = await Expense.find(expenseUserFilter)
        .select("journeyDate category")
        .sort("-journeyDate")
        .limit(5);

      console.log(
        `Latest expenses for user ${budget.user}:`,
        allExpensesForUser.map(
          (e) => `${e._id}: ${e.journeyDate.toISOString()} Cat:${e.category}`
        )
      );

      const expenseMatchQuery = {
        ...expenseUserFilter,
        ...dateFilter,
        category: new mongoose.Types.ObjectId(budget.category),
      };

      console.log(
        `Finding expenses for budget ${budget._id} with filters:`,
        JSON.stringify(expenseMatchQuery)
      );

      // Find expenses that match this budget's category, year, and month
      const expenses = await Expense.aggregate([
        {
          $match: expenseMatchQuery,
        },
        {
          $group: {
            _id: null,
            totalCost: { $sum: "$totalCost" },
            totalDistance: { $sum: "$distance" },
            count: { $sum: 1 },
          },
        },
      ]);

      console.log(
        `Found ${expenses.length > 0 ? expenses[0].count : 0} matching expenses`
      );

      // Calculate usage statistics
      const expenseData =
        expenses.length > 0
          ? expenses[0]
          : {
              totalCost: 0,
              totalDistance: 0,
              count: 0,
            };

      // Calculate usage percentage
      const usagePercentage =
        budget.amount > 0
          ? parseFloat(
              ((expenseData.totalCost / budget.amount) * 100).toFixed(1)
            )
          : 0;

      // Determine status based on thresholds
      let status = "under";
      if (usagePercentage >= budget.criticalThreshold) {
        status = "critical";
      } else if (usagePercentage >= budget.warningThreshold) {
        status = "warning";
      }

      // Add period name for better UI display
      let periodName;
      if (budget.month === 0) {
        periodName = `Annual ${budget.year}`;
      } else {
        periodName = `${getMonthName(budget.month)} ${budget.year}`;
      }

      return {
        ...budgetObj,
        usage: {
          totalExpenses: expenseData.count,
          totalCost: parseFloat(expenseData.totalCost.toFixed(2)),
          totalDistance: parseFloat(expenseData.totalDistance.toFixed(2)),
          usagePercentage,
          status,
          remaining: parseFloat(
            (budget.amount - expenseData.totalCost).toFixed(2)
          ),
        },
        periodName,
      };
    })
  );

  res.status(200).json({
    success: true,
    count: budgets.length,
    pagination,
    data: budgetsWithUsage,
  });
});

/**
 * @desc    Get single budget
 * @route   GET /api/v1/budgets/:id
 * @access  Private
 */
export const getBudget = asyncHandler(async (req, res, next) => {
  const budget = await Budget.findById(req.params.id).populate(
    "category",
    "name color"
  );

  console.log(`Getting budget details for ID: ${req.params.id}`);

  if (!budget) {
    return next(
      new ErrorResponse(`No budget found with id of ${req.params.id}`, 404)
    );
  }

  // For regular users, check if they own the budget
  if (req.user.role !== "admin" && budget.user.toString() !== req.user.id) {
    return next(new ErrorResponse(`Not authorized to access this budget`, 403));
  }

  // Calculate expense totals for this budget
  const userFilter = req.user.role === "admin" ? {} : { user: budget.user };
  console.log(`Using user filter: ${JSON.stringify(userFilter)}`);

  // Calculate date range based on budget period
  let startDate, endDate;
  if (budget.month === 0) {
    // Annual budget
    startDate = new Date(budget.year, 0, 1);
    endDate = new Date(budget.year, 11, 31, 23, 59, 59);
    console.log(
      `Using annual date filter for year ${
        budget.year
      }: ${startDate.toISOString()} to ${endDate.toISOString()}`
    );
  } else {
    // Monthly budget
    startDate = new Date(budget.year, budget.month - 1, 1);
    endDate = new Date(budget.year, budget.month, 0, 23, 59, 59);
    console.log(
      `Using monthly date filter for ${budget.month}/${
        budget.year
      }: ${startDate.toISOString()} to ${endDate.toISOString()}`
    );
  }

  // Use direct date comparison
  const dateFilter = {
    journeyDate: { $gte: startDate, $lte: endDate },
  };

  // For debugging, check if we have any expenses at all for this category
  const totalExpensesForCategory = await Expense.countDocuments({
    category: new mongoose.Types.ObjectId(budget.category),
  });
  console.log(
    `Total expenses found for category ${budget.category}: ${totalExpensesForCategory}`
  );

  // For debugging, check if we have any expenses at all for this user
  const totalExpensesForUser = await Expense.countDocuments({
    user: budget.user,
  });
  console.log(
    `Total expenses found for user ${budget.user}: ${totalExpensesForUser}`
  );

  // For debugging, find a few expenses for this user
  const sampleExpenses = await Expense.find({ user: budget.user })
    .select("journeyDate category")
    .sort("-journeyDate")
    .limit(5);

  console.log(
    `Sample expenses for user ${budget.user}:`,
    sampleExpenses.map(
      (e) => `${e._id}: ${e.journeyDate.toISOString()} Cat:${e.category}`
    )
  );

  // Find expenses that match this budget's category, year, and month
  const expenseMatchFilter = {
    ...userFilter,
    ...dateFilter,
    category: new mongoose.Types.ObjectId(budget.category),
  };
  console.log(`Using expense filter: ${JSON.stringify(expenseMatchFilter)}`);

  const expenses = await Expense.aggregate([
    {
      $match: expenseMatchFilter,
    },
    {
      $group: {
        _id: null,
        totalCost: { $sum: "$totalCost" },
        totalDistance: { $sum: "$distance" },
        count: { $sum: 1 },
      },
    },
  ]);

  console.log(
    `Found ${expenses.length > 0 ? expenses[0].count : 0} matching expenses`
  );

  // Calculate usage statistics
  const expenseData =
    expenses.length > 0
      ? expenses[0]
      : {
          totalCost: 0,
          totalDistance: 0,
          count: 0,
        };

  const usage = {
    actualCost: parseFloat(expenseData.totalCost.toFixed(2)),
    actualDistance: parseFloat(expenseData.totalDistance.toFixed(2)),
    expenseCount: expenseData.count,
    remainingAmount: parseFloat(
      (budget.amount - expenseData.totalCost).toFixed(2)
    ),
    usagePercentage: parseFloat(
      ((expenseData.totalCost / budget.amount) * 100).toFixed(1)
    ),
  };

  // Determine status based on thresholds
  let status = "under";
  if (usage.usagePercentage >= budget.criticalThreshold) {
    status = "critical";
  } else if (usage.usagePercentage >= budget.warningThreshold) {
    status = "warning";
  }

  res.status(200).json({
    success: true,
    data: {
      ...budget._doc,
      usage,
      status,
      periodLabel:
        budget.month > 0
          ? `${getMonthName(budget.month)} ${budget.year}`
          : `${budget.year} (Annual)`,
    },
  });
});

/**
 * @desc    Create new budget
 * @route   POST /api/v1/budgets
 * @access  Private
 */
export const createBudget = asyncHandler(async (req, res, next) => {
  // If admin is creating a budget for another user, they need to specify the user
  if (req.user.role === "admin" && req.body.user) {
    // Keep the user ID from the request
    console.log(`Admin creating budget for user: ${req.body.user}`);
  } else {
    // For regular users or admin not specifying a user, set the user to current user
    req.body.user = req.user.id;
  }

  // Check if budget already exists for this period and category
  const existingBudget = await Budget.findOne({
    user: req.body.user,
    year: req.body.year,
    month: req.body.month || 0,
    category: req.body.category,
    isActive: true,
  });

  if (existingBudget) {
    return next(
      new ErrorResponse(
        `A budget already exists for this period and category`,
        400
      )
    );
  }

  const budget = await Budget.create(req.body);

  res.status(201).json({
    success: true,
    data: budget,
  });
});

/**
 * @desc    Update budget
 * @route   PUT /api/v1/budgets/:id
 * @access  Private
 */
export const updateBudget = asyncHandler(async (req, res, next) => {
  let budget = await Budget.findById(req.params.id);

  if (!budget) {
    return next(
      new ErrorResponse(`No budget found with id of ${req.params.id}`, 404)
    );
  }

  // For regular users, check if they own the budget
  if (req.user.role !== "admin" && budget.user.toString() !== req.user.id) {
    return next(new ErrorResponse(`Not authorized to update this budget`, 403));
  }

  // Check for potential duplicate
  if (req.body.year || req.body.month || req.body.category) {
    const year = req.body.year || budget.year;
    const month = req.body.month !== undefined ? req.body.month : budget.month;
    const category = req.body.category || budget.category;

    // Check if another budget exists with these period/category details
    const existingBudget = await Budget.findOne({
      _id: { $ne: budget._id }, // Exclude current budget
      user: budget.user,
      year: year,
      month: month,
      category: category,
      isActive: true,
    });

    if (existingBudget) {
      return next(
        new ErrorResponse(
          `A budget already exists for this period and category`,
          400
        )
      );
    }
  }

  // Update budget
  budget = await Budget.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: budget,
  });
});

/**
 * @desc    Delete budget
 * @route   DELETE /api/v1/budgets/:id
 * @access  Private
 */
export const deleteBudget = asyncHandler(async (req, res, next) => {
  const budget = await Budget.findById(req.params.id);

  if (!budget) {
    return next(
      new ErrorResponse(`No budget found with id of ${req.params.id}`, 404)
    );
  }

  // For regular users, check if they own the budget
  if (req.user.role !== "admin" && budget.user.toString() !== req.user.id) {
    return next(new ErrorResponse(`Not authorized to delete this budget`, 403));
  }

  await budget.remove();

  res.status(200).json({
    success: true,
    data: {},
  });
});

/**
 * @desc    Get budget summary for a year
 * @route   GET /api/v1/budgets/summary
 * @access  Private
 */
export const getBudgetSummary = asyncHandler(async (req, res, next) => {
  const { year = new Date().getFullYear() } = req.query;
  const yearInt = parseInt(year);

  // For admin users, don't filter by user ID
  const userFilter = req.user.role === "admin" ? {} : { user: req.user._id };
  console.log(
    `Using user filter for budget summary: ${JSON.stringify(userFilter)}`
  );

  // Get all active budgets for this year
  const budgets = await Budget.find({
    ...userFilter,
    year: yearInt,
    isActive: true,
  }).populate("category", "name color");

  if (budgets.length === 0) {
    return next(
      new ErrorResponse(`No budgets found for the year ${year}`, 404)
    );
  }

  // Calculate date range
  const yearStartDate = new Date(yearInt, 0, 1);
  const yearEndDate = new Date(yearInt, 11, 31, 23, 59, 59);
  console.log(
    `Year date range: ${yearStartDate.toISOString()} to ${yearEndDate.toISOString()}`
  );

  // Create expense match filter with direct date comparison
  const expenseMatchFilter = {
    ...userFilter,
    journeyDate: { $gte: yearStartDate, $lte: yearEndDate },
  };
  console.log(
    `Using expense match filter: ${JSON.stringify(expenseMatchFilter)}`
  );

  // For debugging, check if we have any expenses at all for this year
  const totalExpensesForYear = await Expense.countDocuments(expenseMatchFilter);
  console.log(
    `Total expenses found for year ${yearInt}: ${totalExpensesForYear}`
  );

  // If no expenses found, check a sample
  if (totalExpensesForYear === 0) {
    const sampleExpenses = await Expense.find(userFilter)
      .select("journeyDate category user")
      .sort("-journeyDate")
      .limit(5);

    console.log(
      `Sample expenses for user:`,
      sampleExpenses.map(
        (e) =>
          `${e._id}: ${e.journeyDate.toISOString()} User:${e.user} Cat:${
            e.category
          }`
      )
    );
  }

  // Get expenses grouped by month and category
  const expenses = await Expense.aggregate([
    {
      $match: expenseMatchFilter,
    },
    {
      $group: {
        _id: {
          month: { $month: "$journeyDate" },
          category: "$category",
        },
        actualCost: { $sum: "$totalCost" },
        actualDistance: { $sum: "$distance" },
        expenseCount: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        month: "$_id.month",
        category: "$_id.category",
        actualCost: { $round: ["$actualCost", 2] },
        actualDistance: { $round: ["$actualDistance", 2] },
        expenseCount: 1,
      },
    },
  ]);

  console.log(
    `Found ${expenses.length} expense aggregations by month/category`
  );
  // Log a sample of what we found to aid debugging
  if (expenses.length > 0) {
    console.log(`Sample expense aggregation:`, JSON.stringify(expenses[0]));
  }

  // Organize by month
  const monthlyData = [];
  for (let month = 1; month <= 12; month++) {
    const monthBudgets = budgets.filter(
      (b) => b.month === month || b.month === 0
    );
    const monthExpenses = expenses.filter((e) => e.month === month);

    console.log(
      `Month ${month}: Found ${monthBudgets.length} budgets and ${monthExpenses.length} expense records`
    );

    let totalBudgeted = 0;
    let totalActual = 0;

    const categories = monthBudgets.map((budget) => {
      const categoryId = budget.category._id.toString();

      // Debug info
      console.log(`Looking for expenses with category ID: ${categoryId}`);
      if (monthExpenses.length > 0) {
        const exampleCategory = monthExpenses[0].category;
        console.log(`Example expense category type: ${typeof exampleCategory}`);
        if (exampleCategory) {
          console.log(`Example expense category value: ${exampleCategory}`);
        }
      }

      // Use toString() to ensure consistent comparison
      const categoryExpenses = monthExpenses.find(
        (e) => e.category && e.category.toString() === categoryId
      );

      if (categoryExpenses) {
        console.log(
          `Found expenses for category ${categoryId} in month ${month}: ${categoryExpenses.actualCost} CHF`
        );
      } else {
        console.log(
          `No expenses found for category ${categoryId} in month ${month}`
        );
      }

      const actualCost = categoryExpenses ? categoryExpenses.actualCost : 0;
      totalBudgeted += budget.amount;
      totalActual += actualCost;

      return {
        categoryId,
        categoryName: budget.category.name,
        categoryColor: budget.category.color,
        budgetedAmount: budget.amount,
        actualAmount: actualCost,
        remaining: parseFloat((budget.amount - actualCost).toFixed(2)),
        usagePercentage:
          budget.amount > 0
            ? parseFloat(((actualCost / budget.amount) * 100).toFixed(1))
            : 0,
      };
    });

    monthlyData.push({
      month,
      monthName: getMonthName(month),
      totalBudgeted: parseFloat(totalBudgeted.toFixed(2)),
      totalActual: parseFloat(totalActual.toFixed(2)),
      totalRemaining: parseFloat((totalBudgeted - totalActual).toFixed(2)),
      usagePercentage:
        totalBudgeted > 0
          ? parseFloat(((totalActual / totalBudgeted) * 100).toFixed(1))
          : 0,
      categories,
    });
  }

  // Calculate yearly totals
  const yearlyTotal = {
    totalBudgeted: parseFloat(
      monthlyData
        .reduce((sum, month) => sum + month.totalBudgeted, 0)
        .toFixed(2)
    ),
    totalActual: parseFloat(
      monthlyData.reduce((sum, month) => sum + month.totalActual, 0).toFixed(2)
    ),
    totalRemaining: parseFloat(
      monthlyData
        .reduce((sum, month) => sum + month.totalRemaining, 0)
        .toFixed(2)
    ),
    usagePercentage: 0,
  };

  yearlyTotal.usagePercentage =
    yearlyTotal.totalBudgeted > 0
      ? parseFloat(
          ((yearlyTotal.totalActual / yearlyTotal.totalBudgeted) * 100).toFixed(
            1
          )
        )
      : 0;

  res.status(200).json({
    success: true,
    data: {
      year: yearInt,
      months: monthlyData,
      yearlyTotal,
    },
  });
});

export default {
  getBudgets,
  getBudget,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetSummary,
};
