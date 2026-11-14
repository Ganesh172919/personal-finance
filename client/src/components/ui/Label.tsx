import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Defines styling variants for accessible text labels using CVA.
// Sets typography weight, sizing, and peer-disabled cursor and opacity rules.
// Synchronizes visual disabled appearance when associated inputs are disabled.
const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

// Form label component built on Radix UI LabelPrimitive Root.
// Connects programmatically to form inputs via htmlFor for accessibility.
// Forwards DOM references to the underlying Radix label primitive.
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
