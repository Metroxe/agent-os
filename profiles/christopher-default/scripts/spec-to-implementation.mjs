#!/usr/bin/env zx
/**
 * spec-to-implementation.mjs
 *
 * One-shot script to take a shaped spec through to implementation with PR.
 *
 * Usage:
 *   zx spec-to-implementation.mjs <spec-folder-name>
 *
 * Prerequisites:
 *   - Run /shape-spec first to create the spec folder with requirements
 *   - gh CLI installed and authenticated (gh auth login)
 *   - zx: npm install -g zx
 */

// zx automatically injects globals ($, fs, path, chalk, question, glob, etc.)
// No import needed when running with `zx` command

// Enable verbose mode for debugging if needed
$.verbose = false;

// === CONFIGURATION ===

// Global state
let specFolder;
let specPath;
let promptsDir;
let tokenUsage = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCacheReadTokens: 0,
  totalCacheCreationTokens: 0,
  totalCostUsd: 0,
  totalDurationMs: 0,
  stepCount: 0,
};
let cliConfig;
let branchConfig;

// === HELPER FUNCTIONS ===

/**
 * Format number with commas for display
 */
function formatNumber(num) {
  return num.toLocaleString("en-US");
}

/**
 * Format cost as USD
 */
function formatCost(cost) {
  return `$${cost.toFixed(4)}`;
}

/**
 * Format duration from ms to human readable
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Commit a step (only if useBranch is true)
 */
async function commitStep(prefix, message) {
  if (!branchConfig.useBranch) {
    return;
  }

  // Check if there are changes to commit
  try {
    await $`git diff-index --quiet HEAD --`;
    console.log("  (No changes to commit)");
    return;
  } catch {
    // There are changes to commit
  }

  console.log(`  Committing: ${prefix}: ${message}`);
  await $`git add -A`;
  await $`git commit -m ${`${prefix}: ${message}`} --no-verify`;
  console.log("");
}

/**
 * Handle CLI errors with recovery options
 */
async function handleCliError(exitCode, phaseName, errorOutput) {
  console.log("");
  console.log("============================================");
  console.log("  ERROR: CLI Failed (exit code " + exitCode + ")");
  console.log("============================================");
  console.log("");
  console.log("Failed during: " + phaseName);
  console.log("");

  console.log("Error details:");
  console.log("--------------------------------------------");

  if (errorOutput) {
    try {
      const errorJson = JSON.parse(errorOutput);
      const errorMsg = errorJson?.error?.message;
      const errorType = errorJson?.error?.type;

      if (errorMsg) {
        console.log("  Type: " + errorType);
        console.log("  Message: " + errorMsg);
      } else {
        console.log(errorOutput);
      }
    } catch {
      console.log(errorOutput);
    }
  } else {
    console.log(
      "  (No error output captured - CLI may have failed before producing output)"
    );
    console.log("");
    console.log("  Try running the CLI command manually to see the error:");
    console.log('  claude -p "your prompt here"');
  }

  console.log("--------------------------------------------");
  console.log("");

  // Check for uncommitted changes
  try {
    await $`git diff-index --quiet HEAD --`;
    console.log("No uncommitted changes to clean up.");
    console.log("");
    console.log("You can resume this implementation later by running:");
    console.log(`  ./spec-to-implementation.mjs ${specFolder}`);
    console.log("");
    console.log("The script will automatically retry this step.");
    return;
  } catch {
    // There are uncommitted changes
  }

  console.log("You have uncommitted changes from this step.");
  console.log("");
  console.log("Options:");
  console.log("  1) Discard uncommitted changes (recommended - clean retry)");
  console.log("  2) Keep uncommitted changes (may have partial work)");
  console.log("");

  const recoveryChoice = (await question("Choose option (1/2) [1]: ")) || "1";

  if (recoveryChoice === "1") {
    console.log("");
    console.log("Discarding uncommitted changes...");
    await $`git checkout -- .`;
    await $`git clean -fd`;
    console.log("Uncommitted changes discarded.");
  } else {
    console.log("");
    console.log("Keeping uncommitted changes.");
    console.log("Note: The partial changes may cause issues on retry.");
  }

  console.log("");
  console.log("You can resume this implementation later by running:");
  console.log(`  ./spec-to-implementation.mjs ${specFolder}`);
  console.log("");
  console.log("The script will automatically retry this step.");
}

/**
 * Detect which phases have been completed
 */
