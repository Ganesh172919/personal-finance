import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useAppConfig } from "@/hooks/useAppConfig";
import {
  addOrgMember,
  createApiKey,
  createOrg,
  getIntegrationHistory,
  installMarketplacePlugin,
  getMyOrgs,
  getMyReferral,
  getUsageLedger,
  listMarketplaceCatalog,
  listIntegrations,
  listApiKeys,
  redeemReferral,
  revokeApiKey,
  syncIntegration,
  uninstallInstalledPlugin,
  updateInstalledPluginVersion,
  updateOrgSettings,
  type ApiKeyScope,
  type OrgRole,
} from "@/lib/apiClient";
import { getActiveOrgId, setActiveOrgId } from "@/lib/orgContext";

const ALL_SCOPES: ApiKeyScope[] = [
  "usage:read",
  "workflows:read",
  "workflows:write",
  "transactions:read",
  "transactions:write",
];

const formatUsd = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

const EMPTY_ORGS: Array<{
  id: string;
  name: string;
  slug: string;
  type: "personal" | "team";
  currency: string;
  locale: string;
  timezone: string;
  role: OrgRole;
  is_default: boolean;
}> = [];

export default function Organization() {
  const queryClient = useQueryClient();
  const configQuery = useAppConfig();

  const orgsQuery = useQuery({
    queryKey: ["v1/orgs/me"],
    queryFn: getMyOrgs,
  });

  const activeOrgIdFromServer = configQuery.data?.org?.id || orgsQuery.data?.active_org?.id || null;
  const orgs = orgsQuery.data?.orgs ?? EMPTY_ORGS;
  const activeOrg = useMemo(
    () => (activeOrgIdFromServer ? orgs.find((org) => org.id === activeOrgIdFromServer) || null : null),
    [activeOrgIdFromServer, orgs]
  );

  useEffect(() => {
    const stored = getActiveOrgId();
    if (!stored && activeOrgIdFromServer) {
      setActiveOrgId(activeOrgIdFromServer);
    }
  }, [activeOrgIdFromServer]);

  const apiKeysQuery = useQuery({
    queryKey: ["v1/api-keys", activeOrgIdFromServer],
    queryFn: listApiKeys,
    enabled: Boolean(activeOrgIdFromServer),
  });

  const usageQuery = useQuery({
    queryKey: ["v1/usage/ledger", activeOrgIdFromServer],
    queryFn: () => getUsageLedger(),
    enabled: Boolean(activeOrgIdFromServer),
  });

  const integrationsQuery = useQuery({
    queryKey: ["v1/integrations", activeOrgIdFromServer],
    queryFn: listIntegrations,
    enabled: Boolean(activeOrgIdFromServer),
  });

  const [marketplaceQuery, setMarketplaceQuery] = useState("");
  const [marketplaceStatus, setMarketplaceStatus] = useState<"all" | "active" | "preview" | "deprecated">("active");

  const marketplaceCatalogQuery = useQuery({
    queryKey: ["v1/marketplace/catalog", activeOrgIdFromServer, marketplaceQuery, marketplaceStatus],
    queryFn: () =>
      listMarketplaceCatalog({
        q: marketplaceQuery.trim() || undefined,
        status: marketplaceStatus === "all" ? undefined : marketplaceStatus,
      }),
    enabled: Boolean(activeOrgIdFromServer),
  });

  const referralQuery = useQuery({
    queryKey: ["v1/referrals/me", activeOrgIdFromServer],
    queryFn: getMyReferral,
    enabled: Boolean(activeOrgIdFromServer),
  });

  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<OrgRole>("member");

  const [apiKeyName, setApiKeyName] = useState("");
  const [apiKeyScopes, setApiKeyScopes] = useState<ApiKeyScope[]>(["usage:read"]);
  const [createdApiKeySecret, setCreatedApiKeySecret] = useState<string | null>(null);

  const [lastInvite, setLastInvite] = useState<null | { email: string; acceptLink?: string; tokenPrefix?: string }>(null);

  const [currency, setCurrency] = useState("");
  const [locale, setLocale] = useState("");
  const [timezone, setTimezone] = useState("");

  const [integrationStubRecords, setIntegrationStubRecords] = useState("12");
  const [historyConnectorKey, setHistoryConnectorKey] = useState<string | null>(null);

  const [redeemCode, setRedeemCode] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const org = configQuery.data?.org as any;
    if (!org) return;
    setCurrency(String(org.currency || "USD"));
    setLocale(String(org.locale || "en-US"));
    setTimezone(String(org.timezone || "UTC"));
  }, [configQuery.data?.org]);

  const refreshAll = async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ["/api/config/me"] }),
      queryClient.invalidateQueries({ queryKey: ["v1/orgs/me"] }),
      queryClient.invalidateQueries({ queryKey: ["v1/api-keys"] }),
      queryClient.invalidateQueries({ queryKey: ["v1/usage/ledger"] }),
      queryClient.invalidateQueries({ queryKey: ["v1/integrations"] }),
      queryClient.invalidateQueries({ queryKey: ["v1/marketplace/catalog"] }),
    ]);
  };

  const createOrgMutation = useMutation({
    mutationFn: (body: { name: string; slug?: string }) => createOrg(body),
    onSuccess: async () => {
      setNotice("Organization created.");
      setError(null);
      setOrgName("");
      setOrgSlug("");
      await refreshAll();
      await orgsQuery.refetch();
    },
    onError: (e: any) => {
      setNotice(null);
      setError(e?.message || "Failed to create organization");
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: (input: { orgId: string; email: string; role?: OrgRole }) =>
      addOrgMember(input.orgId, { email: input.email, role: input.role }),
    onSuccess: async (resp) => {
      const invite = (resp as any)?.invite;
      const member = (resp as any)?.member;

      if (invite) {
        const token = typeof invite.token === "string" && invite.token.trim() ? invite.token.trim() : undefined;
        const acceptLink = token
          ? `${window.location.origin.replace(/\/$/, "")}/accept-invite?token=${encodeURIComponent(token)}`
          : undefined;

        setLastInvite({
          email: String(invite.email || memberEmail || ""),
          acceptLink,
          tokenPrefix: typeof invite.token_prefix === "string" ? invite.token_prefix : undefined,
        });

        setNotice(token ? "Invite created (dev token included)." : "Invite sent.");
      } else if (member) {
        setLastInvite(null);
        setNotice("Member added.");
      } else {
        setLastInvite(null);
        setNotice("Member updated.");
      }

      setError(null);
      setMemberEmail("");
      setMemberRole("member");
      await refreshAll();
    },
    onError: (e: any) => {
      setLastInvite(null);
      setNotice(null);
      setError(e?.message || "Failed to add member");
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (input: { orgId: string; body: { currency?: string; locale?: string; timezone?: string } }) =>
      updateOrgSettings(input.orgId, input.body),
    onSuccess: async () => {
      setNotice("Organization settings updated.");
      setError(null);
      await refreshAll();
      await configQuery.refetch();
      await orgsQuery.refetch();
    },
    onError: (e: any) => {
      setNotice(null);
      setError(e?.message || "Failed to update organization settings");
    },
  });

  const createApiKeyMutation = useMutation({
    mutationFn: (body: { name: string; scopes: ApiKeyScope[] }) => createApiKey(body),
    onSuccess: async (resp) => {
      setCreatedApiKeySecret(resp.api_key);
      setNotice("API key created (copy it now).");
      setError(null);
      setApiKeyName("");
      setApiKeyScopes(["usage:read"]);
      await refreshAll();
      await apiKeysQuery.refetch();
    },
    onError: (e: any) => {
      setCreatedApiKeySecret(null);
      setNotice(null);
      setError(e?.message || "Failed to create API key");
    },
  });

  const revokeApiKeyMutation = useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: async () => {
      setNotice("API key revoked.");
      setError(null);
      await refreshAll();
      await apiKeysQuery.refetch();
    },
    onError: (e: any) => {
      setNotice(null);
      setError(e?.message || "Failed to revoke API key");
    },
  });

  const integrationHistoryQuery = useQuery({
    queryKey: ["v1/integrations/history", historyConnectorKey, activeOrgIdFromServer],
    queryFn: () => (historyConnectorKey ? getIntegrationHistory(historyConnectorKey, 25) : Promise.resolve(null as any)),
    enabled: Boolean(historyConnectorKey && activeOrgIdFromServer),
  });

  const syncIntegrationMutation = useMutation({
    mutationFn: async (connectorKey: string) => {
      const records = Math.max(1, Math.min(500, Math.floor(Number(integrationStubRecords || 12))));
      return syncIntegration(connectorKey, { records_synced: records });
    },
    onSuccess: async () => {
      setNotice("Integration sync started.");
      setError(null);
      await refreshAll();
      await integrationsQuery.refetch();
      if (historyConnectorKey) {
        await integrationHistoryQuery.refetch();
      }
    },
    onError: (e: any) => {
      setNotice(null);
      setError(e?.message || "Failed to sync integration");
    },
  });

  const installPluginMutation = useMutation({
    mutationFn: async (pluginKey: string) => installMarketplacePlugin({ plugin_key: pluginKey }),
    onSuccess: async (resp: any) => {
      setNotice(`Installed ${resp?.install?.plugin_key || "plugin"}.`);
      setError(null);
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["v1/marketplace/catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["v1/workflows/templates"] }),
      ]);
      await marketplaceCatalogQuery.refetch();
    },
    onError: (e: any) => {
      setNotice(null);
      setError(e?.message || "Failed to install plugin");
    },
  });

  const uninstallPluginMutation = useMutation({
    mutationFn: async (pluginKey: string) => uninstallInstalledPlugin(pluginKey),
    onSuccess: async (resp: any) => {
      setNotice(`Uninstalled ${resp?.plugin?.plugin_key || "plugin"}.`);
      setError(null);
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["v1/marketplace/catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["v1/workflows/templates"] }),
      ]);
      await marketplaceCatalogQuery.refetch();
    },
    onError: (e: any) => {
      setNotice(null);
      setError(e?.message || "Failed to uninstall plugin");
    },
  });

  const updatePluginMutation = useMutation({
    mutationFn: async (payload: { pluginKey: string; version: string }) =>
      updateInstalledPluginVersion(payload.pluginKey, payload.version),
    onSuccess: async (resp: any) => {
      setNotice(`Updated ${resp?.plugin?.plugin_key || "plugin"}.`);
      setError(null);
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["v1/marketplace/catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["v1/workflows/templates"] }),
      ]);
      await marketplaceCatalogQuery.refetch();
    },
    onError: (e: any) => {
      setNotice(null);
      setError(e?.message || "Failed to update plugin");
    },
  });

  const redeemReferralMutation = useMutation({
    mutationFn: async () => redeemReferral({ code: redeemCode }),
    onSuccess: async (resp: any) => {
      setNotice(resp?.applied ? "Referral applied. Credits added to your plan." : "Referral already redeemed for this org.");
      setError(null);
      setRedeemCode("");
      await refreshAll();
      await referralQuery.refetch();
      await usageQuery.refetch();
    },
    onError: (e: any) => {
      setNotice(null);
      setError(e?.message || "Failed to redeem referral code");
    },
  });

  const switchOrg = async (orgId: string) => {
    setActiveOrgId(orgId);
    setNotice("Switched active organization.");
    setError(null);
    await refreshAll();
    await configQuery.refetch();
    await orgsQuery.refetch();
  };

  const canAdmin = Boolean(configQuery.data?.org?.role && ["owner", "admin"].includes(configQuery.data.org.role));

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-1">
        <div className="text-xl font-semibold text-foreground">Organization</div>
        <div className="text-sm text-muted-foreground">
          Active org: {activeOrg ? `${activeOrg.name} (${configQuery.data?.org?.role || activeOrg.role})` : "—"}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">{notice}</div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tenant context</CardTitle>
          <CardDescription>Select which organization your actions apply to.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label>Active organization</Label>
            <Select value={activeOrgIdFromServer || ""} onValueChange={switchOrg} disabled={orgs.length === 0}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={orgsQuery.isLoading ? "Loading…" : "Select org"} />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name} ({org.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Create org</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create organization</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="FinWise Team" />
                </div>
                <div>
                  <Label>Slug (optional)</Label>
                  <Input value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} placeholder="finwise-team" />
                  <div className="mt-1 text-xs text-muted-foreground">
                    Lowercase letters, numbers, hyphens.
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => createOrgMutation.mutate({ name: orgName, slug: orgSlug || undefined })}
                  disabled={createOrgMutation.isPending || orgName.trim().length < 2}
                >
                  {createOrgMutation.isPending ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
            <TabsTrigger value="api_keys">API keys</TabsTrigger>
            <TabsTrigger value="referrals">Referrals</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
          </TabsList>

        <TabsContent value="members" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Members</CardTitle>
              <CardDescription>Add members directly, or invite by email.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Your role: {configQuery.data?.org?.role || "—"} {canAdmin ? "(admin)" : "(member)"}
              </div>

              {lastInvite ? (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <div className="font-medium text-foreground">Invite created</div>
                  <div className="mt-1 text-muted-foreground">Email: {lastInvite.email}</div>
                  {lastInvite.acceptLink ? (
                    <div className="mt-1">
                      <a className="text-primary underline" href={lastInvite.acceptLink}>
                        Open invite link
                      </a>
                    </div>
                  ) : lastInvite.tokenPrefix ? (
                    <div className="mt-1 text-muted-foreground">Token prefix: {lastInvite.tokenPrefix}</div>
                  ) : null}
                </div>
              ) : null}

              <Dialog>
                <DialogTrigger asChild>
                  <Button disabled={!canAdmin || !activeOrgIdFromServer}>Add member</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add member</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Email</Label>
                      <Input
                        value={memberEmail}
                        onChange={(e) => setMemberEmail(e.target.value)}
                        placeholder="person@example.com"
                      />
                    </div>
                    <div>
                      <Label>Role</Label>
                      <Select value={memberRole} onValueChange={(v) => setMemberRole(v as OrgRole)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">member</SelectItem>
                          <SelectItem value="admin">admin</SelectItem>
                          <SelectItem value="owner">owner</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() =>
                        activeOrgIdFromServer
                          ? addMemberMutation.mutate({ orgId: activeOrgIdFromServer, email: memberEmail, role: memberRole })
                          : null
                      }
                      disabled={addMemberMutation.isPending || !activeOrgIdFromServer || memberEmail.trim().length < 3}
                    >
                      {addMemberMutation.isPending ? "Adding…" : "Add"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Organization settings</CardTitle>
              <CardDescription>Locale preferences used for currency and date formatting.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <Label>Currency</Label>
                  <Input
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    placeholder="USD"
                    disabled={!canAdmin}
                  />
                  <div className="mt-1 text-xs text-muted-foreground">Example: USD, EUR, INR</div>
                </div>
                <div>
                  <Label>Locale</Label>
                  <Input
                    value={locale}
                    onChange={(e) => setLocale(e.target.value)}
                    placeholder="en-US"
                    disabled={!canAdmin}
                  />
                  <div className="mt-1 text-xs text-muted-foreground">Example: en-US, en-GB, hi-IN</div>
                </div>
                <div>
                  <Label>Timezone</Label>
                  <Input
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="UTC"
                    disabled={!canAdmin}
                  />
                  <div className="mt-1 text-xs text-muted-foreground">Example: UTC, America/New_York</div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  disabled={!canAdmin || !activeOrgIdFromServer || updateSettingsMutation.isPending}
                  onClick={() =>
                    activeOrgIdFromServer
                      ? updateSettingsMutation.mutate({
                          orgId: activeOrgIdFromServer,
                          body: {
                            currency: currency.trim() || undefined,
                            locale: locale.trim() || undefined,
                            timezone: timezone.trim() || undefined,
                          },
                        })
                      : null
                  }
                >
                  {updateSettingsMutation.isPending ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Integrations</CardTitle>
              <CardDescription>
                Connector sync runs are queued when the worker is enabled, and metered by plan limits.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Stub sync size</Label>
                  <Input
                    value={integrationStubRecords}
                    onChange={(e) => setIntegrationStubRecords(e.target.value)}
                    placeholder="12"
                    disabled={!canAdmin}
                  />
                  <div className="mt-1 text-xs text-muted-foreground">
                    Used by stub connectors in local/dev (e.g., bank stub).
                  </div>
                </div>
              </div>

              {integrationsQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading integrations…</div>
              ) : integrationsQuery.data?.connectors?.length ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Connector</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last sync</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {integrationsQuery.data.connectors.map((connector: any) => (
                        <TableRow key={connector.connector_key}>
                          <TableCell>
                            <div className="font-medium">{connector.name}</div>
                            <div className="text-xs text-muted-foreground">{connector.connector_key}</div>
                            {connector.last_error ? (
                              <div className="text-xs text-destructive mt-1">{String(connector.last_error)}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="capitalize">{String(connector.category || "")}</TableCell>
                          <TableCell>{String(connector.status || "disconnected")}</TableCell>
                          <TableCell>
                            {connector.last_sync_at ? new Date(connector.last_sync_at).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              size="sm"
                              disabled={!canAdmin || syncIntegrationMutation.isPending}
                              onClick={() => syncIntegrationMutation.mutate(String(connector.connector_key))}
                            >
                              {syncIntegrationMutation.isPending ? "Syncing…" : "Sync"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setHistoryConnectorKey(String(connector.connector_key))}
                            >
                              History
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No connectors available.</div>
              )}

              <Dialog
                open={Boolean(historyConnectorKey)}
                onOpenChange={(open) => {
                  if (!open) setHistoryConnectorKey(null);
                }}
              >
                <DialogContent className="max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Integration history</DialogTitle>
                  </DialogHeader>
                  {integrationHistoryQuery.isLoading ? (
                    <div className="text-sm text-muted-foreground">Loading history…</div>
                  ) : integrationHistoryQuery.data?.history?.length ? (
                    <div className="overflow-x-auto rounded-md border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Status</TableHead>
                            <TableHead>Records</TableHead>
                            <TableHead>Started</TableHead>
                            <TableHead>Finished</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {integrationHistoryQuery.data.history.map((row: any) => (
                            <TableRow key={row.id}>
                              <TableCell>{String(row.status)}</TableCell>
                              <TableCell>{Number(row.records_synced || 0)}</TableCell>
                              <TableCell>{row.started_at ? new Date(row.started_at).toLocaleString() : "—"}</TableCell>
                              <TableCell>{row.finished_at ? new Date(row.finished_at).toLocaleString() : "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No sync runs recorded yet.</div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setHistoryConnectorKey(null)}>
                      Close
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marketplace" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Marketplace</CardTitle>
              <CardDescription>Install trusted plugins that add connectors and workflow templates.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Label>Search</Label>
                  <Input
                    value={marketplaceQuery}
                    onChange={(e) => setMarketplaceQuery(e.target.value)}
                    placeholder="Search plugins (bank, digest, templates...)"
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={marketplaceStatus} onValueChange={(v) => setMarketplaceStatus(v as any)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">active</SelectItem>
                      <SelectItem value="preview">preview</SelectItem>
                      <SelectItem value="deprecated">deprecated</SelectItem>
                      <SelectItem value="all">all</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!canAdmin ? (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Only org admins can install or uninstall plugins.
                </div>
              ) : null}

              {marketplaceCatalogQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading marketplace...</div>
              ) : marketplaceCatalogQuery.data?.plugins?.length ? (
                <div className="space-y-3">
                  {marketplaceCatalogQuery.data.plugins.map((plugin: any) => {
                    const installed = Boolean(plugin.installed);
                    const canUpdate =
                      installed &&
                      plugin.installed_version &&
                      plugin.latest_version &&
                      String(plugin.installed_version) !== String(plugin.latest_version);

                    return (
                      <div
                        key={String(plugin.plugin_key)}
                        className="rounded-md border border-border p-4 flex flex-col md:flex-row md:items-start md:justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-foreground">{String(plugin.name || plugin.plugin_key)}</div>
                            <div className="text-xs text-muted-foreground capitalize">{String(plugin.status || "active")}</div>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">{String(plugin.description || "")}</div>
                          <div className="text-[11px] text-muted-foreground mt-2">
                            Key: {String(plugin.plugin_key)} • Publisher: {String(plugin.publisher || "Unknown")} • Latest:{" "}
                            {String(plugin.latest_version || "")}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1">
                            Permissions:{" "}
                            {Array.isArray(plugin.permissions) && plugin.permissions.length > 0
                              ? plugin.permissions.join(", ")
                              : "—"}
                            {String(plugin.pricing_model || "free") === "paid"
                              ? ` • $${String(plugin.price_monthly_usd || "")}/mo`
                              : " • Free"}
                          </div>
                          {installed ? (
                            <div className="text-[11px] text-muted-foreground mt-1">
                              Installed: {String(plugin.installed_version || "")} ({String(plugin.installed_status || "installed")})
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-col gap-2 flex-shrink-0">
                          {installed ? (
                            <>
                              {canUpdate ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!canAdmin || updatePluginMutation.isPending}
                                  onClick={() =>
                                    updatePluginMutation.mutate({
                                      pluginKey: String(plugin.plugin_key),
                                      version: String(plugin.latest_version),
                                    })
                                  }
                                >
                                  {updatePluginMutation.isPending ? "Updating..." : "Update"}
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={!canAdmin || uninstallPluginMutation.isPending}
                                onClick={() => uninstallPluginMutation.mutate(String(plugin.plugin_key))}
                              >
                                {uninstallPluginMutation.isPending ? "Uninstalling..." : "Uninstall"}
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              disabled={!canAdmin || installPluginMutation.isPending}
                              onClick={() => installPluginMutation.mutate(String(plugin.plugin_key))}
                            >
                              {installPluginMutation.isPending ? "Installing..." : "Install"}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No plugins found.</div>
              )}

              <div className="text-xs text-muted-foreground">
                Tip: installed plugins can add workflow templates under Workflows → Templates.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api_keys" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">API keys</CardTitle>
              <CardDescription>Keys are scoped to the active organization. Only admins can manage keys.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Dialog onOpenChange={(open) => (!open ? setCreatedApiKeySecret(null) : null)}>
                <DialogTrigger asChild>
                  <Button disabled={!canAdmin || !activeOrgIdFromServer}>Create API key</Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Create API key</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Name</Label>
                      <Input value={apiKeyName} onChange={(e) => setApiKeyName(e.target.value)} placeholder="CI / Integration" />
                    </div>
                    <div className="space-y-2">
                      <Label>Scopes</Label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {ALL_SCOPES.map((scope) => {
                          const checked = apiKeyScopes.includes(scope);
                          return (
                            <label key={scope} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? Array.from(new Set([...apiKeyScopes, scope]))
                                    : apiKeyScopes.filter((s) => s !== scope);
                                  setApiKeyScopes(next);
                                }}
                              />
                              <span>{scope}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {createdApiKeySecret ? (
                      <div className="rounded-md border border-border bg-muted/30 p-3">
                        <div className="text-xs font-semibold text-foreground">Copy this key now</div>
                        <div className="mt-2 flex items-center gap-2">
                          <Input value={createdApiKeySecret} readOnly />
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(createdApiKeySecret);
                                setNotice("API key copied.");
                                setError(null);
                              } catch {
                                setError("Copy failed. Select and copy the key manually.");
                              }
                            }}
                          >
                            Copy
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => createApiKeyMutation.mutate({ name: apiKeyName, scopes: apiKeyScopes })}
                      disabled={createApiKeyMutation.isPending || apiKeyName.trim().length < 2 || apiKeyScopes.length < 1}
                    >
                      {createApiKeyMutation.isPending ? "Creating…" : "Create"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Prefix</TableHead>
                      <TableHead>Scopes</TableHead>
                      <TableHead>Last used</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiKeysQuery.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5}>Loading…</TableCell>
                      </TableRow>
                    ) : apiKeysQuery.data?.api_keys?.length ? (
                      apiKeysQuery.data.api_keys.map((key) => (
                        <TableRow key={key.id}>
                          <TableCell>{key.name}</TableCell>
                          <TableCell className="font-mono text-xs">{key.prefix}</TableCell>
                          <TableCell className="text-xs">{key.scopes.join(", ")}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => revokeApiKeyMutation.mutate(key.id)}
                              disabled={revokeApiKeyMutation.isPending || !canAdmin || Boolean(key.revoked_at)}
                            >
                              {key.revoked_at ? "Revoked" : "Revoke"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5}>No API keys yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referrals" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Referrals</CardTitle>
              <CardDescription>Share your code to grant both orgs extra credits for 3 months.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {referralQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : referralQuery.data ? (
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label>Your referral code</Label>
                    <div className="flex items-center gap-2">
                      <Input value={(referralQuery.data as any).referral_code || ""} readOnly />
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(String((referralQuery.data as any).referral_code || ""));
                            setNotice("Referral code copied.");
                            setError(null);
                          } catch {
                            setNotice(null);
                            setError("Copy failed. Select and copy the code manually.");
                          }
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>Share link</Label>
                    <div className="flex items-center gap-2">
                      <Input value={(referralQuery.data as any).share_url || ""} readOnly />
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(String((referralQuery.data as any).share_url || ""));
                            setNotice("Share link copied.");
                            setError(null);
                          } catch {
                            setNotice(null);
                            setError("Copy failed. Select and copy the link manually.");
                          }
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">
                    <div className="font-medium">Stats</div>
                    <div className="mt-1 text-muted-foreground">
                      Successful referrals: {(referralQuery.data as any).redemptions_count ?? 0}
                    </div>
                    {(referralQuery.data as any).referred_by?.referral_code ? (
                      <div className="mt-1 text-muted-foreground">
                        This org was referred by: {(referralQuery.data as any).referred_by.referral_code}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">
                    <div className="font-medium">Reward (per month)</div>
                    <div className="mt-1 text-muted-foreground">
                      +{(referralQuery.data as any).reward?.units?.monthly_ai_calls ?? 0} AI calls, +{(referralQuery.data as any).reward?.units?.workflow_runs ?? 0} workflow runs, +{(referralQuery.data as any).reward?.units?.api_requests ?? 0} API requests
                    </div>
                  </div>

                  <div className="border-t border-border pt-4">
                    <div className="text-sm font-medium text-foreground">Redeem a referral code</div>
                    <div className="mt-2 flex items-center gap-2">
                      <Input placeholder="Enter code" value={redeemCode} onChange={(e) => setRedeemCode(e.target.value)} />
                      <Button
                        onClick={() => redeemReferralMutation.mutate()}
                        disabled={!redeemCode.trim() || redeemReferralMutation.isPending || !activeOrgIdFromServer}
                      >
                        {redeemReferralMutation.isPending ? "Redeeming…" : "Redeem"}
                      </Button>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Intended for new orgs. If already redeemed, the operation is idempotent.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Referral info unavailable.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Usage & limits</CardTitle>
              <CardDescription>Transparent usage ledger (calls, tokens, and estimated cost).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {usageQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : usageQuery.data ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-border p-3">
                      <div className="text-xs text-muted-foreground">Plan</div>
                      <div className="text-sm font-semibold">{usageQuery.data.plan}</div>
                      <div className="text-xs text-muted-foreground">{usageQuery.data.status}</div>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <div className="text-xs text-muted-foreground">Period</div>
                      <div className="text-sm font-semibold">{usageQuery.data.period_key}</div>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <div className="text-xs text-muted-foreground">AI calls (used / limit)</div>
                      <div className="text-sm font-semibold">
                        {usageQuery.data.usage.monthly_ai_calls} / {usageQuery.data.limits.monthly_ai_calls}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Feature</TableHead>
                          <TableHead className="text-right">Units</TableHead>
                          <TableHead className="text-right">Tokens in</TableHead>
                          <TableHead className="text-right">Tokens out</TableHead>
                          <TableHead className="text-right">Est. cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usageQuery.data.ledger.map((row) => (
                          <TableRow key={row.feature}>
                            <TableCell className="text-sm">{row.feature}</TableCell>
                            <TableCell className="text-right text-sm">{row.units}</TableCell>
                            <TableCell className="text-right text-sm">{row.tokens_in}</TableCell>
                            <TableCell className="text-right text-sm">{row.tokens_out}</TableCell>
                            <TableCell className="text-right text-sm">{formatUsd(row.cost_usd)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No usage data.</div>
              )}

              <div className="text-xs text-muted-foreground">
                Note: token cost is estimated only when AI Core cost env vars are configured.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
