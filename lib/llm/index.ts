/**
 * LLM runtime abstraction
 *
 * Provides:
 * - LLMRuntime interface for Claude Code, Cursor, and OpenCode
 * - Runtime selection prompt
 * - Model selection capability
 * - Unified interface for executing prompts
 */

import { menu } from "../cli/index.js";
import { claudeRuntime } from "./claude.js";
import { cursorRuntime } from "./cursor.js";
import { opencodeRuntime, getOllamaHostConfig } from "./opencode.js";
import type { LLMRuntime, Model, RuntimeName } from "./types.js";

// Re-export types
export type {
  LLMRuntime,
  Model,
  PromptOptions,
  PromptResult,
  RuntimeName,
  TokenUsage,
} from "./types.js";

// Export individual runtimes
export { claudeRuntime } from "./claude.js";
export { cursorRuntime } from "./cursor.js";
export { opencodeRuntime, getOllamaHostConfig } from "./opencode.js";

// Module loaded marker for testing
export const LLM_MODULE_LOADED = true;

/**
 * Map of runtime names to implementations
 */
const runtimes: Record<RuntimeName, LLMRuntime> = {
  claude: claudeRuntime,
  cursor: cursorRuntime,
  opencode: opencodeRuntime,
};

/**
 * Get all available runtimes
 */
export function getAllRuntimes(): LLMRuntime[] {
  return Object.values(runtimes);
}

/**
 * Get a runtime by name
 */
export function getRuntime(name: RuntimeName): LLMRuntime {
  return runtimes[name];
}

/**
 * Options for runtime selection
 */
export interface SelectRuntimeOptions {
  /** Default runtime to pre-select */
  defaultRuntime?: RuntimeName;
  /** Only show runtimes that are available */
  onlyAvailable?: boolean;
}

/**
 * Interactively select an LLM runtime
 * Uses the CLI menu prompt to let the user choose
 */
export async function selectRuntime(
  options?: SelectRuntimeOptions
): Promise<LLMRuntime> {
  let choices = getAllRuntimes();

  // Filter to only available runtimes if requested
  if (options?.onlyAvailable) {
    const availabilityChecks = await Promise.all(
      choices.map(async (runtime) => ({
        runtime,
        available: await runtime.isAvailable(),
      }))
    );
    choices = availabilityChecks
      .filter((check) => check.available)
      .map((check) => check.runtime);

    if (choices.length === 0) {
      throw new Error("No LLM runtimes are available on this system");
    }
  }

  const selectedName = await menu<RuntimeName>({
    message: "Select LLM runtime:",
    choices: choices.map((runtime) => ({
      name: runtime.displayName,
      value: runtime.name,
      description: runtime.supportsTokenTracking
        ? "Supports token tracking"
        : undefined,
    })),
    defaultValue: options?.defaultRuntime,
  });

  return getRuntime(selectedName);
}

/**
 * Options for model selection
 */
export interface SelectModelOptions {
  /** Default model to pre-select */
  defaultModel?: string;
  /** Whether to include a "Default" option */
  includeDefault?: boolean;
}

/**
 * Interactively select a model for a given runtime
 * Uses the CLI menu prompt to let the user choose
 */
export async function selectModel(
  runtime: LLMRuntime,
  options?: SelectModelOptions
): Promise<string | undefined> {
  const models = await runtime.listModels();

  const choices: Array<{ name: string; value: string | undefined; description?: string }> = [];

  // Add default option if requested
  if (options?.includeDefault !== false) {
    choices.push({
      name: "Default (use CLI default)",
      value: undefined,
      description: "Let the CLI choose the best model",
    });
  }

  // Add available models
  for (const model of models) {
    choices.push({
      name: model.name,
      value: model.id,
      description: model.description,
    });
  }

  const selectedModel = await menu<string | undefined>({
    message: `Select model for ${runtime.displayName}:`,
    choices,
    defaultValue: options?.defaultModel,
  });

  return selectedModel;
}

/**
 * Get the default runtime (Claude Code)
 */
export function getDefaultRuntime(): LLMRuntime {
  return claudeRuntime;
}

/**
 * Check which runtimes are available on this system
 */
export async function getAvailableRuntimes(): Promise<LLMRuntime[]> {
  const allRuntimes = getAllRuntimes();
  const availabilityChecks = await Promise.all(
    allRuntimes.map(async (runtime) => ({
      runtime,
      available: await runtime.isAvailable(),
    }))
  );

  return availabilityChecks
    .filter((check) => check.available)
    .map((check) => check.runtime);
}
