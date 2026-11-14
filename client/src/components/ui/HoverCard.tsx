"use client";

import * as React from "react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";

import { cn } from "@/lib/utils";

// Root hover card container coordinating hover interaction states and timers.
// Wraps Radix UI HoverCardPrimitive Root for accessible peek previews.
// Enables users to preview contextual content behind links or avatars on hover.
const HoverCard = HoverCardPrimitive.Root;

// Interactive trigger element opening the hover card on pointer mouse enter.
// Re-exports Radix UI HoverCardPrimitive Trigger with focus and hover handlers.
// Manages delay timers to prevent accidental activations during quick pointer passes.
const HoverCardTrigger = HoverCardPrimitive.Trigger;

// Floating content card revealed when hovering the associated trigger element.
// Implements popover borders, shadows, and smooth directional animations.
// Forwards DOM references to the underlying Radix HoverCard Content primitive.
const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <HoverCardPrimitive.Content
    ref={ref}
    align={align}
    sideOffset={sideOffset}
    className={cn(
      "z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-hover-card-content-transform-origin]",
      className
    )}
    {...props}
  />
));
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardTrigger, HoverCardContent };
