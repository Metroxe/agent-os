/**
 * @agent-os/lib - Common TypeScript library for agent-os scripts
 *
 * This is the main entry point that re-exports all submodules.
 * Submodules can also be imported directly:
 *   - @agent-os/lib/cli
 *   - @agent-os/lib/1password
 *   - @agent-os/lib/llm
 *   - @agent-os/lib/git
 */

export * as cli from "./cli/index.js";
export * as onePassword from "./1password/index.js";
export * as llm from "./llm/index.js";
export * as git from "./git/index.js";
