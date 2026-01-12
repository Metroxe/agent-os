/**
 * CLI and logging utilities
 *
 * Provides:
 * - Colored console output with chalk
 * - Log levels: debug, info, warn, error
 * - Interactive prompts with Inquirer.js
 * - Headless mode support
 */

// Re-export all logging functions and types
export {
  configureLogger,
  debug,
  dim,
  error,
  getLoggerOptions,
  info,
  section,
  success,
  warn,
} from "./logging.js";
export type { LoggerOptions, LogLevel } from "./logging.js";

// Re-export all prompt functions and types
export {
  confirmPrompt,
  isHeadless,
  menu,
  number,
  searchPrompt,
  text,
} from "./prompts.js";
export type {
  ConfirmOptions,
  MenuChoice,
  MenuOptions,
  NumberOptions,
  SearchOptions,
  TextOptions,
} from "./prompts.js";

// Module loaded marker for testing
export const CLI_MODULE_LOADED = true;
