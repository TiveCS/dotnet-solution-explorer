import * as path from 'path';
import * as vscode from 'vscode';
import { detectNamespaceStyle, NamespaceStyle } from '../parser/editorConfigParser';

export async function inferNamespace(
  absoluteFilePath: string,
  projectDir: string,
  rootNamespace: string
): Promise<string> {
  const rel = path.relative(projectDir, path.dirname(absoluteFilePath));
  const parts = rel.split(path.sep).filter(p => p && p !== '.');
  const segments = [rootNamespace, ...parts.map(sanitizeSegment)].filter(Boolean);
  return segments.join('.');
}

export async function getNamespaceStyle(fileDir: string): Promise<NamespaceStyle> {
  const config = vscode.workspace.getConfiguration('solutionExplorer');
  const override = config.get<string>('namespaceStyle', 'auto');
  if (override === 'file-scoped') return 'file_scoped';
  if (override === 'block-scoped') return 'block_scoped';
  return detectNamespaceStyle(fileDir);
}

export function buildFileContent(
  template: string,
  namespace: string,
  className: string,
  style: NamespaceStyle
): string {
  const content = template
    .replace(/\$TM_FILENAME_BASE/g, className)
    .replace(/\$NAMESPACE/g, namespace);

  if (style === 'file_scoped') return content;

  // Convert file-scoped namespace to block-scoped
  return content.replace(
    /^namespace (.+);$/m,
    (_, ns) => `namespace ${ns}\n{`
  ).replace(/\n$/, '\n}');
}

/**
 * Forgive a bare `$NAME` (no braces) by promoting it to `${NAME}` — a natural
 * mistake since the namespace slot is the brace-less `$NAMESPACE`. Never touches
 * `$NAMESPACE` (lookahead) or an already-braced `${NAME}` (a `{` follows the `$`).
 */
export function normalizeNameSlots(text: string): string {
  return text.replace(/\$NAME(?!SPACE)/g, '${NAME}');
}

/**
 * Hybrid slot engine (ADR-0004): pre-resolve the two slots VS Code snippets
 * cannot express — `$NAMESPACE` (inferred) and `${NAME}` (the stem, distinct
 * from the filename) — and apply the namespace-style transform. The returned
 * string is then handed to `vscode.SnippetString` + `insertSnippet`, so native
 * snippet features (`$TM_FILENAME_BASE`, tab stops, choices, `$CURRENT_YEAR`)
 * resolve in the editor and the cursor lands on the first tab stop.
 */
export function resolveCustomSlots(
  content: string,
  namespace: string,
  stem: string,
  style: NamespaceStyle,
): string {
  let body = normalizeNameSlots(content)
    .replace(/\$\{NAME\}/g, stem)
    .replace(/\$NAMESPACE/g, namespace);

  if (style === 'block_scoped') {
    body = body
      .replace(/^namespace (.+);$/m, (_, ns) => `namespace ${ns}\n{`)
      .replace(/\n$/, '\n}');
  }
  return body;
}

function sanitizeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}
