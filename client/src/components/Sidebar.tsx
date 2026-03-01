import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
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
  BookOpen
} 
from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useTheme } from "./ThemeProvider";
import { Button } from "@/components/ui/Button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/Avatar";
import { reportClientError } from "@/lib/runtimeLogger";

type NavigationItem = {
  href: string;
  icon: any;
  label: string;
  requiresFeature?: "tasks_enabled" | "receipts_ocr_enabled" | "journal_enabled";
};

// Navigation items including new features
const navigationItems: NavigationItem[] = [
  { href: "/chat", icon: MessageSquare, label: "AI Chat" },
  { href: "/dashboard", icon: Gauge, label: "Strategist's Desk" },
  { href: "/tasks", icon: ListTodo, label: "Tasks", requiresFeature: "tasks_enabled" },
  { href: "/onboarding", icon: Brain, label: "Onboarding" },
  { href: "/goals-debts", icon: Target, label: "Goals & Debts" },
  { href: "/transactions", icon: ReceiptText, label: "Transactions" },
  { href: "/finance", icon: Wallet, label: "Finance OS" },
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
];

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const configQuery = useAppConfig({ enabled: !!user });
  const features = configQuery.data?.features;
  const planTier = configQuery.data?.entitlements?.plan || "free";
  const planLabel =
    configQuery.isLoading ? "Loading plan…" : configQuery.data?.entitlements ? `${planTier} plan` : "free plan";
  const visibleNavItems = navigationItems.filter((item) => {
    if (!item.requiresFeature) return true;
    return features ? Boolean((features as any)[item.requiresFeature]) : true;
  });

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      reportClientError("Logout failed", error);
    }
  };

  return (
    <aside
      className="w-80 bg-card border-r border-border flex flex-col"
      data-testid="sidebar"
    >
      {/* Logo and Brand */}
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

      {/* Navigation Menu */}
      <nav className="flex-1 p-6 space-y-2 overflow-y-auto" data-testid="navigation">
        {visibleNavItems.map((item, index) => { 
          const isActive = location === item.href || location.startsWith(`${item.href}/`);

          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
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
                data-testid={`nav-${item.label
                  .toLowerCase()
                  .replace(/\s/g, "-")}`}
                aria-current={isActive ? "page" : undefined}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            </motion.div>
          );
        })}
      </nav>

      {/* Theme Toggle */}
      <div className="p-6 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="w-full justify-start"
          data-testid="button-theme-toggle"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 mr-2" />
          ) : (
            <Moon className="w-4 h-4 mr-2" />
          )}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </Button>
      </div>

      {/* User Profile */}
      <div className="p-6 border-t border-border">
        <div className="flex items-center space-x-3" data-testid="user-profile">
          <Avatar className="w-10 h-10">
            <AvatarImage src={user?.photoURL || ""} alt={user?.name || ""} />
            <AvatarFallback>
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="font-medium text-sm text-foreground">{user?.name || "User"}</div>
            <div className="text-xs text-muted-foreground">{planLabel}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
