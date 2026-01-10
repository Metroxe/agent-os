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

# === HELPER FUNCTIONS ===

# Commit a step (only if USE_BRANCH=true)
commit_step() {
  local prefix="$1"
  local message="$2"
  
  # Only commit if using git branching
  if [ "$USE_BRANCH" != true ]; then
    return 0
  fi
  
  # Check if there are changes to commit
  if git diff-index --quiet HEAD -- 2>/dev/null; then
    echo "  (No changes to commit)"
    return 0
  fi
  
  echo "  Committing: $prefix: $message"
  git add -A
  git commit -m "$prefix: $message" --no-verify
  echo ""
}

# Handle CLI errors with recovery options
handle_cli_error() {
  local exit_code="$1"
  local phase_name="$2"
  local error_output="$3"
  
  echo ""
  echo "============================================"
  echo "  ERROR: CLI Failed (exit code $exit_code)"
  echo "============================================"
  echo ""
  echo "Failed during: $phase_name"
  echo ""
  
  # Show the error details
  if [[ -n "$error_output" ]]; then
    echo "Error details:"
    echo "--------------------------------------------"
    # Try to extract error message from JSON, otherwise show raw output
    local error_msg
    error_msg=$(echo "$error_output" | jq -r '.error.message // empty' 2>/dev/null)
    local error_type
    error_type=$(echo "$error_output" | jq -r '.error.type // empty' 2>/dev/null)
    
    if [[ -n "$error_msg" ]]; then
      echo "  Type: $error_type"
      echo "  Message: $error_msg"
    else
      # Not JSON or no error field - show last 10 lines of output
      echo "$error_output" | tail -20
    fi
    echo "--------------------------------------------"
    echo ""
  fi
  
  # Check for uncommitted changes
  if git diff-index --quiet HEAD -- 2>/dev/null; then
    echo "No uncommitted changes to clean up."
    echo ""
    echo "You can resume this implementation later by running:"
    echo "  $0 $SPEC_FOLDER"
    echo ""
    echo "The script will automatically retry this step."
    return
  fi
  
  echo "You have uncommitted changes from this step."
  echo ""
  echo "Options:"
  echo "  1) Discard uncommitted changes (recommended - clean retry)"
  echo "  2) Keep uncommitted changes (may have partial work)"
  echo ""
  read -p "Choose option (1/2) [1]: " RECOVERY_CHOICE
  RECOVERY_CHOICE=${RECOVERY_CHOICE:-1}
  
  if [[ "$RECOVERY_CHOICE" == "1" ]]; then
    echo ""
    echo "Discarding uncommitted changes..."
    git checkout -- .
    git clean -fd
    echo "Uncommitted changes discarded."
  else
    echo ""
    echo "Keeping uncommitted changes."
    echo "Note: The partial changes may cause issues on retry."
  fi
  
  echo ""
  echo "You can resume this implementation later by running:"
  echo "  $0 $SPEC_FOLDER"
  echo ""
  echo "The script will automatically retry this step."
}

# Detect which phases have been completed
detect_completed_steps() {
  local completed_phase=0
  
  # Phase 1: spec.md exists
  if [ -f "$SPEC_PATH/spec.md" ]; then
    completed_phase=1
  fi
  
  # Phase 2: tasks.md exists
  if [ -f "$SPEC_PATH/tasks.md" ]; then
    completed_phase=2
  fi
  
  # Phase 3: prompts directory exists and has files
  if [ -d "$PROMPTS_DIR" ] && [ -n "$(ls -A "$PROMPTS_DIR"/*.md 2>/dev/null)" ]; then
    completed_phase=3
  fi
  
  # Return the next phase to start (completed + 1)
  echo $((completed_phase + 1))
}

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

# Check for jq (required for token usage parsing)
if ! command -v jq &> /dev/null; then
  echo "Error: jq not found (required for token usage tracking)."
  echo "Install it with: brew install jq"
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

