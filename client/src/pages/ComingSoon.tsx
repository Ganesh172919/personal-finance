/**
 * @fileoverview Placeholder page for features under development.
 *
 * A reusable component rendered for routes whose features are not yet
 * built. Accepts a title and description prop so the router can show
 * contextual text while keeping navigation links stable.
 *
 * No API calls or complex state; purely presentational.
 * Used as the default export for incomplete feature routes in the app.
 */

import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";

interface ComingSoonProps {
  title: string;
  description: string;
}

export default function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="flex-1 p-6 overflow-auto" data-testid={`${title.toLowerCase().replace(/\s/g, "-")}-page`}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto"
      >
        <h1 className="text-3xl font-bold text-foreground mb-2">{title}</h1>
        <p className="text-muted-foreground mb-8">{description}</p>

        <Card className="p-8">
          <p className="text-foreground text-sm">
            This section is intentionally routed and available so navigation remains stable while the feature is completed.
          </p>
        </Card>
      </motion.div>
    </div>
  );
}
