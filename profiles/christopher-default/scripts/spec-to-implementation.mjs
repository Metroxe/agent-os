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
import { spawn } from "child_process";
import { createInterface } from "readline";

// Enable verbose mode for debugging if needed
$.verbose = false;

// === CONFIGURATION ===

// Global state
let specFolder;
let specPath;
let promptsDir;
let logFile;
let fullLog = [];

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

// === LOGGING FUNCTIONS ===

function log(message) {
  console.log(message);
  fullLog.push(message);
}

function logSection(title) {
  const line = "============================================";
  log("");
  log(line);
  log(`  ${title}`);
  log(line);
  log("");
}

async function saveLogToFile() {
  if (!logFile) return;
  try {
    await fs.writeFile(logFile, fullLog.join("\n"), "utf-8");
  } catch (e) {
    console.error("Failed to save log file:", e.message);
  }
}

// === HELPER FUNCTIONS ===

function formatNumber(num) {
  return num.toLocaleString("en-US");
}

function formatCost(cost) {
  return `$${cost.toFixed(4)}`;
}

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

  // Force git to see all changes
  await $`git add -A`.quiet();

  // Check if there are changes to commit
  try {
    await $`git diff --cached --quiet`;
    log("  (No changes to commit)");
    return;
  } catch {
    // There are staged changes to commit
  }

  log(`  Committing: ${prefix}: ${message}`);
  await $`git commit -m ${`${prefix}: ${message}`} --no-verify`;
  log("");
}

/**
 * Handle CLI errors with recovery options
 */
async function handleCliError(exitCode, phaseName, errorOutput) {
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
  await $`git add -A`.quiet();
  try {
    await $`git diff --cached --quiet`;
    log("No uncommitted changes to clean up.");
  } catch {
    log("You have uncommitted changes from this step.");
    log("");
    log("Options:");
    log("  1) Discard uncommitted changes (recommended)");
    log("  2) Keep uncommitted changes");
    log("");

    const recoveryChoice = (await question("Choose option (1/2) [1]: ")) || "1";

    if (recoveryChoice === "1") {
      log("Discarding uncommitted changes...");
      await $`git reset HEAD`.quiet();
      await $`git checkout -- .`;
      await $`git clean -fd`;
      log("Changes discarded.");
    } else {
      log("Keeping uncommitted changes.");
    }
  }

  log("");
  log("You can resume later by running:");
  log(`  zx spec-to-implementation.mjs ${specFolder}`);

  await saveLogToFile();
}

/**
 * Detect which phases have been completed
 */
async function detectCompletedSteps() {
  let completedPhase = 0;

  if (await fs.pathExists(path.join(specPath, "spec.md"))) {
    completedPhase = 1;
  }
  if (await fs.pathExists(path.join(specPath, "tasks.md"))) {
    completedPhase = 2;
  }
  if (await fs.pathExists(promptsDir)) {
    const promptFiles = await glob(`${promptsDir}/*.md`);
    if (promptFiles.length > 0) {
      completedPhase = 3;
    }
  }

  return completedPhase + 1;
}

/**
 * Format tool use for display
 */
function formatToolUse(toolName, toolInput) {
  try {
    const input =
      typeof toolInput === "string" ? JSON.parse(toolInput) : toolInput;

    switch (toolName) {
      case "Read":
        return `Reading ${input.file_path || input.path || "file"}`;
      case "Write":
        return `Writing ${input.file_path || input.path || "file"}`;
      case "Edit":
      case "StrReplace":
        return `Editing ${input.file_path || input.path || "file"}`;
      case "Grep":
      case "Search":
        const pattern = input.pattern || input.query || "";
        const searchPath = input.path || input.directory || ".";
        return `Searching "${pattern.substring(0, 40)}${
          pattern.length > 40 ? "..." : ""
        }" in ${searchPath}`;
      case "Glob":
        return `Finding files: ${input.pattern || input.glob_pattern || "*"}`;
      case "LS":
      case "ListDir":
        return `Listing ${input.path || input.directory || "."}`;
      case "Bash":
      case "Shell":
        const cmd = input.command || "";
        return `Running: ${cmd.substring(0, 50)}${
          cmd.length > 50 ? "..." : ""
        }`;
      case "WebSearch":
        return `Searching web: ${input.query || input.search_term || ""}`;
      case "TodoRead":
        return "Reading todo list";
      case "TodoWrite":
        return "Updating todo list";
      case "Task":
        return `Task: ${(input.description || "").substring(0, 40)}...`;
      default:
        // Try to extract something useful from the input
        const firstKey = Object.keys(input)[0];
        if (firstKey && typeof input[firstKey] === "string") {
          const val = input[firstKey];
          return `${toolName}: ${val.substring(0, 40)}${
            val.length > 40 ? "..." : ""
          }`;
        }
        return toolName;
    }
  } catch {
    return toolName;
  }
}

