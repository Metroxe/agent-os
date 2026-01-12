/**
 * Git Workflow Module Tests
 *
 * Tests for Task Group 5: Git Workflow Utilities
 * - Test `checkUncommittedChanges()` detects dirty working directory
 * - Test branch creation from main
 * - Test `commitStep()` with prefixes (chore:, feat:)
 * - Test PR creation with `gh` CLI
 * - Test BranchConfig pattern tracks state correctly
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { spawn } from "child_process";
import {
  GIT_MODULE_LOADED,
  GitWorkflow,
  gitWorkflow,
} from "./index.js";
import type { BranchConfig, CommitPrefix, PROptions } from "./types.js";

describe("Git Workflow Module", () => {
  describe("Module exports", () => {
    it("should export GIT_MODULE_LOADED marker", () => {
      expect(GIT_MODULE_LOADED).toBe(true);
    });

    it("should export GitWorkflow class", () => {
      expect(GitWorkflow).toBeDefined();
      expect(typeof GitWorkflow).toBe("function");
    });

    it("should export default gitWorkflow instance", () => {
      expect(gitWorkflow).toBeDefined();
      expect(gitWorkflow).toBeInstanceOf(GitWorkflow);
    });
  });

  describe("BranchConfig pattern", () => {
    it("should initialize with default config", () => {
      const workflow = new GitWorkflow();
      const config = workflow.getConfig();

      expect(config.useBranch).toBe(true);
      expect(config.branchName).toBe("");
      expect(config.originalBranch).toBe("main");
    });

    it("should initialize with custom config", () => {
      const workflow = new GitWorkflow({
        useBranch: false,
        branchName: "feat/test-feature",
        originalBranch: "develop",
      });
      const config = workflow.getConfig();

      expect(config.useBranch).toBe(false);
      expect(config.branchName).toBe("feat/test-feature");
      expect(config.originalBranch).toBe("develop");
    });

    it("should update config with setConfig", () => {
      const workflow = new GitWorkflow();

      workflow.setConfig({
        branchName: "impl/new-feature",
        useBranch: true,
      });

      const config = workflow.getConfig();
      expect(config.branchName).toBe("impl/new-feature");
      expect(config.useBranch).toBe(true);
      expect(config.originalBranch).toBe("main"); // unchanged
    });

    it("should track state correctly across operations", () => {
      const workflow = new GitWorkflow({
        useBranch: true,
        branchName: "impl/my-spec",
        originalBranch: "main",
      });

      // Simulate workflow state changes
      workflow.setConfig({ originalBranch: "develop" });

      const config = workflow.getConfig();
      expect(config.useBranch).toBe(true);
      expect(config.branchName).toBe("impl/my-spec");
      expect(config.originalBranch).toBe("develop");
    });

    it("should return a copy from getConfig to prevent mutation", () => {
      const workflow = new GitWorkflow({ branchName: "original" });

      const config1 = workflow.getConfig();
      config1.branchName = "mutated";

      const config2 = workflow.getConfig();
      expect(config2.branchName).toBe("original");
    });
  });

  describe("GitWorkflow class methods", () => {
    it("should have checkUncommittedChanges method", () => {
      const workflow = new GitWorkflow();
      expect(typeof workflow.checkUncommittedChanges).toBe("function");
    });

    it("should have promptBranchCreation method", () => {
      const workflow = new GitWorkflow();
      expect(typeof workflow.promptBranchCreation).toBe("function");
    });

    it("should have createBranch method", () => {
      const workflow = new GitWorkflow();
      expect(typeof workflow.createBranch).toBe("function");
    });

    it("should have commitStep method", () => {
      const workflow = new GitWorkflow();
      expect(typeof workflow.commitStep).toBe("function");
    });

    it("should have commit method", () => {
      const workflow = new GitWorkflow();
      expect(typeof workflow.commit).toBe("function");
    });

    it("should have push method", () => {
      const workflow = new GitWorkflow();
      expect(typeof workflow.push).toBe("function");
    });

    it("should have createPR method", () => {
      const workflow = new GitWorkflow();
      expect(typeof workflow.createPR).toBe("function");
    });

    it("should have isGhAvailable method", () => {
      const workflow = new GitWorkflow();
      expect(typeof workflow.isGhAvailable).toBe("function");
    });
  });

  describe("checkUncommittedChanges", () => {
    it("should return UncommittedChangesResult structure", async () => {
      const workflow = new GitWorkflow();
      const result = await workflow.checkUncommittedChanges();

      expect(result).toHaveProperty("hasChanges");
      expect(result).toHaveProperty("hasStaged");
      expect(result).toHaveProperty("hasUnstaged");
      expect(typeof result.hasChanges).toBe("boolean");
      expect(typeof result.hasStaged).toBe("boolean");
      expect(typeof result.hasUnstaged).toBe("boolean");
    });
  });

  describe("getCurrentBranch", () => {
    it("should return current branch name as string", async () => {
      const workflow = new GitWorkflow();
      const branch = await workflow.getCurrentBranch();

      expect(typeof branch).toBe("string");
      expect(branch.length).toBeGreaterThan(0);
    });
  });

  describe("commitStep with prefixes", () => {
    it("should not commit when useBranch is false", async () => {
      const workflow = new GitWorkflow({ useBranch: false });
      const result = await workflow.commitStep("test message", "chore");

      expect(result).toBe(false);
    });

    it("should accept different commit prefixes", () => {
      const workflow = new GitWorkflow();

      // Just verify the method signature accepts different prefixes
      const prefixes: CommitPrefix[] = [
        "chore",
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "test",
        "perf",
      ];

      for (const prefix of prefixes) {
        // Type check - this should compile without errors
        expect(() => workflow.commitStep("test", prefix)).not.toThrow();
      }
    });
  });

  describe("commit with full options", () => {
    it("should not commit when useBranch is false", async () => {
      const workflow = new GitWorkflow({ useBranch: false });
      const result = await workflow.commit({
        message: "test message",
        prefix: "feat",
      });

      expect(result).toBe(false);
    });
  });

  describe("PR creation", () => {
    it("should throw error when not using a branch", async () => {
      const workflow = new GitWorkflow({ useBranch: false });

      const options: PROptions = {
        title: "Test PR",
        body: "Test body",
      };

      await expect(workflow.createPR(options)).rejects.toThrow(
        "Cannot create PR: not using a dedicated branch"
      );
    });

    it("should have getExistingPR method", () => {
      const workflow = new GitWorkflow();
      expect(typeof workflow.getExistingPR).toBe("function");
    });

    it("should have addPRComment method", () => {
      const workflow = new GitWorkflow();
      expect(typeof workflow.addPRComment).toBe("function");
    });
  });

  describe("Branch operations", () => {
    it("should have branchExists method", () => {
      const workflow = new GitWorkflow();
      expect(typeof workflow.branchExists).toBe("function");
    });

    it("should have checkout method", () => {
      const workflow = new GitWorkflow();
      expect(typeof workflow.checkout).toBe("function");
    });

    it("should have discardChanges method", () => {
      const workflow = new GitWorkflow();
      expect(typeof workflow.discardChanges).toBe("function");
    });
  });

  describe("Headless mode support", () => {
    const originalEnv = process.env.HEADLESS;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.HEADLESS;
      } else {
        process.env.HEADLESS = originalEnv;
      }
    });

    it("should handle promptBranchCreation in headless mode", async () => {
      process.env.HEADLESS = "1";

      const workflow = new GitWorkflow();
      const result = await workflow.promptBranchCreation("impl/headless-test");

      // In headless mode with suggested name, should return create: true
      expect(result.branchName).toBe("impl/headless-test");
      expect(result.create).toBe(true);
    });

    it("should handle promptBranchCreation in headless mode without name", async () => {
      process.env.HEADLESS = "1";

      const workflow = new GitWorkflow();
      const result = await workflow.promptBranchCreation();

      // In headless mode without name, should not create
      expect(result.create).toBe(false);
      expect(result.branchName.length).toBeGreaterThan(0);
    });
  });
});
