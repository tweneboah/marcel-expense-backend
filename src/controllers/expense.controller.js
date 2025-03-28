// Import any required modules
import asyncHandler from "express-async-handler";
import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "../config/config.js";
import Expense from "../models/Expense.js";
import Category from "../models/Category.js";
import { logger } from "../utils/logger.js";
import { getExpensesWithRoutes } from "./expenses.js";

// Initialize the Gemini API client
const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

/**
 * @desc    Enhance expense notes using Gemini AI
 * @param   {String} originalNote - Original note from user
 * @param   {Object} expenseDetails - Additional context for AI
 * @returns {Object} Original and enhanced notes
 * @private
 */
async function enhanceExpenseNotes(originalNote, expenseDetails) {
  try {
    // Create a prompt for Gemini to enhance the note
    const prompt = `
      Enhance the following expense note for a business expense report.
      Make it professional, clear, and comprehensive while maintaining the original meaning.
      Include relevant business context and purpose.
      
      Original note: "${originalNote}"
      
      Additional context:
      - Expense type: ${expenseDetails.category}
      - Date: ${expenseDetails.date}
      - Amount: ${expenseDetails.totalCost} CHF
      - Route: From ${expenseDetails.startPoint} to ${expenseDetails.endPoint}
      - Distance: ${expenseDetails.distanceInKm} km
      
      Format the response as a concise professional expense note in 1-3 sentences.
      Do not include labels or prefixes like "Enhanced note:".
    `;

    // Generate enhanced note using Gemini
    const result = await model.generateContent(prompt);
    const enhancedNote = result.response.text().trim();

    return {
      originalNote,
      enhancedNote,
    };
  } catch (error) {
    logger.error(`Error enhancing note with Gemini AI: ${error.message}`, {
      originalNote,
      error: error.stack,
    });
    // If AI enhancement fails, return the original note
    return {
      originalNote,
      enhancedNote: originalNote,
    };
  }
}

/**
 * @desc    Create new expense
 * @route   POST /api/expenses
 * @access  Private
 */
export const createExpense = asyncHandler(async (req, res) => {
  try {
    const {
      startingPoint,
      destinationPoint,
      startingPointPlaceId,
      destinationPointPlaceId,
      formattedStartingAddress,
      formattedDestinationAddress,
      waypoints,
      distance,
      duration,
      durationInSeconds,
      isCalculatedDistance,
      routeSnapshot,
      costPerKm,
      journeyDate,
      notes,
      category: categoryId,
    } = req.body;

    // If costPerKm isn't provided, use the default from config
    const finalCostPerKm = costPerKm || config.defaultCostPerKm;

    // Calculate total cost
    const totalCost = distance * finalCostPerKm;

    // Get category details for context
    let categoryName = "Travel";

    try {
      if (categoryId) {
        const categoryDoc = await Category.findById(categoryId);
        if (categoryDoc) {
          categoryName = categoryDoc.name;
        }
      }
    } catch (err) {
      logger.warn(`Error fetching category: ${err.message}. Using default.`);
    }

    // Enhance notes using Gemini AI if notes exist
    let processedNotes = notes || "";
    if (notes) {
      try {
        const expenseDetails = {
          category: categoryName,
          date: new Date(journeyDate).toLocaleDateString(),
          totalCost: totalCost.toFixed(2),
          startPoint: startingPoint,
          endPoint: destinationPoint,
          distanceInKm: distance,
        };

        const enhancedNotes = await enhanceExpenseNotes(notes, expenseDetails);

        // Store both original and enhanced notes as JSON
        processedNotes = JSON.stringify({
          original: enhancedNotes.originalNote,
          enhanced: enhancedNotes.enhancedNote,
        });
      } catch (error) {
        logger.error(`Failed to enhance notes: ${error.message}`);
      }
    }

    // Create the expense with enhanced notes
    const expense = new Expense({
      user: req.user.id,
      category: categoryId,
      startingPoint,
      destinationPoint,
      startingPointPlaceId,
      destinationPointPlaceId,
      formattedStartingAddress,
      formattedDestinationAddress,
      waypoints: waypoints || [],
      distance,
      duration,
      durationInSeconds,
      isCalculatedDistance: isCalculatedDistance || false,
      routeSnapshot,
      costPerKm: finalCostPerKm,
      totalCost,
      journeyDate: journeyDate || new Date(),
      notes: processedNotes,
      createdBy: req.user.id,
      updatedBy: req.user.id,
    });

    const savedExpense = await expense.save();

    return res.status(201).json({
      success: true,
      message: "Expense created successfully",
      data: savedExpense,
    });
  } catch (error) {
    logger.error(`Error creating expense: ${error.message}`, {
      error: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Error creating expense",
      error: error.message,
    });
  }
});

/**
 * @desc    Get all expenses (admins see all, sales reps see only theirs)
 * @route   GET /api/expenses
 * @access  Private
 */
