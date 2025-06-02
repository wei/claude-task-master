/**
 * Enhanced error handler for gateway responses
 * @param {Error} error - The error from the gateway call
 * @param {string} commandName - The command being executed
 */
function handleGatewayError(error, commandName) {
  try {
    // Extract status code and response from error message
    const match = error.message.match(/Gateway AI call failed: (\d+) (.+)/);
    if (!match) {
      throw new Error(`Unexpected error format: ${error.message}`);
    }

    const [, statusCode, responseText] = match;
    const status = parseInt(statusCode);

    let response;
    try {
      response = JSON.parse(responseText);
    } catch {
      // Handle non-JSON error responses
      console.error(`[ERROR] Gateway error (${status}): ${responseText}`);
      return;
    }

    switch (status) {
      case 400:
        handleValidationError(response, commandName);
        break;
      case 401:
        handleAuthError(response, commandName);
        break;
      case 402:
        handleCreditError(response, commandName);
        break;
      case 403:
        handleAccessDeniedError(response, commandName);
        break;
      case 429:
        handleRateLimitError(response, commandName);
        break;
      case 500:
        handleServerError(response, commandName);
        break;
      default:
        console.error(
          `[ERROR] Unexpected gateway error (${status}):`,
          response
        );
    }
  } catch (parseError) {
    console.error(`[ERROR] Failed to parse gateway error: ${error.message}`);
  }
}

function handleValidationError(response, commandName) {
  if (response.error?.includes("Unsupported model")) {
    console.error("🚫 The selected AI model is not supported by the gateway.");
    console.error(
      "💡 Try running `task-master models` to see available models."
    );
    return;
  }

  if (response.error?.includes("schema is required")) {
    console.error("🚫 This command requires a schema for structured output.");
    console.error("💡 This is likely a bug - please report it.");
    return;
  }

  console.error(`🚫 Invalid request: ${response.error}`);
  if (response.details?.length > 0) {
    response.details.forEach((detail) => {
      console.error(`   • ${detail.message || detail}`);
    });
  }
}

function handleAuthError(response, commandName) {
  console.error("🔐 Authentication failed with TaskMaster gateway.");

  if (response.message?.includes("Invalid token")) {
    console.error("💡 Your auth token may have expired. Try running:");
    console.error("   task-master init");
  } else if (response.message?.includes("Missing X-TaskMaster-Service-ID")) {
    console.error(
      "💡 Service authentication issue. This is likely a bug - please report it."
    );
  } else {
    console.error("💡 Please check your authentication settings.");
  }
}

function handleCreditError(response, commandName) {
  console.error("💳 Insufficient credits for this operation.");
  console.error(`💡 ${response.message || "Your account needs more credits."}`);
  console.error("   • Visit your dashboard to add credits");
  console.error("   • Or upgrade to a plan with more credits");
  console.error(
    "   • You can also switch to BYOK mode to use your own API keys"
  );
}

function handleAccessDeniedError(response, commandName) {
  const { details, hint } = response;

  if (
    details?.planType === "byok" &&
    details?.subscriptionStatus === "inactive"
  ) {
    console.error(
      "🔒 BYOK users need active subscriptions for hosted AI services."
    );
    console.error("💡 You have two options:");
    console.error("   1. Upgrade to a paid plan for hosted AI services");
    console.error("   2. Switch to BYOK mode and use your own API keys");
    console.error("");
    console.error("   To use your own API keys:");
    console.error(
      "   • Set your API keys in .env file (e.g., ANTHROPIC_API_KEY=...)"
    );
    console.error("   • The system will automatically use direct API calls");
    return;
  }

  if (details?.subscriptionStatus === "past_due") {
    console.error("💳 Your subscription payment is overdue.");
    console.error(
      "💡 Please update your payment method to continue using AI services."
    );
    console.error(
      "   Visit your account dashboard to update billing information."
    );
    return;
  }

  if (details?.planType === "free" && commandName === "research") {
    console.error("🔬 Research features require a paid subscription.");
    console.error("💡 Upgrade your plan to access research-powered commands.");
    return;
  }

  console.error(`🔒 Access denied: ${response.message}`);
  if (hint) {
    console.error(`💡 ${hint}`);
  }
}

function handleRateLimitError(response, commandName) {
  const retryAfter = response.retryAfter || 60;
  console.error("⏱️  Rate limit exceeded - too many requests.");
  console.error(`💡 Please wait ${retryAfter} seconds before trying again.`);
  console.error("   Consider upgrading your plan for higher rate limits.");
}

function handleServerError(response, commandName) {
  const retryAfter = response.retryAfter || 10;

  if (response.error?.includes("Service temporarily unavailable")) {
    console.error("🚧 TaskMaster gateway is temporarily unavailable.");
    console.error(
      `💡 The service should recover automatically. Try again in ${retryAfter} seconds.`
    );
    console.error(
      "   You can also switch to BYOK mode to use direct API calls."
    );
    return;
  }

  if (response.message?.includes("No user message found")) {
    console.error("🚫 Invalid request format - missing user message.");
    console.error("💡 This is likely a bug - please report it.");
    return;
  }

  console.error("⚠️  Gateway server error occurred.");
  console.error(
    `💡 Try again in ${retryAfter} seconds. If the problem persists:`
  );
  console.error("   • Check TaskMaster status page");
  console.error("   • Switch to BYOK mode as a workaround");
  console.error("   • Contact support if the issue continues");
}

// Export the main handler function
export { handleGatewayError };
