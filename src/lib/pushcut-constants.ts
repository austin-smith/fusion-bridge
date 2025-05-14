export interface PushcutSoundOption {
  value: string;
  label: string;
  description?: string; // Optional description for UI
}

export const PUSHHCUT_SOUND_OPTIONS: PushcutSoundOption[] = [
  { value: "system", label: "System Default" },
  { value: "none", label: "None (Silent)" },
  { value: "vibrateOnly", label: "Vibrate Only" },
  { value: "subtle", label: "Subtle" },
  { value: "question", label: "Question" },
  { value: "jobDone", label: "Job Done" },
  { value: "problem", label: "Problem" },
  { value: "loud", label: "Loud Alert" },
  { value: "lasers", label: "Lasers" },
  // Add a placeholder or instruction for custom sounds if needed, 
  // but the actual input will likely be a text field if custom sounds are frequently used.
  // For a select, we generally list predefined ones.
  // The Zod schema already allows any string for maximum flexibility.
];

// Future constants for Pushcut can be added here, for example:
// - Default action types if we create a more structured UI for them
// - Categories of Pushcut specific settings or parameters 