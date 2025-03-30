import express from "express";
import {
  getSettings,
  getSetting,
  createSetting,
  updateSetting,
  deleteSetting,
  getSettingByKey,
  getDefaultSetting,
} from "../controllers/settings.js";

import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

// All routes require authentication
router.use(protect);

// Special routes
router.get("/key/:key", getSettingByKey);
router.get("/default/:keyType", getDefaultSetting);

// Public routes (all authenticated users can view)
router.get("/", getSettings);
router.get("/:id", getSetting);

// Admin only routes
router.post("/", authorize("admin"), createSetting);
router.put("/:id", authorize("admin"), updateSetting);
router.delete("/:id", authorize("admin"), deleteSetting);

export default router;
