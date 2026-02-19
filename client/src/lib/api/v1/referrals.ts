import { apiClient } from "../core";

import type { ReferralRedeemRequest, ReferralRedeemResponse, ReferralsMeResponse } from "@finwise/sdk-ts";

export async function getMyReferral() {
  return apiClient("/v1/referrals/me") as Promise<ReferralsMeResponse>;
}

export async function redeemReferral(body: ReferralRedeemRequest) {
  return apiClient("/v1/referrals/redeem", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<ReferralRedeemResponse>;
}

