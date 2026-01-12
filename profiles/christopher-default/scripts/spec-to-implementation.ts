#!/usr/bin/env bun
/**
 * spec-to-implementation.ts
 *
 * One-shot script to take a shaped spec through to implementation with PR.
 *
 * Usage:
 *   ./spec-to-implementation <spec-folder-name>
 *   bun run spec-to-implementation.ts <spec-folder-name>
 *
 * Prerequisites:
 *   - Run /shape-spec first to create the spec folder with requirements
 *   - gh CLI installed and authenticated (gh auth login)
 *   - Bun runtime
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync } from "fs";
import { join, basename } from "path";

// Import from common library modules
import {
  section,
  info,
  warn,
  error as logError,
  success,
  dim,
  menu,
  confirmPrompt,
} from "../../../lib/cli/index.js";
import {
  selectRuntime,
  selectModel,
  getRuntime,
  type LLMRuntime,
  type PromptResult,
  type TokenUsage,
} from "../../../lib/llm/index.js";
import { GitWorkflow, type BranchConfig } from "../../../lib/git/index.js";

// === CONFIGURATION ===

interface TokenUsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalCostUsd: number;
  totalDurationMs: number;
  stepCount: number;
}

interface CliConfig {
  runtime: LLMRuntime;
  model: string | undefined;
  execMode: "automated" | "interactive";
}

// Global state
let specFolder: string;
let specPath: string;
let promptsDir: string;
let logFile: string;
let fullLog: string[] = [];

let tokenUsage: TokenUsageStats = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCacheReadTokens: 0,
  totalCacheCreationTokens: 0,
  totalCostUsd: 0,
  totalDurationMs: 0,
  stepCount: 0,
};

let cliConfig: CliConfig;
let gitWorkflow: GitWorkflow;

// === HELPER FUNCTIONS ===

function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function log(message: string): void {
  console.log(message);
  fullLog.push(message);
}

function logSection(title: string): void {
  section(title);
  fullLog.push("");
  fullLog.push("============================================");
  fullLog.push(`  ${title}`);
  fullLog.push("============================================");
  fullLog.push("");
}

async function saveLogToFile(): Promise<void> {
  if (!logFile) return;
  try {
    writeFileSync(logFile, fullLog.join("\n"), "utf-8");
  } catch (e) {
    console.error("Failed to save log file:", (e as Error).message);
  }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Find all markdown files in a directory
 */
function findMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  try {
    const files = readdirSync(dir);
    return files
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(dir, f))
      .sort();
  } catch {
    return [];
  }
}

// === PROGRESS DETECTION ===

async function detectCompletedSteps(): Promise<number> {
  let completedPhase = 0;

  if (existsSync(join(specPath, "spec.md"))) {
    completedPhase = 1;
  }
  if (existsSync(join(specPath, "tasks.md"))) {
    completedPhase = 2;
  }
  if (existsSync(promptsDir)) {
    const promptFiles = findMarkdownFiles(promptsDir);
    if (promptFiles.length > 0) {
      completedPhase = 3;
    }
  }

  return completedPhase + 1;
}

// === CLI EXECUTION ===

async function runCliWithTracking(
  phaseName: string,
  prompt: string
): Promise<void> {
  tokenUsage.stepCount++;
  const stepNum = tokenUsage.stepCount;

  log(`  Step ${stepNum}: ${phaseName}`);
  log("");

  const startTime = Date.now();

  try {
    const result = await cliConfig.runtime.runPrompt(prompt, {
      model: cliConfig.model,
      automated: cliConfig.execMode === "automated",
      streamOutput: true,
    });

    // Track token usage for Claude Code
    if (result.tokenUsage) {
      tokenUsage.totalInputTokens += result.tokenUsage.inputTokens;
      tokenUsage.totalOutputTokens += result.tokenUsage.outputTokens;
      tokenUsage.totalCacheReadTokens += result.tokenUsage.cacheReadTokens || 0;
      tokenUsage.totalCacheCreationTokens +=
        result.tokenUsage.cacheCreationTokens || 0;
    }
    if (result.costUsd) {
      tokenUsage.totalCostUsd += result.costUsd;
    }

    tokenUsage.totalDurationMs += result.durationMs;

    // Log to our log array
    fullLog.push(`--- ${phaseName} ---`);
    fullLog.push(result.output);
    fullLog.push(`Duration: ${formatDuration(result.durationMs)}`);
    fullLog.push("");

    log("");
    log(`  Duration: ${formatDuration(result.durationMs)}`);

    if (
      cliConfig.runtime.supportsTokenTracking &&
      tokenUsage.totalInputTokens > 0
    ) {
      log(
        `  Running total: ${formatCost(tokenUsage.totalCostUsd)} | ${formatNumber(
          tokenUsage.totalInputTokens + tokenUsage.totalOutputTokens
        )} tokens`
      );
    }

    log("");

    if (!result.success) {
      await handleCliError(result.exitCode, phaseName, result.output);
      process.exit(1);
    }
  } catch (err) {
    const error = err as Error;
    await handleCliError(1, phaseName, error.message);
    process.exit(1);
  }
}

