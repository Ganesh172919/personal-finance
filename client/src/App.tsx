import { Suspense, lazy } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/Toaster";
import { TooltipProvider } from "@/components/ui/ToolTip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Sidebar } from "@/components/Sidebar";
import { FeatureLimitDialog } from "@/components/FeatureLimitDialog";
import { PlanAndUsageDialog } from "@/components/PlanAndUsageDialog";
import type { IFinancialProfile } from "@/types";

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
const GoalsAndDebts = lazy(() => import("@/pages/GoalsAndDebts"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const ComingSoon = lazy(() => import("@/pages/ComingSoon"));
const Notes = lazy(() => import("@/pages/Notes"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const Receipts = lazy(() => import("@/pages/Receipts"));
const ChatPage = lazy(() => import("@/pages/ChatPage"));
const Billing = lazy(() => import("@/pages/Billing"));
const Organization = lazy(() => import("@/pages/Organization"));
const Exports = lazy(() => import("@/pages/Exports"));
const Workflows = lazy(() => import("@/pages/Workflows"));
const AcceptInvite = lazy(() => import("@/pages/AcceptInvite"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  const { data: profile, isLoading: profileLoading } = useQuery<IFinancialProfile | null>({
    queryKey: ["/api/financial-profiles/me"],
    enabled: !!user,
  });

  if (loading || profileLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) return <Redirect to="/login" />;

  const localOnboardingCompleted = localStorage.getItem("onboarding_completed") === "true";
  const hasServerOnboardingField =
    !!profile && Object.prototype.hasOwnProperty.call(profile, "onboardingCompletedAt");
  const onboardingCompleted = hasServerOnboardingField
    ? Boolean(profile?.onboardingCompletedAt)
    : localOnboardingCompleted;

  if (!onboardingCompleted && location !== "/onboarding") {
    return <Redirect to="/onboarding" />;
  }

  return <>{children}</>;
}


function AppAuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-auto">
        {/* The child component (e.g., Dashboard) will render here */}
        {children}
      </div>
    </div>
  );
}

// Chat layout without traditional sidebar (uses own ChatHistorySidebar)
function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen h-screen flex flex-col bg-background">
      {children}
    </div>
  );
}

function Router() {
  const { user } = useAuth();
  return (
    <Suspense
      fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}
    >
      <Switch>
        {/* Public Routes - Accessible to everyone */}
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/accept-invite" component={AcceptInvite} />
        <Route path="/share/financial-story/:token" component={SharedFinancialStory} />

        {/* Chat Routes - Primary Interface */}
        <Route path="/chat"><ProtectedRoute><ChatLayout><ChatPage /></ChatLayout></ProtectedRoute></Route>
        <Route path="/chat/:sessionId"><ProtectedRoute><ChatLayout><ChatPage /></ChatLayout></ProtectedRoute></Route>

        {/* Protected Routes - Dashboard Views */}
        <Route path="/dashboard"><ProtectedRoute><AppAuthenticatedLayout><Dashboard /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/scenarios"><ProtectedRoute><AppAuthenticatedLayout><Scenarios /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/financial-story"><ProtectedRoute><AppAuthenticatedLayout><FinancialStory /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/portfolio"><ProtectedRoute><AppAuthenticatedLayout><Portfolio /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/all-insights"><ProtectedRoute><AppAuthenticatedLayout><AllInsights /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/goals-debts"><ProtectedRoute><AppAuthenticatedLayout><GoalsAndDebts /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/transactions"><ProtectedRoute><AppAuthenticatedLayout><Transactions /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/exports"><ProtectedRoute><AppAuthenticatedLayout><Exports /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/workflows"><ProtectedRoute><AppAuthenticatedLayout><Workflows /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/tasks"><ProtectedRoute><AppAuthenticatedLayout><Tasks /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/receipts"><ProtectedRoute><AppAuthenticatedLayout><Receipts /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/onboarding"><ProtectedRoute><AppAuthenticatedLayout><Onboarding /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/blogs">
          <ProtectedRoute>
            <AppAuthenticatedLayout>
              <ComingSoon
                title="Blogs"
                description="Curated finance articles are being prepared for this release."
              />
            </AppAuthenticatedLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/growth-stories">
          <ProtectedRoute>
            <AppAuthenticatedLayout>
              <ComingSoon
                title="Growth Stories"
                description="Personalized learning journeys will be available in the next milestone."
              />
            </AppAuthenticatedLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/notes">
          <ProtectedRoute>
            <AppAuthenticatedLayout>
              <Notes />
            </AppAuthenticatedLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/billing">
          <ProtectedRoute>
            <AppAuthenticatedLayout>
              <Billing />
            </AppAuthenticatedLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/org">
          <ProtectedRoute>
            <AppAuthenticatedLayout>
              <Organization />
            </AppAuthenticatedLayout>
          </ProtectedRoute>
        </Route>

        {/* Default redirect - Now goes to chat as primary interface */}
        <Route path="/">{user ? <Redirect to="/chat" /> : <Redirect to="/login" />}</Route>

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <FeatureLimitDialog />
            <PlanAndUsageDialog />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
