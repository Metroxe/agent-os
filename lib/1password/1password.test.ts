/**
 * 1Password Module Tests
 *
 * Tests for Task Group 3: 1Password CLI Wrapper
 * - Test `getItem()` returns parsed JSON for valid item
 * - Test optional vault parameter is included in command
 * - Test error handling when item not found
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { getItem, OnePasswordError } from "./index.js";

/**
 * Creates a ReadableStream from a string for mocking Bun.spawn stdout/stderr
 */
function createReadableStream(content: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(content));
      controller.close();
    },
  });
}

describe("1Password Module", () => {
  describe("getItem()", () => {
    let originalSpawn: typeof Bun.spawn;
    let mockExitCode: number;
    let mockStdout: string;
    let mockStderr: string;
    let capturedCommand: string[];

    beforeEach(() => {
      originalSpawn = Bun.spawn;
      mockExitCode = 0;
      mockStdout = "";
      mockStderr = "";
      capturedCommand = [];

      // @ts-ignore - mocking Bun.spawn for testing
      Bun.spawn = (command: string[], options?: any) => {
        // Capture the command for assertions
        capturedCommand = [...command];

        return {
          stdout: createReadableStream(mockStdout),
          stderr: createReadableStream(mockStderr),
          exited: Promise.resolve(mockExitCode),
        };
      };
    });

    afterEach(() => {
      Bun.spawn = originalSpawn;
    });

    it("should return parsed JSON for valid item", async () => {
      const mockItem = {
        id: "abc123",
        title: "Test Login",
        category: "LOGIN",
        fields: [
          {
            id: "username",
            type: "STRING",
            purpose: "USERNAME",
            label: "username",
            value: "testuser",
          },
          {
            id: "password",
            type: "CONCEALED",
            purpose: "PASSWORD",
            label: "password",
            value: "secret123",
          },
        ],
        urls: [
          {
            primary: true,
            href: "https://example.com",
          },
        ],
      };

      mockStdout = JSON.stringify(mockItem);
      mockExitCode = 0;

      const result = await getItem("Test Login");

      expect(result).toBeDefined();
      expect(result.id).toBe("abc123");
      expect(result.title).toBe("Test Login");
      expect(result.category).toBe("LOGIN");
      expect(result.fields).toHaveLength(2);
      expect(result.fields[0].value).toBe("testuser");
    });

    it("should include vault parameter in command when provided", async () => {
      const mockItem = {
        id: "xyz789",
        title: "Work API Key",
        category: "API_CREDENTIAL",
        fields: [],
      };

      mockStdout = JSON.stringify(mockItem);
      mockExitCode = 0;

      await getItem("Work API Key", { vault: "Work" });

      expect(capturedCommand).toContain("--vault");
      expect(capturedCommand).toContain("Work");
    });

    it("should not include vault parameter when not provided", async () => {
      const mockItem = {
        id: "def456",
        title: "Personal Item",
        category: "SECURE_NOTE",
        fields: [],
      };

      mockStdout = JSON.stringify(mockItem);
      mockExitCode = 0;

      await getItem("Personal Item");

      expect(capturedCommand).not.toContain("--vault");
    });

    it("should throw OnePasswordError when item not found", async () => {
      mockStdout = "";
      mockStderr = '[ERROR] 2024/01/01 12:00:00 "Nonexistent Item" isn\'t an item';
      mockExitCode = 1;

      await expect(getItem("Nonexistent Item")).rejects.toThrow(
        OnePasswordError
      );

      try {
        await getItem("Nonexistent Item");
      } catch (error) {
        expect(error).toBeInstanceOf(OnePasswordError);
        expect((error as OnePasswordError).message).toContain(
          "Nonexistent Item"
        );
        expect((error as OnePasswordError).code).toBe("ITEM_NOT_FOUND");
      }
    });

    it("should throw OnePasswordError with CLI error details on failure", async () => {
      mockStdout = "";
      mockStderr = "[ERROR] Some CLI error occurred";
      mockExitCode = 1;

      try {
        await getItem("Some Item");
        expect.unreachable("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(OnePasswordError);
        expect((error as OnePasswordError).stderr).toContain(
          "Some CLI error occurred"
        );
      }
    });

    it("should construct correct command structure", async () => {
      const mockItem = { id: "test", title: "Test", category: "LOGIN", fields: [] };
      mockStdout = JSON.stringify(mockItem);
      mockExitCode = 0;

      await getItem("My Item Name");

      expect(capturedCommand[0]).toBe("op");
      expect(capturedCommand[1]).toBe("item");
      expect(capturedCommand[2]).toBe("get");
      expect(capturedCommand[3]).toBe("My Item Name");
      expect(capturedCommand).toContain("--format");
      expect(capturedCommand).toContain("json");
    });
  });
});
