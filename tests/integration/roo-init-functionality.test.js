import { jest } from "@jest/globals";
import fs from "fs";
import path from "path";

describe("Roo Initialization Functionality", () => {
  let initJsContent;

  beforeAll(() => {
    // Read the init.js file content once for all tests
    const initJsPath = path.join(process.cwd(), "scripts", "init.js");
    initJsContent = fs.readFileSync(initJsPath, "utf8");
  });

  test("init.js creates Roo directories in createProjectStructure function", () => {
    // Check if createProjectStructure function exists
    expect(initJsContent).toContain("function createProjectStructure");

    // Check for the line that creates the .roo directory (flexible quote matching)
    const hasRooDir =
      /ensureDirectoryExists\(path\.join\(targetDir,\s*['""]\.roo['""]/.test(
        initJsContent
      );
    expect(hasRooDir).toBe(true);

    // Check for the line that creates .roo/rules directory (flexible quote matching)
    const hasRooRulesDir =
      /ensureDirectoryExists\(path\.join\(targetDir,\s*['""]\.roo['""],\s*['""]rules['""]/.test(
        initJsContent
      );
    expect(hasRooRulesDir).toBe(true);

    // Check for the for loop that creates mode-specific directories (flexible matching)
    const hasRooModeLoop =
      (initJsContent.includes("for (const mode of [") ||
        initJsContent.includes("for (const mode of[")) &&
      initJsContent.includes("architect") &&
      initJsContent.includes("ask") &&
      initJsContent.includes("boomerang") &&
      initJsContent.includes("code") &&
      initJsContent.includes("debug") &&
      initJsContent.includes("test");
    expect(hasRooModeLoop).toBe(true);
  });

  test("init.js copies Roo files from assets/roocode directory", () => {
    // Check for the .roomodes case in the copyTemplateFile function (flexible quote matching)
    const casesRoomodes = /case\s*['""]\.roomodes['""]/.test(initJsContent);
    expect(casesRoomodes).toBe(true);

    // Check that assets/roocode appears somewhere in the file (flexible quote matching)
    const hasRoocodePath = /['""]assets['""],\s*['""]roocode['""]/.test(
      initJsContent
    );
    expect(hasRoocodePath).toBe(true);

    // Check that roomodes file is copied (flexible quote matching)
    const copiesRoomodes = /copyTemplateFile\(\s*['""]\.roomodes['""]/.test(
      initJsContent
    );
    expect(copiesRoomodes).toBe(true);
  });

  test("init.js has code to copy rule files for each mode", () => {
    // Look for template copying for rule files (more flexible matching)
    const hasModeRulesCopying =
      initJsContent.includes("copyTemplateFile(") &&
      (initJsContent.includes("rules-") || initJsContent.includes("-rules"));
    expect(hasModeRulesCopying).toBe(true);
  });
});
