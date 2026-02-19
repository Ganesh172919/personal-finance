import { z } from "zod";

export const redeemReferralBodySchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{6,16}$/, "Referral code must be 6-16 alphanumeric characters"),
  })
  .strict();

