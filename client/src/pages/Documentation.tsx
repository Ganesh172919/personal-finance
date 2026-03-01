import { useState, useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Search,
  MessageSquare,
  Gauge,
  ListTodo,
  Brain,
  Target,
  ReceiptText,
  Wallet,
  Download,
  Workflow,
  ScanLine,
  PieChart,
  ListChecks,
  Building2,
  CreditCard,
  FileText,
  TrendingUp,
  StickyNote,
  Keyboard,
  HelpCircle,
  Rocket,
  Zap,
  Shield,
  Globe,
  ChevronRight,
  ArrowUp,
  Lightbulb,
  BookOpen,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Separator } from "@/components/ui/Separator";
import { Button } from "@/components/ui/Button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/Accordion";
import { ScrollArea } from "@/components/ui/ScrollArea";

// ─── Types ───────────────────────────────────────────────────────────────────
interface DocSection {
  id: string;
  title: string;
  icon: any;
  color: string;
  description: string;
  capabilities: string[];
  proTips?: string[];
}

interface FAQItem {
  question: string;
  answer: string;
}

interface ShortcutItem {
  keys: string[];
  action: string;
}

// ─── Data ────────────────────────────────────────────────────────────────────

const gettingStartedSteps = [
  {
    step: 1,
    title: "Create Your Account",
    description:
      "Sign up with your email or Google account to get started. We'll guide you through a quick onboarding process.",
    icon: Rocket,
  },
  {
    step: 2,
    title: "Complete Onboarding",
    description:
      "Tell us about your income, expenses, and financial goals. The AI engine uses this data to personalize your experience.",
    icon: Brain,
  },
  {
    step: 3,
    title: "Add Transactions",
    description:
      "Import your transactions via CSV upload or add them manually. The more data you provide, the smarter your insights become.",
    icon: ReceiptText,
  },
  {
    step: 4,
    title: "Set Financial Goals",
    description:
      "Define savings targets, debt payoff plans, and investment goals. Track your progress over time with visual milestones.",
    icon: Target,
  },
  {
    step: 5,
    title: "Chat with Your AI Strategist",
    description:
      "Use the AI Chat to ask questions, get personalized advice, and run financial scenarios in natural language.",
    icon: MessageSquare,
  },
];

