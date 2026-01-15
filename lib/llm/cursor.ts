/**
 * Cursor runtime implementation
 *
 * Executes prompts using the `agent` CLI with support for:
 * - Streaming JSON output with colored output
 * - Model selection
 * - Automated and interactive modes
 * - Access to authenticated CLI tools via --sandbox disabled
 *
 * Based on the runCursorCli() pattern from spec-to-implementation.mjs
 */

import chalk from "chalk";
import { spawn } from "child_process";
import { createInterface } from "readline";
import { formatToolResult, formatToolUse } from "./formatting.js";
import type { LLMRuntime, Model, PromptOptions, PromptResult } from "./types.js";

/**
 * Parse models from `agent models` command output
 */
function parseModelsOutput(stdout: string): Model[] {
  const models: Model[] = [];
  const lines = stdout.split("\n");

  for (const line of lines) {
    // Skip header/separator lines
    if (
      !line ||
      line.includes("Available") ||
      line.includes("---") ||
      line.includes("Tip:")
    ) {
      continue;
    }

    // Extract model info from lines like: "  8) opus-4.5-thinking - Claude 4.5 Opus (Thinking)"
    const cleaned = line.replace(/^[\s\d\)\-*]*/, "").trim();
    if (cleaned) {
      // Split on " - " to separate ID from description
      const parts = cleaned.split(" - ");
      const id = parts[0]?.trim();
      const description = parts[1]?.trim();

      if (id) {
        models.push({
          id,
          name: description || id,
          description,
        });
      }
    }
  }

  return models;
}

/**
 * Cursor runtime implementation
 */
export const cursorRuntime: LLMRuntime = {
  name: "cursor",
  displayName: "Cursor",
  supportsStreaming: true,
  supportsTokenTracking: false, // Cursor doesn't provide token usage

  async runPrompt(prompt: string, options?: PromptOptions): Promise<PromptResult> {
    const startTime = Date.now();
    const args: string[] = [];

    // Build command arguments
    if (options?.automated) {
      args.push("-p", "--force", "--output-format", "stream-json");
    }

    if (options?.model) {
      args.push("--model", options.model);
    }

    // Disable sandbox to enable access to authenticated gh CLI and system credentials
    args.push("--sandbox", "disabled");

    args.push(prompt);

    return new Promise((resolve) => {
      let output = "";
      let thinkingStarted = false; // Track if we've started a thinking block

      const proc = spawn("agent", args, {
        stdio: ["inherit", "pipe", "pipe"],
        cwd: options?.workingDirectory,
        shell: false,
      });

      const rl = createInterface({ input: proc.stdout });

      rl.on("line", (line) => {
        if (options?.streamOutput) {
          // Parse and display streaming output with colors
          try {
            const event = JSON.parse(line);

            // Verbose mode: print raw JSON before formatted output
            if (options?.verbose) {
              console.log(chalk.gray(`[VERBOSE] ${line}`));
            }

            switch (event.type) {
              case "system":
                // Subtype: init - show session ID with dim formatting
                if (event.subtype === "init" && event.session_id) {
                  console.log(chalk.dim(`  Session: ${event.session_id.substring(0, 8)}...`));
                }
                break;

              case "thinking":
                // Subtype: delta - show thinking output in magenta
                if (event.subtype === "delta" && event.text) {
                  if (!thinkingStarted) {
                    process.stdout.write(chalk.magenta("[Thinking] "));
                    thinkingStarted = true;
                  }
                  process.stdout.write(chalk.magenta(event.text));
                  output += event.text;
                }
                // Subtype: completed - finalize thinking display
                else if (event.subtype === "completed") {
                  if (thinkingStarted) {
                    console.log(""); // Newline after thinking block
                    thinkingStarted = false;
                  }
                }
                break;

              case "tool_call":
                // Subtype: started - show tool name and args preview in cyan
                if (event.tool_call && event.subtype === "started") {
                  const toolKeys = Object.keys(event.tool_call);
                  for (const key of toolKeys) {
                    const toolData = event.tool_call[key];
                    const toolName = key.replace(/ToolCall$/, "");
                    // Use shared formatToolUse helper for consistent formatting
                    const toolDisplay = formatToolUse(toolName, toolData.args || {});
                    console.log(chalk.cyan(`  ➤ ${toolDisplay}`));
                  }
                }
                // Subtype: completed - show tool results
                else if (event.tool_call && event.subtype === "completed") {
                  const toolKeys = Object.keys(event.tool_call);
                  for (const key of toolKeys) {
                    const toolData = event.tool_call[key];
                    if (toolData.result) {
                      // Extract tool name from key (e.g., "ReadToolCall" -> "Read")
                      const toolName = key.replace(/ToolCall$/, "");
                      // Use shared formatToolResult helper for consistent formatting
                      const resultPreview = formatToolResult(toolData.result, toolName);
                      if (resultPreview) {
                        console.log(resultPreview);
                      }
                    }
                    // Show non-zero exit codes in yellow
                    if (toolData.exitCode !== undefined && toolData.exitCode !== 0) {
                      console.log(chalk.yellow(`    Exit code: ${toolData.exitCode}`));
                    }
                  }
                }
                break;

              case "assistant":
                // Display final message content
                if (event.message?.content) {
                  for (const block of event.message.content) {
                    if (block.type === "text" && block.text) {
                      console.log(block.text);
                      output += block.text + "\n";
                    }
                  }
                }
                break;

              case "result":
                // Display completion time in dim
                if (event.duration_ms) {
                  console.log(chalk.dim(`  Completed in ${(event.duration_ms / 1000).toFixed(1)}s`));
                }
                break;

              case "error":
                // Show errors in red
                if (event.message) {
                  console.log(chalk.red(`  Error: ${event.message}`));
                }
                break;

              default:
                // Log unknown event types only in verbose mode
                if (options?.verbose) {
                  console.log(chalk.yellow(`[VERBOSE] Unknown event type: ${event.type}`));
                }
                break;
            }
          } catch {
            // Not JSON, print as-is
            console.log(line);
            output += line + "\n";
          }
        } else {
          output += line + "\n";
        }
      });

      proc.stderr.on("data", (data) => {
        output += data.toString();
        if (options?.streamOutput) {
          process.stderr.write(data);
        }
      });

      proc.on("close", (code) => {
        const durationMs = Date.now() - startTime;
        const exitCode = code ?? 1;

        resolve({
          success: exitCode === 0,
          output,
          exitCode,
          durationMs,
        });
      });

      proc.on("error", (err) => {
        const durationMs = Date.now() - startTime;
        resolve({
          success: false,
          output: err.message,
          exitCode: 1,
          durationMs,
        });
      });
    });
  },

  async listModels(): Promise<Model[]> {
    return new Promise((resolve) => {
      let stdout = "";

      const proc = spawn("agent", ["models"], {
        stdio: ["inherit", "pipe", "pipe"],
      });

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(parseModelsOutput(stdout));
        } else {
          // Return fallback models if command fails
          resolve([
            { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
            { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
            { id: "gpt-4o", name: "GPT-4o" },
            { id: "o3", name: "O3" },
          ]);
        }
      });

      proc.on("error", () => {
        // Return fallback models if command fails
        resolve([
          { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
          { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
          { id: "gpt-4o", name: "GPT-4o" },
        ]);
      });
    });
  },

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn("which", ["agent"]);
      proc.on("close", (code) => {
        resolve(code === 0);
      });
      proc.on("error", () => {
        resolve(false);
      });
    });
  },
};
