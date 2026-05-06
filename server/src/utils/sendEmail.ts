/**
 * @fileoverview Email Sending Utility
 *
 * This module provides email sending functionality for the Personal Finance application.
 * It supports both SMTP email delivery and console logging for development/testing.
 *
 * KEY FEATURES:
 * - SMTP email delivery via Nodemailer
 * - Console logging for development/test environments
 * - Transporter caching for performance
 * - Automatic fallback to console mode on SMTP failure
 * - Email domain extraction for logging
 * - Support for both HTML and plain text emails
 *
 * CONFIGURATION:
 * - EMAIL_USER: SMTP username
 * - EMAIL_PASSWORD: SMTP password
 * - EMAIL_FROM: Sender email address
 * - EMAIL_HOST: SMTP host (optional, uses service if not set)
 * - EMAIL_PORT: SMTP port (optional)
 * - EMAIL_SECURE: Use TLS (optional)
 * - EMAIL_SERVICE: Email service name (e.g., "gmail")
 *
 * @module utils/sendEmail
 */

import nodemailer from "nodemailer"; // Email sending library
import { getEnv } from "../config/env"; // Environment configuration
import { logger } from "../config/logger"; // Application logger

/**
 * Email Options Interface
 *
 * Defines the structure of email options.
 */
interface EmailOptions {
  to: string; // Recipient email address
  subject: string; // Email subject
  text: string; // Plain text body
  html?: string; // HTML body (optional)
}

/**
 * Email Send Result Type
 *
 * Indicates whether email was sent via SMTP or console.
 */
export type EmailSendResult = { mode: "smtp" | "console" };

/**
 * Cached Transporter
 *
 * Cached Nodemailer transporter instance for reuse.
 */
let cachedTransporter: nodemailer.Transporter | null = null;
let cachedTransportSignature = "";

/**
 * Gets or creates a Nodemailer transporter.
 *
 * This function implements a singleton pattern for the email transporter:
 * - Returns cached transporter if configuration hasn't changed
 * - Creates new transporter if configuration changed
 * - Verifies transporter connection before returning
 *
 * @param {Record<string, unknown>} config - Transport configuration
 * @param {string} signature - Configuration signature for caching
 * @returns {Promise<nodemailer.Transporter>} Configured transporter
 */
const getOrCreateTransporter = async (
  config: Record<string, unknown>,
  signature: string
): Promise<nodemailer.Transporter> => {
  // Return cached transporter if configuration hasn't changed
  if (cachedTransporter && cachedTransportSignature === signature) {
    return cachedTransporter;
  }

  // Create new transporter and verify connection
  const transporter = nodemailer.createTransport(config as any);
  await transporter.verify();

  // Cache transporter
  cachedTransporter = transporter;
  cachedTransportSignature = signature;
  return transporter;
};

/**
 * Extracts domain from email address.
 *
 * @param {string} email - Email address
 * @returns {string} Domain name or "unknown"
 */
const emailDomainOf = (email: string) => {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at >= email.length - 1) {
    return "unknown";
  }
  return email.slice(at + 1).toLowerCase();
};

/**
 * Sends an email using SMTP or console logging.
 *
 * This function:
 * 1. Checks if running in test environment (console mode)
 * 2. Checks if email is configured
 * 3. Creates or retrieves cached transporter
 * 4. Sends email via SMTP
 * 5. Falls back to console mode on failure (non-production)
 *
 * @param {EmailOptions} options - Email options
 * @returns {Promise<EmailSendResult>} Send result with mode
 * @throws {Error} If email is not configured or SMTP fails in production
 */
export const sendEmail = async (options: EmailOptions): Promise<EmailSendResult> => {
  const env = getEnv();
  const { EMAIL_USER, EMAIL_PASSWORD, EMAIL_FROM } = env;

  // In test environment, log to console
  if (env.NODE_ENV === "test") {
    logger.info(
      {
        event: "email_console_mode",
        to_domain: emailDomainOf(options.to),
        subject_length: options.subject.length,
        text_length: options.text.length,
        has_html: Boolean(options.html),
      },
      "Email routed to console mode"
    );

    return { mode: "console" };
  }

  // Check if email is configured
  const isConfigured = Boolean(EMAIL_USER && EMAIL_PASSWORD && EMAIL_FROM);
  if (!isConfigured) {
    // In production, throw error
    if (env.NODE_ENV === "production") {
      throw new Error("Email is not configured. Set EMAIL_USER, EMAIL_PASSWORD, and EMAIL_FROM.");
    }

    // In development/test, log to console
    logger.info(
      {
        event: "email_console_mode",
        to_domain: emailDomainOf(options.to),
        subject_length: options.subject.length,
        text_length: options.text.length,
        has_html: Boolean(options.html),
      },
      "Email routed to console mode"
    );

    return { mode: "console" };
  }

  // Build transport configuration
  const transportConfig: Record<string, unknown> =
    env.EMAIL_HOST && env.EMAIL_PORT
      ? {
          host: env.EMAIL_HOST,
          port: env.EMAIL_PORT,
          secure: env.EMAIL_SECURE ?? env.EMAIL_PORT === 465,
          requireTLS: env.EMAIL_REQUIRE_TLS ?? false,
          auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASSWORD,
          },
        }
      : {
          service: env.EMAIL_SERVICE || "gmail",
          secure: env.EMAIL_SECURE ?? true,
          auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASSWORD,
          },
        };

  // Build transport signature for caching
  const transportSignature = JSON.stringify({
    host: env.EMAIL_HOST || null,
    port: env.EMAIL_PORT || null,
    service: env.EMAIL_SERVICE || "gmail",
    user: EMAIL_USER,
    secure: env.EMAIL_SECURE ?? (env.EMAIL_HOST && env.EMAIL_PORT ? env.EMAIL_PORT === 465 : true),
    requireTLS: env.EMAIL_REQUIRE_TLS ?? false,
  });

  try {
    // Get or create transporter
    const transporter = await getOrCreateTransporter(transportConfig, transportSignature);
    const mailOptions = {
      from: EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    // Send email
    await transporter.sendMail(mailOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    logger.error(
      {
        event: "email_smtp_failed",
        to_domain: emailDomainOf(options.to),
        message: String(message).slice(0, 300),
      },
      "SMTP email delivery failed"
    );

    // In non-production, fall back to console mode
    if (env.NODE_ENV !== "production") {
      logger.info(
        {
          event: "email_console_mode",
          to_domain: emailDomainOf(options.to),
          subject_length: options.subject.length,
          text_length: options.text.length,
          has_html: Boolean(options.html),
        },
        "Email routed to console mode after SMTP failure"
      );

      // Clear cached transporter
      cachedTransporter = null;
      cachedTransportSignature = "";
      return { mode: "console" };
    }

    // In production, throw error
    throw new Error(`SMTP email delivery failed: ${message}`);
  }

  // Log successful send
  logger.info({ to_domain: emailDomainOf(options.to) }, "Email sent successfully");
  return { mode: "smtp" };
};
