/**
 * @fileoverview Newsletter Settings Component
 *
 * Provides a UI for managing newsletter preferences:
 *   - Subscribe/Unsubscribe toggle
 *   - Delivery time picker
 *   - Timezone selector
 *   - Section toggles (7 checkboxes)
 *   - Preview button (opens rendered HTML in new tab)
 *   - Send Now button (triggers immediate send)
 *
 * Uses @tanstack/react-query for data fetching and mutations.
 * Uses existing UI components from @/components/ui/.
 *
 * MINDMAP FLOW
 * ------------
 * ```
 * NewsletterSettings React Component
 * ├── 1. Data Fetching (useQuery: ['newsletterPreferences'])
 * │   ├── Fetch preferences from API
 * │   └── Populate local state on success (isSubscribed, time, tz, toggles)
 * ├── 2. Local Form State & Dirty Tracking
 * │   ├── isSubscribed: master checkbox toggle
 * │   ├── deliveryTime: HH:mm input
 * │   ├── timezone: select menu
 * │   ├── contentPreferences: 7 section checkboxes
 * │   └── hasChanges calculation comparing local vs remote data
 * ├── 3. Mutations (useMutation)
 * │   ├── updateMutation: Saves preferences, invalidates query cache, shows toast
 * │   ├── sendNowMutation: Triggers immediate dispatch with progress toast
 * │   └── previewMutation: Fetches HTML and renders in safe preview window
 * └── 4. UI Layout & Accessibility
 *     ├── Master Toggle Banner with Subscribed Badge
 *     ├── Schedule Grid (Time & Timezone pickers)
 *     ├── Content Checkboxes Grid
 *     └── Action Bar (Save Changes, Preview, Send Test Now)
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +---------------------------------------------------------------+
 *   |               NewsletterSettings Component Mounts             |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |        useQuery(['newsletterPreferences']) Fetches Data       |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |      Sync Remote Data -> Local React State (useState)         |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |                  User Interacts with Controls                 |
 *   |  - Toggles sections, edits delivery time, changes timezone    |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *              [User Action Clicked in Action Bar]
 *                 /            |             \
 *                /             |              \
 *               v              v               v
 *        [Save Changes]    [Preview]      [Send Now]
 *              |               |               |
 *              v               v               v
 *        PUT /preferences  POST /preview  POST /send-now
 *              |               |               |
 *              v               v               v
 *        Query Cache       Open HTML      Success Toast
 *        Invalidated       in Tab         Notification
 *   +---------------------------------------------------------------+
 * ```
 *
 * @module components/NewsletterSettings
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Send, Eye, Clock, Globe } from "lucide-react";

import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { InlineLoader } from "@/components/feedback/InlineLoader";
import {
  getNewsletterPreferences,
  updateNewsletterPreferences,
  previewNewsletter,
  sendNewsletterNow,
} from "@/lib/api/newsletter";
import type {
  UpdateNewsletterPreferencesRequest,
  ContentPreferences,
} from "@/lib/api/newsletter";

// ─── Timezone List ────────────────────────────────────────

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

// ─── Section Toggle Definitions ───────────────────────────

const SECTION_TOGGLES: Array<{
  key: keyof ContentPreferences;
  label: string;
  description: string;
}> = [
  {
    key: "spending_summary",
    label: "Spending Summary",
    description: "Daily income, expenses, and top spending categories",
  },
  {
    key: "budget_alerts",
    label: "Budget Alerts",
    description: "Notifications when budgets are near or over their limit",
  },
  {
    key: "upcoming_bills",
    label: "Upcoming Bills",
    description: "Bills due within the next 7 days",
  },
  {
    key: "financial_tips",
    label: "Financial Tips",
    description: "AI-generated tips tailored to your spending patterns",
  },
  {
    key: "portfolio_news",
    label: "Portfolio News",
    description: "Updates on your investment portfolio performance",
  },
  {
    key: "weekly_health_score",
    label: "Weekly Health Score",
    description: "Your financial health score with key highlights",
  },
  {
    key: "actionable_recommendations",
    label: "Action Items",
    description: "Specific actions to improve your financial position",
  },
];

// ─── Main Component ───────────────────────────────────────

export default function NewsletterSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current preferences
  const {
    data: prefData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["newsletter-preferences"],
    queryFn: getNewsletterPreferences,
  });

  // Local form state
  const [isSubscribed, setIsSubscribed] = useState(true);
  const [deliveryTime, setDeliveryTime] = useState("07:00");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [contentPrefs, setContentPrefs] = useState<ContentPreferences>({
    spending_summary: true,
    budget_alerts: true,
    upcoming_bills: true,
    financial_tips: true,
    portfolio_news: true,
    weekly_health_score: true,
    actionable_recommendations: true,
  });

  // Sync local state with fetched data
  useEffect(() => {
    if (prefData?.preference) {
      const p = prefData.preference;
      setIsSubscribed(p.is_subscribed);
      setDeliveryTime(p.delivery_time);
      setTimezone(p.timezone);
      setContentPrefs(p.content_preferences);
    }
  }, [prefData]);

  // Track if there are unsaved changes
  const originalPref = prefData?.preference;
  const hasChanges = originalPref
    ? isSubscribed !== originalPref.is_subscribed ||
      deliveryTime !== originalPref.delivery_time ||
      timezone !== originalPref.timezone ||
      Object.keys(contentPrefs).some(
        (k) =>
          contentPrefs[k as keyof ContentPreferences] !==
          originalPref.content_preferences[k as keyof ContentPreferences]
      )
    : false;

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: UpdateNewsletterPreferencesRequest) =>
      updateNewsletterPreferences(data),
    onSuccess: () => {
      toast({
        title: "Preferences saved",
        description: "Your newsletter preferences have been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["newsletter-preferences"] });
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message || "Failed to update preferences",
        variant: "destructive",
      });
    },
  });

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: previewNewsletter,
    onSuccess: (data) => {
      // Open preview in a new tab
      const blob = new Blob([data.html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Clean up after a delay
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    onError: (err: any) => {
      toast({
        title: "Preview failed",
        description: err.message || "Could not generate newsletter preview",
        variant: "destructive",
      });
    },
  });

  // Send now mutation
  const sendMutation = useMutation({
    mutationFn: sendNewsletterNow,
    onSuccess: () => {
      toast({
        title: "Newsletter sent",
        description: "Your newsletter has been sent to your email.",
      });
      queryClient.invalidateQueries({ queryKey: ["newsletter-preferences"] });
    },
    onError: (err: any) => {
      toast({
        title: "Send failed",
        description: err.message || "Could not send newsletter",
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handleSave = () => {
    const body: UpdateNewsletterPreferencesRequest = {
      isSubscribed,
      deliveryTime,
      timezone,
      contentPreferences: {
        spendingSummary: contentPrefs.spending_summary,
        budgetAlerts: contentPrefs.budget_alerts,
        upcomingBills: contentPrefs.upcoming_bills,
        financialTips: contentPrefs.financial_tips,
        portfolioNews: contentPrefs.portfolio_news,
        weeklyHealthScore: contentPrefs.weekly_health_score,
        actionableRecommendations: contentPrefs.actionable_recommendations,
      },
    };
    updateMutation.mutate(body);
  };

  const toggleContentPref = (key: keyof ContentPreferences) => {
    setContentPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Loading state
  if (isLoading) {
    return (
      <Card className="surface-panel p-6">
        <InlineLoader label="Loading newsletter preferences..." className="py-4" />
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Failed to load newsletter preferences. Please try again.
          </p>
          <Button
            variant="outline"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["newsletter-preferences"] })
            }
          >
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Subscription Toggle */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isSubscribed ? (
              <Mail className="w-5 h-5 text-primary" />
            ) : (
              <Mail className="w-5 h-5 text-muted-foreground" />
            )}
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Daily Newsletter
              </h2>
              <p className="text-sm text-muted-foreground">
                {isSubscribed
                  ? "You are subscribed to the daily financial newsletter"
                  : "You are not currently receiving newsletters"}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Daily newsletter subscription"
            aria-checked={isSubscribed}
            onClick={() => setIsSubscribed(!isSubscribed)}
            className={`
              relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full
              border-2 border-transparent transition-colors duration-200
              ease-in-out focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-ring focus-visible:ring-offset-2
              ${isSubscribed ? "bg-primary" : "bg-input"}
            `}
          >
            <span
              className={`
                pointer-events-none inline-block h-5 w-5 rounded-full
                bg-background shadow-lg ring-0 transition-transform duration-200
                ease-in-out
                ${isSubscribed ? "translate-x-5" : "translate-x-0"}
              `}
            />
          </button>
        </div>

        {prefData?.preference?.last_sent_at && (
          <div className="mt-3 flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Last sent:{" "}
              {new Date(prefData.preference.last_sent_at).toLocaleString()}
            </Badge>
          </div>
        )}
      </Card>

      {/* Delivery Schedule */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Delivery Schedule
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="delivery-time">Delivery Time</Label>
            <Input
              id="delivery-time"
              type="time"
              value={deliveryTime}
              onChange={(e) => setDeliveryTime(e.target.value)}
              disabled={!isSubscribed}
            />
            <p className="text-xs text-muted-foreground">
              Time in your local timezone when the newsletter is delivered
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="newsletter-timezone" className="flex items-center gap-1">
              <Globe className="w-3 h-3" />
              Timezone
            </Label>
            <select
              id="newsletter-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={!isSubscribed}
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Content Sections */}
      <Card className="p-6">
        <h3 className="text-base font-semibold text-foreground mb-4">
          Newsletter Sections
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Choose which sections appear in your daily newsletter.
        </p>
        <div className="space-y-3">
          {SECTION_TOGGLES.map((section) => (
            <label
              key={section.key}
              className={`
                flex items-start gap-3 p-3 rounded-lg border cursor-pointer
                transition-colors
                ${
                  contentPrefs[section.key]
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-transparent"
                }
                ${!isSubscribed ? "opacity-50 pointer-events-none" : ""}
              `}
            >
              <input
                type="checkbox"
                checked={contentPrefs[section.key]}
                onChange={() => toggleContentPref(section.key)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <div>
                <div className="text-sm font-medium text-foreground">
                  {section.label}
                </div>
                <div className="text-xs text-muted-foreground">
                  {section.description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </Card>

      {/* Actions */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !hasChanges}
            className="flex-1"
          >
            {updateMutation.isPending ? "Saving..." : "Save Preferences"}
          </Button>
          <Button
            variant="outline"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending || !isSubscribed}
            className="flex items-center gap-2"
          >
            <Eye className="w-4 h-4" />
            {previewMutation.isPending ? "Generating..." : "Preview"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || !isSubscribed}
            className="flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {sendMutation.isPending ? "Sending..." : "Send Now"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
