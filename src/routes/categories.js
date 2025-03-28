import express from "express";
import {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  addBudgetLimit,
  updateBudgetLimit,
  deleteBudgetLimit,
  getBudgetUsage,
  updateBudgetUsage,
  getCategorySummary,
} from "../controllers/categories.js";

import { protect, authorize, protectInternalAPI } from "../middleware/auth.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// Category summary route
router.get("/summary", getCategorySummary);

// Public routes (accessible by all logged in users)
router.get("/", getCategories);
router.get("/:id", getCategory);
router.get("/:id/budget/usage", getBudgetUsage);

// Admin only routes
router.post("/", authorize("admin"), createCategory);
router.put("/:id", authorize("admin"), updateCategory);
router.delete("/:id", authorize("admin"), deleteCategory);

// Budget management routes (admin only)
router.post("/:id/budget", authorize("admin"), addBudgetLimit);
router.put("/:id/budget/:budgetId", authorize("admin"), updateBudgetLimit);
router.delete("/:id/budget/:budgetId", authorize("admin"), deleteBudgetLimit);

// Internal service routes (protected by API token)
// Allow either admin user or internal API to access
router.post("/:id/budget/update-usage", (req, res, next) => {
  // First check for internal API token
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    const token = req.headers.authorization.split(" ")[1];
    if (token === process.env.API_INTERNAL_TOKEN) {
      req.isInternalRequest = true;
      return updateBudgetUsage(req, res, next);
    }
  }

  // If not internal request, check for admin authorization
  return authorize("admin")(req, res, (err) => {
    if (err) return next(err);
    updateBudgetUsage(req, res, next);
  });
});

export default router;
