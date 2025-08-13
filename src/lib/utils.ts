import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Define known connector categories
export enum ConnectorCategory {
  Genea = 'Genea',
  NetBox = 'netbox',
  YoLink = 'yolink',
  Piko = 'piko',
}

// Mapping from category enum/string to display name
const categoryDisplayNames: Record<string, string> = {
  [ConnectorCategory.Genea.toLowerCase()]: 'Genea',
  [ConnectorCategory.NetBox.toLowerCase()]: 'NetBox',
  [ConnectorCategory.YoLink.toLowerCase()]: 'YoLink',
  [ConnectorCategory.Piko.toLowerCase()]: 'Piko',
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

/**
 * Normalizes camera/device identifiers that may include curly braces from upstream systems.
 * Example: "{abcdef-...}" -> "abcdef-...". If falsy, returns empty string.
 */
export function sanitizeCameraId(id: string | undefined | null): string {
  if (!id) return '';
  return id.replace(/[{}]/g, '');
}
