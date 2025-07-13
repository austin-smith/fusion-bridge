import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

// Import schemas from dedicated schemas file instead of route files
import { 
  createLocationSchema, 
  deviceSyncSchema,
  validatePinSchema,
  pinValidationResponseSchema,
  createSpaceSchema,
  updateSpaceSchema,
  assignDevicesToSpaceSchema,
  removeDevicesFromSpaceSchema,
  createAlarmZoneSchema,
  updateAlarmZoneSchema,
  assignDevicesToZoneSchema,
  removeDevicesFromZoneSchema,
  setZoneArmedStateSchema,
  addTriggerOverrideSchema,
  removeTriggerOverrideSchema
} from '../schemas/api-schemas';

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

// Define shared response schemas
const successResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  }).openapi('SuccessResponse');

const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string().describe('Error message'),
  details: z.any().optional().describe('Additional error details'),
}).openapi('ErrorResponse');

const paginatedResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: z.array(dataSchema),
    pagination: z.object({
      itemsPerPage: z.number().describe('Number of items per page'),
      currentPage: z.number().describe('Current page number'),
      hasNextPage: z.boolean().describe('Whether there is a next page'),
    }),
  }).openapi('PaginatedResponse');

// Define query schemas

const eventsQuerySchema = z.object({
  eventUuid: z.string().uuid().optional().describe('Get specific event by UUID'),
  page: z.string().regex(/^\d+$/).optional().describe('Page number (default: 1)'),
  limit: z.string().regex(/^\d+$/).optional().describe('Items per page (default: 50)'),
  count: z.enum(['true', 'false']).optional().describe('Return count only instead of data (OData style)'),
  eventCategories: z.string().optional().describe('Comma-separated event categories to filter by'),
  connectorCategory: z.string().optional().describe('Filter by connector category'),
  locationId: z.string().uuid().optional().describe('Filter by location UUID'),
  deviceNames: z.string().optional().describe('Comma-separated device names to filter by'),
  timeStart: z.string().optional().describe('Start time for filtering (ISO date string)'),
  timeEnd: z.string().optional().describe('End time for filtering (ISO date string)'),
}).openapi('EventsQuery');

const devicesQuerySchema = z.object({
  deviceId: z.string().optional().describe('Get specific device by external device ID'),
  count: z.enum(['true', 'false']).optional().describe('Return count only instead of data (OData style)'),
  connectorCategory: z.string().optional().describe('Filter by connector category (e.g., piko, yolink, genea)'),
  deviceType: z.string().optional().describe('Filter by device type'),
  status: z.string().optional().describe('Filter by device status'),
}).openapi('DevicesQuery');

// Define param schemas
const locationIdParamsSchema = z.object({
  id: z.string().uuid().describe('Location UUID'),
}).openapi('LocationIdParams');

const userIdParamsSchema = z.object({
  userId: z.string().uuid().describe('User UUID'),
}).openapi('UserIdParams');

// Define response data schemas (inferred from your existing types)
const spaceSchema = z.object({
  id: z.string().uuid().describe('Space UUID'),
  name: z.string().describe('Space name'),
  locationId: z.string().uuid().describe('Location UUID'),
  locationName: z.string().describe('Location name'),
  description: z.string().nullable().describe('Space description'),
  deviceIds: z.array(z.string()).describe('Array of device IDs assigned to this space'),
  createdAt: z.string().describe('Creation timestamp (ISO string)'),
  updatedAt: z.string().describe('Last update timestamp (ISO string)'),
}).openapi('Space');

const alarmZoneSchema = z.object({
  id: z.string().uuid().describe('Alarm zone UUID'),
  name: z.string().describe('Alarm zone name'),
  locationId: z.string().uuid().describe('Location UUID'),
  locationName: z.string().describe('Location name'),
  description: z.string().nullable().describe('Alarm zone description'),
  armedState: z.string().describe('Current armed state'),
  lastArmedStateChangeReason: z.string().nullable().describe('Reason for last armed state change'),
  triggerBehavior: z.enum(['standard', 'custom']).describe('Trigger behavior type'),
  deviceIds: z.array(z.string()).describe('Array of device IDs assigned to this zone'),
  createdAt: z.string().describe('Creation timestamp (ISO string)'),
  updatedAt: z.string().describe('Last update timestamp (ISO string)'),
}).openapi('AlarmZone');

