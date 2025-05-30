import fs from "fs";
import path from "path";
import { submitTelemetryData } from "./telemetry-submission.js";
import { getDebugFlag } from "./config-manager.js";
import { log } from "./utils.js";

class TelemetryQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.backgroundInterval = null;
    this.stats = {
      pending: 0,
      processed: 0,
      failed: 0,
      lastProcessedAt: null,
    };
    this.logFile = null;
  }

  /**
   * Initialize the queue with comprehensive logging file path
   * @param {string} projectRoot - Project root directory for log file
   */
  initialize(projectRoot) {
    if (projectRoot) {
      this.logFile = path.join(projectRoot, ".taskmaster-activity.log");
      this.loadPersistedQueue();
    }
  }

  /**
   * Add telemetry data to queue without blocking
   * @param {Object} telemetryData - Command telemetry data
   */
  addToQueue(telemetryData) {
    const queueItem = {
      ...telemetryData,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    };

    this.queue.push(queueItem);
    this.stats.pending = this.queue.length;

    // Log the activity immediately to .log file
    this.logActivity("QUEUED", {
      commandName: telemetryData.commandName,
      queuedAt: queueItem.queuedAt,
      userId: telemetryData.userId,
      success: telemetryData.success,
      executionTimeMs: telemetryData.executionTimeMs,
    });

    if (getDebugFlag()) {
      log("debug", `Added ${telemetryData.commandName} to telemetry queue`);
    }

    // Persist queue state if file is configured
    this.persistQueue();
  }

  /**
   * Log activity to comprehensive .log file
   * @param {string} action - The action being logged (QUEUED, SUBMITTED, FAILED, etc.)
   * @param {Object} data - The data to log
   */
  logActivity(action, data) {
    if (!this.logFile) return;

    try {
      const timestamp = new Date().toISOString();
      const logEntry = `${timestamp} [${action}] ${JSON.stringify(data)}\n`;

      fs.appendFileSync(this.logFile, logEntry);
    } catch (error) {
      if (getDebugFlag()) {
        log("error", `Failed to write to activity log: ${error.message}`);
      }
    }
  }

  /**
   * Process all queued telemetry items
   * @returns {Object} Processing result with stats
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return { processed: 0, failed: 0, errors: [] };
    }

    this.processing = true;
    const errors = [];
    let processed = 0;
    let failed = 0;

    this.logActivity("PROCESSING_START", { queueSize: this.queue.length });

    // Process items in batches to avoid overwhelming the gateway
    const batchSize = 5;
    const itemsToProcess = [...this.queue];

    for (let i = 0; i < itemsToProcess.length; i += batchSize) {
      const batch = itemsToProcess.slice(i, i + batchSize);

      for (const item of batch) {
        try {
          item.attempts++;
          const result = await submitTelemetryData(item);

          if (result.success) {
            // Remove from queue on success
            const index = this.queue.findIndex(
              (q) => q.queuedAt === item.queuedAt
            );
            if (index > -1) {
              this.queue.splice(index, 1);
            }
            processed++;

            // Log successful submission
            this.logActivity("SUBMITTED", {
              commandName: item.commandName,
              queuedAt: item.queuedAt,
              attempts: item.attempts,
            });
          } else {
            // Retry failed items up to 3 times
            if (item.attempts >= 3) {
              const index = this.queue.findIndex(
                (q) => q.queuedAt === item.queuedAt
              );
              if (index > -1) {
                this.queue.splice(index, 1);
              }
              failed++;
              const errorMsg = `Failed to submit ${item.commandName} after 3 attempts: ${result.error}`;
              errors.push(errorMsg);

              // Log final failure
              this.logActivity("FAILED", {
                commandName: item.commandName,
                queuedAt: item.queuedAt,
                attempts: item.attempts,
                error: result.error,
              });
            } else {
              // Log retry attempt
              this.logActivity("RETRY", {
                commandName: item.commandName,
                queuedAt: item.queuedAt,
                attempts: item.attempts,
                error: result.error,
              });
            }
          }
        } catch (error) {
          // Network or unexpected errors
          if (item.attempts >= 3) {
            const index = this.queue.findIndex(
              (q) => q.queuedAt === item.queuedAt
            );
            if (index > -1) {
              this.queue.splice(index, 1);
            }
            failed++;
            const errorMsg = `Exception submitting ${item.commandName}: ${error.message}`;
            errors.push(errorMsg);

            // Log exception failure
            this.logActivity("EXCEPTION", {
              commandName: item.commandName,
              queuedAt: item.queuedAt,
              attempts: item.attempts,
              error: error.message,
            });
          } else {
            // Log retry for exception
            this.logActivity("RETRY_EXCEPTION", {
              commandName: item.commandName,
              queuedAt: item.queuedAt,
              attempts: item.attempts,
              error: error.message,
            });
          }
        }
      }

      // Small delay between batches
      if (i + batchSize < itemsToProcess.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    this.stats.pending = this.queue.length;
    this.stats.processed += processed;
    this.stats.failed += failed;
    this.stats.lastProcessedAt = new Date().toISOString();

    this.processing = false;
    this.persistQueue();

    // Log processing completion
    this.logActivity("PROCESSING_COMPLETE", {
      processed,
      failed,
      remainingInQueue: this.queue.length,
    });

    if (getDebugFlag() && (processed > 0 || failed > 0)) {
      log(
        "debug",
        `Telemetry queue processed: ${processed} success, ${failed} failed`
      );
    }

    return { processed, failed, errors };
  }

  /**
   * Start background processing at specified interval
   * @param {number} intervalMs - Processing interval in milliseconds (default: 30000)
   */
  startBackgroundProcessor(intervalMs = 30000) {
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
    }

    this.backgroundInterval = setInterval(async () => {
      try {
        await this.processQueue();
      } catch (error) {
        if (getDebugFlag()) {
          log(
            "error",
            `Background telemetry processing error: ${error.message}`
          );
        }
      }
    }, intervalMs);

    if (getDebugFlag()) {
      log(
        "debug",
        `Started telemetry background processor (${intervalMs}ms interval)`
      );
    }
  }

  /**
   * Stop background processing
   */
  stopBackgroundProcessor() {
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
      this.backgroundInterval = null;

      if (getDebugFlag()) {
        log("debug", "Stopped telemetry background processor");
      }
    }
  }

  /**
   * Get queue statistics
   * @returns {Object} Queue stats
   */
  getQueueStats() {
    return {
      ...this.stats,
      pending: this.queue.length,
    };
  }

  /**
   * Load persisted queue from file (now reads from .log file)
   */
  loadPersistedQueue() {
    // For the .log file, we'll look for a companion .json file for queue state
    if (!this.logFile) return;

    const stateFile = this.logFile.replace(".log", "-queue-state.json");
    if (!fs.existsSync(stateFile)) {
      return;
    }

    try {
      const data = fs.readFileSync(stateFile, "utf8");
      const persistedData = JSON.parse(data);

      this.queue = persistedData.queue || [];
      this.stats = { ...this.stats, ...persistedData.stats };

      if (getDebugFlag()) {
        log(
          "debug",
          `Loaded ${this.queue.length} items from telemetry queue state`
        );
      }
    } catch (error) {
      if (getDebugFlag()) {
        log(
          "error",
          `Failed to load persisted telemetry queue: ${error.message}`
        );
      }
    }
  }

  /**
   * Persist queue state to companion file
   */
  persistQueue() {
    if (!this.logFile) return;

    const stateFile = this.logFile.replace(".log", "-queue-state.json");

    try {
      const data = {
        queue: this.queue,
        stats: this.stats,
        lastUpdated: new Date().toISOString(),
      };

      fs.writeFileSync(stateFile, JSON.stringify(data, null, 2));
    } catch (error) {
      if (getDebugFlag()) {
        log("error", `Failed to persist telemetry queue: ${error.message}`);
      }
    }
  }
}

// Global instance
const telemetryQueue = new TelemetryQueue();

/**
 * Add command telemetry to queue (non-blocking)
 * @param {Object} commandData - Command execution data
 */
export function queueCommandTelemetry(commandData) {
  telemetryQueue.addToQueue(commandData);
}

/**
 * Initialize telemetry queue with project root
 * @param {string} projectRoot - Project root directory
 */
export function initializeTelemetryQueue(projectRoot) {
  telemetryQueue.initialize(projectRoot);
}

/**
 * Start background telemetry processing
 * @param {number} intervalMs - Processing interval in milliseconds
 */
export function startTelemetryBackgroundProcessor(intervalMs = 30000) {
  telemetryQueue.startBackgroundProcessor(intervalMs);
}

/**
 * Stop background telemetry processing
 */
export function stopTelemetryBackgroundProcessor() {
  telemetryQueue.stopBackgroundProcessor();
}

/**
 * Get telemetry queue statistics
 * @returns {Object} Queue statistics
 */
export function getTelemetryQueueStats() {
  return telemetryQueue.getQueueStats();
}

/**
 * Manually process telemetry queue
 * @returns {Object} Processing result
 */
export function processTelemetryQueue() {
  return telemetryQueue.processQueue();
}

export { telemetryQueue };
