import cron from 'node-cron';
// import { processAreaArmingSchedules } from '@/lib/actions/area-alarm-actions'; // No longer called directly here
import { processScheduledAutomations } from '@/services/automation-service'; // Import new processor
import { updateSunTimes } from '@/lib/cron/jobs/update-sun-times'; // Import sun times job
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
    // Register scheduled automations job
    registerJob({
      name: 'scheduled-automations',
      schedule: '* * * * *', // Every minute
      retryConfig: { maxRetries: 1, retryDelay: 500 } // Quick retry for time-sensitive tasks
    });
    
    // Register sun times update job  
    registerJob({
      name: 'sun-times-update',
      schedule: '0 9 * * *', // Daily at 9 AM UTC
      timezone: 'UTC',
      retryConfig: { maxRetries: 3, retryDelay: 30000 } // More retries with longer delay for external API
    });
    
    // Initialize scheduled automations job
    const automationsConfig = jobRegistry.get('scheduled-automations')!;
    const automationsTask = createJobWrapper(
      'scheduled-automations',
      async () => {
      const currentTime = new Date();
        await processScheduledAutomations(currentTime);
      },
      automationsConfig.retryConfig
    );
    
    automationsConfig.task = cron.schedule(automationsConfig.schedule, automationsTask);
    logger.info('Scheduled automations job initialized', {
      schedule: automationsConfig.schedule,
      retryConfig: automationsConfig.retryConfig
    });

    // Initialize sun times update job
    const sunTimesConfig = jobRegistry.get('sun-times-update')!;
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



// Enhanced graceful shutdown handling
const handleShutdown = (signal: string) => {
  const logger = createLogger('SYSTEM');
  logger.info(`Received ${signal}, initiating graceful CRON jobs shutdown...`);
  
  try {
    stopCronJobs();
    logger.info('CRON jobs shutdown completed, exiting process');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM')); 