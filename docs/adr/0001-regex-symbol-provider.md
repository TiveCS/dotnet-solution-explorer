# Hand-rolled regex symbol extraction instead of VS Code's workspace symbol provider

Symbol search (find a C# type by name, jump to its line) is implemented by scanning source files with a tuned regex and building our own in-memory **Symbol Index**, rather than calling `vscode.executeWorkspaceSymbolProvider`. We chose this because the built-in provider requires the C# language server (OmniSharp / C# Dev Kit) to be running — the exact coupling this extension exists to avoid. The whole reason users reach for this extension is that the language server is slow to activate and degrades IntelliSense/format-on-save; depending on it for our own core feature would defeat the purpose.

The symbol source is hidden behind a **Symbol Provider** interface. The default is the **Regex Provider** (zero dependency). A future **Language Server Provider** can wrap `executeWorkspaceSymbolProvider` and be selected via the `solutionExplorer.symbolProvider` setting for users who have the C# extension and want full accuracy.

## Considered Options

- **Regex Provider (chosen)** — fast, zero language-server dependency, indexes lazily on first search and refreshes per-file on `onDidSaveTextDocument` (an editor event, not a `FileSystemWatcher`, so it does not reintroduce the source-file watching that the project deliberately forbids). Trade-off: regex misses some edge cases (unusual generics, multi-line declarations, names inside comments/strings).
- **Built-in workspace symbol provider** — accurate, but dead on arrival: needs the language server we are avoiding.
- **Hybrid** — use the language server when present, fall back to regex. Deferred; the provider interface keeps this open without committing to the extra complexity now.

## Consequences

- Accuracy is "good enough" (~95%+ of real type declarations), not perfect. Acceptable for navigation; this is not a refactoring tool.
- We own the index lifecycle (build, cache, incremental update) — more code than calling an API, but full control over performance.
- Indexing covers `.cs`, `.razor.cs`, `.cshtml.cs` for type declarations; `.razor` yields one component symbol named after the file. `@code` block internals are not parsed.
