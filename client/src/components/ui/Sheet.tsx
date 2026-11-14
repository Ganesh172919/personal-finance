"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// Root slide-out panel sheet container managing open and closed state.
// Built on Radix UI Dialog Primitive with off-canvas drawer animations.
// Powers mobile menus, inspection drawers, and editing side-panels.
const Sheet = SheetPrimitive.Root;

// Interactive button trigger opening the slide-out sheet panel on click.
// Re-exports Radix UI DialogPrimitive Trigger with WAI-ARIA popup attributes.
// Automatically controls aria-expanded state and opens the sheet content.
const SheetTrigger = SheetPrimitive.Trigger;

// Interactive action button dismissing the active slide-out sheet panel.
// Re-exports Radix UI DialogPrimitive Close with focus restoration.
// Returns focus back to the triggering element upon sheet closure.
const SheetClose = SheetPrimitive.Close;

// Portal wrapper mounting slide-out sheet overlays into the document body.
// Re-exports Radix UI DialogPrimitive Portal to break out of ancestor clipping.
// Ensures off-canvas sheets render seamlessly over the entire viewport.
const SheetPortal = SheetPrimitive.Portal;

// Darkened backdrop overlay appearing behind the active slide-out sheet.
// Fades in and out synchronously with sheet open and close lifecycle states.
// Intercepts pointer events to dismiss the sheet on outside tap or click.
const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

// Styling variants for slide-out sheets using class-variance-authority.
// Supports four slide-in edge origins: top, bottom, left, and right.
// Configures smooth enter and exit slide animations based on open state.
const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
);

// Props interface for the SheetContent sliding panel component.
// Combines native dialog content attributes with sheet variant options.
// Allows specifying the slide-in directional side and custom class overrides.
interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

// Slide-out panel container hosting headers, body content, and action footers.
// Includes dismiss close button with X icon and directional animations.
// Forwards DOM references to the underlying Radix Content primitive.
const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = SheetPrimitive.Content.displayName;

// Layout wrapper structuring title and description headers inside the sheet.
// Formats vertical flex column with text centering on mobile and left alignment.
// Forwards standard HTML div attributes to the header container.
const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
);
SheetHeader.displayName = "SheetHeader";

// Action button container anchored at the bottom of the slide-out sheet.
// Arranges action buttons in reverse vertical column on mobile and row on desktop.
// Houses primary submission actions and secondary cancellation buttons.
const SheetFooter = ({
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
SheetFooter.displayName = "SheetFooter";

// Primary accessible heading element for the slide-out sheet panel.
// Applies bold heading typography, large font size, and tight letter tracking.
// Forwards DOM references to the underlying Radix Title primitive.
const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

// Subtitle description explaining sheet context and interactive instructions.
// Styled with small font size and muted colors for visual hierarchy.
// Forwards DOM references to the underlying Radix Description primitive.
const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
