#!/bin/bash
# spec-to-implementation.sh
#
# One-shot script to take a shaped spec through to implementation with PR.
# Usage: ~/agent-os/scripts/spec-to-implementation.sh <spec-folder-name>
#
# Prerequisites:
#   - Run /shape-spec first to create the spec folder with requirements
#   - gh CLI installed and authenticated (gh auth login)

set -e

SPEC_INPUT="${1:-}"

if [ -z "$SPEC_INPUT" ]; then
  echo "Usage: spec-to-implementation.sh <spec-folder-name>"
  echo ""
  echo "Example: spec-to-implementation.sh 2026-01-08-my-feature"
  echo "     or: spec-to-implementation.sh ./agent-os/specs/2026-01-08-my-feature"
  echo ""
  echo "This script will:"
  echo "  1. Create a safe implementation branch"
  echo "  2. Run /write-spec to create the specification"
  echo "  3. Run /create-tasks to break down into tasks"
  echo "  4. Run /orchestrate-tasks to generate implementation prompts"
  echo "  5. Execute each prompt to implement the feature"
  echo "  6. Commit, push, and create a PR for review"
  exit 1
fi

# Handle both full paths and just folder names
if [[ "$SPEC_INPUT" == *"agent-os/specs/"* ]]; then
  # Extract just the folder name from the path
  SPEC_FOLDER=$(echo "$SPEC_INPUT" | sed 's|.*agent-os/specs/||' | sed 's|/$||')
else
  SPEC_FOLDER="$SPEC_INPUT"
fi

SPEC_PATH="agent-os/specs/$SPEC_FOLDER"
PROMPTS_DIR="$SPEC_PATH/implementation/prompts"
BRANCH_NAME="impl/$SPEC_FOLDER"

# === PRE-FLIGHT CHECKS ===

# Check that spec folder exists
if [ ! -d "$SPEC_PATH" ]; then
  echo "Error: Spec folder not found at $SPEC_PATH"
  echo "Run /shape-spec first to create it."
  exit 1
fi

# Check that requirements.md exists (created by /shape-spec)
if [ ! -f "$SPEC_PATH/planning/requirements.md" ]; then
  echo "Error: requirements.md not found at $SPEC_PATH/planning/requirements.md"
  echo "Run /shape-spec first to create requirements."
  exit 1
fi

# Check for gh CLI
if ! command -v gh &> /dev/null; then
  echo "Error: gh CLI not found."
  echo "Install it with: brew install gh"
  echo "Then authenticate: gh auth login"
  exit 1
fi

# Check gh is authenticated
if ! gh auth status &> /dev/null; then
  echo "Error: gh CLI not authenticated."
  echo "Run: gh auth login"
  exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "Error: You have uncommitted changes."
  echo ""
  echo "Please commit or stash them first:"
  echo "  git stash push -m 'before $SPEC_FOLDER implementation'"
  echo ""
  echo "Or commit them:"
  echo "  git add -A && git commit -m 'WIP'"
  exit 1
fi

# === READY TO GO ===
echo ""
echo "============================================"
echo "  SPEC TO IMPLEMENTATION: $SPEC_FOLDER"
echo "============================================"
echo ""

# Ask about CLI tool
echo "CLI tool:"
echo "  1) Claude Code (claude)"
echo "  2) Cursor CLI (agent)"
echo ""
read -p "Choose CLI tool (1/2) [1]: " CLI_TOOL
CLI_TOOL=${CLI_TOOL:-1}
echo ""

# Ask about model
echo "Model:"
echo "  1) Default (use CLI default)"

# Fetch available models dynamically
if [[ "$CLI_TOOL" == "2" ]]; then
  # Cursor CLI
  MODELS_OUTPUT=$(agent models 2>/dev/null || echo "")
else
  # Claude Code - try to get models, fall back to static list
  MODELS_OUTPUT=$(claude models 2>/dev/null || echo "")
fi

