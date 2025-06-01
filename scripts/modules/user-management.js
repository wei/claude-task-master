import fs from "fs";
import path from "path";
import { log, findProjectRoot } from "./utils.js";
import { getConfig, writeConfig, getUserId } from "./config-manager.js";

/**
 * Registers or finds a user via the gateway's /auth/init endpoint
 * @param {string|null} email - Optional user's email address (only needed for billing)
 * @param {string|null} explicitRoot - Optional explicit project root path
 * @returns {Promise<{success: boolean, userId: string, token: string, isNewUser: boolean, error?: string}>}
 */
async function registerUserWithGateway(email = null, explicitRoot = null) {
  try {
    const gatewayUrl =
      process.env.TASKMASTER_GATEWAY_URL || "http://localhost:4444";

    // Check for existing userId and email to pass to gateway
    const existingUserId = getUserId(explicitRoot);
    const existingEmail = email || getUserEmail(explicitRoot);

    // Build request body with existing values (gateway can handle userId for existing users)
    const requestBody = {};
    if (existingUserId && existingUserId !== "1234567890") {
      requestBody.userId = existingUserId;
    }
    if (existingEmail) {
      requestBody.email = existingEmail;
    }

    const response = await fetch(`${gatewayUrl}/auth/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        userId: "",
        token: "",
        isNewUser: false,
        error: `Gateway registration failed: ${response.status} ${errorText}`,
      };
    }

    const result = await response.json();

    if (result.success && result.data) {
      return {
        success: true,
        userId: result.data.userId,
        token: result.data.token,
        isNewUser: result.data.isNewUser,
      };
    } else {
      return {
        success: false,
        userId: "",
        token: "",
        isNewUser: false,
        error: "Invalid response format from gateway",
      };
    }
  } catch (error) {
    return {
      success: false,
      userId: "",
      token: "",
      isNewUser: false,
      error: `Network error: ${error.message}`,
    };
  }
}

/**
 * Updates the user configuration with gateway registration results
 * @param {string} userId - User ID from gateway
 * @param {string} token - User authentication token from gateway (stored in .env)
 * @param {string} mode - User mode ('byok' or 'hosted')
 * @param {string|null} email - Optional user email to save
 * @param {string|null} explicitRoot - Optional explicit project root path
 * @returns {boolean} Success status
 */
function updateUserConfig(
  userId,
  token,
  mode,
  email = null,
  explicitRoot = null
) {
  try {
    const config = getConfig(explicitRoot);

    // Ensure account section exists
    if (!config.account) {
      config.account = {};
    }

    // Ensure global section exists for email
    if (!config.global) {
      config.global = {};
    }

    // Update user configuration in account section
    config.account.userId = userId;
    config.account.mode = mode; // 'byok' or 'hosted'

    // Save email if provided
    if (email) {
      config.account.email = email;
    }

    // Write user authentication token to .env file (not config)
    if (token) {
      writeApiKeyToEnv(token, explicitRoot);
    }

    // Save updated config
    const success = writeConfig(config, explicitRoot);
    if (success) {
      const emailInfo = email ? `, email=${email}` : "";
      log(
        "info",
        `User configuration updated: userId=${userId}, mode=${mode}${emailInfo}`
      );
    } else {
      log("error", "Failed to write updated user configuration");
    }

    return success;
  } catch (error) {
    log("error", `Error updating user config: ${error.message}`);
    return false;
  }
}

/**
 * Writes the user authentication token to the .env file
 * This token is used as Bearer auth for gateway API calls
 * @param {string} token - Authentication token to write
 * @param {string|null} explicitRoot - Optional explicit project root path
 */
function writeApiKeyToEnv(token, explicitRoot = null) {
  try {
    // Determine project root
    let rootPath = explicitRoot;
    if (!rootPath) {
      rootPath = findProjectRoot();
      if (!rootPath) {
        log("warn", "Could not determine project root for .env file");
        return;
      }
    }

    const envPath = path.join(rootPath, ".env");
    let envContent = "";

    // Read existing .env content if file exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf8");
    }

    // Check if TASKMASTER_API_KEY already exists
    const lines = envContent.split("\n");
    let keyExists = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("TASKMASTER_API_KEY=")) {
        lines[i] = `TASKMASTER_API_KEY=${token}`;
        keyExists = true;
        break;
      }
    }

    // Add key if it doesn't exist
    if (!keyExists) {
      if (envContent && !envContent.endsWith("\n")) {
        envContent += "\n";
      }
      envContent += `TASKMASTER_API_KEY=${token}\n`;
    } else {
      envContent = lines.join("\n");
    }

    // Write updated content
    fs.writeFileSync(envPath, envContent);
    log("info", "User authentication token written to .env file");
  } catch (error) {
    log("error", `Failed to write user token to .env: ${error.message}`);
  }
}

/**
 * Gets the current user mode from configuration
 * @param {string|null} explicitRoot - Optional explicit project root path
 * @returns {string} User mode ('byok', 'hosted', or 'unknown')
 */
function getUserMode(explicitRoot = null) {
  try {
    const config = getConfig(explicitRoot);
    return config?.account?.mode || "unknown";
  } catch (error) {
    log("error", `Error getting user mode: ${error.message}`);
    return "unknown";
  }
}

/**
 * Checks if user is in hosted mode
 * @param {string|null} explicitRoot - Optional explicit project root path
 * @returns {boolean} True if user is in hosted mode
 */
function isHostedMode(explicitRoot = null) {
  return getUserMode(explicitRoot) === "hosted";
}

/**
 * Checks if user is in BYOK mode
 * @param {string|null} explicitRoot - Optional explicit project root path
 * @returns {boolean} True if user is in BYOK mode
 */
function isByokMode(explicitRoot = null) {
  return getUserMode(explicitRoot) === "byok";
}

/**
 * Complete user setup: register with gateway and configure TaskMaster
 * @param {string|null} email - Optional user's email (only needed for billing)
 * @param {string} mode - User's mode: 'byok' or 'hosted'
 * @param {string|null} explicitRoot - Optional explicit project root path
 * @returns {Promise<{success: boolean, userId: string, mode: string, error?: string}>}
 */
async function setupUser(email = null, mode = "hosted", explicitRoot = null) {
  try {
    // Step 1: Register with gateway (email optional)
    const registrationResult = await registerUserWithGateway(
      email,
      explicitRoot
    );

    if (!registrationResult.success) {
      return {
        success: false,
        userId: "",
        mode: "",
        error: registrationResult.error,
      };
    }

    // Step 2: Update config with userId, mode, and email
    const configResult = updateUserConfig(
      registrationResult.userId,
      registrationResult.token,
      mode,
      email,
      explicitRoot
    );

    if (!configResult) {
      return {
        success: false,
        userId: registrationResult.userId,
        mode: "",
        error: "Failed to update user configuration",
      };
    }

    return {
      success: true,
      userId: registrationResult.userId,
      mode: mode,
      message: email
        ? `User setup complete with email ${email}`
        : "User setup complete (email will be collected during billing setup)",
    };
  } catch (error) {
    return {
      success: false,
      userId: "",
      mode: "",
      error: `Setup failed: ${error.message}`,
    };
  }
}

/**
 * Initialize TaskMaster user (typically called during init)
 * Gets userId from gateway without requiring email upfront
 * @param {string|null} explicitRoot - Optional explicit project root path
 * @returns {Promise<{success: boolean, userId: string, error?: string}>}
 */
async function initializeUser(explicitRoot = null) {
  try {
    // Try to register with gateway without email
    const result = await registerUserWithGateway(null, explicitRoot);

    // If gateway call succeeded, use the returned values
    if (result.success) {
      // Update config with userId, token, and preserve existing mode (or default)
      const existingMode = getUserMode(explicitRoot);
      const modeToUse = existingMode !== "unknown" ? existingMode : "byok";

      const configResult = updateUserConfig(
        result.userId,
        result.token,
        modeToUse,
        null,
        explicitRoot
      );

      if (!configResult) {
        return {
          success: false,
          userId: result.userId,
          error: "Failed to update user configuration",
        };
      }

      return {
        success: true,
        userId: result.userId,
        message: result.isNewUser
          ? "New user registered with gateway"
          : "Existing user found in gateway",
      };
    }

    // Gateway call failed - check if we have existing credentials to use
    const existingUserId = getUserId(explicitRoot);
    const existingToken = getUserToken(explicitRoot);

    if (existingUserId && existingUserId !== "1234567890" && existingToken) {
      // We have existing credentials, use them (gateway unavailable scenario)
      return {
        success: true,
        userId: existingUserId,
        message: "Gateway unavailable, using existing user credentials",
      };
    }

    // No existing credentials and gateway failed
    return {
      success: false,
      userId: "",
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      userId: "",
      error: `Initialization failed: ${error.message}`,
    };
  }
}

/**
 * Gets the current user authentication token from .env file
 * This is the Bearer token used for gateway API calls
 * @param {string|null} explicitRoot - Optional explicit project root path
 * @returns {string|null} User authentication token or null if not found
 */
function getUserToken(explicitRoot = null) {
  try {
    // Determine project root
    let rootPath = explicitRoot;
    if (!rootPath) {
      rootPath = findProjectRoot();
      if (!rootPath) {
        log("error", "Could not determine project root for .env file");
        return null;
      }
    }

    const envPath = path.join(rootPath, ".env");
    if (!fs.existsSync(envPath)) {
      return null;
    }

    const envContent = fs.readFileSync(envPath, "utf8");
    const lines = envContent.split("\n");

    for (const line of lines) {
      if (line.startsWith("TASKMASTER_API_KEY=")) {
        return line.substring("TASKMASTER_API_KEY=".length).trim();
      }
    }

    return null;
  } catch (error) {
    log("error", `Error getting user token from .env: ${error.message}`);
    return null;
  }
}

/**
 * Gets the current user email from configuration
 * @param {string|null} explicitRoot - Optional explicit project root path
 * @returns {string|null} User email or null if not found
 */
function getUserEmail(explicitRoot = null) {
  try {
    const config = getConfig(explicitRoot);
    return config?.account?.email || null;
  } catch (error) {
    log("error", `Error getting user email: ${error.message}`);
    return null;
  }
}

export {
  registerUserWithGateway,
  updateUserConfig,
  writeApiKeyToEnv,
  getUserMode,
  isHostedMode,
  isByokMode,
  setupUser,
  initializeUser,
  getUserToken,
  getUserEmail,
};