# === DETECT PREVIOUS PROGRESS ===
START_PHASE=$(detect_completed_steps)

if [[ $START_PHASE -gt 1 ]]; then
  echo ""
  echo "============================================"
  echo "  DETECTED PREVIOUS PROGRESS"
  echo "============================================"
  echo ""
  
  if [[ $START_PHASE -gt 1 ]]; then
    echo "✓ Phase 1: Specification written"
  fi
  if [[ $START_PHASE -gt 2 ]]; then
    echo "✓ Phase 2: Tasks created"
  fi
  if [[ $START_PHASE -gt 3 ]]; then
    echo "✓ Phase 3: Prompts generated"
  fi
  
  echo ""
  echo "Will resume from Phase $START_PHASE"
  echo ""
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

# Ask about model (only for Cursor CLI)
if [[ "$CLI_TOOL" == "2" ]]; then
  echo "Model:"
  echo "  1) Default (use CLI default)"

  # Fetch available models dynamically
  MODELS_OUTPUT=$(agent models 2>/dev/null || echo "")

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
else
  # Claude Code - use CLI default, no prompt
  MODEL_FLAG=""
fi

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
  if [[ -n "$MODEL_FLAG" ]]; then
    echo "Model: ${MODEL_FLAG#--model }"
  else
    echo "Model: CLI default"
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
  echo "Model: CLI default"
fi
echo ""

# Ask about branch strategy
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"
echo ""

# Check if we're already on the implementation branch
if [[ "$CURRENT_BRANCH" == "$BRANCH_NAME" ]]; then
  echo "Already on implementation branch: $BRANCH_NAME"
  echo "Resuming previous run..."
  echo ""
  USE_BRANCH=true
  ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref "$BRANCH_NAME@{u}" 2>/dev/null | cut -d'/' -f1 || echo "main")
  
  echo "To revert everything later:"
  echo "  git checkout $ORIGINAL_BRANCH && git branch -D $BRANCH_NAME"
  echo ""
else
  ORIGINAL_BRANCH="$CURRENT_BRANCH"
  
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
fi

# === TOKEN USAGE TRACKING ===

# Cumulative tracking variables
TOTAL_INPUT_TOKENS=0
TOTAL_OUTPUT_TOKENS=0
TOTAL_CACHE_READ_TOKENS=0
TOTAL_CACHE_CREATION_TOKENS=0
TOTAL_COST_USD=0
TOTAL_DURATION_MS=0
STEP_COUNT=0

# Format number with commas (works on macOS)
format_number() {
  LC_NUMERIC=en_US.UTF-8 printf "%'d" "$1" 2>/dev/null || echo "$1"
}

# Format cost as USD
format_cost() {
  printf "$%.4f" "$1"
}

# Format duration from ms to human readable
format_duration() {
  local ms=$1
  local seconds=$((ms / 1000))
  local minutes=$((seconds / 60))
  local remaining_seconds=$((seconds % 60))
  if [[ $minutes -gt 0 ]]; then
    echo "${minutes}m ${remaining_seconds}s"
  else
    printf "%.1fs" "$(echo "scale=1; $ms / 1000" | bc)"
  fi
}

