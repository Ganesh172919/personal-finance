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

// Defines membership authority levels within an organization tenant.
// Distinguishes owners, administrative managers, and regular workspace members.
// Governs administrative rights such as billing, member invites, and setting changes.
export type OrgRole = SdkOrgRole;
// Encapsulates the response payload containing organization memberships for the current user.
// Delivers the currently active tenant alongside all associated organization summaries.
// Drives the organization switcher component in top-level navigation bars.
export type OrgsMeResponse = SdkOrgsMeResponse;
// Defines parameters required to initialize a new multi-tenant organization.
// Captures organization name, default operating currency, and regional preferences.
// Submits provisioning criteria when establishing a new collaborative workspace.
export type CreateOrgRequest = SdkCreateOrgRequest;
// Encapsulates the confirmation payload returned upon successful organization creation.
// Delivers the newly provisioned organization tenant with the creator assigned as owner.
// Immediately selects the new organization as active within local client context.
export type CreateOrgResponse = SdkCreateOrgResponse;
// Defines parameters for granting an additional user membership in an organization.
// Identifies the invited user by email address and designates their assigned role.
// Submits invitation specifications to expand collaborative workspace teams.
export type AddOrgMemberRequest = SdkAddOrgMemberRequest;
// Encapsulates the confirmation returned upon adding a member to an organization.
// Confirms membership addition or delivery of an invitation notification email.
// Refreshes organization member rosters across administration management views.
export type AddOrgMemberResponse = SdkAddOrgMemberResponse;
// Defines mutable organization properties updatable by tenant administrators.
// Supports partial modifications to organization display names and regional settings.
// Enables safe adjustments to organization profile configuration options.
export type UpdateOrgSettingsRequest = SdkUpdateOrgSettingsRequest;
// Encapsulates the server response returned after modifying organization settings.
// Returns the updated organization record reflecting applied setting changes.
// Synchronizes updated tenant branding and currency preferences across client stores.
export type UpdateOrgSettingsResponse = SdkUpdateOrgSettingsResponse;

// Extracts the active organization tenant entity currently selected by the user.
// Represents the primary tenancy context applied to all outgoing API operations.
// Supplies tenant identifiers, branding labels, and owner attributes.
/** The user's currently active organisation (non-null by convention). */
export type ActiveOrg = NonNullable<OrgsMeResponse["active_org"]>;
// Represents a concise summary of an organization to which the current user belongs.
// Unpacks tenant identifiers, display names, member counts, and active user roles.
// Feeds selection items in organization switcher dropdowns and account lists.
/** Summary of an organisation the user belongs to. */
export type OrgSummary = OrgsMeResponse["orgs"][number];

// Fetches all organization workspaces affiliated with the authenticated user.
// Dispatches an authenticated GET request loading active and alternative tenants.
// Populates tenant switcher menus and verifies current workspace membership.
/** Fetch all organisations the user belongs to, including the active one. */
export async function getMyOrgs(): Promise<OrgsMeResponse> {
  return apiClient("/orgs/me");
}

// Provisions a new organization workspace assigning the authenticated caller as owner.
// Dispatches an authenticated POST request with initial tenant configurations.
// Returns the initialized organization entity to establish a new collaboration space.
/** Create a new organisation (the caller becomes the owner). */
export async function createOrg(body: CreateOrgRequest): Promise<CreateOrgResponse> {
  return apiClient("/orgs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Enrolls a new team member into an organization workspace with an assigned role.
// Dispatches an authenticated POST request delivering user email and role credentials.
// Expands team access permissions and triggers invitation notification emails.
/** Add a member to an organisation by email with a specified role. */
export async function addOrgMember(orgId: string, body: AddOrgMemberRequest): Promise<AddOrgMemberResponse> {
  return apiClient(`/orgs/${orgId}/members`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Modifies high-level configuration settings for an identified organization workspace.
// Dispatches an authenticated PATCH request transmitting modified setting parameters.
// Refreshes organization metadata and propagates updated workspace rules.
/** Update organisation settings (name, currency, locale, etc.). */
export async function updateOrgSettings(
  orgId: string,
  body: UpdateOrgSettingsRequest
): Promise<UpdateOrgSettingsResponse> {
  return apiClient(`/orgs/${orgId}/settings`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}


