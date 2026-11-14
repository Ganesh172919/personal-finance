/**
 * @fileoverview Typing Indicator / Workflow Progress Component
 *
 * Displays a visual indicator showing the AI's current processing phase.
 * Instead of a simple "typing..." dot, it shows the actual workflow stage
 * (routing, planning, research, execution, verification, synthesis).
 *
 * WORKFLOW PHASES:
 * 1. connecting — Establishing SSE connection
 * 2. routing — Determining which AI agent to use
 * 3. planning — Creating an action plan
 * 4. research — Gathering data from the database
 * 5. execution — Running analysis or tool calls
 * 6. verification — Validating results
 * 7. synthesis — Generating the final response
 * 8. complete — Done
 * 9. error — Something went wrong
 *
 * @module features/chat/TypingIndicator
 */

import { motion, AnimatePresence } from "framer-motion";

/** All possible workflow phases during AI processing */
// Union representing the granular lifecycle stages of an AI pipeline run.
// Identifies phases from initial socket connection through research and synthesis.
// Used across stream events, stores, and animated UI indicators.
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

// Props definition for the enhanced AI workflow progress visualizer.
// Accepts the active processing phase string and specialist agent name.
// Includes flags for toggling supplementary agent details and badges.
interface WorkflowProgressIndicatorProps {
  phase?: WorkflowPhase;
  agentName?: string;
  showDetails?: boolean;
}

/** Phase metadata: display label, icon, and color for each phase */
// Configuration table assigning presentation metadata to each workflow phase.
// Maps phase names to human-readable labels, status icons, and theme color classes.
// Provides visual distinction across routing, planning, and execution stages.
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

// Renders an animated progress badge detailing active multi-agent AI execution.
// Shows rotating spinners, status labels, and pulsing dots tailored to the phase.
// Informs users of current tasks such as data retrieval or plan formulation.
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

// Properties configuring the contextual typing and phase indicator bubble.
// Supports passing an active workflow phase and specialist agent identifier.
// Dictates whether an advanced workflow stage or a standard bouncing dot renders.
interface TypingIndicatorProps {
  phase?: WorkflowPhase;
  agentName?: string;
}

// Contextual processing indicator rendered while awaiting AI assistant replies.
// Dynamically switches between detailed workflow progress and classic bounce dots.
// Seamlessly handles mounting and unmounting animations via Framer Motion.
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
// Prop type contract for the sequential workflow history timeline ribbon.
// Accepts an ordered array of historical execution phases with completion timestamps.
// Supplies telemetry metadata for step-by-step audit visualization.
interface PhaseTimelineProps {
  phases: Array<{ phase: WorkflowPhase; agent?: string; completedAt?: string }>;
}

// Renders a chronological horizontal breadcrumb ribbon of completed AI stages.
// Animates phase transitions with subtle scale and fade effects.
// Displays color-coded stage icons and labels tracking processing history.
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
