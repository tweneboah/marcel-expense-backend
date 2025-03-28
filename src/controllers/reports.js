import Report from "../models/Report.js";
import User from "../models/User.js";
import Expense from "../models/Expense.js";
import QuarterlyReport from "../models/QuarterlyReport.js";
import asyncHandler from "express-async-handler";
import ErrorResponse from "../utils/errorResponse.js";
import {
  generatePDFReport,
  generateCSVReport,
} from "../utils/reportGenerator.js";
import { getMonthName, getQuarterName } from "../utils/formatters.js";
import fs from "fs";
import path from "path";

// @desc    Get all reports
// @route   GET /api/v1/reports
// @access  Private
export const getReports = asyncHandler(async (req, res, next) => {
  let query;

  // Copy req.query
  const reqQuery = { ...req.query };

  // Fields to exclude
  const removeFields = ["select", "sort", "page", "limit"];

  // Loop over removeFields and delete them from reqQuery
  removeFields.forEach((param) => delete reqQuery[param]);

  // Create query string
  let queryStr = JSON.stringify(reqQuery);

  // Create operators ($gt, $gte, etc)
  queryStr = queryStr.replace(
    /\b(gt|gte|lt|lte|in)\b/g,
    (match) => `$${match}`
  );

  // If user is not admin, only show their reports
  if (req.user.role !== "admin") {
    query = Report.find({
      user: req.user.id,
      ...JSON.parse(queryStr),
    });
  } else {
    query = Report.find(JSON.parse(queryStr));
  }

  // Select Fields
  if (req.query.select) {
    const fields = req.query.select.split(",").join(" ");
    query = query.select(fields);
  }

  // Sort
  if (req.query.sort) {
    const sortBy = req.query.sort.split(",").join(" ");
    query = query.sort(sortBy);
  } else {
    query = query.sort("-createdAt");
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 25;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await Report.countDocuments(JSON.parse(queryStr));

  query = query.skip(startIndex).limit(limit);

  // Executing query
  const reports = await query;

  // Pagination result
  const pagination = {};

  if (endIndex < total) {
    pagination.next = {
      page: page + 1,
      limit,
    };
  }

  if (startIndex > 0) {
    pagination.prev = {
      page: page - 1,
      limit,
    };
  }

  res.status(200).json({
    success: true,
    count: reports.length,
    pagination,
    data: reports,
  });
});

// @desc    Get single report
// @route   GET /api/v1/reports/:id
// @access  Private
export const getReport = asyncHandler(async (req, res, next) => {
  const report = await Report.findById(req.params.id);

  if (!report) {
    return next(
      new ErrorResponse(`Report not found with id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is report owner or admin
  if (report.user.toString() !== req.user.id && req.user.role !== "admin") {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to access this report`,
        401
      )
    );
  }

  res.status(200).json({
    success: true,
    data: report,
  });
});

// @desc    Create new report
// @route   POST /api/v1/reports
// @access  Private
export const createReport = asyncHandler(async (req, res, next) => {
  // Add user to req.body
  req.body.user = req.user.id;

  // Check if report exists for this month and year
  const reportExists = await Report.findOne({
    month: req.body.month,
    year: req.body.year,
    user: req.user.id,
  });

  if (reportExists) {
    return next(
      new ErrorResponse(
        `Report already exists for ${req.body.month}/${req.body.year}`,
        400
      )
    );
  }

  const report = await Report.create(req.body);

  res.status(201).json({
    success: true,
    data: report,
  });
});

// @desc    Update report
// @route   PUT /api/v1/reports/:id
// @access  Private
export const updateReport = asyncHandler(async (req, res, next) => {
  let report = await Report.findById(req.params.id);

  if (!report) {
    return next(
      new ErrorResponse(`Report not found with id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is report owner or admin
  if (report.user.toString() !== req.user.id && req.user.role !== "admin") {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to update this report`,
        401
      )
    );
  }

  report = await Report.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: report,
  });
});

