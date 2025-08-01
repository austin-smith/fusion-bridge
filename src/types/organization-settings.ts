export enum RetentionStrategy {
  TIME = 'time',
  COUNT = 'count', 
  HYBRID = 'hybrid'
}

export interface EventRetentionPolicy {
  strategy: RetentionStrategy;
  maxAgeInDays?: number;
  maxEvents?: number;
}

export interface CleanupStats {
  lastCleanupAt?: Date;
  totalEventsDeleted: number;
  nextScheduledCleanup?: Date;
}

export interface OrganizationEventSettings {
  id: string;
  organizationId: string;
  policy: EventRetentionPolicy;
  stats: CleanupStats;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_EVENT_RETENTION_POLICY: EventRetentionPolicy = {
  strategy: RetentionStrategy.HYBRID,
  maxAgeInDays: 90,
  maxEvents: 100000
};

