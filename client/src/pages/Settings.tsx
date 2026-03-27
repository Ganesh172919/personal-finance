import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { User, Shield, Key, Settings as SettingsIcon, Copy, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useToast } from "@/hooks/useToast";
import { EmptyState } from "@/components/feedback/EmptyState";
import { InlineLoader } from "@/components/feedback/InlineLoader";
import { PageIntro } from "@/components/layout/PageIntro";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Card } from "@/components/ui/Card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import {
  setup2FA,
  verify2FA,
  disable2FA,
  get2FAStatus,
  changePassword,
  updateProfile
} from "@/lib/api/settings";
import { listApiKeys, createApiKey, revokeApiKey } from "@/lib/api/v1/apiKeys";
import type { ApiKeyListItem } from "@/lib/api/v1/apiKeys";

export default function Settings() {
  const { user, checkAuthStatus } = useAuth();
  const configQuery = useAppConfig();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("profile");

  return (
    <div className="page-grid flex-1 overflow-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <PageIntro
          icon={SettingsIcon}
          eyebrow="Control Center"
          title="Security, profile, and workspace preferences in one place"
          description="Adjust the settings that define how your account works, how your team workspace is formatted, and how external tools can connect."
          stats={[
            { label: "Signed in as", value: user?.email || "Unknown" },
            { label: "Auth provider", value: user?.authProvider === "google" ? "Google" : "Email" },
            { label: "Workspace plan", value: configQuery.data?.entitlements?.plan || "free" },
          ]}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 rounded-[calc(var(--radius)-4px)] border border-border/70 bg-card/85 p-1">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">Profile</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="api-keys" className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            <span className="hidden sm:inline">API Keys</span>
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center gap-2">
            <SettingsIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Preferences</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4 mt-6">
          <ProfileSection user={user} toast={toast} checkAuthStatus={checkAuthStatus} />
        </TabsContent>

        <TabsContent value="security" className="space-y-4 mt-6">
          <SecuritySection user={user} toast={toast} queryClient={queryClient} />
        </TabsContent>

        <TabsContent value="api-keys" className="space-y-4 mt-6">
          <ApiKeysSection toast={toast} queryClient={queryClient} />
        </TabsContent>

        <TabsContent value="preferences" className="space-y-4 mt-6">
          <PreferencesSection configQuery={configQuery} toast={toast} queryClient={queryClient} />
        </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Profile Section ────────────────────────────────────

function ProfileSection({ user, toast, checkAuthStatus }: any) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateProfile({ name, email, phoneNumber });
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
      setIsEditing(false);
      await checkAuthStatus(); // Refresh user context without full reload
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setName(user?.name || "");
    setEmail(user?.email || "");
    setPhoneNumber(user?.phoneNumber || "");
    setIsEditing(false);
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Profile Information</h2>
          <p className="text-sm text-muted-foreground">Update your personal information</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isEditing}
              placeholder="Your name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!isEditing}
              placeholder="your.email@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={!isEditing}
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div className="space-y-2">
            <Label>Authentication Provider</Label>
            <div className="flex items-center gap-2">
              <Badge variant={user?.authProvider === "google" ? "default" : "secondary"}>
                {user?.authProvider === "google" ? "Google" : "Email"}
              </Badge>
              {user?.isEmailVerified && (
                <Badge variant="outline" className="text-green-600 border-green-600">
                  Verified
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)}>Edit Profile</Button>
          ) : (
            <>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
              <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Security Section ───────────────────────────────────

function SecuritySection({ user, toast, queryClient }: any) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const { data: twoFactorStatus, isLoading: isLoadingStatus } = useQuery({
    queryKey: ["2fa-status"],
    queryFn: get2FAStatus,
  });

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: "Error",
        description: "Password must be at least 8 characters long",
        variant: "destructive",
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to change password",
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const canChangePassword = user?.authProvider === "email";

  return (
    <div className="space-y-4">
      {canChangePassword && (
        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Change Password</h2>
              <p className="text-sm text-muted-foreground">Update your account password</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <div className="relative">
                  <Input
                    id="current-password"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
              </div>
            </div>

            <Button
              onClick={handleChangePassword}
              disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
            >
              {isChangingPassword ? "Changing..." : "Change Password"}
            </Button>
          </div>
        </Card>
      )}

      <TwoFactorSection
        enabled={twoFactorStatus?.enabled || false}
        isLoading={isLoadingStatus}
        toast={toast}
        queryClient={queryClient}
      />
    </div>
  );
}

// ─── Two-Factor Authentication ──────────────────────────

