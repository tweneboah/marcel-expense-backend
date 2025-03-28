import express from "express";
import { protect } from "../middleware/auth.js";
import {
  getBudgets,
  getBudget,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetSummary,
} from "../controllers/budgets.js";

const router = express.Router();

// All routes need authentication
router.use(protect);

// Budget summary route
router.get("/summary", getBudgetSummary);

// Standard RESTful routes
router.route("/").get(getBudgets).post(createBudget);

router.route("/:id").get(getBudget).put(updateBudget).delete(deleteBudget);

export default router;
