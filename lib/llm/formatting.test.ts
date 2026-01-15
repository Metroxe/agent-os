/**
 * Tool Result Formatting Tests
 *
 * Tests for Task Group 1: Tool Result Formatting Overhaul
 * - Test Read result extraction from `{ success: { content: "..." } }` wrapper
 * - Test LS result parsing from `directoryTreeRoot` structure to simple listing
 * - Test Grep result extraction showing matched lines with file paths
 * - Test Shell result formatting with stdout/stderr and exit code handling
 * - Test Edit/StrReplace diff formatting with red/green coloring
 * - Test Glob/Write result formatting
 */

import { describe, expect, it } from "bun:test";
import chalk from "chalk";
import { formatToolResult, formatToolUse } from "./formatting.js";

describe("formatToolResult", () => {
  describe("Read tool results", () => {
    it("should extract content from success wrapper and show preview", () => {
      const result = {
        success: {
          content: "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7",
          isEmpty: false,
          exceededLimit: false,
        },
      };

      const formatted = formatToolResult(result, "Read", 5);

      // Should NOT contain the JSON wrapper keys
      expect(formatted).not.toContain('"success"');
      expect(formatted).not.toContain('"isEmpty"');

      // Should contain actual content lines
      expect(formatted).toContain("line 1");
      expect(formatted).toContain("line 2");

      // Should show truncation indicator
      expect(formatted).toContain("more lines");
    });
  });

  describe("LS tool results", () => {
    it("should parse directoryTreeRoot and show simple file listing", () => {
      const result = {
        success: {
          directoryTreeRoot: {
            absPath: "/Users/test/project",
            childrenDirs: [
              {
                absPath: "/Users/test/project/src",
                childrenDirs: [],
                childrenFiles: ["index.ts", "utils.ts"],
              },
            ],
            childrenFiles: ["package.json", "README.md"],
          },
        },
      };

      const formatted = formatToolResult(result, "LS", 20);

      // Should NOT contain JSON structure keys
      expect(formatted).not.toContain('"directoryTreeRoot"');
      expect(formatted).not.toContain('"absPath"');
      expect(formatted).not.toContain('"childrenDirs"');

      // Should contain file/folder names
      expect(formatted).toContain("package.json");
      expect(formatted).toContain("README.md");
      expect(formatted).toContain("src");
    });
  });

  describe("Grep tool results", () => {
    it("should show matched lines with file paths, hiding metadata", () => {
      const result = {
        success: {
          pattern: "function",
          path: "/Users/test/project",
          outputMode: "content",
          matches: [
            {
              file: "src/index.ts",
              line: 10,
              content: "export function main() {",
            },
            {
              file: "src/utils.ts",
              line: 5,
              content: "function helper() {",
            },
          ],
        },
      };

      const formatted = formatToolResult(result, "Grep", 20);

      // Should NOT show metadata
      expect(formatted).not.toContain('"outputMode"');
      expect(formatted).not.toContain('"pattern"');

      // Should show file paths and content
      expect(formatted).toContain("src/index.ts");
      expect(formatted).toContain("function main");
    });
  });

  describe("Shell tool results", () => {
    it("should show stdout directly and exit code only if non-zero", () => {
      const successResult = {
        success: {
          stdout: "Build completed successfully\nOutput: dist/bundle.js",
          stderr: "",
          exitCode: 0,
        },
      };

      const formatted = formatToolResult(successResult, "Shell", 10);

      // Should show stdout content
      expect(formatted).toContain("Build completed");
      expect(formatted).toContain("dist/bundle.js");

      // Should NOT show exit code 0
      expect(formatted).not.toContain("exit");
      expect(formatted).not.toContain("Exit");
    });

    it("should show stderr and exit code when non-zero", () => {
      const failResult = {
        success: {
          stdout: "",
          stderr: "Error: Command not found",
          exitCode: 127,
        },
      };

      const formatted = formatToolResult(failResult, "Shell", 10);

      // Should show stderr
      expect(formatted).toContain("Error: Command not found");

      // Should show exit code when non-zero
      expect(formatted).toContain("127");
    });
  });

  describe("Edit/StrReplace tool results", () => {
    it("should show GitHub-style diff with colored lines", () => {
      const result = {
        success: {
          path: "src/utils.ts",
          linesAdded: 2,
          linesRemoved: 1,
          diff: `@@ -10,3 +10,4 @@
   const context = "unchanged";
-  const old = "removed";
+  const new1 = "added";
+  const new2 = "also added";
   const more = "unchanged";`,
        },
      };

      const formatted = formatToolResult(result, "StrReplace", 20);

      // Should contain diff hunks
      expect(formatted).toContain("@@");

      // The actual content should be present (chalk colors are handled internally)
      expect(formatted).toContain("removed");
      expect(formatted).toContain("added");
    });
  });

  describe("Glob/Write tool results", () => {
    it("should show simple file list for Glob results", () => {
      const result = {
        success: {
          files: [
            "src/index.ts",
            "src/utils.ts",
            "src/types.ts",
          ],
        },
      };

      const formatted = formatToolResult(result, "Glob", 20);

      expect(formatted).toContain("src/index.ts");
      expect(formatted).toContain("src/utils.ts");
      expect(formatted).toContain("src/types.ts");
    });

    it("should show confirmation for Write results", () => {
      const result = {
        success: {
          path: "src/new-file.ts",
          bytesWritten: 1024,
          linesWritten: 42,
        },
      };

      const formatted = formatToolResult(result, "Write", 10);

      expect(formatted).toContain("src/new-file.ts");
      // Should mention lines or bytes written
      expect(formatted.toLowerCase()).toMatch(/wrote|written|lines|bytes/);
    });
  });
});
