import nodemailer from "nodemailer";
import { logger } from "./logger.js";

/**
 * Creates a nodemailer transporter for sending emails
 * @returns {Object} nodemailer transporter
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

/**
 * Sends an email
 * @param {Object} options - Email options
 * @param {String} options.to - Recipient email
 * @param {String} options.subject - Email subject
 * @param {String} options.text - Plain text content
 * @param {String} options.html - HTML content (optional)
 * @returns {Promise} Result of sending email
 */
export const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`Error sending email: ${error.message}`);
    throw error;
  }
};

/**
 * Sends a password reset email
 * @param {String} email - Recipient email
 * @param {String} resetUrl - Password reset URL
 * @returns {Promise} Result of sending email
 */
export const sendPasswordResetEmail = async (email, resetUrl) => {
  const subject = "Password Reset Request";
  const text = `You are receiving this email because you (or someone else) has requested the reset of a password. Please follow this link to reset your password: \n\n ${resetUrl} \n\n If you did not request this, please ignore this email and your password will remain unchanged.`;

  const html = `
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
      <h2 style="color: #333; text-align: center;">Password Reset Request</h2>
      <p>You are receiving this email because you (or someone else) has requested the reset of a password.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
      </div>
      <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
      <p>This link will expire in 10 minutes.</p>
      <hr style="border: 1px solid #eee; margin: 20px 0;" />
      <p style="text-align: center; color: #777; font-size: 12px;">© ${new Date().getFullYear()} AussenDienst GmbH Expense App</p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject,
    text,
    html,
  });
};

export default { sendEmail, sendPasswordResetEmail };
