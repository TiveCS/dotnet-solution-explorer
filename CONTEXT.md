# Solution Explorer

A lightweight VS Code extension that renders a Visual Studio-style Solution Explorer tree from `.sln` and `.csproj` files. Built to replace vscode-solution-explorer with zero language-server coupling and near-instant load times.

## Language

**Solution**:
The root node of the tree, backed by a `.sln` file. One solution is active per workspace session.
_Avoid_: workspace, project root

**Solution Folder**:
A virtual grouping node that exists only in the `.sln` file — no corresponding directory on disk.
_Avoid_: folder, directory, group

**Project**:
A compilable unit backed by a `.csproj`, `.fsproj`, or similar project file. Child of Solution or Solution Folder.
_Avoid_: app, module, assembly

**SDK-style Project**:
A project using `<Project Sdk="...">` format where files are included by filesystem glob by default. Explicit `<Exclude>` entries opt files out.
_Avoid_: new-style project, modern project

**Legacy Project**:
A project where every included file is explicitly listed as `<Compile>` or `<Content>` XML entries. Common in .NET Framework codebases.
_Avoid_: old-style project, Framework project

**Folder**:
A real on-disk directory shown as a tree node under a Project. In legacy projects, may also appear as a virtual `<Folder>` entry in the `.csproj`.
_Avoid_: directory (when used as a tree node concept)

**File Node**:
A leaf node in the tree representing a source file on disk that belongs to the project.
_Avoid_: item, file entry

**Excluded File**:
A file that exists on disk inside a project directory but is excluded from the project (via explicit exclusion in SDK-style, or simply not listed in legacy). Hidden from tree by default; togglable per-project.

**Root Namespace**:
The namespace prefix for a project, sourced from `<RootNamespace>` in the `.csproj`. Combined with folder-relative path to infer namespaces for new and moved files.

**File Template**:
A named scaffold for new files. Built-in templates: Class, Interface, Record, Enum, Razor Component, Razor Page (`.razor`), Razor Page with code-behind (`.razor.cs`), Razor View (`.cshtml`), Razor PageModel (`.cshtml.cs`), Blank.

**Custom Template**:
A user-authored template stored as a **folder** (one folder = one template) containing one or more output files. Each output file's name may carry **Slot** tokens (e.g. `${NAME}Command.cs`); its body carries Slot tokens and may use VS Code snippet syntax (tab stops, choices, built-in variables). Stored personally in the extension's global storage now; a repo-shareable workspace folder is a future second source merged on top. For 0.1.2 a template emits exactly one file, but the folder format imposes no limit — multi-file is a future addition with no format change.
_Avoid_: snippet, scaffold (when meaning the format), boilerplate

**Slot**:
A named placeholder filled when a template is scaffolded. `$NAMESPACE` (auto-inferred) and `${NAME}` (the input **stem**, composable as `${NAME}Command`) are pre-resolved by the extension; the result is then inserted via the VS Code snippet engine, so native snippet features also resolve (`$TM_FILENAME_BASE`, tab stops `${1:T}`, choices, `$CURRENT_YEAR`). Cursor lands on the first tab stop.
_Avoid_: variable, token, field, placeholder (pick "Slot")

**Stem**:
The variable name a user types in "Add File" — the meaningful part a template composes identifiers and the output filename from. Typing `Approve` + template **Command** yields stem `Approve`. For single-name templates the stem is the whole typed name (e.g. built-in **Class**: `Approve` → `Approve.cs`).
_Avoid_: base name, root name

**Naming Convention Rule**:
A mapping from filename pattern to a template, applied during "Add File" to pre-select the matching template and recover the **Stem** from the typed name. Two sources: the user-configurable `namingConventions` setting (e.g. `I*` → Interface) and the **filename pattern of every Custom Template** (e.g. a template whose file is `${NAME}Command.cs` auto-registers `^(.+)Command$` → that template, capturing the stem). Both coexist.

**Lazy Display / Eager Parse**:
The loading strategy: render the solution tree immediately from `.sln` (< 10ms), then parse all `.csproj` files in the background. Project file lists appear instantly when expanded because parsing is already complete.

**Symbol**:
A named C# type declaration — class, interface, record, struct, enum, or delegate — discovered inside a source file. A single file may contain many Symbols. A `.razor` file contributes one Symbol named after the file.
_Avoid_: definition, identifier, token

**Symbol Index**:
The in-memory map of all Symbols in the solution to their file path, line, and column. Built lazily on first symbol search, then kept fresh incrementally on document save.
_Avoid_: cache, database, catalog

