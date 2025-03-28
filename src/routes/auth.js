import express from "express";
import { register, login, getMe, logout } from "../controllers/auth.js";
import { protect } from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import { registerValidation, loginValidation } from "../validations/auth.js";

const router = express.Router();

router.post("/register", validate(registerValidation), register);
router.post("/login", validate(loginValidation), login);
router.get("/me", protect, getMe);
router.get("/logout", protect, logout);

export default router;
