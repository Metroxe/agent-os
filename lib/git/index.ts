/**
 * Git workflow utilities
 *
 * Provides:
 * - GitWorkflow class for branch-to-PR flow
 * - BranchConfig pattern
 * - Commit prefixes (chore:, feat:)
 * - PR creation with gh CLI
 */

// Export types
export type {
  BranchConfig,
  CommitOptions,
  CommitPrefix,
  CreateBranchOptions,
  PROptions,
  PRResult,
  UncommittedChangesResult,
} from "./types.js";

// Export GitWorkflow class and default instance
export { GitWorkflow, gitWorkflow } from "./workflow.js";

// Module loaded marker for testing
export const GIT_MODULE_LOADED = true;
