import * as AspectRatioPrimitive from "@radix-ui/react-aspect-ratio";

// Component enforcing a fixed aspect ratio for media and graphical containers.
// Re-exports Radix UI AspectRatioPrimitive Root for responsive dimensions.
// Prevents cumulative layout shifts when loading responsive images and embeds.
const AspectRatio = AspectRatioPrimitive.Root;

export { AspectRatio };