**Symbol Provider**:
A pluggable strategy that produces Symbols. The default provider is the **Regex Provider** (lightweight pattern scan, zero language-server dependency). A future **Language Server Provider** can read VS Code's workspace symbol provider when the C# extension is present. The active provider is user-configurable.
_Avoid_: scanner, parser (when referring to the strategy abstraction)

**Symbol Search**:
The user-facing action (default keybinding Alt+P, Ctrl+P-style QuickPick) that fuzzy-matches a typed query against the Symbol Index, live-previews each candidate's location as the user navigates, and on accept opens the file with the cursor on the Symbol's name.
_Avoid_: go to symbol, find type

**Search Scope**:
The set of Projects whose Symbols are included in the Symbol Index (and therefore in Symbol Search). Default: every Project. A Project can be excluded via a per-project tree toggle, persisted per-solution by GUID (PinStore-style). Excluded Projects are never indexed; toggling updates the index incrementally — include adds a Project's files, exclude removes them.
_Avoid_: filter, search filter, included projects

**Pinned Project**:
A Project the user has marked for quick access. Pinned Projects appear in a collapsible **Pin Board** section at the top of the tree, above the Solution node. Pins are personal (not stored in the repo) and scoped to the active solution. A Project that is removed from the solution silently loses its pin.
_Avoid_: bookmark, favourite, starred project

**Pin Board**:
A collapsible group node rendered at the top of the tree that contains all Pinned Projects for the active solution. When empty, the Pin Board is not shown.
_Avoid_: pinned section, favourites panel

## Relationships

- A **Pin Board** contains zero or more **Pinned Projects** for the active solution
- A **Pinned Project** is always a mirror of a **Project** in the loaded solution — it cannot outlive its source Project
- A **Solution** contains zero or more **Solution Folders** and zero or more **Projects**
- A **Solution Folder** can contain other **Solution Folders** and **Projects**
- A **Project** is either **SDK-style** or **Legacy** — never both
- A **Project** contains **Folders** and **File Nodes**
- A **Root Namespace** belongs to exactly one **Project**
- A **File Template** can be built-in or user-defined; user-defined templates use VS Code snippet syntax
- A **Naming Convention Rule** maps a filename pattern to a **File Template**
- A **Symbol** belongs to exactly one source file; a file contains zero or more **Symbols**
- The **Symbol Index** is produced by the active **Symbol Provider**
- **Symbol Search** queries the **Symbol Index**, never the filesystem directly

## Behaviours

### Tree loading
- Auto-detect `.sln` in workspace; exactly one found loads silently; quick-pick if multiple found
- When **zero** `.sln` are detected, never auto-pop a file dialog. Render a **Welcome View** instead — a dead-end-free entry point
- **Welcome View** offers two actions: "Open Solution File…" (native picker filtered to `.sln`, loads directly) and "Open Folder…" (pick any directory, recursively scanned for `.sln` using the standard obj/bin/node_modules exclusion set — 0 found shows a message, 1 loads, many show the quick-pick). "Open Folder…" scans only; it does **not** add the directory as a workspace root
- Show solution structure immediately; parse project contents in background
- Watch only `.sln` and `.csproj` files for changes; manual refresh button as escape hatch
- No dependency on C# Dev Tools, OmniSharp, or any language server

### File operations (Level 3)
- **Add File**: right-click folder → multi-step QuickInput (filename → template); naming convention rules auto-select template; namespace auto-filled from Root Namespace + relative path; editorconfig controls file-scoped vs block-scoped style
- **Add Folder**: creates directory on disk; adds `<Folder>` entry for legacy projects
- **Rename**: F2 inline edit in tree
- **Delete**: moves to OS recycle bin with confirmation; updates `.csproj` for legacy projects
- **Move (file/folder)**: drag-and-drop or right-click → "Move to Project"; updates `.csproj` for legacy projects; auto-updates namespace in moved files
- **Remove Project from Solution**: removes `.sln` reference only; files untouched
- **Delete Project**: confirmation dialog; default = remove from solution only; opt-in = also delete files (Rider pattern)
- **Rename Project**: deferred — renaming a project on disk while the .NET tooling holds `bin`/`obj` proved too unstable on Windows (directory-rename `EPERM`), so it is intentionally not shipped. Re-add an orphaned/renamed project via **Add Existing Project**
- **Keyboard parity**: `F2` and `Del` dispatch by node kind so the tree behaves like a regular file tree — File/Folder use disk rename/delete (batch for delete), Solution Folder uses its `.sln` rename/remove, Project uses Delete Project on `Del` (no `F2` rename for projects). After a New Project, the project is revealed (ancestors expanded) so it is never hidden under a collapsed Solution Folder