async function detectCompletedSteps() {
  let completedPhase = 0;

  // Phase 1: spec.md exists
  if (await fs.pathExists(path.join(specPath, "spec.md"))) {
    completedPhase = 1;
  }

  // Phase 2: tasks.md exists
  if (await fs.pathExists(path.join(specPath, "tasks.md"))) {
    completedPhase = 2;
  }

  // Phase 3: prompts directory exists and has files
  if (await fs.pathExists(promptsDir)) {
    const promptFiles = await glob(`${promptsDir}/*.md`);
    if (promptFiles.length > 0) {
      completedPhase = 3;
    }
  }

  // Return the next phase to start (completed + 1)
  return completedPhase + 1;
}

/**
 * Run CLI command with streaming output and token tracking
 */
async function runCliWithTracking(phaseName, prompt) {
  tokenUsage.stepCount++;

  // Save current stdio setting and set to inherit for real-time streaming
  const previousStdio = $.stdio;

  if (cliConfig.execMode === "automated") {
    console.log(`  Command: ${cliConfig.command} "<prompt>..."`);
    console.log("");

    try {
      // Use stdio: 'inherit' to stream output in real-time (like bash)
      $.stdio = "inherit";

      // Build the command based on CLI tool
      if (cliConfig.tool === "cursor") {
        const modelArgs = cliConfig.modelFlag
          ? cliConfig.modelFlag.split(" ")
          : [];
        await $`agent -p --force ${modelArgs} ${prompt}`;
      } else {
        const modelArgs = cliConfig.modelFlag
          ? cliConfig.modelFlag.split(" ")
          : [];
        await $`claude --dangerously-skip-permissions -p ${modelArgs} ${prompt}`;
      }
    } catch (error) {
      $.stdio = previousStdio;
      await handleCliError(error.exitCode || 1, phaseName, error.stderr || "");
      process.exit(1);
    }

    $.stdio = previousStdio;
    console.log("");
    console.log(
      "  (Token tracking requires --output-format json, skipped for real-time display)"
    );
    console.log("");
  } else {
    // Interactive mode - must use inherit for stdin/stdout/stderr
    try {
      $.stdio = "inherit";

      if (cliConfig.tool === "cursor") {
        const modelArgs = cliConfig.modelFlag
          ? cliConfig.modelFlag.split(" ")
          : [];
        await $`agent ${modelArgs} ${prompt}`;
      } else {
        const modelArgs = cliConfig.modelFlag
          ? cliConfig.modelFlag.split(" ")
          : [];
        await $`claude ${modelArgs} ${prompt}`;
      }
    } catch (error) {
      $.stdio = previousStdio;
      await handleCliError(error.exitCode || 1, phaseName, error.stderr || "");
      process.exit(1);
    }

    $.stdio = previousStdio;
    console.log("");
    console.log("  (Token tracking not available in interactive mode)");
    console.log("");
  }
}

/**
 * Display final usage summary
 */
function displayFinalSummary() {
  console.log("");
  console.log("============================================");
  console.log("  TOKEN USAGE SUMMARY");
  console.log("============================================");

  const totalDurationSec = (tokenUsage.totalDurationMs / 1000).toFixed(1);

  if (cliConfig.tool === "cursor") {
    console.log("");
    console.log(`  Total steps:     ${tokenUsage.stepCount}`);
    console.log(`  Total duration:  ${totalDurationSec}s`);
    console.log("");
    console.log("  (Detailed token usage not available with Cursor CLI)");
  } else {
    const totalAllTokens =
      tokenUsage.totalInputTokens +
      tokenUsage.totalOutputTokens +
      tokenUsage.totalCacheReadTokens +
      tokenUsage.totalCacheCreationTokens;

    console.log("");
    console.log(`  Total steps:     ${tokenUsage.stepCount}`);
    console.log(
      `  Input tokens:    ${formatNumber(tokenUsage.totalInputTokens)}`
    );
    console.log(
      `  Output tokens:   ${formatNumber(tokenUsage.totalOutputTokens)}`
    );
    if (tokenUsage.totalCacheReadTokens > 0) {
      console.log(
        `  Cache read:      ${formatNumber(tokenUsage.totalCacheReadTokens)}`
      );
    }
    if (tokenUsage.totalCacheCreationTokens > 0) {
      console.log(
        `  Cache created:   ${formatNumber(
          tokenUsage.totalCacheCreationTokens
        )}`
      );
    }
    console.log("  --------------------------");
    console.log(`  Total tokens:    ${formatNumber(totalAllTokens)}`);
    console.log(`  Total cost:      ${formatCost(tokenUsage.totalCostUsd)}`);
    console.log(`  Total duration:  ${totalDurationSec}s`);
  }

  console.log("");
  console.log("============================================");
}

