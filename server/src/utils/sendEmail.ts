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

import nodemailer, { type Transporter } from "nodemailer"; // Email sending library
import { getEnv } from "../config/env"; // Environment configuration
import { logger } from "../config/logger"; // Application logger

// Defines metadata and payload options for email file attachments.
// Supports file paths, in-memory buffers, custom content types, and display filenames.
export interface EmailAttachment {
  filename: string;
  content?: string | Buffer;
  path?: string;
  contentType?: string;
}

// Options interface encapsulating parameters required to compose and deliver an email message.
// Specifies recipient addresses, subject line, plain text body, HTML markup, and optional attachments.
export interface EmailOptions {
  to: string; // Recipient email address
  subject: string; // Email subject
  text: string; // Plain text body
  html?: string; // HTML body (optional)
  attachments?: EmailAttachment[]; // Attachments (optional)
}

// Return type specifying whether an email was transmitted via live SMTP or redirected to console logs.
// Provides operational visibility into delivery execution modes across development and production.
export type EmailSendResult = { mode: "smtp" | "console" };

let cachedTransporter: Transporter | null = null;
let cachedTransportSignature = "";

// Manages creation and caching of Nodemailer transport instances based on configuration signatures.
// Reuses verified active connections to minimize connection overhead across outbound email dispatches.
const getOrCreateTransporter = async (
  config: Record<string, unknown>,
  signature: string
): Promise<Transporter> => {
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

// Extracts the host domain segment from a recipient email address for privacy-safe logging.
// Sanitizes email tracking records by stripping local user names prior to log output.
const emailDomainOf = (email: string) => {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at >= email.length - 1) {
    return "unknown";
  }
  return email.slice(at + 1).toLowerCase();
};

// Delivers transactional emails via configured SMTP relays with automatic console fallback in development.
// Validates credentials, executes delivery with error trapping, and records structured audit metrics.
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
      attachments: options.attachments,
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
