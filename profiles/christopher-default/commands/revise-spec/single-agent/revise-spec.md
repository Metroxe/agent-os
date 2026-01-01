# Revise Spec

You are helping me revise a spec and its tasks based on new information discovered during implementation. This command handles mid-implementation changes while preserving work history.

Follow this MULTI-PHASE process:

---

## PHASE 1: Capture Change Context

### Step 1.1: Read Current State

Read the following files to understand the current state:

1. **spec.md**: `agent-os/specs/[this-spec]/spec.md`
2. **tasks.md**: `agent-os/specs/[this-spec]/tasks.md`
3. **requirements.md**: `agent-os/specs/[this-spec]/planning/requirements.md`

If you're unsure which spec is being revised, ask the user to specify the spec folder name.

### Step 1.2: Ask About the Change

Ask the user to describe what was discovered that requires a spec revision:

```
I've loaded the current spec and tasks. What change needs to be made?

Please describe:
1. **What you discovered** - the edge case, scope change, or technical blocker
2. **Why it requires a spec change** - what aspect of the spec is affected
3. **The desired outcome** - what should happen instead

For example:
- "Puppeteer doesn't work with our auth flow. We need to switch to Playwright."
- "Users need to be able to export data as CSV, not just JSON."
- "The API we planned to use is deprecated. We need to use the v2 API instead."
```

**STOP and wait for user response.**

### Step 1.3: Document the Revision

After receiving the user's description, create a revision document:

1. Check if `agent-os/specs/[this-spec]/planning/revisions/` exists. Create it if not.
2. Count existing revision files to determine the next number.
3. Create `revision-{n}.md` with the following structure:

```markdown
# Revision {n}: [Brief Title]

**Date:** [Current Date]
**Type:** [Edge Case | Scope Change | Technical Blocker | Other]

## Discovery

[User's description of what was discovered]

## Impact

[Your analysis of which parts of the spec and tasks are affected]

## Resolution

[Summary of how this will be addressed - filled in after Phase 2 & 3]
```

---

## PHASE 2: Update Spec

### Step 2.1: Identify Affected Sections

Analyze the spec.md to identify which sections need to be updated based on the user's change request.

### Step 2.2: Update spec.md

Make the necessary changes to spec.md. Preserve the existing structure and content where possible.

### Step 2.3: Add Revision History

If spec.md doesn't have a "Revision History" section, add one at the end:

```markdown
## Revision History

| Revision | Date   | Summary                   |
| -------- | ------ | ------------------------- |
| 1        | [Date] | [Brief summary of change] |
```

If it already exists, append a new row.

### Step 2.4: Confirm Spec Changes

Show the user what was changed in the spec:

```
I've updated the spec with the following changes:

**Sections Modified:**
- [List sections that were changed]

**Summary of Changes:**
- [Bullet points describing the key changes]

Proceeding to analyze task impact...
```

---

## PHASE 3: Suggest Task Changes

### Step 3.1: Analyze Current Tasks

Read tasks.md and categorize each task:

- **Completed** (`[x]`): Work has been done
- **Pending** (`[ ]`): Work not yet started

### Step 3.2: Determine Impact on Each Task

For each task, determine if it is:

- **Unaffected**: No change needed
- **Affected (Pending)**: Can be directly edited, replaced, or removed
- **Affected (Completed)**: Requires a refactor task to be added

### Step 3.3: Determine Granularity

For changes like library swaps or major refactors, decide on task granularity:

- **Simple changes**: Single atomic task (e.g., "Replace Puppeteer with Playwright")
- **Complex changes**: Split into steps:
  - Remove old dependencies
  - Add new dependencies
  - Update code using old approach to use new approach
  - Update tests

Base this decision on the scope and complexity of the change.

### Step 3.4: Generate Suggested Changes

Present the suggested task changes to the user in this format:

```
Based on the spec changes, here are my suggested task modifications:

## Pending Tasks (Direct Edits)

These tasks haven't been started, so I'll update them directly:

| Current Task | Suggested Change |
|--------------|------------------|
| [ ] Original task text | **Edit to:** "New task text" |
| [ ] Task to remove | **Remove** (no longer needed) |
| (new) | **Add:** "New task description" |

## Completed Tasks (Refactor Needed)

These tasks were completed but are affected by the change. I'll preserve them and add refactor tasks:

| Completed Task | Refactor Task to Add |
|----------------|---------------------|
| [x] Original completed task | [ ] Refactor: Description of refactor work |

## Proposed tasks.md

Here's what the updated tasks.md would look like:

[Show the full proposed tasks.md content]

---

**Do you approve these task changes?**
- Reply "yes" to apply the changes
- Reply with modifications if you want to adjust anything
- Reply "no" to cancel task updates (spec changes are already saved)
```

**STOP and wait for user approval.**

### Step 3.5: Apply Approved Changes

Once the user approves (or provides modifications):

1. Update tasks.md with the approved changes
2. Update the revision document with the resolution summary:

```markdown
## Resolution

**Spec Changes:**

- [Summary of spec changes made]

**Task Changes:**

- [x] pending tasks modified
- [Y] refactor tasks added for completed work
- [Z] tasks removed
```

### Step 3.6: Confirm Completion

Display confirmation to the user:

```
✅ Spec revision complete!

**Changes Applied:**
- Spec updated: `agent-os/specs/[this-spec]/spec.md`
- Tasks updated: `agent-os/specs/[this-spec]/tasks.md`
- Revision logged: `agent-os/specs/[this-spec]/planning/revisions/revision-{n}.md`

You can now continue with implementation using `/implement-tasks`.
```

---

## Key Rules

1. **Preserve completed work history**: Never delete or uncheck completed tasks. Add refactor tasks instead.
2. **Edit pending tasks freely**: Tasks that haven't been started can be modified, replaced, or removed.
3. **Always wait for approval**: Don't modify tasks.md until the user approves the suggested changes.
4. **Document everything**: Create a revision file for every spec change for audit trail.
5. **Be specific in refactor tasks**: Make it clear what work needs to be undone or changed.
