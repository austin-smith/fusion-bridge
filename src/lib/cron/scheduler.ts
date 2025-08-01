import cron from 'node-cron';
import { processScheduledAutomations } from '@/services/automation-service'; // Import new processor
import { updateSunTimes } from '@/lib/cron/jobs/update-sun-times'; // Import sun times job
import { cleanupAllOrganizationsEvents } from '@/services/event-cleanup-service'; // Import event cleanup
import type { ScheduledTask } from 'node-cron';

// Job registry for better management
interface CronJobConfig {
  name: string;
  schedule: string;
  timezone?: string;
  task: ScheduledTask | null;
  retryConfig?: {
    maxRetries: number;
    retryDelay: number;
  };
}

// Global job registry
const jobRegistry = new Map<string, CronJobConfig>();

// Enhanced logging utility
const createLogger = (jobName: string) => ({
  info: (message: string, context?: Record<string, any>) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [CRON:${jobName}] INFO: ${message}`, 
      context ? JSON.stringify(context) : '');
  },
  warn: (message: string, context?: Record<string, any>) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [CRON:${jobName}] WARN: ${message}`, 
      context ? JSON.stringify(context) : '');
  },
  error: (message: string, error?: Error, context?: Record<string, any>) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [CRON:${jobName}] ERROR: ${message}`, {
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
      ...context
    });
  }
});

// Enhanced retry logic
async function executeWithRetry<T>(
  jobName: string,
  taskFn: () => Promise<T>,
  retryConfig = { maxRetries: 2, retryDelay: 1000 }
): Promise<T> {
  const logger = createLogger(jobName);
  let lastError: Error;
  
  for (let attempt = 1; attempt <= retryConfig.maxRetries + 1; attempt++) {
    try {
      const result = await taskFn();
      if (attempt > 1) {
        logger.info(`Task succeeded on attempt ${attempt}/${retryConfig.maxRetries + 1}`);
      }
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt <= retryConfig.maxRetries) {
        logger.warn(`Task failed on attempt ${attempt}/${retryConfig.maxRetries + 1}, retrying in ${retryConfig.retryDelay}ms`, {
          attempt,
          error: lastError.message,
          willRetry: true
        });
        await new Promise(resolve => setTimeout(resolve, retryConfig.retryDelay));
      } else {
        logger.error(`Task failed permanently after ${attempt} attempts`, lastError, {
          totalAttempts: attempt,
          finalFailure: true
        });
      }
    }
  }
  
  throw lastError!;
}

// Enhanced job wrapper
function createJobWrapper(jobName: string, taskFn: () => Promise<void>, retryConfig?: { maxRetries: number; retryDelay: number }) {
  return async () => {
    const logger = createLogger(jobName);
    const startTime = Date.now();
    
    try {
      logger.info('Job execution started');
      
      await executeWithRetry(jobName, taskFn, retryConfig);
      
      logger.info('Job execution completed successfully', {
        executionTime: Date.now() - startTime
      });
      
    } catch (jobError) {
      const error = jobError instanceof Error ? jobError : new Error(String(jobError));
      logger.error('Job execution failed permanently', error, {
        executionTime: Date.now() - startTime,
        jobName
      });
    }
  };
}

// Register a job in the registry
function registerJob(config: Omit<CronJobConfig, 'task'>): void {
  jobRegistry.set(config.name, {
    ...config,
    task: null
  });
}

/**
 * Validates cron schedule and timezone before attempting to schedule
 */
function validateCronConfig(schedule: string, timezone?: string): { isValid: boolean; error?: string } {
  // Basic cron schedule validation
  const cronParts = schedule.trim().split(/\s+/);
  if (cronParts.length !== 5) {
    return { isValid: false, error: `Invalid cron schedule format: ${schedule}` };
  }

  // Validate timezone if provided
  if (timezone) {
    try {
      // Test if timezone is valid by creating a date formatter
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch (error) {
      return { isValid: false, error: `Invalid timezone: ${timezone}` };
    }
  }

  // Test if current date can be formatted (catches "Invalid time value" issues)
  try {
    const testDate = new Date();
    if (timezone) {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).formatToParts(testDate);
    } else {
      // Test with UTC as fallback
      new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }).formatToParts(testDate);
    }
  } catch (error) {
    return { isValid: false, error: `Date formatting validation failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }

  return { isValid: true };
}

/**
 * Initializes and starts all CRON jobs with enhanced monitoring and error handling.
 * - Main job runs every minute for scheduled automations
 * - Sun times job runs daily at 9 AM UTC (~2 AM Pacific) for sunrise/sunset updates
 */
