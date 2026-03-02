import { Suspense, lazy } from "react";
import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/Toaster";
import { TooltipProvider } from "@/components/ui/ToolTip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Sidebar } from "@/components/Sidebar";
import { FeatureLimitDialog } from "@/components/FeatureLimitDialog";
import { PlanAndUsageDialog } from "@/components/PlanAndUsageDialog";
import { useRealtimeEvents } from "@/hooks/useRealtimeEvents";


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
const NotFound = lazy(() => import("@/pages/NotFound"));
const GrowthStories = lazy(() => import("./pages/GrowthStories"));
const GrowthStoryDetail = lazy(() => import("./pages/GrowthStoryDetail"));
const Blogs = lazy(() => import("./pages/Blogs"));
const BlogDetail = lazy(() => import("./pages/BlogDetail"));
const Documentation = lazy(() => import("@/pages/Documentation"));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground text-sm animate-pulse">Loading CognitionOS...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;

  return <>{children}</>;
}


function AppAuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-auto pb-20 lg:pb-0">
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
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <p className="text-muted-foreground text-sm animate-pulse">Loading CognitionOS...</p>
          </div>
        </div>
      }
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
        <Route path="/finance"><ProtectedRoute><AppAuthenticatedLayout><FinanceOS /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/exports"><ProtectedRoute><AppAuthenticatedLayout><Exports /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/workflows"><ProtectedRoute><AppAuthenticatedLayout><Workflows /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/tasks"><ProtectedRoute><AppAuthenticatedLayout><Tasks /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/receipts"><ProtectedRoute><AppAuthenticatedLayout><Receipts /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/onboarding"><ProtectedRoute><AppAuthenticatedLayout><Onboarding /></AppAuthenticatedLayout></ProtectedRoute></Route>
        <Route path="/growth-stories">
          <ProtectedRoute>
            <AppAuthenticatedLayout>
              <GrowthStories />
            </AppAuthenticatedLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/growth-stories/:slug">
          <ProtectedRoute>
            <AppAuthenticatedLayout>
              <GrowthStoryDetail />
            </AppAuthenticatedLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/blogs">
          <ProtectedRoute>
            <AppAuthenticatedLayout>
              <Blogs />
            </AppAuthenticatedLayout>
          </ProtectedRoute>
        </Route>
        <Route path="/blogs/:slug">
          <ProtectedRoute>
            <AppAuthenticatedLayout>
              <BlogDetail />
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
        <Route path="/docs">
          <ProtectedRoute>
            <AppAuthenticatedLayout>
              <Documentation />
            </AppAuthenticatedLayout>
          </ProtectedRoute>
        </Route>

        {/* Default redirect - Now goes to dashboard as primary interface */}
        <Route path="/">{user ? <Redirect to="/dashboard" /> : <Redirect to="/login" />}</Route>

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function RealtimeEventsProvider({ children }: { children: React.ReactNode }) {
  useRealtimeEvents();
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <RealtimeEventsProvider>
            <TooltipProvider>
              <Toaster />
              <FeatureLimitDialog />
              <PlanAndUsageDialog />
              <Router />
            </TooltipProvider>
          </RealtimeEventsProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
