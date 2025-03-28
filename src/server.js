import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import errorHandler from "./middleware/error.js";
import { logger } from "./utils/logger.js";
import morganMiddleware from "./utils/morganLogger.js";

// Import route files
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import expenseRoutes from "./routes/expenses.js";
import categoryRoutes from "./routes/categories.js";
import reportRoutes from "./routes/reports.js";
import settingRoutes from "./routes/settings.js";
import mapsRoutes from "./routes/maps.js";
import analyticsRoutes from "./routes/analytics.js";
import advancedReportingRoutes from "./routes/advancedReporting.js";
import budgetsRoutes from "./routes/budgets.js";

// Load environment variables
dotenv.config();

// Generate internal API token if not present
if (!process.env.API_INTERNAL_TOKEN) {
  const crypto = require("crypto");
  const internalToken = crypto.randomBytes(32).toString("hex");
  console.log(
    "\x1b[33m%s\x1b[0m",
    "WARNING: API_INTERNAL_TOKEN not set in environment"
  );
  console.log("\x1b[33m%s\x1b[0m", `Using generated token: ${internalToken}`);
  console.log(
    "\x1b[33m%s\x1b[0m",
    "Add this to your .env file for persistent internal API access"
  );
  process.env.API_INTERNAL_TOKEN = internalToken;
}

// Set base URL for internal API calls
if (!process.env.BASE_URL) {
  const port = process.env.PORT || 5000;
  process.env.BASE_URL = `http://localhost:${port}`;
  console.log("\x1b[33m%s\x1b[0m", "WARNING: BASE_URL not set in environment");
  console.log("\x1b[33m%s\x1b[0m", `Using default: ${process.env.BASE_URL}`);
}

// Initialize Express app
const app = express();

// Security Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production" ? undefined : false,
    crossOriginEmbedderPolicy: { policy: "credentialless" },
  })
);

// CORS Configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "*", // Allow specified origin or all if not configured
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "Access-Control-Allow-Headers",
  ],
  exposedHeaders: ["Content-Length", "X-Request-ID"],
  credentials: true,
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging with Morgan
app.use(morganMiddleware);

// Connect to MongoDB
connectDB();

// API Version
const API_VERSION = "v1";

// Define Routes with versioning
app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/users`, userRoutes);
app.use(`/api/${API_VERSION}/expenses`, expenseRoutes);
app.use(`/api/${API_VERSION}/categories`, categoryRoutes);
app.use(`/api/${API_VERSION}/reports`, reportRoutes);
app.use(`/api/${API_VERSION}/settings`, settingRoutes);
app.use(`/api/${API_VERSION}/maps`, mapsRoutes);
app.use(`/api/${API_VERSION}/analytics`, analyticsRoutes);
app.use(`/api/${API_VERSION}/advanced-reports`, advancedReportingRoutes);
app.use(`/api/${API_VERSION}/budgets`, budgetsRoutes);

// Root Route
app.get("/", (req, res) => {
  res.send(`API is running. Access endpoints at /api/${API_VERSION}/`);
});

// Handle 404 errors
app.use((req, res, next) => {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Error handling middleware
app.use(errorHandler);

// Process error handling
process.on("uncaughtException", (error) => {
  logger.error({
    message: "Uncaught Exception",
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error({
    message: "Unhandled Rejection",
    reason: reason,
    promise: promise,
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(
    `Server running in ${
      process.env.NODE_ENV || "development"
    } mode on port ${PORT}`
  );
});
