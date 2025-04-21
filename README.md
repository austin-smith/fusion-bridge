# Fusion Bridge

A local-first security integration platform that connects to various security devices and services.

## Features

- Next.js 15 with App Router and TypeScript
- Local SQLite database through Drizzle ORM and better-sqlite3
- Support for YoLink and Piko security devices
- Dynamic UI forms for different device types
- Event-driven Automation Engine: Configure rules to trigger actions
- Modern UI with Tailwind CSS and `shadcn/ui`

## Getting Started

### Prerequisites

- Node.js 18+ 
- pnpm (recommended)

### Setup

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/fusion-bridge.git
cd fusion-bridge
```

2. **Install dependencies**

```bash
pnpm install
```

3. **Run database migrations**

```bash
pnpm migrate
```

4. **Start the development server**

```bash
pnpm dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

## Project Structure

The core application code resides within the `src/` directory, organized as follows:

-   **`src/app/`**: Contains the application routes using the Next.js App Router.
    -   `api/`: API route handlers (including `/api/automations`).
    -   `(manage)/`: Route group for core management sections (Connectors, Devices, Automations, etc.).
    -   `layout.tsx`: The root layout component.
    -   `page.tsx`: The root page component (dashboard).
-   **`src/components/`**: Shared React components.
    -   `ui/`: Base UI components from `shadcn/ui`.
    -   `common/`: General-purpose reusable components.
    -   `layout/`: Components specific to the main application layout/shell.
    -   `features/`: Components specific to certain application features (e.g., `connectors/`).
    -   `automations/`: Components related to the automation feature (e.g., `AutomationTable.tsx`, `AutomationForm.tsx`, `TokenInserter.tsx`).
-   **`src/data/`**: Data access layer.
    -   `db/`: Drizzle ORM setup, schema, migrations, and client instance.
    -   `repositories/`: Logic for fetching/manipulating data (e.g., `eventsRepository`).
-   **`src/lib/`**: General utility functions, custom hooks (`hooks/`), constants, schemas (`automation-schemas.ts`, `automation-tokens.ts`), etc.
-   **`src/services/`**: Business logic interacting with external services or hardware.
    -   `drivers/`: Specific drivers for external systems (e.g., `yolink.ts`, `piko.ts`).
    -   `mqtt-service.ts`: Listens for YoLink MQTT events.
    -   `automation-service.ts`: Processes events against defined automation rules.
-   **`src/stores/`**: Zustand state management stores.
-   **`src/styles/`**: Global styles (`globals.css`).
-   **`src/types/`**: Shared TypeScript type definitions.
-   **`src/instrumentation.ts`**: Entry point for Next.js instrumentation. Runs once per server instance startup in *all* environments (Node.js and Edge). It checks the runtime and conditionally loads the Node.js-specific logic.
-   **`src/instrumentation.node.ts`**: Contains instrumentation logic that *requires* the Node.js runtime (e.g., importing modules that depend on native Node APIs like `fs` or `net`). This file is only imported and executed by `instrumentation.ts` when running in a Node.js environment.

### A Note on Runtimes (Node.js vs. Edge)

Next.js can run server-side code in two different environments:

-   **Node.js Runtime (Default):** The standard Node.js environment, providing access to all Node.js APIs and the full npm ecosystem. Services requiring direct OS interaction (like file system access via `fs` or raw TCP sockets) must run here. Our MQTT service and its dependencies run in this runtime.
-   **Edge Runtime:** A lightweight JavaScript runtime based on Web APIs, designed for speed and to run close to the user (often in CDN edge locations). It has limitations, notably lacking access to native Node.js modules like `fs`, `net`, or `child_process`. While primarily used for Middleware or specific API routes in production, the **Next.js development server (`pnpm dev`) attempts to compile instrumentation code for *both* runtimes**. This is why the `fs` module error occurred specifically during development – the Edge compilation path encountered a Node.js-only dependency.

The split instrumentation setup (`instrumentation.ts` and `instrumentation.node.ts`) uses a runtime check (`process.env.NEXT_RUNTIME`) to ensure that code relying on Node.js APIs (like the MQTT client which uses `bindings` and indirectly `fs`) is *only* imported and executed when the application is definitively running in the Node.js runtime. This prevents the Edge compilation pass during development from trying to resolve Node-specific modules it cannot handle.

## Database

The application uses a local SQLite database stored at `~/.fusion-bridge/fusion.db`. The database schema includes:

-   `nodes` table for storing device connections with their configurations.
-   `events` table for storing raw incoming events (e.g., from YoLink).
-   `devices` table for storing discovered devices from connectors.
-   `pikoServers` table for Piko-specific server info.
-   `cameraAssociations` (previously `deviceAssociations`) for linking devices (e.g., YoLink sensor to Piko camera).
-   `automations` table for storing user-defined automation rules, linking source/target nodes and configuration.

## License

MIT
