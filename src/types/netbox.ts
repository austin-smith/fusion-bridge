export interface NetBoxReader {
  ReaderKey: number;
  Name: string;
  PortalOrder: number; // Included for completeness, though not used directly for 'devices' table yet
}

export interface NetBoxPortal {
  PortalKey: number;
  Name: string;
  Readers: NetBoxReader[];
}

// Base interface for identifying the type
interface NetBoxWebhookBasePayload {
  Type: string; // We'll check this value
}

// Specific payload for Device type
export interface NetBoxDeviceWebhookPayload extends NetBoxWebhookBasePayload {
  Type: "Device"; // Use literal type for discrimination
  Portals: NetBoxPortal[];
}

// Example of how you might add other types later
// export interface NetBoxEventWebhookPayload extends NetBoxWebhookBasePayload {
//   Type: "Event";
//   // ... other event properties
// }

// Union type for all possible NetBox payloads
export type NetBoxWebhookPayload = NetBoxDeviceWebhookPayload; // | NetBoxEventWebhookPayload; // Add others here 