const triggerOverrideSchema = z.object({
  id: z.string().uuid().describe('Override UUID'),
  zoneId: z.string().uuid().describe('Alarm zone UUID'),
  eventType: z.string().describe('Event type'),
  shouldTrigger: z.boolean().describe('Whether this event type should trigger alarm'),
  createdAt: z.string().describe('Creation timestamp (ISO string)'),
}).openapi('TriggerOverride');

const auditLogEntrySchema = z.object({
  id: z.string().uuid().describe('Audit log entry UUID'),
  zoneId: z.string().uuid().describe('Alarm zone UUID'),
  userId: z.string().uuid().nullable().describe('User UUID'),
  action: z.enum(['armed', 'disarmed', 'triggered', 'acknowledged']).describe('Action performed'),
  previousState: z.string().nullable().describe('Previous armed state'),
  newState: z.string().nullable().describe('New armed state'),
  reason: z.string().nullable().describe('Reason for action'),
  triggerEventId: z.string().nullable().describe('Event UUID that triggered the action'),
  createdAt: z.string().describe('Creation timestamp (ISO string)'),
}).openapi('AuditLogEntry');

const locationSchema = z.object({
  id: z.string().uuid().describe('Location UUID'),
  name: z.string().describe('Location name'),
  parentId: z.string().uuid().nullable().describe('Parent location UUID'),
  path: z.string().describe('Hierarchical path'),
  timeZone: z.string().describe('Timezone'),
  externalId: z.string().nullable().describe('External ID'),
  addressStreet: z.string().nullable().describe('Street address'),
  addressCity: z.string().nullable().describe('City'),
  addressState: z.string().nullable().describe('State'),
  addressPostalCode: z.string().nullable().describe('Postal code'),
  latitude: z.string().nullable().describe('Latitude coordinate as string'),
  longitude: z.string().nullable().describe('Longitude coordinate as string'),
  notes: z.string().nullable().describe('Notes'),
  createdAt: z.string().describe('Creation timestamp (ISO string)'),
  updatedAt: z.string().describe('Last update timestamp (ISO string)'),
}).openapi('Location');

const deviceSchema = z.object({
  id: z.string().describe('Internal device ID'),
  deviceId: z.string().describe('External device ID'),
  connectorId: z.string().describe('Connector ID'),
  connectorCategory: z.string().describe('Connector category'),
  connectorName: z.string().optional().describe('Connector name'),
  name: z.string().describe('Device name'),
  type: z.string().describe('Raw device type'),
  status: z.string().nullable().describe('Device status'),
  batteryPercentage: z.number().min(0).max(100).nullable().describe('Battery percentage (0-100, null if no battery data)'),
  vendor: z.string().nullable().describe('Device vendor'),
  model: z.string().nullable().describe('Device model'),
  url: z.string().nullable().describe('Device URL'),
  createdAt: z.string().describe('Creation timestamp (ISO string)'),
  updatedAt: z.string().describe('Last update timestamp (ISO string)'),
  serverId: z.string().nullable().describe('Server ID (e.g., Piko Server ID)'),
  serverName: z.string().nullable().describe('Server name'),
  pikoServerDetails: z.object({
    serverId: z.string().describe('Piko server ID'),
    name: z.string().describe('Piko server name'),
    status: z.string().nullable().describe('Server status'),
    version: z.string().nullable().describe('Server version'),
    osPlatform: z.string().nullable().describe('OS platform'),
    osVariantVersion: z.string().nullable().describe('OS variant version'),
    url: z.string().nullable().describe('Server URL'),
    createdAt: z.string().describe('Server creation timestamp'),
    updatedAt: z.string().describe('Server update timestamp'),
  }).nullable().describe('Piko server details if applicable'),
  locationId: z.string().nullable().describe('Location UUID'),
  spaceId: z.string().nullable().describe('Space UUID'),
  deviceTypeInfo: z.object({
    type: z.string().describe('Standardized device type'),
    subtype: z.string().nullable().describe('Standardized device subtype'),
  }).describe('Standardized device type information'),
  displayState: z.string().nullable().describe('Current display state'),
}).openapi('Device');

