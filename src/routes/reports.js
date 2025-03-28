import express from "express";
import {
  getReports,
  getReport,
  updateReportStatus,
  getReportByMonthYear,
  getYearlySummary,
  updateReportReimbursement,
  exportReportAsPDF,
  exportReportAsCSV,
  createQuarterlyReport,
  exportExpenseRangeAsPDF,
  exportExpenseRangeAsCSV,
} from "../controllers/reports.js";

import { protect, authorize } from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import {
  reportStatusValidation,
  reportReimbursementValidation,
  createReportValidation,
} from "../validations/report.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// Export routes
router.get("/export/range/pdf", exportExpenseRangeAsPDF);
router.get("/export/range/csv", exportExpenseRangeAsCSV);

// Special routes must be defined before param routes to prevent conflicts
router.get("/monthly/:month/:year", getReportByMonthYear);
router.get("/summary/:year", getYearlySummary);

// Quarterly report routes
router.post("/quarterly", createQuarterlyReport);

// Regular routes
router.get("/", getReports);
router.get("/:id", getReport);
router.put("/:id/status", validate(reportStatusValidation), updateReportStatus);
router.put(
  "/:id/reimburse",
  authorize("admin"),
  validate(reportReimbursementValidation),
  updateReportReimbursement
);

// Export routes for specific reports
router.get("/:id/export/pdf", exportReportAsPDF);
router.get("/:id/export/csv", exportReportAsCSV);

export default router;
