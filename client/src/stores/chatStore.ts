/**
 * @fileoverview Chat State Management (Zustand Store)
 *
 * This module manages all chat-related state using Zustand, a lightweight
 * state management library. It handles chat sessions, messages, and the
 * AI workflow progress visualization.
 *
 * STATE MANAGEMENT APPROACH:
 * - Zustand for client-side state (chat sessions, messages, UI state)
 * - React Query for server-side state (not used here — chat uses direct API calls)
 * - persist middleware to save currentSessionId to localStorage
 *
 * OPTIMISTIC UPDATES:
 * When sending a message, the store:
 * 1. Immediately adds a temporary user message to the UI
 * 2. Sends the request to the server
 * 3. On success: replaces temp message with real messages from server
 * 4. On error: removes the temp message and shows error state
 *
 * This makes the UI feel instant while handling errors gracefully.
 *
 * WORKFLOW PHASE TRACKING:
 * The chat UI shows a visual workflow progress indicator as the AI processes
 * the request. Phases: routing → processing → complete/error
 *
 * @module stores/chatStore
 */

import { create } from "zustand";                    // State management
import { persist } from "zustand/middleware";         // localStorage persistence
import type { IChatSession, IChatMessage } from "@/types/chat.types";
import type { WorkflowPhase } from "@/features/chat/TypingIndicator";
import * as chatApi from "@/services/chatApi";        // Chat API client
import { reportClientError } from "@/lib/runtimeLogger"; // Error reporting

/**
 * Chat store state and actions interface.
 *
 * STATE:
 * - sessions: List of all chat sessions
 * - currentSessionId: ID of the active session
 * - messages: Messages for the current session
 * - Loading states for various operations
 * - Workflow progress tracking
 *
 * ACTIONS:
 * - Session management (load, create, select, delete, rename)
 * - Message sending with optimistic updates
 * - Workflow phase management
 */
interface ChatState {
  // Sessions state
  sessions: IChatSession[];
  currentSessionId: string | null;

  // Messages state for current session
  messages: IChatMessage[];

  // Loading states
  isLoadingSessions: boolean;
  isLoadingMessages: boolean;
  isSending: boolean;

  // Workflow progress tracking (visual indicator in chat UI)
  currentPhase: WorkflowPhase | null;
  currentAgent: string | null;
  phaseHistory: Array<{ phase: WorkflowPhase; agent?: string; timestamp: number }>;

  // Actions
  loadSessions: () => Promise<void>;
  createSession: () => Promise<IChatSession | null>;
  selectSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  sendMessage: (content: string, options?: { narrative?: boolean; fileIds?: string[] }) => Promise<void>;
  clearCurrentSession: () => void;
  setWorkflowPhase: (phase: WorkflowPhase | null, agent?: string) => void;
  clearWorkflowProgress: () => void;
}

/**
 * Chat store created with Zustand's create() and persist middleware.
 *
 * PERSIST MIDDLEWARE:
 * Saves currentSessionId to localStorage so the user returns to their
 * last active session when they refresh the page.
 *
 * PARTIALIZE:
 * Only persists currentSessionId (not messages or sessions) to avoid
 * stale data and keep localStorage small.
 */
