import { motion } from "framer-motion";
import { Sparkles, PiggyBank, TrendingUp, Calculator } from "lucide-react";
import { Card } from "@/components/ui/Card";

interface ChatSuggestionsProps {
  onSelect: (suggestion: string) => void;
}

const suggestions = [
  {
    icon: TrendingUp,
    text: "Analyze my spending patterns this month",
    gradient: "from-blue-500 to-cyan-500"
  },
  {
    icon: PiggyBank,
    text: "Can I afford a ₹1,00,000 vacation in 6 months?",
    gradient: "from-green-500 to-emerald-500"
  },
  {
    icon: Calculator,
    text: "Optimize my investment portfolio",
    gradient: "from-purple-500 to-pink-500"
  },
  {
    icon: Sparkles,
    text: "What if I buy a new phone for ₹50,000?",
    gradient: "from-orange-500 to-red-500"
  }
];

export function ChatSuggestions({ onSelect }: ChatSuggestionsProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-8 h-8 text-primary-foreground" />
        </div>
        <h2 className="text-2xl font-bold mb-2">How can I help you today?</h2>
        <p className="text-muted-foreground max-w-md">
          Ask me anything about your finances - from budgeting advice to investment strategies.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl w-full">
        {suggestions.map((suggestion, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card
              className="p-4 cursor-pointer hover:shadow-lg transition-all duration-200 border-2 hover:border-primary/50 group"
              onClick={() => onSelect(suggestion.text)}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg bg-gradient-to-br ${suggestion.gradient} text-white`}>
                  <suggestion.icon className="w-4 h-4" />
                </div>
                <p className="text-sm font-medium group-hover:text-primary transition-colors">
                  {suggestion.text}
                </p>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