async function handleCliError(
  exitCode: number,
  phaseName: string,
  errorOutput: string
): Promise<void> {
  log("");
  log("============================================");
  log("  ERROR: CLI Failed (exit code " + exitCode + ")");
  log("============================================");
  log("");
  log("Failed during: " + phaseName);
  log("");
  log("Error details:");
  log("--------------------------------------------");

  if (errorOutput) {
    try {
      const errorJson = JSON.parse(errorOutput);
      const errorMsg = errorJson?.error?.message;
      const errorType = errorJson?.error?.type;
      if (errorMsg) {
        log("  Type: " + errorType);
        log("  Message: " + errorMsg);
      } else {
        log(errorOutput);
      }
    } catch {
      log(errorOutput);
    }
  } else {
    log("  (No error output captured)");
  }

  log("--------------------------------------------");
  log("");

  // Check for uncommitted changes
  const changesResult = await gitWorkflow.checkUncommittedChanges();

  if (!changesResult.hasChanges) {
    log("No uncommitted changes to clean up.");
  } else {
    log("You have uncommitted changes from this step.");
    log("");
    log("Options:");
    log("  1) Discard uncommitted changes (recommended)");
    log("  2) Keep uncommitted changes");
    log("");

    const discardChanges = await confirmPrompt({
      message: "Discard uncommitted changes?",
      defaultValue: true,
    });

    if (discardChanges) {
      log("Discarding uncommitted changes...");
      await gitWorkflow.discardChanges();
      log("Changes discarded.");
    } else {
      log("Keeping uncommitted changes.");
    }
  }

  log("");
  log("You can resume later by running:");
  log(`  ./spec-to-implementation ${specFolder}`);

  await saveLogToFile();
}

// === SUMMARY DISPLAY ===

function displayFinalSummary(): void {
  logSection("TOKEN USAGE SUMMARY");

  const totalDurationSec = (tokenUsage.totalDurationMs / 1000).toFixed(1);

  if (!cliConfig.runtime.supportsTokenTracking) {
    log(`  Total steps:     ${tokenUsage.stepCount}`);
    log(`  Total duration:  ${totalDurationSec}s`);
    log("");
    log(
      `  (Detailed token usage not available with ${cliConfig.runtime.displayName})`
    );
  } else {
    const totalAllTokens =
      tokenUsage.totalInputTokens +
      tokenUsage.totalOutputTokens +
      tokenUsage.totalCacheReadTokens +
      tokenUsage.totalCacheCreationTokens;

    log(`  Total steps:     ${tokenUsage.stepCount}`);
    log(`  Input tokens:    ${formatNumber(tokenUsage.totalInputTokens)}`);
    log(`  Output tokens:   ${formatNumber(tokenUsage.totalOutputTokens)}`);
    if (tokenUsage.totalCacheReadTokens > 0) {
      log(`  Cache read:      ${formatNumber(tokenUsage.totalCacheReadTokens)}`);
    }
    if (tokenUsage.totalCacheCreationTokens > 0) {
      log(
        `  Cache created:   ${formatNumber(tokenUsage.totalCacheCreationTokens)}`
      );
    }
    log("  --------------------------");
    log(`  Total tokens:    ${formatNumber(totalAllTokens)}`);
    log(`  Total cost:      ${formatCost(tokenUsage.totalCostUsd)}`);
    log(`  Total duration:  ${totalDurationSec}s`);
  }

  log("");
  log("============================================");
}

// === PR CREATION ===

async function uploadLogsToPR(prNumber: number): Promise<void> {
  log("Uploading implementation logs to PR...");

  const logSummary = `## Implementation Logs

This PR was automatically generated by \`spec-to-implementation\`.

### Summary
- **Total Steps:** ${tokenUsage.stepCount}
- **Total Duration:** ${formatDuration(tokenUsage.totalDurationMs)}
- **Total Cost:** ${formatCost(tokenUsage.totalCostUsd)}
- **Total Tokens:** ${formatNumber(tokenUsage.totalInputTokens + tokenUsage.totalOutputTokens)}

### Full Log

<details>
<summary>Click to expand full implementation log</summary>

\`\`\`
${fullLog.join("\n")}
\`\`\`

</details>
`;

  try {
    await gitWorkflow.addPRComment(prNumber, logSummary);
    log("  Logs uploaded to PR as comment");
  } catch (err) {
    log(`  Failed to upload logs: ${(err as Error).message}`);
  }
}

