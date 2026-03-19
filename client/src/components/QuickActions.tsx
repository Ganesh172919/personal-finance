import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ArrowRight, FileText, Link2, LucideIcon, PlusCircle, Target } from "lucide-react";
import { useLocation } from "wouter";

interface QuickAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}

export function QuickActions() {
  const [, navigate] = useLocation();

  const actions: QuickAction[] = [
    {
      label: "Add Transaction",
      icon: PlusCircle,
      onClick: () => navigate("/transactions"),
    },
    {
      label: "New Goal",
      icon: Target,
      onClick: () => navigate("/goals-debts"),
    },
    {
      label: "View Reports",
      icon: FileText,
      onClick: () => navigate("/all-insights"),
    },
    {
      label: "Connect Account",
      icon: Link2,
      onClick: () => undefined,
      disabled: true,
      title: "Coming soon",
    },
  ];

  return (
    <Card className="p-6">
      <div className="mb-6 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
          Quick actions
        </p>
        <h3 className="text-lg font-semibold text-foreground">Jump straight into a task</h3>
        <p className="text-sm text-muted-foreground">
          Use these shortcuts when you already know the next move.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {actions.map((action) => (
          <motion.div
            key={action.label}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              variant="outline"
              className="group h-auto w-full flex-col items-start gap-4 rounded-[calc(var(--radius)-2px)] px-4 py-4 text-left"
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.title}
            >
              <div className="flex w-full items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <action.icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </div>
              <div className="space-y-1">
                <span className="block text-sm font-semibold text-foreground">{action.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {action.disabled ? "Available soon" : "Open now"}
                </span>
              </div>
            </Button>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}