export function initializeCronJobs(): void {
  const logger = createLogger('SYSTEM');
  
  // Prevent multiple initializations
  if (jobRegistry.size > 0 && Array.from(jobRegistry.values()).some(job => job.task)) {
    logger.warn('CRON jobs already initialized, skipping re-initialization');
    return;
  }

  logger.info('Initializing CRON jobs system...');
  
  try {
    // Register scheduled automations job with explicit UTC timezone to avoid system timezone issues
    registerJob({
      name: 'scheduled-automations',
      schedule: '* * * * *', // Every minute
      timezone: 'UTC', // Explicit timezone to prevent "Invalid time value" errors
      retryConfig: { maxRetries: 1, retryDelay: 500 } // Quick retry for time-sensitive tasks
    });
    
    // Register sun times update job  
    registerJob({
      name: 'sun-times-update',
      schedule: '0 9 * * *', // Daily at 9 AM UTC
      timezone: 'UTC',
      retryConfig: { maxRetries: 3, retryDelay: 30000 } // More retries with longer delay for external API
    });
    
    // Register event cleanup job
    registerJob({
      name: 'event-cleanup',
      schedule: '45 14 * * *', // Daily at 2:45 PM UTC
      timezone: 'UTC',
      retryConfig: { maxRetries: 2, retryDelay: 10000 } // Standard retries for database operations
    });
    
    // Initialize scheduled automations job
    const automationsConfig = jobRegistry.get('scheduled-automations')!;
    
    // Validate configuration before scheduling
    const automationsValidation = validateCronConfig(automationsConfig.schedule, automationsConfig.timezone);
    if (!automationsValidation.isValid) {
      throw new Error(`Invalid scheduled-automations configuration: ${automationsValidation.error}`);
    }
    
    const automationsTask = createJobWrapper(
      'scheduled-automations',
      async () => {
      const currentTime = new Date();
        await processScheduledAutomations(currentTime);
      },
      automationsConfig.retryConfig
    );
    
    automationsConfig.task = cron.schedule(
      automationsConfig.schedule, 
      automationsTask,
      { timezone: automationsConfig.timezone }
    );
    logger.info('Scheduled automations job initialized', {
      schedule: automationsConfig.schedule,
      timezone: automationsConfig.timezone,
      retryConfig: automationsConfig.retryConfig
    });

    // Initialize sun times update job
    const sunTimesConfig = jobRegistry.get('sun-times-update')!;
    
    // Validate configuration before scheduling
    const sunTimesValidation = validateCronConfig(sunTimesConfig.schedule, sunTimesConfig.timezone);
    if (!sunTimesValidation.isValid) {
      throw new Error(`Invalid sun-times-update configuration: ${sunTimesValidation.error}`);
    }
    
    const sunTimesTask = createJobWrapper(
      'sun-times-update',
      async () => {
        await updateSunTimes();
      },
      sunTimesConfig.retryConfig
    );
    
    sunTimesConfig.task = cron.schedule(
      sunTimesConfig.schedule, 
      sunTimesTask,
      { timezone: sunTimesConfig.timezone }
    );
    logger.info('Sun times update job initialized', {
      schedule: sunTimesConfig.schedule,
      timezone: sunTimesConfig.timezone,
      retryConfig: sunTimesConfig.retryConfig
    });

    // Initialize event cleanup job
    const cleanupConfig = jobRegistry.get('event-cleanup')!;
    
    // Validate configuration before scheduling
    const cleanupValidation = validateCronConfig(cleanupConfig.schedule, cleanupConfig.timezone);
    if (!cleanupValidation.isValid) {
      throw new Error(`Invalid event-cleanup configuration: ${cleanupValidation.error}`);
    }
    
    const cleanupTask = createJobWrapper(
      'event-cleanup',
      async () => {
        await cleanupAllOrganizationsEvents();
      },
      cleanupConfig.retryConfig
    );
    
    cleanupConfig.task = cron.schedule(
      cleanupConfig.schedule, 
      cleanupTask,
      { timezone: cleanupConfig.timezone }
    );
    logger.info('Event cleanup job initialized', {
      schedule: cleanupConfig.schedule,
      timezone: cleanupConfig.timezone,
      retryConfig: cleanupConfig.retryConfig
    });

    logger.info('All CRON jobs initialized successfully', {
      totalJobs: jobRegistry.size,
      jobs: Array.from(jobRegistry.keys())
    });
    
  } catch (error) {
    logger.error('Failed to initialize CRON jobs', error instanceof Error ? error : new Error(String(error)));
    throw error; // Re-throw to ensure calling code knows initialization failed
  }
}

/**
 * Stops all currently running CRON jobs with graceful shutdown.
 * Useful for graceful shutdown or testing.
 */
export function stopCronJobs(): void {
  const logger = createLogger('SYSTEM');
  let stoppedCount = 0;
  
  try {
    for (const [jobName, config] of jobRegistry.entries()) {
      if (config.task) {
        logger.info(`Stopping job: ${jobName}`);
        config.task.stop();
        config.task = null;
        stoppedCount++;
      }
  }
  
    if (stoppedCount > 0) {
      logger.info('CRON jobs shutdown completed', {
        stoppedJobs: stoppedCount,
        totalJobs: jobRegistry.size
      });
    } else {
      logger.info('No active CRON jobs to stop');
    }
    
  } catch (error) {
    logger.error('Error during CRON jobs shutdown', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

// NOTE: Graceful shutdown is handled centrally in instrumentation.node.ts
// to prevent process event listener accumulation and memory leaks 