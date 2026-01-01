# Write Story

You are helping me create user stories for my product manager to track. Stories should be written for a **non-technical product owner**.

Follow this MULTI-PHASE process:

---

## PHASE 1: Select Specs

### Step 1.1: List Available Specs

Scan the `agent-os/specs/` directory and list all spec folders.

Check if `agent-os/stories/manifest.md` exists. If it does, read it to determine which specs already have stories written.

### Step 1.2: Present Spec Options

Display the specs to the user:

```
Which specs would you like to include in this story?

1. [spec-name-1]
2. [spec-name-2] (has story)
3. [spec-name-3]
4. [spec-name-4] (has story)
...

Enter numbers (e.g., "1" or "1, 3, 5" or "1-3"):
```

**STOP and wait for user response.**

### Step 1.3: Parse Selection

- Parse the user's input to determine which specs to include
- Support single selection: `1`
- Support comma-separated: `1, 3, 5`
- Support ranges: `1-3`
- Support combinations: `1, 3-5, 7`

---

## PHASE 2: Read Source Material

For each selected spec, read the source material:

### Step 2.1: Determine Available Sources

For each spec:

- Check if `agent-os/specs/[spec]/tasks.md` exists
- Check if `agent-os/specs/[spec]/spec.md` exists

### Step 2.2: Read Sources

**If `tasks.md` exists:**

- Read both `agent-os/specs/[spec]/tasks.md` AND `agent-os/specs/[spec]/spec.md`
- Track which tasks are completed `[x]` vs incomplete `[ ]`

**If only `spec.md` exists:**

- Read just `agent-os/specs/[spec]/spec.md`
- All acceptance criteria derived from spec will be unchecked `[ ]`

---

## PHASE 3: Generate Story

### Step 3.1: Generate Story Content

Write a unified user story covering all selected specs.

**Writing Guidelines - CRITICAL:**

- **Audience is a non-technical product owner** - write in plain language
- Focus on user outcomes and business value, not implementation details
- Describe _what_ will be (or was) delivered, not _how_ it's built
- Avoid code references, API names, or architectural terms
- Keep acceptance criteria focused on observable results (1-3 items ideal per spec)
- Do NOT add superficial specs like security, performance, or anything implied
- Developers reading this are veteran/staff level - be direct, not verbose

**Acceptance Criteria Checkboxes:**

- `[x]` for criteria where the corresponding task is completed
- `[ ]` for criteria where the task is incomplete or derived from spec only

**Story Template:**

```markdown
# [Story Title]

As a [user type], ...

## Acceptance Criteria

- [x] completed result #1
- [x] completed result #2
- [ ] incomplete result #3

## Dev Notes

- Brief technical context if relevant (keep minimal)

_Estimate: [X] points_
```

The title should be a short, descriptive name for the story (e.g., "User Authentication", "Dashboard Filtering").

### Step 3.2: Confirm User Type

Before presenting the full story, confirm who the "user" is:

```
I'm writing this story as:

"As a [user type], ..."

Is "[user type]" correct? (yes / or tell me who it should be):
```

**STOP and wait for user response.**

If the user provides a different user type, update the story accordingly.

### Step 3.3: Present Story and Ask for Estimate

Show the generated story to the user (without the estimate line yet):

```
--- Story Preview ---

[Generated story content without estimate]

---

What's your estimate for this story? (1, 2, 3, 5, 8, 13, 21):
```

**STOP and wait for user response.**

---

## PHASE 4: Save Story and Update Manifest

### Step 4.1: Save Story File

1. Create the `agent-os/stories/` directory if it doesn't exist
2. Count existing story files to determine the next number
3. Generate a kebab-case title from the story title
4. Add the italicized estimate at the bottom of the story
5. Save to `agent-os/stories/[n]-[kebab-title].md`

**Filename examples:**

- `1-user-authentication.md`
- `2-dashboard-filtering.md`
- `3-export-data-csv.md`

### Step 4.2: Update Manifest

Update `agent-os/stories/manifest.md` to track which specs are covered by this story.

**If manifest doesn't exist, create it with this structure:**

```markdown
# Story Manifest

| Spec        | Story            | Date         |
| ----------- | ---------------- | ------------ |
| [spec-name] | [story-filename] | [YYYY-MM-DD] |
```

**If manifest exists, append rows for each spec included in this story:**

| Spec               | Story                    | Date       |
| ------------------ | ------------------------ | ---------- |
| user-auth          | 1-user-authentication.md | 2025-01-15 |
| session-management | 1-user-authentication.md | 2025-01-15 |

Note: Multiple specs can map to the same story file when combined.

---

## PHASE 5: Confirmation

Display a summary:

```
Done! Story created:

📄 agent-os/stories/[n]-[title].md

Specs included:
- [spec-1]
- [spec-2]
...

Manifest updated: agent-os/stories/manifest.md
```

---

## Key Rules

1. **Non-technical language**: Stories are for product owners, not developers
2. **Simplicity over verbosity**: 1-3 acceptance criteria per spec is ideal
3. **No superficial specs**: Don't add implied requirements like security or performance
4. **Checkboxes reflect reality**: `[x]` for done, `[ ]` for not done
5. **Always ask for estimate**: Each story needs a point estimate before saving
6. **Fibonacci scale**: Valid estimates are 1, 2, 3, 5, 8, 13, 21
7. **Track in manifest**: Always update the manifest after saving a story
