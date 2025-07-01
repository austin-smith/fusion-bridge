// src/lib/pushover-constants.ts

// Define priority options with descriptions
export const priorityOptions = [
  { value: -2, label: 'Lowest', description: 'No notification is generated. On iOS, the application badge number will be increased.' },
  { value: -1, label: 'Low', description: 'Will not generate sound/vibration, but will still generate a notification.' },
  { value: 0, label: 'Normal', description: 'Default. Will trigger sound, vibration, and display an alert according to device settings.' },
  { value: 1, label: 'High', description: 'Notification will bypass quiet hours. Always has sound/vibration, regardless of delivery time.' },
  { value: 2, label: 'Emergency', description: 'Similar to high priority, but repeats until acknowledged. Requires retry and expire parameters to be supplied.' },
]; 