import { useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Gauge,
  PieChart,
  LogOut,
  Moon,
  Sun,
  ListChecks,
  ListTodo,
  MessageSquare,
  FileText,
  ReceiptText,
  ScanLine,
  Target,
  TrendingUp,
  StickyNote,
  CreditCard,
  Building2,
  Workflow,
  Download,
  Wallet,
  BookOpen,
  Menu,
  X,
  Settings,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useTheme } from "./ThemeProvider";
import { Button } from "@/components/ui/Button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/Avatar";
import { reportClientError } from "@/lib/runtimeLogger";
import { useIsMobile } from "@/hooks/use-mobile";

type NavigationItem = {
  href: string;
  icon: any;
  label: string;
  /** If set, only show when this feature flag is truthy. */
  requiresFeature?: "tasks_enabled" | "receipts_ocr_enabled" | "journal_enabled";
  /** Items pinned to the mobile bottom bar. Max 5 recommended. */
  mobilePin?: boolean;
};

// Navigation items — `mobilePin: true` puts key items in the bottom bar on mobile.
const navigationItems: NavigationItem[] = [
  { href: "/chat", icon: MessageSquare, label: "AI Chat", mobilePin: true },
  { href: "/dashboard", icon: Gauge, label: "Strategist's Desk", mobilePin: true },
  { href: "/tasks", icon: ListTodo, label: "Tasks", requiresFeature: "tasks_enabled" },
  { href: "/onboarding", icon: Brain, label: "Onboarding" },
  { href: "/goals-debts", icon: Target, label: "Goals & Debts" },
  { href: "/transactions", icon: ReceiptText, label: "Transactions", mobilePin: true },
  { href: "/finance", icon: Wallet, label: "Finance OS", mobilePin: true },
  { href: "/exports", icon: Download, label: "Exports" },
  { href: "/workflows", icon: Workflow, label: "Workflows" },
  { href: "/receipts", icon: ScanLine, label: "Receipts", requiresFeature: "receipts_ocr_enabled" },
  { href: "/portfolio", icon: PieChart, label: "Investment Portfolio" },
  { href: "/all-insights", icon: ListChecks, label: "All Insights" },
  { href: "/org", icon: Building2, label: "Organization" },
  { href: "/billing", icon: CreditCard, label: "Billing" },
  { href: "/blogs", icon: FileText, label: "Blogs" },
  { href: "/growth-stories", icon: TrendingUp, label: "Growth Stories" },
  { href: "/docs", icon: BookOpen, label: "Documentation" },
  { href: "/notes", icon: StickyNote, label: "Note Taking", requiresFeature: "journal_enabled" },
  { href: "/settings", icon: Settings, label: "Settings", mobilePin: true },
];

// ─── Desktop Sidebar ────────────────────────────────────

