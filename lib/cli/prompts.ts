/**
 * Interactive prompt utilities using Inquirer.js
 *
 * Provides:
 * - Menu selection prompts
 * - Search/autocomplete prompts
 * - Confirmation prompts
 * - Text input prompts
 * - Headless mode support for automated scripts
 */

import { confirm, input, search, select } from "@inquirer/prompts";

/**
 * Check if running in headless mode
 * Headless mode is enabled via HEADLESS=1 environment variable
 */
export function isHeadless(): boolean {
  return process.env.HEADLESS === "1" || process.env.HEADLESS === "true";
}

/**
 * Options for menu selection prompt
 */
export interface MenuChoice<T> {
  /** Display name for the choice */
  name: string;
  /** Value returned when selected */
  value: T;
  /** Optional description shown below the choice */
  description?: string;
}

/**
 * Options for menu prompt
 */
export interface MenuOptions<T> {
  /** Question to display */
  message: string;
  /** List of choices */
  choices: MenuChoice<T>[];
  /** Default value to use in headless mode or as initial selection */
  defaultValue?: T;
}

/**
 * Display a menu selection prompt
 * In headless mode, returns the default value or first choice
 */
export async function menu<T>(options: MenuOptions<T>): Promise<T> {
  if (isHeadless()) {
    if (options.defaultValue !== undefined) {
      return options.defaultValue;
    }
    // Return first choice if no default
    return options.choices[0]?.value as T;
  }

  return await select({
    message: options.message,
    choices: options.choices,
    default: options.defaultValue,
  });
}

/**
 * Options for search prompt
 */
export interface SearchOptions<T> {
  /** Question to display */
  message: string;
  /** Function that returns filtered choices based on input */
  source: (term: string) => Promise<MenuChoice<T>[]> | MenuChoice<T>[];
  /** Default value to use in headless mode */
  defaultValue?: T;
}

/**
 * Display a search/autocomplete prompt
 * In headless mode, returns the default value
 */
export async function searchPrompt<T>(options: SearchOptions<T>): Promise<T> {
  if (isHeadless()) {
    if (options.defaultValue !== undefined) {
      return options.defaultValue;
    }
    // Get first result from source with empty search
    const results = await options.source("");
    return results[0]?.value as T;
  }

  return await search({
    message: options.message,
    source: async (term) => {
      const results = await options.source(term || "");
      return results;
    },
  });
}

/**
 * Options for confirmation prompt
 */
export interface ConfirmOptions {
  /** Question to display */
  message: string;
  /** Default value (default: false) */
  defaultValue?: boolean;
}

/**
 * Display a confirmation prompt (yes/no)
 * In headless mode, returns the default value
 */
export async function confirmPrompt(options: ConfirmOptions): Promise<boolean> {
  if (isHeadless()) {
    return options.defaultValue ?? false;
  }

  return await confirm({
    message: options.message,
    default: options.defaultValue,
  });
}

/**
 * Options for text input prompt
 */
export interface TextOptions {
  /** Question to display */
  message: string;
  /** Default value */
  defaultValue?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Validation function (return true if valid, string error message if invalid) */
  validate?: (value: string) => boolean | string | Promise<boolean | string>;
}

/**
 * Display a text input prompt
 * In headless mode, returns the default value or empty string
 */
export async function text(options: TextOptions): Promise<string> {
  if (isHeadless()) {
    return options.defaultValue ?? "";
  }

  return await input({
    message: options.message,
    default: options.defaultValue,
    validate: options.validate,
  });
}

/**
 * Options for number input prompt
 */
export interface NumberOptions {
  /** Question to display */
  message: string;
  /** Default value */
  defaultValue?: number;
  /** Minimum allowed value */
  min?: number;
  /** Maximum allowed value */
  max?: number;
}

/**
 * Display a number input prompt
 * In headless mode, returns the default value or 0
 */
export async function number(options: NumberOptions): Promise<number> {
  if (isHeadless()) {
    return options.defaultValue ?? 0;
  }

  const result = await input({
    message: options.message,
    default: options.defaultValue?.toString(),
    validate: (value) => {
      const num = parseFloat(value);
      if (isNaN(num)) {
        return "Please enter a valid number";
      }
      if (options.min !== undefined && num < options.min) {
        return `Value must be at least ${options.min}`;
      }
      if (options.max !== undefined && num > options.max) {
        return `Value must be at most ${options.max}`;
      }
      return true;
    },
  });

  return parseFloat(result);
}
