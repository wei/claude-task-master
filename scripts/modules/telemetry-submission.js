/**
 * Telemetry Submission Service
 * Handles sending telemetry data to remote gateway endpoint
 */

import { z } from "zod";
import { getConfig } from "./config-manager.js";
import { getTelemetryEnabled } from "./config-manager.js";
import { resolveEnvVariable } from "./utils.js";

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
const TASKMASTER_BASE_URL = "http://localhost:4444";
const TASKMASTER_TELEMETRY_ENDPOINT = `${TASKMASTER_BASE_URL}/api/v1/telemetry`;
const TASKMASTER_USER_REGISTRATION_ENDPOINT = `${TASKMASTER_BASE_URL}/auth/init`;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Get telemetry configuration from hardcoded service ID, user token, and config
 * @returns {Object} Configuration object with serviceId, apiKey, userId, and email
 */
function getTelemetryConfig() {
  // Get the config which contains userId and email
  const config = getConfig();

  // Hardcoded service ID for TaskMaster telemetry service
  const hardcodedServiceId = "98fb3198-2dfc-42d1-af53-07b99e4f3bde";

  // Get user's API token from .env (managed by user-management.js)
  const userApiKey = resolveEnvVariable("TASKMASTER_API_KEY");

  return {
    serviceId: hardcodedServiceId, // Hardcoded service identifier
    apiKey: userApiKey || null, // User's Bearer token from .env
    userId: config?.account?.userId || null, // From config
    email: config?.account?.email || null, // From config
  };
}

/**
 * Register or lookup user with the TaskMaster telemetry gateway using /auth/init
 * @param {string} email - User's email address
 * @param {string} userId - User's ID
 * @returns {Promise<{success: boolean, apiKey?: string, userId?: string, email?: string, isNewUser?: boolean, error?: string}>}
 */
export async function registerUserWithGateway(email = null, userId = null) {
  try {
    const requestBody = {};
    if (email) requestBody.email = email;
    if (userId) requestBody.userId = userId;

    const response = await fetch(TASKMASTER_USER_REGISTRATION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Gateway registration failed: ${response.status} ${response.statusText}`,
      };
    }

    const result = await response.json();

    // Handle the /auth/init response format
    if (result.success && result.data) {
      return {
        success: true,
        apiKey: result.data.token,
        userId: result.data.userId,
        email: email,
        isNewUser: result.data.isNewUser,
      };
    } else {
      return {
        success: false,
        error: result.error || result.message || "Unknown registration error",
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `Gateway registration error: ${error.message}`,
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
    // Check user opt-out preferences first, but hosted mode always sends telemetry
    const config = getConfig();
    const isHostedMode = config?.account?.mode === "hosted";

    if (!isHostedMode && !getTelemetryEnabled()) {
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
          "Telemetry configuration incomplete. Please ensure you have completed 'task-master init' to set up your user account.",
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

    // Send FULL telemetry data to gateway (including commandArgs and fullOutput)
    // Note: Sensitive data filtering is handled separately for user-facing responses
    const completeTelemetryData = {
      ...telemetryData,
      userId: telemetryConfig.userId, // Ensure correct userId
    };

    // Attempt submission with retry logic
    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(TASKMASTER_TELEMETRY_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Service-ID": telemetryConfig.serviceId, // Hardcoded service ID
            Authorization: `Bearer ${telemetryConfig.apiKey}`, // User's Bearer token
            "X-User-Email": telemetryConfig.email, // User's email from config
          },
          body: JSON.stringify(completeTelemetryData),
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
