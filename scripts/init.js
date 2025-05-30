/**
 * Task Master
 * Copyright (c) 2025 Eyal Toledano, Ralph Khreish
 *
 * This software is licensed under the MIT License with Commons Clause.
 * You may use this software for any purpose, including commercial applications,
 * and modify and redistribute it freely, subject to the following restrictions:
 *
 * 1. You may not sell this software or offer it as a service.
 * 2. The origin of this software must not be misrepresented.
 * 3. Altered source versions must be plainly marked as such.
 *
 * For the full license text, see the LICENSE file in the root directory.
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import { dirname } from "path";
import chalk from "chalk";
import figlet from "figlet";
import boxen from "boxen";
import gradient from "gradient-string";
import { isSilentMode } from "./modules/utils.js";
import { convertAllCursorRulesToRooRules } from "./modules/rule-transformer.js";
import { execSync } from "child_process";
import { registerUserWithGateway } from "./modules/telemetry-submission.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define log levels
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  success: 4,
};

// Determine log level from environment variable or default to 'info'
const LOG_LEVEL = process.env.TASKMASTER_LOG_LEVEL
  ? LOG_LEVELS[process.env.TASKMASTER_LOG_LEVEL.toLowerCase()]
  : LOG_LEVELS.info; // Default to info

// Create a color gradient for the banner
const coolGradient = gradient(["#00b4d8", "#0077b6", "#03045e"]);
const warmGradient = gradient(["#fb8b24", "#e36414", "#9a031e"]);

// Display a fancy banner
function displayBanner() {
  if (isSilentMode()) return;

  console.clear();
  const bannerText = figlet.textSync("Task Master AI", {
    font: "Standard",
    horizontalLayout: "default",
    verticalLayout: "default",
  });

  console.log(coolGradient(bannerText));

  // Add creator credit line below the banner
  console.log(
    chalk.dim("by ") + chalk.cyan.underline("https://x.com/eyaltoledano")
  );

  console.log(
    boxen(chalk.white(`${chalk.bold("Initializing")} your new project`), {
      padding: 1,
      margin: { top: 0, bottom: 1 },
      borderStyle: "round",
      borderColor: "cyan",
    })
  );
}

// Logging function with icons and colors
function log(level, ...args) {
  const icons = {
    debug: chalk.gray("🔍"),
    info: chalk.blue("ℹ️"),
    warn: chalk.yellow("⚠️"),
    error: chalk.red("❌"),
    success: chalk.green("✅"),
  };

  if (LOG_LEVELS[level] >= LOG_LEVEL) {
    const icon = icons[level] || "";

    // Only output to console if not in silent mode
    if (!isSilentMode()) {
      if (level === "error") {
        console.error(icon, chalk.red(...args));
      } else if (level === "warn") {
        console.warn(icon, chalk.yellow(...args));
      } else if (level === "success") {
        console.log(icon, chalk.green(...args));
      } else if (level === "info") {
        console.log(icon, chalk.blue(...args));
      } else {
        console.log(icon, ...args);
      }
    }
  }

  // Write to debug log if DEBUG=true
  if (process.env.DEBUG === "true") {
    const logMessage = `[${level.toUpperCase()}] ${args.join(" ")}\n`;
    fs.appendFileSync("init-debug.log", logMessage);
  }
}

// Function to create directory if it doesn't exist
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    log("info", `Created directory: ${dirPath}`);
  }
}

// Function to add shell aliases to the user's shell configuration
function addShellAliases() {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  let shellConfigFile;

  // Determine which shell config file to use
  if (process.env.SHELL?.includes("zsh")) {
    shellConfigFile = path.join(homeDir, ".zshrc");
  } else if (process.env.SHELL?.includes("bash")) {
    shellConfigFile = path.join(homeDir, ".bashrc");
  } else {
    log("warn", "Could not determine shell type. Aliases not added.");
    return false;
  }

  try {
    // Check if file exists
    if (!fs.existsSync(shellConfigFile)) {
      log(
        "warn",
        `Shell config file ${shellConfigFile} not found. Aliases not added.`
      );
      return false;
    }

    // Check if aliases already exist
    const configContent = fs.readFileSync(shellConfigFile, "utf8");
    if (configContent.includes("alias tm='task-master'")) {
      log("info", "Task Master aliases already exist in shell config.");
      return true;
    }

    // Add aliases to the shell config file
    const aliasBlock = `
# Task Master aliases added on ${new Date().toLocaleDateString()}
alias tm='task-master'
alias taskmaster='task-master'
`;

    fs.appendFileSync(shellConfigFile, aliasBlock);
    log("success", `Added Task Master aliases to ${shellConfigFile}`);
    log(
      "info",
      "To use the aliases in your current terminal, run: source " +
        shellConfigFile
    );

    return true;
  } catch (error) {
    log("error", `Failed to add aliases: ${error.message}`);
    return false;
  }
}

// Function to copy a file from the package to the target directory
function copyTemplateFile(templateName, targetPath, replacements = {}) {
  // Get the file content from the appropriate source directory
  let sourcePath;

  // Map template names to their actual source paths
  switch (templateName) {
    // case 'scripts_README.md':
    // 	sourcePath = path.join(__dirname, '..', 'assets', 'scripts_README.md');
    // 	break;
    case "dev_workflow.mdc":
      sourcePath = path.join(
        __dirname,
        "..",
        ".cursor",
        "rules",
        "dev_workflow.mdc"
      );
      break;
    case "taskmaster.mdc":
      sourcePath = path.join(
        __dirname,
        "..",
        ".cursor",
        "rules",
        "taskmaster.mdc"
      );
      break;
    case "cursor_rules.mdc":
      sourcePath = path.join(
        __dirname,
        "..",
        ".cursor",
        "rules",
        "cursor_rules.mdc"
      );
      break;
    case "self_improve.mdc":
      sourcePath = path.join(
        __dirname,
        "..",
        ".cursor",
        "rules",
        "self_improve.mdc"
      );
      break;
      // case 'README-task-master.md':
      // 	sourcePath = path.join(__dirname, '..', 'README-task-master.md');
      break;
    case "windsurfrules":
      sourcePath = path.join(__dirname, "..", "assets", ".windsurfrules");
      break;
    case ".roomodes":
      sourcePath = path.join(__dirname, "..", "assets", "roocode", ".roomodes");
      break;
    case "architect-rules":
    case "ask-rules":
    case "boomerang-rules":
    case "code-rules":
    case "debug-rules":
    case "test-rules":
      // Extract the mode name from the template name (e.g., 'architect' from 'architect-rules')
      const mode = templateName.split("-")[0];
      sourcePath = path.join(
        __dirname,
        "..",
        "assets",
        "roocode",
        ".roo",
        `rules-${mode}`,
        templateName
      );
      break;
    default:
      // For other files like env.example, gitignore, etc. that don't have direct equivalents
      sourcePath = path.join(__dirname, "..", "assets", templateName);
  }

  // Check if the source file exists
  if (!fs.existsSync(sourcePath)) {
    // Fall back to templates directory for files that might not have been moved yet
    sourcePath = path.join(__dirname, "..", "assets", templateName);
    if (!fs.existsSync(sourcePath)) {
      log("error", `Source file not found: ${sourcePath}`);
      return;
    }
  }

  let content = fs.readFileSync(sourcePath, "utf8");

  // Replace placeholders with actual values
  Object.entries(replacements).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    content = content.replace(regex, value);
  });

  // Handle special files that should be merged instead of overwritten
  if (fs.existsSync(targetPath)) {
    const filename = path.basename(targetPath);

    // Handle .gitignore - append lines that don't exist
    if (filename === ".gitignore") {
      log("info", `${targetPath} already exists, merging content...`);
      const existingContent = fs.readFileSync(targetPath, "utf8");
      const existingLines = new Set(
        existingContent.split("\n").map((line) => line.trim())
      );
      const newLines = content
        .split("\n")
        .filter((line) => !existingLines.has(line.trim()));

      if (newLines.length > 0) {
        // Add a comment to separate the original content from our additions
        const updatedContent =
          existingContent.trim() +
          "\n\n# Added by Claude Task Master\n" +
          newLines.join("\n");
        fs.writeFileSync(targetPath, updatedContent);
        log("success", `Updated ${targetPath} with additional entries`);
      } else {
        log("info", `No new content to add to ${targetPath}`);
      }
      return;
    }

    // Handle .windsurfrules - append the entire content
    if (filename === ".windsurfrules") {
      log(
        "info",
        `${targetPath} already exists, appending content instead of overwriting...`
      );
      const existingContent = fs.readFileSync(targetPath, "utf8");

      // Add a separator comment before appending our content
      const updatedContent =
        existingContent.trim() +
        "\n\n# Added by Task Master - Development Workflow Rules\n\n" +
        content;
      fs.writeFileSync(targetPath, updatedContent);
      log("success", `Updated ${targetPath} with additional rules`);
      return;
    }

    // Handle README.md - offer to preserve or create a different file
    if (filename === "README-task-master.md") {
      log("info", `${targetPath} already exists`);
      // Create a separate README file specifically for this project
      const taskMasterReadmePath = path.join(
        path.dirname(targetPath),
        "README-task-master.md"
      );
      fs.writeFileSync(taskMasterReadmePath, content);
      log(
        "success",
        `Created ${taskMasterReadmePath} (preserved original README-task-master.md)`
      );
      return;
    }

    // For other files, warn and prompt before overwriting
    log("warn", `${targetPath} already exists, skipping.`);
    return;
  }

  // If the file doesn't exist, create it normally
  fs.writeFileSync(targetPath, content);
  log("info", `Created file: ${targetPath}`);
}

// Main function to initialize a new project (No longer needs isInteractive logic)
async function initializeProject(options = {}) {
  // Receives options as argument
  // Only display banner if not in silent mode
  if (!isSilentMode()) {
    displayBanner();
  }

  const skipPrompts = options.yes || (options.name && options.description);

  if (skipPrompts) {
    if (!isSilentMode()) {
      console.log("SKIPPING PROMPTS - Using defaults or provided values");
    }

    // Use provided options or defaults
    const projectName = options.name || "task-master-project";
    const projectDescription =
      options.description || "A project managed with Task Master AI";
    const projectVersion = options.version || "0.1.0";
    const authorName = options.author || "Vibe coder";
    const dryRun = options.dryRun || false;
    const addAliases = options.aliases || false;

    if (dryRun) {
      log("info", "DRY RUN MODE: No files will be modified");
      log("info", "Would initialize Task Master project");
      log("info", "Would create/update necessary project files");
      if (addAliases) {
        log("info", "Would add shell aliases for task-master");
      }
      return {
        dryRun: true,
      };
    }

    // STEP 1: Create/find userId first (MCP/non-interactive mode)
    let userId = null;
    let gatewayRegistration = null;

    try {
      // Try to get existing userId from config if it exists
      const existingConfigPath = path.join(process.cwd(), ".taskmasterconfig");
      if (fs.existsSync(existingConfigPath)) {
        const existingConfig = JSON.parse(
          fs.readFileSync(existingConfigPath, "utf8")
        );
        userId = existingConfig.userId;

        if (userId) {
          if (!isSilentMode()) {
            console.log(
              chalk.green(`✅ Found existing user ID: ${chalk.dim(userId)}`)
            );
          }
        }
      }

      if (!userId) {
        // No existing userId - register with gateway to get proper userId
        if (!isSilentMode()) {
          console.log(
            chalk.blue("🔗 Connecting to TaskMaster Gateway to create user...")
          );
        }

        // Generate temporary email for user registration
        const tempEmail = `user_${Date.now()}@taskmaster.dev`;
        gatewayRegistration = await registerUserWithGateway(tempEmail);

        if (gatewayRegistration.success) {
          userId = gatewayRegistration.userId;
          if (!isSilentMode()) {
            console.log(
              chalk.green(
                `✅ Created new user ID from gateway: ${chalk.dim(userId)}`
              )
            );
          }
        } else {
          // Fallback to local generation if gateway is unavailable
          userId = `tm_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
          if (!isSilentMode()) {
            console.log(
              chalk.yellow(
                `⚠️ Gateway unavailable, using local user ID: ${chalk.dim(userId)}`
              )
            );
            console.log(
              chalk.dim(`Gateway error: ${gatewayRegistration.error}`)
            );
          }
        }
      }
    } catch (error) {
      // Fallback to local generation on any error
      userId = `tm_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      if (!isSilentMode()) {
        console.log(
          chalk.yellow(
            `⚠️ Error connecting to gateway, using local user ID: ${chalk.dim(userId)}`
          )
        );
        console.log(chalk.dim(`Error: ${error.message}`));
      }
    }

    // For non-interactive mode, default to BYOK mode with proper userId
    createProjectStructure(
      addAliases,
      dryRun,
      gatewayRegistration,
      "byok",
      null,
      userId
    );
  } else {
    // Interactive logic - NEW FLOW STARTS HERE
    log("info", "Setting up your Task Master project...");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      // STEP 1: Create/find userId first
      console.log(
        boxen(
          chalk.blue.bold("🚀 Welcome to Taskmaster AI") +
            "\n\n" +
            chalk.white("Setting up your project workspace..."),
          {
            padding: 1,
            margin: { top: 1, bottom: 1 },
            borderStyle: "round",
            borderColor: "blue",
          }
        )
      );

      // Generate or retrieve userId from gateway
      let userId = null;
      let gatewayRegistration = null;

      try {
        // Try to get existing userId from config if it exists
        const existingConfigPath = path.join(
          process.cwd(),
          ".taskmasterconfig"
        );
        if (fs.existsSync(existingConfigPath)) {
          const existingConfig = JSON.parse(
            fs.readFileSync(existingConfigPath, "utf8")
          );
          userId = existingConfig.userId;

          if (userId) {
            console.log(
              chalk.green(`✅ Found existing user ID: ${chalk.dim(userId)}`)
            );
          }
        }

        if (!userId) {
          // No existing userId - register with gateway to get proper userId
          console.log(
            chalk.blue("🔗 Connecting to TaskMaster Gateway to create user...")
          );

          // Generate temporary email for user registration
          const tempEmail = `user_${Date.now()}@taskmaster.dev`;
          gatewayRegistration = await registerUserWithGateway(tempEmail);

          if (gatewayRegistration.success) {
            userId = gatewayRegistration.userId;
            console.log(
              chalk.green(
                `✅ Created new user ID from gateway: ${chalk.dim(userId)}`
              )
            );
          } else {
            // Fallback to local generation if gateway is unavailable
            userId = `tm_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
            console.log(
              chalk.yellow(
                `⚠️ Gateway unavailable, using local user ID: ${chalk.dim(userId)}`
              )
            );
            console.log(
              chalk.dim(`Gateway error: ${gatewayRegistration.error}`)
            );
          }
        }
      } catch (error) {
        // Fallback to local generation on any error
        userId = `tm_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
        console.log(
          chalk.yellow(
            `⚠️ Error connecting to gateway, using local user ID: ${chalk.dim(userId)}`
          )
        );
        console.log(chalk.dim(`Error: ${error.message}`));
      }

      // STEP 2: Choose AI access method (MAIN DECISION)
      console.log(
        boxen(
          chalk.white.bold("Choose Your AI Access Method") +
            "\n\n" +
            chalk.cyan.bold("(1) BYOK - Bring Your Own API Keys") +
            "\n" +
            chalk.white(
              "    → You manage API keys & billing with AI providers"
            ) +
            "\n" +
            chalk.white("    → Pay provider directly based on token usage") +
            "\n" +
            chalk.white(
              "    → Requires setup with each provider individually"
            ) +
            "\n\n" +
            chalk.green.bold("(2) Hosted API Gateway") +
            " " +
            chalk.yellow.bold("(Recommended)") +
            "\n" +
            chalk.white("    → Use any model, zero API keys needed") +
            "\n" +
            chalk.white("    → Flat, credit-based pricing with no surprises") +
            "\n" +
            chalk.white("    → Support the development of Taskmaster"),
          {
            padding: 1,
            margin: { top: 1, bottom: 1 },
            borderStyle: "round",
            borderColor: "cyan",
            title: "🎯 AI Access Setup",
            titleAlignment: "center",
          }
        )
      );

      const accessMethodInput = await promptQuestion(
        rl,
        chalk.cyan.bold("Your choice (1 or 2): ")
      );

      const selectedMode = accessMethodInput.trim() === "1" ? "byok" : "hosted";
      let selectedPlan = null;

      if (selectedMode === "hosted") {
        // STEP 3: Hosted Mode - Show plan selection
        console.log(
          boxen(
            chalk.green.bold("🎯 Hosted API Gateway Selected") +
              "\n\n" +
              chalk.white("Choose your monthly AI credit plan:"),
            {
              padding: 1,
              margin: { top: 1, bottom: 0 },
              borderStyle: "round",
              borderColor: "green",
            }
          )
        );

        // Beautiful plan selection table
        console.log(
          boxen(
            chalk.cyan.bold("(1) Starter") +
              chalk.white("     - 50 credits   - ") +
              chalk.green.bold("$5/mo") +
              chalk.gray("   [$0.10 per credit]") +
              "\n" +
              chalk.cyan.bold("(2) Developer") +
              chalk.yellow.bold(" ⭐") +
              chalk.white(" - 120 credits  - ") +
              chalk.green.bold("$10/mo") +
              chalk.gray("  [$0.083 per credit – ") +
              chalk.yellow("popular") +
              chalk.gray("]") +
              "\n" +
              chalk.cyan.bold("(3) Pro") +
              chalk.white("        - 250 credits  - ") +
              chalk.green.bold("$20/mo") +
              chalk.gray("  [$0.08 per credit – ") +
              chalk.blue("great value") +
              chalk.gray("]") +
              "\n" +
              chalk.cyan.bold("(4) Team") +
              chalk.white("       - 550 credits  - ") +
              chalk.green.bold("$40/mo") +
              chalk.gray("  [$0.073 per credit – ") +
              chalk.magenta("best value") +
              chalk.gray("]") +
              "\n\n" +
              chalk.dim(
                "💡 Higher tiers offer progressively better value per credit"
              ),
            {
              padding: 1,
              margin: { top: 0, bottom: 1 },
              borderStyle: "single",
              borderColor: "gray",
            }
          )
        );

        const planInput = await promptQuestion(
          rl,
          chalk.cyan.bold("Your choice (1-4): ")
        );

        const planMapping = {
          1: { name: "starter", credits: 50, price: 5, perCredit: 0.1 },
          2: { name: "viber", credits: 120, price: 10, perCredit: 0.083 },
          3: { name: "pro", credits: 250, price: 20, perCredit: 0.08 },
          4: { name: "master", credits: 550, price: 40, perCredit: 0.073 },
        };

        selectedPlan = planMapping[planInput.trim()] || planMapping["2"]; // Default to Developer

        console.log(
          boxen(
            chalk.green.bold("✅ Plan Selected") +
              "\n\n" +
              chalk.white(`Plan: ${chalk.cyan.bold(selectedPlan.name)}`) +
              "\n" +
              chalk.white(
                `Credits: ${chalk.yellow.bold(selectedPlan.credits + "/month")}`
              ) +
              "\n" +
              chalk.white(
                `Price: ${chalk.green.bold("$" + selectedPlan.price + "/month")}`
              ) +
              "\n\n" +
              chalk.blue("🔄 Opening Stripe checkout...") +
              "\n" +
              chalk.gray("(This will open in your default browser)"),
            {
              padding: 1,
              margin: { top: 1, bottom: 1 },
              borderStyle: "round",
              borderColor: "green",
            }
          )
        );

        // Register user with gateway (existing functionality)
        console.log(chalk.blue("Registering with TaskMaster API gateway..."));

        // Check if we already registered during userId creation
        if (!gatewayRegistration) {
          // For now, we'll use a placeholder email. In production, this would integrate with Stripe
          const email = `${userId}@taskmaster.dev`; // Temporary placeholder
          gatewayRegistration = await registerUserWithGateway(email);
        } else {
          console.log(
            chalk.green("✅ Already registered during user ID creation")
          );
        }

        if (gatewayRegistration.success) {
          console.log(chalk.green(`✅ Successfully registered with gateway!`));
          console.log(chalk.dim(`User ID: ${gatewayRegistration.userId}`));

          // Ensure we're using the gateway's userId (in case it differs)
          userId = gatewayRegistration.userId;
        } else {
          console.log(
            chalk.yellow(
              `⚠️ Gateway registration failed: ${gatewayRegistration.error}`
            )
          );
          console.log(chalk.dim("Continuing with BYOK mode..."));
          selectedMode = "byok"; // Fallback to BYOK
        }
      } else {
        // BYOK Mode selected
        console.log(
          boxen(
            chalk.blue.bold("🔑 BYOK Mode Selected") +
              "\n\n" +
              chalk.white("You'll manage your own API keys and billing.") +
              "\n" +
              chalk.white("After setup, add your API keys to ") +
              chalk.cyan(".env") +
              chalk.white(" file."),
            {
              padding: 1,
              margin: { top: 1, bottom: 1 },
              borderStyle: "round",
              borderColor: "blue",
            }
          )
        );
      }

      // STEP 4: Continue with rest of setup (aliases, etc.)
      const addAliasesInput = await promptQuestion(
        rl,
        chalk.cyan(
          'Add shell aliases for task-master? This lets you type "tm" instead of "task-master" (Y/n): '
        )
      );
      const addAliasesPrompted = addAliasesInput.trim().toLowerCase() !== "n";

      // Confirm settings
      console.log(
        boxen(
          chalk.white.bold("📋 Project Configuration Summary") +
            "\n\n" +
            chalk.blue("User ID: ") +
            chalk.white(userId) +
            "\n" +
            chalk.blue("Access Mode: ") +
            chalk.white(
              selectedMode === "byok"
                ? "BYOK (Bring Your Own Keys)"
                : "Hosted API Gateway"
            ) +
            "\n" +
            (selectedPlan
              ? chalk.blue("Plan: ") +
                chalk.white(
                  `${selectedPlan.name} (${selectedPlan.credits} credits/month for $${selectedPlan.price})`
                ) +
                "\n"
              : "") +
            chalk.blue("Shell Aliases: ") +
            chalk.white(addAliasesPrompted ? "Yes" : "No"),
          {
            padding: 1,
            margin: { top: 1, bottom: 1 },
            borderStyle: "round",
            borderColor: "yellow",
          }
        )
      );

      const confirmInput = await promptQuestion(
        rl,
        chalk.yellow.bold("Continue with these settings? (Y/n): ")
      );
      const shouldContinue = confirmInput.trim().toLowerCase() !== "n";
      rl.close();

      if (!shouldContinue) {
        log("info", "Project initialization cancelled by user");
        process.exit(0);
        return;
      }

      const dryRun = options.dryRun || false;

      if (dryRun) {
        log("info", "DRY RUN MODE: No files will be modified");
        log("info", "Would initialize Task Master project");
        log("info", "Would create/update necessary project files");
        if (addAliasesPrompted) {
          log("info", "Would add shell aliases for task-master");
        }
        return {
          dryRun: true,
        };
      }

      // Create structure with all the new settings
      createProjectStructure(
        addAliasesPrompted,
        dryRun,
        gatewayRegistration,
        selectedMode,
        selectedPlan,
        userId
      );
    } catch (error) {
      rl.close();
      log("error", `Error during initialization process: ${error.message}`);
      process.exit(1);
    }
  }
}

// Helper function to promisify readline question
function promptQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Function to create the project structure
function createProjectStructure(
  addAliases,
  dryRun,
  gatewayRegistration,
  selectedMode = "byok",
  selectedPlan = null,
  userId = null
) {
  const targetDir = process.cwd();
  log("info", `Initializing project in ${targetDir}`);

  // Create directories
  ensureDirectoryExists(path.join(targetDir, ".cursor", "rules"));

  // Create Roo directories
  ensureDirectoryExists(path.join(targetDir, ".roo"));
  ensureDirectoryExists(path.join(targetDir, ".roo", "rules"));
  for (const mode of [
    "architect",
    "ask",
    "boomerang",
    "code",
    "debug",
    "test",
  ]) {
    ensureDirectoryExists(path.join(targetDir, ".roo", `rules-${mode}`));
  }

  ensureDirectoryExists(path.join(targetDir, "scripts"));
  ensureDirectoryExists(path.join(targetDir, "tasks"));

  // Setup MCP configuration for integration with Cursor
  setupMCPConfiguration(targetDir);

  // Copy template files with replacements
  const replacements = {
    year: new Date().getFullYear(),
  };

  // Copy .env.example
  copyTemplateFile(
    "env.example",
    path.join(targetDir, ".env.example"),
    replacements
  );

  // Copy .taskmasterconfig with project name, mode, and userId
  copyTemplateFile(
    ".taskmasterconfig",
    path.join(targetDir, ".taskmasterconfig"),
    {
      ...replacements,
    }
  );

  // Configure the .taskmasterconfig with the new settings
  configureTaskmasterConfig(
    targetDir,
    selectedMode,
    selectedPlan,
    userId,
    gatewayRegistration
  );

  // Copy .gitignore
  copyTemplateFile("gitignore", path.join(targetDir, ".gitignore"));

  // Copy dev_workflow.mdc
  copyTemplateFile(
    "dev_workflow.mdc",
    path.join(targetDir, ".cursor", "rules", "dev_workflow.mdc")
  );

  // Copy taskmaster.mdc
  copyTemplateFile(
    "taskmaster.mdc",
    path.join(targetDir, ".cursor", "rules", "taskmaster.mdc")
  );

  // Copy cursor_rules.mdc
  copyTemplateFile(
    "cursor_rules.mdc",
    path.join(targetDir, ".cursor", "rules", "cursor_rules.mdc")
  );

  // Copy self_improve.mdc
  copyTemplateFile(
    "self_improve.mdc",
    path.join(targetDir, ".cursor", "rules", "self_improve.mdc")
  );

  // Generate Roo rules from Cursor rules
  log("info", "Generating Roo rules from Cursor rules...");
  convertAllCursorRulesToRooRules(targetDir);

  // Copy .windsurfrules
  copyTemplateFile("windsurfrules", path.join(targetDir, ".windsurfrules"));

  // Copy .roomodes for Roo Code integration
  copyTemplateFile(".roomodes", path.join(targetDir, ".roomodes"));

  // Copy Roo rule files for each mode
  const rooModes = ["architect", "ask", "boomerang", "code", "debug", "test"];
  for (const mode of rooModes) {
    copyTemplateFile(
      `${mode}-rules`,
      path.join(targetDir, ".roo", `rules-${mode}`, `${mode}-rules`)
    );
  }

  // Copy example_prd.txt
  copyTemplateFile(
    "example_prd.txt",
    path.join(targetDir, "scripts", "example_prd.txt")
  );

  // Initialize git repository if git is available
  try {
    if (!fs.existsSync(path.join(targetDir, ".git"))) {
      log("info", "Initializing git repository...");
      execSync("git init", { stdio: "ignore" });
      log("success", "Git repository initialized");
    }
  } catch (error) {
    log("warn", "Git not available, skipping repository initialization");
  }

  // Run npm install automatically
  const npmInstallOptions = {
    cwd: targetDir,
    // Default to inherit for interactive CLI, change if silent
    stdio: "inherit",
  };

  if (isSilentMode()) {
    // If silent (MCP mode), suppress npm install output
    npmInstallOptions.stdio = "ignore";
    log("info", "Running npm install silently..."); // Log our own message
  } else {
    // Interactive mode, show the boxen message
    console.log(
      boxen(chalk.cyan("Installing dependencies..."), {
        padding: 0.5,
        margin: 0.5,
        borderStyle: "round",
        borderColor: "blue",
      })
    );
  }

  // === Add Model Configuration Step ===
  if (!isSilentMode() && !dryRun) {
    // Only run model setup for BYOK mode
    if (selectedMode === "byok") {
      console.log(
        boxen(chalk.cyan("Configuring AI Models..."), {
          padding: 0.5,
          margin: { top: 1, bottom: 0.5 },
          borderStyle: "round",
          borderColor: "blue",
        })
      );
      log(
        "info",
        "Running interactive model setup. Please select your preferred AI models."
      );
      try {
        execSync("npx task-master models --setup", {
          stdio: "inherit",
          cwd: targetDir,
        });
        log("success", "AI Models configured.");
      } catch (error) {
        log("error", "Failed to configure AI models:", error.message);
        log(
          "warn",
          'You may need to run "task-master models --setup" manually.'
        );
      }
    } else {
      console.log(
        boxen(
          chalk.green("✅ Hosted API Gateway Configured") +
            "\n\n" +
            chalk.white(
              "AI models are automatically available through the gateway."
            ) +
            "\n" +
            chalk.gray("No additional model configuration needed."),
          {
            padding: 1,
            margin: { top: 1, bottom: 0.5 },
            borderStyle: "round",
            borderColor: "green",
          }
        )
      );
    }
  } else if (isSilentMode() && !dryRun) {
    log("info", "Skipping interactive model setup in silent (MCP) mode.");
    if (selectedMode === "byok") {
      log(
        "warn",
        'Please configure AI models using "task-master models --set-..." or the "models" MCP tool.'
      );
    }
  } else if (dryRun) {
    log("info", "DRY RUN: Skipping interactive model setup.");
  }
  // ====================================

  // Display success message
  if (!isSilentMode()) {
    console.log(
      boxen(
        warmGradient.multiline(
          figlet.textSync("Success!", { font: "Standard" })
        ) +
          "\n" +
          chalk.green("Project initialized successfully!"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "double",
          borderColor: "green",
        }
      )
    );
  }

  // Display next steps based on mode
  displayNextSteps(selectedMode, selectedPlan);
}

// Function to configure the .taskmasterconfig file with mode, userId, and plan settings
function configureTaskmasterConfig(
  targetDir,
  selectedMode,
  selectedPlan,
  userId,
  gatewayRegistration
) {
  const configPath = path.join(targetDir, ".taskmasterconfig");

  try {
    // Read existing config or create default structure
    let config = {};
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, "utf8");
      config = JSON.parse(configContent);
    }

    // Set core configuration
    config.mode = selectedMode;
    if (userId) {
      // Ensure global object exists
      if (!config.global) {
        config.global = {};
      }
      config.global.userId = userId;
    }

    // Configure based on mode
    if (selectedMode === "hosted" && selectedPlan) {
      config.subscription = {
        plan: selectedPlan.name,
        credits: selectedPlan.credits,
        price: selectedPlan.price,
        pricePerCredit: selectedPlan.perCredit,
      };

      // Set telemetry configuration if gateway registration was successful
      if (gatewayRegistration?.success) {
        config.telemetry = {
          enabled: true,
          apiKey: gatewayRegistration.apiKey,
          userId: gatewayRegistration.userId,
          email: gatewayRegistration.email,
        };
        config.telemetryEnabled = true;
      }
    } else if (selectedMode === "byok") {
      // Ensure telemetry is disabled for BYOK mode by default
      config.telemetryEnabled = false;
    }

    // Write updated config
    fs.writeFileSync(configPath, JSON.stringify(config, null, "\t"));
    log("success", `Configured .taskmasterconfig with mode: ${selectedMode}`);

    // Also update MCP configuration if needed
    if (selectedMode === "hosted" && gatewayRegistration?.success) {
      updateMCPTelemetryConfig(targetDir, gatewayRegistration);
    }
  } catch (error) {
    log("error", `Failed to configure .taskmasterconfig: ${error.message}`);
  }
}

// Function to display next steps based on the selected mode
function displayNextSteps(selectedMode, selectedPlan) {
  if (isSilentMode()) return;

  if (selectedMode === "hosted") {
    // Hosted mode next steps
    console.log(
      boxen(
        chalk.cyan.bold("🚀 Your Hosted Gateway is Ready!") +
          "\n\n" +
          chalk.white("1. ") +
          chalk.yellow("Create your PRD using the example template:") +
          "\n" +
          chalk.white("   └─ ") +
          chalk.dim("Edit ") +
          chalk.cyan("scripts/example_prd.txt") +
          chalk.dim(" and save as ") +
          chalk.cyan("scripts/prd.txt") +
          "\n" +
          chalk.white("2. ") +
          chalk.yellow("Generate tasks from your PRD:") +
          "\n" +
          chalk.white("   └─ ") +
          chalk.dim("MCP Tool: ") +
          chalk.cyan("parse_prd") +
          chalk.dim(" | CLI: ") +
          chalk.cyan("task-master parse-prd scripts/prd.txt") +
          "\n" +
          chalk.white("3. ") +
          chalk.yellow("Analyze task complexity:") +
          "\n" +
          chalk.white("   └─ ") +
          chalk.dim("MCP Tool: ") +
          chalk.cyan("analyze_project_complexity") +
          chalk.dim(" | CLI: ") +
          chalk.cyan("task-master analyze-complexity --research") +
          "\n" +
          chalk.white("4. ") +
          chalk.yellow("Expand tasks into subtasks:") +
          "\n" +
          chalk.white("   └─ ") +
          chalk.dim("MCP Tool: ") +
          chalk.cyan("expand_all") +
          chalk.dim(" | CLI: ") +
          chalk.cyan("task-master expand --all --research") +
          "\n" +
          chalk.white("5. ") +
          chalk.yellow("Start building:") +
          "\n" +
          chalk.white("   └─ ") +
          chalk.dim("MCP Tool: ") +
          chalk.cyan("next_task") +
          chalk.dim(" | CLI: ") +
          chalk.cyan("task-master next") +
          "\n\n" +
          chalk.green.bold("💡 Pro Tip: ") +
          chalk.white("All AI models are ready to use - no API keys needed!") +
          "\n" +
          (selectedPlan
            ? chalk.blue(
                `📊 Your Plan: ${selectedPlan.name} (${selectedPlan.credits} credits/month)`
              )
            : ""),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "green",
          title: "🎯 Getting Started - Hosted Mode",
          titleAlignment: "center",
        }
      )
    );
  } else {
    // BYOK mode next steps
    console.log(
      boxen(
        chalk.cyan.bold("🔑 BYOK Mode Setup Complete!") +
          "\n\n" +
          chalk.white("1. ") +
          chalk.yellow("Add your API keys to the ") +
          chalk.cyan(".env") +
          chalk.yellow(" file:") +
          "\n" +
          chalk.white("   └─ ") +
          chalk.dim("Copy from ") +
          chalk.cyan(".env.example") +
          chalk.dim(" and add your keys") +
          "\n" +
          chalk.white("2. ") +
          chalk.yellow("Create your PRD using the example template:") +
          "\n" +
          chalk.white("   └─ ") +
          chalk.dim("Edit ") +
          chalk.cyan("scripts/example_prd.txt") +
          chalk.dim(" and save as ") +
          chalk.cyan("scripts/prd.txt") +
          "\n" +
          chalk.white("3. ") +
          chalk.yellow("Generate tasks from your PRD:") +
          "\n" +
          chalk.white("   └─ ") +
          chalk.dim("MCP Tool: ") +
          chalk.cyan("parse_prd") +
          chalk.dim(" | CLI: ") +
          chalk.cyan("task-master parse-prd scripts/prd.txt") +
          "\n" +
          chalk.white("4. ") +
          chalk.yellow("Analyze task complexity:") +
          "\n" +
          chalk.white("   └─ ") +
          chalk.dim("MCP Tool: ") +
          chalk.cyan("analyze_project_complexity") +
          chalk.dim(" | CLI: ") +
          chalk.cyan("task-master analyze-complexity --research") +
          "\n" +
          chalk.white("5. ") +
          chalk.yellow("Expand tasks into subtasks:") +
          "\n" +
          chalk.white("   └─ ") +
          chalk.dim("MCP Tool: ") +
          chalk.cyan("expand_all") +
          chalk.dim(" | CLI: ") +
          chalk.cyan("task-master expand --all --research") +
          "\n" +
          chalk.white("6. ") +
          chalk.yellow("Start building:") +
          "\n" +
          chalk.white("   └─ ") +
          chalk.dim("MCP Tool: ") +
          chalk.cyan("next_task") +
          chalk.dim(" | CLI: ") +
          chalk.cyan("task-master next") +
          "\n\n" +
          chalk.blue.bold("💡 Pro Tip: ") +
          chalk.white("Use ") +
          chalk.cyan("task-master models") +
          chalk.white(" to view/change AI models anytime") +
          "\n" +
          chalk.dim("* For MCP/Cursor: Add API keys to ") +
          chalk.cyan(".cursor/mcp.json") +
          chalk.dim(" instead"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "blue",
          title: "🎯 Getting Started - BYOK Mode",
          titleAlignment: "center",
        }
      )
    );
  }
}

// Function to configure telemetry settings in .taskmasterconfig and MCP config
function configureTelemetrySettings(targetDir, gatewayRegistration) {
  const configPath = path.join(targetDir, ".taskmasterconfig");

  try {
    // Read existing config
    const configContent = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(configContent);

    // Add telemetry configuration
    config.telemetry = {
      enabled: true,
      apiKey: gatewayRegistration.apiKey,
      userId: gatewayRegistration.userId,
      email: gatewayRegistration.email,
    };

    // Also ensure telemetryEnabled is explicitly set to true at root level
    config.telemetryEnabled = true;

    // Write updated config
    fs.writeFileSync(configPath, JSON.stringify(config, null, "\t"));
    log("success", "Configured telemetry settings in .taskmasterconfig");

    // Also update MCP configuration to include telemetry credentials
    updateMCPTelemetryConfig(targetDir, gatewayRegistration);
  } catch (error) {
    log("error", `Failed to configure telemetry settings: ${error.message}`);
  }
}

// Function to update MCP configuration with telemetry settings
function updateMCPTelemetryConfig(targetDir, gatewayRegistration) {
  const mcpConfigPath = path.join(targetDir, ".cursor", "mcp.json");

  try {
    let mcpConfig = {};
    if (fs.existsSync(mcpConfigPath)) {
      const mcpContent = fs.readFileSync(mcpConfigPath, "utf8");
      mcpConfig = JSON.parse(mcpContent);
    }

    // Add telemetry environment variables to MCP config
    if (!mcpConfig.env) {
      mcpConfig.env = {};
    }

    mcpConfig.env.TASKMASTER_TELEMETRY_API_KEY = gatewayRegistration.apiKey;
    mcpConfig.env.TASKMASTER_TELEMETRY_USER_EMAIL = gatewayRegistration.email;

    // Write updated MCP config
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    log("success", "Updated MCP configuration with telemetry settings");
  } catch (error) {
    log("error", `Failed to update MCP telemetry config: ${error.message}`);
  }
}

// Function to setup MCP configuration for Cursor integration
function setupMCPConfiguration(targetDir) {
  const mcpDirPath = path.join(targetDir, ".cursor");
  const mcpJsonPath = path.join(mcpDirPath, "mcp.json");

  log("info", "Setting up MCP configuration for Cursor integration...");

  // Create .cursor directory if it doesn't exist
  ensureDirectoryExists(mcpDirPath);

  // New MCP config to be added - references the installed package
  const newMCPServer = {
    "task-master-ai": {
      command: "npx",
      args: ["-y", "--package=task-master-ai", "task-master-ai"],
      env: {
        ANTHROPIC_API_KEY: "ANTHROPIC_API_KEY_HERE",
        PERPLEXITY_API_KEY: "PERPLEXITY_API_KEY_HERE",
        OPENAI_API_KEY: "OPENAI_API_KEY_HERE",
        GOOGLE_API_KEY: "GOOGLE_API_KEY_HERE",
        XAI_API_KEY: "XAI_API_KEY_HERE",
        OPENROUTER_API_KEY: "OPENROUTER_API_KEY_HERE",
        MISTRAL_API_KEY: "MISTRAL_API_KEY_HERE",
        AZURE_OPENAI_API_KEY: "AZURE_OPENAI_API_KEY_HERE",
        OLLAMA_API_KEY: "OLLAMA_API_KEY_HERE",
      },
    },
  };

  // Check if mcp.json already existsimage.png
  if (fs.existsSync(mcpJsonPath)) {
    log(
      "info",
      "MCP configuration file already exists, checking for existing task-master-mcp..."
    );
    try {
      // Read existing config
      const mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, "utf8"));

      // Initialize mcpServers if it doesn't exist
      if (!mcpConfig.mcpServers) {
        mcpConfig.mcpServers = {};
      }

      // Check if any existing server configuration already has task-master-mcp in its args
      const hasMCPString = Object.values(mcpConfig.mcpServers).some(
        (server) =>
          server.args &&
          server.args.some(
            (arg) => typeof arg === "string" && arg.includes("task-master-ai")
          )
      );

      if (hasMCPString) {
        log(
          "info",
          "Found existing task-master-ai MCP configuration in mcp.json, leaving untouched"
        );
        return; // Exit early, don't modify the existing configuration
      }

      // Add the task-master-ai server if it doesn't exist
      if (!mcpConfig.mcpServers["task-master-ai"]) {
        mcpConfig.mcpServers["task-master-ai"] = newMCPServer["task-master-ai"];
        log(
          "info",
          "Added task-master-ai server to existing MCP configuration"
        );
      } else {
        log("info", "task-master-ai server already configured in mcp.json");
      }

      // Write the updated configuration
      fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 4));
      log("success", "Updated MCP configuration file");
    } catch (error) {
      log("error", `Failed to update MCP configuration: ${error.message}`);
      // Create a backup before potentially modifying
      const backupPath = `${mcpJsonPath}.backup-${Date.now()}`;
      if (fs.existsSync(mcpJsonPath)) {
        fs.copyFileSync(mcpJsonPath, backupPath);
        log("info", `Created backup of existing mcp.json at ${backupPath}`);
      }

      // Create new configuration
      const newMCPConfig = {
        mcpServers: newMCPServer,
      };

      fs.writeFileSync(mcpJsonPath, JSON.stringify(newMCPConfig, null, 4));
      log(
        "warn",
        "Created new MCP configuration file (backup of original file was created if it existed)"
      );
    }
  } else {
    // If mcp.json doesn't exist, create it
    const newMCPConfig = {
      mcpServers: newMCPServer,
    };

    fs.writeFileSync(mcpJsonPath, JSON.stringify(newMCPConfig, null, 4));
    log("success", "Created MCP configuration file for Cursor integration");
  }

  // Add note to console about MCP integration
  log("info", "MCP server will use the installed task-master-ai package");
}

// Function to let user choose between BYOK and Hosted API Gateway
async function selectAccessMode() {
  console.log(
    boxen(
      chalk.cyan.bold("🚀 Choose Your AI Access Method") +
        "\n\n" +
        chalk.white("TaskMaster supports two ways to access AI models:") +
        "\n\n" +
        chalk.yellow.bold("(1) BYOK - Bring Your Own API Keys") +
        "\n" +
        chalk.white("    ✓ Use your existing provider accounts") +
        "\n" +
        chalk.white("    ✓ Pay providers directly") +
        "\n" +
        chalk.white("    ✓ Full control over billing & usage") +
        "\n" +
        chalk.dim("    → Best for: Teams with existing AI accounts") +
        "\n\n" +
        chalk.green.bold("(2) Hosted API Gateway") +
        chalk.yellow(" (Recommended)") +
        "\n" +
        chalk.white("    ✓ No API keys required") +
        "\n" +
        chalk.white("    ✓ Access all supported models instantly") +
        "\n" +
        chalk.white("    ✓ Simple credit-based billing") +
        "\n" +
        chalk.white("    ✓ Better rates through volume pricing") +
        "\n" +
        chalk.dim("    → Best for: Getting started quickly"),
      {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: "round",
        borderColor: "cyan",
        title: "🎯 AI Access Configuration",
        titleAlignment: "center",
      }
    )
  );

  let choice;
  while (true) {
    choice = await askQuestion(
      chalk.cyan("Your choice") +
        chalk.gray(" (1 for BYOK, 2 for Hosted)") +
        ": "
    );

    if (choice === "1" || choice.toLowerCase() === "byok") {
      console.log(
        boxen(
          chalk.blue.bold("🔑 BYOK Mode Selected") +
            "\n\n" +
            chalk.white("You'll configure your own AI provider API keys.") +
            "\n" +
            chalk.dim("The setup will guide you through model configuration."),
          {
            padding: 0.5,
            margin: { top: 0.5, bottom: 0.5 },
            borderStyle: "round",
            borderColor: "blue",
          }
        )
      );
      return "byok";
    } else if (choice === "2" || choice.toLowerCase() === "hosted") {
      console.log(
        boxen(
          chalk.green.bold("🎯 Hosted API Gateway Selected") +
            "\n\n" +
            chalk.white(
              "All AI models available instantly - no API keys needed!"
            ) +
            "\n" +
            chalk.dim("Let's set up your subscription plan..."),
          {
            padding: 0.5,
            margin: { top: 0.5, bottom: 0.5 },
            borderStyle: "round",
            borderColor: "green",
          }
        )
      );
      return "hosted";
    } else {
      console.log(chalk.red("Please enter 1 or 2"));
    }
  }
}

// Function to let user select a subscription plan
async function selectSubscriptionPlan() {
  console.log(
    boxen(
      chalk.cyan.bold("💳 Select Your Monthly AI Credit Pack") +
        "\n\n" +
        chalk.white("Choose the plan that fits your usage:") +
        "\n\n" +
        chalk.white("(1) ") +
        chalk.yellow.bold("50 credits") +
        chalk.white("   - ") +
        chalk.green("$5/mo") +
        chalk.gray("   [$0.10 per credit]") +
        "\n" +
        chalk.dim("    → Perfect for: Personal projects, light usage") +
        "\n\n" +
        chalk.white("(2) ") +
        chalk.yellow.bold("120 credits") +
        chalk.white("  - ") +
        chalk.green("$10/mo") +
        chalk.gray("  [$0.083 per credit]") +
        chalk.cyan.bold(" ← Popular") +
        "\n" +
        chalk.dim("    → Perfect for: Active development, small teams") +
        "\n\n" +
        chalk.white("(3) ") +
        chalk.yellow.bold("250 credits") +
        chalk.white("  - ") +
        chalk.green("$20/mo") +
        chalk.gray("  [$0.08 per credit]") +
        chalk.blue.bold(" ← Great Value") +
        "\n" +
        chalk.dim("    → Perfect for: Professional development, medium teams") +
        "\n\n" +
        chalk.white("(4) ") +
        chalk.yellow.bold("550 credits") +
        chalk.white("  - ") +
        chalk.green("$40/mo") +
        chalk.gray("  [$0.073 per credit]") +
        chalk.magenta.bold(" ← Best Value") +
        "\n" +
        chalk.dim("    → Perfect for: Heavy usage, large teams, enterprises") +
        "\n\n" +
        chalk.blue("💡 ") +
        chalk.white("Credits roll over month-to-month. Cancel anytime."),
      {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: "round",
        borderColor: "green",
        title: "💳 Subscription Plans",
        titleAlignment: "center",
      }
    )
  );

  const plans = [
    {
      name: "Starter",
      credits: 50,
      price: "$5/mo",
      perCredit: "$0.10",
      value: 1,
    },
    {
      name: "Popular",
      credits: 120,
      price: "$10/mo",
      perCredit: "$0.083",
      value: 2,
    },
    {
      name: "Pro",
      credits: 250,
      price: "$20/mo",
      perCredit: "$0.08",
      value: 3,
    },
    {
      name: "Enterprise",
      credits: 550,
      price: "$40/mo",
      perCredit: "$0.073",
      value: 4,
    },
  ];

  let choice;
  while (true) {
    choice = await askQuestion(
      chalk.cyan("Your choice") + chalk.gray(" (1-4)") + ": "
    );

    const planIndex = parseInt(choice) - 1;
    if (planIndex >= 0 && planIndex < plans.length) {
      const selectedPlan = plans[planIndex];

      console.log(
        boxen(
          chalk.green.bold(`✅ Selected: ${selectedPlan.name} Plan`) +
            "\n\n" +
            chalk.white(
              `${selectedPlan.credits} credits/month for ${selectedPlan.price}`
            ) +
            "\n" +
            chalk.gray(`(${selectedPlan.perCredit} per credit)`) +
            "\n\n" +
            chalk.yellow("🔄 Opening Stripe checkout...") +
            "\n" +
            chalk.dim("Complete your subscription setup in the browser."),
          {
            padding: 1,
            margin: { top: 0.5, bottom: 0.5 },
            borderStyle: "round",
            borderColor: "green",
          }
        )
      );

      // TODO: Integrate with actual Stripe checkout
      // For now, simulate the process
      console.log(chalk.yellow("\n⏳ Simulating Stripe checkout process..."));
      console.log(chalk.green("✅ Subscription setup complete! (Simulated)"));

      return selectedPlan;
    } else {
      console.log(chalk.red("Please enter a number from 1 to 4"));
    }
  }
}

// Function to create or retrieve user ID
async function getOrCreateUserId() {
  // Try to find existing userId first
  const existingConfig = path.join(process.cwd(), ".taskmasterconfig");
  if (fs.existsSync(existingConfig)) {
    try {
      const config = JSON.parse(fs.readFileSync(existingConfig, "utf8"));
      if (config.userId) {
        log("info", `Using existing user ID: ${config.userId}`);
        return config.userId;
      }
    } catch (error) {
      log("warn", "Could not read existing config, creating new user ID");
    }
  }

  // Generate new user ID
  const { v4: uuidv4 } = require("uuid");
  const newUserId = uuidv4();
  log("info", `Generated new user ID: ${newUserId}`);
  return newUserId;
}

// Ensure necessary functions are exported
export { initializeProject, log }; // Only export what's needed by commands.js
