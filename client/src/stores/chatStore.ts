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
 * MINDMAP FLOW
 * ------------
 * ```
 * ChatStore (Zustand)
 * ├── 1. Session Management
 * │   ├── sessions: IChatSession[]
 * │   ├── currentSessionId: string | null (Persisted to localStorage)
 * │   ├── loadSessions() / createSession() / selectSession()
 * │   └── renameSession() / deleteSession()
 * ├── 2. Message History & Optimistic Updates
 * │   ├── messages: IChatMessage[]
 * │   ├── sendMessage(content, fileAttachments):
 * │   │   ├── Stage 1: Add temp user message immediately
 * │   │   ├── Stage 2: Trigger AI streaming / REST request
 * │   │   ├── Stage 3: Replace temp ID with server ID & append AI message
 * │   │   └── Stage 4: Rollback & show toast on failure
 * ├── 3. AI Workflow Phase State
 * │   ├── currentWorkflowPhase: WorkflowPhase (idle | routing | processing | complete | error)
 * │   ├── activeAgents: string[] (List of specialists currently executing)
 * │   └── activeActionType & priority tracking
 * └── 4. Error Logging & Resilience
 *     ├── reportClientError integration
 *     └── Error boundary toast notifications
 * ```
 *
 * ASCII FLOW
 * ----------
 * ```
 *   +---------------------------------------------------------------+
 *   |                   User Submits Chat Message                   |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |               Step 1: Optimistic UI Injection                 |
 *   |  - Add temporary user message to messages list                |
 *   |  - Set currentWorkflowPhase = "routing"                       |
 *   |  - Set isSending = true                                       |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                                   v
 *   +---------------------------------------------------------------+
 *   |               Step 2: API Request (chatApi.sendMessage)       |
 *   +-------------------------------+-------------------------------+
 *                                   |
 *                         [Server Response Status]
 *                                /          \
 *                              SUCCESS       ERROR
 *                              /              \
 *                             v                v
 *   +-------------------------------+   +-----------------------------+
 *   | - Replace temp message with   |   | - Remove temp user message  |
 *   |   official server message     |   | - currentWorkflowPhase="err"|
 *   | - Append AI response message  |   | - Trigger Toast & Log Error |
 *   | - currentWorkflowPhase="done" |   +-----------------------------+
 *   +-------------------------------+
 * ```
 *
 * @module stores/chatStore
 */

import { create } from "zustand";                    // State management
import { persist } from "zustand/middleware";         // localStorage persistence
import type { IChatSession, IChatMessage } from "@/types/chat.types";
import type { WorkflowPhase } from "@/features/chat/TypingIndicator";
import * as chatApi from "@/services/chatApi";        // Chat API client
import { reportClientError } from "@/lib/runtimeLogger"; // Error reporting
import { toast } from "@/hooks/useToast"; // Toast notifications

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
let dataRevision = 0;

interface ChatState {
  dataScope: string | null;
  bindDataScope: (scope: string | null) => void;
  // Sessions state
  sessions: IChatSession[];
  currentSessionId: string | null;

  // Messages state for current session
  messages: IChatMessage[];

