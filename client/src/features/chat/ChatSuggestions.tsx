/**
 * @fileoverview Chat Suggestions Component
 *
 * Displays clickable suggestion cards when a chat session has no messages.
 * Provides common financial questions to help users get started.
 *
 * Suggestions avoid invented personal amounts and remain keyboard accessible.
 *
 * @module features/chat/ChatSuggestions
 */

import { motion } from "framer-motion";
import { Sparkles, PiggyBank, TrendingUp, Calculator } from "lucide-react";

// Properties configuring the empty conversation suggestions panel.
// Accepts an onSelect callback receiving the clicked prompt query string.
// Links starter prompts to composer dispatch routines for fast interaction.
interface ChatSuggestionsProps {
  onSelect: (suggestion: string) => void;
}

// Presents starter prompt tiles and onboarding recommendations for empty threads.
// Renders financial topic recommendations covering savings, investments, and audits.
// Dispatches chosen sample inquiries directly into the message submission pipeline.
export function ChatSuggestions({ onSelect }: ChatSuggestionsProps) {
  const suggestions = [
    {
      icon: TrendingUp,
      text: "Analyze my spending patterns this month",
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      icon: PiggyBank,
      text: "How much should I save each month for my goals?",
      gradient: "from-green-500 to-emerald-500",
    },
    {
      icon: Calculator,
      text: "Optimize my investment portfolio",
      gradient: "from-purple-500 to-pink-500",
    },
    {
      icon: Sparkles,
      text: "Suggest one next step from my saved activity",
      gradient: "from-orange-500 to-red-500",
    },
  ];

  return (
    <div className="flex h-full flex-col items-center justify-start overflow-y-auto px-5 py-8 sm:px-6 sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 text-center"
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/50">
          <Sparkles className="h-6 w-6 text-primary-foreground" />
        </div>
        <h2 className="mb-2 text-xl font-bold sm:text-2xl">How can I help you today?</h2>
        <p className="max-w-xl text-sm text-muted-foreground">
          Ask about your saved finances, or attach a document to explore its contents.
        </p>
      </motion.div>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-3 md:grid-cols-2">
        {suggestions.map((suggestion, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <button
              type="button"
              className="group w-full cursor-pointer rounded-lg border-2 bg-card p-3.5 text-left transition-all duration-200 hover:border-primary/50 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              onClick={() => onSelect(suggestion.text)}
            >
              <div className="flex items-start gap-3">
                <div className={`rounded-lg bg-gradient-to-br p-2 ${suggestion.gradient} text-white`}>
                  <suggestion.icon className="h-4 w-4" />
                </div>
                <p className="text-sm font-medium group-hover:text-primary transition-colors">
                  {suggestion.text}
                </p>
              </div>
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
