import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PlusCircle, Target, FileText, Link } from "lucide-react";

export function QuickActions() {
  const actions = [
    {
      label: "Add Transaction",
      icon: PlusCircle,
      onClick: () => console.log("Add Transaction clicked"),
    },
    {
      label: "New Goal",
      icon: Target,
      onClick: () => console.log("New Goal clicked"),
    },
    {
      label: "View Reports",
      icon: FileText,
      onClick: () => console.log("View Reports clicked"),
    },
    {
      label: "Connect Account",
      icon: Link,
      onClick: () => console.log("Connect Account clicked"),
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
