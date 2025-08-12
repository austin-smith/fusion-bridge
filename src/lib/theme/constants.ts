// Shared theme constants and types (server-safe)

export const PREFERRED_THEME_FAMILY_KEY = 'user-preferred-theme-family';

export const THEME_FAMILY_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'cosmic-night', label: 'Cosmic Night' },
  { value: 'mono', label: 'Mono' },
  { value: 't3-chat', label: 'T3 Chat' },
] as const;

export type ThemeFamilyOption = typeof THEME_FAMILY_OPTIONS[number];
export type ThemeFamilyValue = ThemeFamilyOption['value'];
export type KnownFamily = Exclude<ThemeFamilyValue, 'default'>;

export const THEME_FAMILIES = THEME_FAMILY_OPTIONS
  .filter((o) => o.value !== 'default')
  .map((o) => o.value) as readonly KnownFamily[];

export function isKnownFamily(value: string): value is KnownFamily {
  return (THEME_FAMILIES as readonly string[]).includes(value);
}

