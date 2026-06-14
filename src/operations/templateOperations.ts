import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { FileNode } from '../tree/nodes';
import { ensureTemplatesDir } from '../templates/templateManager';

const STARTER_CONTENT = `namespace $NAMESPACE;

public class $TM_FILENAME_BASE
{
    $0
}
`;

/** Open the global custom-templates directory in the OS file explorer. */
export async function manageTemplates(): Promise<void> {
  const dir = await ensureTemplatesDir();
  if (!dir) {
    vscode.window.showErrorMessage('Custom template storage is unavailable.');
    return;
  }
  await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dir));
}

/** Scaffold a blank template folder pre-seeded with slot tokens, then open it for editing. */
export async function newTemplate(): Promise<void> {
  const dir = await ensureTemplatesDir();
  if (!dir) {
    vscode.window.showErrorMessage('Custom template storage is unavailable.');
    return;
  }

  const name = await vscode.window.showInputBox({
    title: 'New Template',
    prompt: 'Template name (also the folder name)',
    placeHolder: 'e.g. Command',
    validateInput: v => (!v.trim() ? 'Name required' : invalidName(v.trim())),
  });
  if (!name) return;

  const folder = path.join(dir, sanitize(name.trim()));
  if (fs.existsSync(folder)) {
    vscode.window.showWarningMessage(`A template named "${name.trim()}" already exists.`);
    return;
  }

  const fileName = `\${NAME}${sanitize(name.trim())}.cs`;
  await fs.promises.mkdir(folder, { recursive: true });
  const filePath = path.join(folder, fileName);
  await fs.promises.writeFile(filePath, STARTER_CONTENT, 'utf-8');

  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc);
  vscode.window.showInformationMessage(
    `Template "${name.trim()}" created. Edit the file name (the \${NAME} pattern) and body, then save.`,
  );
}

/**
 * Turn an existing file into a custom template: replace the typed stem substring
 * with ${NAME} and the file's namespace with $NAMESPACE, derive a filename
 * pattern from the original name, and save it to global storage.
 */
export async function saveAsTemplate(node: FileNode): Promise<void> {
  const dir = await ensureTemplatesDir();
  if (!dir) {
    vscode.window.showErrorMessage('Custom template storage is unavailable.');
    return;
  }

  let content: string;
  try {
    content = await fs.promises.readFile(node.filePath, 'utf-8');
  } catch (err) {
    vscode.window.showErrorMessage(`Could not read ${node.name}: ${err}`);
    return;
  }

  const ext = extensionOf(node.name);
  const fileBase = node.name.slice(0, node.name.length - ext.length);

  // Step 1: template name — the fixed part (usually the trailing word, e.g. "Command").
  const templateName = await vscode.window.showInputBox({
    title: 'Save as Template — Name',
    prompt: 'Template name (also the folder name). Usually the fixed suffix, e.g. "Command", "Query", "Handler".',
    value: guessTemplateName(fileBase),
    validateInput: v => (!v.trim() ? 'Name required' : invalidName(v.trim())),
  });
  if (!templateName) return;
  const tname = templateName.trim();

  // Step 2: variable part → ${NAME}. Auto-derived from the name; shown pre-filled to confirm.
  const stem = await vscode.window.showInputBox({
    title: 'Save as Template — Variable name',
    prompt: `The part of "${node.name}" that changes per file. It becomes the \${NAME} slot; the rest stays fixed.`,
    value: deriveStem(fileBase, tname),
    validateInput: v => {
      const t = v.trim();
      if (!t) return 'Required';
      if (t.includes('$') || t.includes('{')) return 'Enter the literal text — not a ${NAME} token';
      if (!fileBase.includes(t) && !content.includes(t)) return 'That text is not in the file name or its contents';
      return null;
    },
  });
  if (!stem) return;
  const stemTrim = stem.trim();

  // Tokenise: stem → ${NAME}, detected namespace → $NAMESPACE.
  let body = replaceAll(content, stemTrim, '${NAME}');
  const ns = detectNamespace(content);
  if (ns) body = replaceAll(body, ns, '$NAMESPACE');

  // Filename pattern: replace the stem in the original filename, keep the extension.
  const namePattern = (replaceAll(fileBase, stemTrim, '${NAME}') || '${NAME}') + ext;

  const folder = path.join(dir, sanitize(templateName.trim()));
  if (fs.existsSync(folder)) {
    const overwrite = await vscode.window.showWarningMessage(
      `Template "${templateName.trim()}" already exists. Overwrite?`,
      { modal: true },
      'Overwrite',
    );
    if (overwrite !== 'Overwrite') return;
    await fs.promises.rm(folder, { recursive: true, force: true });
  }

  await fs.promises.mkdir(folder, { recursive: true });
  await fs.promises.writeFile(path.join(folder, namePattern), body, 'utf-8');

  const open = await vscode.window.showInformationMessage(
    `Saved template "${templateName.trim()}" (pattern ${namePattern}).`,
    'Open Folder',
  );
  if (open === 'Open Folder') {
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(folder));
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Guess the fixed template name = the trailing PascalCase word (ApproveFindingCommand → Command). */
function guessTemplateName(fileBase: string): string {
  const words = fileBase.match(/[A-Z][a-z0-9]*/g);
  return words && words.length > 1 ? words[words.length - 1] : fileBase;
}

/** Derive the variable stem by stripping the fixed template-name suffix (ApproveFindingCommand − Command → ApproveFinding). */
function deriveStem(fileBase: string, templateName: string): string {
  if (templateName && fileBase !== templateName && fileBase.endsWith(templateName)) {
    const prefix = fileBase.slice(0, fileBase.length - templateName.length);
    if (prefix) return prefix;
  }
  return fileBase;
}

function detectNamespace(content: string): string | undefined {
  const m = /^\s*namespace\s+([A-Za-z_][\w.]*)/m.exec(content);
  return m?.[1];
}

function extensionOf(name: string): string {
  const dot = name.indexOf('.');
  return dot === -1 ? '' : name.slice(dot);
}

function replaceAll(haystack: string, needle: string, replacement: string): string {
  if (!needle) return haystack;
  return haystack.split(needle).join(replacement);
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

function invalidName(name: string): string | null {
  return /[\\/:*?"<>|]/.test(name) ? 'Name contains invalid path characters' : null;
}
