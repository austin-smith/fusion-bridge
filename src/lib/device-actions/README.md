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
    *   `requestDeviceStateChange(internalDeviceId, newState)`: The primary entry point for state changes. It:
        *   Fetches device and connector data from the database.
        *   Retrieves the connector configuration.
        *   Iterates through the `actionHandlers` registry.
        *   Finds the first handler where `handler.category` matches the connector's category *and* `handler.canHandle(...)` returns true.
        *   Calls the found handler's `executeStateChange(...)` method.
        *   Throws an error if no suitable handler is found.
    *   `requestDeviceRename(internalDeviceId, newName)`: Entry point for device renaming. It:
        *   Uses the same device/connector lookup pattern as state changes.
        *   Checks if the connector category supports renaming via `isRenameSupported()`.
        *   Calls the appropriate driver function directly (Piko or Genea).
        *   For Genea devices, preserves required fields like `is_elevator_door` from raw device data.

4.  **UI Capability & Selection (client-safe)**

   The frontend should not hardcode per-connector logic in components. Use these helpers instead:

   - `src/lib/device-actions/capabilities.ts`
     - Central map of supported state actions per `connectorCategory` and standardized `DeviceType`.
     - Source of truth for what actions are exposed in the UI. No UI heuristics.
     - Exports (core):
       - `SUPPORTED_DEVICE_ACTIONS`
       - `getSupportedStateActions(connectorCategory, deviceType)`
       - `isActionSupported(connectorCategory, deviceType, action)`
       - `isOnOffCapable(connectorCategory, deviceType)`
       - `getOnOffActions(connectorCategory, deviceType)`
       - `isAccessControlCapable(connectorCategory, deviceType)`
       - `RENAMEABLE_CONNECTOR_CATEGORIES` and `isRenameSupported(connectorCategory)`
     - Exports (option-aware, for UI lists):
       - `inferStandardDeviceTypeFromOption(option)`
       - `isOnOffCapableOption(option)`
       - `isAccessControlCapableOption(option)`
       - `getOnOffActionsForOption(option)`
       - `isRenameableOption(option)`
     - Option shape expected by helpers (`DeviceOptionLike`):
       - `connectorCategory: string` (canonical key, e.g., 'yolink')
       - `standardDeviceType: DeviceType` (already standardized; preferred)
       - `rawType?: string` and/or `displayType?: string` (only used if `standardDeviceType` is absent)
   - `src/lib/device-actions/presentation.ts`
     - Maps an `ActionableState` to a user-facing `{ label, icon }`.
   - `src/lib/device-actions/selection.ts`
     - Status-aware selection of which action to show as primary, and any secondary actions.
     - Exports: `deriveQuickActions({ connectorCategory, deviceType, displayState })` → `{ primary, secondary[] }`.
   - These are client-only, pure utilities. Execution is still validated server-side via handlers.

## API Usage

- `POST /api/devices/[internalDeviceId]/state` uses `requestDeviceStateChange` to process state change requests.
- `PATCH /api/devices/[internalDeviceId]/name` uses `requestDeviceRename` to process device renaming requests.

## Supported Connectors

### YoLink
- **Device Types:** Switch, Outlet, MultiOutlet, Manipulator
- **Actions:** SET_ON, SET_OFF
- **Commands:** PLAY_AUDIO (SpeakerHub devices)

### Genea  
- **Device Types:** Door
- **Actions:** SET_LOCKED, SET_UNLOCKED, QUICK_GRANT
- **Renaming:** Supported via `PUT /v2/door/{door_uuid}` (preserves required fields like `is_elevator_door`)
- **Notes:** Uses door UUID as deviceId. Handles 422 validation errors when door is already in target state.
  - QUICK_GRANT maps to `PUT /v2/door/{door_uuid}/quick_unlock` and is a temporary unlock.

### Piko
- **Device Types:** Camera
- **Actions:** None currently supported
- **Renaming:** Supported via `PATCH /rest/v3/devices/{id}` with strict mode

Note: The UI capability maps in `capabilities.ts` define which actions and features are exposed in the frontend for each connector/device type. To surface new capabilities:

- **Device Actions:** Update `SUPPORTED_DEVICE_ACTIONS` and implement `IDeviceActionHandler`.
- **Device Renaming:** Add connector category to `RENAMEABLE_CONNECTOR_CATEGORIES` and ensure driver supports renaming.

### Frontend data requirements (important)
- The actions UI must receive, per target device option:
  - `connectorCategory` (canonical string key used by `SUPPORTED_DEVICE_ACTIONS`)
  - `standardDeviceType` (from server; do not infer in the UI)
- With those two fields present, the option-aware helpers will drive eligibility and state lists strictly from `SUPPORTED_DEVICE_ACTIONS`.
- UI components must not inspect raw labels, guess types, or special-case connectors.

### Example: enabling a new on/off-capable type
1) Map vendor identifier to a standardized `DeviceType` in `mappings/identification.ts`.
2) Add actions for that type under the connector in `SUPPORTED_DEVICE_ACTIONS`:
   ```ts
   yolink: {
     [DeviceType.MultiOutlet]: [ActionableState.SET_ON, ActionableState.SET_OFF],
   }
   ```
3) Ensure the server includes `connectorCategory` and `standardDeviceType` on device options.

## Error Handling

### Genea 422 Errors
HTTP status code 422 indicates "Unprocessable Entity" - the request was well-formed but contains semantic errors. For door lock/unlock operations, this usually means:
- Invalid device state transition (e.g., trying to unlock an already unlocked door)
- Missing required parameters for the operation
- Device is in a state that prevents the requested action (offline, maintenance mode, emergency lockdown active)
- Conflicting access permissions or security constraints

Note: When controllers go offline, remote unlock capabilities become unavailable until connectivity is restored.

## Extending for New Connectors

### Adding State Change Capabilities

To add state change capabilities for a new connector type (e.g., 'newConnector'):

1.  **Implement Driver Function:** Ensure the driver service (`src/services/drivers/newConnector.ts`) has the necessary function(s) to perform the state change via the vendor's API.
2.  **Create Handler:** Create `src/lib/device-actions/newConnector-handler.ts`. Implement the `IDeviceActionHandler` interface, filling in the logic for `canHandle` and `executeStateChange` specific to 'newConnector'.
3.  **Register Handler:**
    *   Import the new handler class in `src/lib/device-actions/index.ts`.
    *   Add an instance of the new handler to the `handlers` array (it is split into `actionHandlers` and `commandHandlers`).
4.  **Update Capabilities:** Add supported actions to `SUPPORTED_DEVICE_ACTIONS` in `capabilities.ts`.

### Adding Device Renaming Capabilities

To add device renaming for a new connector type:

1.  **Implement Driver Function:** Add a rename function to the driver service (e.g., `renameNewConnectorDevice`).
2.  **Update Capabilities:** Add the connector category to `RENAMEABLE_CONNECTOR_CATEGORIES` in `capabilities.ts`.
3.  **Update Rename Service:** Add a new branch in `requestDeviceRename` in `index.ts` to handle the new connector type.

That's it! The service layer will automatically support the new capabilities. 