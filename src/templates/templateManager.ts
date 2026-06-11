import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { FileTemplate, BUILTIN_TEMPLATES, getTemplate } from './builtinTemplates';
import { detectTemplateFromName } from './namingConventions';

export async function pickTemplate(fileName: string): Promise<FileTemplate | undefined> {
  const detected = detectTemplateFromName(fileName);
  const config = vscode.workspace.getConfiguration('solutionExplorer');
  const defaultId = config.get<string>('defaultTemplate', 'Class');
  const preselectedId = detected ?? defaultId;

  const allTemplates = [...BUILTIN_TEMPLATES, ...(await loadCustomTemplates())];

  const items = allTemplates.map(t => ({
    label: t.label,
    description: detected === t.id ? '$(symbol-misc) detected from name' : t.description,
    picked: t.id === preselectedId,
    template: t,
  }));

  // Sort: detected first, then built-ins, then custom
  items.sort((a, b) => (b.picked ? 1 : 0) - (a.picked ? 1 : 0));

  const picked = await vscode.window.showQuickPick(items, {
    title: `Select Template for "${fileName}"`,
    placeHolder: 'Choose a file template',
  });

  return picked?.template;
}

export async function loadCustomTemplates(): Promise<FileTemplate[]> {
  const config = vscode.workspace.getConfiguration('solutionExplorer');
  const customPath = config.get<string>('customTemplatesPath', '');
  if (!customPath) return [];

  const resolved = path.isAbsolute(customPath)
    ? customPath
    : path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '', customPath);

  try {
    const entries = await fs.promises.readdir(resolved, { withFileTypes: true });
    const templates: FileTemplate[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = path.join(resolved, entry.name);
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const ext = path.extname(entry.name);
      const id = path.basename(entry.name, ext);
      templates.push({ id, label: id, extension: ext, content, description: 'custom' });
    }
    return templates;
  } catch {
    return [];
  }
}

export function resolveExtension(template: FileTemplate, fileName: string): string {
  if (template.extension) return template.extension;
  // Blank template: use extension already in fileName if present, else no extension
  const ext = path.extname(fileName);
  return ext || '';
}
