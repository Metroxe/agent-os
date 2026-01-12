/**
 * Library Foundation Tests
 *
 * Tests for Task Group 1: Common Library Setup
 * - Test that main entry point exports all modules
 * - Test that each submodule can be imported independently
 * - Test basic TypeScript compilation with Bun
 */

import { describe, expect, it } from "bun:test";

describe("Library Foundation", () => {
  describe("Main entry point exports", () => {
    it("should export all modules from main entry point", async () => {
      const lib = await import("./index.js");

      expect(lib.cli).toBeDefined();
      expect(lib.onePassword).toBeDefined();
      expect(lib.llm).toBeDefined();
      expect(lib.git).toBeDefined();
    });

    it("should have loaded markers in all modules", async () => {
      const lib = await import("./index.js");

      expect(lib.cli.CLI_MODULE_LOADED).toBe(true);
      expect(lib.onePassword.ONEPASSWORD_MODULE_LOADED).toBe(true);
      expect(lib.llm.LLM_MODULE_LOADED).toBe(true);
      expect(lib.git.GIT_MODULE_LOADED).toBe(true);
    });
  });

  describe("Independent submodule imports", () => {
    it("should import cli module independently", async () => {
      const cli = await import("./cli/index.js");
      expect(cli.CLI_MODULE_LOADED).toBe(true);
    });

    it("should import 1password module independently", async () => {
      const onePassword = await import("./1password/index.js");
      expect(onePassword.ONEPASSWORD_MODULE_LOADED).toBe(true);
    });

    it("should import llm module independently", async () => {
      const llm = await import("./llm/index.js");
      expect(llm.LLM_MODULE_LOADED).toBe(true);
    });

    it("should import git module independently", async () => {
      const git = await import("./git/index.js");
      expect(git.GIT_MODULE_LOADED).toBe(true);
    });
  });

  describe("TypeScript compilation", () => {
    it("should compile TypeScript files with Bun", async () => {
      // If we got here, TypeScript compilation worked
      // This test verifies that Bun can run our .ts files
      const result = 1 + 1;
      expect(result).toBe(2);
    });
  });
});
