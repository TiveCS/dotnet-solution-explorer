# Roadmap

Status of planned work. Design lives in [`CONTEXT.md`](../CONTEXT.md) and `docs/adr/`;
this file tracks what is **built vs. planned** so a fresh session doesn't mistake
design notes for shipped features.

## 0.1.2 — shipped

- Welcome view (Open Solution File / Open Folder scan; no auto-prompt dead end)
- Solution Folder CRUD + reparent (menu + drag-drop)
- New Project (`dotnet new`) + Add Existing Project
- Keyboard parity: F2 renames Solution Folders; Del deletes Solution Folders / Projects
- Rename Project: **prototyped and dropped** (Windows `bin`/`obj` lock → `EPERM`, too unstable)

## 0.1.3 — shipped

### 1. Symbol Search scope (Alt+P) — **shipped**
- Default = all projects. Tree toggle "Include in / Exclude from Symbol Search" (`solutionExplorer.toggleSearchScope`) on Projects and Solution Folders (folders cascade to descendant projects); multi-select aware (clicked node sets direction). Persisted per-solution by GUID (`ScopeStore`, PinStore-style), plus a "Set Symbol Search Scope…" multi-select (`solutionExplorer.setSearchScope`, view title overflow + Solution context menu).
- Filter at index-build: excluded projects are never indexed (`getAllIndexableFiles` skips them). A scope change persists the GUID set then calls `SymbolIndex.invalidate()`, so the next Alt+P rebuilds from the filtered file source — the on-disk symbol cache keeps that rebuild cheap (mtime hits, no re-parse). Saves to excluded projects are ignored (`isPathOutOfScope`). Excluded projects show a `circle-slash` icon + "search off" badge in the tree.

### 2. Custom Template overhaul — **shipped**
- **Folder-per-template** format (one folder = one template; the file inside carries a `${NAME}` pattern and doubles as a Naming Convention Rule). Bare files in the templates dir remain valid single-file templates. Multi-file output reserved; 0.1.3 emits one file. (`templateManager.scanTemplatesDir` / `loadFolderTemplate`)
- **Storage**: personal templates in extension global storage (`globalStorageUri/templates/`); the legacy `customTemplatesPath` setting is still read as a secondary flat source. (Repo-shared workspace folder still deferred.)
- **Hybrid slot engine**: pre-resolve `$NAMESPACE` + `${NAME}` (stem) via `namespaceInferrer.resolveCustomSlots`, then `editor.insertSnippet` so `$TM_FILENAME_BASE`, tab stops, and choices resolve natively and the cursor lands on the first tab stop. Built-ins keep the deterministic byte-write path. (`fileOperations.addFile`)
- **Add File flow**: type a Stem; the chosen template's `${NAME}` pattern derives the filename; typing a full matching name auto-recommends the template and recovers the stem (`templateManager.detectTemplate`, longest-suffix match; explicit `namingConventions` settings still win).
- **Authoring commands**: Save as Template (auto-tokenize an existing file → `solutionExplorer.saveAsTemplate`), New Template (blank scaffold → `solutionExplorer.newTemplate`), Manage Templates (open the folder → `solutionExplorer.manageTemplates`). (`operations/templateOperations.ts`)

> Doc/code mismatch resolved: the "VS Code snippet syntax" promise in `CONTEXT.md`
> and the `customTemplatesPath` setting is now real for custom templates via the
> hybrid engine (built-ins still use the plain `buildFileContent` replace).
