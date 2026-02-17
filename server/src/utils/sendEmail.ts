import nodemailer from "nodemailer";
import { getEnv } from "../config/env";

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type EmailSendResult = { mode: "smtp" | "console" };

let cachedTransporter: nodemailer.Transporter | null = null;
let cachedTransportSignature = "";

const getOrCreateTransporter = async (
  config: Record<string, unknown>,
  signature: string
): Promise<nodemailer.Transporter> => {
  if (cachedTransporter && cachedTransportSignature === signature) {
    return cachedTransporter;
  }

  const transporter = nodemailer.createTransport(config as any);
  await transporter.verify();

  cachedTransporter = transporter;
  cachedTransportSignature = signature;
  return transporter;
};

export const sendEmail = async (options: EmailOptions): Promise<EmailSendResult> => {
  const env = getEnv();
  const { EMAIL_USER, EMAIL_PASSWORD, EMAIL_FROM } = env;

  const isConfigured = Boolean(EMAIL_USER && EMAIL_PASSWORD && EMAIL_FROM);
  if (!isConfigured) {
    if (env.NODE_ENV === "production") {
      throw new Error("Email is not configured. Set EMAIL_USER, EMAIL_PASSWORD, and EMAIL_FROM.");
    }

    console.log(
      JSON.stringify({
        event: "email_console_mode",
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      })
    );

    return { mode: "console" };
  }

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

  const transportSignature = JSON.stringify({
    host: env.EMAIL_HOST || null,
    port: env.EMAIL_PORT || null,
    service: env.EMAIL_SERVICE || "gmail",
    user: EMAIL_USER,
    secure: env.EMAIL_SECURE ?? (env.EMAIL_HOST && env.EMAIL_PORT ? env.EMAIL_PORT === 465 : true),
    requireTLS: env.EMAIL_REQUIRE_TLS ?? false,
  });

  try {
    const transporter = await getOrCreateTransporter(transportConfig, transportSignature);
    const mailOptions = {
      from: EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw new Error(
      `SMTP email delivery failed: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
  
  console.log(`Email sent successfully to: ${options.to}`);
  return { mode: "smtp" };
};
