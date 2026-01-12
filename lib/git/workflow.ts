/**
 * Git workflow class for branch-to-PR flows
 *
 * Provides high-level methods for:
 * - Checking uncommitted changes
 * - Branch creation from main
 * - Committing with prefixes (chore:, feat:)
 * - Pushing and PR creation with gh CLI
 */

import { spawn } from "child_process";
import { confirmPrompt, isHeadless, text } from "../cli/index.js";
import type {
  BranchConfig,
  CommitOptions,
  CommitPrefix,
  CreateBranchOptions,
  PROptions,
  PRResult,
  UncommittedChangesResult,
} from "./types.js";

/**
 * Execute a git command and return the output
 */
async function execGit(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, { stdio: ["inherit", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`git ${args.join(" ")} failed: ${stderr || stdout}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to run git: ${err.message}`));
    });
  });
}

/**
 * Execute a gh CLI command and return the output
 */
async function execGh(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("gh", args, { stdio: ["inherit", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`gh ${args.join(" ")} failed: ${stderr || stdout}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to run gh: ${err.message}`));
    });
  });
}

/**
 * Execute a command silently (no output capture, just exit code)
 */
async function execSilent(
  cmd: string,
  args: string[]
): Promise<{ success: boolean }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["inherit", "pipe", "pipe"] });

    proc.on("close", (code) => {
      resolve({ success: code === 0 });
    });

    proc.on("error", () => {
      resolve({ success: false });
    });
  });
}

/**
 * GitWorkflow class for managing branch-to-PR workflows
 *
 * Tracks state with BranchConfig pattern and provides methods for:
 * - Checking uncommitted changes
 * - Prompting for branch creation
 * - Creating branches from main
 * - Committing with prefixes
 * - Pushing and creating PRs
 */
export class GitWorkflow {
  private config: BranchConfig;

  constructor(config?: Partial<BranchConfig>) {
    this.config = {
      useBranch: config?.useBranch ?? true,
      branchName: config?.branchName ?? "",
      originalBranch: config?.originalBranch ?? "main",
    };
  }

  /**
   * Get the current branch configuration
   */
  getConfig(): BranchConfig {
    return { ...this.config };
  }