export const getExpenses = asyncHandler(async (req, res) => {
  const {
    startDate,
    endDate,
    status,
    category,
    sortBy,
    order,
    page = 1,
    limit = 10,
    userId,
  } = req.query;

  // Base query options - admins can see all, sales reps see only their own
  let queryOptions = {};

  // If user is not admin, they can only see their own expenses
  if (req.user.role !== "admin") {
    queryOptions.user = req.user.id;
  } else if (userId) {
    // Admins can filter by specific user if they want
    queryOptions.user = userId;
  }

  // Add filters if provided
  if (startDate && endDate) {
    queryOptions.journeyDate = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  } else if (startDate) {
    queryOptions.journeyDate = { $gte: new Date(startDate) };
  } else if (endDate) {
    queryOptions.journeyDate = { $lte: new Date(endDate) };
  }

  if (status) queryOptions.status = status;
  if (category) queryOptions.category = category;

  // Prepare sort options
  const sortOptions = {};
  if (sortBy) {
    sortOptions[sortBy] = order === "desc" ? -1 : 1;
  } else {
    sortOptions.createdAt = -1; // Default sort by created date, newest first
  }

  // Calculate pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    // Query with pagination
    const expenses = await Expense.find(queryOptions)
      .populate("category", "name")
      .populate("user", "name email")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await Expense.countDocuments(queryOptions);

    // Process notes for display
    const processedExpenses = expenses.map((expense) => {
      const expenseObj = expense.toObject();

      // Parse notes if they're stored as JSON
      if (expenseObj.notes && expenseObj.notes.startsWith("{")) {
        try {
          const parsedNotes = JSON.parse(expenseObj.notes);
          expenseObj.notes = parsedNotes.enhanced;
          expenseObj.originalNotes = parsedNotes.original;
        } catch (e) {
          // If parse fails, keep original notes
        }
      }

      return expenseObj;
    });

    return res.status(200).json({
      success: true,
      count: expenses.length,
      total,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      data: processedExpenses,
    });
  } catch (error) {
    logger.error(`Error fetching expenses: ${error.message}`, {
      error: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Error fetching expenses",
      error: error.message,
    });
  }
});

/**
 * @desc    Get single expense by ID
 * @route   GET /api/expenses/:id
 * @access  Private
 */
export const getExpenseById = asyncHandler(async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate("category", "name description")
      .populate("user", "name email")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    // Check if user owns this expense or is admin
    if (
      expense.user._id.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this expense",
      });
    }

    // Process notes if they're stored as JSON
    const expenseObj = expense.toObject();
    if (expenseObj.notes && expenseObj.notes.startsWith("{")) {
      try {
        const parsedNotes = JSON.parse(expenseObj.notes);
        expenseObj.notes = parsedNotes.enhanced;
        expenseObj.originalNotes = parsedNotes.original;
      } catch (e) {
        // If parse fails, keep original notes
      }
    }

    return res.status(200).json({
      success: true,
      data: expenseObj,
    });
  } catch (error) {
    logger.error(`Error fetching expense: ${error.message}`, {
      error: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Error fetching expense",
      error: error.message,
    });
  }
});

/**
 * @desc    Update expense
 * @route   PUT /api/expenses/:id
 * @access  Private
 */
