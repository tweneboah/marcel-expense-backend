import express from "express";
import { protect } from "../middleware/auth.js";
import {
  getYearToDateReport,
  getChartData,
  generateForecast,
  getBudgetComparison,
  getExpensesWithFilters,
} from "../controllers/advancedReporting.js";

const router = express.Router();

// All routes need authentication
router.use(protect);

// Year-to-date reports
router.get("/ytd", getYearToDateReport);

// Chart data endpoints
router.get("/chart-data", getChartData);

// Forecast endpoints
router.get("/forecast", generateForecast);

// Budget comparison
router.get("/budget-comparison", getBudgetComparison);

// Advanced filtering
router.get("/expenses", getExpensesWithFilters);

export default router;