const featureSections: DocSection[] = [
  {
    id: "ai-chat",
    title: "AI Chat",
    icon: MessageSquare,
    color: "text-chart-1",
    description:
      "Your personal AI financial strategist. Ask questions in natural language, run scenarios, and get data-driven recommendations powered by advanced AI agents.",
    capabilities: [
      "Natural language financial questions",
      "Multi-agent analysis (budget, investments, debt, tax)",
      "Scenario planning ('What if I invest ₹10,000/month?')",
      "Conversation history with session management",
      "Real-time streaming responses",
    ],
    proTips: [
      "Be specific with amounts and timeframes for better analysis",
      "Use the scenario planner for major financial decisions",
      "Review past sessions to track how your strategy evolves",
    ],
  },
  {
    id: "dashboard",
    title: "Strategist's Desk (Dashboard)",
    icon: Gauge,
    color: "text-chart-2",
    description:
      "Your command center for financial health. Get a bird's-eye view of vitals, insights, goal progress, spending patterns, and recent activity — all in one place.",
    capabilities: [
      "Financial vitals overview (income, expenses, net worth)",
      "AI-powered actionable insights",
      "Goal progress tracking",
      "Investment portfolio summary",
      "Spending analysis with charts",
      "Quick actions for common tasks",
      "Tasks & to-do widget",
      "Recent activity feed",
    ],
    proTips: [
      "Start your day here for a quick financial health check",
      "Act on AI insights promptly for maximum benefit",
    ],
  },
  {
    id: "transactions",
    title: "Transactions",
    icon: ReceiptText,
    color: "text-chart-3",
    description:
      "Track, categorize, and analyze every rupee flowing in and out. Import from CSV, add manually, or let AI auto-categorize for you.",
    capabilities: [
      "Manual transaction entry",
      "CSV bulk import",
      "Automatic AI categorization",
      "Smart filtering (date, category, amount, type)",
      "Full-text search across transactions",
      "Split and recurring transaction support",
      "Category-wise spending breakdowns",
    ],
    proTips: [
      "Use CSV import for bulk historical data",
      "Review AI categorizations weekly for accuracy",
      "Tag recurring expenses for better forecasting",
    ],
  },
  {
    id: "goals-debts",
    title: "Goals & Debts",
    icon: Target,
    color: "text-chart-4",
    description:
      "Set financial targets and track debt payoff strategies. Visualize progress with milestones and get AI-powered recommendations.",
    capabilities: [
      "Create savings goals with target amounts and deadlines",
      "Debt tracking with interest rate analysis",
      "Visual progress bars and milestones",
      "AI-suggested optimization strategies",
      "Priority scoring for debt payoff (avalanche vs snowball)",
    ],
    proTips: [
      "Set realistic deadlines — the AI will adjust recommendations accordingly",
      "Review your goals monthly with the Financial Story page",
    ],
  },
  {
    id: "portfolio",
    title: "Investment Portfolio",
    icon: PieChart,
    color: "text-chart-5",
    description:
      "Monitor your investment holdings, track asset allocation, and get AI-driven rebalancing suggestions.",
    capabilities: [
      "Holdings overview with current values",
      "Asset allocation visualization",
      "Performance tracking over time",
      "AI rebalancing suggestions",
      "Sector and instrument breakdowns",
    ],
    proTips: [
      "Update portfolio values regularly for accurate insights",
      "Ask the AI Chat for specific investment strategy advice",
    ],
  },
  {
    id: "finance-os",
    title: "Finance OS",
    icon: Wallet,
    color: "text-primary",
    description:
      "Your personal operating system for money management. Budget templates, cash flow projection, and financial planning tools in one unified interface.",
    capabilities: [
      "Budget creation and tracking",
      "Cash flow projection and forecasting",
      "Income vs expense analysis",
      "Financial calendar view",
      "Category budget limits with alerts",
    ],
  },
  {
    id: "workflows",
    title: "Workflows",
    icon: Workflow,
    color: "text-chart-1",
    description:
      "Automate your financial routines with customizable workflows. Set up recurring analyses, scheduled reports, and automated task creation.",
    capabilities: [
      "Pre-built financial workflow templates",
      "Custom workflow creation",
      "Trigger-based automations",
      "Scheduled financial health checks",
      "Agent-powered workflow execution with visual progress",
    ],
  },
  {
    id: "tasks",
    title: "Tasks",
    icon: ListTodo,
    color: "text-chart-2",
    description:
      "AI-generated and user-created financial to-dos. Stay on top of bills, investment reviews, and financial maintenance activities.",
    capabilities: [
      "AI-generated smart tasks based on your data",
      "Manual task creation and management",
      "Priority levels and due dates",
      "Completion tracking and streaks",
      "One-click apply for AI task recommendations",
    ],
  },
  {
    id: "receipts",
    title: "Receipts (OCR)",
    icon: ScanLine,
    color: "text-chart-3",
    description:
      "Snap a photo of your receipts and let AI extract the details. The OCR engine reads transaction amounts, dates, vendors, and items automatically.",
    capabilities: [
      "Camera and file-upload receipt scanning",
      "AI-powered OCR with data extraction",
      "Automatic transaction creation from receipts",
      "Receipt image storage and search",
      "Handwriting recognition support",
    ],
  },
  {
    id: "exports",
    title: "Exports",
    icon: Download,
    color: "text-chart-4",
    description:
      "Export your financial data in multiple formats. Generate PDF reports, CSV data dumps, and formatted statements for tax filing or bookkeeping.",
    capabilities: [
      "PDF financial reports with charts",
      "CSV data export for spreadsheets",
      "Date range filtering for exports",
      "Customizable report templates",
      "Scheduled automated exports",
    ],
  },
  {
    id: "financial-story",
    title: "Financial Story",
    icon: TrendingUp,
    color: "text-chart-5",
    description:
      "A narrative view of your financial journey. Track milestones, celebrate achievements, and share your progress with a unique shareable link.",
    capabilities: [
      "Interactive financial health score",
      "Goal progress timeline",
      "AI-generated milestone tracking",
      "Shareable snapshot via unique link",
      "Savings and net worth trend visualization",
    ],
  },
  {
    id: "scenarios",
    title: "Scenarios",
    icon: Lightbulb,
    color: "text-chart-1",
    description:
      "Model 'what-if' financial scenarios. See how different choices impact your net worth, savings rate, and goal timelines.",
    capabilities: [
      "What-if scenario builder",
      "Side-by-side scenario comparison",
      "Impact analysis on goals and debts",
      "AI-generated scenario suggestions",
      "Save and revisit past scenarios",
    ],
  },
  {
    id: "insights",
    title: "All Insights",
    icon: ListChecks,
    color: "text-chart-2",
    description:
      "Browse all AI-generated insights across every financial area. Filter by type, priority, and date to find the most relevant advice.",
    capabilities: [
      "Aggregated insights from all AI agents",
      "Filter by agent type and priority",
      "Actionable recommendations with one-click apply",
      "Historical insight archive",
      "Trend analysis across insight categories",
    ],
  },
  {
    id: "blogs",
    title: "Blogs",
    icon: FileText,
    color: "text-chart-3",
    description:
      "Read and write financial intelligence articles. Curated insights, strategies, and deep dives to help you master your money.",
    capabilities: [
      "Read curated financial articles",
      "Write and publish your own posts",
      "Category and tag filtering",
      "Full-text search across articles",
      "Featured post highlighting",
    ],
  },
  {
    id: "growth-stories",
    title: "Growth Stories",
    icon: TrendingUp,
    color: "text-chart-4",
    description:
      "Real financial success stories and growth paths. Get inspired by stories of people who transformed their finances.",
    capabilities: [
      "Curated real-world financial success stories",
      "Category-based browsing",
      "Key takeaways and lessons learned",
      "Transformation metrics and before/after",
      "Bookmarks and sharing",
    ],
  },
  {
    id: "notes",
    title: "Note Taking",
    icon: StickyNote,
    color: "text-chart-5",
    description:
      "A personal financial journal. Record thoughts, track decisions, and annotate your financial plan with rich text notes.",
    capabilities: [
      "Rich text editor with formatting",
      "Tagging and categorization",
      "Full-text search across notes",
      "Link notes to goals and transactions",
      "Version history tracking",
    ],
  },
  {
    id: "organization",
    title: "Organization",
    icon: Building2,
    color: "text-primary",
    description:
      "Manage multi-user organizations. Invite team members, set roles, configure shared settings, and track currency preferences.",
    capabilities: [
      "Create and manage organizations",
      "Invite members via email",
      "Role-based access control (Owner, Admin, Member)",
      "Organization-wide currency and locale settings",
      "Shared financial data and reports",
    ],
  },
  {
    id: "billing",
    title: "Billing & Plans",
    icon: CreditCard,
    color: "text-chart-1",
    description:
      "Manage your subscription plan. View usage limits, upgrade for more features, and manage payment methods via Stripe.",
    capabilities: [
      "View current plan and usage",
      "Upgrade/downgrade subscription tiers",
      "Secure payment via Stripe",
      "Feature limit tracking",
      "Invoice and billing history",
    ],
  },
];