// @desc    Delete report
// @route   DELETE /api/v1/reports/:id
// @access  Private
export const deleteReport = asyncHandler(async (req, res, next) => {
  const report = await Report.findById(req.params.id);

  if (!report) {
    return next(
      new ErrorResponse(`Report not found with id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is report owner or admin
  if (report.user.toString() !== req.user.id && req.user.role !== "admin") {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to delete this report`,
        401
      )
    );
  }

  await report.deleteOne();

  res.status(200).json({
    success: true,
    data: {},
  });
});

// @desc    Update report status
// @route   PUT /api/v1/reports/:id/status
// @access  Private
export const updateReportStatus = asyncHandler(async (req, res, next) => {
  let report = await Report.findById(req.params.id);

  if (!report) {
    return next(
      new ErrorResponse(`Report not found with id of ${req.params.id}`, 404)
    );
  }

  // Validate the status
  if (!req.body.status) {
    return next(new ErrorResponse("Please provide a status", 400));
  }

  // Validate status is one of the allowed values
  const allowedStatuses = ["draft", "submitted", "approved", "rejected"];
  if (!allowedStatuses.includes(req.body.status)) {
    return next(
      new ErrorResponse(
        `Status must be one of ${allowedStatuses.join(", ")}`,
        400
      )
    );
  }

  // Authorization rules based on status:
  // 1. Only the report owner can submit their own report
  // 2. Only admins can approve or reject reports
  // 3. Anyone can revert to draft (admin or owner)

  if (req.body.status === "submitted") {
    // Only the report owner can submit
    if (report.user.toString() !== req.user.id) {
      return next(
        new ErrorResponse("Only the report owner can submit this report", 403)
      );
    }

    // Report must be in draft status to be submitted
    if (report.status !== "draft") {
      return next(
        new ErrorResponse(
          `Can only submit reports that are in draft status. Current status: ${report.status}`,
          400
        )
      );
    }

    // Set submitted timestamp
    req.body.submittedAt = new Date();
  }

  if (["approved", "rejected"].includes(req.body.status)) {
    // Only admins can approve or reject
    if (req.user.role !== "admin") {
      return next(
        new ErrorResponse(
          "Only administrators can approve or reject reports",
          403
        )
      );
    }

    // Reports must be in submitted status to be approved/rejected
    if (report.status !== "submitted") {
      return next(
        new ErrorResponse(
          `Can only approve/reject reports that are in submitted status. Current status: ${report.status}`,
          400
        )
      );
    }

    // Set appropriate timestamp
    if (req.body.status === "approved") {
      req.body.approvedAt = new Date();

      // For approved reports, check if reimbursed amount is provided
      if (req.body.reimbursedAmount !== undefined) {
        // Validate reimbursed amount doesn't exceed total expense amount
        if (req.body.reimbursedAmount > report.totalExpenseAmount) {
          return next(
            new ErrorResponse(
              "Reimbursed amount cannot exceed total expense amount",
              400
            )
          );
        }

        // Calculate pending amount
        req.body.pendingAmount =
          report.totalExpenseAmount - req.body.reimbursedAmount;
      } else {
        // Default behavior: approve with full reimbursement
        req.body.reimbursedAmount = report.totalExpenseAmount;
        req.body.pendingAmount = 0;
      }
    } else {
      // For rejected reports
      req.body.rejectedAt = new Date();

      // Make sure comments are provided for rejected reports
      if (!req.body.comments) {
        return next(
          new ErrorResponse(
            "Comments are required when rejecting a report",
            400
          )
        );
      }
    }
  }

  // Update the report with the new status
  report = await Report.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: report,
  });
});

