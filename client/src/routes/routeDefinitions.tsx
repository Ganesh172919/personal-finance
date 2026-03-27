import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export type AppRouteLayout = "app" | "chat" | "default";
export type AppRouteAccess = "protected" | "public" | "public-only";

export type AppRouteDefinition = {
  path: string;
  access: AppRouteAccess;
  layout?: AppRouteLayout;
  component: LazyExoticComponent<ComponentType<any>>;
};

export type RedirectRouteDefinition = {
  path: string;
  redirectTo: string;
};

const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Scenarios = lazy(() => import("@/pages/Scenarios"));
const FinancialStory = lazy(() => import("@/pages/FinancialStory"));
const SharedFinancialStory = lazy(() => import("@/pages/SharedFinancialStory"));
const Portfolio = lazy(() => import("@/pages/Portfolio"));
const AllInsights = lazy(() => import("@/pages/AllInsights"));
const Transactions = lazy(() => import("@/pages/Transactions"));
const FinanceOS = lazy(() => import("@/pages/FinanceOS"));
const GoalsAndDebts = lazy(() => import("@/pages/GoalsAndDebts"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Notes = lazy(() => import("@/pages/Notes"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const Receipts = lazy(() => import("@/pages/Receipts"));
const ChatPage = lazy(() => import("@/pages/ChatPage"));
const Billing = lazy(() => import("@/pages/Billing"));
const Organization = lazy(() => import("@/pages/Organization"));
const Exports = lazy(() => import("@/pages/Exports"));
const Workflows = lazy(() => import("@/pages/Workflows"));
const AcceptInvite = lazy(() => import("@/pages/AcceptInvite"));
const GrowthStories = lazy(() => import("@/pages/GrowthStories"));
const GrowthStoryDetail = lazy(() => import("@/pages/GrowthStoryDetail"));
const Blogs = lazy(() => import("@/pages/Blogs"));
const BlogDetail = lazy(() => import("@/pages/BlogDetail"));
const Documentation = lazy(() => import("@/pages/Documentation"));
const Files = lazy(() => import("@/pages/Files"));
const Settings = lazy(() => import("@/pages/Settings"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const FinancialCalendar = lazy(() => import("@/pages/FinancialCalendar"));
const ActivityFeed = lazy(() => import("@/pages/ActivityFeed"));

export const appRoutes: AppRouteDefinition[] = [
  { path: "/login", access: "public-only", component: Login },
  { path: "/register", access: "public-only", component: Register },
  { path: "/verify-email", access: "public-only", component: VerifyEmail },
  { path: "/accept-invite", access: "public", component: AcceptInvite },
  { path: "/share/financial-story/:token", access: "public", component: SharedFinancialStory },
  { path: "/chat", access: "protected", layout: "chat", component: ChatPage },
  { path: "/chat/:sessionId", access: "protected", layout: "chat", component: ChatPage },
  { path: "/dashboard", access: "protected", layout: "app", component: Dashboard },
  { path: "/scenarios", access: "protected", layout: "app", component: Scenarios },
  { path: "/financial-story", access: "protected", layout: "app", component: FinancialStory },
  { path: "/portfolio", access: "protected", layout: "app", component: Portfolio },
  { path: "/all-insights", access: "protected", layout: "app", component: AllInsights },
  { path: "/goals-debts", access: "protected", layout: "app", component: GoalsAndDebts },
  { path: "/transactions", access: "protected", layout: "app", component: Transactions },
  { path: "/finance", access: "protected", layout: "app", component: FinanceOS },
  { path: "/exports", access: "protected", layout: "app", component: Exports },
  { path: "/workflows", access: "protected", layout: "app", component: Workflows },
  { path: "/tasks", access: "protected", layout: "app", component: Tasks },
  { path: "/receipts", access: "protected", layout: "app", component: Receipts },
  { path: "/onboarding", access: "protected", layout: "app", component: Onboarding },
  { path: "/growth-stories", access: "protected", layout: "app", component: GrowthStories },
  { path: "/growth-stories/:slug", access: "protected", layout: "app", component: GrowthStoryDetail },
  { path: "/blogs", access: "protected", layout: "app", component: Blogs },
  { path: "/blogs/:slug", access: "protected", layout: "app", component: BlogDetail },
  { path: "/notes", access: "protected", layout: "app", component: Notes },
  { path: "/billing", access: "protected", layout: "app", component: Billing },
  { path: "/org", access: "protected", layout: "app", component: Organization },
  { path: "/docs", access: "protected", layout: "app", component: Documentation },
  { path: "/files", access: "protected", layout: "app", component: Files },
  { path: "/settings", access: "protected", layout: "app", component: Settings },
  { path: "/analytics", access: "protected", layout: "app", component: Analytics },
  { path: "/calendar", access: "protected", layout: "app", component: FinancialCalendar },
  { path: "/activity", access: "protected", layout: "app", component: ActivityFeed },
];

export const redirectRoutes: RedirectRouteDefinition[] = [
  { path: "/app", redirectTo: "/dashboard" },
  { path: "/home", redirectTo: "/dashboard" },
  { path: "/organization", redirectTo: "/org" },
  { path: "/documentation", redirectTo: "/docs" },
  { path: "/insights", redirectTo: "/all-insights" },
  { path: "/stories", redirectTo: "/growth-stories" },
];
