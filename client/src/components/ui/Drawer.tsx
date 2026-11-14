"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";

// Root mobile-friendly bottom sheet drawer built on top of Vaul.
// Configures background scaling effects when opening drawer panels.
// Manages swipe gestures and touch dismissal physics natively on mobile devices.
const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root
    shouldScaleBackground={shouldScaleBackground}
    {...props}
  />
);
Drawer.displayName = "Drawer";

// Interactive trigger element opening the sliding bottom sheet drawer.
// Re-exports Vaul DrawerPrimitive Trigger with accessibility bindings.
// Manages aria-expanded and keyboard trigger activations automatically.
const DrawerTrigger = DrawerPrimitive.Trigger;

// Portal wrapper mounting drawer backdrop and slide-up sheet to body.
// Re-exports Vaul DrawerPrimitive Portal to prevent clipping from parent styles.
// Ensures bottom drawers slide out cleanly over the entire application viewport.
const DrawerPortal = DrawerPrimitive.Portal;

// Dismissal action trigger closing the active sliding drawer component.
// Re-exports Vaul DrawerPrimitive Close with accessible focus restoration.
// Returns user focus back to the triggering button upon drawer closure.
const DrawerClose = DrawerPrimitive.Close;

// Semi-transparent backdrop overlay appearing behind the sliding drawer.
// Applies dark fixed background with fade animations following drag gestures.
// Dismisses the active drawer when tapped or clicked outside sheet bounds.
const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/80", className)}
    {...props}
  />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

// Sliding panel container housing bottom sheet content with rounded top corners.
// Renders an accessible top drag pill handle for touch dragging down.
// Forwards DOM references to the underlying Vaul Content primitive.
const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background",
        className
      )}
      {...props}
    >
      <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = "DrawerContent";

// Layout wrapper structuring header titles and descriptions inside the drawer.
// Formats compact grid spacing centered on mobile and left-aligned on tablet/desktop.
// Forwards standard HTML div attributes to the header container.
const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
    {...props}
  />
);
DrawerHeader.displayName = "DrawerHeader";

// Action button container anchored to the bottom of the drawer content.
// Organizes action buttons in a flexible column layout with consistent padding.
// Pushed to bottom of the sheet automatically using top auto margins.
const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mt-auto flex flex-col gap-2 p-4", className)}
    {...props}
  />
);
DrawerFooter.displayName = "DrawerFooter";

// Primary accessible title element for the sliding drawer panel.
// Applies bold heading typography, large font size, and tight letter tracking.
// Forwards DOM references to the underlying Vaul Title primitive.
const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold text-foreground leading-none tracking-tight",
      className
    )}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

// Descriptive subtitle element explaining drawer context and interactions.
// Styled with small font size and muted colors for visual hierarchy.
// Forwards DOM references to the underlying Vaul Description primitive.
const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
