import { motion } from "framer-motion";
import { Sparkles, PiggyBank, TrendingUp, Calculator } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useOrgFormatters } from "@/hooks/useOrgFormatters";

interface ChatSuggestionsProps {
  onSelect: (suggestion: string) => void;
}

export function ChatSuggestions({ onSelect }: ChatSuggestionsProps) {
  const { formatMoney } = useOrgFormatters();
  const vacation = formatMoney(100000, { maximumFractionDigits: 0 });
  const phone = formatMoney(50000, { maximumFractionDigits: 0 });

  const suggestions = [
    {
      icon: TrendingUp,
      text: "Analyze my spending patterns this month",
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      icon: PiggyBank,
      text: `Can I afford a ${vacation} vacation in 6 months?`,
      gradient: "from-green-500 to-emerald-500",
    },
    {
      icon: Calculator,
      text: "Optimize my investment portfolio",
      gradient: "from-purple-500 to-pink-500",
    },
    {
      icon: Sparkles,
      text: `What if I buy a new phone for ${phone}?`,
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
          Ask a finance question, upload supporting files in the composer, and let the multi-agent workflow build a grounded answer.
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
            <Card
              className="group cursor-pointer border-2 p-3.5 transition-all duration-200 hover:border-primary/50 hover:shadow-lg"
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
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