### Solution Folder operations
- **New Solution Folder**: right-click the **Solution** root (creates at root) or an existing **Solution Folder** (creates nested). Prompts for a name; rejects empty and names duplicating a sibling folder. Generates a fresh GUID and inserts the `.sln` entry; nested creation also writes a `NestedProjects` parent link. Purely virtual — no directory is created on disk
- **Rename Solution Folder**: edits the `.sln` only. A solution-folder entry carries its name in both the name and path fields of the `Project(...)` line — both are rewritten
- **Delete Solution Folder**: cascade-removes the folder and every descendant (nested folders + projects) from the `.sln`, matching Visual Studio. Projects are un-referenced only; their files are never deleted. Modal confirmation states how many projects will be removed. Consistent with **Remove from Solution** (`.sln` edit only)
- **Reparent** (Move to Solution Folder): a **Project** or **Solution Folder** can be moved between solution folders (or to root) via right-click "Move to Solution Folder…" (quick-pick of folders + "(root)") or by drag-and-drop onto a **Solution Folder** / **Solution** root. Rewrites the `NestedProjects` link only — no files move on disk
- `.sln` writes use targeted string-surgery (insert/edit only the affected lines), preserving the rest of the file byte-for-byte — never a full re-serialize (see ADR)

### Project lifecycle operations
- **Add Existing Project**: right-click the **Solution** root or a **Solution Folder** → pick a `.csproj`/`.fsproj`/`.vbproj` already on disk → insert a `Project(...)` entry with the language-appropriate type GUID, path stored relative to the `.sln` dir. If invoked on a Solution Folder, nest it there. Rejects a project already referenced. No SDK required
- **New Project**: scaffolds via `dotnet new` (see ADR). Flow: choose template → name → location. Templates are discovered by running `dotnet new list` (parsed by the `----` separator row, `DOTNET_CLI_UI_LANGUAGE=en`, cached per session). No target-framework prompt — the installed SDK's default TFM is used. Default output dir is the deepest **real** directory matching the solution-folder chain: descend into a folder segment only when a directory of that name actually exists on disk, and stop at the first virtual segment (so a project under purely-virtual folders defaults to the solution root). Always shown **editable**. Runs `dotnet new <shortname> -n <name> -o <dir>` with a progress notification, then adds the produced project to the `.sln` (nested under the invoking Solution Folder). After completion: refresh and reveal the new project node; no file is auto-opened
- **New Project** requires the .NET SDK on `PATH` (detected via `dotnet --version`); when absent, it shows an actionable error. The explorer's load/parse path never invokes `dotnet` — it runs only during these explicit user actions, so the lightweight load/idle promise is unaffected

### Pin Board
- Right-click any **Project** → "Pin to Top" adds it to the **Pin Board**; "Unpin" removes it
- **Pin Board** renders as a collapsible group node at the very top of the tree, above the Solution node
- Each **Pinned Project** is a fully interactive Project node — expandable to Folders and File Nodes, all context menu actions available
- When the active solution changes or a pinned Project is no longer in the solution, that pin is silently dropped
- An empty Pin Board is not shown

### Reveal in tree
- Manual only (command/button); auto-tracking is OFF by default; toggleable in settings

### Excluded files
- Hidden by default; toggleable per-project (not solution-wide)

### Git decorations
- Show modified/untracked indicators on tree nodes via VS Code SourceControl API; zero language-server dependency