// @desc    Get report by month and year
// @route   GET /api/v1/reports/monthly/:month/:year
// @access  Private
export const getReportByMonthYear = asyncHandler(async (req, res, next) => {
  const { month, year } = req.params;

  // Validate month and year
  const monthNum = parseInt(month);
  const yearNum = parseInt(year);

  if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    return next(
      new ErrorResponse("Invalid month. Month must be between 1-12", 400)
    );
  }

  if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
    return next(
      new ErrorResponse("Invalid year. Year must be between 2000-2100", 400)
    );
  }

  const report = await Report.findOne({
    month: monthNum,
    year: yearNum,
    user: req.user.id,
  });

  if (!report) {
    return next(new ErrorResponse(`No report found for ${month}/${year}`, 404));
  }

  res.status(200).json({
    success: true,
    data: report,
  });
});

// @desc    Get yearly summary
// @route   GET /api/v1/reports/summary/:year
// @access  Private
export const getYearlySummary = asyncHandler(async (req, res, next) => {
  const { year } = req.params;

  // Validate year
  const yearNum = parseInt(year);

  if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
    return next(
      new ErrorResponse("Invalid year. Year must be between 2000-2100", 400)
    );
  }

  const reports = await Report.find({
    year: yearNum,
    user: req.user.id,
  }).sort("month");

  if (!reports || reports.length === 0) {
    return next(new ErrorResponse(`No reports found for year ${year}`, 404));
  }

  // Calculate yearly totals
  const yearlySummary = {
    year: yearNum,
    totalAmount: 0,
    reimbursedAmount: 0,
    pendingAmount: 0,
    monthlyReports: reports.map((report) => {
      // Add to yearly totals
      yearlySummary.totalAmount += report.totalAmount || 0;
      yearlySummary.reimbursedAmount += report.reimbursedAmount || 0;
      yearlySummary.pendingAmount += report.pendingAmount || 0;

      return {
        id: report._id,
        month: report.month,
        totalAmount: report.totalAmount,
        reimbursedAmount: report.reimbursedAmount,
        pendingAmount: report.pendingAmount,
        status: report.status,
      };
    }),
  };

  res.status(200).json({
    success: true,
    data: yearlySummary,
  });
});

