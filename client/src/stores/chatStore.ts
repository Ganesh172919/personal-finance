import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { IChatSession, IChatMessage } from "@/types/chat.types";
import * as chatApi from "@/services/chatApi";

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
  
  // Actions
  loadSessions: () => Promise<void>;
  createSession: () => Promise<IChatSession | null>;
  selectSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  sendMessage: (content: string, options?: { narrative?: boolean }) => Promise<void>;
  clearCurrentSession: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // Initial state
      sessions: [],
      currentSessionId: null,
      messages: [],
      isLoadingSessions: false,
      isLoadingMessages: false,
      isSending: false,

      // Load all sessions for the current user
      loadSessions: async () => {
        set({ isLoadingSessions: true });
        try {
          const response = await chatApi.fetchSessions();
          set({ sessions: response.sessions });
        } catch (error) {
          console.error("Failed to load sessions:", error);
        } finally {
          set({ isLoadingSessions: false });
        }
      },

      // Create a new chat session
      createSession: async () => {
        try {
          const newSession = await chatApi.createSession();
          set((state) => ({
            sessions: [newSession, ...state.sessions],
            currentSessionId: newSession.id,
            messages: []
          }));
          return newSession;
        } catch (error) {
          console.error("Failed to create session:", error);
          return null;
        }
      },

      // Select and load a session
      selectSession: async (sessionId: string) => {
        if (get().currentSessionId === sessionId) return;
        
        set({ isLoadingMessages: true, currentSessionId: sessionId, messages: [] });
        try {
          const response = await chatApi.fetchMessages(sessionId);
          set({ messages: response.messages });
        } catch (error) {
          console.error("Failed to load messages:", error);
        } finally {
          set({ isLoadingMessages: false });
        }
      },

      // Delete a session
      deleteSession: async (sessionId: string) => {
        try {
          await chatApi.deleteSession(sessionId);
          set((state) => {
            const newSessions = state.sessions.filter(s => s.id !== sessionId);
            const wasCurrentSession = state.currentSessionId === sessionId;
            return {
              sessions: newSessions,
              currentSessionId: wasCurrentSession ? null : state.currentSessionId,
              messages: wasCurrentSession ? [] : state.messages
            };
          });
        } catch (error) {
          console.error("Failed to delete session:", error);
        }
      },

      // Rename a session
      renameSession: async (sessionId: string, title: string) => {
        try {
          const updatedSession = await chatApi.renameSession(sessionId, title);
          set((state) => ({
            sessions: state.sessions.map(s =>
              s.id === sessionId ? { ...s, title: updatedSession.title } : s
            )
          }));
        } catch (error) {
          console.error("Failed to rename session:", error);
        }
      },

      // Send a message in the current session
      sendMessage: async (content: string, options?: { narrative?: boolean }) => {
        const { currentSessionId } = get();
        
        if (!currentSessionId) {
          // Create a new session first if none selected
          const newSession = await get().createSession();
          if (!newSession) return;
        }
        
        const sessionId = get().currentSessionId;
        if (!sessionId) return;
        
        set({ isSending: true });
        
        // Optimistically add user message
        const tempUserMessage: IChatMessage = {
          id: `temp-${Date.now()}`,
          sessionId,
          role: "user",
          content,
          createdAt: new Date().toISOString()
        };
        
        set((state) => ({
          messages: [...state.messages, tempUserMessage]
        }));
        
        try {
          const response = await chatApi.sendMessage(sessionId, content, options);
          
          // Replace temp message with real one and add AI response
          set((state) => ({
            messages: [
              ...state.messages.filter(m => m.id !== tempUserMessage.id),
              response.userMessage,
              response.assistantMessage
            ],
            // Update session in list
            sessions: state.sessions.map(s =>
              s.id === sessionId
                ? {
                    ...s,
                    title: response.userMessage.content.substring(0, 50) + 
                           (response.userMessage.content.length > 50 ? "..." : ""),
                    lastMessageAt: response.assistantMessage.createdAt,
                    messageCount: s.messageCount + 2
                  }
                : s
            )
          }));
        } catch (error) {
          console.error("Failed to send message:", error);
          // Remove optimistic message on error
          set((state) => ({
            messages: state.messages.filter(m => m.id !== tempUserMessage.id)
          }));
        } finally {
          set({ isSending: false });
        }
      },

      // Clear current session
      clearCurrentSession: () => {
        set({ currentSessionId: null, messages: [] });
      }
    }),
    {
      name: "finwise-chat-storage",
      partialize: (state) => ({
        currentSessionId: state.currentSessionId
      })
    }
  )
);
