/**
 * @fileoverview V1 Organisation Management API
 *
 * Manages organisations (multi-tenant workspaces) and their members.
 * Each user belongs to one or more organisations and can switch between
 * them. Financial data, API keys, and all other resources are scoped
 * to an organisation.
 *
 * Key concepts:
 * - **Active Org**: The user's currently selected organisation. Returned
 *   as part of `getMyOrgs()` alongside the full list of orgs the user
 *   belongs to.
 * - **Org Roles**: Members have roles (e.g., owner, admin, member) that
 *   control their permissions within the organisation.
 * - **Org Settings**: Configuration for the organisation itself (name,
 *   currency, locale, etc.), updatable by admins.
 *
 * All endpoints delegate to the shared `apiClient` for consistent
 * authentication and error handling.
 */

import { apiClient } from "../core";

import type {
  AddOrgMemberRequest as SdkAddOrgMemberRequest,
  AddOrgMemberResponse as SdkAddOrgMemberResponse,
  CreateOrgRequest as SdkCreateOrgRequest,
  CreateOrgResponse as SdkCreateOrgResponse,
  OrgRole as SdkOrgRole,
  OrgsMeResponse as SdkOrgsMeResponse,
  UpdateOrgSettingsRequest as SdkUpdateOrgSettingsRequest,
  UpdateOrgSettingsResponse as SdkUpdateOrgSettingsResponse,
} from "@/types/apiTypes";

export type OrgRole = SdkOrgRole;
export type OrgsMeResponse = SdkOrgsMeResponse;
export type CreateOrgRequest = SdkCreateOrgRequest;
export type CreateOrgResponse = SdkCreateOrgResponse;
export type AddOrgMemberRequest = SdkAddOrgMemberRequest;
export type AddOrgMemberResponse = SdkAddOrgMemberResponse;
export type UpdateOrgSettingsRequest = SdkUpdateOrgSettingsRequest;
export type UpdateOrgSettingsResponse = SdkUpdateOrgSettingsResponse;

/** The user's currently active organisation (non-null by convention). */
export type ActiveOrg = NonNullable<OrgsMeResponse["active_org"]>;
/** Summary of an organisation the user belongs to. */
export type OrgSummary = OrgsMeResponse["orgs"][number];

/** Fetch all organisations the user belongs to, including the active one. */
export async function getMyOrgs(): Promise<OrgsMeResponse> {
  return apiClient("/v1/orgs/me");
}

/** Create a new organisation (the caller becomes the owner). */
export async function createOrg(body: CreateOrgRequest): Promise<CreateOrgResponse> {
  return apiClient("/v1/orgs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Add a member to an organisation by email with a specified role. */
export async function addOrgMember(orgId: string, body: AddOrgMemberRequest): Promise<AddOrgMemberResponse> {
  return apiClient(`/v1/orgs/${orgId}/members`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Update organisation settings (name, currency, locale, etc.). */
export async function updateOrgSettings(
  orgId: string,
  body: UpdateOrgSettingsRequest
): Promise<UpdateOrgSettingsResponse> {
  return apiClient(`/v1/orgs/${orgId}/settings`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}