/**
 * Run Cursor CLI with streaming JSON output
 * Uses --output-format stream-json for real-time streaming
 */
function runCursorCli(config, prompt) {
  return new Promise((resolve, reject) => {
    // Build args array
    const args = [];

    if (config.execMode === "automated") {
      args.push("-p", "--force", "--output-format", "stream-json");
    }

    // Add model flag if present
    if (config.modelFlag) {
      args.push(...config.modelFlag.split(" "));
    }

    // Add the prompt
    args.push(prompt);

    console.log(
      chalk.dim(`  $ agent ${args.slice(0, -1).join(" ")} "<prompt>..."`)
    );
    console.log(""); // Add spacing before output

    let capturedOutput = "";
    let currentThinking = "";
    let isShowingThinking = false;

    const proc = spawn("agent", args, {
      stdio: ["inherit", "pipe", "pipe"],
    });

    const rl = createInterface({ input: proc.stdout });

    rl.on("line", (line) => {
      try {
        const event = JSON.parse(line);
        capturedOutput += line + "\n";

        switch (event.type) {
          case "system":
            if (event.subtype === "init") {
              console.log(
                chalk.dim(`  Session: ${event.session_id?.substring(0, 8)}...`)
              );
            }
            break;

          case "thinking":
            if (event.subtype === "delta" && event.text) {
              if (!isShowingThinking) {
                process.stdout.write(chalk.magenta("  [Thinking] "));
                isShowingThinking = true;
              }
              currentThinking += event.text;
              process.stdout.write(chalk.magenta(event.text));
            } else if (event.subtype === "completed") {
              if (isShowingThinking) {
                console.log(""); // End thinking line
                isShowingThinking = false;
              }
            }
            break;

          case "tool_call":
            // Tool calls - extract tool name and args/result
            if (event.tool_call) {
              const toolKeys = Object.keys(event.tool_call);
              for (const key of toolKeys) {
                const toolData = event.tool_call[key];
                // Extract tool name from key (e.g., "readToolCall" -> "Read")
                const toolName = key
                  .replace(/ToolCall$/, "")
                  .replace(/([A-Z])/g, " $1")
                  .trim();

                if (event.subtype === "started") {
                  // Show tool starting with args
                  let argsPreview = "";
                  if (toolData.args) {
                    if (toolData.args.path) {
                      argsPreview = toolData.args.path;
                    } else if (toolData.args.command) {
                      argsPreview = toolData.args.command.substring(0, 60);
                    } else if (toolData.args.pattern) {
                      argsPreview = `"${toolData.args.pattern}"`;
                    } else if (toolData.args.query) {
                      argsPreview = toolData.args.query.substring(0, 60);
                    } else {
                      argsPreview = JSON.stringify(toolData.args).substring(
                        0,
                        60
                      );
                    }
                  }
                  console.log(chalk.cyan(`  ➤ ${toolName}: ${argsPreview}`));
                } else if (event.subtype === "completed") {
                  // Show result preview - handle different result structures
                  const success = toolData.result?.success;
                  if (success) {
                    // Edit tools have message and diff stats
                    if (success.message) {
                      console.log(chalk.green(`    └─ ${success.message}`));
                      if (success.linesAdded || success.linesRemoved) {
                        console.log(
                          chalk.dim(
                            `       +${success.linesAdded || 0} / -${
                              success.linesRemoved || 0
                            } lines`
                          )
                        );
                      }
                    } else {
                      // Shell commands have stdout/stderr, others have content
                      let output =
                        success.content ||
                        success.stdout ||
                        success.interleavedOutput;
                      if (output) {
                        const preview =
                          typeof output === "string"
                            ? output.substring(0, 80).replace(/\n/g, " ").trim()
                            : JSON.stringify(output).substring(0, 80);
                        if (preview) {
                          console.log(
                            chalk.dim(
                              `    └─ ${preview}${
                                output.length > 80 ? "..." : ""
                              }`
                            )
                          );
                        }
                      }
                    }
                    // Show exit code for shell commands if non-zero
                    if (
                      success.exitCode !== undefined &&
                      success.exitCode !== 0
                    ) {
                      console.log(
                        chalk.yellow(`    └─ Exit code: ${success.exitCode}`)
                      );
                    }
                  } else if (toolData.result?.error) {
                    // Handle error - could be string or object
                    const errMsg =
                      typeof toolData.result.error === "string"
                        ? toolData.result.error
                        : toolData.result.error.message ||
                          toolData.result.error.errorMessage ||
                          JSON.stringify(toolData.result.error);
                    console.log(
                      chalk.red(`    └─ Error: ${errMsg.substring(0, 80)}`)
                    );
                  }
                }
              }
            }
            break;

          case "assistant":
            // Final assistant message
            if (event.message?.content) {
              console.log(""); // Add spacing
              for (const block of event.message.content) {
                if (block.type === "text" && block.text) {
                  console.log(block.text);
                }
              }
            }
            break;

          case "result":
            // Final result
            if (event.duration_ms) {
              console.log("");
              console.log(
                chalk.dim(
                  `  Completed in ${(event.duration_ms / 1000).toFixed(1)}s`
                )
              );
            }
            break;
        }
      } catch {
        // Non-JSON line, just print it
        console.log(line);
        capturedOutput += line + "\n";
      }
    });

    proc.stderr.on("data", (data) => {
      const text = data.toString();
      capturedOutput += text;
      process.stderr.write(chalk.red(text));
    });

    proc.on("close", (code) => {
      console.log(""); // Newline after output
      if (code === 0) {
        resolve({ output: capturedOutput, exitCode: 0 });
      } else {
        const error = new Error(`agent exited with code ${code}`);
        error.exitCode = code;
        error.output = capturedOutput;
        reject(error);
      }
    });

    proc.on("error", (err) => {
      console.error("Failed to start agent:", err.message);
      reject({ output: "", error: err, exitCode: 1 });
    });
  });
}

