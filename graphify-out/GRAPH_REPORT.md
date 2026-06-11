# Graph Report - .  (2026-06-12)

## Corpus Check
- Corpus is ~10,979 words - fits in a single context window. You may not need a graph.

## Summary
- 288 nodes · 538 edges · 15 communities (12 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Regex Symbol Provider|Regex Symbol Provider]]
- [[_COMMUNITY_Solution & Project Model|Solution & Project Model]]
- [[_COMMUNITY_Extension Settings Schema|Extension Settings Schema]]
- [[_COMMUNITY_File & Project Mutations|File & Project Mutations]]
- [[_COMMUNITY_Extension Manifest|Extension Manifest]]
- [[_COMMUNITY_Commands & Activation|Commands & Activation]]
- [[_COMMUNITY_Design Decisions (ADR)|Design Decisions (ADR)]]
- [[_COMMUNITY_TypeScript Compiler Config|TypeScript Compiler Config]]
- [[_COMMUNITY_Build Pipeline (esbuild)|Build Pipeline (esbuild)]]
- [[_COMMUNITY_File Templates & Naming|File Templates & Naming]]
- [[_COMMUNITY_Path & File Utilities|Path & File Utilities]]
- [[_COMMUNITY_Branding & Icon|Branding & Icon]]
- [[_COMMUNITY_Template Concepts|Template Concepts]]
- [[_COMMUNITY_Excluded File|Excluded File]]
- [[_COMMUNITY_Git Decorations (SCM)|Git Decorations (SCM)]]

## God Nodes (most connected - your core abstractions)
1. `SolutionTreeProvider` - 30 edges
2. `registerCommands()` - 15 edges
3. `SymbolIndex` - 15 edges
4. `TreeNode` - 13 edges
5. `compilerOptions` - 12 edges
6. `ProjectNode` - 11 edges
7. `addFile()` - 10 edges
8. `executeMoveFiles()` - 10 edges
9. `parseProjectFile()` - 10 edges
10. `SlnData` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Pure In-Process XML Parsing` --semantically_similar_to--> `No-Source-Watcher Rule`  [INFERRED] [semantically similar]
  README.md → CONTEXT.md
- `ADR-0001 Regex Symbol Provider` --references--> `Regex Provider`  [EXTRACTED]
  docs/adr/0001-regex-symbol-provider.md → CONTEXT.md
- `moveFileCommand()` --calls--> `resolveFromDir()`  [INFERRED]
  src/operations/moveOperation.ts → src/utils/pathUtils.ts
- `findProjectForFile()` --calls--> `resolveFromDir()`  [INFERRED]
  src/operations/moveOperation.ts → src/utils/pathUtils.ts
- `Solution Explorer Extension` --references--> `Solution`  [EXTRACTED]
  README.md → CONTEXT.md

## Import Cycles
- 1-file cycle: `esbuild.js -> esbuild.js`
- 2-file cycle: `src/operations/moveOperation.ts -> src/tree/solutionTreeProvider.ts -> src/operations/moveOperation.ts`

## Hyperedges (group relationships)
- **Symbol Search Pipeline** — context_symbol_search, context_symbol_index, context_symbol_provider, context_symbol [EXTRACTED 1.00]
- **Zero Language-Server Coupling Design** — context_regex_provider, readme_pure_xml_parsing, context_no_source_watcher_rule, adr_0001_regex_symbol_provider [INFERRED 0.85]

## Communities (15 total, 3 thin omitted)

### Community 0 - "Regex Symbol Provider"
Cohesion: 0.08
Nodes (22): CSHARP_EXTS, DELEGATE_DECL, makeSymbol(), RegexSymbolProvider, stripComments(), TYPE_DECL, FileSource, IndexableFile (+14 more)

### Community 1 - "Solution & Project Model"
Cohesion: 0.13
Nodes (14): ProjectData, SlnData, SlnProject, FileNode, FolderNode, nodeId(), NodeKind, ProjectNode (+6 more)

### Community 2 - "Extension Settings Schema"
Cohesion: 0.05
Nodes (39): properties, title, configuration, properties, type, pattern, solutionExplorer.autoRevealActiveFile, solutionExplorer.customTemplatesPath (+31 more)

### Community 3 - "File & Project Mutations"
Cohesion: 0.16
Nodes (25): addFile(), deleteNode(), renameNode(), executeMoveFiles(), findProjectForFile(), moveFileCommand(), updateNamespaceInFile(), addFileToCsproj() (+17 more)

### Community 4 - "Extension Manifest"
Cohesion: 0.06
Nodes (30): activationEvents, categories, contributes, commands, keybindings, menus, views, viewsContainers (+22 more)

### Community 5 - "Commands & Activation"
Cohesion: 0.17
Nodes (23): addFolder(), deleteProject(), removeProjectFromSolution(), copyPath(), copyRelativePath(), openInTerminal(), openProjectFile(), revealInOS() (+15 more)

### Community 6 - "Design Decisions (ADR)"
Cohesion: 0.12
Nodes (23): ADR-0001 Regex Symbol Provider, File Node, Folder, Language Server Provider, Lazy Display / Eager Parse, Legacy Project, Symbol Search Live Preview, No-Source-Watcher Rule (+15 more)

### Community 7 - "TypeScript Compiler Config"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, lib, module, outDir, resolveJsonModule, rootDir (+6 more)

### Community 8 - "Build Pipeline (esbuild)"
Cohesion: 0.18
Nodes (11): ctx, esbuild, production, watch, devDependencies, esbuild, @types/minimatch, @types/node (+3 more)

### Community 9 - "File Templates & Naming"
Cohesion: 0.31
Nodes (8): BUILTIN_TEMPLATES, FileTemplate, getTemplate(), detectTemplateFromName(), matchWildcard(), NamingRule, loadCustomTemplates(), pickTemplate()

### Community 10 - "Path & File Utilities"
Cohesion: 0.22
Nodes (5): revealFile(), DirScan, PROJECT_FILE_EXTS, resolveFromDir(), SDK_EXCLUDES

### Community 11 - "Branding & Icon"
Cohesion: 1.00
Nodes (3): Solution Explorer Extension Branding, Solution Explorer Extension Icon, Document Panel with List Lines Glyph

## Knowledge Gaps
- **100 isolated node(s):** `esbuild`, `production`, `watch`, `ctx`, `name` (+95 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SolutionTreeProvider` connect `Solution & Project Model` to `Path & File Utilities`, `File & Project Mutations`, `Commands & Activation`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Why does `contributes` connect `Extension Manifest` to `Extension Settings Schema`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **What connects `esbuild`, `production`, `watch` to the rest of the system?**
  _101 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Regex Symbol Provider` be split into smaller, more focused modules?**
  _Cohesion score 0.07973421926910298 - nodes in this community are weakly interconnected._
- **Should `Solution & Project Model` be split into smaller, more focused modules?**
  _Cohesion score 0.13360323886639677 - nodes in this community are weakly interconnected._
- **Should `Extension Settings Schema` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._
- **Should `Extension Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._