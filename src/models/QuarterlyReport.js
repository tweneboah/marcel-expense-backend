import mongoose from "mongoose";

const QuarterlyReportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    quarter: {
      type: Number,
      required: true,
      min: 1,
      max: 4,
    },
    year: {
      type: Number,
      required: true,
      min: 2000,
      max: 2100,
    },
    totalDistance: {
      type: Number,
      default: 0,
    },
    totalExpenseAmount: {
      type: Number,
      default: 0,
    },
    reimbursedAmount: {
      type: Number,
      default: 0,
    },
    pendingAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["draft", "submitted", "approved", "rejected"],
      default: "draft",
    },
    submittedAt: {
      type: Date,
    },
    approvedAt: {
      type: Date,
    },
    rejectedAt: {
      type: Date,
    },
    comments: {
      type: String,
    },
    expenses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Expense",
      },
    ],
    isQuarterly: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Make compound index for user, quarter and year to ensure uniqueness
QuarterlyReportSchema.index({ user: 1, quarter: 1, year: 1 }, { unique: true });

// Virtual for quarter name (Q1, Q2, etc.)
QuarterlyReportSchema.virtual("quarterName").get(function () {
  return `Q${this.quarter}`;
});

// Virtual for quarter period (e.g., "Jan - Mar 2023")
QuarterlyReportSchema.virtual("quarterPeriod").get(function () {
  const startMonth = (this.quarter - 1) * 3;
  const endMonth = startMonth + 2;

  const months = [
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
  ];

  return `${months[startMonth].substring(
    0,
    3
  )} - ${months[endMonth].substring(0, 3)} ${this.year}`;
});

const QuarterlyReport = mongoose.model(
  "QuarterlyReport",
  QuarterlyReportSchema
);

export default QuarterlyReport;
