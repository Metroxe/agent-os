# Research

You are helping me research a topic using strictly read-only operations. You will gather information from websites, repositories, CLI tools, and MCP servers, then produce a sourced markdown report.

Follow this MULTI-PHASE process:

---

## PHASE 1: Gather All Context (Single Intake)

### Step 1.1: Check for Previous Research

Before asking questions, check if `agent-os/research/` exists and contains any files. If it does, include them in the prompt below.

### Step 1.2: Ask All Questions at Once

Present all questions in a single prompt:

```
I'll help you research something. Please answer all of the following:

---

**1. Research Question**
What are you trying to figure out? Describe your question or topic clearly.

---

**2. Previous Research**
[If previous research exists, list files here:]
- [filename-1.md] - [first line or title]
- [filename-2.md] - [first line or title]

Should I consider any of these? (enter numbers, or "none")

[If no previous research exists, omit this section entirely]

---

**3. Research Mode**
How should I conduct this research?
- **Checkpoints** - I'll pause at key decisions to check in with you
- **Autonomous** - I'll work independently and present final results

---

**4. Websites**
Any specific websites I should access? For each, indicate if login is needed:
- Example: "docs.example.com (no auth)"
- Example: "admin.example.com (needs login)"

(or "none")

---

**5. CLI Tools**
Which CLI tools do I have access to?
- gh (GitHub CLI)
- gcloud (Google Cloud)
- aws (AWS CLI)
- kubectl (Kubernetes)
- Other: [specify]

(or "none")

---

**6. MCP Servers**
Any MCP servers I should use?
- GitHub MCP (for repository/issue/PR queries)
- Database MCPs
- Custom organization MCPs

(or "none")

---

**7. Repositories**
Any repos that need to be cloned? Provide URLs and I'll clone to `agent-os/repos/`.

(or "none")
```

**STOP and wait for user response with all answers.**

---

## PHASE 2: Execute Research (Strict Read-Only)

### READ-ONLY ENFORCEMENT - CRITICAL

You have **ZERO write permissions** during this research. This is non-negotiable.

**FORBIDDEN ACTIONS:**

- Creating or editing files (except the final research output)
- GitHub: creating issues, PRs, comments, forks, branches, commits
- Any API calls that mutate state
- Running commands that modify data
- Form submissions that change data
- Any MCP tool that creates, updates, or deletes

**IF YOU NEED TO WRITE SOMETHING:**

1. **STOP immediately**
2. Document exactly what you wanted to write or edit
3. Provide step-by-step instructions for the user to do it manually
4. Wait for user confirmation before continuing

**ALLOWED ACTIONS:**

- Reading files, browsing code
- `git clone`, `git log`, `git show`, `git diff` (read operations)
- `gh issue view`, `gh pr view`, `gh api` (GET requests only)
- `gcloud` commands that only read/list resources
- Browser navigation and reading (no form submissions that change data)
- MCP tools that only read/list/search (no create, update, delete operations)

### Step 2.1: Browser Authentication (If Needed)

For each site that requires credentials:

1. Navigate to the site's login page using the browser
2. Display this message:

```
I've navigated to [site-name] login page.

Please log in manually in the browser. Tell me when you're ready to continue.
```

3. **STOP and wait for user confirmation**
4. Continue research on the authenticated session

### Step 2.2: Clone Repositories (If Needed)

For each repository that needs to be cloned:

1. **Check `.gitignore`**: If a `.gitignore` exists in the project root, ensure `agent-os/repos/` is listed. If not, **STOP** and ask the user to add it:

```
The project has a .gitignore but `agent-os/repos/` is not listed.

Please add this line to .gitignore:
agent-os/repos/

Tell me when done.
```

2. **Choose optimal clone strategy** based on the research need:

   - **Searching commits**: `git clone --filter=blob:none [url]` (treeless clone - faster)
   - **Need full history**: `git clone [url]` (standard)
   - **Mirror for reference**: `git clone --mirror [url]`
   - **Recent commits only**: `git clone --depth=N [url]`

3. Clone to: `agent-os/repos/[repo-name]/`

4. **Consider using `gh` CLI** for commit searches when more practical than cloning

5. **NEVER fork** - forking is a write action and is forbidden

### Step 2.3: Conduct Research

Execute your research using the allowed resources:

- Navigate websites using the browser
- Search repositories for relevant code, commits, and history
- Run read-only CLI commands
- Use read-only MCP tools
- Document all sources as you go

If in **Checkpoints mode**, pause at key decision points:

```
I found [brief description of findings].

Should I:
a) Continue exploring [next direction]
b) Pivot to investigate [alternative]
c) Stop here and compile results

Your choice:
```

**STOP and wait for user response** (in Checkpoints mode only).

---

## PHASE 3: Generate Research Report

### Step 3.1: Create Research Directory

If `agent-os/research/` does not exist, create it.

### Step 3.2: Generate Report

Create the research report with today's date and a kebab-case topic name.

**Filename format**: `YYYY-MM-DD-[kebab-topic].md`

**Example**: `2026-01-08-github-action-caching.md`

**Report structure**:

```markdown
# Research: [Topic Title]

**Date:** YYYY-MM-DD
**Original Request:** [Exact user question from the intake]

---

## Answer

[Direct, clear answer to the research question. This should be the primary takeaway.]

---

## Sources

### Web Sources

- [URL 1] - [Brief description of what was found]
- [URL 2] - [Brief description]

### Repository Sources

- [Commit SHA](full-github-url) - [Description of what this commit shows]
- [File path] in [repo] - [Description of relevant content]

### CLI Commands

- `command executed` - [What it revealed]

### MCP Sources

- [MCP Server: Tool Name] - [What it revealed]

---

## Inferences

If any conclusions were drawn from indirect evidence rather than explicit sources:

- **Inference:** [What was inferred]
  - **Based on:** [Evidence that led to this inference]
  - **Confidence:** [High/Medium/Low]

If no inferences were made, state: "All conclusions are directly supported by sources above."

---

## Research Log

[Chronological notes of what was explored, including dead ends and pivots. This provides transparency into the research process.]

1. [Timestamp or step] - [What was tried]
2. [Timestamp or step] - [What was found or why it didn't work]
   ...
```

### Step 3.3: Save and Confirm

Save the report to `agent-os/research/[filename].md`.

Display confirmation:

```
Research complete!

Report saved: agent-os/research/[filename].md

Summary:
- [1-2 sentence summary of the answer]

Sources used:
- [X] web pages
- [Y] repository references
- [Z] CLI commands
- [W] MCP queries
```

---

## Key Rules

1. **Read-only is absolute**: Never perform any write action except saving the final report
2. **Source everything**: Every claim must have a source or be explicitly marked as an inference
3. **Manual auth only**: For credentialed sites, the user logs in manually
4. **Clone strategically**: Use the most efficient clone strategy for the task
5. **No forks ever**: Forking is a write action and is forbidden
6. **Respect mode choice**: In Checkpoints mode, pause at decision points; in Autonomous mode, work to completion
7. **Document dead ends**: The research log should include what didn't work, not just successes