export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // ── Initial State ──────────────────────────────────────────────
      sessions: [],
      currentSessionId: null,
      messages: [],
      isLoadingSessions: false,
      isLoadingMessages: false,
      isSending: false,
      currentPhase: null,
      currentAgent: null,
      phaseHistory: [],

      // ── Session Actions ────────────────────────────────────────────

      /**
       * Loads all chat sessions for the current user.
       * Called on chat page mount.
       */
      loadSessions: async () => {
        set({ isLoadingSessions: true });
        try {
          const response = await chatApi.fetchSessions();
          set({ sessions: response.sessions });
        } catch (error) {
          reportClientError("Failed to load sessions", error);
        } finally {
          set({ isLoadingSessions: false });
        }
      },

      /**
       * Creates a new chat session and selects it.
       * Prepends the new session to the sessions list.
       */
      createSession: async () => {
        try {
          const newSession = await chatApi.createSession();
          set((state) => ({
            sessions: [newSession, ...state.sessions],  // Prepend to list
            currentSessionId: newSession.id,             // Auto-select
            messages: []                                 // Clear messages
          }));
          return newSession;
        } catch (error) {
          reportClientError("Failed to create session", error);
          return null;
        }
      },

      /**
       * Selects a session and loads its messages.
       * Skips if the session is already selected.
       */
      selectSession: async (sessionId: string) => {
        // Skip if already selected
        if (get().currentSessionId === sessionId) return;

        set({ isLoadingMessages: true, currentSessionId: sessionId, messages: [] });
        try {
          const response = await chatApi.fetchMessages(sessionId);
          set({ messages: response.messages });
        } catch (error) {
          reportClientError("Failed to load messages", error);
        } finally {
          set({ isLoadingMessages: false });
        }
      },

      /**
       * Deletes a session and clears it if it was the current session.
       */
      deleteSession: async (sessionId: string) => {
        try {
          await chatApi.deleteSession(sessionId);
          set((state) => {
            const newSessions = state.sessions.filter(s => s.id !== sessionId);
            const wasCurrentSession = state.currentSessionId === sessionId;
            return {
              sessions: newSessions,
              // Clear current session if it was the deleted one
              currentSessionId: wasCurrentSession ? null : state.currentSessionId,
              messages: wasCurrentSession ? [] : state.messages
            };
          });
        } catch (error) {
          reportClientError("Failed to delete session", error);
        }
      },

      /**
       * Renames a session title.
       */
      renameSession: async (sessionId: string, title: string) => {
        try {
          const updatedSession = await chatApi.renameSession(sessionId, title);
          set((state) => ({
            sessions: state.sessions.map(s =>
              s.id === sessionId ? { ...s, title: updatedSession.title } : s
            )
          }));
        } catch (error) {
          reportClientError("Failed to rename session", error);
        }
      },

      // ── Message Actions ────────────────────────────────────────────

      /**
       * Sends a message with optimistic UI update.
       *
       * FLOW:
       * 1. Create session if none selected
       * 2. Set workflow phase to "routing"
       * 3. Optimistically add user message to UI
       * 4. Send request to server
       * 5. On success: replace temp message with real messages
       * 6. On error: remove temp message, set error phase
       *
       * @param content - Message text
       * @param options.narrative - Request narrative response style
       * @param options.fileIds - Attached file IDs
       */
      sendMessage: async (content: string, options?: { narrative?: boolean; fileIds?: string[] }) => {
        const { currentSessionId } = get();

        // Auto-create session if none selected
        if (!currentSessionId) {
          const newSession = await get().createSession();
          if (!newSession) return;
        }

        const sessionId = get().currentSessionId;
        if (!sessionId) return;

        // Set initial workflow phase
        set({
          isSending: true,
          currentPhase: "routing",
          currentAgent: null,
          phaseHistory: [{ phase: "routing", timestamp: Date.now() }]
        });

        // Optimistically add user message to UI
        const tempUserMessage: IChatMessage = {
          id: `temp-${Date.now()}`,  // Temporary ID (will be replaced)
          sessionId,
          role: "user",
          content,
          createdAt: new Date().toISOString()
        };

        set((state) => ({
          messages: [...state.messages, tempUserMessage]
        }));

        try {
          // Send message to server
          const response = await chatApi.sendMessage(sessionId, content, options);

          // Replace temp message with real messages from server
          set((state) => ({
            messages: [
              ...state.messages.filter(m => m.id !== tempUserMessage.id), // Remove temp
              response.userMessage,        // Real user message
              response.assistantMessage    // AI response
            ],
            // Update session metadata in the sidebar
            sessions: state.sessions.map(s =>
              s.id === sessionId
                ? {
                    ...s,
                    // Auto-generate title from first message
                    title: response.userMessage.content.substring(0, 50) +
                           (response.userMessage.content.length > 50 ? "..." : ""),
                    lastMessageAt: response.assistantMessage.createdAt,
                    messageCount: s.messageCount + 2
                  }
                : s
            ),
            currentPhase: "complete",
            phaseHistory: [...state.phaseHistory, { phase: "complete", timestamp: Date.now() }]
          }));
        } catch (error) {
          reportClientError("Failed to send message", error);
          // Remove optimistic message on error
          set((state) => ({
            messages: state.messages.filter(m => m.id !== tempUserMessage.id),
            currentPhase: "error",
            phaseHistory: [...state.phaseHistory, { phase: "error", timestamp: Date.now() }]
          }));
        } finally {
          set({ isSending: false });
        }
      },

      // ── Utility Actions ────────────────────────────────────────────

      /** Clears the current session state (used when navigating away) */
      clearCurrentSession: () => {
        set({ currentSessionId: null, messages: [], currentPhase: null, currentAgent: null, phaseHistory: [] });
      },

      /**
       * Sets the current workflow phase (called from SSE event handlers).
       * This drives the workflow progress visualization in the chat UI.
       *
       * @param phase - The current workflow phase (null to clear)
       * @param agent - The AI agent currently processing (optional)
       */
      setWorkflowPhase: (phase: WorkflowPhase | null, agent?: string) => {
        if (!phase) {
          set({ currentPhase: null, currentAgent: null });
          return;
        }
        set((state) => ({
          currentPhase: phase,
          currentAgent: agent || state.currentAgent,
          phaseHistory: [...state.phaseHistory, { phase, agent, timestamp: Date.now() }]
        }));
      },

      /** Clears workflow progress tracking */
      clearWorkflowProgress: () => {
        set({ currentPhase: null, currentAgent: null, phaseHistory: [] });
      }
    }),
    {
      // Persist configuration
      name: "finwise-chat-storage",  // localStorage key
      partialize: (state) => ({
        // Only persist currentSessionId (not messages — they're fetched fresh)
        currentSessionId: state.currentSessionId
      })
    }
  )
);

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **Zustand vs Redux**: Zustand is much simpler than Redux — no reducers,
 *    actions, or boilerplate. Just a function that returns state and actions.
 *
 * 2. **Optimistic Updates**: Adding the message to UI before the server responds
 *    makes the chat feel instant. The temp message is replaced with the real one
 *    on success, or removed on error.
 *
 * 3. **Persist Middleware**: Zustand's persist middleware saves selected state
 *    to localStorage. The partialize option controls what gets saved.
 *
 * 4. **SSE Integration**: The setWorkflowPhase action is called from SSE event
 *    handlers to update the workflow progress visualization in real-time.
 *
 * 5. **get() for Self-Calls**: Actions can call other actions using get()
 *    to access the current state and other actions.
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * chatStore.ts → used by ChatContainer, ChatInput, ChatMessageList, etc.
 * chatStore.ts → calls chatApi for server communication
 * chatStore.ts → updated by SSE event handlers for workflow progress
 * ══════════════════════════════════════════════════════════════════════
 */
