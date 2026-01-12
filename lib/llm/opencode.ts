/**
 * OpenCode runtime implementation
 *
 * Executes prompts using the `opencode` CLI with support for:
 * - OLLAMA connection at localhost:11434 (default)
 * - Small models like Qwen and DeepSeek (8B range)
 * - Environment variables set at host level (.zshrc)
 *
 * OpenCode: https://opencode.ai/
 */

import { spawn } from "child_process";
import { createInterface } from "readline";
import type { LLMRuntime, Model, PromptOptions, PromptResult } from "./types.js";

/**
 * Default OLLAMA endpoint
 */
const DEFAULT_OLLAMA_HOST = "localhost:11434";

/**
 * Get OLLAMA host from environment or use default
 */
function getOllamaHost(): string {
  return process.env.OLLAMA_HOST || DEFAULT_OLLAMA_HOST;
}

/**
 * Fetch available models from OLLAMA API
 */
async function fetchOllamaModels(): Promise<Model[]> {
  const host = getOllamaHost();
  const url = `http://${host}/api/tags`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as { models?: Array<{ name: string; modified_at?: string }> };
    const models: Model[] = [];

    if (data.models && Array.isArray(data.models)) {
      for (const model of data.models) {
        models.push({
          id: model.name,
          name: model.name,
          description: model.modified_at
            ? `Modified: ${new Date(model.modified_at).toLocaleDateString()}`
            : undefined,
        });
      }
    }

    return models;
  } catch {
    return [];
  }
}

/**
 * Check if OLLAMA is running
 */
async function isOllamaRunning(): Promise<boolean> {
  const host = getOllamaHost();
  const url = `http://${host}/api/tags`;

  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * OpenCode runtime implementation
 */
export const opencodeRuntime: LLMRuntime = {
  name: "opencode",
  displayName: "OpenCode (OLLAMA)",
  supportsStreaming: true,
  supportsTokenTracking: false, // OLLAMA provides limited token tracking

  async runPrompt(prompt: string, options?: PromptOptions): Promise<PromptResult> {
    const startTime = Date.now();
    const args: string[] = [];

    // OpenCode CLI arguments
    if (options?.automated) {
      args.push("--non-interactive");
    }

    if (options?.model) {
      args.push("--model", options.model);
    }

    // Add the prompt
    args.push(prompt);

    return new Promise((resolve) => {
      let output = "";

      const proc = spawn("opencode", args, {
        stdio: ["inherit", "pipe", "pipe"],
        cwd: options?.workingDirectory,
        shell: false,
        env: {
          ...process.env,
          OLLAMA_HOST: getOllamaHost(),
        },
      });

      const rl = createInterface({ input: proc.stdout });

      rl.on("line", (line) => {
        output += line + "\n";
        if (options?.streamOutput) {
          console.log(line);
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
    // Try to fetch from OLLAMA first
    const ollamaModels = await fetchOllamaModels();
    if (ollamaModels.length > 0) {
      return ollamaModels;
    }

    // Return suggested small models if OLLAMA is not available
    return [
      {
        id: "qwen2.5:7b",
        name: "Qwen 2.5 7B",
        description: "Fast and efficient for code tasks",
      },
      {
        id: "deepseek-coder-v2:16b",
        name: "DeepSeek Coder V2 16B",
        description: "Strong code generation",
      },
      {
        id: "codellama:7b",
        name: "Code Llama 7B",
        description: "Meta's code-focused model",
      },
      {
        id: "mistral:7b",
        name: "Mistral 7B",
        description: "General purpose model",
      },
    ];
  },

  async isAvailable(): Promise<boolean> {
    // Check if opencode CLI is installed
    const hasOpencode = await new Promise<boolean>((resolve) => {
      const proc = spawn("which", ["opencode"]);
      proc.on("close", (code) => {
        resolve(code === 0);
      });
      proc.on("error", () => {
        resolve(false);
      });
    });

    if (!hasOpencode) {
      return false;
    }

    // Check if OLLAMA is running
    return await isOllamaRunning();
  },
};

/**
 * Get the current OLLAMA host configuration
 */
export function getOllamaHostConfig(): string {
  return getOllamaHost();
}
