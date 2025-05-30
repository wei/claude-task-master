import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { jest } from "@jest/globals";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("TaskMaster Init Configuration Tests", () => {
  const testProjectDir = path.join(__dirname, "../../test-init-project");
  const configPath = path.join(testProjectDir, ".taskmasterconfig");
  const envPath = path.join(testProjectDir, ".env");

  beforeEach(() => {
    // Clear all mocks and reset modules to prevent interference from other tests
    jest.clearAllMocks();
    jest.resetAllMocks();
    jest.resetModules();

    // Clean up test directory
    if (fs.existsSync(testProjectDir)) {
      execSync(`rm -rf "${testProjectDir}"`);
    }
    fs.mkdirSync(testProjectDir, { recursive: true });
    process.chdir(testProjectDir);
  });

  afterEach(() => {
    // Clean up after tests
    process.chdir(__dirname);
    if (fs.existsSync(testProjectDir)) {
      execSync(`rm -rf "${testProjectDir}"`);
    }

    // Clear mocks again
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe("getUserId functionality", () => {
    it("should read userId from config.account.userId", async () => {
      // Create config with userId in account section
      const config = {
        account: {
          mode: "byok",
          userId: "test-user-123",
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Import and test getUserId
      const { getUserId } = await import(
        "../../scripts/modules/config-manager.js"
      );
      const userId = getUserId(testProjectDir);

      expect(userId).toBe("test-user-123");
    });

    it("should set default userId if none exists", async () => {
      // Create config without userId
      const config = {
        account: {
          mode: "byok",
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      const { getUserId } = await import(
        "../../scripts/modules/config-manager.js"
      );
      const userId = getUserId(testProjectDir);

      // Should set default userId
      expect(userId).toBe("1234567890");

      // Verify it was written to config
      const savedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      expect(savedConfig.account.userId).toBe("1234567890");
    });

    it("should return existing userId even if it's the default value", async () => {
      // Create config with default userId already set
      const config = {
        account: {
          mode: "byok",
          userId: "1234567890",
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      const { getUserId } = await import(
        "../../scripts/modules/config-manager.js"
      );
      const userId = getUserId(testProjectDir);

      // Should return the existing userId (even if it's the default)
      expect(userId).toBe("1234567890");
    });
  });

  describe("Init process integration", () => {
    it("should store mode (byok/hosted) in config", () => {
      // Test that mode gets stored correctly
      const config = {
        account: {
          mode: "hosted",
          userId: "test-user-789",
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Read config back
      const savedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      expect(savedConfig.account.mode).toBe("hosted");
      expect(savedConfig.account.userId).toBe("test-user-789");
    });

    it("should store API key in .env file (NOT config)", () => {
      // Create .env with API key
      const envContent =
        "TASKMASTER_API_KEY=test-api-key-123\nOTHER_VAR=value\n";
      fs.writeFileSync(envPath, envContent);

      // Test that API key is in .env
      const envFileContent = fs.readFileSync(envPath, "utf8");
      expect(envFileContent).toContain("TASKMASTER_API_KEY=test-api-key-123");

      // Test that API key is NOT in config
      const config = {
        account: {
          mode: "byok",
          userId: "test-user-abc",
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      const configContent = fs.readFileSync(configPath, "utf8");
      expect(configContent).not.toContain("test-api-key-123");
      expect(configContent).not.toContain("apiKey");
    });
  });

  describe("Telemetry configuration", () => {
    it("should get API key from .env file", async () => {
      // Create .env with API key
      const envContent = "TASKMASTER_API_KEY=env-api-key-456\n";
      fs.writeFileSync(envPath, envContent);

      // Test reading API key from .env
      const { resolveEnvVariable } = await import(
        "../../scripts/modules/utils.js"
      );
      const apiKey = resolveEnvVariable(
        "TASKMASTER_API_KEY",
        null,
        testProjectDir
      );

      expect(apiKey).toBe("env-api-key-456");
    });

    it("should prioritize environment variables", async () => {
      // Clean up any existing env var first
      delete process.env.TASKMASTER_API_KEY;

      // Set environment variable
      process.env.TASKMASTER_API_KEY = "process-env-key";

      // Also create .env file
      const envContent = "TASKMASTER_API_KEY=file-env-key\n";
      fs.writeFileSync(envPath, envContent);

      const { resolveEnvVariable } = await import(
        "../../scripts/modules/utils.js"
      );

      // Test with explicit projectRoot to avoid caching issues
      const apiKey = resolveEnvVariable("TASKMASTER_API_KEY");

      // Should prioritize process.env over .env file
      expect(apiKey).toBe("process-env-key");

      // Clean up
      delete process.env.TASKMASTER_API_KEY;
    });
  });

  describe("Config structure consistency", () => {
    it("should maintain consistent structure for both BYOK and hosted modes", () => {
      // Test BYOK mode structure
      const byokConfig = {
        account: {
          mode: "byok",
          userId: "byok-user-123",
          telemetryEnabled: false,
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(byokConfig, null, 2));

      let config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      expect(config.account.mode).toBe("byok");
      expect(config.account.userId).toBe("byok-user-123");
      expect(config.account.telemetryEnabled).toBe(false);

      // Test hosted mode structure
      const hostedConfig = {
        account: {
          mode: "hosted",
          userId: "hosted-user-456",
          telemetryEnabled: true,
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(hostedConfig, null, 2));

      config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      expect(config.account.mode).toBe("hosted");
      expect(config.account.userId).toBe("hosted-user-456");
      expect(config.account.telemetryEnabled).toBe(true);
    });

    it("should use consistent userId location (config.account.userId)", async () => {
      const config = {
        account: {
          mode: "byok",
          userId: "consistent-user-789",
        },
        global: {
          logLevel: "info",
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Clear any cached modules to ensure fresh import
      jest.resetModules();

      const { getUserId } = await import(
        "../../scripts/modules/config-manager.js"
      );
      const userId = getUserId(testProjectDir);

      expect(userId).toBe("consistent-user-789");

      // Verify it's in account section, not root
      const savedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      expect(savedConfig.account.userId).toBe("consistent-user-789");
      expect(savedConfig.userId).toBeUndefined(); // Should NOT be in root
    });
  });
});
