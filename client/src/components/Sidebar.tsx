import { useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  Building2,
  CalendarDays,
  CreditCard,
  Download,
  FileText,
  Gauge,
  ListTodo,
  LogOut,
  Menu,
  MessageSquare,
  PieChart,
  ReceiptText,
  ScanLine,
  Settings,
  StickyNote,
  Target,
  TrendingUp,
  Wallet,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";

import { NotificationCenter, NotificationBell } from "@/components/NotificationCenter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useNotifications } from "@/hooks/useNotifications";
import { useIsMobile } from "@/hooks/use-mobile";
import { reportClientError } from "@/lib/runtimeLogger";

type NavigationSectionId = "daily" | "planning" | "workspace" | "library";

type NavigationItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  section: NavigationSectionId;
  requiresFeature?: "tasks_enabled" | "receipts_ocr_enabled" | "journal_enabled";
  mobilePin?: boolean;
};

type GroupedNavigationSection = {
  id: NavigationSectionId;
  label: string;
  description: string;
  items: NavigationItem[];
};

const navigationSections: Omit<GroupedNavigationSection, "items">[] = [
  {
    id: "daily",
    label: "Daily flow",
    description: "The tools you will likely reach for first.",
  },
  {
    id: "planning",
    label: "Planning",
    description: "Where strategy, goals, and forecasting live.",
  },
  {
    id: "workspace",
    label: "Workspace",
    description: "Operations, admin, and team-level controls.",
  },
  {
    id: "library",
    label: "Library",
    description: "Reference material and long-form learning.",
  },
];

const navigationItems: NavigationItem[] = [
  { href: "/chat", icon: MessageSquare, label: "AI Chat", section: "daily", mobilePin: true },
  { href: "/dashboard", icon: Gauge, label: "Strategist's Desk", section: "daily", mobilePin: true },
  { href: "/transactions", icon: ReceiptText, label: "Transactions", section: "daily", mobilePin: true },
  { href: "/finance", icon: Wallet, label: "Finance OS", section: "daily", mobilePin: true },
  { href: "/tasks", icon: ListTodo, label: "Tasks", section: "daily", requiresFeature: "tasks_enabled" },
  { href: "/goals-debts", icon: Target, label: "Goals & Debts", section: "planning" },
  { href: "/portfolio", icon: PieChart, label: "Investment Portfolio", section: "planning" },
  { href: "/all-insights", icon: BarChart3, label: "All Insights", section: "planning" },
  { href: "/analytics", icon: BarChart3, label: "Analytics", section: "planning" },
  { href: "/calendar", icon: CalendarDays, label: "Calendar", section: "planning" },
  { href: "/activity", icon: Activity, label: "Activity Feed", section: "planning" },
  { href: "/onboarding", icon: Brain, label: "Onboarding", section: "workspace" },
  { href: "/workflows", icon: Workflow, label: "Workflows", section: "workspace" },
  { href: "/exports", icon: Download, label: "Exports", section: "workspace" },
  { href: "/receipts", icon: ScanLine, label: "Receipts", section: "workspace", requiresFeature: "receipts_ocr_enabled" },
  { href: "/org", icon: Building2, label: "Organization", section: "workspace" },
  { href: "/billing", icon: CreditCard, label: "Billing", section: "workspace" },
  { href: "/settings", icon: Settings, label: "Settings", section: "workspace", mobilePin: true },
  { href: "/blogs", icon: FileText, label: "Blogs", section: "library" },
  { href: "/growth-stories", icon: TrendingUp, label: "Growth Stories", section: "library" },
  { href: "/docs", icon: BookOpen, label: "Documentation", section: "library" },
  { href: "/notes", icon: StickyNote, label: "Note Taking", section: "library", requiresFeature: "journal_enabled" },
];