const shortcuts: ShortcutItem[] = [
  { keys: ["Ctrl", "K"], action: "Open AI Command Bar" },
  { keys: ["Ctrl", "/"], action: "Focus search in current page" },
  { keys: ["Ctrl", "N"], action: "Create new transaction" },
  { keys: ["Ctrl", "Shift", "C"], action: "Open AI Chat" },
  { keys: ["Ctrl", "D"], action: "Go to Dashboard" },
  { keys: ["Escape"], action: "Close dialog / modal" },
];

const faqItems: FAQItem[] = [
  {
    question: "Is my financial data secure?",
    answer:
      "Absolutely. All data is encrypted at rest and in transit using industry-standard TLS 1.3 and AES-256 encryption. We use JWT-based authentication with secure httpOnly cookies, and support Google OAuth2 for federated login. Your data is never shared with third parties.",
  },
  {
    question: "How does the AI generate financial insights?",
    answer:
      "Our AI engine uses a multi-agent architecture. Specialized agents (budget planner, debt optimizer, investment advisor, tax strategist, financial educator) analyze your data independently, then a master orchestrator synthesizes their findings into actionable, personalized recommendations.",
  },
  {
    question: "Can I import transactions from my bank?",
    answer:
      "Yes! You can import transactions via CSV file upload. Simply export a CSV from your bank's website and upload it through the Transactions page. Our AI will auto-categorize the imported transactions for you.",
  },
  {
    question: "What file formats does the Receipt OCR support?",
    answer:
      "The Receipt OCR supports JPEG, PNG, and WebP images. You can either upload a photo from your device or take one with your camera. The AI extracts merchant name, date, total amount, and line items automatically.",
  },
  {
    question: "How is the free plan different from paid plans?",
    answer:
      "The free plan includes core features like transaction tracking, basic insights, and the AI chat with limited messages. Paid plans unlock unlimited AI interactions, advanced workflows, receipt OCR, team collaboration, and priority support.",
  },
  {
    question: "Can I share my financial data with my partner or advisor?",
    answer:
      "Yes! Use the Organization feature to invite members. You can also share your Financial Story as a read-only snapshot via a unique shareable link — the recipient doesn't need an account to view it.",
  },
  {
    question: "How do I export my data?",
    answer:
      "Navigate to the Exports page. You can generate PDF reports or CSV data dumps filtered by date range. Reports include charts, summaries, and transaction-level detail.",
  },
  {
    question: "What currencies are supported?",
    answer:
      "FinWise supports multiple currencies configured at the organization level. The default is INR (₹), but you can switch to USD, EUR, GBP, and many others through Organization settings.",
  },
];

