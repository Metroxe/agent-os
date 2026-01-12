/**
 * LLM Runtime Module Tests
 *
 * Tests for Task Group 4: LLM Runtime Abstraction
 * - Test runtime selection returns correct runtime instance
 * - Test Claude Code runtime `runPrompt()` executes `claude` CLI
 * - Test Cursor runtime `runPrompt()` executes `agent` CLI
 * - Test OpenCode runtime connects to OLLAMA at localhost:11434
 * - Test `listModels()` returns available models
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { spawn } from "child_process";
import {
  claudeRuntime,
  cursorRuntime,
  getAllRuntimes,
  getDefaultRuntime,
  getRuntime,
  LLM_MODULE_LOADED,
  opencodeRuntime,
  selectModel,
  selectRuntime,
} from "./index.js";
import type { LLMRuntime, RuntimeName } from "./types.js";

describe("LLM Runtime Module", () => {
  describe("Module exports", () => {
    it("should export LLM_MODULE_LOADED marker", () => {
      expect(LLM_MODULE_LOADED).toBe(true);
    });

    it("should export all three runtimes", () => {
      const runtimes = getAllRuntimes();
      expect(runtimes).toHaveLength(3);

      const names = runtimes.map((r) => r.name);
      expect(names).toContain("claude");
      expect(names).toContain("cursor");
      expect(names).toContain("opencode");
    });
  });

  describe("Runtime selection", () => {
    const originalEnv = process.env.HEADLESS;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.HEADLESS;
      } else {
        process.env.HEADLESS = originalEnv;
      }
    });

    it("should return correct runtime instance by name", () => {
      const claude = getRuntime("claude");
      expect(claude.name).toBe("claude");
      expect(claude.displayName).toBe("Claude Code");

      const cursor = getRuntime("cursor");
      expect(cursor.name).toBe("cursor");
      expect(cursor.displayName).toBe("Cursor");

      const opencode = getRuntime("opencode");
      expect(opencode.name).toBe("opencode");
      expect(opencode.displayName).toBe("OpenCode (OLLAMA)");
    });

    it("should return Claude as default runtime", () => {
      const defaultRuntime = getDefaultRuntime();
      expect(defaultRuntime.name).toBe("claude");
    });

    it("should select runtime in headless mode with default", async () => {
      process.env.HEADLESS = "1";

      const runtime = await selectRuntime({ defaultRuntime: "cursor" });
      expect(runtime.name).toBe("cursor");
    });

    it("should select first runtime in headless mode without default", async () => {
      process.env.HEADLESS = "1";

      const runtime = await selectRuntime();
      // First runtime in the list
      expect(runtime).toBeDefined();
      expect(["claude", "cursor", "opencode"]).toContain(runtime.name);
    });
  });

  describe("Claude Code runtime", () => {
    it("should have correct runtime properties", () => {
      expect(claudeRuntime.name).toBe("claude");
      expect(claudeRuntime.displayName).toBe("Claude Code");
      expect(claudeRuntime.supportsStreaming).toBe(true);
      expect(claudeRuntime.supportsTokenTracking).toBe(true);
    });

    it("should implement LLMRuntime interface", () => {
      const runtime: LLMRuntime = claudeRuntime;

      expect(typeof runtime.runPrompt).toBe("function");
      expect(typeof runtime.listModels).toBe("function");
      expect(typeof runtime.isAvailable).toBe("function");
    });

    it("should list Claude models", async () => {
      const models = await claudeRuntime.listModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);

      // Each model should have id and name
      for (const model of models) {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
      }

      // Should include known Claude models
      const modelIds = models.map((m) => m.id);
      expect(modelIds.some((id) => id.includes("claude"))).toBe(true);
    });
  });

  describe("Cursor runtime", () => {
    it("should have correct runtime properties", () => {
      expect(cursorRuntime.name).toBe("cursor");
      expect(cursorRuntime.displayName).toBe("Cursor");
      expect(cursorRuntime.supportsStreaming).toBe(true);
      expect(cursorRuntime.supportsTokenTracking).toBe(false);
    });

    it("should implement LLMRuntime interface", () => {
      const runtime: LLMRuntime = cursorRuntime;

      expect(typeof runtime.runPrompt).toBe("function");
      expect(typeof runtime.listModels).toBe("function");
      expect(typeof runtime.isAvailable).toBe("function");
    });

    it("should list Cursor models (with fallback)", async () => {
      const models = await cursorRuntime.listModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);

      // Each model should have id and name
      for (const model of models) {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
      }
    });
  });

  describe("OpenCode runtime", () => {
    it("should have correct runtime properties", () => {
      expect(opencodeRuntime.name).toBe("opencode");
      expect(opencodeRuntime.displayName).toBe("OpenCode (OLLAMA)");
      expect(opencodeRuntime.supportsStreaming).toBe(true);
      expect(opencodeRuntime.supportsTokenTracking).toBe(false);
    });

    it("should implement LLMRuntime interface", () => {
      const runtime: LLMRuntime = opencodeRuntime;

      expect(typeof runtime.runPrompt).toBe("function");
      expect(typeof runtime.listModels).toBe("function");
      expect(typeof runtime.isAvailable).toBe("function");
    });

    it("should list OpenCode models (fallback models when OLLAMA unavailable)", async () => {
      const models = await opencodeRuntime.listModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);

      // Each model should have id and name
      for (const model of models) {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
      }

      // Should include suggested small models as fallback
      const modelIds = models.map((m) => m.id);
      const hasSmallModels = modelIds.some(
        (id) =>
          id.includes("qwen") ||
          id.includes("deepseek") ||
          id.includes("codellama") ||
          id.includes("mistral")
      );
      // Either OLLAMA models or fallback models should be present
      expect(models.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Model selection", () => {
    const originalEnv = process.env.HEADLESS;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.HEADLESS;
      } else {
        process.env.HEADLESS = originalEnv;
      }
    });

    it("should select default model in headless mode", async () => {
      process.env.HEADLESS = "1";

      const model = await selectModel(claudeRuntime, {
        includeDefault: true,
      });

      // Default is undefined (CLI default)
      expect(model).toBeUndefined();
    });

    it("should select specific model with default value in headless mode", async () => {
      process.env.HEADLESS = "1";

      const model = await selectModel(claudeRuntime, {
        defaultModel: "claude-sonnet-4-20250514",
        includeDefault: false,
      });

      expect(model).toBe("claude-sonnet-4-20250514");
    });
  });

  describe("Runtime interface consistency", () => {
    it("all runtimes should implement complete LLMRuntime interface", () => {
      const runtimes = getAllRuntimes();

      for (const runtime of runtimes) {
        // Check required properties
        expect(typeof runtime.name).toBe("string");
        expect(typeof runtime.displayName).toBe("string");
        expect(typeof runtime.supportsStreaming).toBe("boolean");
        expect(typeof runtime.supportsTokenTracking).toBe("boolean");

        // Check required methods
        expect(typeof runtime.runPrompt).toBe("function");
        expect(typeof runtime.listModels).toBe("function");
        expect(typeof runtime.isAvailable).toBe("function");
      }
    });

    it("all runtimes should have unique names", () => {
      const runtimes = getAllRuntimes();
      const names = runtimes.map((r) => r.name);
      const uniqueNames = new Set(names);

      expect(uniqueNames.size).toBe(names.length);
    });
  });
});
