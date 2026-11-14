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

// Encapsulates the response produced after accepting an organization invite token.
// Re-exports the standard SDK contract detailing tenant membership confirmation.
// Delivers organization credentials and initial role privileges to the invited member.
export type AcceptOrgInviteResponse = SdkAcceptOrgInviteResponse;

// Validates a one-time invitation token to join an existing organization tenant.
// Dispatches an authenticated POST request submitting the security invite token.
// Enrolls the active user account into the target organization membership roster.
/** Accept an organisation invitation using a one-time token. */
export async function acceptOrgInvite(token: string): Promise<AcceptOrgInviteResponse> {
  return apiClient("/org-invites/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}


