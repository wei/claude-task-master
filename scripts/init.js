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
import inquirer from "inquirer";
import open from "open";
import express from "express";
import { isSilentMode } from "./modules/utils.js";
import { convertAllCursorRulesToRooRules } from "./modules/rule-transformer.js";
import { execSync } from "child_process";
import {
  initializeUser,
  registerUserWithGateway,
  initializeBYOKUser,
  initializeHostedUser,
} from "./modules/user-management.js";
import { ensureConfigFileExists } from "./modules/config-manager.js";

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

    // NON-INTERACTIVE MODE - Try auth/init gracefully
    let userSetupResult = null;
    let isGatewayAvailable = false;

    // Ensure .taskmasterconfig exists before checking gateway availability
    ensureConfigFileExists(process.cwd());

    // Try to initialize user, but don't throw errors if it fails
    try {
      userSetupResult = await initializeUser(process.cwd());
      if (userSetupResult.success) {
        isGatewayAvailable = true;
        if (!isSilentMode()) {
          log("info", "Gateway connection successful");
        }
      } else {
        if (!isSilentMode()) {
          log("info", "Gateway not available, using BYOK mode");
        }
        isGatewayAvailable = false;
      }
    } catch (error) {
      // Silent failure - gateway not available
      if (!isSilentMode()) {
        log("info", "Gateway not available, using BYOK mode");
      }
      isGatewayAvailable = false;
      userSetupResult = null;
    }

    // Create project structure - always use BYOK for non-interactive mode
    // since we don't want to prompt for mode selection
    createProjectStructure(
      addAliases,
      dryRun,
      userSetupResult, // Pass the auth result (may be null)
      "byok", // Always use BYOK for non-interactive
      null,
      userSetupResult?.userId || null
    );
  } else {
    // Interactive logic - NEW FLOW STARTS HERE
    log("info", "Setting up your Task Master project...");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      // STEP 1: Welcome message
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

      // STEP 2: Try auth/init gracefully to detect gateway availability
      let userSetupResult = null;
      let isGatewayAvailable = false;

      // Ensure .taskmasterconfig exists before checking gateway availability
      ensureConfigFileExists(process.cwd());

      try {
        userSetupResult = await initializeUser(process.cwd());
        if (userSetupResult.success) {
          isGatewayAvailable = true;
          console.log(
            boxen(
              chalk.green("✅ Gateway Connection Successful") +
                "\n\n" +
                chalk.white("TaskMaster AI Gateway is available.") +
                "\n" +
                chalk.white("You can choose between BYOK or Hosted mode."),
              {
                padding: 1,
                margin: { top: 1, bottom: 1 },
                borderStyle: "round",
                borderColor: "green",
              }
            )
          );
        } else {
          // Silent failure - gateway not available
          isGatewayAvailable = false;
        }
      } catch (error) {
        // Silent failure - gateway not available
        isGatewayAvailable = false;
        userSetupResult = null;
      }

      // STEP 3: Choose AI access method (conditional based on gateway availability)
      let selectedMode = "byok"; // Default to BYOK
      let selectedPlan = null;

      if (isGatewayAvailable) {
        // Gateway is available, show both options
        const modeResponse = await inquirer.prompt([
          {
            type: "list",
            name: "accessMode",
            message: "Choose Your AI Access Method:",
            choices: [
              {
                name: "🔑 BYOK - Bring Your Own API Keys (You manage API keys & billing)",
                value: "byok",
              },
              {
                name: "🎯 Hosted API Gateway - All models, no keys needed (Recommended)",
                value: "hosted",
              },
            ],
            default: "hosted",
          },
        ]);
        selectedMode = modeResponse.accessMode;

        console.log(
          boxen(
            selectedMode === "byok"
              ? chalk.blue.bold("🔑 BYOK Mode Selected") +
                  "\n\n" +
                  chalk.white("You'll manage your own API keys and billing.") +
                  "\n" +
                  chalk.white("After setup, add your API keys to ") +
                  chalk.cyan(".env") +
                  chalk.white(" file.")
              : chalk.green.bold("🎯 Hosted API Gateway Selected") +
                  "\n\n" +
                  chalk.white(
                    "All AI models available instantly - no API keys needed!"
                  ) +
                  "\n" +
                  chalk.dim("Let's set up your subscription plan..."),
            {
              padding: 1,
              margin: { top: 1, bottom: 1 },
              borderStyle: "round",
              borderColor: selectedMode === "byok" ? "blue" : "green",
            }
          )
        );

        // If hosted mode selected, handle subscription plan
        if (selectedMode === "hosted") {
          selectedPlan = await handleHostedSubscription();
        }
      } else {
        // Gateway not available, silently proceed with BYOK mode
        // Show standard BYOK mode message without mentioning gateway failure
        console.log(
          boxen(
            chalk.blue.bold("🔑 BYOK Mode") +
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
        selectedMode = "byok";
      }

      // STEP 4: Continue with aliases
      const aliasResponse = await inquirer.prompt([
        {
          type: "confirm",
          name: "addAliases",
          message: "Add shell aliases (tm, taskmaster) for easier access?",
          default: true,
        },
      ]);

      const addAliases = aliasResponse.addAliases;
      const dryRun = options.dryRun || false;

      // STEP 5: Show overview and continue with project creation
      rl.close();
      createProjectStructure(
        addAliases,
        dryRun,
        userSetupResult,
        selectedMode,
        selectedPlan,
        userSetupResult?.userId || null
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

    // Ensure global section exists
    if (!config.global) {
      config.global = {};
    }

    // Ensure account section exists
    if (!config.account) {
      config.account = {};
    }

    // Store account-specific configuration
    config.account.mode = selectedMode;
    config.account.userId = userId || null;

    // Only set email if not already present (initializeUser may have already set it)
    if (!config.account.email) {
      config.account.email = gatewayRegistration?.email || "";
    }

    config.account.telemetryEnabled = selectedMode === "hosted";

    // Store remaining global config items
    config.global.logLevel = config.global.logLevel || "info";
    config.global.debug = config.global.debug || false;
    config.global.defaultSubtasks = config.global.defaultSubtasks || 5;
    config.global.defaultPriority = config.global.defaultPriority || "medium";
    config.global.projectName = config.global.projectName || "Taskmaster";
    config.global.ollamaBaseURL =
      config.global.ollamaBaseURL || "http://localhost:11434/api";
    config.global.azureBaseURL =
      config.global.azureBaseURL || "https://your-endpoint.azure.com/";

    // Write updated config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    log("info", `Updated .taskmasterconfig with mode: ${selectedMode}`);

    return config;
  } catch (error) {
    log("error", `Error configuring .taskmasterconfig: ${error.message}`);
    throw error;
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

// Function to handle hosted subscription with browser pattern
async function handleHostedSubscription() {
  const planResponse = await inquirer.prompt([
    {
      type: "list",
      name: "plan",
      message: "Select Your Monthly AI Credit Pack:",
      choices: [
        {
          name: "50 credits - $5/mo [$0.10 per credit] - Perfect for personal projects",
          value: { name: "Starter", credits: 50, price: "$5/mo", value: 1 },
        },
        {
          name: "120 credits - $10/mo [$0.083 per credit] - Popular choice",
          value: { name: "Popular", credits: 120, price: "$10/mo", value: 2 },
        },
        {
          name: "250 credits - $20/mo [$0.08 per credit] - Great value",
          value: { name: "Pro", credits: 250, price: "$20/mo", value: 3 },
        },
        {
          name: "550 credits - $40/mo [$0.073 per credit] - Best value",
          value: {
            name: "Enterprise",
            credits: 550,
            price: "$40/mo",
            value: 4,
          },
        },
      ],
      default: 1, // Popular plan
    },
  ]);

  const selectedPlan = planResponse.plan;

  console.log(
    boxen(
      chalk.green.bold(`✅ Selected: ${selectedPlan.name} Plan`) +
        "\n\n" +
        chalk.white(
          `${selectedPlan.credits} credits/month for ${selectedPlan.price}`
        ) +
        "\n\n" +
        chalk.yellow("🔄 Opening browser for Stripe checkout...") +
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

  // Stripe simulation with browser opening pattern (like Shopify CLI)
  await simulateStripeCheckout(selectedPlan);

  return selectedPlan;
}

// Stripe checkout simulation with browser pattern
async function simulateStripeCheckout(plan) {
  console.log(chalk.yellow("\n⏳ Starting Stripe checkout process..."));

  // Start a simple HTTP server to handle the callback
  const app = express();
  let server;
  let checkoutComplete = false;

  // For demo/testing, we'll use a simple success simulation
  const checkoutUrl = `https://example-stripe-simulation.com/checkout?plan=${plan.value}&return_url=http://localhost:3333/success`;

  app.get("/success", (req, res) => {
    checkoutComplete = true;
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #28a745;">✅ Subscription Complete!</h1>
          <p>Your ${plan.name} plan (${plan.credits} credits/month) is now active.</p>
          <p style="color: #666; margin-top: 30px;">You can close this window and return to your terminal.</p>
        </body>
      </html>
    `);
    setTimeout(() => {
      server.close();
    }, 1000);
  });

  // Start the callback server
  server = app.listen(3333, () => {
    console.log(chalk.blue("📡 Started local callback server on port 3333"));
  });

  // Prompt user before opening browser
  await inquirer.prompt([
    {
      type: "input",
      name: "ready",
      message: chalk.cyan(
        "Press Enter to open your browser for Stripe checkout..."
      ),
    },
  ]);

  // Open the browser (for demo, we'll simulate immediate success)
  console.log(chalk.blue("🌐 Opening browser..."));

  // For demo purposes, simulate immediate success instead of opening real browser
  // In real implementation: await open(checkoutUrl);
  console.log(chalk.gray(`Demo URL: ${checkoutUrl}`));

  // Simulate the checkout completion after 2 seconds
  setTimeout(() => {
    console.log(chalk.green("✅ Subscription setup complete! (Simulated)"));
    checkoutComplete = true;
    server.close();
  }, 2000);

  // Wait for checkout completion
  while (!checkoutComplete) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(chalk.green("🎉 Payment successful! Continuing setup..."));
}

// Ensure necessary functions are exported
export { initializeProject, log }; // Only export what's needed by commands.js