# Run CLI command with streaming output and token tracking
run_cli_with_tracking() {
  local phase_name="$1"
  local prompt="$2"
  
  STEP_COUNT=$((STEP_COUNT + 1))
  
  if [[ "$EXEC_MODE" == "1" ]]; then
    # Automated mode: use stream-json for real-time output + token tracking
    local temp_output
    temp_output=$(mktemp)
    local exit_code=0
    
    # Run CLI with stream-json, capture all output while streaming to display script
    if [[ "$CLI_TOOL" == "2" ]]; then
      # Cursor CLI
      $CLI_CMD --output-format stream-json "$prompt" 2>&1 | tee "$temp_output" | while IFS= read -r line; do
        # Extract and display assistant text content
        local msg_type content
        msg_type=$(echo "$line" | jq -r '.type // empty' 2>/dev/null)
        if [[ "$msg_type" == "assistant" ]]; then
          content=$(echo "$line" | jq -r '.message.content[]?.text // empty' 2>/dev/null)
          [[ -n "$content" ]] && echo "$content"
        elif [[ "$msg_type" == "user" ]]; then
          # Show tool use results briefly
          content=$(echo "$line" | jq -r '.message.content[]?.type // empty' 2>/dev/null)
          [[ "$content" == "tool_result" ]] && echo "  [tool completed]"
        fi
      done
      exit_code=${PIPESTATUS[0]}
    else
      # Claude Code
      $CLI_CMD --output-format stream-json "$prompt" 2>&1 | tee "$temp_output" | while IFS= read -r line; do
        # Extract and display assistant text content
        local msg_type content
        msg_type=$(echo "$line" | jq -r '.type // empty' 2>/dev/null)
        if [[ "$msg_type" == "assistant" ]]; then
          content=$(echo "$line" | jq -r '.message.content[]?.text // empty' 2>/dev/null)
          [[ -n "$content" ]] && echo "$content"
        elif [[ "$msg_type" == "user" ]]; then
          # Show tool use results briefly
          content=$(echo "$line" | jq -r '.message.content[]?.type // empty' 2>/dev/null)
          [[ "$content" == "tool_result" ]] && echo "  [tool completed]"
        fi
      done
      exit_code=${PIPESTATUS[0]}
    fi
    
    # Read captured output and find the result event
    local result_json=""
    local last_error=""
    if [[ -f "$temp_output" ]]; then
      result_json=$(grep '"type":"result"' "$temp_output" 2>/dev/null | tail -1 || true)
      last_error=$(grep -i '"error"' "$temp_output" 2>/dev/null | tail -1 || true)
      rm -f "$temp_output"
    fi
    
    # Handle any CLI errors
    if [[ $exit_code -ne 0 ]]; then
      handle_cli_error "$exit_code" "$phase_name" "$last_error"
      exit 1
    fi
    
    # Parse and display usage from result event
    if [[ -n "$result_json" ]]; then
      parse_and_display_usage "$phase_name" "$result_json"
    else
      echo ""
      echo "  (Token usage data not available)"
      echo ""
    fi
  else
    # Interactive mode: run normally, output streams directly to terminal
    local exit_code=0
    $CLI_CMD "$prompt" || exit_code=$?
    
    # Handle any CLI errors
    if [[ $exit_code -ne 0 ]]; then
      handle_cli_error "$exit_code" "$phase_name" "(see output above)"
      exit 1
    fi
    
    echo ""
    echo "  (Token tracking not available in interactive mode)"
    echo ""
  fi
}

