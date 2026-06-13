# Edit `.sln` files by targeted string-surgery, not parse-and-serialize

All `.sln` mutations — removing a project, adding/renaming/deleting a **Solution Folder**, reparenting via `NestedProjects`, adding a new or existing **Project** — are performed by inserting or editing only the affected lines of the file and leaving the rest byte-for-byte untouched. We do **not** round-trip the file through `parseSlnFile` and re-emit it from the in-memory model, even though we already parse it for the tree.

We chose this because the `.sln` format carries sections we read nothing from but Visual Studio and `dotnet` care about (`SolutionConfigurationPlatforms`, `ProjectConfigurationPlatforms`, `SolutionProperties`, `ExtensibilityGlobals`, the version preamble, ordering, blank-line layout). A full serializer would have to reproduce every one of these faithfully or risk silently corrupting solutions and producing noisy, churny git diffs. String-surgery is lossless by construction and keeps diffs minimal — only the lines a user's action touches change.

## Considered Options

- **Targeted string-surgery (chosen)** — extends the existing `removeProjectFromSln` approach into a small `slnWriter` (`addSolutionFolder`, `renameEntry`, `setNestedParent`, `addProjectEntry`, …). Lossless, minimal diffs, no obligation to model sections we don't use. Trade-off: insertion-point logic (where to splice a new `Project` block, where the `NestedProjects` GlobalSection lives or must be created) is fiddlier than mutating an object graph.
- **Parse → model → serialize** — cleaner mutation API, but must round-trip every section perfectly or break VS/dotnet; regenerates the whole file, producing large diffs on small edits.
- **`dotnet sln`** — official and always-correct, but has no verb for solution folders or rename, requires the SDK for an operation that is pure text editing, and breaks the zero-external-dependency stance for the explorer's own writes.

## Consequences

- Each writer helper owns its own splice/regex logic and must be unit-tested against real-world `.sln` layouts (CRLF, nested folders, missing `NestedProjects` section).
- A new `Project`/`Solution Folder` entry needs the correct type GUID chosen by file extension (`.csproj` → C#, `.fsproj` → F#, `.vbproj` → VB, solution folder → `2150E333-…`) and a freshly generated project GUID.
- Creating the first nested entry in a flat solution may require synthesising a `GlobalSection(NestedProjects)` block that did not previously exist.