export const updateExpense = asyncHandler(async (req, res) => {
  try {
    let expense = await Expense.findById(req.params.id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    // Check if user owns this expense or is admin
    if (expense.user.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this expense",
      });
    }

    const {
      startingPoint,
      destinationPoint,
      startingPointPlaceId,
      destinationPointPlaceId,
      formattedStartingAddress,
      formattedDestinationAddress,
      waypoints,
      distance,
      duration,
      durationInSeconds,
      isCalculatedDistance,
      routeSnapshot,
      costPerKm,
      journeyDate,
      notes,
      category: categoryId,
      status,
    } = req.body;

    // If admin, they can update the status
    if (req.user.role === "admin" && status) {
      expense.status = status;
    }

    // Get category details for context if updating notes
    let categoryName = "Travel";
    try {
      if (categoryId) {
        const categoryDoc = await Category.findById(
          categoryId || expense.category
        );
        if (categoryDoc) {
          categoryName = categoryDoc.name;
        }
      }
    } catch (err) {
      logger.warn(`Error fetching category: ${err.message}. Using default.`);
    }

    // Enhance notes using Gemini AI if notes are being updated
    let processedNotes = expense.notes;
    if (notes !== undefined) {
      try {
        // Set up the context for AI enhancement
        const updatedDistance = distance || expense.distance;
        const updatedCostPerKm = costPerKm || expense.costPerKm;
        const updatedTotalCost = updatedDistance * updatedCostPerKm;

        const expenseDetails = {
          category: categoryName,
          date: new Date(
            journeyDate || expense.journeyDate
          ).toLocaleDateString(),
          totalCost: updatedTotalCost.toFixed(2),
          startPoint: startingPoint || expense.startingPoint,
          endPoint: destinationPoint || expense.destinationPoint,
          distanceInKm: updatedDistance,
        };

        const enhancedNotes = await enhanceExpenseNotes(notes, expenseDetails);

        // Store both original and enhanced notes as JSON
        processedNotes = JSON.stringify({
          original: enhancedNotes.originalNote,
          enhanced: enhancedNotes.enhancedNote,
        });
      } catch (error) {
        logger.error(`Failed to enhance notes during update: ${error.message}`);
        processedNotes = notes; // Fallback to original notes
      }
    }

    // Update the expense
    if (startingPoint) expense.startingPoint = startingPoint;
    if (destinationPoint) expense.destinationPoint = destinationPoint;
    if (startingPointPlaceId)
      expense.startingPointPlaceId = startingPointPlaceId;
    if (destinationPointPlaceId)
      expense.destinationPointPlaceId = destinationPointPlaceId;
    if (formattedStartingAddress)
      expense.formattedStartingAddress = formattedStartingAddress;
    if (formattedDestinationAddress)
      expense.formattedDestinationAddress = formattedDestinationAddress;
    if (waypoints) expense.waypoints = waypoints;
    if (distance) expense.distance = distance;
    if (duration) expense.duration = duration;
    if (durationInSeconds) expense.durationInSeconds = durationInSeconds;
    if (isCalculatedDistance !== undefined)
      expense.isCalculatedDistance = isCalculatedDistance;
    if (routeSnapshot) expense.routeSnapshot = routeSnapshot;
    if (costPerKm) expense.costPerKm = costPerKm;
    if (journeyDate) expense.journeyDate = journeyDate;
    if (notes !== undefined) expense.notes = processedNotes;
    if (categoryId) expense.category = categoryId;

    // Recalculate total cost if distance or costPerKm changed
    if (distance || costPerKm) {
      expense.totalCost =
        (distance || expense.distance) * (costPerKm || expense.costPerKm);
    }

    // Set updatedBy to current user
    expense.updatedBy = req.user.id;

    const updatedExpense = await expense.save();

    // Process notes for response
    const expenseObj = updatedExpense.toObject();
    if (expenseObj.notes && expenseObj.notes.startsWith("{")) {
      try {
        const parsedNotes = JSON.parse(expenseObj.notes);
        expenseObj.notes = parsedNotes.enhanced;
        expenseObj.originalNotes = parsedNotes.original;
      } catch (e) {
        // If parse fails, keep original notes
      }
    }

    return res.status(200).json({
      success: true,
      message: "Expense updated successfully",
      data: expenseObj,
    });
  } catch (error) {
    logger.error(`Error updating expense: ${error.message}`, {
      error: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Error updating expense",
      error: error.message,
    });
  }
});

/**
 * @desc    Delete expense
 * @route   DELETE /api/expenses/:id
 * @access  Private
 */
export const deleteExpense = asyncHandler(async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    // Check if user owns this expense or is admin
    if (expense.user.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this expense",
      });
    }

    await expense.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Expense deleted successfully",
      data: {},
    });
  } catch (error) {
    logger.error(`Error deleting expense: ${error.message}`, {
      error: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Error deleting expense",
      error: error.message,
    });
  }
});

/**
 * @desc    Preview enhanced expense notes using Gemini AI
 * @route   POST /api/expenses/enhance-notes
 * @access  Private
 */
export const previewEnhancedNotes = asyncHandler(async (req, res) => {
  try {
    const {
      notes,
      startingPoint,
      destinationPoint,
      distance,
      totalCost,
      journeyDate,
      categoryId,
    } = req.body;

    if (!notes) {
      return res.status(400).json({
        success: false,
        message: "Notes are required to generate enhancement",
      });
    }

    // Get category details for context
    let categoryName = "Travel";
    try {
      if (categoryId) {
        const categoryDoc = await Category.findById(categoryId);
        if (categoryDoc) {
          categoryName = categoryDoc.name;
        }
      }
    } catch (err) {
      logger.warn(`Error fetching category: ${err.message}. Using default.`);
    }

    // Prepare context for AI enhancement
    const expenseDetails = {
      category: categoryName,
      date: journeyDate
        ? new Date(journeyDate).toLocaleDateString()
        : new Date().toLocaleDateString(),
      totalCost: totalCost ? totalCost.toFixed(2) : "0.00",
      startPoint: startingPoint || "Starting location",
      endPoint: destinationPoint || "Destination",
      distanceInKm: distance || 0,
    };

    // Generate enhanced notes
    const enhancedNotes = await enhanceExpenseNotes(notes, expenseDetails);

    return res.status(200).json({
      success: true,
      data: {
        original: enhancedNotes.originalNote,
        enhanced: enhancedNotes.enhancedNote,
      },
    });
  } catch (error) {
    logger.error(`Error enhancing notes: ${error.message}`, {
      error: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: "Error enhancing notes",
      error: error.message,
    });
  }
});

// Export the getExpensesWithRoutes function
export { getExpensesWithRoutes };
