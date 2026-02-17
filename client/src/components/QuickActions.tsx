import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PlusCircle, Target, FileText, Link2, LucideIcon } from "lucide-react";
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
      <h3 className="text-lg font-semibold mb-6 text-foreground">Quick Actions</h3>
      <div className="grid grid-cols-2 gap-4">
        {actions.map((action) => (
          <motion.div
            key={action.label}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button
              variant="outline"
              className="w-full h-auto py-4 flex flex-col gap-2 items-center justify-center border-border hover:bg-accent hover:text-accent-foreground"
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.title}
            >
              <action.icon className="h-6 w-6 mb-1" />
              <span className="text-sm font-medium">{action.label}</span>
            </Button>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}
