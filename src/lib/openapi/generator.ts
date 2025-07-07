import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

// Import schemas from dedicated schemas file instead of route files
import { 
  createAreaSchema, 
  updateAreaSchema, 
  updateArmedStateSchema, 
  createLocationSchema, 
  deviceSyncSchema,
  validatePinSchema,
  pinValidationResponseSchema
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
const areasQuerySchema = z.object({
  locationId: z.string().uuid().optional().describe('Filter by location UUID'),
}).openapi('AreasQuery');

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
const areaIdParamsSchema = z.object({
  id: z.string().uuid().describe('Area UUID'),
}).openapi('AreaIdParams');

const locationIdParamsSchema = z.object({
  id: z.string().uuid().describe('Location UUID'),
}).openapi('LocationIdParams');

const userIdParamsSchema = z.object({
  userId: z.string().uuid().describe('User UUID'),
}).openapi('UserIdParams');

// Define response data schemas (inferred from your existing types)
const areaSchema = z.object({
  id: z.string().uuid().describe('Area UUID'),
  name: z.string().describe('Area name'),
  locationId: z.string().uuid().describe('Location UUID'),
  locationName: z.string().describe('Location name'),
  armedState: z.string().describe('Current armed state'),
  deviceIds: z.array(z.string()).describe('Array of device IDs assigned to this area'),
  nextScheduledArmTime: z.string().nullable().describe('Next scheduled arm time (ISO string)'),
  nextScheduledDisarmTime: z.string().nullable().describe('Next scheduled disarm time (ISO string)'),
  lastArmedStateChangeReason: z.string().nullable().describe('Reason for last armed state change'),
  isArmingSkippedUntil: z.string().nullable().describe('Arming skipped until time (ISO string)'),
  createdAt: z.string().describe('Creation timestamp (ISO string)'),
  updatedAt: z.string().describe('Last update timestamp (ISO string)'),
}).openapi('Area');

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
  areaId: z.string().nullable().describe('Area UUID'),
  locationId: z.string().nullable().describe('Location UUID'),
  associationCount: z.number().nullable().describe('Number of associated devices'),
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
  areaId: z.string().optional().describe('Area UUID'),
  areaName: z.string().optional().describe('Area name'),
  locationId: z.string().optional().describe('Location UUID'),
  locationName: z.string().optional().describe('Location name'),
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

// Admin schemas (create basic ones since they don't exist yet)
const createApiKeySchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').describe('API key name'),
}).openapi('CreateApiKeyRequest');

const updateApiKeySchema = z.object({
  enabled: z.boolean().describe('Whether the API key is enabled or disabled'),
}).openapi('UpdateApiKeyRequest');

const apiKeySchema = z.object({
  id: z.string().uuid().describe('API key UUID'),
  name: z.string().describe('API key name'),
  keyPreview: z.string().describe('First 8 characters of the API key'),
  createdAt: z.string().describe('Creation timestamp (ISO string)'),
  lastUsedAt: z.string().nullable().describe('Last used timestamp (ISO string)'),
}).openapi('ApiKey');

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

