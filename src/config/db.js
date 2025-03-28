import mongoose from "mongoose";
import User from "../models/User.js";
import Category from "../models/Category.js";
import Setting from "../models/Setting.js";
import { dbLogger } from "../utils/logger.js";

/**
 * Enhanced MongoDB connection with:
 * - Robust error handling and automatic reconnection
 * - Optimized performance settings
 * - Comprehensive logging with Winston
 */
const connectDB = async () => {
  // Connection options for optimized performance and security
  const options = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    family: 4, // Use IPv4, skip trying IPv6
    maxPoolSize: 10, // Maintain up to 10 socket connections
    minPoolSize: 3, // Maintain at least 3 socket connections
    connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
    heartbeatFrequencyMS: 30000, // Check server health more frequently (default is 10000)
    autoIndex: process.env.NODE_ENV !== "production", // Auto-index in development, disable in production
  };

  // Set up listeners for connection events with Winston logging
  mongoose.connection.on("connecting", () => {
    dbLogger.info("Connecting to database...");
  });

  mongoose.connection.on("connected", () => {
    dbLogger.info({
      message: "Connected to database",
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      database: mongoose.connection.db?.databaseName,
      readyState: mongoose.connection.readyState,
    });
  });

  mongoose.connection.on("disconnected", () => {
    dbLogger.warn("Disconnected from database");
  });

  mongoose.connection.on("error", (err) => {
    dbLogger.error({
      message: "Connection error",
      error: err.message,
      name: err.name,
      stack: err.stack,
    });

    if (err.name === "MongoServerSelectionError") {
      dbLogger.error(
        "Unable to connect to the server. Please check your connection string and network connectivity."
      );
    }
  });

  // Handle process termination
  process.on("SIGINT", async () => {
    await mongoose.connection.close();
    dbLogger.info("Connection closed due to application termination");
    process.exit(0);
  });

  // Connect to MongoDB with retries
  const maxRetries = 3;
  let retryCount = 0;
  let connectionSuccessful = false;

  while (!connectionSuccessful && retryCount < maxRetries) {
    try {
      dbLogger.info(`Connection attempt ${retryCount + 1} of ${maxRetries}`);

      const connStart = Date.now();
      await mongoose.connect(process.env.MONGO_URI, options);
      const connTime = Date.now() - connStart;

      connectionSuccessful = true;
      dbLogger.info({
        message: "Successfully connected to database",
        connectionTimeMs: connTime,
        mongoVersion: mongoose.version,
      });

      // Initialize default data
      await initializeData();
    } catch (error) {
      retryCount++;
      dbLogger.error({
        message: `Connection attempt ${retryCount} failed`,
        error: error.message,
        name: error.name,
        stack: error.stack,
      });

      if (retryCount >= maxRetries) {
        dbLogger.error({
          message: "All connection attempts failed",
          totalAttempts: maxRetries,
        });
        process.exit(1);
      }

      // Wait before retrying (exponential backoff)
      const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      dbLogger.info(`Retrying in ${retryDelay / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
};

// Initialize default data if not exists
const initializeData = async () => {
  try {
    dbLogger.info("Initializing default data...");

    // Check if admin user exists, if not create one
    const adminExists = await User.findOne({ role: "admin" });
    if (!adminExists) {
      await User.create({
        name: "Admin User",
        email: "admin@example.com",
        password: "admin123",
        role: "admin",
      });
      dbLogger.info("Admin user created");
    }

    // Create default categories if they don't exist
    const categories = [
      { name: "Fuel", description: "Expenses related to fuel for the vehicle" },
      { name: "Tolls", description: "Expenses related to road tolls" },
      { name: "Maintenance", description: "Vehicle maintenance expenses" },
    ];

    for (const category of categories) {
      const exists = await Category.findOne({ name: category.name });
      if (!exists) {
        await Category.create(category);
        dbLogger.info(`Category '${category.name}' created`);
      }
    }

    // Create default settings if they don't exist
    const settings = [
      {
        key: "defaultCostPerKm",
        value: 0.3,
        description: "Default cost per kilometer in currency units",
      },
      {
        key: "maxDailyDistance",
        value: 500,
        description: "Maximum daily distance allowed in kilometers",
      },
    ];

    for (const setting of settings) {
      const exists = await Setting.findOne({ key: setting.key });
      if (!exists) {
        await Setting.create(setting);
        dbLogger.info(`Setting '${setting.key}' created`);
      }
    }

    dbLogger.info("Default data initialization complete");
  } catch (error) {
    dbLogger.error({
      message: "Error initializing default data",
      error: error.message,
      stack: error.stack,
    });
    // Don't crash the server on initialization errors
  }
};

export default connectDB;
