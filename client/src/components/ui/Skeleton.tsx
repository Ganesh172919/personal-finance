import { cn } from "@/lib/utils";

// Loading placeholder component rendering an animated pulsing shape.
// Mimics content dimensions to reduce visual disruption during data fetching.
// Accepts custom sizing, border radii, and styling classes via props.
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
