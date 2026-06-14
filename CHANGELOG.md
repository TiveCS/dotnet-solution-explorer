# Changelog

## 0.1.3

### Added
- **Symbol Search scope**: limit which projects Symbol Search (Alt+P) covers. Right-click a Project → **Include in / Exclude from Symbol Search**, or right-click a **Solution Folder** to cascade the change to every project beneath it. The toggle is **multi-select aware** — Ctrl+click several projects/folders, right-click one, and the whole selection follows (the clicked node sets the direction). There's also **Set Symbol Search Scope…** (view title `…` menu or right-click the Solution) for a multi-select of all projects. Scope is personal (stored per-solution by GUID, not committed). Excluded projects are never indexed and show a slashed icon + "search off" badge; changing the scope rebuilds the index on the next search from the filtered file set (the on-disk symbol cache keeps that fast).
- **Custom Template overhaul**: custom templates are now **folders** (one folder = one template) in the extension's global storage; the file inside carries a `${NAME}` pattern that derives the output filename and doubles as a naming rule (`${NAME}Command.cs` → type `Approve`, get `ApproveCommand.cs`). Bare files in the templates dir still work as single-file templates, and the `customTemplatesPath` setting is still read. Custom templates now run through a **hybrid snippet engine**: `$NAMESPACE` and `${NAME}` are pre-resolved, then the body is inserted as a VS Code snippet so `$TM_FILENAME_BASE`, tab stops, choices, and built-in variables resolve natively and the cursor lands on the first tab stop. New authoring commands: **Save as Template** (right-click a file → tokenize it), **New Template** (blank scaffold), **Manage Templates** (open the folder). See [ADR-0004](docs/adr/0004-custom-template-architecture.md).

## 0.1.2

### Added
- **Welcome view**: when no `.sln` is detected, the panel no longer pops a file dialog (which left you stuck if you cancelled). It shows **Open Solution File** and **Open Folder** actions instead. A single `.sln` in the workspace still loads automatically.
- **Open Folder**: pick any directory and it is scanned (recursively, skipping `obj`/`bin`/`node_modules`) for `.sln` files — 1 loads, many show a picker. The folder is only scanned, not added as a workspace root.
- **Solution Folders**: create (right-click the Solution or a Solution Folder; nesting supported), rename, and remove. Removing a folder cascade-removes its contents from the solution (project files are never deleted) after a confirmation showing how many projects are affected.
- **Reparent**: move a Project or Solution Folder between Solution Folders (or to the root) via right-click **Move to Solution Folder…** or by dragging it onto a Solution Folder / the Solution root. Rewrites the `.sln` only; no files move on disk.
- **New Project**: scaffolds with `dotnet new` (templates discovered from `dotnet new list`), then adds the project to the `.sln`. Requires the .NET SDK on `PATH`; shows a clear message if it is missing.
- **Add Existing Project**: reference a `.csproj`/`.fsproj`/`.vbproj` already on disk, optionally nested under a Solution Folder.
- **Keyboard parity**: `F2` (rename) now also renames Solution Folders, and `Del` (delete) now acts on Solution Folders and Projects too, not just files/folders — the tree behaves like a regular file tree. `Del` on a Project opens the existing remove/delete-files prompt. (Project *rename* is intentionally not included — see below.)

### Changed
- `.sln` edits (add/rename/remove/reparent) use targeted string-surgery that preserves the rest of the file byte-for-byte. See [ADR-0002](docs/adr/0002-sln-string-surgery-writes.md) and [ADR-0003](docs/adr/0003-dotnet-new-for-scaffolding.md).

## 0.1.1

### Fixed
- Symbol search (Alt+P): non-C# projects (docker-compose `.dcproj`, etc.) no longer pollute project labels — all symbols showing "docker-compose" instead of their real project name.
- Batch delete via keyboard (Delete key) now deletes all selected items, not just the focused one.
- Batch delete shows a single confirmation dialog for all selected items.
- Move to Project via right-click now moves all selected files/folders in one operation.
- Folder move implemented: right-click "Move to Project" on a Folder now moves the entire directory, updates namespaces in all `.cs` files, and handles legacy `.csproj` entries.
- Drag-and-drop now supports folders in addition to files.
- F2 keybinding now triggers rename on the focused item.
- Rename dialog pre-selects the filename stem only — extension is no longer accidentally deleted when typing a new name.

### Added
- **Pin Board**: right-click any project → "Pin to Top" to surface it in a collapsible Pinned section at the top of the tree. Pins are personal (stored per-solution, not committed to the repo). Right-click a pinned project → "Unpin" to remove it.
- Symbol index disk cache: large solutions no longer re-parse all files on every VS Code restart — only files changed since the last session are re-indexed.

## 0.1.0

- Initial release.
- Visual Studio-style Solution Explorer tree for `.sln` / `.csproj`.
- Pure in-process XML parsing, zero language-server coupling.
- Add / rename / delete / move files and folders.
- Symbol search (Alt+P) via regex provider with live preview.
- File templates with naming-convention auto-selection.
