/**
 * @fileoverview V1 Referral System API
 *
 * Manages the user's referral code and referral redemption. Users can
 * share their unique referral code with others; when a new user signs
 * up with that code, both parties may receive rewards.
 *
 * Key concepts:
 * - **Referral Code**: Each user has a unique code returned by
 *   `getMyReferral()`. The response includes the code, share URL,
 *   and current referral stats.
 * - **Redemption**: New users call `redeemReferral` with a code they
 *   received from an existing user to claim the referral benefit.
 */

import { apiClient } from "../core";

import type { ReferralRedeemRequest, ReferralRedeemResponse, ReferralsMeResponse } from "@/types/apiTypes";

// Retrieves the active user's personalized referral link, tracking code, and rewards.
// Dispatches an authenticated GET request loading referral conversion metrics.
// Powers customer referral sharing cards and viral growth promotion widgets.
/** Fetch the current user's referral code and stats. */
export async function getMyReferral() {
  return apiClient("/referrals/me") as Promise<ReferralsMeResponse>;
}

// Applies a prospective member's referral code to unlock introductory platform perks.
// Dispatches an authenticated POST request submitting the referral tracking code.
// Credits eligible sign-up bonuses to both the referred user and referring advocate.
/** Redeem a referral code to claim referral benefits. */
export async function redeemReferral(body: ReferralRedeemRequest) {
  return apiClient("/referrals/redeem", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<ReferralRedeemResponse>;
}