### Symbol search
- Default keybinding Alt+P (user-rebindable); QuickPick UX modelled on Ctrl+P
- **Symbol Index** built lazily on first search (progress shown), not at solution load — preserves the fast-load promise
- Index kept fresh via `onDidSaveTextDocument` (an editor event, NOT a FileSystemWatcher) — re-indexes only the saved file. This deliberately avoids watching `.cs` files on disk, consistent with the no-source-watcher rule. External edits (git pull, terminal) require manual refresh
- **Regex Provider** indexes `.cs`, `.razor.cs`, `.cshtml.cs` for type declarations; `.razor` contributes one component Symbol named after the file; `@code` block internals are not parsed
- One QuickPick entry per Symbol (not per file); label = kind icon + type name, description = relative path, detail = project
- Live preview on navigate (`onDidChangeActiveItem`, preserveFocus); Enter opens non-preview and centres cursor on the type name; Escape restores the prior editor
- Live preview is **configurable** (default ON). When disabled, navigating the list does nothing; only Enter opens + jumps — cheaper for low-spec machines
- Scope = whole solution by default, reusing the existing obj/bin/.git exclusion set; only files in the project model are indexed
- **Search Scope** is user-narrowable: right-click a Project → "Include in / Exclude from Symbol Search" (default included), plus a "Set Symbol Search Scope…" multi-select quick-pick to flip many at once. The toggle is multi-select aware (Ctrl+click several, right-click one — the clicked node sets the direction) and also accepts a **Solution Folder**, which cascades to every Project beneath it (recursively). Stored per-solution by GUID (personal, not committed). Excluded Projects are skipped at index-build time; a scope change persists the GUID set then invalidates the index so the next search rebuilds from the filtered file set — the on-disk symbol cache keeps that rebuild cheap (mtime hits, no re-parse). Excluded Projects show a slashed icon + "search off" badge

### Custom templates
- A **Custom Template** is a folder (one folder = one template). Folder name = label; each file's name is both its output pattern and an auto-registered **Naming Convention Rule**. For 0.1.2 a template emits one file; the folder format extends to multiple files later with no format change
- **Storage**: personal templates live in the extension's global storage (not committed). A repo-shareable workspace folder is a planned second source, merged on top (repo overrides personal by id)
- **Slot substitution (hybrid)**: `$NAMESPACE` and `${NAME}` (the stem, composable) are pre-resolved by string replace; the namespace-style transform (file-scoped vs block) is applied; then the body is inserted via the VS Code snippet engine so `$TM_FILENAME_BASE`, tab stops, choices, and built-in variables resolve natively and the cursor lands on the first tab stop (see ADR)
- **Add File flow**: user types a **Stem**; the chosen template's filename pattern derives the actual file name (`${NAME}Command.cs` → `ApproveCommand.cs`). Typing a full name that matches a template's pattern auto-recommends that template and recovers the stem (mirrors `I*` → Interface)
- **Authoring commands**: "Save as Template" (right-click an existing file → prompts for the stem substring, replaces its occurrences with `${NAME}` and the detected namespace with `$NAMESPACE`, derives the filename pattern, saves to global storage); "New Template" (blank starter folder pre-seeded with slot tokens, opened for editing); "Manage Templates" (opens the global templates folder)

## Configurable settings
- Naming convention → template rules (default set provided, user-extensible)
- Default template when no naming rule matches
- Namespace style override (file-scoped vs block-scoped, falls back to editorconfig)
- Excluded files visibility (per-project toggle)
- Reveal-in-tree auto-tracking (default OFF)
- Symbol Provider strategy (default: regex; future: language-server)
- Symbol search keybinding (default Alt+P)
- Symbol search live preview (default ON; disable for low-spec machines)

## Flagged ambiguities

- "folder" was used to mean both a real directory and a VS virtual Solution Folder — resolved: **Folder** = real directory node under a Project; **Solution Folder** = virtual grouping node in the solution.
- "delete project" vs "remove project" — resolved: **Remove from Solution** = `.sln` edit only (default); **Delete Project** = files also deleted (opt-in confirmation).
- "drag and drop" now carries two meanings — resolved: dragging a **File**/**Folder** = disk move between Projects (existing); dragging a **Project**/**Solution Folder** onto a **Solution Folder** or **Solution** root = `.sln` reparent (NestedProjects rewrite, no files move). `handleDrop` branches on payload type.
- "solution folders are virtual (no disk dir)" vs **New Project** defaulting its disk path to the solution-folder hierarchy — resolved: the default descends only through solution-folder segments that have a **matching real directory**; the first virtual segment stops the descent (project defaults to the solution root). Virtual folders are never materialised on disk. The default is always editable.

## Example dialogue

> **Dev:** "When a user adds a file to a **Folder** inside a **Legacy Project**, what changes?"
> **Domain expert:** "A `<Compile>` or `<Content>` entry is added to the `.csproj`. The **Root Namespace** plus the folder path determines the namespace written into the file."
>
> **Dev:** "What if it's an **SDK-style Project**?"
> **Domain expert:** "Nothing changes in the `.csproj` — the file is picked up by glob. Only the namespace is written, same logic."
>
> **Dev:** "If I move a file between two **Projects**, what happens?"
> **Domain expert:** "File copies on disk. Source project's `.csproj` loses the entry (if legacy), target gains it (if legacy). Namespace in the file is rewritten to match the target **Root Namespace** and new folder path."
