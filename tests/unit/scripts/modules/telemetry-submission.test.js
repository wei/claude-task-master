/**
 * Tests for telemetry submission service (Task 90.2)
 * Testing remote endpoint submission with retry logic and error handling
 */

import { jest } from "@jest/globals";
import { z } from "zod";

// Mock fetch for testing HTTP requests
global.fetch = jest.fn();

// Mock config-manager
const mockGetConfig = jest.fn();
jest.unstable_mockModule(
  "../../../../scripts/modules/config-manager.js",
  () => ({
    __esModule: true,
    getConfig: mockGetConfig,
  })
);

describe("Telemetry Submission Service - Task 90.2", () => {
  let telemetrySubmission;

  beforeAll(async () => {
    // Import after mocking
    telemetrySubmission = await import(
      "../../../../scripts/modules/telemetry-submission.js"
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset fetch mock
    fetch.mockClear();
    mockGetConfig.mockClear();

    // Default config mock - telemetry enabled
    mockGetConfig.mockReturnValue({ telemetryEnabled: true });
  });

  describe("Subtask 90.2: Send telemetry data to remote database endpoint", () => {
    it("should successfully submit telemetry data to gateway endpoint", async () => {
      // Mock successful response
      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, id: "telemetry-123" }),
      });

      const telemetryData = {
        timestamp: "2025-05-28T15:00:00.000Z",
        userId: "1234567890",
        commandName: "add-task",
        modelUsed: "claude-3-sonnet",
        providerName: "anthropic",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        totalCost: 0.001,
        currency: "USD",
        // These sensitive fields should be filtered out before submission
        commandArgs: { id: "15", prompt: "Test task" },
        fullOutput: { title: "Generated Task", description: "AI output" },
      };

      // Expected data after filtering (without commandArgs and fullOutput)
      const expectedFilteredData = {
        timestamp: "2025-05-28T15:00:00.000Z",
        userId: "1234567890",
        commandName: "add-task",
        modelUsed: "claude-3-sonnet",
        providerName: "anthropic",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        totalCost: 0.001,
        currency: "USD",
      };

      const result =
        await telemetrySubmission.submitTelemetryData(telemetryData);

      expect(result.success).toBe(true);
      expect(result.id).toBe("telemetry-123");

      // Verify the request was made with filtered data (security requirement)
      expect(fetch).toHaveBeenCalledWith(
        "https://gateway.task-master.dev/telemetry",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(expectedFilteredData),
        })
      );
    });

    it("should implement retry logic for failed requests", async () => {
      // Mock first two calls to fail, third to succeed
      fetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true, id: "telemetry-retry-123" }),
        });

      const telemetryData = {
        timestamp: "2025-05-28T15:00:00.000Z",
        userId: "1234567890",
        commandName: "expand-task",
        modelUsed: "claude-3-sonnet",
        totalCost: 0.002,
      };

      const result =
        await telemetrySubmission.submitTelemetryData(telemetryData);

      // Verify retry attempts (should be called 3 times)
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
      expect(result.id).toBe("telemetry-retry-123");
    });

    it("should handle failures gracefully without blocking execution", async () => {
      // Mock all attempts to fail
      fetch.mockRejectedValue(new Error("Persistent network error"));

      const telemetryData = {
        timestamp: "2025-05-28T15:00:00.000Z",
        userId: "1234567890",
        commandName: "research",
        modelUsed: "claude-3-sonnet",
        totalCost: 0.003,
      };

      const result =
        await telemetrySubmission.submitTelemetryData(telemetryData);

      // Verify it attempted retries but failed gracefully
      expect(fetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(result.success).toBe(false);
      expect(result.error).toContain("Persistent network error");
    });

    it("should respect user opt-out preferences", async () => {
      // Mock config to disable telemetry
      mockGetConfig.mockReturnValue({ telemetryEnabled: false });

      const telemetryData = {
        timestamp: "2025-05-28T15:00:00.000Z",
        userId: "1234567890",
        commandName: "add-task",
        totalCost: 0.001,
      };

      const result =
        await telemetrySubmission.submitTelemetryData(telemetryData);

      // Verify no network request was made
      expect(fetch).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe("Telemetry disabled by user preference");
    });

    it("should validate telemetry data before submission", async () => {
      const invalidTelemetryData = {
        // Missing required fields
        commandName: "test",
        // Invalid timestamp format
        timestamp: "invalid-date",
      };

      const result =
        await telemetrySubmission.submitTelemetryData(invalidTelemetryData);

      // Verify no network request was made for invalid data
      expect(fetch).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toContain("validation");
    });

    it("should handle HTTP error responses appropriately", async () => {
      // Mock HTTP 429 error response (no retries for rate limiting)
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        json: async () => ({ error: "Rate limit exceeded" }),
      });

      const telemetryData = {
        timestamp: "2025-05-28T15:00:00.000Z",
        userId: "1234567890",
        commandName: "update-task",
        modelUsed: "claude-3-sonnet",
        totalCost: 0.001,
      };

      const result =
        await telemetrySubmission.submitTelemetryData(telemetryData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("429");
      expect(result.error).toContain("Too Many Requests");
      expect(fetch).toHaveBeenCalledTimes(1); // No retries for 429
    });
  });
});
