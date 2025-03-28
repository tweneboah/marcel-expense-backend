import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import Category from "../models/Category.js";
import Expense from "../models/Expense.js";
import Report from "../models/Report.js";
import Setting from "../models/Setting.js";

// Load env vars
dotenv.config();

// Connect to DB
mongoose.connect(process.env.MONGO_URI);

// Generate random date within last 6 months
const getRandomDate = () => {
  const today = new Date();
  const sixMonthsAgo = new Date(today);
  sixMonthsAgo.setMonth(today.getMonth() - 6);

  return new Date(
    sixMonthsAgo.getTime() +
      Math.random() * (today.getTime() - sixMonthsAgo.getTime())
  );
};

// Generate date in a specific period
const getDateInPeriod = (year, month) => {
  // Month is 0-indexed in JavaScript Date
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // Last day of month

  return new Date(
    startDate.getTime() +
      Math.random() * (endDate.getTime() - startDate.getTime())
  );
};

// Generate expense for a specific period
const createExpenseForPeriod = (userId, categoryId, year, month) => {
  const distance = getRandomNumber(20, 300);
  const costPerKm = 0.3;
  const journeyDate = getDateInPeriod(year, month);

  return {
    user: userId,
    category: categoryId,
    startingPoint: `City ${year}-${month}-A`,
    destinationPoint: `City ${year}-${month}-B`,
    distance,
    costPerKm,
    totalCost: distance * costPerKm,
    journeyDate,
    notes: `Test expense for ${month}/${year}`,
    status: "approved",
  };
};

// Generate random number between min and max
const getRandomNumber = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1) + min);
};

// Import data
const importData = async () => {
  try {
    // Clear existing data
    await User.deleteMany();
    await Category.deleteMany();
    await Expense.deleteMany();
    await Report.deleteMany();
    await Setting.deleteMany();

    console.log("Data cleared...");

    // Create admin user
    const admin = await User.create({
      name: "Admin User",
      email: "admin@example.com",
      password: "admin123",
      role: "admin",
    });

    // Create sales user
    const salesUser = await User.create({
      name: "John",
      email: "john@gmail.com",
      password: "sales123",
      role: "sales_rep",
    });

    console.log("Users created...");

    // Create categories
    const categories = await Category.insertMany([
      { name: "Fuel", description: "Expenses related to fuel for the vehicle" },
      { name: "Tolls", description: "Expenses related to road tolls" },
      { name: "Maintenance", description: "Vehicle maintenance expenses" },
    ]);

    console.log("Categories created...");

    try {
      // Create settings
      await Setting.create({
        key: "defaultCostPerKm",
        value: 0.3,
        description: "Default cost per kilometer in currency units",
      });

      await Setting.create({
        key: "maxDailyDistance",
        value: 500,
        description: "Maximum daily distance allowed in kilometers",
      });

      await Setting.create({
        key: "maxMonthlyExpense",
        value: 2000,
        description: "Maximum monthly expense amount allowed",
      });

      await Setting.create({
        key: "companyName",
        value: "AussenDienst GmbH",
        description: "Company name for reports and receipts",
      });

      await Setting.create({
        key: "fiscalYearStart",
        value: "01-01",
        description: "Start date of fiscal year (MM-DD)",
      });

      console.log("Settings created...");
    } catch (err) {
      console.error("Error creating settings:", err.message);
      // Continue with the rest of the seeding even if settings fail
    }

    // Create expenses for sales user
    const expenses = [];

    // Create random expenses
    for (let i = 0; i < 20; i++) {
      const distance = getRandomNumber(20, 300);
      const costPerKm = 0.3;
      const journeyDate = getRandomDate();

      const expense = {
        user: salesUser._id,
        category: categories[Math.floor(Math.random() * categories.length)]._id,
        startingPoint: `City ${i}`,
        destinationPoint: `City ${i + 1}`,
        distance,
        costPerKm,
        totalCost: distance * costPerKm,
        journeyDate,
        notes: `Test expense ${i + 1}`,
        status: ["pending", "approved", "rejected"][
          Math.floor(Math.random() * 3)
        ],
      };

      expenses.push(expense);
    }

    // Create specific expenses for testing periods
    // Create expenses for each quarter in 2023
    for (let quarter = 1; quarter <= 4; quarter++) {
      const startMonth = (quarter - 1) * 3 + 1; // 1, 4, 7, 10

      // Create 3 expenses for each month in the quarter
      for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
        const month = startMonth + monthOffset;

        // Create 2 expenses per category for this month
        for (const category of categories) {
          expenses.push(
            createExpenseForPeriod(salesUser._id, category._id, 2023, month)
          );
          expenses.push(
            createExpenseForPeriod(salesUser._id, category._id, 2023, month)
          );
        }
      }

      console.log(`Created expenses for Q${quarter} 2023`);
    }

    // Add a few expenses for the current year
    const currentYear = new Date().getFullYear();
    for (let month = 1; month <= 3; month++) {
      for (const category of categories) {
        expenses.push(
          createExpenseForPeriod(
            salesUser._id,
            category._id,
            currentYear,
            month
          )
        );
      }
    }

    await Expense.insertMany(expenses);

    console.log(`Expenses created (${expenses.length} total)...`);

    // Create reports based on expenses
    const reports = new Map();

    for (const expense of expenses) {
      const date = new Date(expense.journeyDate);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const key = `${year}-${month}`;

      if (!reports.has(key)) {
        reports.set(key, {
          user: salesUser._id,
          month,
          year,
          totalDistance: 0,
          totalExpenseAmount: 0,
          expenses: [],
          status: ["draft", "submitted", "approved", "rejected"][
            Math.floor(Math.random() * 4)
          ],
        });
      }

      const report = reports.get(key);
      report.totalDistance += expense.distance;
      report.totalExpenseAmount += expense.totalCost;
      report.expenses.push(expense._id);
    }

    await Report.insertMany(Array.from(reports.values()));

    console.log("Reports created...");
    console.log("Data import complete!");
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

// Delete data
const deleteData = async () => {
  try {
    await User.deleteMany();
    await Category.deleteMany();
    await Expense.deleteMany();
    await Report.deleteMany();
    await Setting.deleteMany();

    console.log("Data destroyed...");
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

// Determine which action to perform based on command line arg
if (process.argv[2] === "-i") {
  importData();
} else if (process.argv[2] === "-d") {
  deleteData();
} else {
  console.log("Please use -i to import or -d to delete data");
  process.exit();
}
