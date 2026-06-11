# Morning test checklist

Restart the debugger (Run → Start Debugging), open TunaTrail in the dev host.

## Symbol search (new)
- [ ] Press **Alt+P** → QuickPick opens (Ctrl+P style)
- [ ] Type a class name that lives in a differently-named file (your `AuditFindingQueryParams` case) → it appears, description shows the file path, detail shows project
- [ ] Arrow through results → editor **live-previews** each location (scrolls, cursor on the type name)
- [ ] Press **Enter** → file opens for real, cursor centred on the type name
- [ ] Press **Esc** mid-search → returns to the editor you started from
- [ ] First Alt+P shows a brief "Indexing symbols…" then is instant afterward
- [ ] Edit a class name, **save**, Alt+P again → the new name is found (save-based refresh)
- [ ] Search panel also reachable via the 🔍 icon at the top of the Solution Explorer view
- [ ] Settings → `solutionExplorer.symbolSearch.livePreview` = false → navigating no longer previews; only Enter opens (potato mode)

## Project right-click menu (new)
- [ ] **Open .csproj** → opens the project file
- [ ] **Reveal in File Explorer** → Windows Explorer at project dir
- [ ] **Open in Integrated Terminal** → terminal cd'd to project dir
- [ ] File/folder right-click → **Copy Path** / **Copy Relative Path**

## Notes
- Symbol accuracy is regex-based (ADR-0001). ~95%+ of real declarations. If something's missed, tell me the declaration shape.
- `npm test` runs the regex provider unit tests (all passing).
- `languageServer` provider option exists in settings but is not implemented yet — it falls back to regex.

## Known design boundaries (by decision, not bugs)
- External edits (git pull, terminal) don't refresh the symbol index until you save a file in VS Code or reload — deliberate, to avoid watching .cs files.
- `.razor` files index as one component symbol (the file name); `@code {}` internals aren't parsed.
