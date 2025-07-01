import cron from 'node-cron';
// import { processAreaArmingSchedules } from '@/lib/actions/area-alarm-actions'; // No longer called directly here
import { processScheduledAutomations } from '@/services/automation-service'; // Import new processor
import type { ScheduledTask } from 'node-cron';

let cronJob: ScheduledTask | null = null;

/**
 * Initializes and starts the main CRON job for processing all scheduled automations.
 * The job is scheduled to run every minute.
 */
export function initializeCronJobs(): void {
  // Prevent multiple initializations if called more than once
  if (cronJob) {
    console.log('Main CRON job already initialized.');
    return;
  }

  console.log('Initializing main CRON job for scheduled automations...');
  
  // Schedule to run every minute: '*/1 * * * *' or just '* * * * *'
  cronJob = cron.schedule('* * * * *', async () => {
    const currentTime = new Date();
    console.log(`[${currentTime.toISOString()}] CRON: Running main scheduled automation processor...`);
    try {
      // Call the new generic scheduled automation processor
      await processScheduledAutomations(currentTime);
      console.log(`[${currentTime.toISOString()}] CRON: Finished main scheduled automation processor.`);
    } catch (error) {
      console.error(`[${currentTime.toISOString()}] CRON: Error during main scheduled automation processing:`, error);
    }

    // Example of how a specific task like area arming might be logged if it were still here
    // console.log(`[${new Date().toISOString()}] CRON: Running scheduled job - processAreaArmingSchedules`);
    // try {
    //   await processAreaArmingSchedules(); // This would be removed or refactored into an automation rule
    //   console.log(`[${new Date().toISOString()}] CRON: Finished scheduled job - processAreaArmingSchedules`);
    // } catch (error) {
    //   console.error(`[${new Date().toISOString()}] CRON: Error during scheduled job - processAreaArmingSchedules:`, error);
    // }
  });

  console.log('Main CRON job for scheduled automations has been scheduled to run every minute.');
}

/**
 * Stops the currently running main CRON job.
 * Useful for graceful shutdown or testing.
 */
export function stopCronJobs(): void {
  if (cronJob) {
    console.log('Stopping main CRON job...');
    cronJob.stop();
    cronJob = null;
    console.log('Main CRON job stopped.');
  } else {
    console.log('No main CRON job to stop.');
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