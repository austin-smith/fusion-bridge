# Event Streaming API (Server-Sent Events)

This endpoint provides real-time event streaming using Server-Sent Events (SSE).

## Prerequisites

1. Redis server (local or hosted)
2. API key with organization association

## Environment Variables

Add the following to your `.env.local` file:

```bash
# Redis Configuration (local development)
REDIS_URL=redis://localhost:6379
```

For production environments (Railway):
```bash
# Railway automatically provides this via service reference
REDIS_URL=${{ fusion-redis.REDIS_URL }}
```

## Local Development Setup

### 1. Install Redis locally

**macOS:**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
```

**Docker:**
```bash
docker run -d -p 6379:6379 --name fusion-redis redis:alpine
```

### 2. Verify Redis connection

```bash
redis-cli ping
# Should return: PONG
```

### 3. Set your local environment variable

Add to your `.env.local`:
```bash
REDIS_URL=redis://localhost:6379
```

## Production Setup (Railway)

### 1. Add Redis to your Railway project

```bash
railway add redis
```

### 2. Get Redis connection details

```bash
railway variables
```

### 3. Set up the Redis URL reference

In your Next.js service, add the Redis URL as a reference variable:

1. Go to your Next.js service → Variables tab
2. Add a new variable: `REDIS_URL`
3. Set the value to: `${{ fusion-redis.REDIS_URL }}`

This automatically references your Redis service and includes authentication.

Alternatively, set it via CLI:
```bash
railway variables set REDIS_URL='${{ fusion-redis.REDIS_URL }}'
```

**Note**: Replace `fusion-redis` with your actual Redis service name.

## Testing the Implementation

### 1. Start your Next.js app

```bash
pnpm dev
```

### 2. Test with cURL

```bash
# Replace with your actual API key
curl -N -H "x-api-key: your-api-key-here" \
  "http://localhost:3000/api/events/stream"
```

### 3. Generate test events

Trigger some events through your connected devices or use your test endpoints to generate events.

### 4. Check connection stats

```bash
curl -H "x-api-key: your-api-key-here" \
  "http://localhost:3000/api/events/stream/stats"
```

## Endpoint

```
GET /api/events/stream
```

## Authentication

Use your API key in the `x-api-key` header:

```
x-api-key: your-api-key-here
```

## Query Parameters

- `eventCategories` (optional): Comma-separated list of event categories to filter
  - Example: `?eventCategories=access,security,alarm`
- `eventTypes` (optional): Comma-separated list of event types to filter
  - Example: `?eventTypes=STATE_CHANGED,MOTION_DETECTED`
- `includeThumbnails` (optional): Set to `true` to receive thumbnail data URIs for supported events
  - Example: `?includeThumbnails=true`
  - Default: `false`

## Connection Limits

- Maximum 5 concurrent connections per API key
- No limit on total connections per organization (yet)

## Event Message Format

Events are sent as JSON in the SSE `data` field:

```json
{
  "eventUuid": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-10T14:30:00.000Z",
  "organizationId": "org_123",
  "deviceId": "device_123",
  "deviceName": "Front Door",
  "connectorId": "conn_456",
  "connectorName": "Building A Controller",
  "locationId": "loc_789",
  "locationName": "Main Building",
  "spaceId": "space_101",
  "spaceName": "Lobby",
  "alarmZoneId": "zone_201",
  "alarmZoneName": "Perimeter Security",
  "event": {
    "category": "access",
    "categoryDisplayName": "Access Control",
    "type": "STATE_CHANGED",
    "typeDisplayName": "State Changed",
    "subtype": "LOCKED",
    "subtypeDisplayName": "Locked",
    "displayState": "Locked",
    "batteryPercentage": 85
  },
  "rawEvent": { ... },
  "thumbnailUri": "data:image/jpeg;base64,/9j/4AAQSkZJRgABA..."
}
```

### Thumbnail Support

The `thumbnailUri` field is included when:
1. The client subscribes with `?includeThumbnails=true`
2. The event supports thumbnail generation:
   - **Analytics events** from Piko cameras with `objectTrackId` (best-shot thumbnails)
   - **Any event** from devices in spaces that contain Piko cameras (space-based thumbnails)

The thumbnail is provided as a data URI in the format:
```
data:image/jpeg;base64,<base64-encoded-image-data>
```

}
```

