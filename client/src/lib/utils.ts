import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Conditionally combines and resolves conflicting Tailwind CSS class names into one string.
// Leverages clsx for boolean and array handling followed by twMerge for deduplication.
// Serves as the universal class utility across all UI components and design systems.
/**
 * A utility function to conditionally merge Tailwind CSS classes without style conflicts.
 * @param inputs - A list of class names.
 * @returns A string of merged class names.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
