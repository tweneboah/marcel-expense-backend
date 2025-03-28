import mongoose from "mongoose";

const BudgetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    year: {
      type: Number,
      required: [true, "Please add a year"],
      min: [2000, "Year must be 2000 or later"],
      max: [2100, "Year must be 2100 or earlier"],
    },
    month: {
      type: Number,
      default: 0, // 0 for annual, 1-12 for specific months
      min: [0, "Month must be between 0 and 12"],
      max: [12, "Month must be between 0 and 12"],
    },
    amount: {
      type: Number,
      required: [true, "Please add a budget amount"],
      min: [0, "Budget amount must be positive"],
    },
    maxDistance: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // For department/group level budgets
    isGlobal: {
      type: Boolean,
      default: false,
    },
    // Budget alert thresholds (percentage of budget)
    warningThreshold: {
      type: Number,
      default: 70, // Percentage (70%)
      min: [0, "Threshold must be between 0 and 100"],
      max: [100, "Threshold must be between 0 and 100"],
    },
    criticalThreshold: {
      type: Number,
      default: 90, // Percentage (90%)
      min: [0, "Threshold must be between 0 and 100"],
      max: [100, "Threshold must be between 0 and 100"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Create compound index to ensure uniqueness of budget for user, year, month, and category
BudgetSchema.index(
  { user: 1, year: 1, month: 1, category: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

// Virtual for remaining budget amount
BudgetSchema.virtual("remainingAmount").get(function () {
  return this.actualExpenses ? this.amount - this.actualExpenses : this.amount;
});

// Virtual for usage percentage
BudgetSchema.virtual("usagePercentage").get(function () {
  return this.actualExpenses
    ? Math.round((this.actualExpenses / this.amount) * 100)
    : 0;
});

const Budget = mongoose.model("Budget", BudgetSchema);

export default Budget;