function DesktopSidebar({
  visibleNavItems,
  location,
  user,
  planLabel,
  theme,
  toggleTheme,
  handleLogout,
}: {
  visibleNavItems: NavigationItem[];
  location: string;
  user: any;
  planLabel: string;
  theme: string;
  toggleTheme: () => void;
  handleLogout: () => void;
}) {
  return (
    <aside
      className="hidden lg:flex w-80 bg-card border-r border-border flex-col flex-shrink-0"
      data-testid="sidebar"
    >
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Link
            href="/dashboard"
            className="flex items-center space-x-3 cursor-pointer no-underline"
            data-testid="brand-logo"
          >
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Brain className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Personal Finance</h1>
              <p className="text-xs text-muted-foreground">AI Financial Strategist</p>
            </div>
          </Link>
        </motion.div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-6 space-y-2 overflow-y-auto" data-testid="navigation">
        {visibleNavItems.map((item, index) => {
          const isActive = location === item.href || location.startsWith(`${item.href}/`);
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Link
                href={item.href}
                className={`flex items-center space-x-3 p-3 rounded-lg transition-colors cursor-pointer no-underline ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                aria-current={isActive ? "page" : undefined}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            </motion.div>
          );
        })}
      </nav>

      {/* Theme */}
      <div className="p-6 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="w-full justify-start"
          data-testid="button-theme-toggle"
        >
          {theme === "dark" ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </Button>
      </div>

      {/* User */}
      <div className="p-6 border-t border-border">
        <div className="flex items-center space-x-3" data-testid="user-profile">
          <Avatar className="w-10 h-10">
            <AvatarImage src={user?.photoURL || ""} alt={user?.name || ""} />
            <AvatarFallback>{user?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="font-medium text-sm text-foreground">{user?.name || "User"}</div>
            <div className="text-xs text-muted-foreground">{planLabel}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}

// ─── Mobile Bottom Bar ──────────────────────────────────

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
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border"
      data-testid="mobile-bottom-bar"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around px-2 h-16">
        {pinnedItems.map((item) => {
          const isActive = location === item.href || location.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full no-underline transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-tight">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
        {/* "More" / hamburger menu */}
        <button
          onClick={onMenuOpen}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-muted-foreground"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-tight">More</span>
        </button>
      </div>
    </nav>
  );
}

// ─── Mobile Drawer ──────────────────────────────────────

function MobileDrawer({
  isOpen,
  onClose,
  visibleNavItems,
  location,
  user,
  planLabel,
  theme,
  toggleTheme,
  handleLogout,
}: {
  isOpen: boolean;
  onClose: () => void;
  visibleNavItems: NavigationItem[];
  location: string;
  user: any;
  planLabel: string;
  theme: string;
  toggleTheme: () => void;
  handleLogout: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="lg:hidden fixed top-0 left-0 bottom-0 z-50 w-80 max-w-[85vw] bg-card border-r border-border flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <Link
                href="/dashboard"
                onClick={onClose}
                className="flex items-center space-x-3 no-underline"
              >
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Brain className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="text-lg font-semibold text-foreground">FinWise</span>
              </Link>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              {visibleNavItems.map((item) => {
                const isActive = location === item.href || location.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center space-x-3 p-3 rounded-lg transition-colors cursor-pointer no-underline ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium text-sm">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-border space-y-3">
              <Button variant="ghost" size="sm" onClick={toggleTheme} className="w-full justify-start">
                {theme === "dark" ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </Button>

              <div className="flex items-center space-x-3">
                <Avatar className="w-9 h-9">
                  <AvatarImage src={user?.photoURL || ""} alt={user?.name || ""} />
                  <AvatarFallback>{user?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground truncate">{user?.name || "User"}</div>
                  <div className="text-xs text-muted-foreground">{planLabel}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Exported Sidebar Component ─────────────────────────

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const configQuery = useAppConfig({ enabled: !!user });
  const features = configQuery.data?.features;
  const planTier = configQuery.data?.entitlements?.plan || "free";
  const planLabel =
    configQuery.isLoading ? "Loading plan…" : configQuery.data?.entitlements ? `${planTier} plan` : "free plan";
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const visibleNavItems = navigationItems.filter((item) => {
    if (!item.requiresFeature) return true;
    return features ? Boolean((features as any)[item.requiresFeature]) : true;
  });

  const pinnedItems = visibleNavItems.filter((item) => item.mobilePin);

  const handleLogout = useCallback(async () => {
    try {
      setDrawerOpen(false);
      await logout();
    } catch (error) {
      reportClientError("Logout failed", error);
    }
  }, [logout]);

  const sharedProps = {
    visibleNavItems,
    location,
    user,
    planLabel,
    theme,
    toggleTheme,
    handleLogout,
  };

  return (
    <>
      {/* Desktop: classic sidebar */}
      <DesktopSidebar {...sharedProps} />

      {/* Mobile: bottom bar + slide-out drawer */}
      {isMobile && (
        <>
          <MobileBottomBar pinnedItems={pinnedItems} location={location} onMenuOpen={() => setDrawerOpen(true)} />
          <MobileDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} {...sharedProps} />
        </>
      )}
    </>
  );
}
