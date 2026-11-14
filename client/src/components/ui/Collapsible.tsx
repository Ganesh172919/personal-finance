"use client";

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

// Root wrapper component for expandable and collapsible panel content.
// Re-exports Radix UI CollapsiblePrimitive Root for managing open/closed states.
// Coordinates trigger events with animated content visibility transitions.
const Collapsible = CollapsiblePrimitive.Root;

// Action trigger component toggling the expansion of the Collapsible container.
// Re-exports Radix UI CollapsiblePrimitive CollapsibleTrigger with WAI-ARIA states.
// Manages aria-expanded accessibility attributes automatically on user interaction.
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

// Container element holding collapsible content that expands and collapses.
// Re-exports Radix UI CollapsiblePrimitive CollapsibleContent with transition styling.
// Clamped to zero height when closed and smoothly expands to full content height.
const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent;

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
