import 'server-only';

// Export server-side auth utilities
export { auth } from './auth/server';
export { withApiRouteAuth } from './auth/withApiRouteAuth';
export { withOrganizationAuth } from './auth/withOrganizationAuth';
export { withAuthApi } from './auth/withAuthApi';
export type { ApiRouteAuthContext, RouteContext } from './auth/withApiRouteAuth';
export type { OrganizationAuthContext } from './auth/withOrganizationAuth';

// Export database connection and schema from shared package
export { db } from './data/db';
export { 
  account,
  apikey,
  areaDevices,
  areas,
  armingSchedules,
  automationActionExecutions,
  automationExecutions,
  automations,
  cameraAssociations,
  connectors,
  devices,
  events,
  keypadPins,
  locations,
  member,
  organization,
  pikoServers,
  serviceConfigurations,
  session,
  user
} from './data/db/schema';

// Export repository functions and types
export { findEventsInWindow, getEventCount, getRecentEvents, truncateEvents, storeStandardizedEvent } from './data/repositories/events';
export type { FindEventsFilter } from './data/repositories/events';
export { getPushoverConfiguration, getPushcutConfiguration, upsertPushoverConfiguration, upsertPushcutConfiguration } from './data/repositories/service-configurations';
export type { PushoverConfig, AnyServiceConfig, BaseServiceConfig } from './data/repositories/service-configurations';
export { updateConnectorConfig } from './data/repositories/connectors'; 