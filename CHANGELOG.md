# Changelog

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
