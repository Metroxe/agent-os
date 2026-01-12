/**
 * Git workflow type definitions
 *
 * Provides:
 * - BranchConfig: Track branch state during workflows
 * - CommitOptions: Options for committing changes
 * - PROptions: Options for creating pull requests
 */

/**
 * Branch configuration for tracking state during git workflows
 * Pattern: useBranch + branchName (no dates) + originalBranch
 */
export interface BranchConfig {
  /** Whether to use/create a dedicated branch for this workflow */
  useBranch: boolean;
  /** Name of the implementation branch (no dates in name) */
  branchName: string;
  /** Original branch to return to or base PR against */
  originalBranch: string;
}

/**
 * Commit prefix types for conventional commits
 */
export type CommitPrefix =
  | "chore"
  | "feat"
  | "fix"
  | "docs"
  | "style"
  | "refactor"
  | "test"
  | "perf";

/**
 * Options for committing changes
 */
export interface CommitOptions {
  /** Commit message */
  message: string;
  /** Prefix for conventional commits (chore:, feat:, etc.) */
  prefix: CommitPrefix;
  /** Skip git hooks (--no-verify) - use sparingly */
  skipHooks?: boolean;
}

/**
 * Options for creating a pull request
 */
export interface PROptions {
  /** PR title */
  title: string;
  /** PR body/description */
  body: string;
  /** Base branch to merge into (default: from BranchConfig.originalBranch) */
  base?: string;
  /** Labels to add to the PR */
  labels?: string[];
  /** Draft PR */
  draft?: boolean;
}

/**
 * Result from creating a pull request
 */
export interface PRResult {
  /** URL of the created PR */
  url: string;
  /** PR number */
  number: number;
  /** Whether the PR already existed */
  alreadyExists: boolean;
}

/**
 * Result from checking uncommitted changes
 */
export interface UncommittedChangesResult {
  /** Whether there are uncommitted changes */
  hasChanges: boolean;
  /** Whether there are staged changes */
  hasStaged: boolean;
  /** Whether there are unstaged changes */
  hasUnstaged: boolean;
}

/**
 * Options for creating a branch
 */
export interface CreateBranchOptions {
  /** Branch name to create */
  name: string;
  /** Base branch to create from (default: main) */
  from?: string;
  /** Switch to main first before creating (recommended) */
  switchToBaseFirst?: boolean;
}
