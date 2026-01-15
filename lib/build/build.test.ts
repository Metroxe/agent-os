/**
 * Build Pipeline Tests
 *
 * Tests for Task Group 6: Bun Build Pipeline
 * - Test build script compiles TypeScript to single-file executable
 * - Test compiled binary runs without runtime dependencies
 * - Test output has no file extension
 * - Test that *.test.ts and *.spec.ts files are excluded from compilation
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync } from "fs";
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

describe("Build Script Test File Exclusion", () => {
  const testProfileDir = join(import.meta.dir, ".test-exclusion-profile");
  const testScriptsDir = join(testProfileDir, "scripts");
  const buildScriptPath = join(import.meta.dir, "../../scripts/build.sh");

  beforeAll(() => {
    // Create test profile directory structure
    if (!existsSync(testScriptsDir)) {
      mkdirSync(testScriptsDir, { recursive: true });
    }

    // Create a regular .ts file (should be compiled)
    const regularScript = `#!/usr/bin/env bun
console.log("regular script");
`;
    writeFileSync(join(testScriptsDir, "regular-script.ts"), regularScript, "utf-8");

    // Create a .test.ts file (should NOT be compiled)
    const testScript = `#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
describe("test", () => { it("works", () => expect(true).toBe(true)); });
`;
    writeFileSync(join(testScriptsDir, "example.test.ts"), testScript, "utf-8");

    // Create a .spec.ts file (should NOT be compiled)
    const specScript = `#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
describe("spec", () => { it("works", () => expect(true).toBe(true)); });
`;
    writeFileSync(join(testScriptsDir, "example.spec.ts"), specScript, "utf-8");
  });

  afterAll(() => {
    // Clean up test directory
    if (existsSync(testProfileDir)) {
      rmSync(testProfileDir, { recursive: true, force: true });
    }
  });

  it("should exclude *.test.ts files from compilation", async () => {
    // Run the build script in dry-run mode to see what would be built
    const proc = Bun.spawn(
      ["bash", buildScriptPath, "-d", "-v"],
      {
        stdout: "pipe",
        stderr: "pipe",
        cwd: testProfileDir,
        env: {
          ...process.env,
          // Override BASE_DIR for testing
        },
      }
    );

    await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    // The dry-run output should NOT contain .test.ts files
    expect(stdout.includes("example.test.ts")).toBe(false);
  });

  it("should exclude *.spec.ts files from compilation", async () => {
    // Run the build script in dry-run mode
    const proc = Bun.spawn(
      ["bash", buildScriptPath, "-d", "-v"],
      {
        stdout: "pipe",
        stderr: "pipe",
        cwd: testProfileDir,
      }
    );

    await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    // The dry-run output should NOT contain .spec.ts files
    expect(stdout.includes("example.spec.ts")).toBe(false);
  });

  it("should still compile regular .ts files", async () => {
    // Run the actual build on our test profile
    const proc = Bun.spawn(
      ["bash", buildScriptPath, "-v"],
      {
        stdout: "pipe",
        stderr: "pipe",
        cwd: join(import.meta.dir, "../.."),
        env: {
          ...process.env,
        },
      }
    );

    await proc.exited;

    // Check that the regular script binary was created in the actual profiles
    // This verifies the build still works for non-test files
    const christopherScriptsDir = join(import.meta.dir, "../../profiles/christopher-default/scripts");
    
    // The spec-to-implementation script should exist as a compiled binary
    const specToImplBinary = join(christopherScriptsDir, "spec-to-implementation");
    expect(existsSync(specToImplBinary)).toBe(true);
  });

  it("should NOT create binaries for test files in profiles", async () => {
    // Check that no binaries were created for test files
    const christopherScriptsDir = join(import.meta.dir, "../../profiles/christopher-default/scripts");
    
    // List all files in the scripts directory
    const files = readdirSync(christopherScriptsDir);
    
    // There should be no compiled binaries from .test.ts files
    // A binary from spec-to-implementation.test.ts would be named "spec-to-implementation.test"
    const testBinaries = files.filter(f => f.endsWith(".test") && !f.endsWith(".ts"));
    expect(testBinaries.length).toBe(0);
  });
});
