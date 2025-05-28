/**
 * Telemetry Submission Service
 * Handles sending telemetry data to remote gateway endpoint
 */

import { z } from "zod";
import { getConfig } from "./config-manager.js";

// Telemetry data validation schema
const TelemetryDataSchema = z.object({
  timestamp: z.string().datetime(),
  userId: z.string().min(1),
  commandName: z.string().min(1),
  modelUsed: z.string().optional(),
  providerName: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  totalCost: z.number().optional(),
  currency: z.string().optional(),
  commandArgs: z.any().optional(),
  fullOutput: z.any().optional(),
});

// Configuration
const GATEWAY_ENDPOINT = "http://localhost:4444/api/v1/telemetry";
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Submits telemetry data to the remote gateway endpoint
 * @param {Object} telemetryData - The telemetry data to submit
 * @returns {Promise<Object>} - Result object with success status and details
 */
export async function submitTelemetryData(telemetryData) {
  try {
    // Check user opt-out preferences first
    const config = getConfig();
    if (config && config.telemetryEnabled === false) {
      return {
        success: true,
        skipped: true,
        reason: "Telemetry disabled by user preference",
      };
    }

    // Validate telemetry data
    try {
      TelemetryDataSchema.parse(telemetryData);
    } catch (validationError) {
      return {
        success: false,
        error: `Telemetry data validation failed: ${validationError.message}`,
      };
    }

    // Filter out sensitive fields before submission
    const { commandArgs, fullOutput, ...safeTelemetryData } = telemetryData;

    // Attempt submission with retry logic
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(GATEWAY_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(safeTelemetryData),
        });

        if (response.ok) {
          const result = await response.json();
          return {
            success: true,
            id: result.id,
            attempt,
          };
        } else {
          // Handle HTTP error responses
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = `HTTP ${response.status} ${response.statusText}`;

          // Don't retry on certain status codes (rate limiting, auth errors, etc.)
          if (
            response.status === 429 ||
            response.status === 401 ||
            response.status === 403
          ) {
            return {
              success: false,
              error: errorMessage,
              statusCode: response.status,
            };
          }

          // For other HTTP errors, continue retrying
          lastError = new Error(errorMessage);
        }
      } catch (networkError) {
        lastError = networkError;
      }

      // Wait before retry (exponential backoff)
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt - 1))
        );
      }
    }

    // All retries failed
    return {
      success: false,
      error: lastError.message,
      attempts: MAX_RETRIES,
    };
  } catch (error) {
    // Graceful error handling - never throw
    return {
      success: false,
      error: `Telemetry submission failed: ${error.message}`,
    };
  }
}

/**
 * Submits telemetry data asynchronously without blocking execution
 * @param {Object} telemetryData - The telemetry data to submit
 */
export function submitTelemetryDataAsync(telemetryData) {
  // Fire and forget - don't block execution
  submitTelemetryData(telemetryData).catch((error) => {
    // Silently log errors without blocking
    console.debug("Telemetry submission failed:", error);
  });
}