# Parse usage from JSON and display summary
# Handles both regular JSON output and stream-json result events
parse_and_display_usage() {
  local phase_name="$1"
  local json="$2"
  
  # Extract common fields (default to 0 if empty/missing)
  # Check both top-level and nested .result paths for stream-json compatibility
  local duration_ms
  duration_ms=$(echo "$json" | jq -r '.duration_ms // .duration_api_ms // .result.duration_ms // 0' 2>/dev/null)
  duration_ms=${duration_ms:-0}
  [[ "$duration_ms" =~ ^[0-9]+$ ]] || duration_ms=0
  TOTAL_DURATION_MS=$((TOTAL_DURATION_MS + duration_ms))
  
  echo ""
  echo "--------------------------------------------"
  echo "  Step Summary: $phase_name"
  echo "--------------------------------------------"
  
  if [[ "$CLI_TOOL" == "2" ]]; then
    # Cursor CLI - limited data available
    local duration_sec
    duration_sec=$(echo "scale=1; $duration_ms / 1000" | bc)
    
    echo "  Duration:        ${duration_sec}s"
    echo ""
    echo "  (Token usage not available with Cursor CLI)"
  else
    # Claude Code - full usage data available
    # Check both top-level and nested .result paths for stream-json compatibility
    local input_tokens output_tokens cache_read cache_creation cost_usd
    
    input_tokens=$(echo "$json" | jq -r '.usage.input_tokens // .result.usage.input_tokens // 0' 2>/dev/null)
    output_tokens=$(echo "$json" | jq -r '.usage.output_tokens // .result.usage.output_tokens // 0' 2>/dev/null)
    cache_read=$(echo "$json" | jq -r '.usage.cache_read_input_tokens // .result.usage.cache_read_input_tokens // 0' 2>/dev/null)
    cache_creation=$(echo "$json" | jq -r '.usage.cache_creation_input_tokens // .result.usage.cache_creation_input_tokens // 0' 2>/dev/null)
    cost_usd=$(echo "$json" | jq -r '.total_cost_usd // .result.total_cost_usd // 0' 2>/dev/null)
    
    # Ensure numeric values (default to 0 if empty/invalid)
    input_tokens=${input_tokens:-0}; [[ "$input_tokens" =~ ^[0-9]+$ ]] || input_tokens=0
    output_tokens=${output_tokens:-0}; [[ "$output_tokens" =~ ^[0-9]+$ ]] || output_tokens=0
    cache_read=${cache_read:-0}; [[ "$cache_read" =~ ^[0-9]+$ ]] || cache_read=0
    cache_creation=${cache_creation:-0}; [[ "$cache_creation" =~ ^[0-9]+$ ]] || cache_creation=0
    cost_usd=${cost_usd:-0}; [[ "$cost_usd" =~ ^[0-9.]+$ ]] || cost_usd=0
    
    # Accumulate totals
    TOTAL_INPUT_TOKENS=$((TOTAL_INPUT_TOKENS + input_tokens))
    TOTAL_OUTPUT_TOKENS=$((TOTAL_OUTPUT_TOKENS + output_tokens))
    TOTAL_CACHE_READ_TOKENS=$((TOTAL_CACHE_READ_TOKENS + cache_read))
    TOTAL_CACHE_CREATION_TOKENS=$((TOTAL_CACHE_CREATION_TOKENS + cache_creation))
    TOTAL_COST_USD=$(echo "$TOTAL_COST_USD + $cost_usd" | bc)
    
    local total_step_tokens=$((input_tokens + output_tokens + cache_read + cache_creation))
    local total_all_tokens=$((TOTAL_INPUT_TOKENS + TOTAL_OUTPUT_TOKENS + TOTAL_CACHE_READ_TOKENS + TOTAL_CACHE_CREATION_TOKENS))
    local duration_sec
    duration_sec=$(echo "scale=1; $duration_ms / 1000" | bc)
    
    echo "  Input tokens:    $(format_number $input_tokens)"
    echo "  Output tokens:   $(format_number $output_tokens)"
    if [[ $cache_read -gt 0 ]]; then
      echo "  Cache read:      $(format_number $cache_read)"
    fi
    if [[ $cache_creation -gt 0 ]]; then
      echo "  Cache created:   $(format_number $cache_creation)"
    fi
    echo "  Cost:            $(format_cost $cost_usd)"
    echo "  Duration:        ${duration_sec}s"
    echo ""
    echo "  Running total:   $(format_cost $TOTAL_COST_USD) ($(format_number $total_all_tokens) tokens)"
  fi
  
  echo "--------------------------------------------"
  echo ""
}