## Message Types

The SSE stream sends different event types:

1. **connection**: Initial connection confirmation
2. **event**: Actual device/system events
3. **heartbeat**: Keep-alive messages every 30 seconds
4. **system**: Redis connection status updates

## Client Examples

### JavaScript (Browser)

```javascript
const eventSource = new EventSource('/api/events/stream', {
  headers: {
    'x-api-key': 'your-api-key-here'
  }
});

// Handle connection established
eventSource.addEventListener('connection', (e) => {
  const data = JSON.parse(e.data);
  console.log('Connected to event stream:', data);
});

// Handle incoming events
eventSource.addEventListener('event', (e) => {
  const event = JSON.parse(e.data);
  console.log('Received event:', event);
  
  // Process event based on type
  switch(event.event.type) {
    case 'STATE_CHANGED':
      handleStateChange(event);
      break;
    case 'MOTION_DETECTED':
      handleMotion(event);
      break;
    // ... other event types
  }
});

// Handle heartbeats
eventSource.addEventListener('heartbeat', (e) => {
  console.log('Heartbeat received');
});

// Handle system messages (Redis connection status)
eventSource.addEventListener('system', (e) => {
  const system = JSON.parse(e.data);
  console.log('System message:', system.message);
  
  if (system.message === 'Redis connection lost') {
    // Show warning to user that Redis is down
    showWarning('Real-time events unavailable - connection lost');
  } else if (system.message === 'Redis connection restored') {
    // Clear warning
    clearWarning();
  }
});

// Handle errors
eventSource.addEventListener('error', (e) => {
  if (e.readyState === EventSource.CLOSED) {
    console.log('Connection was closed');
  } else {
    console.error('EventSource error:', e);
  }
});

// Clean up when done
// eventSource.close();
```

### Node.js

```javascript
const EventSource = require('eventsource');

const eventSource = new EventSource('https://your-app.com/api/events/stream', {
  headers: {
    'x-api-key': 'your-api-key-here'
  }
});

eventSource.addEventListener('event', (e) => {
  const event = JSON.parse(e.data);
  console.log('Received event:', event);
});

eventSource.addEventListener('error', (e) => {
  console.error('Connection error:', e);
});
```

### Python

```python
import sseclient
import requests
import json

def stream_events():
    headers = {
        'x-api-key': 'your-api-key-here'
    }
    
    response = requests.get(
        'https://your-app.com/api/events/stream',
        headers=headers,
        stream=True
    )
    
    client = sseclient.SSEClient(response)
    
    for event in client.events():
        if event.event == 'event':
            data = json.loads(event.data)
            print(f"Received event: {data}")
        elif event.event == 'heartbeat':
            print("Heartbeat received")

# Run the stream
stream_events()
```

### cURL

```bash
curl -N -H "x-api-key: your-api-key-here" \
  "https://your-app.com/api/events/stream?eventCategories=access,security"
```

## Filtered Streaming

To receive only specific events:

```javascript
// Only receive access and security events
const url = '/api/events/stream?eventCategories=access,security';

// Only receive state changes and motion events
const url = '/api/events/stream?eventTypes=STATE_CHANGED,MOTION_DETECTED';

// Include thumbnails for supported events
const url = '/api/events/stream?includeThumbnails=true';

// Combine filters with thumbnails
const url = '/api/events/stream?eventCategories=security&eventTypes=MOTION_DETECTED,INTRUSION_DETECTED&includeThumbnails=true';
```

## Error Handling

The endpoint returns standard HTTP error codes:

- `401`: Invalid or missing API key
- `403`: API key not associated with an organization
- `429`: Connection limit exceeded
- `500`: Internal server error

## Architecture

### Flow Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Device    │────▶│   Next.js   │────▶│    Redis    │
│  Connector  │     │   Server    │     │  Pub/Sub    │
└─────────────┘     └─────────────┘     └─────────────┘
                            │                    │
                            ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   Event     │     │     SSE     │
                    │  Processor  │     │  Endpoint   │
                    └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │   Client    │
                                        │   (SSE)     │
                                        └─────────────┘