function BrandBlock({
  planLabel,
  onNotificationsOpen,
  notificationUnreadCount,
}: {
  planLabel: string;
  onNotificationsOpen: () => void;
  notificationUnreadCount: number;
}) {
  return (
    <div className="rounded-[calc(var(--radius)+6px)] border border-border/70 bg-gradient-to-br from-primary/14 via-card to-chart-2/10 p-4 shadow-[0_18px_45px_-34px_rgba(15,23,42,0.7)]">
      <div className="flex items-start justify-between gap-3">
        <Link href="/dashboard" className="flex items-center gap-3 no-underline">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Personal Finance</h1>
            <p className="text-xs text-muted-foreground">AI strategist workspace</p>
          </div>
        </Link>
        <NotificationBell onClick={onNotificationsOpen} unreadCount={notificationUnreadCount} />
      </div>

      <div className="mt-4 rounded-2xl border border-border/60 bg-background/75 px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Active workspace
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">{planLabel}</p>
      </div>
    </div>
  );
}

function NavigationSections({
  groupedNavItems,
  location,
  onNavigate,
}: {
  groupedNavItems: GroupedNavigationSection[];
  location: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-6">
      {groupedNavItems.map((section) => (
        <section key={section.id} className="space-y-3">
          <div className="px-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {section.label}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground/90">
              {section.description}
            </p>
          </div>

          <div className="space-y-1.5">
            {section.items.map((item, index) => {
              const isActive = location === item.href || location.startsWith(`${item.href}/`);

              return (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04 }}
                >
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={`group flex items-center gap-3 rounded-[calc(var(--radius)-4px)] border px-3 py-3 no-underline transition-all duration-200 ${
                      isActive
                        ? "border-primary/30 bg-primary text-primary-foreground shadow-[0_18px_32px_-24px_rgba(255,255,255,0.24)]"
                        : "border-transparent text-foreground hover:border-border/70 hover:bg-accent/70 hover:shadow-[0_14px_26px_-22px_rgba(15,23,42,0.45)]"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                    data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-colors ${
                        isActive
                          ? "bg-white/15 text-primary-foreground"
                          : "bg-background/80 text-primary group-hover:bg-primary/10"
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.label}</p>
                      <p
                        className={`truncate text-xs ${
                          isActive ? "text-primary-foreground/75" : "text-muted-foreground"
                        }`}
                      >
                        {section.label}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function UserPanel({
  user,
  planLabel,
  handleLogout,
}: {
  user: any;
  planLabel: string;
  handleLogout: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-[calc(var(--radius)-2px)] border border-border/70 bg-card/85 p-3">
        <Avatar className="h-11 w-11">
          <AvatarImage src={user?.photoURL || ""} alt={user?.name || ""} />
          <AvatarFallback>{user?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{user?.name || "User"}</div>
          <div className="truncate text-xs text-muted-foreground">{planLabel}</div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="rounded-2xl"
          onClick={handleLogout}
          data-testid="button-logout"
          aria-label="Log out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function DesktopSidebar({
  groupedNavItems,
  location,
  user,
  planLabel,
  handleLogout,
  onNotificationsOpen,
  notificationUnreadCount,
}: {
  groupedNavItems: GroupedNavigationSection[];
  location: string;
  user: any;
  planLabel: string;
  handleLogout: () => void;
  onNotificationsOpen: () => void;
  notificationUnreadCount: number;
}) {
  return (
    <aside
      className="hidden w-[22rem] shrink-0 border-r border-sidebar-border/80 bg-sidebar/85 lg:flex lg:flex-col lg:backdrop-blur-xl"
      data-testid="sidebar"
    >
      <div className="border-b border-sidebar-border/70 p-5">
        <BrandBlock
          planLabel={planLabel}
          onNotificationsOpen={onNotificationsOpen}
          notificationUnreadCount={notificationUnreadCount}
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-5" data-testid="navigation">
        <NavigationSections groupedNavItems={groupedNavItems} location={location} />
      </nav>

      <div className="border-t border-sidebar-border/70 p-4">
        <UserPanel
          user={user}
          planLabel={planLabel}
          handleLogout={handleLogout}
        />
      </div>
    </aside>
  );
}

function MobileBottomBar({
  pinnedItems,
  location,
  onMenuOpen,
}: {
  pinnedItems: NavigationItem[];
  location: string;
  onMenuOpen: () => void;
}) {
  return (
    <nav
      className="fixed bottom-3 left-3 right-3 z-50 rounded-[calc(var(--radius)+6px)] border border-border/70 bg-card/92 shadow-[0_22px_50px_-30px_rgba(15,23,42,0.7)] backdrop-blur-xl lg:hidden"
      data-testid="mobile-bottom-bar"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex h-16 items-center justify-between px-2">
        {pinnedItems.map((item) => {
          const isActive = location === item.href || location.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex h-full flex-1 flex-col items-center justify-center gap-1 rounded-2xl no-underline transition-colors ${
                isActive ? "bg-primary/12 text-primary" : "text-muted-foreground"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-semibold leading-tight">
                {item.label.split(" ")[0]}
              </span>
            </Link>
          );
        })}

        <button
          onClick={onMenuOpen}
          className="flex h-full flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-muted-foreground transition-colors hover:bg-accent/70"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-semibold leading-tight">More</span>
        </button>
      </div>
    </nav>
  );
}

function MobileDrawer({
  isOpen,
  onClose,
  groupedNavItems,
  location,
  user,
  planLabel,
  handleLogout,
  onNotificationsOpen,
  notificationUnreadCount,
}: {
  isOpen: boolean;
  onClose: () => void;
  groupedNavItems: GroupedNavigationSection[];
  location: string;
  user: any;
  planLabel: string;
  handleLogout: () => void;
  onNotificationsOpen: () => void;
  notificationUnreadCount: number;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm lg:hidden"
            onClick={onClose}
          />

          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed inset-y-0 left-0 z-50 flex w-[22rem] max-w-[88vw] flex-col overflow-hidden border-r border-sidebar-border/80 bg-sidebar/95 backdrop-blur-xl lg:hidden"
          >
            <div className="border-b border-sidebar-border/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <BrandBlock
                  planLabel={planLabel}
                  onNotificationsOpen={onNotificationsOpen}
                  notificationUnreadCount={notificationUnreadCount}
                />
                <button
                  onClick={onClose}
                  className="mt-1 rounded-2xl border border-border/70 bg-background/80 p-2 text-muted-foreground"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-4 py-5">
              <NavigationSections
                groupedNavItems={groupedNavItems}
                location={location}
                onNavigate={onClose}
              />
            </nav>

            <div className="border-t border-sidebar-border/70 p-4">
              <UserPanel
                user={user}
                planLabel={planLabel}
                handleLogout={handleLogout}
              />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const configQuery = useAppConfig({ enabled: !!user });
  const features = configQuery.data?.features;
  const planTier = configQuery.data?.entitlements?.plan || "free";
  const planLabel = configQuery.isLoading
    ? "Loading plan..."
    : configQuery.data?.entitlements
      ? `${planTier} plan`
      : "free plan";
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { unreadCount: notificationUnreadCount } = useNotifications({ enabled: !!user });

  const visibleNavItems = useMemo(
    () =>
      navigationItems.filter((item) => {
        if (!item.requiresFeature) return true;
        return features ? Boolean((features as any)[item.requiresFeature]) : true;
      }),
    [features]
  );

  const groupedNavItems = useMemo(
    () =>
      navigationSections
        .map((section) => ({
          ...section,
          items: visibleNavItems.filter((item) => item.section === section.id),
        }))
        .filter((section) => section.items.length > 0),
    [visibleNavItems]
  );

  const pinnedItems = visibleNavItems.filter((item) => item.mobilePin).slice(0, 5);

  const handleLogout = useCallback(async () => {
    try {
      setDrawerOpen(false);
      await logout();
    } catch (error) {
      reportClientError("Logout failed", error);
    }
  }, [logout]);

  const sharedProps = {
    groupedNavItems,
    location,
    user,
    planLabel,
    handleLogout,
    onNotificationsOpen: () => setNotificationsOpen(true),
    notificationUnreadCount,
  };

  return (
    <>
      <DesktopSidebar {...sharedProps} />

      {isMobile && (
        <>
          <MobileBottomBar
            pinnedItems={pinnedItems}
            location={location}
            onMenuOpen={() => setDrawerOpen(true)}
          />
          <MobileDrawer
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            {...sharedProps}
          />
        </>
      )}

      <NotificationCenter isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </>
  );
}
