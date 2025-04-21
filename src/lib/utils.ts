import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Define known connector categories
export enum ConnectorCategory {
  YoLink = 'yolink',
  Piko = 'piko',
  // Add other known categories here
}

// Mapping from category enum/string to display name
const categoryDisplayNames: Record<string, string> = {
  [ConnectorCategory.YoLink]: 'YoLink',
  [ConnectorCategory.Piko]: 'Piko',
  // Add other display names corresponding to the enum
};

/**
 * Formats a backend connector category identifier into a user-friendly display name.
 * @param category The raw category string (e.g., 'yolink', 'piko').
 * @returns The formatted display name (e.g., 'YoLink', 'Piko') or the original string if no mapping exists.
 */
export function formatConnectorCategory(category: string | undefined | null): string {
  if (!category) return 'Unknown'; // Handle null/undefined case
  
  // Lookup display name using the lowercase category identifier
  const lowerCategory = category.toLowerCase();
  return categoryDisplayNames[lowerCategory] || category; // Fallback to original category string
}
