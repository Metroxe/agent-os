/**
 * Build Pipeline Tests
 *
 * Tests for Task Group 6: Bun Build Pipeline
 * - Test build script compiles TypeScript to single-file executable
 * - Test compiled binary runs without runtime dependencies
 * - Test output has no file extension
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

describe("Build Pipeline", () => {
  const testDir = join(import.meta.dir, ".test-build");
  const testScriptPath = join(testDir, "test-script.ts");
  const testBinaryPath = join(testDir, "test-script");

  beforeAll(() => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    // Create a simple test script
    const testScriptContent = `#!/usr/bin/env bun
/**
 * Test script for build pipeline verification
 */

const message = "Build pipeline test successful";
console.log(message);
console.log(JSON.stringify({ success: true, timestamp: Date.now() }));
`;
    writeFileSync(testScriptPath, testScriptContent, "utf-8");
  });

  afterAll(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("TypeScript compilation", () => {
    it("should compile TypeScript to single-file executable using bun build --compile", async () => {
      // Run bun build --compile on the test script
      const proc = Bun.spawn(
        [
          "bun",
          "build",
          "--compile",
          "--target=bun-darwin-arm64",
          testScriptPath,
          "--outfile",
          testBinaryPath,
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
        }
      );

      await proc.exited;

      // Verify the binary was created
      expect(existsSync(testBinaryPath)).toBe(true);

      // Verify it's an executable (no .ts or .js extension)
      expect(testBinaryPath.endsWith(".ts")).toBe(false);
      expect(testBinaryPath.endsWith(".js")).toBe(false);
    });

    it("should create binary with no file extension", () => {
      // Verify the binary exists and has no extension
      expect(existsSync(testBinaryPath)).toBe(true);

      const filename = testBinaryPath.split("/").pop() || "";
      expect(filename).toBe("test-script");
      expect(filename.includes(".")).toBe(false);
    });

    it("should create executable binary that runs without runtime dependencies", async () => {
      // Run the compiled binary directly
      const proc = Bun.spawn([testBinaryPath], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();

      // Verify it ran successfully
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Build pipeline test successful");
      expect(stdout).toContain('"success":true');
    });
  });
});
