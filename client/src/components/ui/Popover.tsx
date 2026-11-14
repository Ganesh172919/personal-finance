import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

// Root popover component managing anchored overlay visibility state.
// Wraps Radix UI PopoverPrimitive Root for focus trapping and collision detection.
// Anchors interactive popover content cards to button triggers and icons.
const Popover = PopoverPrimitive.Root;

// Interactive button trigger toggling visibility of the anchored popover card.
// Re-exports Radix UI PopoverPrimitive Trigger with WAI-ARIA popup attributes.
// Automatically controls aria-expanded state and positions the attached popover.
const PopoverTrigger = PopoverPrimitive.Trigger;

// Floating card container rendered inside a portal when the popover opens.
// Features popover styling, directional zoom animations, and shadow elevation.
// Handles viewport collision avoidance and custom horizontal/vertical alignment.
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-popover-content-transform-origin]",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