const eventSchema = z.object({
  id: z.number().describe('Event ID'),
  eventUuid: z.string().uuid().describe('Event UUID'),
  deviceId: z.string().describe('Device ID'),
  deviceName: z.string().optional().describe('Device name'),
  connectorId: z.string().describe('Connector ID'),
  connectorName: z.string().optional().describe('Connector name'),
  connectorCategory: z.string().describe('Connector category'),
  locationId: z.string().optional().describe('Location UUID'),
  locationName: z.string().optional().describe('Location name'),
  spaceId: z.string().optional().describe('Space UUID'),
  spaceName: z.string().optional().describe('Space name'),
  alarmZoneId: z.string().optional().describe('Alarm zone UUID that this device belongs to'),
  alarmZoneName: z.string().optional().describe('Alarm zone name that this device belongs to'),
  timestamp: z.number().describe('Event timestamp (epoch milliseconds)'),
  eventCategory: z.string().describe('Event category'),
  eventType: z.string().describe('Event type'),
  eventSubtype: z.string().optional().describe('Event subtype'),
  payload: z.record(z.any()).nullable().describe('Standardized event payload'),
  rawPayload: z.record(z.any()).nullable().describe('Raw event payload'),
  deviceTypeInfo: z.object({
    deviceType: z.string().describe('Device type'),
    category: z.string().describe('Device category'),
    displayName: z.string().describe('Display name'),
    supportedFeatures: z.array(z.string()).describe('Supported features'),
  }),
  displayState: z.string().optional().describe('Display state'),
  rawEventType: z.string().optional().describe('Raw event type'),
}).openapi('Event');

  // API Key Test schema (only endpoint that works with API keys)
  const apiKeyTestResponseSchema = z.object({
    success: z.literal(true),
    message: z.string().describe('Test result message'),
    timestamp: z.string().describe('Test timestamp (ISO string)'),
  }).openapi('ApiKeyTestResponse');

// SSE Event Stream schemas
const sseStreamQuerySchema = z.object({
  eventCategories: z.string().optional().describe('Comma-separated event categories to filter by'),
  eventTypes: z.string().optional().describe('Comma-separated event types to filter by'),
  includeThumbnails: z.boolean().optional().describe('Include Piko thumbnails for applicable events (default: false)'),
}).openapi('SSEStreamQuery');

const sseStatsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    organizationId: z.string().describe('Organization UUID'),
    activeConnections: z.number().describe('Number of active SSE connections for this organization'),
    subscribedChannels: z.number().describe('Number of Redis channels subscribed for this organization'),
    timestamp: z.string().describe('Current timestamp (ISO string)'),
    redis: z.object({
      healthy: z.boolean().describe('Whether Redis connection is healthy'),
      pingMs: z.number().nullable().describe('Redis ping latency in milliseconds'),
    }).describe('Redis connection status'),
  }),
}).openapi('SSEStatsResponse');

// Count response schemas for OData-style counting
const eventsCountResponseSchema = z.object({
  success: z.literal(true),
  count: z.number().describe('Total number of events matching the criteria'),
}).openapi('EventsCountResponse');

const devicesCountResponseSchema = z.object({
  success: z.literal(true),
  count: z.number().describe('Total number of devices matching the criteria'),
  filters: z.object({
    connectorCategory: z.string().optional().describe('Applied connector category filter'),
    deviceType: z.string().optional().describe('Applied device type filter'),
    status: z.string().optional().describe('Applied status filter'),
  }).describe('Applied filters'),
}).openapi('DevicesCountResponse');

const sseStreamResponseSchema = z.string().describe('Server-Sent Events stream in text/event-stream format. Includes connection events, real-time events, heartbeat messages, system notifications, error messages, and alarm zone state changes. Events may include Piko thumbnail data when includeThumbnails=true.').openapi('SSEStreamResponse', {
  example: `event: connection
data: {"type":"connection","organizationId":"org-123","timestamp":"2024-01-01T00:00:00.000Z"}

event: event  
data: {"eventUuid":"550e8400-e29b-41d4-a716-446655440000","timestamp":"2024-01-01T00:00:00.000Z","organizationId":"org-123","deviceId":"front-door-camera","deviceName":"Front Door Camera","connectorId":"piko-001","connectorName":"Piko Server Main","locationId":"home-location-456","locationName":"Main House","spaceId":"living-space-123","spaceName":"Living Room","event":{"categoryId":"analytics","category":"Analytics","typeId":"object_detected","type":"Object Detected","subTypeId":"person","subType":"Person","objectTrackId":"track_12345","confidence":0.95,"zone":"entrance"},"rawEvent":{"eventType":"analyticsSdkObjectDetected","eventResourceId":"front-door-camera","objectTrackId":"track_12345","timestamp":"2024-01-01T00:00:00Z"},"thumbnailUri":"data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="}

event: event
data: {"eventUuid":"550e8400-e29b-41d4-a716-446655440001","timestamp":"2024-01-01T00:01:00.000Z","organizationId":"org-123","deviceId":"side-gate-sensor","deviceName":"Side Gate Sensor","connectorId":"netbox-001","connectorName":"NetBox Controller","locationId":"home-location-456","locationName":"Main House","spaceId":"perimeter-space-124","spaceName":"Side Gate","event":{"categoryId":"security","category":"Security","typeId":"door_opened","type":"Door Opened","motion":true,"zone":"side_entrance"},"rawEvent":{"event_type":"door","sensor_id":"side-gate-sensor","state":"open","timestamp":"2024-01-01T00:01:00Z"}}

event: alarm-zone
data: {"type":"alarm-zone","organizationId":"org-123","timestamp":"2024-01-01T00:02:00.000Z","alarmZone":{"id":"perimeter-zone-123","name":"Perimeter Security","locationId":"home-location-456","locationName":"Main House","previousState":"DISARMED","previousStateDisplayName":"Disarmed","currentState":"ARMED","currentStateDisplayName":"Armed"}}

event: heartbeat
data: {"type":"heartbeat","timestamp":"2024-01-01T00:00:30.000Z"}

event: system
data: {"type":"system","message":"Redis connection lost","timestamp":"2024-01-01T00:01:00.000Z"}

event: system
data: {"type":"system","message":"Redis connection restored","timestamp":"2024-01-01T00:01:30.000Z"}

event: system
data: {"type":"system","message":"Server restarting - reconnect in 5000ms","timestamp":"2024-01-01T00:02:00.000Z"}

event: error
data: {"type":"error","error":"Connection authentication failed","code":"AUTH_ERROR","timestamp":"2024-01-01T00:01:15.000Z"}`
});