# Parse models into array (one per line, skip empty lines)
MODELS=()
if [[ -n "$MODELS_OUTPUT" ]]; then
  while IFS= read -r line; do
    # Skip empty lines and header lines
    [[ -z "$line" ]] && continue
    [[ "$line" == *"Available"* ]] && continue
    [[ "$line" == *"---"* ]] && continue
    # Clean up the line (remove leading/trailing whitespace, bullets, etc.)
    model=$(echo "$line" | sed 's/^[[:space:]]*[-*]*[[:space:]]*//' | sed 's/[[:space:]]*$//')
    [[ -n "$model" ]] && MODELS+=("$model")
  done <<< "$MODELS_OUTPUT"
fi

# If no models found, use static fallback
if [[ ${#MODELS[@]} -eq 0 ]]; then
  MODELS=("claude-sonnet-4-20250514" "claude-opus-4-20250514" "gpt-4o" "o3")
fi

# Display models
for i in "${!MODELS[@]}"; do
  echo "  $((i + 2))) ${MODELS[$i]}"
done
echo ""

MAX_CHOICE=$((${#MODELS[@]} + 1))
read -p "Choose model (1-$MAX_CHOICE) [1]: " MODEL_CHOICE
MODEL_CHOICE=${MODEL_CHOICE:-1}

if [[ "$MODEL_CHOICE" -gt 1 && "$MODEL_CHOICE" -le "$MAX_CHOICE" ]]; then
  SELECTED_MODEL="${MODELS[$((MODEL_CHOICE - 2))]}"
  MODEL_FLAG="--model $SELECTED_MODEL"
else
  MODEL_FLAG=""
fi
echo ""

# Ask about execution mode
echo "Execution mode:"
echo "  1) Automated - runs without interaction (faster, less control)"
echo "  2) Interactive - you can watch and approve each action (slower, more control)"
echo ""
read -p "Choose mode (1/2) [1]: " EXEC_MODE
EXEC_MODE=${EXEC_MODE:-1}

if [[ "$CLI_TOOL" == "2" ]]; then
  # Cursor CLI
  if [[ "$EXEC_MODE" == "1" ]]; then
    CLI_CMD="agent -p --force $MODEL_FLAG"
    echo "Using Cursor CLI in automated mode."
  else
    CLI_CMD="agent $MODEL_FLAG"
    echo "Using Cursor CLI in interactive mode."
  fi
else
  # Claude Code (default)
  if [[ "$EXEC_MODE" == "1" ]]; then
    CLI_CMD="claude --dangerously-skip-permissions -p $MODEL_FLAG"
    echo "Using Claude Code in automated mode."
  else
    CLI_CMD="claude $MODEL_FLAG"
    echo "Using Claude Code in interactive mode. Type /exit after each phase to continue."
  fi
fi

if [[ -n "$MODEL_FLAG" ]]; then
  echo "Model: ${MODEL_FLAG#--model }"
fi
echo ""

# Ask about branch strategy
ORIGINAL_BRANCH=$(git branch --show-current)
echo "Current branch: $ORIGINAL_BRANCH"
echo ""
read -p "Create a new implementation branch? (y/n) [y]: " CREATE_BRANCH
CREATE_BRANCH=${CREATE_BRANCH:-y}

if [[ "$CREATE_BRANCH" =~ ^[Yy]$ ]]; then
  USE_BRANCH=true
  # Create implementation branch
  if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    echo "Branch $BRANCH_NAME already exists. Switching to it..."
    git checkout "$BRANCH_NAME"
  else
    git checkout -b "$BRANCH_NAME"
    echo "Created branch: $BRANCH_NAME"
  fi
  echo ""
  echo "To revert everything later:"
  echo "  git checkout $ORIGINAL_BRANCH && git branch -D $BRANCH_NAME"
  echo ""
else
  USE_BRANCH=false
  echo ""
  echo "Running on current branch: $ORIGINAL_BRANCH"
  echo "Warning: Changes will be made directly to this branch."
  echo ""
fi

# === Phase 1: Write Spec ===
echo "============================================"
echo "  PHASE 1: Writing Specification"
echo "============================================"
echo ""
echo "Running /write-spec..."
echo ""

$CLI_CMD "Run /write-spec for $SPEC_PATH. Complete it fully without stopping for intermediate confirmation messages. When the spec.md is written, you're done."

# === Phase 2: Create Tasks ===
echo ""
echo "============================================"
echo "  PHASE 2: Creating Tasks"
echo "============================================"
echo ""

$CLI_CMD "Run /create-tasks for $SPEC_PATH. Complete it fully without stopping for intermediate confirmation messages. When tasks.md is written, you're done."

# === Phase 3: Generate Prompts ===
echo ""
echo "============================================"
echo "  PHASE 3: Generating Implementation Prompts"
echo "============================================"
echo ""

$CLI_CMD "Run /orchestrate-tasks for $SPEC_PATH. Generate the prompt files to implementation/prompts/. When the prompt files are created, you're done."

# === Phase 4: Implement Each Task Group ===
echo ""
echo "============================================"
echo "  PHASE 4: Implementing Task Groups"
echo "============================================"
echo ""

# Check that prompts were generated
if [ ! -d "$PROMPTS_DIR" ] || [ -z "$(ls -A "$PROMPTS_DIR" 2>/dev/null)" ]; then
  echo "Warning: No prompt files found in $PROMPTS_DIR"
  echo "Skipping implementation phase."
else
  PROMPT_COUNT=$(ls -1 "$PROMPTS_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
  CURRENT=0
  
  for prompt_file in $(ls -1v "$PROMPTS_DIR"/*.md 2>/dev/null); do
    CURRENT=$((CURRENT + 1))
    PROMPT_NAME=$(basename "$prompt_file")
    
    echo ""
    echo "--------------------------------------------"
    echo "  Task $CURRENT of $PROMPT_COUNT: $PROMPT_NAME"
    echo "--------------------------------------------"
    echo ""
    
    $CLI_CMD "Execute the instructions in @$prompt_file fully. Mark completed tasks in $SPEC_PATH/tasks.md when done."
  done
fi

# === Commit and Create PR ===
echo ""
echo "============================================"
echo "  FINALIZING: Commit and PR"
echo "============================================"
echo ""

# Check if there are changes to commit
if git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "No changes to commit."
else
  echo "Committing changes..."
  git add -A
  git commit -m "Implement: $SPEC_FOLDER

Automated implementation via spec-to-implementation script.

Spec: $SPEC_PATH/spec.md
Tasks: $SPEC_PATH/tasks.md"
  
  if [ "$USE_BRANCH" = true ]; then
    echo ""
    echo "Pushing branch..."
    git push -u origin "$BRANCH_NAME"
    
    echo ""
    echo "Creating PR..."
    PR_URL=$(gh pr create \
      --title "feat: $SPEC_FOLDER" \
      --body "## Summary

Automated implementation of \`$SPEC_FOLDER\` spec.

## Spec Files
- Specification: \`$SPEC_PATH/spec.md\`
- Tasks: \`$SPEC_PATH/tasks.md\`

## Review Checklist
- [ ] Code matches spec requirements
- [ ] Tests passing
- [ ] No unintended side effects
- [ ] Ready to merge" \
      --base "$ORIGINAL_BRANCH" 2>&1)
    
    echo ""
    echo "PR created: $PR_URL"
  else
    echo ""
    echo "Changes committed to $ORIGINAL_BRANCH."
    echo "Push when ready: git push"
  fi
fi

# === Done ===
echo ""
echo "============================================"
echo "  COMPLETE!"
echo "============================================"
echo ""

if [ "$USE_BRANCH" = true ]; then
  echo "Implementation branch: $BRANCH_NAME"
  echo "Original branch: $ORIGINAL_BRANCH"
  if [ -n "$PR_URL" ]; then
    echo ""
    echo "Review PR: $PR_URL"
  fi
  echo ""
  echo "Next steps:"
  echo "  - Review the PR in GitHub"
  echo "  - If approved: merge the PR"
  echo "  - If rejected: git checkout $ORIGINAL_BRANCH && git branch -D $BRANCH_NAME"
else
  echo "Changes committed to: $ORIGINAL_BRANCH"
  echo ""
  echo "Next steps:"
  echo "  - Review the changes: git diff HEAD~1"
  echo "  - Push when ready: git push"
  echo "  - To undo: git reset --hard HEAD~1"
fi
