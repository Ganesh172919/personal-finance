import { apiClient } from "../core";

import type { AcceptOrgInviteResponse as SdkAcceptOrgInviteResponse } from "@/types/apiTypes";

export type AcceptOrgInviteResponse = SdkAcceptOrgInviteResponse;

export async function acceptOrgInvite(token: string): Promise<AcceptOrgInviteResponse> {
  return apiClient("/v1/org-invites/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}


