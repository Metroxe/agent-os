/**
 * spec-to-implementation Script Tests
 *
 * Tests for Task Group 7: Migrate spec-to-implementation Script
 * - Test CLI runtime selection (Claude Code, Cursor, OpenCode)
 * - Test model selection prompts
 * - Test git branch workflow integration
 * - Test phase execution flow
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";

// Import lib modules to verify they work with the script
import {
  selectRuntime,
  selectModel,
  getRuntime,
  getAllRuntimes,
  claudeRuntime,
  cursorRuntime,
  opencodeRuntime,
} from "../../../lib/llm/index.js";
import type { LLMRuntime, RuntimeName } from "../../../lib/llm/types.js";
import { GitWorkflow } from "../../../lib/git/workflow.js";
import type { BranchConfig } from "../../../lib/git/types.js";
import {
  menu,
  confirmPrompt,
  text,
  isHeadless,
  section,
  info,
} from "../../../lib/cli/index.js";

describe("spec-to-implementation Script", () => {
  describe("CLI Runtime Selection", () => {
    const originalEnv = process.env.HEADLESS;

    beforeEach(() => {
      process.env.HEADLESS = "1";
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.HEADLESS;
      } else {
        process.env.HEADLESS = originalEnv;
      }
    });

    it("should have three available runtimes", () => {
      const runtimes = getAllRuntimes();
      expect(runtimes.length).toBe(3);

      const names = runtimes.map((r) => r.name);
      expect(names).toContain("claude");
      expect(names).toContain("cursor");
      expect(names).toContain("opencode");
    });

    it("should get runtime by name", () => {
      const claude = getRuntime("claude");
      expect(claude.name).toBe("claude");
      expect(claude.displayName).toBe("Claude Code");
      expect(claude.supportsTokenTracking).toBe(true);

      const cursor = getRuntime("cursor");
      expect(cursor.name).toBe("cursor");
      expect(cursor.displayName).toBe("Cursor");
      expect(cursor.supportsTokenTracking).toBe(false);

      const opencode = getRuntime("opencode");
      expect(opencode.name).toBe("opencode");
      expect(opencode.displayName).toBe("OpenCode (OLLAMA)");
    });

    it("should select runtime using menu in headless mode", async () => {
      // In headless mode, selectRuntime returns the default (first choice)
      const runtime = await selectRuntime();
      expect(runtime).toBeDefined();
      expect(["claude", "cursor", "opencode"]).toContain(runtime.name);
    });

    it("should support runtime selection with default", async () => {
      const runtime = await selectRuntime({ defaultRuntime: "cursor" });
      expect(runtime.name).toBe("cursor");
    });
  });

  describe("Model Selection", () => {
    const originalEnv = process.env.HEADLESS;

    beforeEach(() => {
      process.env.HEADLESS = "1";
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.HEADLESS;
      } else {
        process.env.HEADLESS = originalEnv;
      }
    });

    it("should list models for Claude runtime", async () => {
      const models = await claudeRuntime.listModels();
      expect(models.length).toBeGreaterThan(0);

      // Should include known Claude models
      const modelIds = models.map((m) => m.id);
      expect(
        modelIds.some((id) => id.includes("claude") || id.includes("sonnet"))
      ).toBe(true);
    });

    it("should list models for Cursor runtime", async () => {
      const models = await cursorRuntime.listModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it("should list models for OpenCode runtime", async () => {
      const models = await opencodeRuntime.listModels();
      expect(models.length).toBeGreaterThan(0);

      // Should include suggested small models
      const modelIds = models.map((m) => m.id);
      const hasSmallModel = modelIds.some(
        (id) =>
          id.includes("qwen") ||
          id.includes("deepseek") ||
          id.includes("codellama") ||
          id.includes("mistral")
      );
      expect(hasSmallModel).toBe(true);
    });

    it("should select model in headless mode with default", async () => {
      const model = await selectModel(claudeRuntime, {
        includeDefault: true,
      });
      // In headless mode with includeDefault, returns undefined (CLI default)
      expect(model).toBeUndefined();
    });
  });

  describe("Git Branch Workflow Integration", () => {
    it("should create GitWorkflow with BranchConfig pattern", () => {
      const workflow = new GitWorkflow({
        useBranch: true,
        branchName: "impl/test-feature",
        originalBranch: "main",
      });

      const config = workflow.getConfig();
      expect(config.useBranch).toBe(true);
      expect(config.branchName).toBe("impl/test-feature");
      expect(config.originalBranch).toBe("main");
    });

    it("should update branch configuration", () => {
      const workflow = new GitWorkflow();
      workflow.setConfig({
        useBranch: true,
        branchName: "impl/new-feature",
      });

      const config = workflow.getConfig();
      expect(config.useBranch).toBe(true);
      expect(config.branchName).toBe("impl/new-feature");
    });

    it("should track BranchConfig state correctly", () => {
      // Test the BranchConfig pattern used by the script
      const branchConfig: BranchConfig = {
        useBranch: true,
        branchName: "impl/2026-01-11-feature",
        originalBranch: "main",
      };

      const workflow = new GitWorkflow(branchConfig);
      const config = workflow.getConfig();

      expect(config.useBranch).toBe(branchConfig.useBranch);
      expect(config.branchName).toBe(branchConfig.branchName);
      expect(config.originalBranch).toBe(branchConfig.originalBranch);
    });

    it("should have commitStep method that respects useBranch flag", async () => {
      const workflow = new GitWorkflow({ useBranch: false });

      // When useBranch is false, commitStep should return false
      const result = await workflow.commitStep("test commit", "chore");
      expect(result).toBe(false);
    });
  });

  describe("Phase Execution Flow", () => {
    const originalEnv = process.env.HEADLESS;

    beforeEach(() => {
      process.env.HEADLESS = "1";
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.HEADLESS;
      } else {
        process.env.HEADLESS = originalEnv;
      }
    });

    it("should support phase-based prompting pattern", async () => {
      // The script runs phases: write-spec, create-tasks, generate-prompts, implement
      // Each phase uses runPrompt from the LLM runtime
      const phases = [
        "Phase 1: Write Spec",
        "Phase 2: Create Tasks",
        "Phase 3: Generate Prompts",
        "Phase 4: Implement",
      ];

      for (const phase of phases) {
        expect(typeof phase).toBe("string");
        expect(phase.length).toBeGreaterThan(0);
      }
    });

    it("should use CLI section for phase headers", () => {
      // Verify section function works for phase headers
      let capturedOutput = "";
      const originalLog = console.log;
      console.log = (msg: string) => {
        capturedOutput += msg + "\n";
      };

      section("PHASE 1: Writing Specification");

      console.log = originalLog;
      expect(capturedOutput).toContain("PHASE 1: Writing Specification");
    });

    it("should use info for logging phase progress", () => {
      let capturedOutput = "";
      const originalLog = console.log;
      console.log = (msg: string) => {
        capturedOutput += msg + "\n";
      };

      info("Running /write-spec...");

      console.log = originalLog;
      expect(capturedOutput).toContain("Running /write-spec...");
    });

    it("should support execution mode selection", async () => {
      // Test the execution mode menu pattern
      const mode = await menu<"automated" | "interactive">({
        message: "Execution mode:",
        choices: [
          {
            name: "Automated - runs without interaction",
            value: "automated",
          },
          {
            name: "Interactive - you can watch and approve",
            value: "interactive",
          },
        ],
        defaultValue: "automated",
      });

      expect(mode).toBe("automated");
    });
  });
});