/**
 * Format tool result for display (truncate if too long)
 */
function formatToolResult(content, maxLines = 5) {
  if (!content) return "";

  const str =
    typeof content === "string" ? content : JSON.stringify(content, null, 2);
  const lines = str.split("\n");

  if (lines.length <= maxLines) {
    return lines.map((l) => chalk.dim(`    │ ${l}`)).join("\n");
  }

  const shown = lines.slice(0, maxLines);
  const remaining = lines.length - maxLines;
  return (
    shown.map((l) => chalk.dim(`    │ ${l}`)).join("\n") +
    chalk.dim(`\n    │ ... (${remaining} more lines)`)
  );
}

/**
 * Run a command with real-time streaming output using spawn
 */
function runCommandWithStreaming(cmd, args) {
  return new Promise((resolve, reject) => {
    let output = "";
    let jsonLines = [];
    // Track blocks by index
    let blocks = {}; // { index: { type, name, input } }
    let lastToolName = ""; // Track last tool for result display

    const proc = spawn(cmd, args, {
      stdio: ["inherit", "pipe", "pipe"],
      shell: false,
    });

    // Create readline interface for line-by-line processing
    const rl = createInterface({ input: proc.stdout });

    rl.on("line", (line) => {
      // Try to parse as JSON for stream-json format
      try {
        const event = JSON.parse(line);
        jsonLines.push(event);

        // Handle different event types based on Claude CLI stream-json format
        if (event.type === "assistant") {
          // Full assistant message (usually at the end)
          if (event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text") {
                console.log(block.text);
                output += block.text + "\n";
              } else if (block.type === "tool_use") {
                // Tool use in final message
                const toolDisplay = formatToolUse(block.name, block.input);
                console.log(chalk.cyan(`  ➤ ${toolDisplay}`));
                lastToolName = block.name;
              } else if (block.type === "tool_result") {
                // Tool result in final message
                if (block.content) {
                  console.log(formatToolResult(block.content));
                }
              }
            }
          }
        } else if (event.type === "user") {
          // User message - often contains tool results
          if (event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "tool_result") {
                // Show tool result with preview
                const resultPreview = formatToolResult(block.content);
                if (resultPreview) {
                  console.log(resultPreview);
                }
              }
            }
          }
        } else if (event.type === "content_block_start") {
          // Start of a new content block - track by index
          const idx = event.index;
          if (event.content_block?.type === "tool_use") {
            blocks[idx] = {
              type: "tool_use",
              name: event.content_block.name || "tool",
              input: "",
            };
          } else if (event.content_block?.type === "text") {
            blocks[idx] = { type: "text", content: "" };
          } else if (event.content_block?.type === "tool_result") {
            blocks[idx] = { type: "tool_result", content: "" };
          }
        } else if (event.type === "content_block_delta") {
          const idx = event.index;
          // Streaming delta
          if (event.delta?.type === "text_delta" && event.delta?.text) {
            process.stdout.write(event.delta.text);
            output += event.delta.text;
            if (blocks[idx]) {
              blocks[idx].content =
                (blocks[idx].content || "") + event.delta.text;
            }
          } else if (
            event.delta?.type === "input_json_delta" &&
            event.delta?.partial_json
          ) {
            // Accumulate tool input JSON
            if (blocks[idx]) {
              blocks[idx].input =
                (blocks[idx].input || "") + event.delta.partial_json;
            }
          }
        } else if (event.type === "content_block_stop") {
          // End of content block
          const idx = event.index;
          const block = blocks[idx];
          if (block && block.type === "tool_use") {
            // Show what tool was used with its input
            const toolDisplay = formatToolUse(block.name, block.input);
            console.log(chalk.cyan(`  ➤ ${toolDisplay}`));
            lastToolName = block.name;
          } else if (block && block.type === "tool_result") {
            // Show tool result
            const resultPreview = formatToolResult(block.content);
            if (resultPreview) {
              console.log(resultPreview);
            }
          }
          // Clean up
          delete blocks[idx];
        } else if (event.type === "result") {
          // Final result with usage info
          if (event.usage) {
            tokenUsage.totalInputTokens += event.usage.input_tokens || 0;
            tokenUsage.totalOutputTokens += event.usage.output_tokens || 0;
            tokenUsage.totalCacheReadTokens +=
              event.usage.cache_read_input_tokens || 0;
            tokenUsage.totalCacheCreationTokens +=
              event.usage.cache_creation_input_tokens || 0;
          }
          if (event.total_cost_usd) {
            tokenUsage.totalCostUsd += event.total_cost_usd;
          }
          // Show cost summary for this step
          if (event.total_cost_usd) {
            console.log("");
            console.log(
              chalk.dim(
                `  Step cost: ${formatCost(event.total_cost_usd)} | ` +
                  `${formatNumber(event.usage?.input_tokens || 0)} in / ` +
                  `${formatNumber(event.usage?.output_tokens || 0)} out`
              )
            );
          }
        }
      } catch {
        // Not JSON, just print it (e.g., startup messages)
        console.log(line);
        output += line + "\n";
      }
    });

    // Also capture stderr
    proc.stderr.on("data", (data) => {
      process.stderr.write(data);
      output += data.toString();
    });

    proc.on("close", (code) => {
      console.log(""); // Newline after output
      if (code === 0) {
        resolve({ output, jsonLines, exitCode: code });
      } else {
        reject({ output, jsonLines, exitCode: code });
      }
    });

    proc.on("error", (err) => {
      reject({ output, error: err, exitCode: 1 });
    });
  });
}