function TwoFactorSection({ enabled, isLoading, toast, queryClient }: any) {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupData, setSetupData] = useState<any>(null);
  const [verifyToken, setVerifyToken] = useState("");
  const [disableToken, setDisableToken] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);

  const handleSetup = async () => {
    setIsSettingUp(true);
    try {
      const data = await setup2FA();
      setSetupData(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to setup 2FA",
        variant: "destructive",
      });
      setIsSettingUp(false);
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      const result = await verify2FA(verifyToken);
      setBackupCodes(result.backup_codes || []);
      toast({
        title: "2FA Enabled",
        description: "Two-factor authentication has been enabled successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
      setVerifyToken("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to verify token",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisable = async () => {
    setIsDisabling(true);
    try {
      await disable2FA(disableToken);
      toast({
        title: "2FA Disabled",
        description: "Two-factor authentication has been disabled.",
      });
      queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
      setShowDisableDialog(false);
      setDisableToken("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to disable 2FA",
        variant: "destructive",
      });
    } finally {
      setIsDisabling(false);
    }
  };

  const handleCancelSetup = () => {
    setSetupData(null);
    setIsSettingUp(false);
    setVerifyToken("");
  };

  if (isLoading) {
    return (
      <Card className="surface-panel p-6">
        <InlineLoader label="Loading two-factor authentication status..." className="py-4" />
      </Card>
    );
  }

  if (backupCodes.length > 0) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Backup Codes</h2>
            <p className="text-sm text-muted-foreground">
              Save these codes in a secure location. You can use them to access your account if you lose your
              authenticator device.
            </p>
          </div>
          <div className="bg-muted p-4 rounded-md font-mono text-sm space-y-1">
            {backupCodes.map((code, idx) => (
              <div key={idx}>{code}</div>
            ))}
          </div>
          <Button onClick={() => setBackupCodes([])}>Continue</Button>
        </div>
      </Card>
    );
  }

  if (setupData && !enabled) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Setup Two-Factor Authentication</h2>
            <p className="text-sm text-muted-foreground">
              Scan the QR code with your authenticator app (like Google Authenticator or Authy)
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-md">
            <img
              src={`https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(setupData.uri)}&choe=UTF-8`}
              alt="2FA QR Code"
              className="w-48 h-48"
            />
            <div className="text-xs text-gray-500 text-center">
              <p>Can't scan? Enter this key manually:</p>
              <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded select-all">
                {setupData.secret || setupData.uri?.match(/secret=([^&]+)/)?.[1] || ""}
              </code>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="verify-token">Verification Code</Label>
            <Input
              id="verify-token"
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
              placeholder="Enter 6-digit code"
              maxLength={6}
            />
          </div>

          <div className="flex gap-3">
            <Button onClick={handleVerify} disabled={isVerifying || verifyToken.length !== 6}>
              {isVerifying ? "Verifying..." : "Verify & Enable"}
            </Button>
            <Button variant="outline" onClick={handleCancelSetup}>
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (enabled && !showDisableDialog) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Two-Factor Authentication</h2>
              <p className="text-sm text-muted-foreground">2FA is currently enabled for your account</p>
            </div>
            <Badge className="bg-green-600">Enabled</Badge>
          </div>
          <Button variant="destructive" onClick={() => setShowDisableDialog(true)}>
            Disable 2FA
          </Button>
        </div>
      </Card>
    );
  }

  if (showDisableDialog) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Disable Two-Factor Authentication</h2>
            <p className="text-sm text-muted-foreground">
              Enter a verification code from your authenticator app to disable 2FA
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="disable-token">Verification Code</Label>
            <Input
              id="disable-token"
              value={disableToken}
              onChange={(e) => setDisableToken(e.target.value)}
              placeholder="Enter 6-digit code"
              maxLength={6}
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="destructive"
              onClick={handleDisable}
              disabled={isDisabling || disableToken.length !== 6}
            >
              {isDisabling ? "Disabling..." : "Disable 2FA"}
            </Button>
            <Button variant="outline" onClick={() => setShowDisableDialog(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Two-Factor Authentication</h2>
          <p className="text-sm text-muted-foreground">
            Add an extra layer of security to your account by requiring a verification code in addition to your
            password
          </p>
        </div>
        <Button onClick={handleSetup} disabled={isSettingUp}>
          {isSettingUp ? "Setting up..." : "Enable 2FA"}
        </Button>
      </div>
    </Card>
  );
}

// ─── API Keys Section ───────────────────────────────────

