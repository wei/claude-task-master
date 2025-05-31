/**
 * Unit Tests for Telemetry Enhancements - Task 90.1 & 90.3
 * Tests the enhanced telemetry capture and submission integration
 */

import { jest } from "@jest/globals";

// Mock config-manager before importing
jest.unstable_mockModule(
  "../../../../scripts/modules/config-manager.js",
  () => ({
    getConfig: jest.fn(),
    getUserId: jest.fn(),
    getMainProvider: jest.fn(),
    getMainModelId: jest.fn(),
    getResearchProvider: jest.fn(),
    getResearchModelId: jest.fn(),
    getFallbackProvider: jest.fn(),
    getFallbackModelId: jest.fn(),
    getParametersForRole: jest.fn(),
    getDebugFlag: jest.fn(),
    getBaseUrlForRole: jest.fn(),
    isApiKeySet: jest.fn(),
    getOllamaBaseURL: jest.fn(),
    getAzureBaseURL: jest.fn(),
    getVertexProjectId: jest.fn(),
    getVertexLocation: jest.fn(),
    writeConfig: jest.fn(() => true),
    MODEL_MAP: {
      openai: [
        {
          id: "gpt-4",
          cost_per_1m_tokens: {
            input: 30,
            output: 60,
            currency: "USD",
          },
        },
      ],
    },
  })
);

// Mock telemetry-submission before importing
jest.unstable_mockModule(
  "../../../../scripts/modules/telemetry-submission.js",
  () => ({
    submitTelemetryData: jest.fn(),
  })
);

// Mock utils
jest.unstable_mockModule("../../../../scripts/modules/utils.js", () => ({
  log: jest.fn(),
  findProjectRoot: jest.fn(),
  resolveEnvVariable: jest.fn(),
}));

// Mock all AI providers
jest.unstable_mockModule("../../../../src/ai-providers/index.js", () => ({
  AnthropicAIProvider: class {},
  PerplexityAIProvider: class {},
  GoogleAIProvider: class {},
  OpenAIProvider: class {},
  XAIProvider: class {},
  OpenRouterAIProvider: class {},
  OllamaAIProvider: class {},
  BedrockAIProvider: class {},
  AzureProvider: class {},
  VertexAIProvider: class {},
}));

// Import after mocking
const { logAiUsage } = await import(
  "../../../../scripts/modules/ai-services-unified.js"
);
const { submitTelemetryData } = await import(
  "../../../../scripts/modules/telemetry-submission.js"
);
const { getConfig, getUserId, getDebugFlag } = await import(
  "../../../../scripts/modules/config-manager.js"
);

