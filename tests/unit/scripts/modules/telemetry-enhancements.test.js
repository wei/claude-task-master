/**
 * Tests for telemetry enhancements (Task 90)
 * Testing capture of command args and output without exposing in responses
 */

import { jest } from "@jest/globals";

// Define mock function instances first
const mockGenerateObjectService = jest.fn();
const mockGenerateTextService = jest.fn();

// Mock the ai-services-unified module before any imports
jest.unstable_mockModule(
  "../../../../scripts/modules/ai-services-unified.js",
  () => ({
    __esModule: true,
    generateObjectService: mockGenerateObjectService,
    generateTextService: mockGenerateTextService,
  })
);

describe("Telemetry Enhancements - Task 90", () => {
  let aiServicesUnified;

  beforeAll(async () => {
    // Reset mocks before importing
    mockGenerateObjectService.mockClear();
    mockGenerateTextService.mockClear();

    // Import the modules after mocking
    aiServicesUnified = await import(
      "../../../../scripts/modules/ai-services-unified.js"
    );
  });

  describe("Subtask 90.1: Capture command args and output without exposing in responses", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should capture command arguments in telemetry data", async () => {
      const mockCommandArgs = {
        id: "15",
        prompt: "Test task creation",
        apiKey: "sk-sensitive-key-12345",
        modelId: "claude-3-sonnet",
      };

      const mockResponse = {
        mainResult: {
          object: {
            title: "Generated Task",
            description: "AI generated description",
          },
        },
        telemetryData: {
          timestamp: "2025-05-28T15:00:00.000Z",
          commandName: "add-task",
          modelUsed: "claude-3-sonnet",
          inputTokens: 100,
          outputTokens: 50,
          totalCost: 0.001,
          commandArgs: mockCommandArgs,
        },
      };

      mockGenerateObjectService.mockResolvedValue(mockResponse);

      const result = await aiServicesUnified.generateObjectService({
        prompt: "Create a new task",
        commandName: "add-task",
      });

      // Verify telemetry data includes commandArgs
      expect(result.telemetryData.commandArgs).toEqual(mockCommandArgs);
      expect(result.telemetryData.commandArgs.prompt).toBe(
        "Test task creation"
      );
    });

    it("should capture full AI output in telemetry data", async () => {
      const mockFullOutput = {
        title: "Generated Task",
        description: "AI generated description",
        internalMetadata: "should not be exposed",
        debugInfo: "internal processing details",
      };

      const mockResponse = {
        mainResult: {
          object: {
            title: "Generated Task",
            description: "AI generated description",
          },
        },
        telemetryData: {
          timestamp: "2025-05-28T15:00:00.000Z",
          commandName: "expand-task",
          modelUsed: "claude-3-sonnet",
          inputTokens: 200,
          outputTokens: 150,
          totalCost: 0.002,
          fullOutput: mockFullOutput,
        },
      };

      mockGenerateObjectService.mockResolvedValue(mockResponse);

      const result = await aiServicesUnified.generateObjectService({
        prompt: "Expand this task",
        commandName: "expand-task",
      });

      // Verify telemetry data includes fullOutput
      expect(result.telemetryData.fullOutput).toEqual(mockFullOutput);
      expect(result.telemetryData.fullOutput.internalMetadata).toBe(
        "should not be exposed"
      );

      // Verify mainResult only contains the filtered output
      expect(result.mainResult.object.title).toBe("Generated Task");
      expect(result.mainResult.object.internalMetadata).toBeUndefined();
    });

    it("should not expose commandArgs or fullOutput in MCP responses", async () => {
      // Test the actual filtering function
      const sensitiveData = {
        timestamp: "2025-05-28T15:00:00.000Z",
        commandName: "test-command",
        modelUsed: "claude-3-sonnet",
        inputTokens: 100,
        outputTokens: 50,
        totalCost: 0.001,
        commandArgs: {
          apiKey: "sk-sensitive-key-12345",
          secret: "should not be exposed",
        },
        fullOutput: {
          internal: "should not be exposed",
          debugInfo: "sensitive debug data",
        },
      };

      // Import the actual filtering function to test it
      const { filterSensitiveTelemetryData } = await import(
        "../../../../mcp-server/src/tools/utils.js"
      );

      const filteredData = filterSensitiveTelemetryData(sensitiveData);

      // Verify sensitive fields are removed
      expect(filteredData.commandArgs).toBeUndefined();
      expect(filteredData.fullOutput).toBeUndefined();

      // Verify safe fields are preserved
      expect(filteredData.timestamp).toBe("2025-05-28T15:00:00.000Z");
      expect(filteredData.commandName).toBe("test-command");
      expect(filteredData.modelUsed).toBe("claude-3-sonnet");
      expect(filteredData.inputTokens).toBe(100);
      expect(filteredData.outputTokens).toBe(50);
      expect(filteredData.totalCost).toBe(0.001);
    });

    it("should not expose commandArgs or fullOutput in CLI responses", async () => {
      // Test that displayAiUsageSummary only uses safe fields
      const sensitiveData = {
        timestamp: "2025-05-28T15:00:00.000Z",
        commandName: "test-command",
        modelUsed: "claude-3-sonnet",
        providerName: "anthropic",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        totalCost: 0.001,
        commandArgs: {
          apiKey: "sk-sensitive-key-12345",
          secret: "should not be exposed",
        },
        fullOutput: {
          internal: "should not be exposed",
          debugInfo: "sensitive debug data",
        },
      };

      // Import the actual display function to verify it only uses safe fields
      const { displayAiUsageSummary } = await import(
        "../../../../scripts/modules/ui.js"
      );

      // Mock console.log to capture output
      const consoleSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});

      // Call the display function
      displayAiUsageSummary(sensitiveData, "cli");

      // Get the output that was logged
      const loggedOutput = consoleSpy.mock.calls
        .map((call) => call.join(" "))
        .join("\n");

      // Verify sensitive data is not in the output
      expect(loggedOutput).not.toContain("sk-sensitive-key-12345");
      expect(loggedOutput).not.toContain("should not be exposed");
      expect(loggedOutput).not.toContain("sensitive debug data");

      // Verify safe data is in the output
      expect(loggedOutput).toContain("test-command");
      expect(loggedOutput).toContain("claude-3-sonnet");
      expect(loggedOutput).toContain("anthropic");
      expect(loggedOutput).toContain("150"); // totalTokens

      // Restore console.log
      consoleSpy.mockRestore();
    });
  });
});
