import { motion, AnimatePresence } from "framer-motion";

export type WorkflowPhase = 
  | "connecting"
  | "routing"
  | "planning"
  | "research"
  | "execution"
  | "verification"
  | "synthesis"
  | "complete"
  | "error";

interface WorkflowProgressIndicatorProps {
  phase?: WorkflowPhase;
  agentName?: string;
  showDetails?: boolean;
}

const PHASE_INFO: Record<WorkflowPhase, { label: string; icon: string; color: string }> = {
  connecting: { label: "Connecting...", icon: "", color: "text-muted-foreground" },
  routing: { label: "Analyzing request", icon: "", color: "text-blue-400" },
  planning: { label: "Creating plan", icon: "", color: "text-purple-400" },
  research: { label: "Researching", icon: "", color: "text-cyan-400" },
  execution: { label: "Processing", icon: "", color: "text-yellow-400" },
  verification: { label: "Verifying", icon: "", color: "text-green-400" },
  synthesis: { label: "Generating response", icon: "", color: "text-primary" },
  complete: { label: "Complete", icon: "", color: "text-green-500" },
  error: { label: "Error", icon: "", color: "text-red-400" },
};

export function WorkflowProgressIndicator({
  phase = "connecting",
  agentName,
  showDetails = true,
}: WorkflowProgressIndicatorProps) {
  const info = PHASE_INFO[phase] || PHASE_INFO.connecting;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="flex gap-4 p-4"
    >
      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
        <motion.div
          className="text-lg"
          animate={{ rotate: phase === "connecting" || phase === "routing" ? 360 : 0 }}
          transition={{ duration: 2, repeat: phase !== "complete" && phase !== "error" ? Infinity : 0, ease: "linear" }}
        >
          {info.icon}
        </motion.div>
      </div>

      <div className="bg-accent/50 rounded-2xl rounded-bl-md px-4 py-3 min-w-[160px]">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${info.color}`}>{info.label}</span>
          {phase !== "complete" && phase !== "error" && (
            <div className="flex items-center space-x-1">
              <motion.div
                className="w-1.5 h-1.5 bg-current rounded-full"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
              />
              <motion.div
                className="w-1.5 h-1.5 bg-current rounded-full"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
              />
              <motion.div
                className="w-1.5 h-1.5 bg-current rounded-full"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
              />
            </div>
          )}
        </div>

        {showDetails && agentName && (
          <p className="text-xs text-muted-foreground mt-1 capitalize">
            Agent: {agentName.replace(/_/g, " ")}
          </p>
        )}
      </div>
    </motion.div>
  );
}

interface TypingIndicatorProps {
  phase?: WorkflowPhase;
  agentName?: string;
}

export function TypingIndicator({ phase, agentName }: TypingIndicatorProps) {
  // If we have phase information, show the enhanced indicator
  if (phase) {
    return <WorkflowProgressIndicator phase={phase} agentName={agentName} />;
  }

  // Default simple typing indicator
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="flex gap-4 p-4"
    >
      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
        <motion.div
          className="w-4 h-4 bg-primary-foreground rounded-full"
          animate={{ scale: [1, 0.8, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      </div>

      <div className="bg-accent/50 rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center space-x-2">
          <motion.div
            className="w-2 h-2 bg-muted-foreground rounded-full"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
          />
          <motion.div
            className="w-2 h-2 bg-muted-foreground rounded-full"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }}
          />
          <motion.div
            className="w-2 h-2 bg-muted-foreground rounded-full"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

// Phase timeline for showing completed phases
interface PhaseTimelineProps {
  phases: Array<{ phase: WorkflowPhase; agent?: string; completedAt?: string }>;
}

export function PhaseTimeline({ phases }: PhaseTimelineProps) {
  if (phases.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-4 py-2 text-[10px] text-muted-foreground">
      <AnimatePresence mode="popLayout">
        {phases.map((p, i) => {
          const info = PHASE_INFO[p.phase];
          return (
            <motion.div
              key={`${p.phase}-${i}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-1"
            >
              <span className={info.color}>{info.icon}</span>
              <span>{info.label}</span>
              {i < phases.length - 1 && <span className="mx-1">-</span>}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
