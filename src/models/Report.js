import mongoose from "mongoose";

const ReportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
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
  },
  {
    timestamps: true,
  }
);

// Make compound index for user, month and year to ensure uniqueness
ReportSchema.index({ user: 1, month: 1, year: 1 }, { unique: true });

const Report = mongoose.model("Report", ReportSchema);

export default Report;
