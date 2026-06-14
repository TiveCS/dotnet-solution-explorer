import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { FileTemplate, BUILTIN_TEMPLATES } from './builtinTemplates';
import { detectTemplateFromName } from './namingConventions';
import { normalizeNameSlots } from '../utils/namespaceInferrer';

// ── Global storage location ───────────────────────────────────────────────────
// Custom templates live in the extension's global storage (personal, not
// committed). Set once on activation; folder-per-template (one folder = one
// template) plus bare single files for back-compat. See ADR-0004.

let globalStorageUri: vscode.Uri | undefined;

export function setTemplateStorage(uri: vscode.Uri): void {
  globalStorageUri = uri;
}

/** Absolute path of the global custom-templates directory (may not exist yet). */
export function getTemplatesDir(): string | undefined {
  return globalStorageUri ? path.join(globalStorageUri.fsPath, 'templates') : undefined;
}

/** Ensure the global templates directory exists and return its path. */
export async function ensureTemplatesDir(): Promise<string | undefined> {
  const dir = getTemplatesDir();
  if (!dir) return undefined;
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

// ── Detection result ──────────────────────────────────────────────────────────

export interface TemplateMatch {
  templateId: string;
  /** The recovered stem (the meaningful part the template composes from). */
  stem: string;
}

/**
 * Detect a template + stem from the typed name. Precedence (ADR-0004):
 *   1. explicit `namingConventions` settings win (stem = whole typed name);
 *   2. otherwise the longest-suffix custom-template filename pattern match.
 */
export function detectTemplate(typed: string, customTemplates: FileTemplate[]): TemplateMatch | undefined {
  const settingsId = detectTemplateFromName(typed);
  if (settingsId) return { templateId: settingsId, stem: typed };

  const base = stripExtension(typed);
  let best: { templateId: string; stem: string; literalLen: number } | undefined;
  for (const t of customTemplates) {
    if (!t.namePattern) continue;
    const m = patternToRegex(t.namePattern).exec(base);
    if (!m) continue;
    const stem = m[1];
    const literalLen = stripExtension(t.namePattern).length - '${NAME}'.length;
    if (!best || literalLen > best.literalLen) {
      best = { templateId: t.id, stem, literalLen };
    }
  }
  return best ? { templateId: best.templateId, stem: best.stem } : undefined;
}

/** Build the actual filename from a `${NAME}` pattern + stem (`${NAME}Command.cs` → `FooCommand.cs`). */
export function fileNameFromPattern(namePattern: string, stem: string): string {
  return namePattern.replace(/\$\{NAME\}/g, stem);
}

// ── Template picker ───────────────────────────────────────────────────────────

export async function pickTemplate(
  allTemplates: FileTemplate[],
  typed: string,
  preselectedId: string | undefined,
): Promise<FileTemplate | undefined> {
  const config = vscode.workspace.getConfiguration('solutionExplorer');
  const defaultId = config.get<string>('defaultTemplate', 'Class');
  const targetId = preselectedId ?? defaultId;

  const items = allTemplates.map(t => ({
    label: t.label,
    description: t.id === preselectedId ? '$(symbol-misc) detected from name' : t.description,
    picked: t.id === targetId,
    template: t,
  }));
  // Detected / preselected first.
  items.sort((a, b) => (b.picked ? 1 : 0) - (a.picked ? 1 : 0));

  const picked = await vscode.window.showQuickPick(items, {
    title: `Select Template for "${typed}"`,
    placeHolder: 'Choose a file template',
  });
  return picked?.template;
}

// ── Loading custom templates ──────────────────────────────────────────────────

export async function loadCustomTemplates(): Promise<FileTemplate[]> {
  const byId = new Map<string, FileTemplate>();

  // 1. Global storage templates/ (folder-per-template + bare files).
  const dir = getTemplatesDir();
  if (dir) {
    for (const t of await scanTemplatesDir(dir)) byId.set(t.id, t);
  }

  // 2. Legacy `customTemplatesPath` setting (flat files) — does not override global.
  const config = vscode.workspace.getConfiguration('solutionExplorer');
  const customPath = config.get<string>('customTemplatesPath', '');
  if (customPath) {
    const resolved = path.isAbsolute(customPath)
      ? customPath
      : path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '', customPath);
    for (const t of await scanFlatDir(resolved)) {
      if (!byId.has(t.id)) byId.set(t.id, t);
    }
  }

  return [...byId.values()];
}

/** Scan a directory as folder-per-template, falling back to bare files. */
async function scanTemplatesDir(dir: string): Promise<FileTemplate[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: FileTemplate[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const folder = path.join(dir, entry.name);
      const t = await loadFolderTemplate(folder, entry.name);
      if (t) out.push(t);
    } else if (entry.isFile()) {
      const t = await loadBareFileTemplate(path.join(dir, entry.name), entry.name, dir);
      if (t) out.push(t);
    }
  }
  return out;
}

/** A folder = one template; its (first) file is the output pattern. */
async function loadFolderTemplate(folder: string, name: string): Promise<FileTemplate | undefined> {
  let files: fs.Dirent[];
  try {
    files = (await fs.promises.readdir(folder, { withFileTypes: true })).filter(f => f.isFile());
  } catch {
    return undefined;
  }
  if (files.length === 0) return undefined;
  const primary = files[0].name; // 0.1.3 emits one file; multi-file reserved
  let content: string;
  try {
    content = await fs.promises.readFile(path.join(folder, primary), 'utf-8');
  } catch {
    return undefined;
  }
  return {
    id: name,
    label: name,
    extension: extensionFromPattern(primary),
    content,
    description: 'custom template',
    namePattern: normalizeNameSlots(primary),
    isCustom: true,
    sourceDir: folder,
  };
}

/** A bare file directly in the templates dir is a valid single-file template. */
async function loadBareFileTemplate(filePath: string, fileName: string, dir: string): Promise<FileTemplate | undefined> {
  let content: string;
  try {
    content = await fs.promises.readFile(filePath, 'utf-8');
  } catch {
    return undefined;
  }
  const ext = path.extname(fileName);
  return {
    id: path.basename(fileName, ext),
    label: path.basename(fileName, ext),
    extension: ext,
    content,
    description: 'custom template',
    namePattern: normalizeNameSlots(fileName),
    isCustom: true,
    sourceDir: dir,
  };
}

async function scanFlatDir(dir: string): Promise<FileTemplate[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: FileTemplate[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const t = await loadBareFileTemplate(path.join(dir, entry.name), entry.name, dir);
    if (t) out.push(t);
  }
  return out;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function resolveExtension(template: FileTemplate, fileName: string): string {
  if (template.extension) return template.extension;
  const ext = path.extname(fileName);
  return ext || '';
}

/** Everything from the first `.` of the basename onward (handles `.razor.cs`). */
function extensionFromPattern(name: string): string {
  const dot = name.indexOf('.');
  return dot === -1 ? '' : name.slice(dot);
}

function stripExtension(name: string): string {
  const dot = name.indexOf('.');
  return dot === -1 ? name : name.slice(0, dot);
}

/** Turn a `${NAME}` filename pattern into an anchored capture regex. */
function patternToRegex(namePattern: string): RegExp {
  const base = stripExtension(namePattern);
  const SENTINEL = ' ';
  const withSentinel = base.replace(/\$\{NAME\}/g, SENTINEL);
  const escaped = withSentinel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const source = '^' + escaped.split(SENTINEL).join('(.+)') + '$';
  return new RegExp(source);
}