  // Loading states
  isLoadingSessions: boolean;
  isLoadingMessages: boolean;
  messageLoadError: string | null;
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
  sendMessage: (content: string, options?: { narrative?: boolean; fileIds?: string[] }) => Promise<boolean>;
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
      dataScope: null,
      bindDataScope: (scope) => {
        if (get().dataScope === scope) return;
        dataRevision += 1;
        set({ dataScope: scope, sessions: [], currentSessionId: null, messages: [],
          isLoadingSessions: false, isLoadingMessages: false, messageLoadError: null,
          isSending: false, currentPhase: null, currentAgent: null, phaseHistory: [] });
      },
      sessions: [],
      currentSessionId: null,
      messages: [],
      isLoadingSessions: false,
      isLoadingMessages: false,
      messageLoadError: null,
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
        const revision = dataRevision;
        set({ isLoadingSessions: true });
        try {
          const response = await chatApi.fetchSessions();
          if (revision !== dataRevision) return;
          set({ sessions: response.sessions });
        } catch (error) {
          if (revision !== dataRevision) return;
          reportClientError("Failed to load sessions", error);
          toast({ title: "Failed to load chat sessions", variant: "destructive" });
        } finally {
          if (revision === dataRevision) set({ isLoadingSessions: false });
        }
      },

      /**
       * Creates a new chat session and selects it.
       * Prepends the new session to the sessions list.
       */
      createSession: async () => {
        const revision = dataRevision;
        try {
          const newSession = await chatApi.createSession();
          if (revision !== dataRevision) return null;
          set((state) => ({
            sessions: [newSession, ...state.sessions],  // Prepend to list
            currentSessionId: newSession.id,             // Auto-select
            messages: [],                                // Clear messages
            messageLoadError: null,
          }));
          return newSession;
        } catch (error) {
          if (revision !== dataRevision) return null;
          reportClientError("Failed to create session", error);
          toast({ title: "Failed to create chat session", variant: "destructive" });
          return null;
        }
      },

      /**
       * Selects a session and loads its messages.
       * Rehydrates persisted selections whose messages have not loaded yet.
       */
      selectSession: async (sessionId: string) => {
        const revision = dataRevision;
        const state = get();
        if (state.currentSessionId === sessionId && (state.isLoadingMessages || state.messages.length > 0)) return;

        set({ isLoadingMessages: true, messageLoadError: null, currentSessionId: sessionId, messages: [] });
        try {
          const response = await chatApi.fetchMessages(sessionId);
          // A slower previous selection must not replace the active thread.
          if (revision === dataRevision && get().currentSessionId === sessionId) set({ messages: response.messages });
        } catch (error) {
          if (revision !== dataRevision) return;
          reportClientError("Failed to load messages", error);
          if (get().currentSessionId === sessionId) set({ messageLoadError: "This conversation could not be loaded. Try again or open another chat." });
        } finally {
          if (revision === dataRevision && get().currentSessionId === sessionId) set({ isLoadingMessages: false });
        }
      },

      /**
       * Deletes a session and clears it if it was the current session.
       */
      deleteSession: async (sessionId: string) => {
        const revision = dataRevision;
        try {
          await chatApi.deleteSession(sessionId);
          if (revision !== dataRevision) return;
          set((state) => {
            const newSessions = state.sessions.filter(s => s.id !== sessionId);
            const wasCurrentSession = state.currentSessionId === sessionId;
            return {
              sessions: newSessions,
              // Clear current session if it was the deleted one
              currentSessionId: wasCurrentSession ? null : state.currentSessionId,
              messages: wasCurrentSession ? [] : state.messages,
              messageLoadError: wasCurrentSession ? null : state.messageLoadError,
            };
          });
        } catch (error) {
          if (revision !== dataRevision) return;
          reportClientError("Failed to delete session", error);
          toast({ title: "Failed to delete session", variant: "destructive" });
        }
      },

      /**
       * Renames a session title.
       */
      renameSession: async (sessionId: string, title: string) => {
        const revision = dataRevision;
        try {
          const updatedSession = await chatApi.renameSession(sessionId, title);
          if (revision !== dataRevision) return;
          set((state) => ({
            sessions: state.sessions.map(s =>
              s.id === sessionId ? { ...s, title: updatedSession.title } : s
            )
          }));
        } catch (error) {
          if (revision !== dataRevision) return;
          reportClientError("Failed to rename session", error);
          toast({ title: "Failed to rename session", variant: "destructive" });
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
        const revision = dataRevision;
        if (get().isSending) return false;
        set({ isSending: true });
        const { currentSessionId } = get();

        // Auto-create session if none selected
        if (!currentSessionId) {
          const newSession = await get().createSession();
          if (revision !== dataRevision) return false;
          if (!newSession) { set({ isSending: false }); return false; }
        }

        const sessionId = get().currentSessionId;
        if (!sessionId) { set({ isSending: false }); return false; }

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
          if (revision !== dataRevision) return false;

          // Replace temp message with real messages from server
          set((state) => ({
            messages: state.currentSessionId === sessionId ? [
              ...state.messages.filter(m => m.id !== tempUserMessage.id), // Remove temp
              response.userMessage,        // Real user message
              response.assistantMessage    // AI response
            ] : state.messages,
            // Update session metadata in the sidebar
            sessions: state.sessions.map(s =>
              s.id === sessionId
                ? {
                    ...s,
                    // Auto-generate title from first message
                    title: s.messageCount === 0 ? response.userMessage.content.substring(0, 50) +
                           (response.userMessage.content.length > 50 ? "..." : "") : s.title,
                    lastMessageAt: response.assistantMessage.createdAt,
                    messageCount: s.messageCount + 2
                  }
                : s
            ),
            currentPhase: state.currentSessionId === sessionId ? "complete" : state.currentPhase,
            phaseHistory: state.currentSessionId === sessionId ? [...state.phaseHistory, { phase: "complete", timestamp: Date.now() }] : state.phaseHistory
          }));
          return true;
        } catch (error) {
          if (revision !== dataRevision) return false;
          reportClientError("Failed to send message", error);
          toast({ title: "Failed to send message. Please try again.", variant: "destructive" });
          // Remove optimistic message on error
          if (get().currentSessionId === sessionId) set((state) => ({
            messages: state.messages.filter(m => m.id !== tempUserMessage.id),
            currentPhase: "error",
            phaseHistory: [...state.phaseHistory, { phase: "error", timestamp: Date.now() }]
          }));
          return false;
        } finally {
          if (revision === dataRevision) set({ isSending: false });
        }
      },

      // ── Utility Actions ────────────────────────────────────────────

      /** Clears the current session state (used when navigating away) */
      clearCurrentSession: () => {
        set({ currentSessionId: null, messages: [], messageLoadError: null, currentPhase: null, currentAgent: null, phaseHistory: [] });
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
        currentSessionId: state.currentSessionId,
        dataScope: state.dataScope,
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