function ApiKeysSection({ toast, queryClient }: any) {
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeySecret, setNewKeySecret] = useState("");

  const { data: apiKeysData, isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: listApiKeys,
  });

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name for the API key",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await createApiKey({ name: newKeyName, scopes: ["read", "write"] });
      setNewKeySecret(result.api_key);
      setNewKeyName("");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({
        title: "API Key Created",
        description: "Your API key has been created successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create API key",
        variant: "destructive",
      });
    }
  };

  const handleRevokeKey = async (keyId: string, keyName: string) => {
    if (!confirm(`Are you sure you want to revoke the API key "${keyName}"?`)) {
      return;
    }

    try {
      await revokeApiKey(keyId);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast({
        title: "API Key Revoked",
        description: "The API key has been revoked successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to revoke API key",
        variant: "destructive",
      });
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast({
      title: "Copied",
      description: "API key copied to clipboard",
    });
  };

  if (newKeySecret) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Your New API Key</h2>
            <p className="text-sm text-muted-foreground">
              Make sure to copy your API key now. You won't be able to see it again!
            </p>
          </div>

          <div className="bg-muted p-4 rounded-md font-mono text-sm break-all">{newKeySecret}</div>

          <div className="flex gap-3">
            <Button onClick={() => handleCopyKey(newKeySecret)}>
              <Copy className="w-4 h-4 mr-2" />
              Copy to Clipboard
            </Button>
            <Button variant="outline" onClick={() => setNewKeySecret("")}>
              Done
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="surface-panel p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Create New API Key</h2>
            <p className="text-sm text-muted-foreground">
              API keys allow you to access the API programmatically
            </p>
          </div>

          <div className="flex gap-3">
            <Input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="API key name (e.g., Production App)"
              className="flex-1"
            />
            <Button onClick={handleCreateKey} disabled={!newKeyName.trim()}>
              Create Key
            </Button>
          </div>
        </div>
      </Card>

      <Card className="surface-panel p-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Your API Keys</h2>
            <p className="text-sm text-muted-foreground">Manage your existing API keys</p>
          </div>

          {isLoading ? (
            <InlineLoader label="Loading API keys..." className="py-6" />
          ) : !apiKeysData?.api_keys || apiKeysData.api_keys.length === 0 ? (
            <EmptyState
              title="No API keys yet"
              description="Create a key when you are ready to automate against the API. You can revoke any key here later."
              icon={Key}
            />
          ) : (
            <div className="space-y-3">
              {apiKeysData.api_keys.map((key: ApiKeyListItem) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium text-foreground">{key.name}</div>
                    <div className="text-sm text-muted-foreground font-mono">{key.prefix}...</div>
                    {key.last_used_at && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Last used: {new Date(key.last_used_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {key.revoked_at ? (
                      <Badge variant="destructive">Revoked</Badge>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRevokeKey(key.id, key.name)}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── Preferences Section ────────────────────────────────

const CURRENCIES = [
  { value: "INR", label: "₹ INR — Indian Rupee" },
  { value: "USD", label: "$ USD — US Dollar" },
  { value: "EUR", label: "€ EUR — Euro" },
  { value: "GBP", label: "£ GBP — British Pound" },
  { value: "JPY", label: "¥ JPY — Japanese Yen" },
  { value: "AUD", label: "A$ AUD — Australian Dollar" },
  { value: "CAD", label: "C$ CAD — Canadian Dollar" },
  { value: "SGD", label: "S$ SGD — Singapore Dollar" },
  { value: "AED", label: "د.إ AED — UAE Dirham" },
  { value: "CHF", label: "CHF — Swiss Franc" },
];

const LOCALES = [
  { value: "en-IN", label: "English (India)" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-AU", label: "English (Australia)" },
  { value: "hi-IN", label: "Hindi (India)" },
  { value: "de-DE", label: "German (Germany)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "ja-JP", label: "Japanese (Japan)" },
  { value: "zh-CN", label: "Chinese (China)" },
];

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST, UTC+5:30)" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "America/New_York (EST)" },
  { value: "America/Chicago", label: "America/Chicago (CST)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST)" },
  { value: "Europe/London", label: "Europe/London (GMT)" },
  { value: "Europe/Berlin", label: "Europe/Berlin (CET)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
];

function PreferencesSection({ configQuery, toast, queryClient }: any) {
  const org = configQuery.data?.org;
  const [currency, setCurrency] = useState(org?.currency || "USD");
  const [locale, setLocale] = useState(org?.locale || "en-US");
  const [timezone, setTimezone] = useState(org?.timezone || "UTC");
  const [isSaving, setIsSaving] = useState(false);

  const orgId = org?.id;
  const hasChanges =
    currency !== (org?.currency || "USD") ||
    locale !== (org?.locale || "en-US") ||
    timezone !== (org?.timezone || "UTC");

  const handleSave = async () => {
    if (!orgId) {
      toast({ title: "Error", description: "No organization context found.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const { apiClient } = await import("@/lib/api/core");
      await apiClient(`/v1/orgs/${orgId}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ currency, locale, timezone }),
      });
      toast({ title: "Preferences saved", description: "Your currency, locale, and timezone have been updated." });
      await queryClient.invalidateQueries({ queryKey: ["/api/config/me"] });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save preferences", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="p-6">
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Preferences</h2>
            <p className="text-sm text-muted-foreground">
              Customize your currency, locale, and timezone
            </p>
          </div>

          <div className="rounded-[calc(var(--radius)-8px)] border border-border/70 bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">Theme</div>
                <p className="text-xs text-muted-foreground">
                  Switch between a bright light workspace and a pure black focus mode.
                </p>
              </div>
              <ThemeToggle />
            </div>
          </div>

          <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Used for formatting amounts across the app
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="locale">Locale</Label>
            <select
              id="locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {LOCALES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Controls number and date formatting
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Used for calendar and scheduling features
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? "Saving..." : "Save Preferences"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
