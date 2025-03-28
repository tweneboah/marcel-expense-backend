import PDFDocument from "pdfkit";
import { createObjectCsvWriter } from "csv-writer";
import fs from "fs";
import fsExtra from "fs-extra";
import path from "path";
import { formatCHF } from "./formatters.js";

// Ensure reports directory exists
const REPORTS_DIR = path.join(process.cwd(), "reports");
fsExtra.ensureDirSync(REPORTS_DIR);

// Temp directory for storing reports before sending
const TEMP_DIR = path.join(REPORTS_DIR, "temp");
fsExtra.ensureDirSync(TEMP_DIR);

/**
 * Generate a PDF report for expenses
 * @param {Object} data - Report data
 * @param {Object} user - User data
 * @returns {Promise<string>} - Path to the generated PDF file
 */
export const generatePDFReport = async (data, user) => {
  const { reportData, expenses, period } = data;

  // Create a unique filename with timestamp
  const timestamp = new Date().getTime();
  const filename = `expense_report_${user._id}_${period.year}_${period.month}_${timestamp}.pdf`;
  const filePath = path.join(TEMP_DIR, filename);

  return new Promise((resolve, reject) => {
    try {
      // Create a new PDF document
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        info: {
          Title: `Expense Report - ${period.monthName} ${period.year}`,
          Author: "AussenDienst GmbH Expense System",
          Subject: "Expense Report",
        },
      });

      // Pipe the PDF to a file
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Add company logo and header
      doc.fontSize(20).text("AussenDienst GmbH", { align: "center" });
      doc.fontSize(16).text("Expense Report", { align: "center" });
      doc.moveDown();

      // Add report metadata
      doc
        .fontSize(12)
        .text(`Report Period: ${period.monthName} ${period.year}`);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`);
      doc.text(`Status: ${reportData.status.toUpperCase()}`);
      doc.moveDown();

      // Add user information
      doc.fontSize(14).text("User Information");
      doc.fontSize(12).text(`Name: ${user.name}`);
      doc.text(`Email: ${user.email}`);
      doc.moveDown();

      // Add summary information
      doc.fontSize(14).text("Summary");
      doc
        .fontSize(12)
        .text(`Total Distance: ${reportData.totalDistance.toFixed(2)} km`);
      doc.text(`Total Expenses: ${formatCHF(reportData.totalExpenseAmount)}`);

      if (reportData.status === "approved") {
        doc.text(
          `Reimbursed Amount: ${formatCHF(reportData.reimbursedAmount)}`
        );
      } else {
        doc.text(`Pending Amount: ${formatCHF(reportData.pendingAmount)}`);
      }

      if (reportData.comments) {
        doc.moveDown();
        doc.text(`Comments: ${reportData.comments}`);
      }

      doc.moveDown();

      // Add expense details
      doc.fontSize(14).text("Expense Details");

      // Create expense table headers
      const tableTop = doc.y + 10;
      const tableHeaders = ["Date", "From", "To", "Distance", "Cost", "Status"];
      const columnWidths = [80, 120, 120, 60, 80, 60];
      const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

      // Draw table headers
      let currentX = doc.x;
      doc.fontSize(10).font("Helvetica-Bold");

      tableHeaders.forEach((header, i) => {
        doc.text(header, currentX, tableTop, {
          width: columnWidths[i],
          align: "left",
        });
        currentX += columnWidths[i];
      });

      // Draw a line after headers
      doc
        .moveTo(doc.x, tableTop + 15)
        .lineTo(doc.x + tableWidth, tableTop + 15)
        .stroke();

      // Add expense rows
      let currentY = tableTop + 25;
      doc.font("Helvetica");

      expenses.forEach((expense, index) => {
        // Check if we need a new page
        if (currentY > 700) {
          doc.addPage();
          currentY = 50;

          // Redraw headers on new page
          currentX = doc.x;
          doc.fontSize(10).font("Helvetica-Bold");

          tableHeaders.forEach((header, i) => {
            doc.text(header, currentX, currentY, {
              width: columnWidths[i],
              align: "left",
            });
            currentX += columnWidths[i];
          });

          // Draw a line after headers
          doc
            .moveTo(doc.x, currentY + 15)
            .lineTo(doc.x + tableWidth, currentY + 15)
            .stroke();

          currentY += 25;
          doc.font("Helvetica");
        }

        // Format date
        const journeyDate = new Date(expense.journeyDate).toLocaleDateString();

        // Draw row
        currentX = doc.x;

        doc.text(journeyDate, currentX, currentY, {
          width: columnWidths[0],
          align: "left",
        });
        currentX += columnWidths[0];

        doc.text(expense.startingPoint, currentX, currentY, {
          width: columnWidths[1],
          align: "left",
        });
        currentX += columnWidths[1];

        doc.text(expense.destinationPoint, currentX, currentY, {
          width: columnWidths[2],
          align: "left",
        });
        currentX += columnWidths[2];

        doc.text(`${expense.distance.toFixed(2)} km`, currentX, currentY, {
          width: columnWidths[3],
          align: "left",
        });
        currentX += columnWidths[3];

        doc.text(formatCHF(expense.totalCost), currentX, currentY, {
          width: columnWidths[4],
          align: "left",
        });
        currentX += columnWidths[4];

        doc.text(expense.status, currentX, currentY, {
          width: columnWidths[5],
          align: "left",
        });

        // Add a light gray background for every other row
        if (index % 2 === 1) {
          doc.rect(doc.x, currentY - 5, tableWidth, 20).fill("#f6f6f6");
        }

        currentY += 20;
      });

      // Add footer
      doc.fontSize(10);
      const footerY = doc.page.height - 50;

      doc.text("This is an automatically generated report.", doc.x, footerY, {
        align: "center",
      });

      doc.text(`Page ${doc.page.pageNumber}`, doc.x, footerY + 15, {
        align: "center",
      });

      // Finalize the document
      doc.end();

      stream.on("finish", () => {
        resolve(filePath);
      });

      stream.on("error", (err) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate a CSV report for expenses
 * @param {Object} data - Report data
 * @param {Object} user - User data
 * @returns {Promise<string>} - Path to the generated CSV file
 */
export const generateCSVReport = async (data, user) => {
  const { expenses, period } = data;

  // Create a unique filename with timestamp
  const timestamp = new Date().getTime();
  const filename = `expense_report_${user._id}_${period.year}_${period.month}_${timestamp}.csv`;
  const filePath = path.join(TEMP_DIR, filename);

  // Define the CSV writer
  const csvWriter = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: "date", title: "Date" },
      { id: "from", title: "Starting Point" },
      { id: "to", title: "Destination" },
      { id: "distance", title: "Distance (km)" },
      { id: "duration", title: "Duration" },
      { id: "costPerKm", title: "Cost per km (CHF)" },
      { id: "totalCost", title: "Total Cost (CHF)" },
      { id: "category", title: "Category" },
      { id: "status", title: "Status" },
      { id: "notes", title: "Notes" },
    ],
  });

  // Format the expense data for CSV
  const csvData = expenses.map((expense) => ({
    date: new Date(expense.journeyDate).toLocaleDateString(),
    from: expense.startingPoint,
    to: expense.destinationPoint,
    distance: expense.distance.toFixed(2),
    duration: expense.duration || "N/A",
    costPerKm: expense.costPerKm.toFixed(2),
    totalCost: expense.totalCost.toFixed(2),
    category: expense.category ? expense.category.name : "N/A",
    status: expense.status,
    notes: expense.notes || "",
  }));

  try {
    // Write the CSV file
    await csvWriter.writeRecords(csvData);
    return filePath;
  } catch (error) {
    throw error;
  }
};

/**
 * Clean up temporary report files older than the specified age
 * @param {number} maxAgeHours - Maximum age in hours
 */
export const cleanupOldReports = async (maxAgeHours = 24) => {
  try {
    const files = await fs.promises.readdir(TEMP_DIR);
    const now = new Date().getTime();

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      const stats = await fs.promises.stat(filePath);
      const fileAgeHours = (now - stats.mtime.getTime()) / (1000 * 60 * 60);

      if (fileAgeHours > maxAgeHours) {
        await fs.promises.unlink(filePath);
      }
    }
  } catch (error) {
    console.error("Error cleaning up old reports:", error);
  }
};

// Schedule cleanup of old reports every 12 hours
setInterval(() => {
  cleanupOldReports();
}, 12 * 60 * 60 * 1000);

// Run cleanup on startup
cleanupOldReports();

export default {
  generatePDFReport,
  generateCSVReport,
  cleanupOldReports,
};
