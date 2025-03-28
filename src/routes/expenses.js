import express from "express";
import {
  getExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  previewEnhancedNotes,
  getExpensesWithRoutes,
} from "../controllers/expense.controller.js";

import { protect } from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import {
  createExpenseValidation,
  updateExpenseValidation,
} from "../validations/expense.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// Route for previewing enhanced notes
router.post("/enhance-notes", previewEnhancedNotes);

// Route for getting expenses with route data for visualization
router.get("/routes", getExpensesWithRoutes);

router
  .route("/")
  .get(getExpenses)
  .post(validate(createExpenseValidation), createExpense);

router
  .route("/:id")
  .get(getExpenseById)
  .put(validate(updateExpenseValidation), updateExpense)
  .delete(deleteExpense);

export default router;