// === MAIN SCRIPT ===

async function main(): Promise<void> {
  const specInput = process.argv[2] || "";

  if (!specInput) {
    console.log("Usage: ./spec-to-implementation <spec-folder-name>");
    console.log("");
    console.log("Example: ./spec-to-implementation 2026-01-08-my-feature");
    console.log(
      "     or: ./spec-to-implementation ./agent-os/specs/2026-01-08-my-feature"
    );
    console.log("");
    console.log("This script will:");
    console.log("  1. Create a safe implementation branch");
    console.log("  2. Run /write-spec to create the specification");
    console.log("  3. Run /create-tasks to break down into tasks");
    console.log("  4. Run /orchestrate-tasks to generate implementation prompts");
    console.log("  5. Execute each prompt to implement the feature");
    console.log("  6. Commit, push, and create a PR for review");
    console.log("  7. Upload implementation logs to the PR");
    process.exit(1);
  }

  // Handle both full paths and just folder names
  if (specInput.includes("agent-os/specs/")) {
    specFolder = specInput.replace(/.*agent-os\/specs\//, "").replace(/\/$/, "");
  } else {
    specFolder = specInput;
  }

  specPath = `agent-os/specs/${specFolder}`;
  promptsDir = `${specPath}/implementation/prompts`;
  logFile = `${specPath}/implementation/implementation-log.txt`;
  const branchName = `impl/${specFolder}`;

  // Initialize log
  fullLog.push(`Implementation Log: ${specFolder}`);
  fullLog.push(`Started: ${new Date().toISOString()}`);
  fullLog.push("");

  // === PRE-FLIGHT CHECKS ===

  if (!existsSync(specPath)) {
    logError(`Error: Spec folder not found at ${specPath}`);
    console.log("Run /shape-spec first to create it.");
    process.exit(1);
  }

  const requirementsPath = join(specPath, "planning", "requirements.md");
  if (!existsSync(requirementsPath)) {
    logError(`Error: requirements.md not found at ${requirementsPath}`);
    console.log("Run /shape-spec first to create requirements.");
    process.exit(1);
  }

  // Initialize GitWorkflow
  gitWorkflow = new GitWorkflow();

  // Check if gh CLI is available
  const ghAvailable = await gitWorkflow.isGhAvailable();
  if (!ghAvailable) {
    logError("Error: gh CLI not found or not authenticated.");
    console.log("Install: brew install gh && gh auth login");
    process.exit(1);
  }

  // Check for uncommitted changes
  const changesResult = await gitWorkflow.checkUncommittedChanges();
  let hasUncommittedChanges = changesResult.hasChanges;

  if (hasUncommittedChanges) {
    warn("Warning: You have uncommitted changes.");
    console.log("");
    console.log("If you proceed and create a new branch, these changes will be");
    console.log("moved to the new implementation branch.");
    console.log("");

    const continueAnyway = await confirmPrompt({
      message: "Continue anyway?",
      defaultValue: false,
    });

    if (!continueAnyway) {
      console.log("");
      console.log("Aborted. You can:");
      console.log(`  git stash push -m 'before ${specFolder} implementation'`);
      console.log("  git commit -am 'WIP'");
      process.exit(1);
    }
    console.log("");
  }

  // === DETECT PREVIOUS PROGRESS ===
  const startPhase = await detectCompletedSteps();

  if (startPhase > 1) {
    logSection("DETECTED PREVIOUS PROGRESS");
    if (startPhase > 1) log("\u2713 Phase 1: Specification written");
    if (startPhase > 2) log("\u2713 Phase 2: Tasks created");
    if (startPhase > 3) log("\u2713 Phase 3: Prompts generated");
    log("");
    log(`Will resume from Phase ${startPhase}`);
  }

  // === READY TO GO ===
  logSection(`SPEC TO IMPLEMENTATION: ${specFolder}`);

  // Select LLM runtime
  log("Select CLI tool:");
  const runtime = await selectRuntime();
  log(`Selected: ${runtime.displayName}`);
  log("");

  // Select model (for runtimes that support it)
  let selectedModel: string | undefined;
  log("Select model:");
  selectedModel = await selectModel(runtime, { includeDefault: true });
  if (selectedModel) {
    log(`Selected model: ${selectedModel}`);
  } else {
    log("Using CLI default model");
  }
  log("");

  // Select execution mode
  log("Execution mode:");
  const execMode = await menu<"automated" | "interactive">({
    message: "Choose execution mode:",
    choices: [
      {
        name: "Automated - runs without interaction (faster, less control)",
        value: "automated",
      },
      {
        name: "Interactive - you can watch and approve (slower, more control)",
        value: "interactive",
      },
    ],
    defaultValue: "automated",
  });

  cliConfig = {
    runtime,
    model: selectedModel,
    execMode,
  };

  log(`Using ${runtime.displayName} in ${execMode} mode.`);
  log("");

  // === BRANCH STRATEGY ===
  const currentBranch = await gitWorkflow.getCurrentBranch();
  log(`Current branch: ${currentBranch}`);
  log("");

  if (currentBranch === branchName) {
    log(`Already on implementation branch: ${branchName}`);
    log("Resuming previous run...");

    gitWorkflow.setConfig({
      useBranch: true,
      branchName,
      originalBranch: "main",
    });

    log("");
    log("To revert everything later:");
    log(`  git checkout main && git branch -D ${branchName}`);
    log("");
  } else {
    const { create } = await gitWorkflow.promptBranchCreation(branchName);

    if (create) {
      // Create branch from main (best practice)
      if (currentBranch !== "main") {
        warn(`Currently on '${currentBranch}', switching to 'main' first...`);
        if (hasUncommittedChanges) {
          dim("  (Your uncommitted changes will be brought to the new branch)");
        }
      }

      await gitWorkflow.createBranch({ name: branchName, from: "main" });
      log(`Created branch: ${branchName} (from main)`);

      log("");
      log("To revert everything later:");
      log(`  git checkout main && git branch -D ${branchName}`);
      log("");
    } else {
      log("");
      log(`Running on current branch: ${currentBranch}`);
      log("Warning: Changes will be made directly to this branch.");
      log("");
    }
  }

  // Ensure implementation directory exists
  ensureDir(`${specPath}/implementation`);

  // === Phase 1: Write Spec ===
  if (startPhase <= 1) {
    logSection("PHASE 1: Writing Specification");
    log("Running /write-spec...");
    log("");

    await runCliWithTracking(
      "PHASE 1: Write Spec",
      `Run /write-spec for ${specPath}. Complete it fully without stopping for intermediate confirmation messages. When the spec.md is written, you're done.`
    );

    await gitWorkflow.commitStep(
      `write specification for ${specFolder}`,
      "chore"
    );
  } else {
    logSection("PHASE 1: Writing Specification [SKIPPED]");
    log(`Specification already exists at ${specPath}/spec.md`);
  }

  // === Phase 2: Create Tasks ===
  if (startPhase <= 2) {
    logSection("PHASE 2: Creating Tasks");

    await runCliWithTracking(
      "PHASE 2: Create Tasks",
      `Run /create-tasks for ${specPath}. Complete it fully without stopping for intermediate confirmation messages. When tasks.md is written, you're done.`
    );

    await gitWorkflow.commitStep(`create tasks list for ${specFolder}`, "chore");
  } else {
    logSection("PHASE 2: Creating Tasks [SKIPPED]");
    log(`Tasks already exist at ${specPath}/tasks.md`);
  }

  // === Phase 3: Generate Prompts ===
  if (startPhase <= 3) {
    logSection("PHASE 3: Generating Prompts");

    await runCliWithTracking(
      "PHASE 3: Generate Prompts",
      `Run /orchestrate-tasks for ${specPath}. Generate the prompt files to implementation/prompts/. When the prompt files are created, you're done.`
    );

    await gitWorkflow.commitStep(
      `generate implementation prompts for ${specFolder}`,
      "chore"
    );
  } else {
    logSection("PHASE 3: Generating Prompts [SKIPPED]");
    log(`Prompts already exist at ${promptsDir}`);
  }

  // === Phase 4: Implement Each Task Group ===
  logSection("PHASE 4: Implementing Task Groups");

  const promptsDirExists = existsSync(promptsDir);
  const promptFiles = promptsDirExists
    ? findMarkdownFiles(promptsDir)
    : [];

  if (promptFiles.length === 0) {
    log(`Warning: No prompt files found in ${promptsDir}`);
    log("Skipping implementation phase.");
  } else {
    const executedPromptsFile = join(specPath, ".executed_prompts");

    if (!existsSync(executedPromptsFile)) {
      writeFileSync(executedPromptsFile, "");
    }

    const executedPrompts = readFileSync(executedPromptsFile, "utf-8")
      .split("\n")
      .filter(Boolean);

    const promptCount = promptFiles.length;
    let skipped = 0;

    for (let i = 0; i < promptFiles.length; i++) {
      const promptFile = promptFiles[i];
      const promptName = basename(promptFile);
      const current = i + 1;

      if (executedPrompts.includes(promptName)) {
        logSection(
          `PHASE 4.${current}: ${promptName} (${current} of ${promptCount}) [SKIPPED]`
        );
        log("Prompt already executed, skipping...");
        skipped++;
        continue;
      }

      logSection(
        `PHASE 4.${current}: ${promptName} (${current} of ${promptCount})`
      );

      await runCliWithTracking(
        `PHASE 4.${current}: ${promptName}`,
        `Execute the instructions in @${promptFile} fully. Mark completed tasks in ${specPath}/tasks.md when done.`
      );

      appendFileSync(executedPromptsFile, `${promptName}\n`);
      await gitWorkflow.commitStep(
        `implement ${promptName} for ${specFolder}`,
        "feat"
      );
    }

    if (skipped > 0) {
      log("");
      log(`Skipped ${skipped} already-executed prompt(s)`);
    }
  }

  // === Display Token Usage Summary ===
  displayFinalSummary();

  // === Save log file ===
  await saveLogToFile();
  log(`Implementation log saved to: ${logFile}`);

  // === Finalize and Create PR ===
  logSection("FINALIZING: Push and Create PR");

  // Commit log file and any remaining changes
  await gitWorkflow.commitStep(`finalize implementation for ${specFolder}`, "chore");

  const branchConfig = gitWorkflow.getConfig();
  let prUrl = "";
  let prNumber = 0;

  if (branchConfig.useBranch) {
    log("Pushing branch...");
    try {
      await gitWorkflow.push();
    } catch (e) {
      warn(`Warning: Push may have issues: ${(e as Error).message}`);
    }

    // Create PR
    try {
      const prBody = `## Summary

Automated implementation of \`${specFolder}\` spec.

## Spec Files
- Specification: \`${specPath}/spec.md\`
- Tasks: \`${specPath}/tasks.md\`

## Stats
- **Steps:** ${tokenUsage.stepCount}
- **Duration:** ${formatDuration(tokenUsage.totalDurationMs)}
- **Cost:** ${formatCost(tokenUsage.totalCostUsd)}
- **Tokens:** ${formatNumber(tokenUsage.totalInputTokens + tokenUsage.totalOutputTokens)}

## Review Checklist
- [ ] Code matches spec requirements
- [ ] Tests passing
- [ ] No unintended side effects
- [ ] Ready to merge`;

      const prResult = await gitWorkflow.createPR({
        title: `feat: ${specFolder}`,
        body: prBody,
        base: branchConfig.originalBranch,
      });

      prUrl = prResult.url;
      prNumber = prResult.number;

      if (prResult.alreadyExists) {
        log(`PR already exists: ${prUrl}`);
      } else {
        log(`PR created: ${prUrl}`);
      }
    } catch (e) {
      warn(`Warning: Failed to create PR: ${(e as Error).message}`);
    }

    // Upload logs to PR as a comment
    if (prNumber > 0) {
      await uploadLogsToPR(prNumber);
    }
  } else {
    log("Not using git branch, skipping push and PR creation.");
    log("");
    log(`Changes are on current branch: ${branchConfig.originalBranch}`);
    log("Push when ready: git push");
  }

  // === Done ===
  logSection("COMPLETE!");

  if (branchConfig.useBranch) {
    log(`Implementation branch: ${branchConfig.branchName}`);
    log(`Original branch: ${branchConfig.originalBranch}`);
    if (prUrl) {
      log("");
      log(`Review PR: ${prUrl}`);
    }
    log("");
    log("Commits created:");
    log("  - Each phase was committed with 'chore:' prefix");
    log("  - Each implementation was committed with 'feat:' prefix");
    log("");
    log("Next steps:");
    log("  - Review the PR in GitHub");
    log("  - If approved: merge the PR");
    log(
      `  - If rejected: git checkout ${branchConfig.originalBranch} && git branch -D ${branchConfig.branchName}`
    );
  } else {
    log(`Changes made to: ${branchConfig.originalBranch}`);
    log("");
    log("Next steps:");
    log("  - Review the changes: git log --oneline");
    log("  - Push when ready: git push");
  }

  log("");
  log("To resume this run later:");
  log(`  ./spec-to-implementation ${specFolder}`);

  // Final save
  await saveLogToFile();
}

// Run main
main().catch(async (error) => {
  console.error("Fatal error:", error);
  await saveLogToFile();
  process.exit(1);
});
