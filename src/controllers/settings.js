import Setting from "../models/Setting.js";
import asyncHandler from "express-async-handler";
import ErrorResponse from "../utils/errorResponse.js";

// @desc    Get all settings
// @route   GET /api/v1/settings
// @access  Private/Admin
export const getSettings = asyncHandler(async (req, res, next) => {
  const settings = await Setting.find();

  res.status(200).json({
    success: true,
    count: settings.length,
    data: settings,
  });
});

// @desc    Get single setting
// @route   GET /api/v1/settings/:id
// @access  Private/Admin
export const getSetting = asyncHandler(async (req, res, next) => {
  const setting = await Setting.findById(req.params.id);

  if (!setting) {
    return next(
      new ErrorResponse(`Setting not found with id of ${req.params.id}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    data: setting,
  });
});

// @desc    Create new setting
// @route   POST /api/v1/settings
// @access  Private/Admin
export const createSetting = asyncHandler(async (req, res, next) => {
  // Check if setting with this key already exists
  const existingSetting = await Setting.findOne({ key: req.body.key });

  if (existingSetting) {
    return next(
      new ErrorResponse(`Setting with key ${req.body.key} already exists`, 400)
    );
  }

  const setting = await Setting.create(req.body);

  res.status(201).json({
    success: true,
    data: setting,
  });
});

// @desc    Update setting
// @route   PUT /api/v1/settings/:id
// @access  Private/Admin
export const updateSetting = asyncHandler(async (req, res, next) => {
  let setting = await Setting.findById(req.params.id);

  if (!setting) {
    return next(
      new ErrorResponse(`Setting not found with id of ${req.params.id}`, 404)
    );
  }

  setting = await Setting.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: setting,
  });
});

// @desc    Delete setting
// @route   DELETE /api/v1/settings/:id
// @access  Private/Admin
export const deleteSetting = asyncHandler(async (req, res, next) => {
  const setting = await Setting.findById(req.params.id);

  if (!setting) {
    return next(
      new ErrorResponse(`Setting not found with id of ${req.params.id}`, 404)
    );
  }

  await setting.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Get setting by key
// @route   GET /api/v1/settings/key/:key
// @access  Private
export const getSettingByKey = asyncHandler(async (req, res, next) => {
  const setting = await Setting.findOne({ key: req.params.key });

  if (!setting) {
    return next(
      new ErrorResponse(`Setting not found with key of ${req.params.key}`, 404)
    );
  }

  res.status(200).json({
    success: true,
    data: setting,
  });
});
