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

export type ActiveOrg = NonNullable<OrgsMeResponse["active_org"]>;
export type OrgSummary = OrgsMeResponse["orgs"][number];

export async function getMyOrgs(): Promise<OrgsMeResponse> {
  return apiClient("/v1/orgs/me");
}

export async function createOrg(body: CreateOrgRequest): Promise<CreateOrgResponse> {
  return apiClient("/v1/orgs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function addOrgMember(orgId: string, body: AddOrgMemberRequest): Promise<AddOrgMemberResponse> {
  return apiClient(`/v1/orgs/${orgId}/members`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateOrgSettings(
  orgId: string,
  body: UpdateOrgSettingsRequest
): Promise<UpdateOrgSettingsResponse> {
  return apiClient(`/v1/orgs/${orgId}/settings`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}


