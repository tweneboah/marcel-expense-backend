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
      name: "Sales User",
      email: "sales@example.com",
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

    // Create settings
    await Setting.insertMany([
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
      {
        key: "maxMonthlyExpense",
        value: 2000,
        description: "Maximum monthly expense amount allowed",
      },
      {
        key: "companyName",
        value: "AussenDienst GmbH",
        description: "Company name for reports and receipts",
      },
      {
        key: "fiscalYearStart",
        value: "01-01",
        description: "Start date of fiscal year (MM-DD)",
      },
    ]);

    console.log("Settings created...");

    // Create expenses for sales user
    const expenses = [];

    for (let i = 0; i < 50; i++) {
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

    await Expense.insertMany(expenses);

    console.log("Expenses created...");

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
