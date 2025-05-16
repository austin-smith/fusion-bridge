import cron from 'node-cron';
import { processAreaArmingSchedules } from '@/lib/actions/area-alarm-actions';
import type { ScheduledTask } from 'node-cron';

let cronJob: ScheduledTask | null = null;

/**
 * Initializes and starts the CRON job for processing area arming schedules.
 * The job is scheduled to run every minute.
 */
export function initializeCronJobs(): void {
  // Prevent multiple initializations if called more than once
  if (cronJob) {
    console.log('CRON job already initialized.');
    return;
  }

  console.log('Initializing CRON job for area arming schedules...');
  
  // Schedule to run every minute: '*/1 * * * *' or just '* * * * *'
  cronJob = cron.schedule('* * * * *', async () => {
    console.log(`[${new Date().toISOString()}] CRON: Running scheduled job - processAreaArmingSchedules`);
    try {
      await processAreaArmingSchedules();
      console.log(`[${new Date().toISOString()}] CRON: Finished scheduled job - processAreaArmingSchedules`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] CRON: Error during scheduled job - processAreaArmingSchedules:`, error);
    }
  });

  console.log('CRON job for area arming schedules has been scheduled to run every minute.');
}

/**
 * Stops the currently running CRON job.
 * Useful for graceful shutdown or testing.
 */
export function stopCronJobs(): void {
  if (cronJob) {
    console.log('Stopping CRON job for area arming schedules...');
    cronJob.stop();
    cronJob = null;
    console.log('CRON job stopped.');
  } else {
    console.log('No CRON job to stop.');
  }
}

// Optional: Graceful shutdown handling
// process.on('SIGINT', () => {
//   console.log('SIGINT received, stopping CRON jobs...');
//   stopCronJobs();
//   process.exit(0);
// });

// process.on('SIGTERM', () => {
//   console.log('SIGTERM received, stopping CRON jobs...');
//   stopCronJobs();
//   process.exit(0);
// }); 