/**
 * AI-Driven Git Branch Management Tests
 *
 * Tests for Task Group 2: AI-Driven Git Branch Management
 * - Test branch naming convention (impl/<spec-name>-1, impl/<spec-name>-2)
 * - Test detection of existing implementation branches
 * - Test "nothing to commit" handling via prompt
 * - Test branch parsing and validation
 */

import { describe, expect, it } from "bun:test";
import {
  generateBranchName,
  parseBranchName,
  isImplementationBranch,
  getNextBranchNumber,
  findSpecBranches,
  generateBranchSetupPrompt,
  generateCommitPrompt,
  generatePRCreationPrompt,
  generateBranchStateEvaluationPrompt,
} from "./ai-branch.js";

describe("AI-Driven Git Branch Management", () => {
  describe("Branch Naming Convention", () => {
    it("should generate branch name with attempt number 1", () => {
      const branchName = generateBranchName("2026-01-14-my-feature", 1);
      expect(branchName).toBe("impl/2026-01-14-my-feature-1");
    });

    it("should generate branch name with higher attempt numbers", () => {
      expect(generateBranchName("my-spec", 2)).toBe("impl/my-spec-2");
      expect(generateBranchName("my-spec", 3)).toBe("impl/my-spec-3");
      expect(generateBranchName("my-spec", 10)).toBe("impl/my-spec-10");
    });

    it("should default to attempt 1 if not specified", () => {
      const branchName = generateBranchName("test-spec");
      expect(branchName).toBe("impl/test-spec-1");
    });

    it("should throw error for empty spec name", () => {
      expect(() => generateBranchName("")).toThrow("Spec name is required");
    });

    it("should throw error for invalid attempt number", () => {
      expect(() => generateBranchName("test", 0)).toThrow("Attempt number must be >= 1");
      expect(() => generateBranchName("test", -1)).toThrow("Attempt number must be >= 1");
    });

    it("should handle spec names with special characters", () => {
      const branchName = generateBranchName("2026-01-14-build-test-git-workflow-improvements", 1);
      expect(branchName).toBe("impl/2026-01-14-build-test-git-workflow-improvements-1");
    });
  });

  describe("Branch Name Parsing", () => {
    it("should parse valid implementation branch names", () => {
      const result = parseBranchName("impl/my-spec-1");
      expect(result).toEqual({ specName: "my-spec", attempt: 1 });
    });

    it("should parse branch names with multiple dashes in spec name", () => {
      const result = parseBranchName("impl/2026-01-14-my-feature-2");
      expect(result).toEqual({ specName: "2026-01-14-my-feature", attempt: 2 });
    });

    it("should parse branch names with high attempt numbers", () => {
      const result = parseBranchName("impl/test-spec-42");
      expect(result).toEqual({ specName: "test-spec", attempt: 42 });
    });

    it("should return null for non-implementation branches", () => {
      expect(parseBranchName("main")).toBeNull();
      expect(parseBranchName("feature/my-feature")).toBeNull();
      expect(parseBranchName("impl/no-number")).toBeNull();
      expect(parseBranchName("")).toBeNull();
    });

    it("should return null for malformed implementation branches", () => {
      expect(parseBranchName("impl/")).toBeNull();
      expect(parseBranchName("impl/spec-")).toBeNull();
      expect(parseBranchName("impl/-1")).toBeNull();
    });
  });

  describe("Implementation Branch Detection", () => {
    it("should detect valid implementation branches", () => {
      expect(isImplementationBranch("impl/my-spec-1")).toBe(true);
      expect(isImplementationBranch("impl/2026-01-14-feature-3")).toBe(true);
    });

    it("should reject non-implementation branches", () => {
      expect(isImplementationBranch("main")).toBe(false);
      expect(isImplementationBranch("develop")).toBe(false);
      expect(isImplementationBranch("feature/something")).toBe(false);
      expect(isImplementationBranch("")).toBe(false);
    });
  });

  describe("Next Branch Number Calculation", () => {
    it("should return 1 when no existing branches", () => {
      const nextNum = getNextBranchNumber([], "my-spec");
      expect(nextNum).toBe(1);
    });

    it("should return 2 when one existing branch", () => {
      const branches = ["impl/my-spec-1"];
      const nextNum = getNextBranchNumber(branches, "my-spec");
      expect(nextNum).toBe(2);
    });

    it("should return correct next number with multiple branches", () => {
      const branches = ["impl/my-spec-1", "impl/my-spec-2", "impl/my-spec-3"];
      const nextNum = getNextBranchNumber(branches, "my-spec");
      expect(nextNum).toBe(4);
    });

    it("should handle gaps in branch numbers", () => {
      const branches = ["impl/my-spec-1", "impl/my-spec-5"];
      const nextNum = getNextBranchNumber(branches, "my-spec");
      expect(nextNum).toBe(6);
    });

    it("should only count branches for the specified spec", () => {
      const branches = [
        "impl/my-spec-1",
        "impl/my-spec-2",
        "impl/other-spec-1",
        "impl/other-spec-2",
        "impl/other-spec-3",
      ];
      expect(getNextBranchNumber(branches, "my-spec")).toBe(3);
      expect(getNextBranchNumber(branches, "other-spec")).toBe(4);
    });

    it("should ignore non-implementation branches", () => {
      const branches = [
        "main",
        "develop",
        "feature/something",
        "impl/my-spec-1",
      ];
      const nextNum = getNextBranchNumber(branches, "my-spec");
      expect(nextNum).toBe(2);
    });
  });

  describe("Find Spec Branches", () => {
    it("should find all branches for a spec", () => {
      const branches = [
        "main",
        "impl/my-spec-1",
        "impl/my-spec-2",
        "impl/other-spec-1",
      ];
      const result = findSpecBranches(branches, "my-spec");
      expect(result).toEqual(["impl/my-spec-1", "impl/my-spec-2"]);
    });

    it("should return empty array when no matching branches", () => {
      const branches = ["main", "develop", "impl/other-spec-1"];
      const result = findSpecBranches(branches, "my-spec");
      expect(result).toEqual([]);
    });
  });

  describe("AI Prompt Templates", () => {
    describe("Branch Setup Prompt", () => {
      it("should include spec folder in prompt", () => {
        const prompt = generateBranchSetupPrompt("2026-01-14-my-feature");
        expect(prompt).toContain("2026-01-14-my-feature");
        expect(prompt).toContain("impl/2026-01-14-my-feature-");
      });

      it("should include git commands in prompt", () => {
        const prompt = generateBranchSetupPrompt("test-spec");
        expect(prompt).toContain("git branch --show-current");
        expect(prompt).toContain("git branch --list");
        expect(prompt).toContain("git checkout");
      });

      it("should mention edge case handling", () => {
        const prompt = generateBranchSetupPrompt("test-spec");
        expect(prompt).toContain("already on");
        expect(prompt).toContain("Continue here, or create a new branch");
      });
    });

    describe("Commit Prompt", () => {
      it("should include message and prefix", () => {
        const prompt = generateCommitPrompt("update feature", "feat");
        expect(prompt).toContain("update feature");
        expect(prompt).toContain("feat");
      });

      it("should handle nothing to commit case", () => {
        const prompt = generateCommitPrompt("test commit", "chore");
        expect(prompt).toContain("Nothing to commit");
        expect(prompt).toContain("skipping");
        expect(prompt).toContain("git status --porcelain");
      });

      it("should use default prefix if not specified", () => {
        const prompt = generateCommitPrompt("test commit");
        expect(prompt).toContain("chore");
      });
    });

    describe("PR Creation Prompt", () => {
      it("should include spec folder and base branch", () => {
        const prompt = generatePRCreationPrompt("my-feature", "main");
        expect(prompt).toContain("my-feature");
        expect(prompt).toContain("--base main");
      });

      it("should include implementation log handling", () => {
        const prompt = generatePRCreationPrompt("test-spec");
        expect(prompt).toContain("implementation-log.txt");
        expect(prompt).toContain("git rm");
        expect(prompt).toContain("PR body");
      });

      it("should default to main as base branch", () => {
        const prompt = generatePRCreationPrompt("test-spec");
        expect(prompt).toContain("--base main");
      });
    });

    describe("Branch State Evaluation Prompt", () => {
      it("should check for spec files", () => {
        const prompt = generateBranchStateEvaluationPrompt("my-spec");
        expect(prompt).toContain("requirements.md");
        expect(prompt).toContain("spec.md");
        expect(prompt).toContain("tasks.md");
        expect(prompt).toContain("prompts/");
      });

      it("should evaluate commit history", () => {
        const prompt = generateBranchStateEvaluationPrompt("my-spec");
        expect(prompt).toContain("git log");
        expect(prompt).toContain("main..HEAD");
      });

      it("should report phase information", () => {
        const prompt = generateBranchStateEvaluationPrompt("my-spec");
        expect(prompt).toContain("Phase 1");
        expect(prompt).toContain("Phase 2");
        expect(prompt).toContain("Phase 3");
      });
    });
  });
});
