import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { ButtonProps, buttonVariants } from "@/components/ui/Button";

// Accessible navigation bar wrapping multi-page pagination controls.
// Renders an HTML nav element configured with role="navigation" and aria-label.
// Centers pagination list links horizontally across the viewport width.
const Pagination = ({ className, ...props }: React.ComponentProps<"nav">) => (
  <nav
    role="navigation"
    aria-label="pagination"
    className={cn("mx-auto flex w-full justify-center", className)}
    {...props}
  />
);
Pagination.displayName = "Pagination";

// Unordered list container organizing sequential page links and buttons.
// Applies flexbox layout aligning items horizontally with consistent gap.
// Forwards DOM references to the underlying ul list element.
const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("flex flex-row items-center gap-1", className)}
    {...props}
  />
));
PaginationContent.displayName = "PaginationContent";

// Individual list item wrapping a page number link or navigation button.
// Forwards DOM references to the underlying li list item element.
// Preserves semantic list structure required for assistive screen readers.
const PaginationItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
));
PaginationItem.displayName = "PaginationItem";

// Type definition for interactive pagination links and page buttons.
// Combines active page state boolean with button size and anchor attributes.
// Configures visual button variants based on whether the page is active.
type PaginationLinkProps = {
  isActive?: boolean;
} & Pick<ButtonProps, "size"> &
  React.ComponentProps<"a">;

// Interactive page number button navigating between pagination pages.
// Highlights active pages with outline styling and sets aria-current="page".
// Uses ghost button variant for unselected pages with accessible hover states.
const PaginationLink = ({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps) => (
  <a
    aria-current={isActive ? "page" : undefined}
    className={cn(
      buttonVariants({
        variant: isActive ? "outline" : "ghost",
        size,
      }),
      className
    )}
    {...props}
  />
);
PaginationLink.displayName = "PaginationLink";

// Action button navigating backwards to the preceding pagination page.
// Renders a left-pointing ChevronLeft icon alongside descriptive text.
// Configures aria-label="Go to previous page" for screen reader clarity.
const PaginationPrevious = ({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) => (
  <PaginationLink
    aria-label="Go to previous page"
    size="default"
    className={cn("gap-1 pl-2.5", className)}
    {...props}
  >
    <ChevronLeft className="h-4 w-4" />
    <span>Previous</span>
  </PaginationLink>
);
PaginationPrevious.displayName = "PaginationPrevious";

// Action button navigating forward to the subsequent pagination page.
// Renders descriptive text alongside a right-pointing ChevronRight icon.
// Configures aria-label="Go to next page" for accessible page navigation.
const PaginationNext = ({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) => (
  <PaginationLink
    aria-label="Go to next page"
    size="default"
    className={cn("gap-1 pr-2.5", className)}
    {...props}
  >
    <span>Next</span>
    <ChevronRight className="h-4 w-4" />
  </PaginationLink>
);
PaginationNext.displayName = "PaginationNext";

// Ellipsis indicator representing skipped page ranges in long pagination bars.
// Renders horizontal three dots with aria-hidden="true" and screen-reader text.
// Preserves compact layout when paginating across dozens of data pages.
const PaginationEllipsis = ({
  className,
  ...props
}: React.ComponentProps<"span">) => (
  <span
    aria-hidden
    className={cn("flex h-9 w-9 items-center justify-center", className)}
    {...props}
  >
    <MoreHorizontal className="h-4 w-4" />
    <span className="sr-only">More pages</span>
  </span>
);
PaginationEllipsis.displayName = "PaginationEllipsis";

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
