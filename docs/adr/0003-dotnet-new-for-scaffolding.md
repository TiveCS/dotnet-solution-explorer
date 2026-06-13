# Scaffold new projects by shelling out to `dotnet new`

The **New Project** action creates project files by running the user's installed .NET SDK (`dotnet new <shortname> -n <name> -o <dir>`, templates discovered via `dotnet new list`) rather than writing project files from hand-maintained built-in templates. This is the extension's first dependency on an external process.

This looks like a violation of the project's "zero coupling, pure in-process parse" ethos, so it is recorded deliberately. That ethos is about the explorer's **load and idle path**: rendering and parsing the tree must never need the .NET SDK, OmniSharp, or any language server running. `dotnet new` does not enter that path — it runs only during an explicit, occasional user action, as a one-off child process that exits immediately. Activation, tree rendering, `.sln`/`.csproj` parsing, and idle behaviour are untouched, so the lightweight promise holds. In exchange we get always-correct, up-to-date templates across the full range the SDK offers, with `TargetFramework` and NuGet restore handled for us — none of which we could maintain by hand without drift.

## Considered Options

- **`dotnet new` (chosen)** — correct, full template coverage, no scaffolding logic to maintain. Requires the SDK on `PATH`; detected via `dotnet --version`, with an actionable error when absent. **Add Existing Project** deliberately needs no SDK, so users without one are not locked out of populating a solution.
- **Hand-written SDK-style templates** — instant and fully in-process, but a small fixed set, output drifts from real `dotnet new`, no restore, and every template is maintained by hand.
- **`dotnet new` with hand-written fallback** — best coverage but two scaffolders producing divergent output; most surface and risk. Rejected for this release.

## Consequences

- New Project is unavailable (clear error, not a silent failure) when the SDK is missing; the rest of the extension is unaffected.
- `dotnet new list` output is locale- and SDK-version-sensitive; it is parsed by the `----` separator row rather than header text, run with `DOTNET_CLI_UI_LANGUAGE=en`, and cached per session.
- `dotnet new` creates files only; adding the produced project to the `.sln` is a separate step handled by the `slnWriter` (see ADR-0002).