# Display final usage summary
display_final_summary() {
  echo ""
  echo "============================================"
  echo "  TOKEN USAGE SUMMARY"
  echo "============================================"
  
  local total_duration_sec
  total_duration_sec=$(echo "scale=1; $TOTAL_DURATION_MS / 1000" | bc)
  
  if [[ "$CLI_TOOL" == "2" ]]; then
    # Cursor CLI
    echo ""
    echo "  Total steps:     $STEP_COUNT"
    echo "  Total duration:  ${total_duration_sec}s"
    echo ""
    echo "  (Detailed token usage not available with Cursor CLI)"
  else
    # Claude Code
    local total_all_tokens=$((TOTAL_INPUT_TOKENS + TOTAL_OUTPUT_TOKENS + TOTAL_CACHE_READ_TOKENS + TOTAL_CACHE_CREATION_TOKENS))
    
    echo ""
    echo "  Total steps:     $STEP_COUNT"
    echo "  Input tokens:    $(format_number $TOTAL_INPUT_TOKENS)"
    echo "  Output tokens:   $(format_number $TOTAL_OUTPUT_TOKENS)"
    if [[ $TOTAL_CACHE_READ_TOKENS -gt 0 ]]; then
      echo "  Cache read:      $(format_number $TOTAL_CACHE_READ_TOKENS)"
    fi
    if [[ $TOTAL_CACHE_CREATION_TOKENS -gt 0 ]]; then
      echo "  Cache created:   $(format_number $TOTAL_CACHE_CREATION_TOKENS)"
    fi
    echo "  --------------------------"
    echo "  Total tokens:    $(format_number $total_all_tokens)"
    echo "  Total cost:      $(format_cost $TOTAL_COST_USD)"
    echo "  Total duration:  ${total_duration_sec}s"
  fi
  
  echo ""
  echo "============================================"
}

# === Phase 1: Write Spec ===
if [[ $START_PHASE -le 1 ]]; then
  echo "============================================"
  echo "  PHASE 1: Writing Specification"
  echo "============================================"
  echo ""
  echo "Running /write-spec..."
  echo ""

  run_cli_with_tracking "PHASE 1: Write Spec" "Run /write-spec for $SPEC_PATH. Complete it fully without stopping for intermediate confirmation messages. When the spec.md is written, you're done."
  
  commit_step "chore" "write specification for $SPEC_FOLDER"
else
  echo "============================================"
  echo "  PHASE 1: Writing Specification [SKIPPED]"
  echo "============================================"
  echo ""
  echo "Specification already exists at $SPEC_PATH/spec.md"
  echo ""
fi

# === Phase 2: Create Tasks ===
if [[ $START_PHASE -le 2 ]]; then
  echo ""
  echo "============================================"
  echo "  PHASE 2: Creating Tasks"
  echo "============================================"
  echo ""

  run_cli_with_tracking "PHASE 2: Create Tasks" "Run /create-tasks for $SPEC_PATH. Complete it fully without stopping for intermediate confirmation messages. When tasks.md is written, you're done."
  
  commit_step "chore" "create tasks list for $SPEC_FOLDER"
else
  echo ""
  echo "============================================"
  echo "  PHASE 2: Creating Tasks [SKIPPED]"
  echo "============================================"
  echo ""
  echo "Tasks already exist at $SPEC_PATH/tasks.md"
  echo ""
fi

# === Phase 3: Generate Prompts ===
if [[ $START_PHASE -le 3 ]]; then
  echo ""
  echo "============================================"
  echo "  PHASE 3: Generating Prompts"
  echo "============================================"
  echo ""

  run_cli_with_tracking "PHASE 3: Generate Prompts" "Run /orchestrate-tasks for $SPEC_PATH. Generate the prompt files to implementation/prompts/. When the prompt files are created, you're done."
  
  commit_step "chore" "generate implementation prompts for $SPEC_FOLDER"
else
  echo ""
  echo "============================================"
  echo "  PHASE 3: Generating Prompts [SKIPPED]"
  echo "============================================"
  echo ""
  echo "Prompts already exist at $PROMPTS_DIR"
  echo ""
