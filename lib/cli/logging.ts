/**
 * Logging utilities for CLI scripts
 *
 * Provides colored console output with log levels:
 * - debug: Gray output for verbose information
 * - info: Default output for general information
 * - warn: Yellow output for warnings
 * - error: Red output for errors
 *
 * Features:
 * - Optional timestamps
 * - Human-readable output only (no JSON)
 * - Configurable log level filtering
 */

import chalk from "chalk";

/**
 * Log levels in order of severity
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Configuration options for the logger
 */
export interface LoggerOptions {
  /** Minimum log level to display (default: "info") */
  level?: LogLevel;
  /** Whether to show timestamps (default: false) */
  timestamps?: boolean;
}

/**
 * Global logger configuration
 */
let globalOptions: LoggerOptions = {
  level: "info",
  timestamps: false,
};

/**
 * Log level priorities for filtering
 */
const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Configure global logger options
 */
export function configureLogger(options: LoggerOptions): void {
  globalOptions = { ...globalOptions, ...options };
}

/**
 * Get current logger options
 */
export function getLoggerOptions(): LoggerOptions {
  return { ...globalOptions };
}

/**
 * Format timestamp for log output
 */
function formatTimestamp(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Check if a log level should be displayed based on current configuration
 */
function shouldLog(level: LogLevel): boolean {
  const currentLevel = globalOptions.level || "info";
  return levelPriority[level] >= levelPriority[currentLevel];
}

/**
 * Format a log message with optional timestamp
 */
function formatMessage(message: string): string {
  if (globalOptions.timestamps) {
    return `${chalk.dim(`[${formatTimestamp()}]`)} ${message}`;
  }
  return message;
}

/**
 * Log a debug message (gray)
 * Used for verbose information during development
 */
export function debug(message: string): void {
  if (shouldLog("debug")) {
    console.log(formatMessage(chalk.gray(message)));
  }
}

/**
 * Log an info message (default color)
 * Used for general information
 */
export function info(message: string): void {
  if (shouldLog("info")) {
    console.log(formatMessage(message));
  }
}

/**
 * Log a warning message (yellow)
 * Used for non-critical issues that should be noted
 */
export function warn(message: string): void {
  if (shouldLog("warn")) {
    console.log(formatMessage(chalk.yellow(message)));
  }
}

/**
 * Log an error message (red)
 * Used for errors that need attention
 */
export function error(message: string): void {
  if (shouldLog("error")) {
    console.log(formatMessage(chalk.red(message)));
  }
}

/**
 * Log a section header (emphasized)
 * Used to visually separate sections of output
 */
export function section(title: string): void {
  const line = "============================================";
  console.log("");
  console.log(line);
  console.log(`  ${title}`);
  console.log(line);
  console.log("");
}

/**
 * Log a success message (green)
 * Used for successful operations
 */
export function success(message: string): void {
  console.log(formatMessage(chalk.green(message)));
}

/**
 * Log a dimmed message
 * Used for less important context
 */
export function dim(message: string): void {
  console.log(formatMessage(chalk.dim(message)));
}
