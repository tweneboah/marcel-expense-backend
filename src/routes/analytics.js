import express from "express";
import { protect } from "../middleware/auth.js";
import {
  getExpensesByTimePeriod,
  getExpensesForPeriod,
  getExpensesByCategory,
  getExpenseTrends,
  getYearlyComparison,
  getDashboardSummary,
} from "../controllers/analytics.js";

const router = express.Router();

// All routes need authentication
router.use(protect);

// Dashboard summary
router.get("/dashboard", getDashboardSummary);

// Time period summaries
router.get("/expenses/time-summary", getExpensesByTimePeriod);
router.get("/expenses/period-detail", getExpensesForPeriod);

// Category breakdown
router.get("/expenses/category-breakdown", getExpensesByCategory);

// Trends and comparisons
router.get("/expenses/trends", getExpenseTrends);
router.get("/expenses/yearly-comparison", getYearlyComparison);

export default router;
