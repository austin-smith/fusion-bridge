# Device Action Handler Pattern

This document explains the pattern used in `src/lib/device-actions/` to handle device state changes (e.g., turning an outlet on/off) across different connector types in a scalable way.

## Purpose

To provide a unified way to request state changes for devices managed by various connectors (YoLink, Piko, Genea, etc.) without cluttering the core logic with vendor-specific details.

## Problem Solved

Directly handling state changes for each connector type within a single function (e.g., using a large `switch` statement) becomes difficult to manage and extend as more connector types are added.

## Solution: Strategy/Registry Pattern

We use a combination of the Strategy and Registry patterns:

1.  **Strategy:** Each connector type that supports actions has its own dedicated "handler" class responsible for the specific logic of changing its device states (parsing data, mapping commands, calling the driver API).
2.  **Registry:** A central registry holds instances of all available handlers.
3.  **Delegation:** A core function looks up the appropriate handler in the registry based on the connector category and delegates the execution to that handler.

## Core Components

1.  **`src/lib/device-actions/types.ts`**
    *   `IDeviceActionHandler`: Defines the common interface that all handlers must implement. Key methods:
        *   `category`: Identifies the connector type (e.g., 'yolink').
        *   `canHandle(device, newState)`: Checks if the handler supports the specific device type and requested action.
        *   `executeStateChange(device, config, newState)`: Performs the actual state change logic.
    *   `DeviceContext`: A type defining the subset of device information needed by handlers.

2.  **`src/lib/device-actions/[connector]-handler.ts`** (e.g., `yolink-handler.ts`)
    *   Concrete implementation of `IDeviceActionHandler` for a specific connector.
    *   Contains logic for:
        *   Validating if the action is supported for the given device type (within `canHandle`).
        *   Parsing necessary information from the device's `rawDeviceData` (e.g., YoLink's device-specific `token`).
        *   Mapping the abstract `ActionableState` (e.g., `SET_ON`) to the vendor-specific command (e.g., `'open'`).
        *   Calling the appropriate function in the connector's driver service (e.g., `yolinkDriver.setDeviceState`).

3.  **`src/lib/device-actions/index.ts`** (Main File)
    *   `actionHandlers`: An array acting as the registry, holding instances of all implemented handlers (e.g., `new YoLinkActionHandler()`).
    *   `requestDeviceStateChange(internalDeviceId, newState)`: The primary entry point. It:
        *   Fetches device and connector data from the database.
        *   Retrieves the connector configuration.
        *   Iterates through the `actionHandlers` registry.
        *   Finds the first handler where `handler.category` matches the connector's category *and* `handler.canHandle(...)` returns true.
        *   Calls the found handler's `executeStateChange(...)` method.
        *   Throws an error if no suitable handler is found.

4.  **UI Capability & Selection (client-safe)**

   The frontend should not hardcode per-connector logic in components. Use these helpers instead:

   - `src/lib/device-actions/capabilities.ts`
     - Central map of supported state actions per `connectorCategory` and standardized `DeviceType`.
     - Exports: `SUPPORTED_DEVICE_ACTIONS`, `getSupportedStateActions(...)`, `isActionSupported(...)`.
   - `src/lib/device-actions/presentation.ts`
     - Maps an `ActionableState` to a user-facing `{ label, icon }`.
   - `src/lib/device-actions/selection.ts`
     - Status-aware selection of which action to show as primary, and any secondary actions.
     - Exports: `deriveQuickActions({ connectorCategory, deviceType, displayState })` → `{ primary, secondary[] }`.
   - These are client-only, pure utilities. Execution is still validated server-side via handlers.

## API Usage

The API endpoint `POST /api/devices/[internalDeviceId]/state` uses the `requestDeviceStateChange` function to process state change requests initiated from the frontend or other services.

## Supported Connectors

### YoLink
- **Device Types:** Switch, Outlet, MultiOutlet, Manipulator
- **Actions:** SET_ON, SET_OFF
- **Commands:** PLAY_AUDIO (SpeakerHub devices)

### Genea  
- **Device Types:** Door
- **Actions:** SET_LOCKED, SET_UNLOCKED, QUICK_GRANT
- **Notes:** Uses door UUID as deviceId. Handles 422 validation errors when door is already in target state.
  - QUICK_GRANT maps to `PUT /v2/door/{door_uuid}/quick_unlock` and is a temporary unlock.

Note: The UI capability map in `capabilities.ts` defines which actions are exposed in the frontend for each connector/device type. To surface a new actionable device in the UI, update both:

- Backend: add/extend the appropriate handler implementing `IDeviceActionHandler`.
- Frontend: extend `SUPPORTED_DEVICE_ACTIONS` (and `presentation.ts` if a new action needs a label/icon).

## Error Handling

### Genea 422 Errors
HTTP status code 422 indicates "Unprocessable Entity" - the request was well-formed but contains semantic errors. For door lock/unlock operations, this usually means:
- Invalid device state transition (e.g., trying to unlock an already unlocked door)
- Missing required parameters for the operation
- Device is in a state that prevents the requested action (offline, maintenance mode, emergency lockdown active)
- Conflicting access permissions or security constraints

Note: When controllers go offline, remote unlock capabilities become unavailable until connectivity is restored.

## Extending for New Connectors

To add state change capabilities for a new connector type (e.g., 'newConnector'):

1.  **Implement Driver Function:** Ensure the driver service (`src/services/drivers/newConnector.ts`) has the necessary function(s) to perform the state change via the vendor's API.
2.  **Create Handler:** Create `src/lib/device-actions/newConnector-handler.ts`. Implement the `IDeviceActionHandler` interface, filling in the logic for `canHandle` and `executeStateChange` specific to 'newConnector'.
3.  **Register Handler:**
    *   Import the new handler class in `src/lib/device-actions/index.ts`.
    *   Add an instance of the new handler to the `handlers` array (it is split into `actionHandlers` and `commandHandlers`).

That's it! The `requestDeviceStateChange` function will now automatically be able to use the new handler. 