const sseStreamResponseSchema = z.string().describe('Server-Sent Events stream in text/event-stream format. Includes connection events, real-time events, heartbeat messages, system notifications, error messages, and arming state changes. Events may include Piko thumbnail data when includeThumbnails=true.').openapi('SSEStreamResponse', {
  example: `event: connection
data: {"type":"connection","organizationId":"org-123","timestamp":"2024-01-01T00:00:00.000Z"}

event: event  
data: {"eventUuid":"550e8400-e29b-41d4-a716-446655440000","timestamp":"2024-01-01T00:00:00.000Z","organizationId":"org-123","deviceId":"front-door-camera","deviceName":"Front Door Camera","connectorId":"piko-001","connectorName":"Piko Server Main","locationId":"home-location-456","locationName":"Main House","areaId":"living-area-123","areaName":"Living Area","event":{"categoryId":"analytics","category":"Analytics","typeId":"object_detected","type":"Object Detected","subTypeId":"person","subType":"Person","objectTrackId":"track_12345","confidence":0.95,"zone":"entrance"},"rawEvent":{"eventType":"analyticsSdkObjectDetected","eventResourceId":"front-door-camera","objectTrackId":"track_12345","timestamp":"2024-01-01T00:00:00Z"},"thumbnailData":{"data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==","contentType":"image/jpeg","size":1024}}

event: event
data: {"eventUuid":"550e8400-e29b-41d4-a716-446655440001","timestamp":"2024-01-01T00:01:00.000Z","organizationId":"org-123","deviceId":"side-gate-sensor","deviceName":"Side Gate Sensor","connectorId":"netbox-001","connectorName":"NetBox Controller","locationId":"home-location-456","locationName":"Main House","areaId":"perimeter-area-124","areaName":"Perimeter","event":{"categoryId":"security","category":"Security","typeId":"door_opened","type":"Door Opened","motion":true,"zone":"side_entrance"},"rawEvent":{"event_type":"door","sensor_id":"side-gate-sensor","state":"open","timestamp":"2024-01-01T00:01:00Z"}}

event: arming
data: {"type":"arming","organizationId":"org-123","timestamp":"2024-01-01T00:02:00.000Z","area":{"id":"living-area-123","name":"Living Area","locationId":"home-location-456","locationName":"Main House","previousState":"DISARMED","previousStateDisplayName":"Disarmed","currentState":"ARMED_AWAY","currentStateDisplayName":"Armed - Away"}}

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
  registry.register('CreateAreaRequest', createAreaSchema.openapi('CreateAreaRequest'));
  registry.register('UpdateAreaRequest', updateAreaSchema.openapi('UpdateAreaRequest'));
  registry.register('UpdateArmedStateRequest', updateArmedStateSchema.openapi('UpdateArmedStateRequest'));
  registry.register('AreaIdParams', areaIdParamsSchema);
  registry.register('Area', areaSchema);
  registry.register('Event', eventSchema);
  registry.register('CreateLocationRequest', createLocationSchema.openapi('CreateLocationRequest'));
  registry.register('LocationIdParams', locationIdParamsSchema);
  registry.register('Location', locationSchema);
  registry.register('DeviceSyncRequest', deviceSyncSchema.openapi('DeviceSyncRequest'));
  registry.register('Device', deviceSchema);
  registry.register('CreateApiKeyRequest', createApiKeySchema);
  registry.register('UpdateApiKeyRequest', updateApiKeySchema);
  registry.register('ApiKey', apiKeySchema);
  registry.register('ErrorResponse', errorResponseSchema);
  registry.register('ApiKeyTestResponse', apiKeyTestResponseSchema);
  
  // PIN management schemas
  registry.register('ValidatePinRequest', validatePinSchema.openapi('ValidatePinRequest'));
  registry.register('PinValidationResponse', pinValidationResponseSchema.openapi('PinValidationResponse'));
  registry.register('UserIdParams', userIdParamsSchema);

  // SSE Event Stream schemas
  registry.register('SSEStreamQuery', sseStreamQuerySchema);
  registry.register('SSEStatsResponse', sseStatsResponseSchema);
  registry.register('SSEStreamResponse', sseStreamResponseSchema);

  // Count response schemas
  registry.register('EventsCountResponse', eventsCountResponseSchema);
  registry.register('DevicesCountResponse', devicesCountResponseSchema);

  // Register response schemas
  const areasSuccessResponse = successResponseSchema(z.array(areaSchema));
  const areaSuccessResponse = successResponseSchema(areaSchema);
  const eventSuccessResponse = successResponseSchema(eventSchema);
  const eventsPagedResponse = paginatedResponseSchema(eventSchema);
  const locationsSuccessResponse = successResponseSchema(z.array(locationSchema));
  const locationSuccessResponse = successResponseSchema(locationSchema);
  const devicesSuccessResponse = successResponseSchema(z.array(deviceSchema));
  const apiKeysSuccessResponse = successResponseSchema(z.array(apiKeySchema));
  const apiKeySuccessResponse = successResponseSchema(apiKeySchema);
  const deleteSuccessResponse = successResponseSchema(z.object({ id: z.string() }));
  
  // PIN management response schemas
  const pinValidationSuccessResponse = successResponseSchema(pinValidationResponseSchema);

  registry.register('AreasSuccessResponse', areasSuccessResponse);
  registry.register('AreaSuccessResponse', areaSuccessResponse);
  registry.register('EventSuccessResponse', eventSuccessResponse);
  registry.register('EventsPagedResponse', eventsPagedResponse);
  registry.register('LocationsSuccessResponse', locationsSuccessResponse);
  registry.register('LocationSuccessResponse', locationSuccessResponse);
  registry.register('DevicesSuccessResponse', devicesSuccessResponse);
  registry.register('ApiKeysSuccessResponse', apiKeysSuccessResponse);
  registry.register('ApiKeySuccessResponse', apiKeySuccessResponse);
  registry.register('DeleteSuccessResponse', deleteSuccessResponse);

  // PIN management response schemas
  registry.register('PinValidationSuccessResponse', pinValidationSuccessResponse);

  // Areas endpoints
  registry.registerPath({
    method: 'get',
    path: '/api/areas',
    summary: 'Get all areas',
    description: 'Retrieves all security areas with their location assignments and device associations',
    tags: ['Areas'],
    request: {
      query: areasQuerySchema,
    },
    responses: {
      200: {
        description: 'List of areas',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AreasSuccessResponse' },
          },
        },
      },
      400: {
        description: 'Invalid request parameters',
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
    path: '/api/areas',
    summary: 'Create a new area',
    description: 'Creates a new security area with specified name and location',
    tags: ['Areas'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: createAreaSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Area created successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AreaSuccessResponse' },
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

  // Individual area endpoints
  registry.registerPath({
    method: 'get',
    path: '/api/areas/{id}',
    summary: 'Get specific area',
    description: 'Retrieves a single area by ID',
    tags: ['Areas'],
    request: {
      params: areaIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Area retrieved successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AreaSuccessResponse' },
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
        description: 'Area not found',
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
    path: '/api/areas/{id}',
    summary: 'Update area',
    description: 'Updates an area\'s name or location assignment',
    tags: ['Areas'],
    request: {
      params: areaIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: updateAreaSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Area updated successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AreaSuccessResponse' },
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
        description: 'Area or target location not found',
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
    path: '/api/areas/{id}',
    summary: 'Delete area',
    description: 'Deletes an area and its device associations',
    tags: ['Areas'],
    request: {
      params: areaIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Area deleted successfully',
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

  // ARM STATE endpoint
  registry.registerPath({
    method: 'put',
    path: '/api/areas/{id}/arm-state',
    summary: 'Update area armed state',
    description: 'Updates the armed state of a security area (DISARMED, ARMED_AWAY, ARMED_STAY, TRIGGERED)',
    tags: ['Areas'],
    request: {
      params: areaIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: updateArmedStateSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Armed state updated successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AreaSuccessResponse' },
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
        description: 'Area not found',
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

  // Admin/API Keys endpoints
  registry.registerPath({
    method: 'get',
    path: '/api/admin/api-keys',
    summary: 'Get all API keys',
    description: 'Retrieves all API keys with metadata (excludes actual key values)',
    tags: ['Admin'],
    responses: {
      200: {
        description: 'List of API keys',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiKeysSuccessResponse' },
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
    path: '/api/admin/api-keys',
    summary: 'Create a new API key',
    description: 'Creates a new API key with the specified name',
    tags: ['Admin'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: createApiKeySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'API key created successfully',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiKeySuccessResponse' },
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

  registry.registerPath({
    method: 'patch',
    path: '/api/admin/api-keys/{id}',
    summary: 'Update API key status',
    description: 'Updates the enabled/disabled status of an existing API key',
    tags: ['Admin'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('API key UUID'),
      }),
      body: {
        content: {
          'application/json': {
            schema: updateApiKeySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'API key status updated successfully',
        content: {
          'application/json': {
            schema: successResponseSchema(z.object({
              message: z.string(),
            })),
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
        description: 'API key not found',
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
    path: '/api/admin/api-keys/{id}',
    summary: 'Delete an API key',
    description: 'Deletes an existing API key',
    tags: ['Admin'],
    request: {
      params: z.object({
        id: z.string().uuid().describe('API key UUID'),
      }),
    },
    responses: {
      200: {
        description: 'API key deleted successfully',
        content: {
          'application/json': {
            schema: successResponseSchema(z.object({
              message: z.string(),
            })),
          },
        },
      },
      404: {
        description: 'API key not found',
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
    path: '/api/admin/api-keys/test',
    summary: 'Get API key detail',
    description: 'Validates the provided API key and returns detailed information about the key, associated user, and organization scope',
    tags: ['Admin'],
    responses: {
      200: {
        description: 'API key test successful',
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
    tags: ['Alarm'],
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
