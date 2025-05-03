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

3.  **`src/lib/device-actions.ts`** (Main File)
    *   `actionHandlers`: An array acting as the registry, holding instances of all implemented handlers (e.g., `new YoLinkActionHandler()`).
    *   `requestDeviceStateChange(internalDeviceId, newState)`: The primary entry point. It:
        *   Fetches device and connector data from the database.
        *   Retrieves the connector configuration.
        *   Iterates through the `actionHandlers` registry.
        *   Finds the first handler where `handler.category` matches the connector's category *and* `handler.canHandle(...)` returns true.
        *   Calls the found handler's `executeStateChange(...)` method.
        *   Throws an error if no suitable handler is found.

## API Usage

The API endpoint `POST /api/devices/[internalDeviceId]/state` uses the `requestDeviceStateChange` function to process state change requests initiated from the frontend or other services.

## Extending for New Connectors

To add state change capabilities for a new connector type (e.g., 'newConnector'):

1.  **Implement Driver Function:** Ensure the driver service (`src/services/drivers/newConnector.ts`) has the necessary function(s) to perform the state change via the vendor's API.
2.  **Create Handler:** Create `src/lib/device-actions/newConnector-handler.ts`. Implement the `IDeviceActionHandler` interface, filling in the logic for `canHandle` and `executeStateChange` specific to 'newConnector'.
3.  **Register Handler:**
    *   Import the new handler class in `src/lib/device-actions.ts`.
    *   Add an instance of the new handler to the `actionHandlers` array (e.g., `actionHandlers.push(new NewConnectorActionHandler())`).

That's it! The `requestDeviceStateChange` function will now automatically be able to use the new handler. 