import mongoose from "mongoose";

const BudgetLimitSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: [true, "Please add a budget amount"],
      min: [0, "Budget amount cannot be negative"],
    },
    period: {
      type: String,
      enum: ["monthly", "quarterly", "yearly"],
      required: [true, "Please specify the budget period"],
    },
    startDate: {
      type: Date,
      required: [true, "Please add a start date for the budget period"],
    },
    endDate: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    notificationThreshold: {
      type: Number,
      default: 80,
      min: [1, "Threshold must be at least 1%"],
      max: [100, "Threshold cannot exceed 100%"],
      description:
        "Percentage threshold for budget consumption alerts (e.g. 80 means alert at 80% usage)",
    },
  },
  { _id: false }
);

const CategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please add a category name"],
      trim: true,
      unique: true,
      maxlength: [50, "Name cannot be more than 50 characters"],
    },
    description: {
      type: String,
      maxlength: [500, "Description cannot be more than 500 characters"],
    },
    budgetLimits: [BudgetLimitSchema],
    currentUsage: {
      monthly: {
        amount: { type: Number, default: 0 },
        lastUpdated: Date,
      },
      quarterly: {
        amount: { type: Number, default: 0 },
        lastUpdated: Date,
      },
      yearly: {
        amount: { type: Number, default: 0 },
        lastUpdated: Date,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Static method to calculate current budget usage
CategorySchema.statics.calculateBudgetUsage = async function (
  categoryId,
  startDate,
  endDate
) {
  const Expense = mongoose.model("Expense");

  const result = await Expense.aggregate([
    {
      $match: {
        category: new mongoose.Types.ObjectId(categoryId),
        journeyDate: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$totalCost" },
      },
    },
  ]);

  return result.length > 0 ? result[0].totalAmount : 0;
};

const Category = mongoose.model("Category", CategorySchema);

export default Category;