// === MAIN SCRIPT ===

async function main() {
  // Parse arguments
  const specInput = process.argv[3] || "";

  if (!specInput) {
    console.log("Usage: ./spec-to-implementation.mjs <spec-folder-name>");
    console.log("");
    console.log(
      "Example: ./spec-to-implementation.mjs 2026-01-08-my-feature"
    );
    console.log(
      "     or: ./spec-to-implementation.mjs ./agent-os/specs/2026-01-08-my-feature"
    );
    console.log("");
    console.log("This script will:");
    console.log("  1. Create a safe implementation branch");
    console.log("  2. Run /write-spec to create the specification");
    console.log("  3. Run /create-tasks to break down into tasks");
    console.log(
      "  4. Run /orchestrate-tasks to generate implementation prompts"
    );
    console.log("  5. Execute each prompt to implement the feature");
    console.log("  6. Commit, push, and create a PR for review");
    process.exit(1);
  }

  // Handle both full paths and just folder names
  if (specInput.includes("agent-os/specs/")) {
    specFolder = specInput
      .replace(/.*agent-os\/specs\//, "")
      .replace(/\/$/, "");
  } else {
    specFolder = specInput;
  }

  specPath = `agent-os/specs/${specFolder}`;
  promptsDir = `${specPath}/implementation/prompts`;
  const branchName = `impl/${specFolder}`;

  // === PRE-FLIGHT CHECKS ===

  // Check that spec folder exists
  if (!(await fs.pathExists(specPath))) {
    console.log(`Error: Spec folder not found at ${specPath}`);
    console.log("Run /shape-spec first to create it.");
    process.exit(1);
  }

  // Check that requirements.md exists
  const requirementsPath = path.join(specPath, "planning", "requirements.md");
  if (!(await fs.pathExists(requirementsPath))) {
    console.log(`Error: requirements.md not found at ${requirementsPath}`);
    console.log("Run /shape-spec first to create requirements.");
    process.exit(1);
  }

  // Check for gh CLI
  try {
    await $`which gh`;
  } catch {
    console.log("Error: gh CLI not found.");
    console.log("Install it with: brew install gh");
    console.log("Then authenticate: gh auth login");
    process.exit(1);
  }

  // Check gh is authenticated
  try {
    await $`gh auth status`;
  } catch {
    console.log("Error: gh CLI not authenticated.");
    console.log("Run: gh auth login");
    process.exit(1);
  }

  // Check for uncommitted changes
  try {
    await $`git diff-index --quiet HEAD --`;
  } catch {
    console.log("Error: You have uncommitted changes.");
    console.log("");
    console.log("Please commit or stash them first:");
    console.log(`  git stash push -m 'before ${specFolder} implementation'`);
    console.log("");
    console.log("Or commit them:");
    console.log('  git add -A && git commit -m "WIP"');
    process.exit(1);
  }

  // === DETECT PREVIOUS PROGRESS ===
  const startPhase = await detectCompletedSteps();

  if (startPhase > 1) {
    console.log("");
    console.log("============================================");
    console.log("  DETECTED PREVIOUS PROGRESS");
    console.log("============================================");
    console.log("");

    if (startPhase > 1) {
      console.log(chalk.green("✓") + " Phase 1: Specification written");
    }
    if (startPhase > 2) {
      console.log(chalk.green("✓") + " Phase 2: Tasks created");
    }
    if (startPhase > 3) {
      console.log(chalk.green("✓") + " Phase 3: Prompts generated");
    }

    console.log("");
    console.log(`Will resume from Phase ${startPhase}`);
    console.log("");
  }

  // === READY TO GO ===
  console.log("");
  console.log("============================================");
  console.log(`  SPEC TO IMPLEMENTATION: ${specFolder}`);
  console.log("============================================");
  console.log("");

  // Ask about CLI tool
  console.log("CLI tool:");
  console.log("  1) Claude Code (claude)");
  console.log("  2) Cursor CLI (agent)");
  console.log("");

  const cliToolChoice = (await question("Choose CLI tool (1/2) [1]: ")) || "1";
  console.log("");

  let modelFlag = "";

  // Ask about model (only for Cursor CLI)
  if (cliToolChoice === "2") {
    console.log("Model:");
    console.log("  1) Default (use CLI default)");

    // Fetch available models dynamically
    let models = [];
    try {
      const modelsOutput = await $`agent models`.quiet();
      const lines = modelsOutput.stdout.split("\n");

      for (const line of lines) {
        if (!line || line.includes("Available") || line.includes("---"))
          continue;
        const model = line.replace(/^[\s\-*]*/, "").trim();
        if (model) models.push(model);
      }
    } catch {
      // Fallback models
      models = [
        "claude-sonnet-4-20250514",
        "claude-opus-4-20250514",
        "gpt-4o",
        "o3",
      ];
    }

    // Display models
    for (let i = 0; i < models.length; i++) {
      console.log(`  ${i + 2}) ${models[i]}`);
    }
    console.log("");

    const maxChoice = models.length + 1;
    const modelChoice = parseInt(
      (await question(`Choose model (1-${maxChoice}) [1]: `)) || "1",
      10
    );

    if (modelChoice > 1 && modelChoice <= maxChoice) {
      const selectedModel = models[modelChoice - 2];
      modelFlag = `--model ${selectedModel}`;
    }
    console.log("");
  }

  // Ask about execution mode
  console.log("Execution mode:");
  console.log(
    "  1) Automated - runs without interaction (faster, less control)"
  );
  console.log(
    "  2) Interactive - you can watch and approve each action (slower, more control)"
  );
  console.log("");

  const execModeChoice = (await question("Choose mode (1/2) [1]: ")) || "1";

  // Configure CLI
  if (cliToolChoice === "2") {
    if (execModeChoice === "1") {
      cliConfig = {
        tool: "cursor",
        modelFlag,
        execMode: "automated",
        command: `agent -p --force ${modelFlag}`.trim(),
      };
      console.log("Using Cursor CLI in automated mode.");
    } else {
      cliConfig = {
        tool: "cursor",
        modelFlag,
        execMode: "interactive",
        command: `agent ${modelFlag}`.trim(),
      };
      console.log("Using Cursor CLI in interactive mode.");
    }
    if (modelFlag) {
      console.log(`Model: ${modelFlag.replace("--model ", "")}`);
    } else {
      console.log("Model: CLI default");
    }
  } else {
    if (execModeChoice === "1") {
      cliConfig = {
        tool: "claude",
        modelFlag,
        execMode: "automated",
        command: `claude --dangerously-skip-permissions -p ${modelFlag}`.trim(),
      };
      console.log("Using Claude Code in automated mode.");
    } else {
      cliConfig = {
        tool: "claude",
        modelFlag,
        execMode: "interactive",
        command: `claude ${modelFlag}`.trim(),
      };
      console.log(
        "Using Claude Code in interactive mode. Type /exit after each phase to continue."
      );
    }
    console.log("Model: CLI default");
  }
  console.log("");

  // Ask about branch strategy
  const currentBranchResult = await $`git branch --show-current`.quiet();
  const currentBranch = currentBranchResult.stdout.trim();

  console.log(`Current branch: ${currentBranch}`);
  console.log("");

  // Check if we're already on the implementation branch
  if (currentBranch === branchName) {
    console.log(`Already on implementation branch: ${branchName}`);
    console.log("Resuming previous run...");
    console.log("");

    // Try to get the original branch from upstream
    let originalBranch = "main";
    try {
      const upstreamResult =
        await $`git rev-parse --abbrev-ref ${branchName}@{u}`.quiet();
      originalBranch = upstreamResult.stdout.trim().split("/")[0] || "main";
    } catch {
      // Default to main
    }

    branchConfig = {
      useBranch: true,
      branchName,
      originalBranch,
    };

    console.log("To revert everything later:");
    console.log(
      `  git checkout ${originalBranch} && git branch -D ${branchName}`
    );
    console.log("");
  } else {
    const originalBranch = currentBranch;

    const createBranchChoice =
      (await question("Create a new implementation branch? (y/n) [y]: ")) ||
      "y";

    if (createBranchChoice.toLowerCase() === "y") {
      // Check if branch already exists
      try {
        await $`git show-ref --verify --quiet refs/heads/${branchName}`;
        console.log(`Branch ${branchName} already exists. Switching to it...`);
        await $`git checkout ${branchName}`;
      } catch {
        await $`git checkout -b ${branchName}`;
        console.log(`Created branch: ${branchName}`);
      }

      branchConfig = {
        useBranch: true,
        branchName,
        originalBranch,
      };

      console.log("");
      console.log("To revert everything later:");
      console.log(
        `  git checkout ${originalBranch} && git branch -D ${branchName}`
      );
      console.log("");
    } else {
      branchConfig = {
        useBranch: false,
        branchName,
        originalBranch,
      };

      console.log("");
      console.log(`Running on current branch: ${originalBranch}`);
      console.log("Warning: Changes will be made directly to this branch.");
      console.log("");
    }
  }

  // === Phase 1: Write Spec ===
  if (startPhase <= 1) {
    console.log("============================================");
    console.log("  PHASE 1: Writing Specification");
    console.log("============================================");
    console.log("");
    console.log("Running /write-spec...");
    console.log("");

    await runCliWithTracking(
      "PHASE 1: Write Spec",
      `Run /write-spec for ${specPath}. Complete it fully without stopping for intermediate confirmation messages. When the spec.md is written, you're done.`
    );

    await commitStep("chore", `write specification for ${specFolder}`);
  } else {
    console.log("============================================");
    console.log("  PHASE 1: Writing Specification [SKIPPED]");
    console.log("============================================");
    console.log("");
    console.log(`Specification already exists at ${specPath}/spec.md`);
    console.log("");
  }

  // === Phase 2: Create Tasks ===
  if (startPhase <= 2) {
    console.log("");
    console.log("============================================");
    console.log("  PHASE 2: Creating Tasks");
    console.log("============================================");
    console.log("");

    await runCliWithTracking(
      "PHASE 2: Create Tasks",
      `Run /create-tasks for ${specPath}. Complete it fully without stopping for intermediate confirmation messages. When tasks.md is written, you're done.`
    );

    await commitStep("chore", `create tasks list for ${specFolder}`);
  } else {
    console.log("");
    console.log("============================================");
    console.log("  PHASE 2: Creating Tasks [SKIPPED]");
    console.log("============================================");
    console.log("");
    console.log(`Tasks already exist at ${specPath}/tasks.md`);
    console.log("");
  }

  // === Phase 3: Generate Prompts ===
  if (startPhase <= 3) {
    console.log("");
    console.log("============================================");
    console.log("  PHASE 3: Generating Prompts");
    console.log("============================================");
    console.log("");

    await runCliWithTracking(
      "PHASE 3: Generate Prompts",
      `Run /orchestrate-tasks for ${specPath}. Generate the prompt files to implementation/prompts/. When the prompt files are created, you're done.`
    );

    await commitStep(
      "chore",
      `generate implementation prompts for ${specFolder}`
    );
  } else {
    console.log("");
    console.log("============================================");
    console.log("  PHASE 3: Generating Prompts [SKIPPED]");
    console.log("============================================");
    console.log("");
    console.log(`Prompts already exist at ${promptsDir}`);
    console.log("");
  }

  // === Phase 4: Implement Each Task Group ===
  console.log("");
  console.log("============================================");
  console.log("  PHASE 4: Implementing Task Groups");
  console.log("============================================");
  console.log("");

  // Check that prompts were generated
  const promptsDirExists = await fs.pathExists(promptsDir);
  const promptFiles = promptsDirExists
    ? (await glob(`${promptsDir}/*.md`)).sort()
    : [];

  if (promptFiles.length === 0) {
    console.log(`Warning: No prompt files found in ${promptsDir}`);
    console.log("Skipping implementation phase.");
  } else {
    // Track executed prompts
    const executedPromptsFile = path.join(specPath, ".executed_prompts");

    // Create the file if it doesn't exist
    if (!(await fs.pathExists(executedPromptsFile))) {
      await fs.writeFile(executedPromptsFile, "");
    }

    const executedPrompts = (await fs.readFile(executedPromptsFile, "utf-8"))
      .split("\n")
      .filter(Boolean);

    const promptCount = promptFiles.length;
    let skipped = 0;

    for (let i = 0; i < promptFiles.length; i++) {
      const promptFile = promptFiles[i];
      const promptName = path.basename(promptFile);
      const current = i + 1;

      // Check if this prompt has already been executed
      if (executedPrompts.includes(promptName)) {
        console.log("");
        console.log("============================================");
        console.log(
          `  PHASE 4.${current}: ${promptName} (${current} of ${promptCount}) [SKIPPED]`
        );
        console.log("============================================");
        console.log("");
        console.log("Prompt already executed, skipping...");
        skipped++;
        continue;
      }

      console.log("");
      console.log("============================================");
      console.log(
        `  PHASE 4.${current}: ${promptName} (${current} of ${promptCount})`
      );
      console.log("============================================");
      console.log("");

      await runCliWithTracking(
        `PHASE 4.${current}: ${promptName}`,
        `Execute the instructions in @${promptFile} fully. Mark completed tasks in ${specPath}/tasks.md when done.`
      );

      // Mark this prompt as executed
      await fs.appendFile(executedPromptsFile, `${promptName}\n`);

      // Commit this implementation step
      await commitStep("feat", `implement ${promptName} for ${specFolder}`);
    }

    if (skipped > 0) {
      console.log("");
      console.log(`Skipped ${skipped} already-executed prompt(s)`);
      console.log("");
    }
  }

  // === Display Token Usage Summary ===
  displayFinalSummary();

  // === Finalize and Create PR ===
  console.log("");
  console.log("============================================");
  console.log("  FINALIZING: Push and Create PR");
  console.log("============================================");
  console.log("");

  // Commit any remaining uncommitted changes (if any)
  try {
    await $`git diff-index --quiet HEAD --`;
  } catch {
    console.log("Committing any remaining changes...");
    await commitStep("chore", `finalize implementation for ${specFolder}`);
  }

  let prUrl = "";

  if (branchConfig.useBranch) {
    console.log("Pushing branch...");
    try {
      await $`git push -u origin ${branchConfig.branchName}`;
    } catch {
      // Already up to date is fine
    }

    // Check if PR already exists
    let existingPr = "";
    try {
      const prResult =
        await $`gh pr list --head ${branchConfig.branchName} --json number --jq .[0].number`.quiet();
      existingPr = prResult.stdout.trim();
    } catch {
      // No existing PR
    }

    if (existingPr) {
      const prViewResult =
        await $`gh pr view ${existingPr} --json url --jq .url`.quiet();
      prUrl = prViewResult.stdout.trim();
      console.log("");
      console.log(`PR already exists: ${prUrl}`);
    } else {
      console.log("");
      console.log("Creating PR...");

      const prBody = `## Summary

Automated implementation of \`${specFolder}\` spec.

## Spec Files
- Specification: \`${specPath}/spec.md\`
- Tasks: \`${specPath}/tasks.md\`

## Review Checklist
- [ ] Code matches spec requirements
- [ ] Tests passing
- [ ] No unintended side effects
- [ ] Ready to merge`;

      const prResult = await $`gh pr create --title ${
        "feat: " + specFolder
      } --body ${prBody} --base ${branchConfig.originalBranch}`.quiet();
      prUrl = prResult.stdout.trim();
      console.log("");
      console.log(`PR created: ${prUrl}`);
    }
  } else {
    console.log("Not using git branch, skipping push and PR creation.");
    console.log("");
    console.log(
      `Changes are on current branch: ${branchConfig.originalBranch}`
    );
    console.log("Push when ready: git push");
  }

  // === Done ===
  console.log("");
  console.log("============================================");
  console.log("  COMPLETE!");
  console.log("============================================");
  console.log("");

  if (branchConfig.useBranch) {
    console.log(`Implementation branch: ${branchConfig.branchName}`);
    console.log(`Original branch: ${branchConfig.originalBranch}`);
    if (prUrl) {
      console.log("");
      console.log(`Review PR: ${prUrl}`);
    }
    console.log("");
    console.log("Commits created:");
    console.log("  - Each phase was committed with 'chore:' prefix");
    console.log("  - Each implementation was committed with 'feat:' prefix");
    console.log("");
    console.log("Next steps:");
    console.log("  - Review the PR in GitHub");
    console.log("  - If approved: merge the PR");
    console.log(
      `  - If rejected: git checkout ${branchConfig.originalBranch} && git branch -D ${branchConfig.branchName}`
    );
    console.log("");
    console.log("To resume this run later:");
    console.log(`  - Run: ./spec-to-implementation.mjs ${specFolder}`);
    console.log(
      "  - The script will automatically detect and resume from the last step"
    );
  } else {
    console.log(`Changes made to: ${branchConfig.originalBranch}`);
    console.log("");
    console.log("Next steps:");
    console.log("  - Review the changes: git log --oneline");
    console.log("  - Push when ready: git push");
    console.log("");
    console.log("To resume this run later:");
    console.log(`  - Run: ./spec-to-implementation.mjs ${specFolder}`);
    console.log(
      "  - The script will automatically detect and resume from the last step"
    );
  }
}

// Run main
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
