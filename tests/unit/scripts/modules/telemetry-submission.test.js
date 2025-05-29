/**
 * Unit Tests for Telemetry Submission Service - Task 90.2
 * Tests the secure telemetry submission with gateway integration
 */

import { jest } from "@jest/globals";

// Mock config-manager before importing submitTelemetryData
jest.unstable_mockModule(
  "../../../../scripts/modules/config-manager.js",
  () => ({
    getConfig: jest.fn(),
  })
);

// Mock fetch globally
global.fetch = jest.fn();

// Import after mocking
const { submitTelemetryData, registerUserWithGateway } = await import(
  "../../../../scripts/modules/telemetry-submission.js"
);
const { getConfig } = await import(
  "../../../../scripts/modules/config-manager.js"
);

describe("Telemetry Submission Service - Task 90.2", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  describe("Subtask 90.2: Send telemetry data to remote database endpoint", () => {
    it("should successfully submit telemetry data to hardcoded gateway endpoint", async () => {
      // Mock successful config
      getConfig.mockReturnValue({
        telemetry: {
          apiKey: "test-api-key",
          userId: "test-user-id",
          email: "test@example.com",
        },
      });

      // Mock successful response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "telemetry-123" }),
      });

      const telemetryData = {
        timestamp: new Date().toISOString(),
        userId: "test-user-id",
        commandName: "test-command",
        modelUsed: "claude-3-sonnet",
        totalCost: 0.001,
        currency: "USD",
        commandArgs: { secret: "should-be-filtered" },
        fullOutput: { debug: "should-be-filtered" },
      };

      const result = await submitTelemetryData(telemetryData);

      expect(result.success).toBe(true);
      expect(result.id).toBe("telemetry-123");
      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:4444/api/v1/telemetry", // Hardcoded endpoint
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-api-key",
            "X-User-Email": "test@example.com",
          },
          body: expect.stringContaining('"commandName":"test-command"'),
        })
      );

      // Verify sensitive data is filtered out
      const sentData = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(sentData.commandArgs).toBeUndefined();
      expect(sentData.fullOutput).toBeUndefined();
    });

    it("should implement retry logic for failed requests", async () => {
      getConfig.mockReturnValue({
        telemetry: {
          apiKey: "test-api-key",
          userId: "test-user-id",
          email: "test@example.com",
        },
      });

      // Mock 3 failures then success
      global.fetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          json: async () => ({}),
        });

      const telemetryData = {
        timestamp: new Date().toISOString(),
        userId: "test-user-id",
        commandName: "test-command",
        totalCost: 0.001,
        currency: "USD",
      };

      const result = await submitTelemetryData(telemetryData);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    }, 10000);

    it("should handle failures gracefully without blocking execution", async () => {
      getConfig.mockReturnValue({
        telemetry: {
          apiKey: "test-api-key",
          userId: "test-user-id",
          email: "test@example.com",
        },
      });

      global.fetch.mockRejectedValue(new Error("Network failure"));

      const telemetryData = {
        timestamp: new Date().toISOString(),
        userId: "test-user-id",
        commandName: "test-command",
        totalCost: 0.001,
        currency: "USD",
      };

      const result = await submitTelemetryData(telemetryData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network failure");
      expect(global.fetch).toHaveBeenCalledTimes(3); // All retries attempted
    }, 10000);

    it("should respect user opt-out preferences", async () => {
      getConfig.mockReturnValue({
        telemetryEnabled: false,
      });

      const telemetryData = {
        timestamp: new Date().toISOString(),
        userId: "test-user-id",
        commandName: "test-command",
        totalCost: 0.001,
        currency: "USD",
      };

      const result = await submitTelemetryData(telemetryData);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe("Telemetry disabled by user preference");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should validate telemetry data before submission", async () => {
      getConfig.mockReturnValue({
        telemetry: {
          apiKey: "test-api-key",
          userId: "test-user-id",
          email: "test@example.com",
        },
      });

      const invalidTelemetryData = {
        // Missing required fields
        commandName: "test-command",
      };

      const result = await submitTelemetryData(invalidTelemetryData);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Telemetry data validation failed");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should handle HTTP error responses appropriately", async () => {
      getConfig.mockReturnValue({
        telemetry: {
          apiKey: "invalid-key",
          userId: "test-user-id",
          email: "test@example.com",
        },
      });

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ error: "Invalid API key" }),
      });

      const telemetryData = {
        timestamp: new Date().toISOString(),
        userId: "test-user-id",
        commandName: "test-command",
        totalCost: 0.001,
        currency: "USD",
      };

      const result = await submitTelemetryData(telemetryData);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(global.fetch).toHaveBeenCalledTimes(1); // No retries for auth errors
    });
  });

  describe("Gateway User Registration", () => {
    it("should successfully register a user with gateway using /auth/init", async () => {
      const mockResponse = {
        success: true,
        message: "New user created successfully",
        data: {
          userId: "test-user-id",
          isNewUser: true,
          user: {
            email: "test@example.com",
            planType: "free",
            creditsBalance: 0,
          },
          token: "test-api-key",
        },
        timestamp: new Date().toISOString(),
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await registerUserWithGateway("test@example.com");

      expect(result).toEqual({
        success: true,
        apiKey: "test-api-key",
        userId: "test-user-id",
        email: "test@example.com",
        isNewUser: true,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:4444/auth/init",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: "test@example.com" }),
        }
      );
    });

    it("should handle existing user with /auth/init", async () => {
      const mockResponse = {
        success: true,
        message: "Existing user found",
        data: {
          userId: "existing-user-id",
          isNewUser: false,
          user: {
            email: "existing@example.com",
            planType: "free",
            creditsBalance: 20,
          },
          token: "existing-api-key",
        },
        timestamp: new Date().toISOString(),
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await registerUserWithGateway("existing@example.com");

      expect(result).toEqual({
        success: true,
        apiKey: "existing-api-key",
        userId: "existing-user-id",
        email: "existing@example.com",
        isNewUser: false,
      });
    });

    it("should handle registration failures gracefully", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await registerUserWithGateway("test@example.com");

      expect(result).toEqual({
        success: false,
        error: "Gateway registration failed: 500 Internal Server Error",
      });
    });

    it("should handle network errors during registration", async () => {
      global.fetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await registerUserWithGateway("test@example.com");

      expect(result).toEqual({
        success: false,
        error: "Gateway registration error: Network error",
      });
    });

    it("should handle invalid response format from /auth/init", async () => {
      const mockResponse = {
        success: false,
        error: "Invalid email format",
        timestamp: new Date().toISOString(),
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await registerUserWithGateway("invalid-email");

      expect(result).toEqual({
        success: false,
        error: "Invalid email format",
      });
    });
  });
});
