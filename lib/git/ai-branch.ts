/**
 * AI-Driven Git Branch Management
 *
 * Provides:
 * - Branch naming utilities for impl/<spec-name>-N convention
 * - Detection of existing implementation branches
 * - Prompt templates for AI-driven git operations
 */

/**
 * Generate a branch name for an implementation attempt
 * Convention: impl/<spec-name>-1, impl/<spec-name>-2, etc.
 */
export function generateBranchName(specName: string, attempt: number = 1): string {
  if (!specName) {
    throw new Error("Spec name is required");
  }
  if (attempt < 1) {
    throw new Error("Attempt number must be >= 1");
  }
  return `impl/${specName}-${attempt}`;
}

/**
 * Parse an implementation branch name to extract spec name and attempt number
 * Returns null if the branch name doesn't match the impl/<spec-name>-N pattern
 */
export function parseBranchName(branchName: string): { specName: string; attempt: number } | null {
  if (!branchName) {
    return null;
  }

  const match = branchName.match(/^impl\/(.+)-(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    specName: match[1],
    attempt: parseInt(match[2], 10),
  };
}

/**
 * Check if a branch name follows the implementation branch convention
 */
export function isImplementationBranch(branchName: string): boolean {
  return parseBranchName(branchName) !== null;
}

/**
 * Find the next available branch number for a spec
 * Given existing branches, returns the next attempt number
 */
export function getNextBranchNumber(existingBranches: string[], specName: string): number {
  let maxAttempt = 0;

  for (const branch of existingBranches) {
    const parsed = parseBranchName(branch);
    if (parsed && parsed.specName === specName) {
      maxAttempt = Math.max(maxAttempt, parsed.attempt);
    }
  }

  return maxAttempt + 1;
}

/**
 * Filter branches to find all implementation branches for a specific spec
 */
export function findSpecBranches(branches: string[], specName: string): string[] {
  return branches.filter((branch) => {
    const parsed = parseBranchName(branch);
    return parsed && parsed.specName === specName;
  });
}

// === AI Prompt Templates ===

/**
 * Generate the AI prompt for initial branch setup
 * This prompt asks the AI to evaluate git state and create/select an appropriate branch
 */
export function generateBranchSetupPrompt(specFolder: string): string {
  return `You are setting up a git branch for implementing the spec: ${specFolder}

## Task

Evaluate the current git state and help set up an appropriate implementation branch.

## Instructions

1. First, check the current git branch:
   - Run: git branch --show-current

2. Check if this is already an implementation branch for this spec:
   - Implementation branches follow pattern: impl/${specFolder}-N (where N is 1, 2, 3, etc.)
   - If you're already on impl/${specFolder}-N, ask: "You're already on branch impl/${specFolder}-N. Continue here, or create a new branch?"

3. If NOT on an implementation branch, check for existing implementation branches:
   - Run: git branch --list 'impl/${specFolder}-*'
   - If existing branches found, evaluate their state

4. Determine the appropriate branch:
   - If no existing branches: suggest creating impl/${specFolder}-1
   - If existing branches exist but have issues: suggest creating the next numbered branch
   - Issues include: inconsistent commits, missing spec files, or dirty state

5. Create or switch to the branch:
   - If creating new: git checkout main && git pull --ff-only origin main && git checkout -b impl/${specFolder}-N
   - If switching to existing: git checkout impl/${specFolder}-N

6. Verify the spec files exist:
   - Check that agent-os/specs/${specFolder}/planning/requirements.md exists
   - If not, report an error

## Output

Report your decision and actions taken. If user input was needed, indicate what was chosen.`;
}

/**
 * Generate the AI prompt for handling commit operations
 * This prompt handles "nothing to commit" gracefully
 */
export function generateCommitPrompt(message: string, prefix: string = "chore"): string {
  return `You need to commit changes with the following details:
- Message: ${message}
- Prefix: ${prefix}

## Instructions

1. First, check if there are any changes to commit:
   - Run: git status --porcelain
   
2. If there are NO changes (empty output):
   - Report: "Nothing to commit - skipping commit step"
   - Do NOT attempt to create an empty commit
   - This is normal and expected, continue silently

3. If there ARE changes:
   - Stage all changes: git add -A
   - Commit with message: git commit -m "${prefix}: ${message}" --no-verify

## Output

Report the result briefly:
- "Committed: ${prefix}: ${message}" (if changes were committed)
- "Nothing to commit - skipping" (if no changes)`;
}

/**
 * Generate the AI prompt for creating a PR at the end of implementation
 * Includes handling of implementation-log.txt
 */
export function generatePRCreationPrompt(
  specFolder: string,
  baseBranch: string = "main"
): string {
  return `You are creating a Pull Request for the implementation of spec: ${specFolder}

## Task

Create a PR with a comprehensive summary, including the implementation log.

## Instructions

1. First, check if we're on an implementation branch:
   - Run: git branch --show-current
   - If not on impl/${specFolder}-N branch, report an error

2. Check if there are uncommitted changes and commit them:
   - Run: git status --porcelain
   - If changes exist: git add -A && git commit -m "chore: finalize implementation for ${specFolder}" --no-verify

3. Push the branch:
   - Run: git push -u origin HEAD

4. Read the implementation log (if it exists):
   - Check if agent-os/specs/${specFolder}/implementation/implementation-log.txt exists
   - If it exists, read its contents for the PR body

5. Create the PR:
   - Use: gh pr create --title "feat: ${specFolder}" --base ${baseBranch} --body "PR_BODY"
   - The PR body should include:
     - ## Summary: Brief description of what was implemented
     - ## Implementation Log: Contents of implementation-log.txt (in a details/summary block)
     - ## Review Checklist: Standard checklist items

6. Remove the implementation-log.txt from the repo (after PR is created):
   - Run: git rm agent-os/specs/${specFolder}/implementation/implementation-log.txt
   - Commit: git commit -m "chore: remove implementation log (contents in PR)" --no-verify
   - Push: git push

## Output

Report the PR URL when complete. If there were any issues, report them clearly.`;
}

/**
 * Generate prompt for evaluating branch state
 * Used to determine current implementation step/phase
 */
export function generateBranchStateEvaluationPrompt(specFolder: string): string {
  return `Evaluate the implementation state for spec: ${specFolder}

## Task

Determine what phase of implementation we're at and if the branch state is consistent.

## Check the following

1. Current branch:
   - Run: git branch --show-current
   - Is it an implementation branch (impl/${specFolder}-N)?

2. Spec files existence:
   - Check: agent-os/specs/${specFolder}/planning/requirements.md (required for shape spec)
   - Check: agent-os/specs/${specFolder}/spec.md (indicates Phase 1 complete)
   - Check: agent-os/specs/${specFolder}/tasks.md (indicates Phase 2 complete)
   - Check: agent-os/specs/${specFolder}/implementation/prompts/ (indicates Phase 3 complete)

3. Commit history on this branch:
   - Run: git log --oneline main..HEAD (commits since diverging from main)
   - Do the commits make sense for the phase we're at?

## Report

- Current phase: 1 (write spec), 2 (create tasks), 3 (generate prompts), or 4 (implementing)
- Branch state: consistent or inconsistent
- If inconsistent, explain why and recommend creating a new branch`;
}