const integrations = [
  {
    name: "Google OAuth",
    description: "One-click sign in with your Google account",
    icon: Globe,
  },
  {
    name: "Stripe Payments",
    description: "Secure subscription billing and payment processing",
    icon: Shield,
  },
  {
    name: "CSV Import/Export",
    description: "Bulk data transfer with standard spreadsheet formats",
    icon: Download,
  },
  {
    name: "Email (Nodemailer)",
    description: "Transactional emails for verification, invitations, and alerts",
    icon: FileText,
  },
  {
    name: "PDF Generation",
    description: "Rich financial reports with PDFKit",
    icon: FileText,
  },
];

// ─── Table of Contents Section Link ──────────────────────────────────────────
const tocSections = [
  { id: "getting-started", label: "Getting Started", icon: Rocket },
  { id: "features", label: "Features", icon: Zap },
  { id: "integrations", label: "API & Integrations", icon: Globe },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: Keyboard },
  { id: "faq", label: "FAQ", icon: HelpCircle },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function Documentation() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState("getting-started");
  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll to section
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(id);
    }
  };

  // Track active section on scroll
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handleScroll = () => {
      const allIds = [
        "getting-started",
        ...featureSections.map((s) => s.id),
        "integrations",
        "shortcuts",
        "faq",
      ];
      let current = allIds[0];
      for (const id of allIds) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 180) current = id;
        }
      }
      setActiveSection(current);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Filter features by search
  const filteredFeatures = useMemo(() => {
    if (!searchQuery.trim()) return featureSections;
    const q = searchQuery.toLowerCase();
    return featureSections.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.capabilities.some((c) => c.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const filteredFAQ = useMemo(() => {
    if (!searchQuery.trim()) return faqItems;
    const q = searchQuery.toLowerCase();
    return faqItems.filter(
      (f) =>
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  return (
    <div
      className="flex-1 flex h-screen overflow-hidden bg-background"
      data-testid="documentation-page"
    >
      {/* ── Left Sidebar Table of Contents ── */}
      <aside className="hidden lg:flex w-64 xl:w-72 flex-col border-r border-border bg-card/50">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <BookOpen className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-semibold text-foreground text-sm">
              Documentation
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Everything you need to know
          </p>
        </div>

        <ScrollArea className="flex-1 py-4">
          <nav className="px-4 space-y-1">
            {tocSections.map((sec) => {
              const isParent = sec.id === "features";
              const isActive = activeSection === sec.id;
              return (
                <div key={sec.id}>
                  <button
                    onClick={() => scrollToSection(sec.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive && !isParent
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    <sec.icon className="w-4 h-4 shrink-0" />
                    <span>{sec.label}</span>
                  </button>
                  {/* Feature sub-items */}
                  {isParent && (
                    <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3">
                      {featureSections.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => scrollToSection(f.id)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                            activeSection === f.id
                              ? "bg-primary/10 text-primary font-semibold"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                          }`}
                        >
                          <f.icon className="w-3 h-3 shrink-0" />
                          <span className="truncate">{f.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </ScrollArea>
      </aside>

      {/* ── Main Content ── */}
      <div ref={contentRef} className="flex-1 overflow-auto scroll-smooth">
        {/* Sticky header */}
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-lg border-b border-border/50">
          <div className="max-w-4xl mx-auto px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Documentation
              </h1>
              <p className="text-sm text-muted-foreground">
                Learn how to get the most out of FinWise
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search docs..."
                className="pl-9 bg-muted/50 border-none rounded-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="docs-search"
              />
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-6 py-8 space-y-16">
          {/* ────────────────── Getting Started ────────────────── */}
          <motion.section
            id="getting-started"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-gradient-to-br from-primary to-chart-2 rounded-xl">
                <Rocket className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  Getting Started
                </h2>
                <p className="text-sm text-muted-foreground">
                  Set up your account in 5 easy steps
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {gettingStartedSteps.map((step, idx) => (
                <motion.div
                  key={step.step}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + idx * 0.08 }}
                >
                  <Card className="p-5 flex items-start gap-4 hover:shadow-md transition-shadow group">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <step.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                        >
                          Step {step.step}
                        </Badge>
                        <h3 className="font-semibold text-foreground">
                          {step.title}
                        </h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-3 group-hover:translate-x-1 transition-transform" />
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.section>

          <Separator />

          {/* ────────────────── Features ────────────────── */}
          <section id="features">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-gradient-to-br from-chart-1 to-chart-3 rounded-xl">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Features</h2>
                <p className="text-sm text-muted-foreground">
                  Deep dive into every feature of the platform
                </p>
              </div>
            </div>

            {filteredFeatures.length === 0 ? (
              <Card className="p-12 text-center">
                <Search className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <h3 className="font-semibold text-lg mb-1">
                  No matching features
                </h3>
                <p className="text-muted-foreground text-sm">
                  Try a different search term.
                </p>
              </Card>
            ) : (
              <div className="space-y-6">
                {filteredFeatures.map((feature, idx) => (
                  <motion.div
                    key={feature.id}
                    id={feature.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * idx }}
                  >
                    <Card className="p-6 hover:shadow-lg transition-shadow overflow-hidden relative">
                      {/* Subtle gradient accent */}
                      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary to-chart-2 rounded-l-lg" />

                      <div className="flex items-start gap-4">
                        <div
                          className={`p-2.5 rounded-xl bg-muted/80 shrink-0`}
                        >
                          <feature.icon
                            className={`w-5 h-5 ${feature.color}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold text-foreground mb-1">
                            {feature.title}
                          </h3>
                          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                            {feature.description}
                          </p>

                          {/* Capabilities */}
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                              Key Capabilities
                            </h4>
                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {feature.capabilities.map((cap) => (
                                <li
                                  key={cap}
                                  className="flex items-start gap-2 text-sm text-foreground"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                                  <span>{cap}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Pro Tips */}
                          {feature.proTips && feature.proTips.length > 0 && (
                            <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
                              <div className="flex items-center gap-1.5 mb-2">
                                <Sparkles className="w-3.5 h-3.5 text-primary" />
                                <span className="text-xs font-semibold text-primary">
                                  Pro Tips
                                </span>
                              </div>
                              <ul className="space-y-1">
                                {feature.proTips.map((tip) => (
                                  <li
                                    key={tip}
                                    className="text-xs text-muted-foreground flex items-start gap-1.5"
                                  >
                                    <span className="text-primary mt-0.5">
                                      •
                                    </span>
                                    {tip}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* ────────────────── API & Integrations ────────────────── */}
          <motion.section
            id="integrations"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-gradient-to-br from-chart-4 to-chart-5 rounded-xl">
                <Globe className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  API & Integrations
                </h2>
                <p className="text-sm text-muted-foreground">
                  External services powering the platform
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {integrations.map((int, idx) => (
                <motion.div
                  key={int.name}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.25 + idx * 0.06 }}
                >
                  <Card className="p-5 h-full hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-muted/80">
                        <int.icon className="w-4 h-4 text-foreground" />
                      </div>
                      <h3 className="font-semibold text-foreground text-sm">
                        {int.name}
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {int.description}
                    </p>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.section>

          <Separator />

          {/* ────────────────── Keyboard Shortcuts ────────────────── */}
          <motion.section
            id="shortcuts"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-gradient-to-br from-chart-2 to-primary rounded-xl">
                <Keyboard className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  Keyboard Shortcuts
                </h2>
                <p className="text-sm text-muted-foreground">
                  Navigate faster with hotkeys
                </p>
              </div>
            </div>

            <Card className="overflow-hidden">
              <div className="divide-y divide-border">
                {shortcuts.map((sc) => (
                  <div
                    key={sc.action}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors"
                  >
                    <span className="text-sm text-foreground">{sc.action}</span>
                    <div className="flex items-center gap-1">
                      {sc.keys.map((key, ki) => (
                        <span key={ki}>
                          <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 bg-muted border border-border rounded-md text-xs font-mono text-foreground shadow-sm">
                            {key}
                          </kbd>
                          {ki < sc.keys.length - 1 && (
                            <span className="text-muted-foreground text-xs mx-0.5">
                              +
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.section>

          <Separator />

          {/* ────────────────── FAQ ────────────────── */}
          <motion.section
            id="faq"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-gradient-to-br from-chart-5 to-chart-1 rounded-xl">
                <HelpCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  Frequently Asked Questions
                </h2>
                <p className="text-sm text-muted-foreground">
                  Answers to common questions
                </p>
              </div>
            </div>

            {filteredFAQ.length === 0 ? (
              <Card className="p-12 text-center">
                <HelpCircle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <h3 className="font-semibold text-lg mb-1">
                  No matching questions
                </h3>
                <p className="text-muted-foreground text-sm">
                  Try a different search term.
                </p>
              </Card>
            ) : (
              <Card className="p-2">
                <Accordion type="multiple">
                  {filteredFAQ.map((faq, idx) => (
                    <AccordionItem key={idx} value={`faq-${idx}`}>
                      <AccordionTrigger className="px-4 text-sm font-medium text-foreground hover:no-underline">
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed">
                        {faq.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </Card>
            )}
          </motion.section>

          {/* ── Back to Top ── */}
          <div className="flex justify-center pb-8">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-full"
              onClick={() =>
                contentRef.current?.scrollTo({ top: 0, behavior: "smooth" })
              }
              data-testid="docs-back-to-top"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              Back to top
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
