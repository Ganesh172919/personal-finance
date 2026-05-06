/**
 * @fileoverview V1 Organisation Invite API
 *
 * Handles accepting organisation invitations. When an existing member
 * invites a new user, the invite includes a one-time token. The invited
 * user calls `acceptOrgInvite` with that token to join the organisation.
 *
 * This is a single-endpoint module -- the invite creation and listing
 * endpoints live on the server but are not exposed here (invites are
 * typically created via the org members API or email flows).
 */

import { apiClient } from "../core";

import type { AcceptOrgInviteResponse as SdkAcceptOrgInviteResponse } from "@/types/apiTypes";

export type AcceptOrgInviteResponse = SdkAcceptOrgInviteResponse;

/** Accept an organisation invitation using a one-time token. */
export async function acceptOrgInvite(token: string): Promise<AcceptOrgInviteResponse> {
  return apiClient("/v1/org-invites/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}


