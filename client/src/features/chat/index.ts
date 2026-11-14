// Chat Feature Exports
// Re-exports the central ChatContainer orchestrator component.
// Connects session lifecycle management, active inputs, and message streams.
// Serves as the primary entrypoint for embedding the conversational workspace.
export { ChatContainer } from "./ChatContainer";
// Re-exports the individual ChatMessage presentation component.
// Renders rich Markdown prose, source grounding chips, and interactive tool cards.
// Manages action approvals, simulations, and user feedback dispatchers.
export { ChatMessage } from "./ChatMessage";
// Re-exports the scrollable ChatMessageList container component.
// Implements viewport auto-scrolling to maintain latest response visibility.
// Houses chat message instances, typing bubbles, and skeleton loaders.
export { ChatMessageList } from "./ChatMessageList";
// Re-exports the multi-modal ChatInput message composer component.
// Handles auto-resizing text inputs, keyboard shortcuts, and file attachments.
// Connects narrative switches and upload dispatchers to the message flow.
export { ChatInput } from "./ChatInput";
// Re-exports visual workflow indicators communicating real-time agent activity.
// Displays specialist agent identifiers, animated spinners, and phase badges.
// Provides visual feedback during intermediate reasoning and processing steps.
export { TypingIndicator, WorkflowProgressIndicator, PhaseTimeline } from "./TypingIndicator";
// Re-exports the TypeScript type defining valid workflow execution phases.
// Enumerates states including idle, routing, processing, complete, and error.
// Type-checks phase transitions across Zustand stores and UI indicators.
export type { WorkflowPhase } from "./TypingIndicator";
// Re-exports the ChatSuggestions onboarding component for empty threads.
// Presents prompt cards covering investment reviews, budgets, and savings goals.
// Allows users to populate composer queries with a single interaction.
export { ChatSuggestions } from "./ChatSuggestions";
// Re-exports the ChatHistorySidebar navigation drawer component.
// Lists past conversations grouped by relative recency with search and rename.
// Enables seamless thread switching across archived chat sessions.
export { ChatHistorySidebar } from "./ChatHistorySidebar";
