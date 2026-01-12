/**
 * 1Password CLI wrapper
 *
 * Provides:
 * - getItem() function to retrieve items via `op` CLI
 * - Biometric auth support (no session management)
 * - JSON parsing of item data
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a field in a 1Password item.
 * Fields can have different structures depending on the item category.
 */
export interface OpField {
  id: string;
  type: string;
  purpose?: string;
  label?: string;
  value?: string;
  reference?: string;
  section?: {
    id: string;
    label?: string;
  };
  /** Additional properties that may vary by field type */
  [key: string]: unknown;
}

/**
 * Represents a URL associated with a 1Password item.
 */
export interface OpUrl {
  primary?: boolean;
  href: string;
  label?: string;
}

/**
 * Represents a file attached to a 1Password item.
 */
export interface OpFile {
  id: string;
  name: string;
  size: number;
  content_path?: string;
}

/**
 * Represents a section within a 1Password item.
 */
export interface OpSection {
  id: string;
  label?: string;
}

/**
 * Represents a 1Password item.
 * This is a flexible type that can represent different item categories
 * (LOGIN, API_CREDENTIAL, SECURE_NOTE, etc.)
 *
 * The AI can process different item structures freehand since items
 * have varying structures depending on their category.
 */
export interface OpItem {
  /** Unique identifier for the item */
  id: string;
  /** Display title of the item */
  title: string;
  /** Item category (LOGIN, API_CREDENTIAL, SECURE_NOTE, etc.) */
  category: string;
  /** Tags/labels associated with the item */
  tags?: string[];
  /** Fields containing the item's data */
  fields: OpField[];
  /** Sections for organizing fields */
  sections?: OpSection[];
  /** URLs associated with the item (common for LOGIN items) */
  urls?: OpUrl[];
  /** Files attached to the item */
  files?: OpFile[];
  /** Vault the item belongs to */
  vault?: {
    id: string;
    name: string;
  };
  /** When the item was created */
  created_at?: string;
  /** When the item was last updated */
  updated_at?: string;
  /** Additional properties that may vary by item category */
  [key: string]: unknown;
}

/**
 * Options for the getItem function.
 */
export interface GetItemOptions {
  /** Optional vault name to restrict the search scope */
  vault?: string;
}

/**
 * Custom error class for 1Password CLI errors.
 */
export class OnePasswordError extends Error {
  /** Error code for programmatic handling */
  readonly code: "ITEM_NOT_FOUND" | "CLI_ERROR" | "PARSE_ERROR";
  /** Raw stderr output from the op CLI */
  readonly stderr: string;
  /** Exit code from the op CLI */
  readonly exitCode: number;

  constructor(
    message: string,
    options: {
      code: "ITEM_NOT_FOUND" | "CLI_ERROR" | "PARSE_ERROR";
      stderr: string;
      exitCode: number;
    }
  ) {
    super(message);
    this.name = "OnePasswordError";
    this.code = options.code;
    this.stderr = options.stderr;
    this.exitCode = options.exitCode;
  }
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Retrieves an item from 1Password using the `op` CLI.
 *
 * This function executes `op item get <item-name> --format json` and parses
 * the JSON response. Biometric authentication is handled automatically by
 * the 1Password desktop app integration - no session management is needed.
 *
 * @param itemName - The name or ID of the item to retrieve
 * @param options - Optional configuration
 * @param options.vault - Restrict the search to a specific vault
 * @returns The parsed 1Password item
 * @throws {OnePasswordError} If the item is not found or the CLI fails
 *
 * @example
 * ```typescript
 * // Get an item by name
 * const item = await getItem("GitHub Token");
 *
 * // Get an item from a specific vault
 * const workItem = await getItem("API Key", { vault: "Work" });
 *
 * // Access field values
 * const password = item.fields.find(f => f.purpose === "PASSWORD")?.value;
 * ```
 */
export async function getItem(
  itemName: string,
  options?: GetItemOptions
): Promise<OpItem> {
  // Build the command
  const command = ["op", "item", "get", itemName, "--format", "json"];

  // Add vault parameter if provided
  if (options?.vault) {
    command.push("--vault", options.vault);
  }

  // Execute the op CLI
  const proc = Bun.spawn(command, {
    stdout: "pipe",
    stderr: "pipe",
  });

  // Wait for process to complete and get output
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  // Handle errors
  if (exitCode !== 0) {
    const isNotFound =
      stderr.includes("isn't an item") ||
      stderr.includes("not found") ||
      stderr.includes("no item found");

    throw new OnePasswordError(
      isNotFound
        ? `1Password item not found: ${itemName}`
        : `1Password CLI error for item: ${itemName}`,
      {
        code: isNotFound ? "ITEM_NOT_FOUND" : "CLI_ERROR",
        stderr: stderr.trim(),
        exitCode,
      }
    );
  }

  // Parse JSON response
  try {
    const item = JSON.parse(stdout) as OpItem;
    return item;
  } catch (parseError) {
    throw new OnePasswordError(`Failed to parse 1Password response for: ${itemName}`, {
      code: "PARSE_ERROR",
      stderr: `Parse error: ${parseError}. Stdout: ${stdout}`,
      exitCode: 0,
    });
  }
}

// Module loaded marker for testing
export const ONEPASSWORD_MODULE_LOADED = true;
