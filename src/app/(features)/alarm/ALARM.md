## Alarm System Functionality

This system provides a zone-based security arming/disarming and alarm notification capability, integrated with device event processing.

**Current Status**: Manual zone control is active. Automatic scheduling is available through automations. Dedicated arming schedule infrastructure exists but is currently inactive.

### Core Concepts

*   **Locations**: Represent physical sites or buildings (e.g., "Main Office", "Warehouse"). Each location has a time zone and can contain multiple alarm zones.
*   **Alarm Zones**: Represent logical security groupings within a location (e.g., "Vault Security", "Perimeter", "ATMs"). Each zone has an armed state and can contain multiple devices for coordinated security management.
*   **Armed States**:
    *   `DISARMED`: The zone is not actively monitored for security events.
    *   `ARMED`: The zone is armed and actively monitored for security events.
    *   `TRIGGERED`: A security event has occurred in an armed zone, and an alarm condition is active.
*   **Trigger Behavior**: Zones can use either:
    *   `standard`: Uses predefined alarm event types for triggering
    *   `custom`: Allows per-zone configuration of which event types should trigger alarms

### Key Features

1.  **Manual Zone Control**:
    *   Users can manually arm or disarm alarm zones via the UI.
    *   These actions are handled by backend logic (`src/lib/actions/alarm-zone-actions.ts`) and reflected in the Zustand store (`src/stores/store.ts`).
    *   All state changes are logged in an audit trail with user, timestamp, and reason.
    *   Real-time notifications of zone state changes are broadcast via Server-Sent Events (SSE) to all connected clients.

1.  **Scheduled Zone Control** *(Infrastructure Available, Currently Inactive)*:
    *   Complete arming schedule infrastructure exists (`armingSchedules` table, API endpoints, UI components).
    *   Schedules can define recurring arm/disarm patterns with days of week and local times.
    *   **Status**: Currently disabled - no CRON jobs process these schedules.
    *   **Alternative**: Use automations with scheduled triggers to arm/disarm zones.
    *   **Reactivation**: Could be enabled by adding CRON job to process schedules and link them to zones.

2.  **Device Assignment**:
    *   Devices can be assigned to alarm zones for security monitoring.
    *   One device can only belong to one alarm zone (enforced constraint).
    *   Zone membership determines which devices participate in security monitoring.

3.  **Alarm Triggering**:
    *   Events from various connectors (YoLink, Piko, Netbox) are standardized by parsers (`src/lib/event-parsers/`).
    *   The central `processAndPersistEvent` function (`src/lib/events/eventProcessor.ts`) handles these standardized events.
    *   For devices assigned to alarm zones:
        *   Only processes events if the zone is in `ARMED` state (disarmed zones ignore all events).
        *   Uses `shouldTriggerAlarm()` function (`src/lib/alarm-event-types.ts`) to determine if an event should trigger an alarm.
        *   For `standard` zones: Uses predefined alarm event types (STATE_CHANGED, INTRUSION, etc.).
        *   For `custom` zones: Checks trigger overrides table for per-zone event type configuration.
        *   If triggered, updates the zone's `armedState` to `TRIGGERED` with audit logging and real-time SSE notifications.

4.  **User Interface**:

    *   **Locations Page (`/locations`)**:
        *   Displays locations and their associated alarm zones.
        *   Shows zone armed states and provides manual arm/disarm controls.

    *   **Alarm Zones Page (`/alarm-zones`)**:
        *   Allows users to create, view, edit, and delete alarm zones.
        *   Configure zone trigger behavior (standard vs custom).
        *   Assign devices to zones for security monitoring.
        *   Configure custom trigger overrides for specific event types.

    *   **Active Alarms Page (`/alarm/alarms`)**:
        *   Displays a feed of all zones currently in the `TRIGGERED` state.
        *   Shows zone name, location, when it was triggered, and the reason.
        *   Provides an "Acknowledge & Disarm" button to set the zone back to `DISARMED`.

    *   **Alarm Schedules Page (`/alarm/schedules`)** *(Hidden from Navigation)*:
        *   Complete UI exists for creating, editing, and managing arming schedules.
        *   Currently hidden from sidebar navigation as scheduling is inactive.
        *   Could be re-enabled if automatic scheduling is implemented.

### Event Processing Flow for Alarms

1.  External system (e.g., YoLink Hub, Piko Server) sends an event.
2.  The relevant connector's API route receives the event.
3.  The event parser (e.g., `yolink.ts`) transforms the raw event into a `StandardizedEvent`.
4.  The parser calls `processAndPersistEvent(standardizedEvent)`.
5.  `processAndPersistEvent`:
    *   Persists the event to the database.
    *   Updates the device's status in the database (if applicable).
    *   Looks up the alarm zone for the device (if any).
    *   If the zone is `ARMED`:
        *   Evaluates trigger conditions based on zone's trigger behavior.
        *   If conditions are met, updates the zone's `armedState` to `TRIGGERED`.
        *   Creates audit log entry with triggering event details.
        *   Broadcasts real-time zone state change via SSE to all connected clients.
    *   Passes the event to the `AutomationService` for any configured automations.

### Trigger Configuration

*   **Standard Trigger Behavior**: Uses predefined alarm event types including:
    *   `STATE_CHANGED` events with alarm-relevant display states (Open, Alert, etc.)
    *   `DOOR_FORCED_OPEN`, `INTRUSION`, `ARMED_PERSON`
    *   `ACCESS_DENIED`, `TAILGATING`, `LOITERING`
*   **Custom Trigger Behavior**: Allows zones to override default behavior for specific event types.
*   **Efficient Processing**: Standard zones use in-memory lookups; custom zones query overrides table only when needed.

### Audit Trail

*   All alarm zone state changes are logged with:
    *   User ID (for manual actions) or system context (for automatic triggers)
    *   Previous and new armed states
    *   Reason for change (manual, automation, security_event_trigger)
    *   Triggering event ID (for security-triggered alarms)
    *   Additional metadata (IP address, automation ID, etc.)

### Real-time Notifications

*   **Server-Sent Events (SSE)**: All alarm zone state changes are broadcast in real-time to connected clients via the `/api/events/stream` endpoint.
*   **Arming Messages**: Dedicated SSE message type (`arming`) for zone state changes including:
    *   Zone identification (ID, name, location)
    *   Previous and current armed states with display names
    *   Timestamp of change
    *   Organization context for multi-tenant isolation
*   **Message Delivery**: Arming messages bypass event filters and are delivered to all connected clients for the organization.
*   **Channel Support**: Messages are published to both regular and thumbnail SSE channels when subscribers exist.

### Current Scheduling Options

*   **Automations with Scheduled Triggers** *(Active)*:
    *   Create automations with `SCHEDULED` trigger type using CRON expressions.
    *   Actions can include `ARM_ALARM_ZONE` and `DISARM_ALARM_ZONE`.
    *   Supports sunrise/sunset triggers with location-based calculations.
    *   More flexible than fixed schedules - can include conditions and multiple actions.

*   **Dedicated Arming Schedules** *(Infrastructure Available)*:
    *   Complete database schema, API, and UI components exist.
    *   Could be reactivated by adding CRON job processing and linking to zones.
    *   Would provide simpler, dedicated interface for basic arm/disarm scheduling.

### Future Enhancements (Conceptual)

*   Reactivate dedicated arming schedules with CRON job processing.
*   Detailed notification system for triggered alarms (email, SMS, push).
*   More granular permissions for alarm management.
*   Entry/Exit delays for arming/disarming.
*   Real-time updates on the Active Alarms page via SSE.
*   Bulk zone operations and zone templates.