/**
 * Run CLI command with real-time streaming and token tracking
 */
async function runCliWithTracking(phaseName, prompt) {
  tokenUsage.stepCount++;
  const stepNum = tokenUsage.stepCount;

  log(`  Step ${stepNum}: ${phaseName}`);
  log("");

  const startTime = Date.now();
  let cliOutput = "";

  try {
    if (cliConfig.tool === "claude") {
      const modelArgs = cliConfig.modelFlag
        ? cliConfig.modelFlag.split(" ").filter(Boolean)
        : [];

      if (cliConfig.execMode === "automated") {
        // Build args array for spawn
        // Note: --verbose is required when using --output-format=stream-json with -p
        const args = [
          "--dangerously-skip-permissions",
          "-p",
          "--verbose",
          ...modelArgs,
          "--output-format",
          "stream-json",
          prompt,
        ];

        const result = await runCommandWithStreaming("claude", args);
        cliOutput = result.output;
      } else {
        // Interactive mode - use inherit for full interactivity
        $.stdio = "inherit";
        await $`claude ${modelArgs} ${prompt}`;
        $.stdio = "pipe";
      }
    } else {
      // Cursor CLI - use spawn with inherited stdio for real-time output
      // Cursor CLI doesn't support JSON streaming, so we just show raw output
      const result = await runCursorCli(cliConfig, prompt);
      cliOutput = result.output;
    }
  } catch (error) {
    cliOutput = error.output || "";
    await handleCliError(error.exitCode || 1, phaseName, cliOutput);
    process.exit(1);
  }

  const duration = Date.now() - startTime;
  tokenUsage.totalDurationMs += duration;

  // Log to our log array
  fullLog.push(`--- ${phaseName} ---`);
  fullLog.push(cliOutput);
  fullLog.push(`Duration: ${formatDuration(duration)}`);
  fullLog.push("");

  log("");
  log(`  Duration: ${formatDuration(duration)}`);

  if (cliConfig.tool === "claude" && tokenUsage.totalInputTokens > 0) {
    log(
      `  Running total: ${formatCost(tokenUsage.totalCostUsd)} | ${formatNumber(
        tokenUsage.totalInputTokens + tokenUsage.totalOutputTokens
      )} tokens`
    );
  }

  log("");
}

