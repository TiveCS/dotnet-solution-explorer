# Custom Templates: folder format, personal storage, and a hybrid substitution engine

Custom Templates are authored as **folders** (one folder = one template, each file inside is an output file whose name is both its output pattern and an auto-registered naming rule), stored in the extension's **global storage** (personal, not committed), and scaffolded by a **hybrid engine**: `$NAMESPACE` and the `${NAME}` stem are pre-resolved by string replacement and the namespace style is normalised, then the result is inserted through VS Code's snippet engine so tab stops, choices, and built-in variables (`$TM_FILENAME_BASE`, `$CURRENT_YEAR`, …) resolve natively.

This is recorded because it deliberately **reverses a previously documented design**. CONTEXT.md and the `customTemplatesPath` setting claimed custom templates "use VS Code snippet syntax", but the shipped code only did a plain two-token `.replace` (`$TM_FILENAME_BASE`, `$NAMESPACE`) with no snippet engine at all — so authored snippet syntax landed in files literally, the namespace often wasn't wired, and generated type names didn't track the filename. The hybrid engine makes the snippet promise real while keeping the two things snippets cannot express (an inferred namespace, and a name *stem* distinct from the filename) deterministic.

## Considered Options

- **Hybrid pre-resolve + snippet-insert (chosen)** — reliable `$NAMESPACE`/`${NAME}` plus full native snippet power and cursor placement. Trade-off: scaffolding must open the file and `insertSnippet` into the active editor rather than writing bytes directly, and ordering (resolve → style transform → insert) matters.
- **Token replace only** — simplest, fully covers stem composition, but no interactive slots and would mean abandoning the snippet promise.
- **Pure native snippet** — no way to express an inferred namespace or a stem ≠ filename; reproduces today's gaps.

For format and storage:

- **Folder-per-template (chosen)** over a flat single file or a JSON manifest: a folder renders by "emit every file in it", so multi-file templates are a future addition with zero format change; filenames carry placeholders and double as naming patterns; no JSON authoring friction. A bare file in the templates dir remains a valid single-file template for back-compat.
- **Global storage (chosen)** for personal templates, with a repo/workspace folder planned as a second merged source (repo overrides personal by id). Keeps personal templates out of the repo by default while leaving team-shareable templates open.

## Consequences

- The old "snippet syntax" wording in docs/settings is now accurate rather than aspirational.
- Multi-file output is not built in 0.1.2 but the format reserves it; the scaffolder emits exactly one file for now.
- Naming-convention detection now has two sources (the `namingConventions` setting and template filename patterns); precedence: explicit settings win, then longest template-suffix match.
- "Save as Template" auto-tokenises by exact stem-substring replacement after prompting for the stem; unusual cases (casing/pluralisation) are hand-tuned via "Manage Templates".
