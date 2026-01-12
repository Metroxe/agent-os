/**
 * Installation Tests
 *
 * Tests for Task Group 8: Update Install/Update Scripts
 * - Test install_utility_scripts() copies binaries (not source files)
 * - Test binaries land in $PROJECT_DIR/agent-os/scripts/
 * - Test profile inheritance works for compiled binaries
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { join } from "path";

describe("Installation Scripts", () => {
  const testDir = join(import.meta.dir, ".test-install");
  const baseDir = join(testDir, "agent-os");
  const projectDir = join(testDir, "project");

  // Create mock directory structure
  beforeAll(() => {
    // Clean up any existing test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    // Create base agent-os structure
    mkdirSync(join(baseDir, "profiles", "default", "scripts"), {
      recursive: true,
    });
    mkdirSync(join(baseDir, "profiles", "child-profile", "scripts"), {
      recursive: true,
    });
    mkdirSync(join(baseDir, "scripts"), { recursive: true });

    // Create project directory structure
    mkdirSync(join(projectDir, "agent-os", "scripts"), { recursive: true });

    // Create base config.yml
    writeFileSync(
      join(baseDir, "config.yml"),
      `version: 2.1.0
profile: default
claude_code_commands: true
`
    );

    // Create default profile config
    writeFileSync(
      join(baseDir, "profiles", "default", "profile-config.yml"),
      `inherits_from: false
`
    );

    // Create child profile config that inherits from default
    writeFileSync(
      join(baseDir, "profiles", "child-profile", "profile-config.yml"),
      `inherits_from: default
`
    );

    // Create a compiled binary in default profile (mock - just a text file with execute permission)
    const binaryPath = join(
      baseDir,
      "profiles",
      "default",
      "scripts",
      "test-binary"
    );
    writeFileSync(binaryPath, '#!/bin/bash\necho "I am a binary"');
    chmodSync(binaryPath, 0o755);

    // Create a .ts source file in default profile (should NOT be copied)
    writeFileSync(
      join(baseDir, "profiles", "default", "scripts", "test-binary.ts"),
      'console.log("TypeScript source");'
    );

    // Create a .test.ts file in default profile (should NOT be copied)
    writeFileSync(
      join(baseDir, "profiles", "default", "scripts", "test-binary.test.ts"),
      'import { test } from "bun:test";'
    );

    // Create a shell script that should be copied
    const shellScriptPath = join(
      baseDir,
      "profiles",
      "default",
      "scripts",
      "helper.sh"
    );
    writeFileSync(shellScriptPath, '#!/bin/bash\necho "shell script"');
    chmodSync(shellScriptPath, 0o755);

    // Create a binary only in child profile (for override testing)
    const childBinaryPath = join(
      baseDir,
      "profiles",
      "child-profile",
      "scripts",
      "child-only-binary"
    );
    writeFileSync(childBinaryPath, '#!/bin/bash\necho "child binary"');
    chmodSync(childBinaryPath, 0o755);

    // Copy common-functions.sh to test directory
    const commonFunctionsPath = join(import.meta.dir, "common-functions.sh");
    if (existsSync(commonFunctionsPath)) {
      const content = readFileSync(commonFunctionsPath, "utf-8");
      writeFileSync(join(baseDir, "scripts", "common-functions.sh"), content);
    }
  });

  afterAll(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("install_utility_scripts()", () => {
    it("should copy compiled binaries (files without extension, with execute permission)", async () => {
      // Run the install script function via bash
      const script = `
        set -e
        source "${join(baseDir, "scripts", "common-functions.sh")}"
        
        # Set required variables
        BASE_DIR="${baseDir}"
        PROJECT_DIR="${projectDir}"
        EFFECTIVE_PROFILE="default"
        DRY_RUN="false"
        VERBOSE="false"
        
        # Run the installation function
        install_utility_scripts
      `;

      const proc = Bun.spawn(["bash", "-c", script], {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, HOME: testDir },
      });

      await proc.exited;
      const stderr = await new Response(proc.stderr).text();

      // Check that binary was copied
      const binaryDest = join(projectDir, "agent-os", "scripts", "test-binary");
      expect(existsSync(binaryDest)).toBe(true);

      // Check that it's executable
      const stats = statSync(binaryDest);
      expect((stats.mode & 0o111) !== 0).toBe(true);
    });

    it("should NOT copy .ts source files (only binaries and shell scripts)", async () => {
      // The test-binary.ts and test-binary.test.ts should NOT be copied
      const tsSourceDest = join(
        projectDir,
        "agent-os",
        "scripts",
        "test-binary.ts"
      );
      const testFileDest = join(
        projectDir,
        "agent-os",
        "scripts",
        "test-binary.test.ts"
      );

      expect(existsSync(tsSourceDest)).toBe(false);
      expect(existsSync(testFileDest)).toBe(false);

      // But shell scripts should be copied
      const shellScriptDest = join(
        projectDir,
        "agent-os",
        "scripts",
        "helper.sh"
      );
      expect(existsSync(shellScriptDest)).toBe(true);
    });

    it("should place binaries in $PROJECT_DIR/agent-os/scripts/", async () => {
      // Verify the binary is in the correct location
      const binaryDest = join(projectDir, "agent-os", "scripts", "test-binary");
      expect(existsSync(binaryDest)).toBe(true);

      // Verify the content matches what we expected
      const content = readFileSync(binaryDest, "utf-8");
      expect(content).toContain("I am a binary");
    });
  });

  describe("Profile inheritance for binaries", () => {
    it("should copy binaries from parent profile when using child profile with inheritance", async () => {
      // Clean up project scripts first
      const scriptsDir = join(projectDir, "agent-os", "scripts");
      if (existsSync(scriptsDir)) {
        rmSync(scriptsDir, { recursive: true, force: true });
      }
      mkdirSync(scriptsDir, { recursive: true });

      // Run the install script function with child-profile
      const script = `
        set -e
        source "${join(baseDir, "scripts", "common-functions.sh")}"
        
        # Set required variables
        BASE_DIR="${baseDir}"
        PROJECT_DIR="${projectDir}"
        EFFECTIVE_PROFILE="child-profile"
        DRY_RUN="false"
        VERBOSE="false"
        
        # Run the installation function
        install_utility_scripts
      `;

      const proc = Bun.spawn(["bash", "-c", script], {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, HOME: testDir },
      });

      await proc.exited;

      // Child profile should have its own binary
      const childBinaryDest = join(
        projectDir,
        "agent-os",
        "scripts",
        "child-only-binary"
      );
      expect(existsSync(childBinaryDest)).toBe(true);

      // Should also inherit binaries from parent profile
      const parentBinaryDest = join(
        projectDir,
        "agent-os",
        "scripts",
        "test-binary"
      );
      expect(existsSync(parentBinaryDest)).toBe(true);

      // And shell scripts from parent
      const shellScriptDest = join(
        projectDir,
        "agent-os",
        "scripts",
        "helper.sh"
      );
      expect(existsSync(shellScriptDest)).toBe(true);
    });
  });
});
