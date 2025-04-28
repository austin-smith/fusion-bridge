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

// --- Payload for Event type ---
export interface NetBoxEventWebhookPayload extends NetBoxWebhookBasePayload {
  Type: "Event"; // Use literal type for discrimination
  RawXmlBase64: string;
  Activityid: string;
  Descname: string;
  Cdt: string;
  Partname?: string;
  Personid?: number;
  Personname?: string;
  Portalkey?: number;
  Portalname?: string;
  Rdrname?: string;
  Readerkey?: number;
  Reader2key?: number;
  Acname?: string;
  Acnum?: number;
  Nodename?: string;
  Nodeunique?: string;
  Nodeaddress?: string;
  Ndt?: string;
  Timestamp: string;
}

// Union type for all possible NetBox payloads
export type NetBoxWebhookPayload =
  | NetBoxDeviceWebhookPayload
  | NetBoxEventWebhookPayload; // Add Event type to the union 