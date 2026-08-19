/**
 * server/src/services/scheduler.service.js
 * ------------------------------------------------------------------
 * Automated Cron Scheduler for Ingestion Service.
 *
 * Configurable via:
 *   INGESTION_CRON (default: "0 3 * * 0" — every Sunday at 03:00)
 *   INGESTION_SCHEDULE_ENABLED ("true" | "false")
 * ------------------------------------------------------------------
 */

const cron = require('node-cron');
const { runWeeklyIngestion } = require('../pipeline/ingest');

let scheduledTask = null;

function initScheduler() {
  const cronExpr = process.env.INGESTION_CRON || '0 3 * * 0';
  const enabled = process.env.INGESTION_SCHEDULE_ENABLED !== 'false';

  if (!enabled) {
    console.log('[scheduler] Weekly ingestion cron disabled via INGESTION_SCHEDULE_ENABLED=false');
    return null;
  }

  if (!cron.validate(cronExpr)) {
    console.error(`[scheduler] Invalid INGESTION_CRON expression "${cronExpr}"`);
    return null;
  }

  if (scheduledTask) {
    scheduledTask.stop();
  }

  scheduledTask = cron.schedule(cronExpr, async () => {
    console.log(`[scheduler] Triggering weekly ingestion run (${new Date().toISOString()})...`);
    try {
      const res = await runWeeklyIngestion({ testMode: false, manualTrigger: false });
      console.log(`[scheduler] Completed ingestion run ${res.id}: staged ${res.successfullyStaged}, skipped ${res.duplicatesSkipped}`);
    } catch (err) {
      console.error('[scheduler] Ingestion run failed:', err);
    }
  });

  console.log(`[scheduler] Weekly ingestion scheduled with cron expression: "${cronExpr}"`);
  return scheduledTask;
}

function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = {
  initScheduler,
  stopScheduler,
};
