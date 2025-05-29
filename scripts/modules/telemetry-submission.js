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

// Hardcoded configuration for TaskMaster telemetry gateway
const TASKMASTER_TELEMETRY_ENDPOINT = "http://localhost:4444/api/v1/telemetry";
const TASKMASTER_USER_REGISTRATION_ENDPOINT =
  "http://localhost:4444/api/v1/users";
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Get telemetry configuration from environment or config
 * @returns {Object} Configuration object with apiKey, userId, and email
 */
function getTelemetryConfig() {
  // Try environment variables first (for testing and manual setup)
  const envApiKey =
    process.env.TASKMASTER_API_KEY ||
    process.env.GATEWAY_API_KEY ||
    process.env.TELEMETRY_API_KEY;
  const envUserId =
    process.env.TASKMASTER_USER_ID ||
    process.env.GATEWAY_USER_ID ||
    process.env.TELEMETRY_USER_ID;
  const envEmail =
    process.env.TASKMASTER_USER_EMAIL ||
    process.env.GATEWAY_USER_EMAIL ||
    process.env.TELEMETRY_USER_EMAIL;

  if (envApiKey && envUserId && envEmail) {
    return { apiKey: envApiKey, userId: envUserId, email: envEmail };
  }

  // Fall back to config file (preferred for hosted gateway setup)
  const config = getConfig();
  return {
    apiKey: config?.telemetry?.apiKey || config?.telemetryApiKey,
    userId:
      config?.telemetry?.userId ||
      config?.telemetryUserId ||
      config?.global?.userId,
    email: config?.telemetry?.email || config?.telemetryUserEmail,
  };
}

/**
 * Register or find user with TaskMaster telemetry gateway
 * @param {string} email - User's email address
 * @param {string} [userId] - Optional user ID (will be generated if not provided)
 * @returns {Promise<Object>} - User registration result with apiKey and userId
 */
export async function registerUserWithGateway(email, userId = null) {
  try {
    const registrationData = {
      email,
      ...(userId && { userId }), // Include userId only if provided
    };

    const response = await fetch(TASKMASTER_USER_REGISTRATION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(registrationData),
    });

    if (response.ok) {
      const result = await response.json();
      return {
        success: true,
        apiKey: result.apiKey,
        userId: result.userId,
        email: result.email,
        isNewUser: result.isNewUser || false,
      };
    } else {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `Registration failed: ${response.status} ${response.statusText}`,
        details: errorData,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `Registration request failed: ${error.message}`,
    };
  }
}

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

    // Get telemetry configuration
    const telemetryConfig = getTelemetryConfig();
    if (
      !telemetryConfig.apiKey ||
      !telemetryConfig.userId ||
      !telemetryConfig.email
    ) {
      return {
        success: false,
        error:
          "Telemetry configuration incomplete. Run 'task-master init' and select hosted gateway option, or manually set TASKMASTER_API_KEY, TASKMASTER_USER_ID, and TASKMASTER_USER_EMAIL environment variables",
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

    // Filter out sensitive fields before submission and ensure userId is set
    const { commandArgs, fullOutput, ...safeTelemetryData } = telemetryData;
    safeTelemetryData.userId = telemetryConfig.userId; // Ensure correct userId

    // Attempt submission with retry logic
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(TASKMASTER_TELEMETRY_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${telemetryConfig.apiKey}`, // Use Bearer token format
            "X-User-Email": telemetryConfig.email, // Add required email header
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
