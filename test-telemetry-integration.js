#!/usr/bin/env node

/**
 * Integration test for telemetry submission with real gateway
 */

import { submitTelemetryData } from "./scripts/modules/telemetry-submission.js";

// Test data from the gateway registration
const TEST_API_KEY = "554d9e2a-9c07-4f69-a449-a2bda0ff06e7";
const TEST_USER_ID = "c81e686a-a37c-4dc4-ac23-0849f70a9a52";

async function testTelemetrySubmission() {
  console.log("🧪 Testing telemetry submission with real gateway...\n");

  // Create test telemetry data
  const telemetryData = {
    timestamp: new Date().toISOString(),
    userId: TEST_USER_ID,
    commandName: "add-task",
    modelUsed: "claude-3-sonnet",
    providerName: "anthropic",
    inputTokens: 150,
    outputTokens: 75,
    totalTokens: 225,
    totalCost: 0.0045,
    currency: "USD",
    // These should be filtered out before submission
    commandArgs: {
      id: "15",
      prompt: "Test task creation",
      apiKey: "sk-secret-key-should-be-filtered",
    },
    fullOutput: {
      title: "Generated Task",
      description: "AI generated task description",
      internalDebugData: "This should not be sent to gateway",
    },
  };

  console.log("📤 Submitting telemetry data...");
  console.log("Data to submit:", JSON.stringify(telemetryData, null, 2));
  console.log(
    "\n⚠️  Note: commandArgs and fullOutput should be filtered out before submission\n"
  );

  try {
    const result = await submitTelemetryData(telemetryData);

    console.log("✅ Telemetry submission result:");
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
      console.log("\n🎉 SUCCESS: Telemetry data submitted successfully!");
      if (result.id) {
        console.log(`📝 Gateway assigned ID: ${result.id}`);
      }
      console.log(`🔄 Completed in ${result.attempt || 1} attempt(s)`);
    } else {
      console.log("\n❌ FAILED: Telemetry submission failed");
      console.log(`Error: ${result.error}`);
    }
  } catch (error) {
    console.error(
      "\n💥 EXCEPTION: Unexpected error during telemetry submission"
    );
    console.error(error);
  }
}

// Test with manual curl to verify endpoint works
async function testWithCurl() {
  console.log("\n🔧 Testing with direct curl for comparison...\n");

  const testData = {
    timestamp: new Date().toISOString(),
    userId: TEST_USER_ID,
    commandName: "curl-test",
    modelUsed: "claude-3-sonnet",
    totalCost: 0.001,
    currency: "USD",
  };

  console.log("Curl command that should work:");
  console.log(`curl -X POST http://localhost:4444/api/v1/telemetry \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -H "X-API-Key: ${TEST_API_KEY}" \\`);
  console.log(`  -d '${JSON.stringify(testData)}'`);
}

// Run the tests
console.log("🚀 Starting telemetry integration tests...\n");
await testTelemetrySubmission();
await testWithCurl();
console.log("\n✨ Integration test complete!");
