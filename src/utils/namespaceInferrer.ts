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

function sanitizeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}