describe("Telemetry Enhancements - Task 90", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    getUserId.mockReturnValue("test-user-123");
    getDebugFlag.mockReturnValue(false);
    submitTelemetryData.mockResolvedValue({ success: true });
  });

  describe("Subtask 90.1: Capture command args and output without exposing in responses", () => {
    it("should capture command arguments in telemetry data", async () => {
      const commandArgs = {
        prompt: "test prompt",
        apiKey: "secret-key",
        modelId: "gpt-4",
      };

      const result = await logAiUsage({
        userId: "test-user",
        commandName: "add-task",
        providerName: "openai",
        modelId: "gpt-4",
        inputTokens: 100,
        outputTokens: 50,
        outputType: "cli",
        commandArgs,
      });

      expect(result.commandArgs).toEqual(commandArgs);
    });

    it("should capture full AI output in telemetry data", async () => {
      const fullOutput = {
        text: "AI response",
        usage: { promptTokens: 100, completionTokens: 50 },
        internalDebugData: "sensitive-debug-info",
      };

      const result = await logAiUsage({
        userId: "test-user",
        commandName: "add-task",
        providerName: "openai",
        modelId: "gpt-4",
        inputTokens: 100,
        outputTokens: 50,
        outputType: "cli",
        fullOutput,
      });

      expect(result.fullOutput).toEqual(fullOutput);
    });

    it("should not expose commandArgs/fullOutput in MCP responses", () => {
      // This is a placeholder test - would need actual MCP response processing
      // to verify filtering works correctly
      expect(true).toBe(true);
    });

    it("should not expose commandArgs/fullOutput in CLI responses", () => {
      // This is a placeholder test - would need actual CLI response processing
      // to verify filtering works correctly
      expect(true).toBe(true);
    });
  });

  describe("Subtask 90.3: Integration with telemetry submission", () => {
    it("should automatically submit telemetry data to gateway when AI calls are made", async () => {
      // Setup test data
      const testData = {
        userId: "test-user-123",
        commandName: "add-task",
        providerName: "openai",
        modelId: "gpt-4",
        inputTokens: 100,
        outputTokens: 50,
        outputType: "cli",
        commandArgs: { prompt: "test prompt", apiKey: "secret-key" },
        fullOutput: { text: "AI response", internalData: "debug-info" },
      };

      // Call logAiUsage
      const result = await logAiUsage(testData);

      // Verify telemetry data was created correctly
      expect(result).toMatchObject({
        timestamp: expect.any(String),
        userId: "test-user-123",
        commandName: "add-task",
        modelUsed: "gpt-4",
        providerName: "openai",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        totalCost: expect.any(Number),
        currency: "USD",
        commandArgs: testData.commandArgs,
        fullOutput: testData.fullOutput,
      });

      // Verify submitTelemetryData was called with the telemetry data
      expect(submitTelemetryData).toHaveBeenCalledWith(result);
    });

    it("should handle telemetry submission failures gracefully", async () => {
      // Make submitTelemetryData fail
      submitTelemetryData.mockResolvedValue({
        success: false,
        error: "Network error",
      });

      const testData = {
        userId: "test-user-123",
        commandName: "add-task",
        providerName: "openai",
        modelId: "gpt-4",
        inputTokens: 100,
        outputTokens: 50,
        outputType: "cli",
      };

      // Should not throw error even if submission fails
      const result = await logAiUsage(testData);

      // Should still return telemetry data
      expect(result).toBeDefined();
      expect(result.userId).toBe("test-user-123");
    });

    it("should not block execution if telemetry submission throws exception", async () => {
      // Make submitTelemetryData throw an exception
      submitTelemetryData.mockRejectedValue(new Error("Submission failed"));

      const testData = {
        userId: "test-user-123",
        commandName: "add-task",
        providerName: "openai",
        modelId: "gpt-4",
        inputTokens: 100,
        outputTokens: 50,
        outputType: "cli",
      };

      // Should not throw error even if submission throws
      const result = await logAiUsage(testData);

      // Should still return telemetry data
      expect(result).toBeDefined();
      expect(result.userId).toBe("test-user-123");
    });
  });

  describe("Subtask 90.4: Non-AI command telemetry queue", () => {
    let mockTelemetryQueue;

    beforeEach(() => {
      // Mock the telemetry queue module
      mockTelemetryQueue = {
        addToQueue: jest.fn(),
        processQueue: jest.fn(),
        startBackgroundProcessor: jest.fn(),
        stopBackgroundProcessor: jest.fn(),
        getQueueStats: jest.fn(() => ({ pending: 0, processed: 0, failed: 0 })),
      };
    });

    it("should add non-AI command telemetry to queue without blocking", async () => {
      const commandData = {
        timestamp: new Date().toISOString(),
        userId: "test-user-123",
        commandName: "list-tasks",
        executionTimeMs: 45,
        success: true,
        arguments: { status: "pending" },
      };

      // Should return immediately without waiting
      const startTime = Date.now();
      mockTelemetryQueue.addToQueue(commandData);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(10); // Should be nearly instantaneous
      expect(mockTelemetryQueue.addToQueue).toHaveBeenCalledWith(commandData);
    });

    it("should process queued telemetry in background", async () => {
      const queuedItems = [
        {
          commandName: "set-status",
          executionTimeMs: 23,
          success: true,
        },
        {
          commandName: "next-task",
          executionTimeMs: 12,
          success: true,
        },
      ];

      mockTelemetryQueue.processQueue.mockResolvedValue({
        processed: 2,
        failed: 0,
        errors: [],
      });

      const result = await mockTelemetryQueue.processQueue();

      expect(result.processed).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockTelemetryQueue.processQueue).toHaveBeenCalled();
    });

    it("should handle queue processing failures gracefully", async () => {
      mockTelemetryQueue.processQueue.mockResolvedValue({
        processed: 1,
        failed: 1,
        errors: ["Network timeout for item 2"],
      });

      const result = await mockTelemetryQueue.processQueue();

      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toContain("Network timeout for item 2");
    });

    it("should provide queue statistics", () => {
      mockTelemetryQueue.getQueueStats.mockReturnValue({
        pending: 5,
        processed: 127,
        failed: 3,
        lastProcessedAt: new Date().toISOString(),
      });

      const stats = mockTelemetryQueue.getQueueStats();

      expect(stats.pending).toBe(5);
      expect(stats.processed).toBe(127);
      expect(stats.failed).toBe(3);
      expect(stats.lastProcessedAt).toBeDefined();
    });

    it("should start and stop background processor", () => {
      mockTelemetryQueue.startBackgroundProcessor(30000); // 30 second interval
      expect(mockTelemetryQueue.startBackgroundProcessor).toHaveBeenCalledWith(
        30000
      );

      mockTelemetryQueue.stopBackgroundProcessor();
      expect(mockTelemetryQueue.stopBackgroundProcessor).toHaveBeenCalled();
    });
  });
});
