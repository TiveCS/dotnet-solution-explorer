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
A named scaffold for new files. Built-in templates: Class, Interface, Record, Enum, Razor Component, Razor Page (`.razor`), Razor Page with code-behind (`.razor.cs`), Razor View (`.cshtml`), Razor PageModel (`.cshtml.cs`), Blank. User-defined templates use VS Code snippet syntax.

**Naming Convention Rule**:
A user-configurable mapping from filename pattern to template. Example: `I*` → Interface template. Applied automatically during "Add File" to pre-select the matching template.

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
- Auto-detect `.sln` in workspace; prompt via quick-pick if multiple found
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
- Scope = whole solution, reusing the existing obj/bin/.git exclusion set; only files in the project model are indexed

### Custom templates
- User defines template files using VS Code snippet syntax
- Variables: `$TM_FILENAME_BASE`, `${1:ClassName}`, namespace injected as snippet variable

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

## Example dialogue

> **Dev:** "When a user adds a file to a **Folder** inside a **Legacy Project**, what changes?"
> **Domain expert:** "A `<Compile>` or `<Content>` entry is added to the `.csproj`. The **Root Namespace** plus the folder path determines the namespace written into the file."
>
> **Dev:** "What if it's an **SDK-style Project**?"
> **Domain expert:** "Nothing changes in the `.csproj` — the file is picked up by glob. Only the namespace is written, same logic."
>
> **Dev:** "If I move a file between two **Projects**, what happens?"
> **Domain expert:** "File copies on disk. Source project's `.csproj` loses the entry (if legacy), target gains it (if legacy). Namespace in the file is rewritten to match the target **Root Namespace** and new folder path."