```

### Flow Explanation

1. **Event Reception**: Devices send events to your Next.js app through various connectors
2. **Event Processing**: The `eventProcessor.ts` persists events and enriches them with organization data
3. **Redis Publishing**: Enriched events are published to organization-specific Redis channels
4. **SSE Connection**: Clients connect to `/api/events/stream` and register with the global connection manager
5. **Message Routing**: The connection manager routes Redis messages to appropriate clients based on organization and filters
6. **Real-time Delivery**: Events are immediately forwarded to all connected clients

### Scalable Architecture Features

#### Global Connection Manager

The implementation uses a **single Redis subscriber** for all organizations, eliminating the "N subscribers problem" that occurs when each SSE connection creates its own Redis subscriber.

**Benefits:**
- **Redis Efficiency**: 1 subscriber vs potentially 100+ subscribers
- **Memory Optimization**: In-memory connection tracking vs Redis key storage  
- **Auto Channel Management**: Subscribes/unsubscribes channels as connections are added/removed
- **Connection Filtering**: Client-specific filters applied at the application layer

#### Graceful Shutdown Support

The system handles server restarts gracefully:
- **SIGTERM/SIGINT Detection**: Instrumentation layer detects shutdown signals
- **Client Notification**: All connected clients receive shutdown notification with reconnect delay
- **Zero-downtime Deployments**: Clients automatically reconnect after the specified delay

#### Connection Resilience

- **Redis Failover**: Clients receive system messages when Redis goes down/up
- **Connection Recovery**: Automatic resubscription when Redis reconnects
- **Error Isolation**: Individual connection failures don't affect other connections
- **Railway IPv6 Support**: Dual stack DNS lookup for Railway's IPv6 private network

## Monitoring

### Redis Connection Health

```bash
# Check Redis connection
redis-cli ping

# Monitor Redis activity
redis-cli monitor

# Check pub/sub channels
redis-cli pubsub channels
```

### Application Logs

Monitor these log prefixes:
- `[Redis Client]` - Redis connection status
- `[EventProcessor]` - Event publishing
- `[SSE]` - Client connections and disconnections

## Troubleshooting

### No events received

1. Check Redis connection:
   ```bash
   redis-cli ping
   ```

2. Verify events are being published:
   ```bash
   redis-cli subscribe "events:*"
   ```

3. Check organization ID in API key:
   ```bash
   curl -H "x-api-key: your-key" http://localhost:3000/api/events/stream/stats
   ```

### Connection drops frequently

1. Check heartbeat messages (every 30 seconds)
2. Verify no proxy/load balancer timeout issues
3. Check client-side error handling

### High memory usage

1. Monitor connection count:
   ```bash
   redis-cli info clients
   ```

2. Check for connection leaks
3. Verify cleanup on client disconnect

## Performance Considerations

1. **Connection Limits**: Currently 5 connections per API key
2. **Filtering**: Use query parameters to reduce data transfer
3. **Redis Efficiency**: Single subscriber architecture scales much better than N subscribers
4. **Memory Usage**: In-memory connection tracking is more efficient than Redis storage
5. **Network**: SSE uses long-lived HTTP connections
6. **Channel Cleanup**: Unused Redis channels are automatically unsubscribed when no connections remain

## Best Practices

1. **Reconnection**: Implement automatic reconnection logic in your client
2. **Error Handling**: Always handle connection errors and implement retry logic
3. **Resource Cleanup**: Close the EventSource when no longer needed
4. **Filtering**: Use query parameters to reduce unnecessary data transfer
5. **Monitoring**: Track connection duration and event throughput

## Security Notes

1. **API Keys**: Always use HTTPS in production
2. **Organization Isolation**: Events are strictly filtered by organization
3. **Rate Limiting**: Connection limits prevent abuse
4. **No Client Publishing**: SSE is read-only for clients

## Limitations

1. SSE is unidirectional (server to client only)
2. Limited to text data (JSON encoded)
3. Maximum 6 concurrent connections per domain in browsers
4. No built-in message acknowledgment 