// @desc    Update report reimbursement
// @route   PUT /api/v1/reports/:id/reimburse
// @access  Private/Admin
export const updateReportReimbursement = asyncHandler(
  async (req, res, next) => {
    let report = await Report.findById(req.params.id);

    if (!report) {
      return next(
        new ErrorResponse(`Report not found with id of ${req.params.id}`, 404)
      );
    }

    // Only admin can update reimbursement amounts
    if (req.user.role !== "admin") {
      return next(
        new ErrorResponse(
          "Only administrators can update reimbursement amounts",
          403
        )
      );
    }

    // Report must be approved to update reimbursement
    if (report.status !== "approved") {
      return next(
        new ErrorResponse(
          `Can only update reimbursement for approved reports. Current status: ${report.status}`,
          400
        )
      );
    }

    // Validate reimbursed amount is provided
    if (req.body.reimbursedAmount === undefined) {
      return next(new ErrorResponse("Reimbursed amount is required", 400));
    }

    // Parse reimbursed amount
    const reimbursedAmount = parseFloat(req.body.reimbursedAmount);

    // Validate reimbursed amount is a valid number
    if (isNaN(reimbursedAmount) || reimbursedAmount < 0) {
      return next(
        new ErrorResponse("Reimbursed amount must be a positive number", 400)
      );
    }

    // Validate reimbursed amount doesn't exceed total expense amount
    if (reimbursedAmount > report.totalExpenseAmount) {
      return next(
        new ErrorResponse(
          "Reimbursed amount cannot exceed total expense amount",
          400
        )
      );
    }

    // Calculate pending amount
    const pendingAmount = report.totalExpenseAmount - reimbursedAmount;

    // Update the report
    report = await Report.findByIdAndUpdate(
      req.params.id,
      {
        reimbursedAmount,
        pendingAmount,
        comments:
          req.body.comments ||
          `Reimbursement updated to ${reimbursedAmount} on ${
            new Date().toISOString().split("T")[0]
          }`,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    res.status(200).json({
      success: true,
      data: report,
    });
  }
);

// @desc    Export report as PDF
// @route   GET /api/v1/reports/:id/export/pdf
// @access  Private
export const exportReportAsPDF = asyncHandler(async (req, res, next) => {
  const report = await Report.findById(req.params.id).populate({
    path: "expenses",
    populate: {
      path: "category",
      select: "name color",
    },
  });

  if (!report) {
    return next(
      new ErrorResponse(`Report not found with id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is report owner or admin
  if (report.user.toString() !== req.user.id && req.user.role !== "admin") {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to access this report`,
        401
      )
    );
  }

  try {
    // Get user details
    const user = await User.findById(report.user);

    // Prepare report data
    const reportData = {
      reportData: report,
      expenses: report.expenses,
      period: {
        month: report.month,
        year: report.year,
        monthName: getMonthName(report.month),
      },
    };

    // Generate PDF
    const pdfPath = await generatePDFReport(reportData, user);

    // Set response headers for PDF download
    const filename = path.basename(pdfPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

    // Stream the file to response
    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);

    // Delete the file after sending
    fileStream.on("end", () => {
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    return next(
      new ErrorResponse(`Error generating PDF report: ${error.message}`, 500)
    );
  }
});

// @desc    Export report as CSV
// @route   GET /api/v1/reports/:id/export/csv
// @access  Private
export const exportReportAsCSV = asyncHandler(async (req, res, next) => {
  const report = await Report.findById(req.params.id).populate({
    path: "expenses",
    populate: {
      path: "category",
      select: "name color",
    },
  });

  if (!report) {
    return next(
      new ErrorResponse(`Report not found with id of ${req.params.id}`, 404)
    );
  }

  // Make sure user is report owner or admin
  if (report.user.toString() !== req.user.id && req.user.role !== "admin") {
    return next(
      new ErrorResponse(
        `User ${req.user.id} is not authorized to access this report`,
        401
      )
    );
  }

  try {
    // Get user details
    const user = await User.findById(report.user);

    // Prepare report data
    const reportData = {
      reportData: report,
      expenses: report.expenses,
      period: {
        month: report.month,
        year: report.year,
        monthName: getMonthName(report.month),
      },
    };

    // Generate CSV
    const csvPath = await generateCSVReport(reportData, user);

    // Set response headers for CSV download
    const filename = path.basename(csvPath);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

    // Stream the file to response
    const fileStream = fs.createReadStream(csvPath);
    fileStream.pipe(res);

    // Delete the file after sending
    fileStream.on("end", () => {
      fs.unlinkSync(csvPath);
    });
  } catch (error) {
    return next(
      new ErrorResponse(`Error generating CSV report: ${error.message}`, 500)
    );
  }
});

// @desc    Create quarterly report from monthly reports
// @route   POST /api/v1/reports/quarterly
// @access  Private
export const createQuarterlyReport = asyncHandler(async (req, res, next) => {
  const { year, quarter } = req.body;

  if (!year || !quarter) {
    return next(new ErrorResponse("Year and quarter are required", 400));
  }

  // Validate quarter
  if (quarter < 1 || quarter > 4) {
    return next(new ErrorResponse("Quarter must be between 1 and 4", 400));
  }

  // Calculate months in the quarter
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;

  // Find all monthly reports for the user in this quarter
  const monthlyReports = await Report.find({
    user: req.user.id,
    year: parseInt(year),
    month: { $gte: startMonth, $lte: endMonth },
  }).populate("expenses");

  if (monthlyReports.length === 0) {
    return next(
      new ErrorResponse(`No monthly reports found for Q${quarter} ${year}`, 404)
    );
  }

  // Aggregate report data
  let totalDistance = 0;
  let totalExpenseAmount = 0;
  let reimbursedAmount = 0;
  let pendingAmount = 0;
  let allExpenses = [];

  monthlyReports.forEach((report) => {
    totalDistance += report.totalDistance || 0;
    totalExpenseAmount += report.totalExpenseAmount || 0;
    reimbursedAmount += report.reimbursedAmount || 0;
    pendingAmount += report.pendingAmount || 0;

    if (report.expenses && report.expenses.length > 0) {
      allExpenses = [...allExpenses, ...report.expenses.map((exp) => exp._id)];
    }
  });

  try {
    // Create or update quarterly report
    const reportData = {
      user: req.user.id,
      year: parseInt(year),
      quarter: parseInt(quarter),
      totalDistance,
      totalExpenseAmount,
      reimbursedAmount,
      pendingAmount,
      status: "draft",
      expenses: allExpenses,
      isQuarterly: true,
    };

    const quarterlyReport = await QuarterlyReport.create(reportData);

    res.status(201).json({
      success: true,
      data: quarterlyReport,
    });
  } catch (error) {
    return next(
      new ErrorResponse(
        `Error creating quarterly report: ${error.message}`,
        500
      )
    );
  }
});

// @desc    Export expenses as PDF for a date range
// @route   GET /api/v1/reports/export/range/pdf
// @access  Private
export const exportExpenseRangeAsPDF = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return next(new ErrorResponse("Start date and end date are required", 400));
  }

  // Parse dates
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Add one day to end date to include the full day
  end.setDate(end.getDate() + 1);

  // Find expenses in date range
  const expenses = await Expense.find({
    user: req.user.id,
    journeyDate: { $gte: start, $lt: end },
  }).populate("category", "name color");

  if (expenses.length === 0) {
    return next(
      new ErrorResponse(`No expenses found for the specified date range`, 404)
    );
  }

  try {
    // Calculate totals
    const totalDistance = expenses.reduce((sum, exp) => sum + exp.distance, 0);
    const totalCost = expenses.reduce((sum, exp) => sum + exp.totalCost, 0);

    // Prepare custom report data
    const reportData = {
      reportData: {
        status: "custom",
        totalDistance,
        totalExpenseAmount: totalCost,
        pendingAmount: totalCost,
      },
      expenses,
      period: {
        month: start.getMonth() + 1,
        year: start.getFullYear(),
        monthName: `${start.toLocaleDateString("default", {
          month: "short",
          day: "numeric",
        })} - ${end.toLocaleDateString("default", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`,
      },
    };

    // Generate PDF
    const pdfPath = await generatePDFReport(reportData, req.user);

    // Set response headers for PDF download
    const filename = path.basename(pdfPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

    // Stream the file to response
    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);

    // Delete the file after sending
    fileStream.on("end", () => {
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    return next(
      new ErrorResponse(`Error generating PDF report: ${error.message}`, 500)
    );
  }
});

// @desc    Export expenses as CSV for a date range
// @route   GET /api/v1/reports/export/range/csv
// @access  Private
export const exportExpenseRangeAsCSV = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return next(new ErrorResponse("Start date and end date are required", 400));
  }

  // Parse dates
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Add one day to end date to include the full day
  end.setDate(end.getDate() + 1);

  // Find expenses in date range
  const expenses = await Expense.find({
    user: req.user.id,
    journeyDate: { $gte: start, $lt: end },
  }).populate("category", "name color");

  if (expenses.length === 0) {
    return next(
      new ErrorResponse(`No expenses found for the specified date range`, 404)
    );
  }

  try {
    // Prepare custom report data
    const reportData = {
      expenses,
      period: {
        month: start.getMonth() + 1,
        year: start.getFullYear(),
        monthName: `${start.toLocaleDateString("default", {
          month: "short",
          day: "numeric",
        })} - ${end.toLocaleDateString("default", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`,
      },
    };

    // Generate CSV
    const csvPath = await generateCSVReport(reportData, req.user);

    // Set response headers for CSV download
    const filename = path.basename(csvPath);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

    // Stream the file to response
    const fileStream = fs.createReadStream(csvPath);
    fileStream.pipe(res);

    // Delete the file after sending
    fileStream.on("end", () => {
      fs.unlinkSync(csvPath);
    });
  } catch (error) {
    return next(
      new ErrorResponse(`Error generating CSV report: ${error.message}`, 500)
    );
  }
});
