import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Defines styling variants for pill-shaped status and tag badges.
// Applies rounded-full border and compact typography with focus ring styling.
// Supports default, secondary, destructive, and outline color themes.
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

// TypeScript interface specifying props for the Badge component.
// Inherits standard HTML div attributes and class-variance-authority variants.
// Allows configuring custom variant themes and supplemental class overrides.
export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

// Visual indicator component for categorizing statuses, tags, and item counts.
// Renders an inline pill element styled according to the specified variant.
// Applies accessible keyboard focus rings and hover transitions smoothly.
function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
