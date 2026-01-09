# Ralph Loop - Iterative Task Implementation

This command implements ONE task group at a time from a spec's generated prompts, enabling fresh context windows per task when used with the ralph-wiggum Claude Code plugin.

## Prerequisites

Before running this command, ensure you have:
1. A spec with a `tasks.md` file
2. Generated prompts via `/orchestrate-tasks` (creates files in `agent-os/specs/[spec]/implementation/prompts/`)

## STEP 1: Locate the spec and prompts

IF you already know which spec we're working on, use that spec.

IF you don't know which spec, look for specs in `agent-os/specs/` that have an `implementation/prompts/` folder with prompt files. If multiple exist, ask the user:

```
Which spec should I continue implementing? I found these with pending prompts:

1. [spec-name]
2. [spec-name]
```

Once you have the spec, set these paths:
- Spec folder: `agent-os/specs/[this-spec]/`
- Prompts folder: `agent-os/specs/[this-spec]/implementation/prompts/`
- Tasks file: `agent-os/specs/[this-spec]/tasks.md`

## STEP 2: Find the next incomplete task group

Read `tasks.md` and find the FIRST task group that has unchecked items (`- [ ]`).

Task groups are top-level numbered items like:
```
1. [ ] First Task Group
   - [ ] Sub-task A
   - [ ] Sub-task B

2. [ ] Second Task Group
   - [ ] Sub-task C
```

Identify which task group number is the first incomplete one.

## STEP 3: Find and execute the corresponding prompt

Look in the prompts folder for the prompt file matching that task group number. Prompt files are named like:
- `1-task-group-name.md`
- `2-another-task-group.md`

Read that prompt file and EXECUTE its instructions fully:
- Implement the task group as specified
- Mark completed items as done in tasks.md (`- [x]`)
- Follow any standards or context references in the prompt

## STEP 4: Check completion status and signal

After implementing the task group, check `tasks.md` again.

### IF there are MORE incomplete task groups:

Output this EXACT text:

```
READY_FOR_NEXT

Task group [number] "[name]" has been implemented.

Remaining task groups: [count]

To continue, run /ralph-loop again for the next task group.
```

### IF ALL task groups are now complete:

Output this EXACT text:

```
ALL_TASKS_COMPLETE

All task groups for [spec-name] have been implemented.

Next steps:
- Review the implementation
- Run verification if available
- Commit your changes
```

---

## Usage with ralph-wiggum plugin

Configure the ralph-wiggum Claude Code plugin to run this command repeatedly. It will:
1. Pick the next incomplete task
2. Implement it with full context from the prompt
3. Signal READY_FOR_NEXT or ALL_TASKS_COMPLETE
4. Plugin re-runs until ALL_TASKS_COMPLETE is detected
