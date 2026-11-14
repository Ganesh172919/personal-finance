import * as React from "react";

import { cn } from "../../lib/utils";

// Primary structural surface component for content groupings and dashboards.
// Applies rounded borders, card surface background, and subtle shadow depth.
// Forwards DOM references to the outer container div element.
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-[calc(var(--radius)+2px)] border bg-card text-card-foreground shadow-[0_22px_45px_-34px_rgba(15,23,42,0.65)] transition-[transform,box-shadow,border-color] duration-300",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

// Top header section of a Card housing the title and description elements.
// Configures vertical flex column layout with consistent padding around headers.
// Forwards DOM references to the underlying div element.
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

// Prominent typography heading element for the title of a Card container.
// Sets large font sizing, bold weight, and tight character tracking.
// Forwards DOM references to the underlying heading div element.
const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

// Secondary explanatory text positioned beneath the CardTitle in CardHeader.
// Styled with small font size and muted foreground colors for visual contrast.
// Forwards DOM references to the underlying paragraph or div element.
const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

// Main body container for primary content and interactive elements within a Card.
// Applies horizontal and bottom padding while resetting top padding under headers.
// Forwards DOM references to the inner content div element.
const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

// Bottom action bar container for buttons, links, or timestamps within a Card.
// Aligns items horizontally with flexbox and consistent bottom padding.
// Forwards DOM references to the footer div element.
const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
