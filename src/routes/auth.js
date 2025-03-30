import express from "express";
import {
  register,
  login,
  getMe,
  logout,
  forgotPassword,
  resetPassword,
  updatePassword,
  updateProfile,
} from "../controllers/auth.js";
import { protect } from "../middleware/auth.js";
import validate from "../middleware/validate.js";
import {
  registerValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  updatePasswordValidation,
  updateProfileValidation,
} from "../validations/auth.js";

const router = express.Router();

router.post("/register", validate(registerValidation), register);
router.post("/login", validate(loginValidation), login);
router.get("/me", protect, getMe);
router.get("/logout", protect, logout);
router.post(
  "/forgotpassword",
  validate(forgotPasswordValidation),
  forgotPassword
);
router.put(
  "/resetpassword/:resettoken",
  validate(resetPasswordValidation),
  resetPassword
);
router.put(
  "/updatepassword",
  protect,
  validate(updatePasswordValidation),
  updatePassword
);
router.put(
  "/updateprofile",
  protect,
  validate(updateProfileValidation),
  updateProfile
);

export default router;
