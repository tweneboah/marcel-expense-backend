import express from "express";
import { protect } from "../middleware/auth.js";
import {
  getPlaceSuggestions,
  getPlaceDetails as getPlaceDetailsHandler,
  calculateRoute,
  calculateOptimizedRoute,
  getRouteSnapshot,
  storeRouteSnapshot,
} from "../controllers/maps.js";

const router = express.Router();

// All routes need authentication
router.use(protect);

// Places and basic routing
router.get("/places/autocomplete", getPlaceSuggestions);
router.get("/places/details/:placeId", getPlaceDetailsHandler);
router.post("/distance", calculateRoute);

// Advanced routing
router.post("/route/optimize", calculateOptimizedRoute);

// Route snapshots
router.get("/route/snapshot/:expenseId", getRouteSnapshot);
router.post("/route/snapshot/:expenseId", storeRouteSnapshot);

export default router;
