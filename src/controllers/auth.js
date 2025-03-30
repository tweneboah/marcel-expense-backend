import asyncHandler from "express-async-handler";
import User from "../models/User.js";
import ErrorResponse from "../utils/errorResponse.js";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../utils/emailService.js";

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    role,
  });

  // Send success response without token
  res.status(201).json({
    success: true,
    message: "Registration successful. Please login to continue.",
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate email & password
  if (!email || !password) {
    throw new ErrorResponse("Please provide an email and password", 400);
  }

  // Check for user
  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    throw new ErrorResponse("Invalid credentials", 401);
  }

  // Check if user is active
  if (user.status === "inactive") {
    throw new ErrorResponse(
      "Your account has been deactivated. Please contact an administrator.",
      401
    );
  }

  // Check if password matches
  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    throw new ErrorResponse("Invalid credentials", 401);
  }

  sendTokenResponse(user, 200, res);
});

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Log user out / clear cookie
// @route   GET /api/v1/auth/logout
// @access  Private
export const logout = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: "User logged out successfully",
  });
});

// @desc    Forgot password
// @route   POST /api/v1/auth/forgotpassword
// @access  Public
export const forgotPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return next(new ErrorResponse("There is no user with that email", 404));
  }

  // Get reset token
  const resetToken = crypto.randomBytes(20).toString("hex");

  // Hash token and set to resetPasswordToken field
  user.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Set expire time (10 minutes)
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  await user.save({ validateBeforeSave: false });

  // Create reset url - use frontend URL instead of backend
  const resetUrl = `${
    process.env.FRONTEND_URL || "http://localhost:5173"
  }/reset-password/${resetToken}`;

  try {
    await sendPasswordResetEmail(user.email, resetUrl);

    res.status(200).json({
      success: true,
      message: "Email sent",
    });
  } catch (err) {
    console.error("Email error:", err);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save({ validateBeforeSave: false });

    return next(new ErrorResponse("Email could not be sent", 500));
  }
});

// @desc    Reset password
// @route   PUT /api/v1/auth/resetpassword/:resettoken
// @access  Public
export const resetPassword = asyncHandler(async (req, res, next) => {
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(req.params.resettoken)
    .digest("hex");

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    return next(new ErrorResponse("Invalid or expired token", 400));
  }

  // Set new password
  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;

  await user.save();

  res.status(200).json({
    success: true,
    message: "Password reset successful. Please login with your new password.",
  });
});

// @desc    Update user profile
// @route   PUT /api/v1/auth/updateprofile
// @access  Private
export const updateProfile = asyncHandler(async (req, res, next) => {
  // Fields to update
  const fieldsToUpdate = {
    name: req.body.name,
    email: req.body.email,
  };

  const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: user,
  });
});

// @desc    Update password
// @route   PUT /api/v1/auth/updatepassword
// @access  Private
export const updatePassword = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).select("+password");

  // Check current password
  if (!(await user.matchPassword(req.body.currentPassword))) {
    return next(new ErrorResponse("Password is incorrect", 401));
  }

  user.password = req.body.newPassword;
  await user.save();

  sendTokenResponse(user, 200, res);
});

// Get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
  // Create token
  const token = user.getSignedJwtToken();

  const options = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };

  if (process.env.NODE_ENV === "production") {
    options.secure = true;
  }

  res.status(statusCode).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
};
