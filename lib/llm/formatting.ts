/**
 * Shared tool formatting helpers for LLM runtimes
 *
 * Provides consistent formatting for:
 * - Tool use blocks (display tool calls with name and arguments)
 * - Tool result blocks (display execution results with truncation)
 *
 * Used by both Claude and Cursor runtimes for streaming output
 */

import chalk from "chalk";

/**
 * Format tool use for display
 * Extracts meaningful information from tool calls to show progress
 *
 * @param toolName - Name of the tool being called
 * @param toolInput - Tool input arguments (string or object)
 * @returns Formatted string describing the tool call
 */
export function formatToolUse(
  toolName: string,
  toolInput: string | Record<string, unknown>
): string {
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
        const pattern = (input.pattern || input.query || "") as string;
        const searchPath = (input.path || input.directory || ".") as string;
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
        const cmd = (input.command || "") as string;
        return `Running: ${cmd.substring(0, 50)}${cmd.length > 50 ? "..." : ""}`;
      case "WebSearch":
        return `Searching web: ${input.query || input.search_term || ""}`;
      case "TodoRead":
        return "Reading todo list";
      case "TodoWrite":
        return "Updating todo list";
      case "Task":
        const desc = (input.description || "") as string;
        return `Task: ${desc.substring(0, 40)}...`;
      default:
        // Try to extract something useful from the input
        const firstKey = Object.keys(input)[0];
        if (firstKey && typeof input[firstKey] === "string") {
          const val = input[firstKey] as string;
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
 * Format tool result for display (truncate if too long)
 * Shows a preview of the tool output with line-by-line formatting
 *
 * @param content - Tool result content (string or object)
 * @param maxLines - Maximum number of lines to show (default: 5)
 * @returns Formatted string with dimmed output and line prefixes
 */
export function formatToolResult(
  content: string | unknown,
  maxLines = 5
): string {
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
 * Format a tool call for inline display
 * Used during streaming to show what tool is being called
 *
 * @param toolName - Name of the tool
 * @param toolInput - Tool input arguments
 * @returns Formatted string with cyan color and arrow prefix
 */
export function formatToolCallInline(
  toolName: string,
  toolInput: string | Record<string, unknown>
): string {
  const description = formatToolUse(toolName, toolInput);
  return chalk.cyan(`  ➤ ${description}`);
}
