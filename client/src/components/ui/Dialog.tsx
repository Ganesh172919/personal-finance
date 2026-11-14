"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// Root modal dialog container coordinating open and close lifecycle states.
// Built on Radix UI DialogPrimitive Root for accessible focus trapping.
// Renders modals, settings windows, and multi-step creation workflows.
const Dialog = DialogPrimitive.Root;

// Trigger button component that toggles open state of the parent dialog.
// Re-exports Radix UI DialogPrimitive Trigger with keyboard activation.
// Automatically controls aria-haspopup and aria-expanded attributes.
const DialogTrigger = DialogPrimitive.Trigger;

// Portal wrapper mounting modal overlays and content into document body.
// Re-exports Radix UI DialogPrimitive Portal to bypass stacking context.
// Ensures modal dialogs stay above all standard application layer elements.
const DialogPortal = DialogPrimitive.Portal;

// Action button primitive that dismisses the active modal dialog on click.
// Re-exports Radix UI DialogPrimitive Close with accessible focus restoration.
// Returns focus back to the triggering element upon modal dismissal.
const DialogClose = DialogPrimitive.Close;

// Dimmed background overlay covering the viewport behind the dialog modal.
// Implements fade-in and fade-out animations synchronized with dialog state.
// Prevents interactions with underlying page content while modal is open.
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

// Centered modal dialog container hosting interactive header, body, and footer.
// Features built-in dismiss X button, zoom/fade transitions, and scrolling.
// Forwards DOM references to the underlying Radix Content primitive.
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        "min-w-0 w-[calc(100%_-_2rem)] max-h-[calc(100dvh_-_2rem)] overflow-y-auto rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

// Header layout section organizing modal titles and descriptive explanations.
// Aligns text centrally on mobile viewports and left-aligned on desktop screens.
// Forwards HTML attributes to the header container element.
const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

// Action button container positioned at the bottom edge of the dialog modal.
// Arranges action buttons in reverse vertical column on mobile and row on desktop.
// Houses primary submission actions and secondary cancellation buttons.
const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

// Accessible title heading element for the modal dialog window.
// Sets bold font weight, large typography, and tight character tracking.
// Forwards DOM references to the Radix Title primitive for screen readers.
const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold text-foreground leading-none tracking-tight",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

// Subtitle description explaining modal purpose and instructions.
// Styled with small font size and muted text colors for visual hierarchy.
// Forwards DOM references to the underlying Radix Description primitive.
const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