/**
 * Display final usage summary
 */
function displayFinalSummary() {
  logSection("TOKEN USAGE SUMMARY");

  const totalDurationSec = (tokenUsage.totalDurationMs / 1000).toFixed(1);

  if (cliConfig.tool === "cursor") {
    log(`  Total steps:     ${tokenUsage.stepCount}`);
    log(`  Total duration:  ${totalDurationSec}s`);
    log("");
    log("  (Detailed token usage not available with Cursor CLI)");
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
      log(
        `  Cache read:      ${formatNumber(tokenUsage.totalCacheReadTokens)}`
      );
    }
    if (tokenUsage.totalCacheCreationTokens > 0) {
      log(
        `  Cache created:   ${formatNumber(
          tokenUsage.totalCacheCreationTokens
        )}`
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

/**
 * Upload logs to PR as a comment
 */
async function uploadLogsToPR(prNumber) {
  log("Uploading implementation logs to PR...");

  // Create a summary for the PR comment
  const logSummary = `## Implementation Logs

This PR was automatically generated by \`spec-to-implementation.mjs\`.

### Summary
- **Total Steps:** ${tokenUsage.stepCount}
- **Total Duration:** ${formatDuration(tokenUsage.totalDurationMs)}
- **Total Cost:** ${formatCost(tokenUsage.totalCostUsd)}
- **Total Tokens:** ${formatNumber(
    tokenUsage.totalInputTokens + tokenUsage.totalOutputTokens
  )}

### Full Log

<details>
<summary>Click to expand full implementation log</summary>

\`\`\`
${fullLog.join("\n")}
\`\`\`

</details>
`;

  try {
    await $`gh pr comment ${prNumber} --body ${logSummary}`;
    log("  Logs uploaded to PR as comment");
  } catch (error) {
    log(`  Failed to upload logs: ${error.message}`);
  }
}

// === MAIN SCRIPT ===

async function main() {
  const specInput = process.argv[3] || "";

  if (!specInput) {
    console.log("Usage: zx spec-to-implementation.mjs <spec-folder-name>");
    console.log("");
    console.log("Example: zx spec-to-implementation.mjs 2026-01-08-my-feature");
    console.log(
      "     or: zx spec-to-implementation.mjs ./agent-os/specs/2026-01-08-my-feature"
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
    console.log("  7. Upload implementation logs to the PR");
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
  logFile = `${specPath}/implementation/implementation-log.txt`;
  const branchName = `impl/${specFolder}`;

  // Initialize log
  fullLog.push(`Implementation Log: ${specFolder}`);
  fullLog.push(`Started: ${new Date().toISOString()}`);
  fullLog.push("");

  // === PRE-FLIGHT CHECKS ===

  if (!(await fs.pathExists(specPath))) {
    console.log(`Error: Spec folder not found at ${specPath}`);
    console.log("Run /shape-spec first to create it.");
    process.exit(1);
  }

  const requirementsPath = path.join(specPath, "planning", "requirements.md");
  if (!(await fs.pathExists(requirementsPath))) {
    console.log(`Error: requirements.md not found at ${requirementsPath}`);
    console.log("Run /shape-spec first to create requirements.");
    process.exit(1);
  }

  try {
    await $`which gh`.quiet();
  } catch {
    console.log("Error: gh CLI not found.");
    console.log("Install: brew install gh && gh auth login");
    process.exit(1);
  }

  try {
    await $`gh auth status`.quiet();
  } catch {
    console.log("Error: gh CLI not authenticated. Run: gh auth login");
    process.exit(1);
  }

  // Check for uncommitted changes
  await $`git add -A`.quiet();
  try {
    await $`git diff --cached --quiet`;
    await $`git diff --quiet`;
  } catch {
    console.log("Error: You have uncommitted changes.");
    console.log("");
    console.log("Please commit or stash them first:");
    console.log(`  git stash push -m 'before ${specFolder} implementation'`);
    process.exit(1);
  }

  // === DETECT PREVIOUS PROGRESS ===
  const startPhase = await detectCompletedSteps();

  if (startPhase > 1) {
    logSection("DETECTED PREVIOUS PROGRESS");
    if (startPhase > 1)
      log(chalk.green("✓") + " Phase 1: Specification written");
    if (startPhase > 2) log(chalk.green("✓") + " Phase 2: Tasks created");
    if (startPhase > 3) log(chalk.green("✓") + " Phase 3: Prompts generated");
    log("");
    log(`Will resume from Phase ${startPhase}`);
  }

  // === READY TO GO ===
  logSection(`SPEC TO IMPLEMENTATION: ${specFolder}`);

  // Ask about CLI tool
  log("CLI tool:");
  log("  1) Claude Code (claude)");
  log("  2) Cursor CLI (agent)");
  log("");

  const cliToolChoice = (await question("Choose CLI tool (1/2) [1]: ")) || "1";
  log("");

  let modelFlag = "";

  // Ask about model (only for Cursor CLI)
  if (cliToolChoice === "2") {
    log("Model:");
    log("  1) Default (use CLI default)");

    let models = [];
    try {
      const modelsOutput = await $`agent models`.quiet();
      const lines = modelsOutput.stdout.split("\n");
      for (const line of lines) {
        if (
          !line ||
          line.includes("Available") ||
          line.includes("---") ||
          line.includes("Tip:")
        )
          continue;
        // Extract just the model ID (before the " - " separator)
        // Lines look like: "  8) opus-4.5-thinking - Claude 4.5 Opus (Thinking)"
        const cleaned = line.replace(/^[\s\d\)\-*]*/, "").trim();
        if (cleaned) {
          // Extract model ID (first part before " - ")
          const modelId = cleaned.split(" - ")[0].trim();
          const displayName = cleaned;
          if (modelId) models.push({ id: modelId, display: displayName });
        }
      }
    } catch {
      models = [
        { id: "claude-sonnet-4-20250514", display: "Claude Sonnet 4" },
        { id: "claude-opus-4-20250514", display: "Claude Opus 4" },
        { id: "gpt-4o", display: "GPT-4o" },
        { id: "o3", display: "O3" },
      ];
    }

    for (let i = 0; i < models.length; i++) {
      log(`  ${i + 2}) ${models[i].display}`);
    }
    log("");

    const maxChoice = models.length + 1;
    const modelChoice = parseInt(
      (await question(`Choose model (1-${maxChoice}) [1]: `)) || "1",
      10
    );

    if (modelChoice > 1 && modelChoice <= maxChoice) {
      const selectedModel = models[modelChoice - 2];
      modelFlag = `--model ${selectedModel.id}`;
      log(`Selected model ID: ${selectedModel.id}`);
    }
    log("");
  }

  // Ask about execution mode
  log("Execution mode:");
  log("  1) Automated - runs without interaction (faster, less control)");
  log(
    "  2) Interactive - you can watch and approve each action (slower, more control)"
  );
  log("");

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
      log("Using Cursor CLI in automated mode.");
    } else {
      cliConfig = {
        tool: "cursor",
        modelFlag,
        execMode: "interactive",
        command: `agent ${modelFlag}`.trim(),
      };
      log("Using Cursor CLI in interactive mode.");
    }
    if (modelFlag) {
      log(`Model: ${modelFlag.replace("--model ", "")}`);
    } else {
      log("Model: CLI default");
    }
  } else {
    if (execModeChoice === "1") {
      cliConfig = {
        tool: "claude",
        modelFlag,
        execMode: "automated",
        command: `claude --dangerously-skip-permissions -p ${modelFlag}`.trim(),
      };
      log("Using Claude Code in automated mode.");
    } else {
      cliConfig = {
        tool: "claude",
        modelFlag,
        execMode: "interactive",
        command: `claude ${modelFlag}`.trim(),
      };
      log("Using Claude Code in interactive mode.");
    }
    log("Model: CLI default");
  }
  log("");

  // Ask about branch strategy
  const currentBranchResult = await $`git branch --show-current`.quiet();
  const currentBranch = currentBranchResult.stdout.trim();

  log(`Current branch: ${currentBranch}`);
  log("");

  if (currentBranch === branchName) {
    log(`Already on implementation branch: ${branchName}`);
    log("Resuming previous run...");

    let originalBranch = "main";
    try {
      const upstreamResult =
        await $`git rev-parse --abbrev-ref ${branchName}@{u}`.quiet();
      originalBranch = upstreamResult.stdout.trim().split("/")[0] || "main";
    } catch {}

    branchConfig = { useBranch: true, branchName, originalBranch };

    log("");
    log("To revert everything later:");
    log(`  git checkout ${originalBranch} && git branch -D ${branchName}`);
    log("");
  } else {
    const originalBranch = currentBranch;
    const createBranchChoice =
      (await question("Create a new implementation branch? (y/n) [y]: ")) ||
      "y";

    if (createBranchChoice.toLowerCase() === "y") {
      try {
        await $`git show-ref --verify --quiet refs/heads/${branchName}`;
        log(`Branch ${branchName} already exists. Switching to it...`);
        await $`git checkout ${branchName}`;
      } catch {
        await $`git checkout -b ${branchName}`;
        log(`Created branch: ${branchName}`);
      }

      branchConfig = { useBranch: true, branchName, originalBranch };

      log("");
      log("To revert everything later:");
      log(`  git checkout ${originalBranch} && git branch -D ${branchName}`);
      log("");
    } else {
      branchConfig = { useBranch: false, branchName, originalBranch };
      log("");
      log(`Running on current branch: ${originalBranch}`);
      log("Warning: Changes will be made directly to this branch.");
      log("");
    }
  }

  // Ensure implementation directory exists
  await fs.ensureDir(`${specPath}/implementation`);

  // === Phase 1: Write Spec ===
  if (startPhase <= 1) {
    logSection("PHASE 1: Writing Specification");
    log("Running /write-spec...");
    log("");

    await runCliWithTracking(
      "PHASE 1: Write Spec",
      `Run /write-spec for ${specPath}. Complete it fully without stopping for intermediate confirmation messages. When the spec.md is written, you're done.`
    );

    await commitStep("chore", `write specification for ${specFolder}`);
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

    await commitStep("chore", `create tasks list for ${specFolder}`);
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

    await commitStep(
      "chore",
      `generate implementation prompts for ${specFolder}`
    );
  } else {
    logSection("PHASE 3: Generating Prompts [SKIPPED]");
    log(`Prompts already exist at ${promptsDir}`);
  }

  // === Phase 4: Implement Each Task Group ===
  logSection("PHASE 4: Implementing Task Groups");

  const promptsDirExists = await fs.pathExists(promptsDir);
  const promptFiles = promptsDirExists
    ? (await glob(`${promptsDir}/*.md`)).sort()
    : [];

  if (promptFiles.length === 0) {
    log(`Warning: No prompt files found in ${promptsDir}`);
    log("Skipping implementation phase.");
  } else {
    const executedPromptsFile = path.join(specPath, ".executed_prompts");

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

      await fs.appendFile(executedPromptsFile, `${promptName}\n`);
      await commitStep("feat", `implement ${promptName} for ${specFolder}`);
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
  await commitStep("chore", `finalize implementation for ${specFolder}`);

  let prUrl = "";
  let prNumber = "";

  if (branchConfig.useBranch) {
    log("Pushing branch...");
    try {
      await $`git push -u origin ${branchConfig.branchName}`;
    } catch {}

    // Check if PR already exists
    let existingPr = "";
    try {
      const prResult =
        await $`gh pr list --head ${branchConfig.branchName} --json number --jq .[0].number`.quiet();
      existingPr = prResult.stdout.trim();
    } catch {}

    if (existingPr) {
      const prViewResult =
        await $`gh pr view ${existingPr} --json url --jq .url`.quiet();
      prUrl = prViewResult.stdout.trim();
      prNumber = existingPr;
      log("");
      log(`PR already exists: ${prUrl}`);
    } else {
      log("");
      log("Creating PR...");

      const prBody = `## Summary

Automated implementation of \`${specFolder}\` spec.

## Spec Files
- Specification: \`${specPath}/spec.md\`
- Tasks: \`${specPath}/tasks.md\`

## Stats
- **Steps:** ${tokenUsage.stepCount}
- **Duration:** ${formatDuration(tokenUsage.totalDurationMs)}
- **Cost:** ${formatCost(tokenUsage.totalCostUsd)}
- **Tokens:** ${formatNumber(
        tokenUsage.totalInputTokens + tokenUsage.totalOutputTokens
      )}

## Review Checklist
- [ ] Code matches spec requirements
- [ ] Tests passing
- [ ] No unintended side effects
- [ ] Ready to merge`;

      const prResult = await $`gh pr create --title ${
        "feat: " + specFolder
      } --body ${prBody} --base ${branchConfig.originalBranch}`.quiet();
      prUrl = prResult.stdout.trim();

      // Extract PR number from URL
      const prMatch = prUrl.match(/\/pull\/(\d+)/);
      prNumber = prMatch ? prMatch[1] : "";

      log("");
      log(`PR created: ${prUrl}`);
    }

    // Upload logs to PR as a comment
    if (prNumber) {
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
  log(`  zx spec-to-implementation.mjs ${specFolder}`);

  // Final save
  await saveLogToFile();
}

// Run main
main().catch(async (error) => {
  console.error("Fatal error:", error);
  await saveLogToFile();
  process.exit(1);
});
