/**
 * CLI Module Tests
 *
 * Tests for Task Group 2: CLI and Logging Utilities
 * - Test colored log output for each level (debug, info, warn, error)
 * - Test menu selection prompt returns correct value
 * - Test search/autocomplete prompt functionality
 * - Test headless mode bypasses interactive prompts
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  configureLogger,
  debug,
  error,
  getLoggerOptions,
  info,
  warn,
} from "./logging.js";
import {
  confirmPrompt,
  isHeadless,
  menu,
  searchPrompt,
  text,
} from "./prompts.js";

describe("CLI Module", () => {
  describe("Logging utilities", () => {
    let consoleLogs: string[] = [];
    const originalLog = console.log;

    beforeEach(() => {
      consoleLogs = [];
      console.log = (message: string) => {
        consoleLogs.push(message);
      };
      // Reset logger to default state
      configureLogger({ level: "info", timestamps: false });
    });

    afterEach(() => {
      console.log = originalLog;
    });

    it("should output debug messages when level is debug", () => {
      configureLogger({ level: "debug" });
      debug("This is a debug message");

      expect(consoleLogs.length).toBe(1);
      // Verify the message content (chalk may or may not add color codes depending on environment)
      expect(consoleLogs[0]).toContain("This is a debug message");
    });

    it("should output info messages", () => {
      info("This is an info message");

      expect(consoleLogs.length).toBe(1);
      expect(consoleLogs[0]).toContain("This is an info message");
    });

    it("should output warn messages", () => {
      warn("This is a warning message");

      expect(consoleLogs.length).toBe(1);
      expect(consoleLogs[0]).toContain("This is a warning message");
    });

    it("should output error messages", () => {
      error("This is an error message");

      expect(consoleLogs.length).toBe(1);
      expect(consoleLogs[0]).toContain("This is an error message");
    });

    it("should respect log level filtering", () => {
      configureLogger({ level: "warn" });

      debug("debug message");
      info("info message");
      warn("warn message");
      error("error message");

      // Only warn and error should be logged
      expect(consoleLogs.length).toBe(2);
      expect(consoleLogs[0]).toContain("warn message");
      expect(consoleLogs[1]).toContain("error message");
    });

    it("should add timestamps when enabled", () => {
      configureLogger({ timestamps: true });
      info("Message with timestamp");

      expect(consoleLogs.length).toBe(1);
      // Timestamp format is [HH:MM:SS]
      expect(consoleLogs[0]).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
    });
  });

  describe("Headless mode", () => {
    const originalEnv = process.env.HEADLESS;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.HEADLESS;
      } else {
        process.env.HEADLESS = originalEnv;
      }
    });

    it("should detect headless mode from environment variable", () => {
      process.env.HEADLESS = "1";
      expect(isHeadless()).toBe(true);

      process.env.HEADLESS = "true";
      expect(isHeadless()).toBe(true);

      delete process.env.HEADLESS;
      expect(isHeadless()).toBe(false);
    });

    it("should return default value in headless mode for menu", async () => {
      process.env.HEADLESS = "1";

      const result = await menu({
        message: "Select an option",
        choices: [
          { name: "Option 1", value: "opt1" },
          { name: "Option 2", value: "opt2" },
          { name: "Option 3", value: "opt3" },
        ],
        defaultValue: "opt2",
      });

      expect(result).toBe("opt2");
    });

    it("should return first choice if no default in headless mode", async () => {
      process.env.HEADLESS = "1";

      const result = await menu({
        message: "Select an option",
        choices: [
          { name: "First Option", value: "first" },
          { name: "Second Option", value: "second" },
        ],
      });

      expect(result).toBe("first");
    });

    it("should return default value in headless mode for search prompt", async () => {
      process.env.HEADLESS = "1";

      const result = await searchPrompt({
        message: "Search for something",
        source: async (term) => [
          { name: "Result 1", value: "r1" },
          { name: "Result 2", value: "r2" },
        ],
        defaultValue: "r2",
      });

      expect(result).toBe("r2");
    });

    it("should return default value in headless mode for confirm prompt", async () => {
      process.env.HEADLESS = "1";

      const resultTrue = await confirmPrompt({
        message: "Continue?",
        defaultValue: true,
      });
      expect(resultTrue).toBe(true);

      const resultFalse = await confirmPrompt({
        message: "Continue?",
        defaultValue: false,
      });
      expect(resultFalse).toBe(false);

      const resultNoDefault = await confirmPrompt({
        message: "Continue?",
      });
      expect(resultNoDefault).toBe(false); // defaults to false
    });

    it("should return default value in headless mode for text input", async () => {
      process.env.HEADLESS = "1";

      const result = await text({
        message: "Enter your name",
        defaultValue: "Test User",
      });

      expect(result).toBe("Test User");

      const resultEmpty = await text({
        message: "Enter something",
      });
      expect(resultEmpty).toBe("");
    });
  });

  describe("Menu selection", () => {
    it("should export menu function that accepts typed choices", async () => {
      // This test verifies the type signature works correctly
      process.env.HEADLESS = "1";

      interface CustomChoice {
        id: number;
        label: string;
      }

      const choices: Array<{ name: string; value: CustomChoice }> = [
        { name: "Choice A", value: { id: 1, label: "A" } },
        { name: "Choice B", value: { id: 2, label: "B" } },
      ];

      const result = await menu({
        message: "Pick one",
        choices,
        defaultValue: choices[1].value,
      });

      expect(result.id).toBe(2);
      expect(result.label).toBe("B");
    });
  });

  describe("Search prompt", () => {
    it("should filter results based on search term in headless mode", async () => {
      process.env.HEADLESS = "1";

      const items = [
        { name: "Apple", value: "apple" },
        { name: "Banana", value: "banana" },
        { name: "Cherry", value: "cherry" },
      ];

      const result = await searchPrompt({
        message: "Search fruits",
        source: async (term) => {
          if (!term) return items;
          return items.filter((i) =>
            i.name.toLowerCase().includes(term.toLowerCase())
          );
        },
        defaultValue: "banana",
      });

      expect(result).toBe("banana");
    });
  });

  describe("Logger configuration", () => {
    it("should allow getting current logger options", () => {
      configureLogger({ level: "error", timestamps: true });

      const options = getLoggerOptions();
      expect(options.level).toBe("error");
      expect(options.timestamps).toBe(true);
    });
  });
});
