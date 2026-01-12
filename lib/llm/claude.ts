/**
 * Claude Code runtime implementation
 *
 * Executes prompts using the `claude` CLI with support for:
 * - Streaming JSON output
 * - Token usage tracking
 * - Model selection
 * - Automated and interactive modes
 */

import { spawn } from "child_process";
import { createInterface } from "readline";
import type {
  LLMRuntime,
  Model,
  PromptOptions,
  PromptResult,
  TokenUsage,
} from "./types.js";

/**
 * Parse streaming JSON events from Claude CLI
 * Extracts token usage and cost information
 */
function parseStreamingOutput(jsonLines: string[]): {
  tokenUsage?: TokenUsage;
  costUsd?: number;
} {
  let tokenUsage: TokenUsage | undefined;
  let costUsd: number | undefined;

  for (const line of jsonLines) {
    try {
      const event = JSON.parse(line);
      if (event.type === "result" && event.usage) {
        tokenUsage = {
          inputTokens: event.usage.input_tokens || 0,
          outputTokens: event.usage.output_tokens || 0,
          cacheReadTokens: event.usage.cache_read_input_tokens || 0,
          cacheCreationTokens: event.usage.cache_creation_input_tokens || 0,
        };
        costUsd = event.total_cost_usd;
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  return { tokenUsage, costUsd };
}

/**
 * Claude Code runtime implementation
 */
export const claudeRuntime: LLMRuntime = {
  name: "claude",
  displayName: "Claude Code",
  supportsStreaming: true,
  supportsTokenTracking: true,

  async runPrompt(prompt: string, options?: PromptOptions): Promise<PromptResult> {
    const startTime = Date.now();
    const args: string[] = [];

    // Build command arguments
    if (options?.automated) {
      args.push("--dangerously-skip-permissions", "-p", "--verbose");
    }

    if (options?.model) {
      args.push("--model", options.model);
    }

    if (options?.automated) {
      args.push("--output-format", "stream-json");
    }

    args.push(prompt);

    return new Promise((resolve) => {
      let output = "";
      const jsonLines: string[] = [];

      const proc = spawn("claude", args, {
        stdio: ["inherit", "pipe", "pipe"],
        cwd: options?.workingDirectory,
        shell: false,
      });

      const rl = createInterface({ input: proc.stdout });

      rl.on("line", (line) => {
        jsonLines.push(line);
        if (options?.streamOutput) {
          // Parse and display streaming output
          try {
            const event = JSON.parse(line);
            if (event.type === "content_block_delta" && event.delta?.text) {
              process.stdout.write(event.delta.text);
              output += event.delta.text;
            } else if (
              event.type === "assistant" &&
              event.message?.content
            ) {
              for (const block of event.message.content) {
                if (block.type === "text" && block.text) {
                  console.log(block.text);
                  output += block.text + "\n";
                }
              }
            }
          } catch {
            // Not JSON, just capture it
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
        const { tokenUsage, costUsd } = parseStreamingOutput(jsonLines);

        resolve({
          success: exitCode === 0,
          output,
          exitCode,
          durationMs,
          tokenUsage,
          costUsd,
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
    // Claude Code CLI doesn't have a models list command
    // Return known models
    return [
      {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        description: "Balanced performance and cost",
      },
      {
        id: "claude-opus-4-20250514",
        name: "Claude Opus 4",
        description: "Most capable model",
      },
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        description: "Previous generation",
      },
    ];
  },

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn("which", ["claude"]);
      proc.on("close", (code) => {
        resolve(code === 0);
      });
      proc.on("error", () => {
        resolve(false);
      });
    });
  },
};
