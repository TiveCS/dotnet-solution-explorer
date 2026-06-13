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

## 0.1.3 — PLANNED (not implemented yet)

Both features are fully designed in `CONTEXT.md` (terms: Search Scope, Custom
Template, Slot, Stem) and [`docs/adr/0004-custom-template-architecture.md`], but
**no code exists yet**.

### 1. Symbol Search scope (Alt+P)
- Default = all projects. Per-project tree toggle "Include in / Exclude from Symbol Search", persisted per-solution by GUID (PinStore-style), plus a "Set Search Scope…" multi-select.
- Filter at index-build (excluded projects never indexed); mid-session toggle updates the index incrementally (exclude → drop files, include → index that project, disk-cache hit if seen).

### 2. Custom Template overhaul
- **Folder-per-template** format (one folder = one template; filenames carry `${NAME}` patterns and double as Naming Convention Rules). Multi-file output reserved; 0.1.3 emits one file.
- **Storage**: personal templates in extension global storage now; a repo-shared workspace folder merged on top later.
- **Hybrid slot engine**: pre-resolve `$NAMESPACE` + `${NAME}` (stem), then `insertSnippet` so `$TM_FILENAME_BASE`, tab stops, choices resolve natively. This finally makes the "snippet syntax" promise real (today's code only does a 2-token `.replace` — see ADR-0004).
- **Add File flow**: type a Stem; the chosen template's filename pattern derives the file; typing a full matching name auto-recommends the template and recovers the stem.
- **Authoring commands**: Save as Template (auto-tokenize an existing file), New Template (blank scaffold), Manage Templates (open the folder).

> Known doc/code mismatch to fix in 0.1.3: `CONTEXT.md` and the
> `solutionExplorer.customTemplatesPath` setting claim "VS Code snippet syntax",
> but `namespaceInferrer.buildFileContent` only does a plain `$TM_FILENAME_BASE` /
> `$NAMESPACE` string replace. The hybrid engine above resolves this.