fi

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
  # Track executed prompts
  EXECUTED_PROMPTS_FILE="$SPEC_PATH/.executed_prompts"
  
  # Create the file if it doesn't exist
  if [ ! -f "$EXECUTED_PROMPTS_FILE" ]; then
    touch "$EXECUTED_PROMPTS_FILE"
  fi
  
  PROMPT_COUNT=$(ls -1 "$PROMPTS_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ')
  CURRENT=0
  SKIPPED=0
  
  for prompt_file in $(ls -1v "$PROMPTS_DIR"/*.md 2>/dev/null); do
    CURRENT=$((CURRENT + 1))
    PROMPT_NAME=$(basename "$prompt_file")
    
    # Check if this prompt has already been executed
    if grep -Fxq "$PROMPT_NAME" "$EXECUTED_PROMPTS_FILE" 2>/dev/null; then
      echo ""
      echo "============================================"
      echo "  PHASE 4.$CURRENT: $PROMPT_NAME ($CURRENT of $PROMPT_COUNT) [SKIPPED]"
      echo "============================================"
      echo ""
      echo "Prompt already executed, skipping..."
      SKIPPED=$((SKIPPED + 1))
      continue
    fi
    
    echo ""
    echo "============================================"
    echo "  PHASE 4.$CURRENT: $PROMPT_NAME ($CURRENT of $PROMPT_COUNT)"
    echo "============================================"
    echo ""
    
    run_cli_with_tracking "PHASE 4.$CURRENT: $PROMPT_NAME" "Execute the instructions in @$prompt_file fully. Mark completed tasks in $SPEC_PATH/tasks.md when done."
    
    # Mark this prompt as executed
    echo "$PROMPT_NAME" >> "$EXECUTED_PROMPTS_FILE"
    
    # Commit this implementation step
    commit_step "feat" "implement $PROMPT_NAME for $SPEC_FOLDER"
  done
  
  if [[ $SKIPPED -gt 0 ]]; then
    echo ""
    echo "Skipped $SKIPPED already-executed prompt(s)"
    echo ""
  fi
fi

# === Display Token Usage Summary ===
display_final_summary

# === Finalize and Create PR ===
echo ""
echo "============================================"
echo "  FINALIZING: Push and Create PR"
echo "============================================"
echo ""

# Commit any remaining uncommitted changes (if any)
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "Committing any remaining changes..."
  commit_step "chore" "finalize implementation for $SPEC_FOLDER"
fi

if [ "$USE_BRANCH" = true ]; then
  echo "Pushing branch..."
  git push -u origin "$BRANCH_NAME" 2>&1 | grep -v "Everything up-to-date" || true
  
  # Check if PR already exists
  EXISTING_PR=$(gh pr list --head "$BRANCH_NAME" --json number --jq '.[0].number' 2>/dev/null || echo "")
  
  if [ -n "$EXISTING_PR" ]; then
    PR_URL=$(gh pr view "$EXISTING_PR" --json url --jq '.url')
    echo ""
    echo "PR already exists: $PR_URL"
  else
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
  fi
else
  echo "Not using git branch, skipping push and PR creation."
  echo ""
  echo "Changes are on current branch: $ORIGINAL_BRANCH"
  echo "Push when ready: git push"
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
  echo "Commits created:"
  echo "  - Each phase was committed with 'chore:' prefix"
  echo "  - Each implementation was committed with 'feat:' prefix"
  echo ""
  echo "Next steps:"
  echo "  - Review the PR in GitHub"
  echo "  - If approved: merge the PR"
  echo "  - If rejected: git checkout $ORIGINAL_BRANCH && git branch -D $BRANCH_NAME"
  echo ""
  echo "To resume this run later:"
  echo "  - Run: $0 $SPEC_FOLDER"
  echo "  - The script will automatically detect and resume from the last step"
else
  echo "Changes made to: $ORIGINAL_BRANCH"
  echo ""
  echo "Next steps:"
  echo "  - Review the changes: git log --oneline"
  echo "  - Push when ready: git push"
  echo ""
  echo "To resume this run later:"
  echo "  - Run: $0 $SPEC_FOLDER"
  echo "  - The script will automatically detect and resume from the last step"
fi
