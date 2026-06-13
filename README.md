# Solution Explorer

A lightweight Visual Studio-style **Solution Explorer** for VS Code, built for .NET developers who want the `.sln`/`.csproj` tree without the weight of a full language server.

Made because the C# Dev Kit's solution tooling is being sunset and existing extensions are slow to load and can degrade IntelliSense / format-on-save. The tree loads and renders by **pure XML parsing in-process** — no OmniSharp/Roslyn dependency, no watching of source files, and no `dotnet` CLI on the load or idle path. (The optional **New Project** action shells out to `dotnet new` only when you explicitly invoke it.)

## Features

- **Logical solution tree** — mirrors the `.sln`/`.csproj` structure (Solution Folders, Projects, Folders, Files), not the raw filesystem.
- **Open from anywhere** — a single `.sln` loads automatically; otherwise a welcome panel offers **Open Solution File** or **Open Folder** (scans a directory for `.sln`, without adding it as a workspace root).
- **Solution folder management** — create (at root or nested), rename, and remove Solution Folders; reparent Projects/Solution Folders by drag-drop or "Move to Solution Folder…".
- **Add projects** — **New Project** (scaffolds via `dotnet new`, then adds it to the `.sln`) and **Add Existing Project** (references a `.csproj`/`.fsproj`/`.vbproj` already on disk).
- **Both project formats** — SDK-style (glob-based) and legacy (explicit `<Compile>`/`<Content>`) projects.
- **Blazing-fast load** — the solution tree renders immediately from the `.sln`; project files are parsed in the background so expansion is instant.
- **Dedicated activity-bar panel** — separate from the file Explorer, no Outline/Timeline clutter.
- **Symbol search (`Alt+P`)** — Ctrl+P-style fuzzy search across **C# type names**, not just file names. Find `AuditFindingQueryParams` even when it lives in `AuditFindingViewModel.cs`, with live preview and jump-to-type.
- **File operations** — add file (template-aware), add folder, rename (F2), delete (recycle bin), move between projects (drag-drop or menu) with namespace updates.
- **Templates** — Class, Interface, Record, Enum, Abstract Class, Razor Component, Razor Page, Razor PageModel, Blank, plus user-defined templates (VS Code snippet syntax). Naming conventions auto-select a template (`I*` → Interface).
- **Namespace inference** — `<RootNamespace>` + folder path; file-scoped vs block-scoped follows `.editorconfig`.
- **Project menu** — Open `.csproj`, Reveal in File Explorer, Open in Integrated Terminal, Copy Path / Relative Path.
- **Git decorations** on tree nodes (via VS Code's SCM API — no language server).

## Symbol search

| | |
|---|---|
| Trigger | `Alt+P` (rebindable), or the 🔍 icon in the panel title |
| Indexes | `.cs`, `.razor.cs`, `.cshtml.cs` type declarations; `.razor` as one component |
| Build | Lazily on first search, then cached |
| Freshness | Re-indexes a file when you **save** it (no `.cs` filesystem watcher) |
| Navigate | Live preview as you arrow (toggle off for low-spec machines) |
| Open | `Enter` opens the file, cursor centred on the type name; `Esc` restores your editor |

Symbol extraction uses a regex provider by default (zero language-server dependency — see [ADR-0001](docs/adr/0001-regex-symbol-provider.md)). A `languageServer` provider option is reserved for the future.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `solutionExplorer.namingConventions` | `I* → Interface`, … | Filename pattern → template rules |
| `solutionExplorer.defaultTemplate` | `Class` | Template when no naming rule matches |
| `solutionExplorer.namespaceStyle` | `auto` | `auto` (read `.editorconfig`) / `file-scoped` / `block-scoped` |
| `solutionExplorer.customTemplatesPath` | `""` | Directory of custom template files |
| `solutionExplorer.autoRevealActiveFile` | `false` | Auto-reveal active editor file in the tree |
| `solutionExplorer.symbolProvider` | `regex` | `regex` / `languageServer` (latter falls back to regex) |
| `solutionExplorer.symbolSearch.livePreview` | `true` | Live-preview results while navigating |

## Development

```bash
npm install
npm run build      # bundle with esbuild
npm run watch      # rebuild on change
npm test           # run the regex provider + .sln writer unit tests
```

Press **F5** (or Run → Start Debugging) to launch the Extension Development Host, then open a folder containing a `.sln`.

## Design notes

- Project model and key decisions: [`CONTEXT.md`](CONTEXT.md)
- Architectural decisions: [`docs/adr/`](docs/adr/)

### Intentional boundaries

- External edits (git pull, terminal) don't refresh the symbol index until you save a file in VS Code or reload — deliberate, to avoid the source-file watching that slows other extensions.
- Only `.sln` and `.csproj`/`.fsproj`/`.vbproj` are watched for tree changes; use the refresh button for filesystem-level changes.

## License

MIT
