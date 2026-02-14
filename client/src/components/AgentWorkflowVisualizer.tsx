import { motion } from "framer-motion";
import { Crown, Calculator, TrendingUp, PiggyBank, GraduationCap, BrainCircuit } from "lucide-react";
import { IWorkflowTraceEntry } from "@/types";

interface AgentWorkflowVisualizerProps {
  workflowTrace?: IWorkflowTraceEntry[];
  agentsInvolved?: string[];
  fallbackUsed?: boolean;
  llmCallCount?: number;
}

type AgentVisualConfig = {
  label: string;
  icon: typeof Crown;
  color: string;
};

const AGENT_VISUALS: Record<string, AgentVisualConfig> = {
  master_agent: { label: "Master Strategist", icon: Crown, color: "hsl(158 64% 52%)" },
  master_synthesis: { label: "Master Synthesis", icon: Crown, color: "hsl(158 64% 44%)" },
  comprehensive_analysis: { label: "Comprehensive Orchestrator", icon: BrainCircuit, color: "hsl(201 96% 38%)" },
  income_expense_analyzer: { label: "Income & Expense Analyzer", icon: Calculator, color: "hsl(221 83% 53%)" },
  budget_planner: { label: "Budget Planner", icon: Calculator, color: "hsl(210 90% 56%)" },
  investment_advisor: { label: "Investment Advisor", icon: TrendingUp, color: "hsl(46 95% 53%)" },
  debt_optimizer: { label: "Debt Optimizer", icon: PiggyBank, color: "hsl(0 84% 60%)" },
  financial_educator: { label: "Financial Educator", icon: GraduationCap, color: "hsl(134 61% 41%)" },
  ai_core_client: { label: "AI Core Client", icon: BrainCircuit, color: "hsl(271 81% 56%)" },
};

const normalizeAgentKey = (agent: string) => {
  const key = agent.toLowerCase().trim();
  return key;
};

const formatDuration = (entry: IWorkflowTraceEntry) => {
  const started = new Date(entry.startedAt).getTime();
  const ended = new Date(entry.endedAt).getTime();

  if (Number.isNaN(started) || Number.isNaN(ended) || ended < started) {
    return "-";
  }

  const duration = ended - started;
  return `${duration}ms`;
};

const buildFallbackTrace = (agentsInvolved: string[] = []): IWorkflowTraceEntry[] => {
  const timestamp = new Date().toISOString();
  return agentsInvolved.map(agent => ({
    agent,
    startedAt: timestamp,
    endedAt: timestamp,
    status: "completed",
  }));
};

export function AgentWorkflowVisualizer({
  workflowTrace = [],
  agentsInvolved = [],
  fallbackUsed = false,
  llmCallCount = 0,
}: AgentWorkflowVisualizerProps) {
  const trace = workflowTrace.length > 0 ? workflowTrace : buildFallbackTrace(agentsInvolved);

  if (trace.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        Workflow trace not available for this response.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card/60 p-3" data-testid="workflow-visualizer">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent Workflow Trace</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>LLM calls: {llmCallCount}</span>
          <span>{fallbackUsed ? "Fallback used" : "Primary path"}</span>
        </div>
      </div>

      <div className="space-y-2">
        {trace.map((entry, index) => {
          const agentKey = normalizeAgentKey(entry.agent);
          const config = AGENT_VISUALS[agentKey] || {
            label: entry.agent,
            icon: BrainCircuit,
            color: "hsl(215 16% 47%)",
          };

          const Icon = config.icon;
          const status = entry.status || "unknown";

          return (
            <motion.div
              key={`${entry.agent}-${index}-${entry.startedAt}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.04 }}
              className="flex items-center justify-between rounded-md bg-accent/35 px-3 py-2"
              data-testid={`trace-${agentKey}-${index}`}
            >
              <div className="flex items-center gap-2">
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full"
                  style={{ backgroundColor: config.color }}
                >
                  <Icon className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">{config.label}</p>
                  <p className="text-[11px] text-muted-foreground">status: {status}</p>
                </div>
              </div>

              <div className="text-right text-[11px] text-muted-foreground">
                <p>{formatDuration(entry)}</p>
                {entry.error ? <p className="max-w-[220px] truncate text-destructive">{entry.error}</p> : null}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}