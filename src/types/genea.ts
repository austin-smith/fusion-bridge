// TypeScript interfaces for Genea webhook payloads
// Based on Genea API documentation: https://apidocs-accesscontrol.getgenea.com/#834bb26f-e840-469b-a72f-9bde73ac932c

export interface GeneaActor {
  type: string; // e.g., "USER"
  user_location_uuid?: string;
  user_location_role?: string;
  user_uuid?: string;
  user_name?: string;
  user_email?: string;
  user_avatar_url?: string;
}

export interface GeneaLocation {
  uuid: string;
  name: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string | null;
  timezone?: string;
  latitude?: number;
  longitude?: number;
}

export interface GeneaDoor {
  uuid: string;
  name: string;
  door_status?: string; // e.g., "OPEN", "CLOSED"
  model?: string; // e.g., "HID_RP10"
}

export interface GeneaControllerConnection {
  primary_host_connection?: {
    data_security_mode?: string;
    encryption_status?: string;
    connection_type?: string;
  };
}

export interface GeneaController {
  uuid: string;
  name?: string;
  mac?: string;
  model?: string;
  status?: string; // e.g., "ONLINE", "OFFLINE"
  serial_number?: string;
  connection?: GeneaControllerConnection;
}

export interface GeneaBadgeType {
  uuid: string;
  name: string;
}

export interface GeneaCard {
  uuid: string;
  type?: string; // e.g., "KEYCARD"
  status?: string; // e.g., "ACTIVE"
  card_number?: string;
  start_date?: string; // ISO 8601
  end_date?: string | null; // ISO 8601
  badge_type?: GeneaBadgeType;
}

export interface GeneaMetadata {
  version?: number;
  [key: string]: any; // Allow additional metadata fields
}

export interface GeneaEventWebhookPayload {
  uuid: string; // Event UUID
  event_time: string; // ISO 8601 timestamp
  event_type: string; // e.g., "ACCESS"
  event_action: string; // e.g., "SEQUR_ACCESS_DENIED_BEFORE_ACTIVATION_DATE"
  event_message: string; // Human-readable message
  event_note?: string | null;
  
  // Contextual objects
  actor?: GeneaActor;
  location?: GeneaLocation;
  door?: GeneaDoor;
  controller?: GeneaController;
  card?: GeneaCard;
  metadata?: GeneaMetadata;
  
  created_at: string; // ISO 8601 timestamp
  
  // Allow additional fields for extensibility
  [key: string]: any;
}

// Type guard to check if payload is a Genea event
export function isGeneaEventPayload(payload: any): payload is GeneaEventWebhookPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof payload.uuid === 'string' &&
    typeof payload.event_time === 'string' &&
    typeof payload.event_type === 'string' &&
    typeof payload.event_action === 'string' &&
    typeof payload.event_message === 'string' &&
    typeof payload.created_at === 'string'
  );
} 