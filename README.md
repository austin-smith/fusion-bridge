# Fusion

[![Node.js](https://img.shields.io/badge/Node.js_18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/) [![Next.js 15](https://img.shields.io/badge/Next.js_15-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/) [![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?style=flat-square&logo=shadcnui)](https://ui.shadcn.com/) [![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org/) [![Turso](https://img.shields.io/badge/Turso-4FF8D2?style=flat-square&logo=turso&logoColor=black)](https://turso.tech/) [![Redis](https://img.shields.io/badge/Redis-ff4438?logo=redis&logoColor=white&color=ff4438
)](https://redis.io)


A local-first security integration platform that connects to various security devices and services.

## Features

- **Modern Stack**: Next.js 15 with App Router and TypeScript
- **Hybrid Database**: Defaults to local SQLite (`~/.fusion-bridge/fusion.db`) via Drizzle ORM for development, supports Turso (libSQL) for production deployments.
- **Device Support**: YoLink and Piko security devices
- **Dynamic Forms**: UI forms adapting to different device types
- **Automation Engine**: Event-driven rules to trigger actions
- **Sleek UI**: Powered by Tailwind CSS and `shadcn/ui`

## Getting Started

### Prerequisites

- [Node.js](https://nextjs.org) 18+
- [pnpm](https://pnpm.io) (recommended)
- Optional: [Turso Account](https://turso.tech/) for deployment

### Setup

1. **Clone the repository**

```bash
git clone https://github.com/austin-smith/fusion-bridge.git
cd fusion-bridge
```

2. **Install dependencies**

```bash
pnpm install
```

3. **Configure Environment (Local)**
   For local development, the application defaults to using a SQLite database.
   Create a file named `.env.local` in the project root with the following content:

   ```dotenv
   # .env.local
   DB_DRIVER=sqlite
   ```
   *Note: Add `.env.local` and `~/.fusion-bridge/` to your `.gitignore`.* 

4. **Run database migrations** (initializes the local SQLite db at `~/.fusion-bridge/fusion.db`)

```bash
pnpm migrate
```

5. **Start the development server**

```bash
pnpm dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

## Deployment (e.g., Vercel with Turso)

To deploy the application using a persistent database like Turso, you need to configure environment variables in your hosting provider (e.g., Vercel):

- `DB_DRIVER`: `turso`
- `DATABASE_URL`: Your Turso database LibSQL URL (e.g., `libsql://your-db-name-org.turso.io`)
- `DATABASE_AUTH_TOKEN`: Your Turso database authentication token (mark as secret).

The `pnpm migrate` command, when run during your deployment build process (if configured), will automatically use these variables to connect to Turso and apply migrations.

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
    -   `automations/`: Components related to the automation feature (e.g., `AutomationCardView.tsx`, `AutomationForm.tsx`, `TokenInserter.tsx`).
-   **`src/data/`**: Data access layer.
    -   `db/`: Drizzle ORM setup, schema, migrations, database client (`index.ts`), and utilities (`utils.ts`).
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
-   **Edge Runtime:** A lightweight JavaScript runtime based on Web APIs, designed for speed and to run close to the user (often in CDN edge locations). It has limitations, notably lacking access to native Node.js modules like `fs`, `net`, or `child_process`. While primarily used for Middleware or specific API routes in production, the **Next.js development server (`pnpm dev`) attempts to compile instrumentation code for *both* runtimes**.

The split instrumentation setup (`instrumentation.ts` and `instrumentation.node.ts`) uses a runtime check (`process.env.NEXT_RUNTIME`) to ensure that code relying on Node.js APIs (like the MQTT client which uses `bindings` and indirectly `fs`) is *only* imported and executed when the application is definitively running in the Node.js runtime. This prevents the Edge compilation pass during development from trying to resolve Node-specific modules it cannot handle.

## Database

The application uses Drizzle ORM and supports two database backends configured via the `DB_DRIVER` environment variable:

-   **SQLite (Default for Local):** When `DB_DRIVER` is set to `sqlite` (or unset), the app uses a local SQLite database stored at `~/.fusion-bridge/fusion.db`. This is configured via code in `src/data/db/utils.ts`.
-   **Turso (Recommended for Production):** When `DB_DRIVER` is set to `turso`, the app connects to a Turso database using the `DATABASE_URL` (LibSQL URL) and `DATABASE_AUTH_TOKEN` environment variables.

The database schema (`src/data/db/schema.ts`) includes:

-   `connectors` table for storing device connections with their configurations.
-   `events` table for storing raw incoming events (e.g., from YoLink).
-   `devices` table for storing discovered devices from connectors.
-   `pikoServers` table for Piko-specific server info.
-   `cameraAssociations` for linking devices (e.g., YoLink sensor to Piko camera).
-   `automations` table for storing user-defined automation rules, linking source/target nodes and configuration.

## Database Migrations

Migrations manage changes to the database schema over time.

1.  **Generate Migration Files:**
    **Run this command FIRST** after changing `src/data/db/schema.ts`.
    This uses `drizzle-kit` configured by `drizzle.config.ts` to compare your schema against the **local SQLite database** (`~/.fusion-bridge/fusion.db`) and generate a new `.sql` file in `src/data/db/migrations/`.
    ```bash
    pnpm db:generate
    ```
    *Note: Generation always targets the local SQLite path defined in `src/data/db/utils.ts` via `drizzle.config.ts`.*

2.  **Apply Migrations:**
    **Run this command SECOND**, after successfully generating the migration file(s).
    This runs the custom `src/data/db/migrate.js` script. It checks the `DB_DRIVER` environment variable and applies pending migrations to the configured database (either local SQLite or remote Turso).
    ```bash
    pnpm migrate
    ```