  /**
   * Update the branch configuration
   */
  setConfig(config: Partial<BranchConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check for uncommitted changes in the working directory
   */
  async checkUncommittedChanges(): Promise<UncommittedChangesResult> {
    // Stage all changes to detect them
    await execSilent("git", ["add", "-A"]);

    // Check for staged changes
    const stagedResult = await execSilent("git", [
      "diff",
      "--cached",
      "--quiet",
    ]);
    const hasStaged = !stagedResult.success;

    // Check for unstaged changes
    const unstagedResult = await execSilent("git", ["diff", "--quiet"]);
    const hasUnstaged = !unstagedResult.success;

    // Reset staging area to not affect user's state
    if (hasStaged) {
      await execSilent("git", ["reset", "HEAD"]);
    }

    return {
      hasChanges: hasStaged || hasUnstaged,
      hasStaged,
      hasUnstaged,
    };
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<string> {
    return await execGit(["branch", "--show-current"]);
  }

  /**
   * Check if a branch exists locally
   */
  async branchExists(branchName: string): Promise<boolean> {
    const result = await execSilent("git", [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${branchName}`,
    ]);
    return result.success;
  }

  /**
   * Prompt user about branch creation
   * Returns true if user wants to create a new branch
   */
  async promptBranchCreation(
    suggestedName?: string
  ): Promise<{ create: boolean; branchName: string }> {
    const currentBranch = await this.getCurrentBranch();

    // If already on the suggested branch, just use it
    if (suggestedName && currentBranch === suggestedName) {
      this.config.useBranch = true;
      this.config.branchName = suggestedName;
      this.config.originalBranch = "main";
      return { create: false, branchName: suggestedName };
    }

    // In headless mode, use default behavior (create branch if name provided)
    if (isHeadless()) {
      if (suggestedName) {
        this.config.useBranch = true;
        this.config.branchName = suggestedName;
        this.config.originalBranch = currentBranch;
        return { create: true, branchName: suggestedName };
      }
      return { create: false, branchName: currentBranch };
    }

    const create = await confirmPrompt({
      message: "Create a new implementation branch?",
      defaultValue: true,
    });

    if (!create) {
      this.config.useBranch = false;
      this.config.branchName = currentBranch;
      this.config.originalBranch = currentBranch;
      return { create: false, branchName: currentBranch };
    }

    let branchName = suggestedName || "";
    if (!branchName) {
      branchName = await text({
        message: "Branch name:",
        defaultValue: suggestedName,
        validate: (value) => {
          if (!value.trim()) {
            return "Branch name is required";
          }
          if (!/^[a-zA-Z0-9/_-]+$/.test(value)) {
            return "Branch name can only contain letters, numbers, /, -, _";
          }
          return true;
        },
      });
    }

    this.config.useBranch = true;
    this.config.branchName = branchName;
    this.config.originalBranch = currentBranch;

    return { create: true, branchName };
  }

  /**
   * Create a new branch from main (or specified base)
   * Follows best practice: always create implementation branches from main
   */
  async createBranch(options: CreateBranchOptions): Promise<void> {
    const { name, from = "main", switchToBaseFirst = true } = options;

    // Check if branch already exists
    if (await this.branchExists(name)) {
      // Just switch to it
      await execGit(["checkout", name]);
      this.config.branchName = name;
      return;
    }

    // Switch to base branch first if requested (recommended)
    if (switchToBaseFirst) {
      const currentBranch = await this.getCurrentBranch();
      if (currentBranch !== from) {
        await execGit(["checkout", from]);
        // Try to pull latest
        try {
          await execGit(["pull", "--ff-only", "origin", from]);
        } catch {
          // Ignore pull failures (might be offline)
        }
      }
    }

    // Create and switch to new branch
    await execGit(["checkout", "-b", name]);
    this.config.branchName = name;
    this.config.originalBranch = from;
  }

  /**
   * Commit staged changes with a prefix (chore:, feat:, etc.)
   * Only commits if useBranch is true and there are changes
   */
  async commitStep(
    message: string,
    prefix: CommitPrefix = "chore"
  ): Promise<boolean> {
    if (!this.config.useBranch) {
      return false;
    }

    // Stage all changes
    await execGit(["add", "-A"]);

    // Check if there are staged changes
    const result = await execSilent("git", ["diff", "--cached", "--quiet"]);
    if (result.success) {
      // No changes to commit
      return false;
    }

    // Commit with prefix
    const fullMessage = `${prefix}: ${message}`;
    await execGit(["commit", "-m", fullMessage, "--no-verify"]);

    return true;
  }

  /**
   * Commit with full options
   */
  async commit(options: CommitOptions): Promise<boolean> {
    if (!this.config.useBranch) {
      return false;
    }

    // Stage all changes
    await execGit(["add", "-A"]);

    // Check if there are staged changes
    const result = await execSilent("git", ["diff", "--cached", "--quiet"]);
    if (result.success) {
      return false;
    }

    // Build commit command
    const fullMessage = `${options.prefix}: ${options.message}`;
    const args = ["commit", "-m", fullMessage];

    if (options.skipHooks) {
      args.push("--no-verify");
    }

    await execGit(args);
    return true;
  }

  /**
   * Push current branch to remote
   */
  async push(setUpstream = true): Promise<void> {
    if (!this.config.useBranch || !this.config.branchName) {
      return;
    }

    const args = ["push"];
    if (setUpstream) {
      args.push("-u", "origin", this.config.branchName);
    }

    try {
      await execGit(args);
    } catch {
      // If normal push fails, try force-with-lease (safe for feature branches)
      await execGit(["push", "--force-with-lease", "-u", "origin", this.config.branchName]);
    }
  }

  /**
   * Check if gh CLI is available and authenticated
   */
  async isGhAvailable(): Promise<boolean> {
    const whichResult = await execSilent("which", ["gh"]);
    if (!whichResult.success) {
      return false;
    }

    const authResult = await execSilent("gh", ["auth", "status"]);
    return authResult.success;
  }

  /**
   * Check if a PR already exists for the current branch
   */
  async getExistingPR(): Promise<PRResult | null> {
    if (!this.config.branchName) {
      return null;
    }

    try {
      const result = await execGh([
        "pr",
        "list",
        "--head",
        this.config.branchName,
        "--json",
        "number,url",
        "--jq",
        ".[0]",
      ]);

      if (!result) {
        return null;
      }

      const pr = JSON.parse(result);
      if (pr && pr.number) {
        return {
          number: pr.number,
          url: pr.url,
          alreadyExists: true,
        };
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Create a pull request using gh CLI
   */
  async createPR(options: PROptions): Promise<PRResult> {
    if (!this.config.useBranch) {
      throw new Error("Cannot create PR: not using a dedicated branch");
    }

    // Check for existing PR first
    const existingPR = await this.getExistingPR();
    if (existingPR) {
      return existingPR;
    }

    const base = options.base || this.config.originalBranch || "main";

    // Build gh pr create command
    const args = [
      "pr",
      "create",
      "--title",
      options.title,
      "--body",
      options.body,
      "--base",
      base,
    ];

    if (options.labels && options.labels.length > 0) {
      args.push("--label", options.labels.join(","));
    }

    if (options.draft) {
      args.push("--draft");
    }

    const result = await execGh(args);

    // Parse PR URL from output
    const prUrl = result.trim();
    const prMatch = prUrl.match(/\/pull\/(\d+)/);
    const prNumber = prMatch ? parseInt(prMatch[1], 10) : 0;

    return {
      url: prUrl,
      number: prNumber,
      alreadyExists: false,
    };
  }

  /**
   * Add a comment to a PR
   */
  async addPRComment(prNumber: number, body: string): Promise<void> {
    await execGh(["pr", "comment", String(prNumber), "--body", body]);
  }

  /**
   * Discard uncommitted changes (reset working directory)
   */
  async discardChanges(): Promise<void> {
    await execSilent("git", ["reset", "HEAD"]);
    await execGit(["checkout", "--", "."]);
    await execGit(["clean", "-fd"]);
  }

  /**
   * Switch to a branch
   */
  async checkout(branchName: string): Promise<void> {
    await execGit(["checkout", branchName]);
  }
}

// Export a default instance for simple usage
export const gitWorkflow = new GitWorkflow();