export function generateOpenApiSpec() {
  const registry = new OpenAPIRegistry();

  // Register all schemas
  registry.register('Event', eventSchema);
  registry.register('CreateLocationRequest', createLocationSchema.openapi('CreateLocationRequest'));
  registry.register('LocationIdParams', locationIdParamsSchema);
  registry.register('Location', locationSchema);
  registry.register('DeviceSyncRequest', deviceSyncSchema.openapi('DeviceSyncRequest'));
  registry.register('Device', deviceSchema);
  registry.register('ErrorResponse', errorResponseSchema);
  registry.register('ApiKeyTestResponse', apiKeyTestResponseSchema);
  
  // PIN management schemas
  registry.register('ValidatePinRequest', validatePinSchema.openapi('ValidatePinRequest'));
  registry.register('PinValidationResponse', pinValidationResponseSchema.openapi('PinValidationResponse'));
  registry.register('UserIdParams', userIdParamsSchema);
  
  // Spaces and alarm zones schemas
  registry.register('CreateSpaceRequest', createSpaceSchema.openapi('CreateSpaceRequest'));
  registry.register('UpdateSpaceRequest', updateSpaceSchema.openapi('UpdateSpaceRequest'));
  registry.register('AssignDevicesToSpaceRequest', assignDevicesToSpaceSchema.openapi('AssignDevicesToSpaceRequest'));
  registry.register('RemoveDevicesFromSpaceRequest', removeDevicesFromSpaceSchema.openapi('RemoveDevicesFromSpaceRequest'));
  registry.register('CreateAlarmZoneRequest', createAlarmZoneSchema.openapi('CreateAlarmZoneRequest'));
  registry.register('UpdateAlarmZoneRequest', updateAlarmZoneSchema.openapi('UpdateAlarmZoneRequest'));
  registry.register('AssignDevicesToZoneRequest', assignDevicesToZoneSchema.openapi('AssignDevicesToZoneRequest'));
  registry.register('RemoveDevicesFromZoneRequest', removeDevicesFromZoneSchema.openapi('RemoveDevicesFromZoneRequest'));
  registry.register('SetZoneArmedStateRequest', setZoneArmedStateSchema.openapi('SetZoneArmedStateRequest'));
  registry.register('AddTriggerOverrideRequest', addTriggerOverrideSchema.openapi('AddTriggerOverrideRequest'));
  registry.register('RemoveTriggerOverrideRequest', removeTriggerOverrideSchema.openapi('RemoveTriggerOverrideRequest'));
  registry.register('Space', spaceSchema);
  registry.register('AlarmZone', alarmZoneSchema);
  registry.register('TriggerOverride', triggerOverrideSchema);
  registry.register('AuditLogEntry', auditLogEntrySchema);

  // SSE Event Stream schemas
  registry.register('SSEStreamQuery', sseStreamQuerySchema);
  registry.register('SSEStatsResponse', sseStatsResponseSchema);
  registry.register('SSEStreamResponse', sseStreamResponseSchema);

  // Count response schemas
  registry.register('EventsCountResponse', eventsCountResponseSchema);
  registry.register('DevicesCountResponse', devicesCountResponseSchema);

  // Register response schemas
  const eventSuccessResponse = successResponseSchema(eventSchema);
  const eventsPagedResponse = paginatedResponseSchema(eventSchema);
  const locationsSuccessResponse = successResponseSchema(z.array(locationSchema));
  const locationSuccessResponse = successResponseSchema(locationSchema);
  const devicesSuccessResponse = successResponseSchema(z.array(deviceSchema));
  const deleteSuccessResponse = successResponseSchema(z.object({ id: z.string() }));
  
  // PIN management response schemas
  const pinValidationSuccessResponse = successResponseSchema(pinValidationResponseSchema);
  
  // Spaces and alarm zones response schemas
  const spacesSuccessResponse = successResponseSchema(z.array(spaceSchema));
  const spaceSuccessResponse = successResponseSchema(spaceSchema);
  const alarmZonesSuccessResponse = successResponseSchema(z.array(alarmZoneSchema));
  const alarmZoneSuccessResponse = successResponseSchema(alarmZoneSchema);
  const triggerOverridesSuccessResponse = successResponseSchema(z.array(triggerOverrideSchema));
  const triggerOverrideSuccessResponse = successResponseSchema(triggerOverrideSchema);
  const auditLogSuccessResponse = z.object({
    success: z.literal(true),
    data: z.array(auditLogEntrySchema),
    pagination: z.object({
      limit: z.number(),
      offset: z.number(),
      hasMore: z.boolean(),
    }),
  });
  const deviceAssignmentSuccessResponse = successResponseSchema(z.object({ 
    spaceId: z.string(), 
    deviceIds: z.array(z.string())
  }));
  const zoneDevicesSuccessResponse = successResponseSchema(z.object({ 
    zoneId: z.string(), 
    deviceIds: z.array(z.string())
  }));

  registry.register('EventSuccessResponse', eventSuccessResponse);
  registry.register('EventsPagedResponse', eventsPagedResponse);
  registry.register('LocationsSuccessResponse', locationsSuccessResponse);
  registry.register('LocationSuccessResponse', locationSuccessResponse);
  registry.register('DevicesSuccessResponse', devicesSuccessResponse);
  registry.register('DeleteSuccessResponse', deleteSuccessResponse);

  // PIN management response schemas
  registry.register('PinValidationSuccessResponse', pinValidationSuccessResponse);
  
  // Spaces and alarm zones response schemas
  registry.register('SpacesSuccessResponse', spacesSuccessResponse);
  registry.register('SpaceSuccessResponse', spaceSuccessResponse);
  registry.register('AlarmZonesSuccessResponse', alarmZonesSuccessResponse);
  registry.register('AlarmZoneSuccessResponse', alarmZoneSuccessResponse);
  registry.register('TriggerOverridesSuccessResponse', triggerOverridesSuccessResponse);
  registry.register('TriggerOverrideSuccessResponse', triggerOverrideSuccessResponse);
  registry.register('AuditLogSuccessResponse', auditLogSuccessResponse);
  registry.register('DeviceAssignmentSuccessResponse', deviceAssignmentSuccessResponse);
  registry.register('ZoneDevicesSuccessResponse', zoneDevicesSuccessResponse);

  // Events endpoints
  registry.registerPath({
    method: 'get',
    path: '/api/events',
    summary: 'Get events',
    description: 'Retrieve events with optional filtering and pagination. Can fetch a single event by UUID, a paginated list with filters, or just a count. Use count=true for OData-style counting.',
    tags: ['Events'],
    request: {
      query: eventsQuerySchema,
    },
    responses: {
      200: {
        description: 'Events data - single event, paginated list, or count only',
        content: {
          'application/json': {
            schema: {
              oneOf: [
                { $ref: '#/components/schemas/EventSuccessResponse' },
                { $ref: '#/components/schemas/EventsPagedResponse' },
                { $ref: '#/components/schemas/EventsCountResponse' },
              ],
            },
          },
        },
      },
      404: {
        description: 'Event not found (when eventUuid provided)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/events/dashboard',
    summary: 'Get dashboard events',
    description: 'Get recent events for dashboard display with summary statistics',
    tags: ['Events'],
    responses: {
      200: {
        description: 'Dashboard events data',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/EventsPagedResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  // SSE Event Stream endpoints
  registry.registerPath({
    method: 'get',
    path: '/api/events/stream',
    summary: 'Real-time event stream (SSE)',
    description: 'Server-Sent Events endpoint for real-time event streaming.',
    tags: ['Events'],
    request: {
      query: sseStreamQuerySchema,
    },
    responses: {
      200: {
        description: 'Server-Sent Events stream',
        content: {
          'text/event-stream': {
            schema: { $ref: '#/components/schemas/SSEStreamResponse' },
          },
        },
        headers: {
          'Content-Type': {
            description: 'text/event-stream',
            schema: { type: 'string' }
          },
          'Cache-Control': {
            description: 'no-cache, no-transform',
            schema: { type: 'string' }
          },
          'Connection': {
            description: 'keep-alive',
            schema: { type: 'string' }
          }
        }
      },
      401: {
        description: 'Authentication required - missing or invalid API key',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      429: {
        description: 'Connection limit exceeded - maximum 5 connections per API key',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/events/stream/stats',
    summary: 'SSE connection statistics',
    description: 'Get connection statistics for the requesting organization including active connections and Redis health.',
    tags: ['Events'],
    responses: {
      200: {
        description: 'Connection statistics',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SSEStatsResponse' },
          },
        },
      },
      401: {
        description: 'Authentication required - missing or invalid API key',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  // Locations endpoints
  registry.registerPath({
    method: 'get',
    path: '/api/locations',
    summary: 'Get all locations',
    description: 'Retrieves all locations',
    tags: ['Locations'],
    responses: {
      200: {
        description: 'List of locations',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/LocationsSuccessResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/locations',
    summary: 'Create a new location',
    description: 'Creates a new location with the specified name',
    tags: ['Locations'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: createLocationSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Location created successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/LocationSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid input or validation error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  // Individual location endpoints
  registry.registerPath({
    method: 'get',
    path: '/api/locations/{id}',
    summary: 'Get specific location',
    description: 'Retrieves a single location by ID',
    tags: ['Locations'],
    request: {
      params: locationIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Location retrieved successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/LocationSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Location not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/locations/{id}',
    summary: 'Update location',
    description: 'Updates a location\'s properties including name, parent, address, etc.',
    tags: ['Locations'],
    request: {
      params: locationIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: createLocationSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Location updated successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/LocationSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid input, ID format, or circular dependency',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Location or new parent location not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/locations/{id}',
    summary: 'Delete location',
    description: 'Deletes a location and its descendants (cascade)',
    tags: ['Locations'],
    request: {
      params: locationIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Location deleted successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DeleteSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  // Devices endpoints
  registry.registerPath({
    method: 'get',
    path: '/api/devices',
    summary: 'Get devices',
    description: 'Retrieve devices with optional filtering. Can fetch all devices, a specific device by deviceId, or just a count. Use count=true for OData-style counting.',
    tags: ['Devices'],
    request: {
      query: devicesQuerySchema,
    },
    responses: {
      200: {
        description: 'Device data - single device, device list, or count only',
        content: {
          'application/json': {
            schema: {
              oneOf: [
                { $ref: '#/components/schemas/DevicesSuccessResponse' },
                { $ref: '#/components/schemas/DevicesCountResponse' },
              ],
            },
          },
        },
      },
      404: {
        description: 'Device not found (when deviceId provided)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/devices',
    summary: 'Sync devices',
    description: 'Triggers device synchronization for a specific connector',
    tags: ['Devices'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: deviceSyncSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Device sync completed successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DevicesSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid connector ID or validation error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Connector not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  // API Key Test endpoint (only admin endpoint that works with API keys)
  registry.registerPath({
    method: 'get',
    path: '/api/admin/api-keys/test',
    summary: 'Validate API key',
    description: 'Validates the provided API key and returns detailed information about the key, associated user, and organization scope. This endpoint works with both session and API key authentication.',
    tags: ['API Keys'],
    responses: {
      200: {
        description: 'API key validation successful',
        content: {
          'application/json': {
            schema: successResponseSchema(z.object({
              message: z.string().describe('Test result message'),
              timestamp: z.string().describe('Test timestamp (ISO string)'),
              authMethod: z.string().describe('Authentication method used'),
              userId: z.string().describe('User ID associated with the auth'),
              organizationInfo: z.object({
                id: z.string().uuid(),
                name: z.string(),
                slug: z.string(),
                logo: z.string().nullable(),
                metadata: z.record(z.any()).nullable(),
                createdAt: z.string(),
                updatedAt: z.string(),
              }).nullable().describe('Organization information if API key is scoped to an organization or user has active organization'),
              sessionInfo: z.object({
                user: z.object({
                  id: z.string(),
                  email: z.string(),
                  name: z.string(),
                }),
                hasSession: z.boolean(),
              }).optional().describe('Session info if authenticated via session'),
              apiKeyInfo: z.object({
                keyId: z.string(),
                keyName: z.string(),
                rateLimitEnabled: z.boolean(),
                remaining: z.number().optional(),
              }).optional().describe('API key info if authenticated via API key'),
            })),
          },
        },
      },
      401: {
        description: 'Invalid or missing API key',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  // PIN Management endpoints
  registry.registerPath({
    method: 'post',
    path: '/api/alarm/keypad/validate-pin',
    summary: 'Validate keypad PIN',
    description: 'Validates a 6-digit PIN and returns user information if valid. Used by keypad devices for authentication.',
    tags: ['Alarm Keypad'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: validatePinSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'PIN validation result (always returns 200, check valid field)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PinValidationSuccessResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  // Spaces endpoints
  registry.registerPath({
    method: 'get',
    path: '/api/spaces',
    summary: 'Get all spaces',
    description: 'Retrieves all physical spaces with their device assignments',
    tags: ['Spaces'],
    responses: {
      200: {
        description: 'List of spaces',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SpacesSuccessResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/spaces',
    summary: 'Create a new space',
    description: 'Creates a new physical space with specified name and location',
    tags: ['Spaces'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: createSpaceSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Space created successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SpaceSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid input or validation error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Location not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/spaces/{id}',
    summary: 'Get specific space',
    description: 'Retrieves a single space by ID',
    tags: ['Spaces'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Space UUID'),
      }),
    },
    responses: {
      200: {
        description: 'Space retrieved successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SpaceSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Space not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/spaces/{id}',
    summary: 'Update space',
    description: 'Updates a space\'s name, description, or location assignment',
    tags: ['Spaces'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Space UUID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: updateSpaceSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Space updated successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SpaceSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid input or ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Space not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/spaces/{id}',
    summary: 'Delete space',
    description: 'Deletes a space and removes all device assignments',
    tags: ['Spaces'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Space UUID'),
      }),
    },
    responses: {
      200: {
        description: 'Space deleted successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DeleteSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Space not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/spaces/{id}/devices',
    summary: 'Get devices in space',
    description: 'Retrieves all devices assigned to a space',
    tags: ['Spaces'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Space UUID'),
      }),
    },
    responses: {
      200: {
        description: 'Devices retrieved successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DevicesSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Space not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/spaces/{id}/devices',
    summary: 'Assign devices to space',
    description: 'Assigns one or more devices to a space',
    tags: ['Spaces'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Space UUID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: assignDevicesToSpaceSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Devices assigned successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DeviceAssignmentSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid input or ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Space not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/spaces/{id}/devices',
    summary: 'Remove devices from space',
    description: 'Removes one or more device assignments from a space',
    tags: ['Spaces'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Space UUID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: removeDevicesFromSpaceSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Devices removed successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DeviceAssignmentSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid input or ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Space not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  // Alarm Zones endpoints
  registry.registerPath({
    method: 'get',
    path: '/api/alarm-zones',
    summary: 'Get all alarm zones',
    description: 'Retrieves all alarm zones with their device assignments and armed states',
    tags: ['Alarm Zones'],
    responses: {
      200: {
        description: 'List of alarm zones',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AlarmZonesSuccessResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/alarm-zones',
    summary: 'Create a new alarm zone',
    description: 'Creates a new alarm zone for security management',
    tags: ['Alarm Zones'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: createAlarmZoneSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Alarm zone created successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AlarmZoneSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid input or validation error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Location not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/alarm-zones/{id}',
    summary: 'Get specific alarm zone',
    description: 'Retrieves a single alarm zone by ID',
    tags: ['Alarm Zones'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Alarm zone UUID'),
      }),
    },
    responses: {
      200: {
        description: 'Alarm zone retrieved successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AlarmZoneSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Alarm zone not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/alarm-zones/{id}',
    summary: 'Update alarm zone',
    description: 'Updates an alarm zone\'s name, description, or trigger behavior',
    tags: ['Alarm Zones'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Alarm zone UUID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: updateAlarmZoneSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Alarm zone updated successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AlarmZoneSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid input or ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Alarm zone not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/alarm-zones/{id}',
    summary: 'Delete alarm zone',
    description: 'Deletes an alarm zone and removes all device assignments',
    tags: ['Alarm Zones'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Alarm zone UUID'),
      }),
    },
    responses: {
      200: {
        description: 'Alarm zone deleted successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DeleteSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Alarm zone not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/alarm-zones/{id}/devices',
    summary: 'Get devices in alarm zone',
    description: 'Retrieves all devices assigned to an alarm zone',
    tags: ['Alarm Zones'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Alarm zone UUID'),
      }),
    },
    responses: {
      200: {
        description: 'Devices retrieved successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/DevicesSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Alarm zone not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/alarm-zones/{id}/devices',
    summary: 'Assign devices to alarm zone',
    description: 'Assigns multiple devices to an alarm zone',
    tags: ['Alarm Zones'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Alarm zone UUID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: assignDevicesToZoneSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Devices assigned successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ZoneDevicesSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid input or ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Alarm zone not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/alarm-zones/{id}/devices',
    summary: 'Remove devices from alarm zone',
    description: 'Removes multiple devices from an alarm zone',
    tags: ['Alarm Zones'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Alarm zone UUID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: removeDevicesFromZoneSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Devices removed successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ZoneDevicesSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid input or ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Alarm zone not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/alarm-zones/{id}/arm-state',
    summary: 'Set alarm zone armed state',
    description: 'Arms or disarms an alarm zone with audit logging',
    tags: ['Alarm Zones'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Alarm zone UUID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: setZoneArmedStateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Armed state updated successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AlarmZoneSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid input or ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Alarm zone not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/alarm-zones/{id}/trigger-overrides',
    summary: 'Get trigger overrides',
    description: 'Retrieves custom trigger overrides for an alarm zone',
    tags: ['Alarm Zones'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Alarm zone UUID'),
      }),
    },
    responses: {
      200: {
        description: 'Trigger overrides retrieved successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/TriggerOverridesSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Alarm zone not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/alarm-zones/{id}/trigger-overrides',
    summary: 'Add trigger override',
    description: 'Adds or updates a custom trigger override for an alarm zone',
    tags: ['Alarm Zones'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Alarm zone UUID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: addTriggerOverrideSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Trigger override added successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/TriggerOverrideSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid input or ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Alarm zone not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/alarm-zones/{id}/trigger-overrides',
    summary: 'Remove trigger override',
    description: 'Removes a custom trigger override from an alarm zone',
    tags: ['Alarm Zones'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Alarm zone UUID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: removeTriggerOverrideSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Trigger override removed successfully',
        content: {
          'application/json': {
            schema: successResponseSchema(z.object({
              zoneId: z.string(),
              eventType: z.string(),
            })),
          },
        },
      },
      400: {
        description: 'Invalid input or ID format',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Alarm zone not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/alarm-zones/{id}/audit-log',
    summary: 'Get audit log',
    description: 'Retrieves audit log for an alarm zone with pagination',
    tags: ['Alarm Zones'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('Alarm zone UUID'),
      }),
      query: z.object({
        limit: z.string().regex(/^\d+$/).optional().describe('Number of entries to return (default: 100, max: 1000)'),
        offset: z.string().regex(/^\d+$/).optional().describe('Number of entries to skip (default: 0)'),
      }),
    },
    responses: {
      200: {
        description: 'Audit log retrieved successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AuditLogSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid ID format or pagination parameters',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      404: {
        description: 'Alarm zone not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  });

  // Generate the OpenAPI document
  const generator = new OpenApiGeneratorV3(registry.definitions);
  
  const document = generator.generateDocument({
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'Fusion API',
      description: 'Unify. Automate. Protect.',
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' 
          ? 'https://fusion-bridge-production.up.railway.app' 
          : 'http://localhost:3000',
        description: process.env.NODE_ENV === 'production' 
          ? 'Production server' 
          : 'Development server',
      },
    ],
  });

  // Sort paths alphabetically
  if (document.paths) {
    const sortedPaths: Record<string, any> = {};
    Object.keys(document.paths)
      .sort()
      .forEach(path => {
        sortedPaths[path] = document.paths![path];
      });
    document.paths = sortedPaths;
  }

  // Extract and sort tags from all endpoints
  const tagSet = new Set<string>();
  if (document.paths) {
    Object.values(document.paths).forEach((pathObj: any) => {
      Object.values(pathObj).forEach((methodObj: any) => {
        if (methodObj.tags) {
          methodObj.tags.forEach((tag: string) => tagSet.add(tag));
        }
      });
    });
  }

  // Add sorted tags to the document
  document.tags = Array.from(tagSet)
    .sort()
    .map(tag => ({ name: tag }));

  return document;
} 
