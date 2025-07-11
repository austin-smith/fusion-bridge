## Alarm System Functionality

This system provides an area-based security arming/disarming and alarm notification capability, integrated with device event processing.

### Core Concepts

*   **Locations**: Represent physical sites or buildings (e.g., "Main Office", "Warehouse"). Each location has a time zone and can have a default arming schedule.
*   **Areas**: Represent security partitions within a location (e.g., "Ground Floor", "Server Room"). Each area has an armed state and can have its own arming schedule that overrides the location's default.
*   **Arming Schedules**: Define recurring patterns for automatically arming and disarming areas. Schedules consist of:
    *   Days of the week (e.g., Mon-Fri, Weekends).
    *   Arm time (local time).
    *   Disarm time (local time).
    *   Enabled/Disabled status.
*   **Armed States**:
    *   `DISARMED`: The area is not actively monitored for security events.
    *   `ARMED`: The area is armed and actively monitored for security events.
    *   `TRIGGERED`: A security event has occurred in an armed area, and an alarm condition is active.
*   **Security Devices**: Devices (e.g., door/window contact sensors, motion sensors) can be flagged as relevant to security. Their state changes can influence the alarm system.

### Key Features

1.  **Scheduled Arming/Disarming**:
    *   A CRON job runs every minute (`processAreaArmingSchedules` via `src/lib/cron/scheduler.ts` and `src/lib/actions/areaSecurityActions.ts`).
    *   It checks each area's applicable schedule (area override or location default).
    *   Calculates the next arm/disarm transition time based on the schedule and the area's location time zone.
    *   Automatically updates the area's `armedState` to `ARMED` (default for scheduled arming) or `DISARMED`.
    *   Users can skip the next scheduled arming for an area.

2.  **Manual Control**:
    *   Users can manually arm or disarm areas irrespective of schedules via the UI.
    *   These actions are handled by backend logic (`src/lib/actions/areaSecurityActions.ts`) and reflected in the Zustand store (`src/stores/store.ts`).

3.  **Alarm Triggering**:
    *   Events from various connectors (YoLink, Piko, Netbox) are standardized by parsers (`src/lib/event-parsers/`).
    *   The central `processAndPersistEvent` function (`src/lib/events/eventProcessor.ts`) handles these standardized events.
    *   If an event is identified as a security risk (`isSecurityRiskEvent` in `src/lib/security/alarmLogic.ts`) and occurs in an area that is currently `ARMED`:
        *   The area's `armedState` is set to `TRIGGERED`.
        *   The `lastArmedStateChangeReason` is updated (e.g., "security\_event\_trigger").
    *   *Note: Notification logic (e.g., email, push) upon an area entering `TRIGGERED` state is a planned extension and not fully implemented in this core logic yet.*

4.  **User Interface**:

    *   **Locations Page (`/locations`)**:
        *   Displays locations and their associated areas.
        *   Provides UI to assign a default arming schedule to a location.
        *   Allows assigning an override arming schedule to an area (or opting to use the location default or no schedule).
        *   The `AreaStatusDisplay` component shows the current armed state of each area, countdown to next scheduled transition, and buttons for manual arm/disarm/skip.

    *   **Alarm Schedules Page (`/alarm/schedules`)**:
        *   Allows users to create, view, edit, and delete arming schedules.
        *   Schedules define name, days of the week, arm/disarm times (local), and enabled status.

    *   **Active Alarms Page (`/alarm/alarms`)**:
        *   Displays a feed of all areas currently in the `TRIGGERED` state.
        *   Shows area name, location, when it was triggered, and the reason.
        *   Provides an "Acknowledge & Disarm" button to set the area back to `DISARMED`.

### Event Processing Flow for Alarms

1.  External system (e.g., YoLink Hub, Piko Server) sends an event.
2.  The relevant connector's API route receives the event.
3.  The event parser (e.g., `yolink.ts`) transforms the raw event into a `StandardizedEvent`.
4.  The parser calls `processAndPersistEvent(standardizedEvent)`.
5.  `processAndPersistEvent`:
    *   Persists the event to the database.
    *   Updates the device's status in the database (if applicable).
    *   If the event is from a security device in an armed area:
        *   Calls `isSecurityRiskEvent(standardizedEvent, deviceInfo)`.
        *   If true, updates the area's `armedState` to `TRIGGERED` in the database.
    *   Passes the event to the `AutomationService` for any configured automations.

### Future Enhancements (Conceptual)

*   Detailed notification system for triggered alarms (email, SMS, push).
*   More granular permissions for alarm management.
*   History/log of alarm events and acknowledgments.
*   Bypassing specific sensors during arming.
*   Entry/Exit delays for arming/disarming.
*   Real-time updates on the Active Alarms page via WebSockets.
