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

  // If this setting is marked as default, find and unmark any other default setting with the same key type
  if (req.body.isDefault) {
    // Extract the key type (everything before the first dot or the whole key if no dot)
    const keyType = req.body.key.split(".")[0];

    // Find all settings that start with the same key type and are marked as default
    await Setting.updateMany(
      { key: new RegExp(`^${keyType}\\..*`), isDefault: true },
      { isDefault: false }
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

  // If this setting is being set as default, unmark any other default setting with the same key type
  if (req.body.isDefault) {
    // Extract the key type (everything before the first dot or the whole key if no dot)
    const keyType = setting.key.split(".")[0];

    // Find all settings except this one that start with the same key type and are marked as default
    await Setting.updateMany(
      {
        _id: { $ne: req.params.id },
        key: new RegExp(`^${keyType}\\..*`),
        isDefault: true,
      },
      { isDefault: false }
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

// @desc    Get default setting for a key type
// @route   GET /api/v1/settings/default/:keyType
// @access  Private
export const getDefaultSetting = asyncHandler(async (req, res, next) => {
  const keyType = req.params.keyType;

  // Find a setting with the specified key type that is marked as default
  // First look for exact keyType match
  let setting = await Setting.findOne({ key: keyType, isDefault: true });

  // If not found, look for any setting that starts with keyType and is default
  if (!setting) {
    setting = await Setting.findOne({
      key: new RegExp(`^${keyType}(\\..*)?$`),
      isDefault: true,
    });
  }

  if (!setting) {
    return next(
      new ErrorResponse(
        `No default setting found for key type: ${keyType}`,
        404
      )
    );
  }

  res.status(200).json({
    success: true,
    data: setting,
  });
});
