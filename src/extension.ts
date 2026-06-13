import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { parseSlnFile } from './parser/slnParser';
import { SolutionTreeProvider } from './tree/solutionTreeProvider';
import { NodeKind, ProjectNode, FolderNode, FileNode, SolutionNode, SolutionFolderNode } from './tree/nodes';
import { addFile, addFolder, deleteNode, renameNode } from './operations/fileOperations';
import { moveBatchCommand } from './operations/moveOperation';
import { removeProjectFromSolution, deleteProject } from './operations/projectOperations';
import {
  newSolutionFolder, renameSolutionFolder, deleteSolutionFolder, moveToSolutionFolder,
} from './operations/solutionFolderOperations';
import { addExistingProject, newProject } from './operations/newProjectOperations';
import {
  openProjectFile, revealInOS, openInTerminal, copyPath, copyRelativePath,
} from './operations/shellCommands';
import { SymbolIndex } from './symbols/symbolIndex';
import { runSymbolSearch } from './symbols/symbolSearch';

let provider: SolutionTreeProvider;
let treeView: vscode.TreeView<unknown>;
let symbolIndex: SymbolIndex;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  provider = new SolutionTreeProvider(context);
  symbolIndex = new SymbolIndex(() => provider.getAllIndexableFiles(), undefined, context.globalStorageUri);

  treeView = vscode.window.createTreeView('dotnetSolutionExplorer', {
    treeDataProvider: provider,
    dragAndDropController: provider,
    showCollapseAll: true,
    canSelectMany: true,
  });
  context.subscriptions.push(treeView);

  // Default to "no solution" so the Welcome view shows until one loads.
  await vscode.commands.executeCommand('setContext', 'solutionExplorer.hasSolution', false);

  registerCommands(context);
  setupWatcher(context);
  setupSymbolIndexUpkeep(context);

  await loadSolution(context);
}

export function deactivate(): void {}

// ── Solution loading ────────────────────────────────────────────────────────

async function loadSolution(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) return;

  const slnFiles: vscode.Uri[] = [];
  for (const folder of workspaceFolders) {
    const found = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, '**/*.sln'),
      '{**/node_modules/**,**/bin/**,**/obj/**}',
      20
    );
    slnFiles.push(...found);
  }

  // Zero found: never auto-pop a dialog. The Welcome view offers the way in.
  if (slnFiles.length === 0) return;

  await pickAndOpenSln(slnFiles, context);
}

/**
 * From a set of candidate .sln files: one loads directly, many show a quick-pick.
 * Returns without loading (leaving the Welcome view) if the user cancels.
 */
async function pickAndOpenSln(slnFiles: vscode.Uri[], context: vscode.ExtensionContext): Promise<void> {
  if (slnFiles.length === 0) return;

  let slnPath: string;
  if (slnFiles.length === 1) {
    slnPath = slnFiles[0].fsPath;
  } else {
    const items = slnFiles.map(f => ({
      label: path.basename(f.fsPath),
      description: vscode.workspace.asRelativePath(f.fsPath),
      fsPath: f.fsPath,
    }));
    const picked = await vscode.window.showQuickPick(items, {
      title: 'Multiple solution files found — select one',
      placeHolder: 'Select .sln file',
    });
    if (!picked) return;
    slnPath = picked.fsPath;
  }

  await openSln(slnPath, context);
}

async function openSln(slnPath: string, context: vscode.ExtensionContext): Promise<void> {
  try {
    const content = await fs.promises.readFile(slnPath, 'utf-8');
    const slnData = parseSlnFile(content, slnPath);
    provider.load(slnData);
    symbolIndex?.invalidate();
    await vscode.commands.executeCommand('setContext', 'solutionExplorer.hasSolution', true);
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to load ${path.basename(slnPath)}: ${err}`);
  }
}

async function promptOpenSln(context: vscode.ExtensionContext): Promise<void> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'Solution Files': ['sln'] },
    title: 'Open Solution File',
  });
  if (uris && uris.length > 0) {
    await openSln(uris[0].fsPath, context);
  }
}

/**
 * Pick a directory and scan it (recursively) for .sln files — the directory is
 * only scanned, never added as a workspace root. 0 found → message, 1 → load,
 * many → quick-pick.
 */
async function promptOpenFolder(context: vscode.ExtensionContext): Promise<void> {
  const dirs = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    title: 'Open Folder — scan for .sln',
    openLabel: 'Scan Folder',
  });
  if (!dirs || dirs.length === 0) return;

  const { findSlnFiles } = await import('./utils/pathUtils');
  const found = await findSlnFiles(dirs[0].fsPath);
  if (found.length === 0) {
    vscode.window.showInformationMessage(`No .sln files found in ${path.basename(dirs[0].fsPath)}.`);
    return;
  }
  await pickAndOpenSln(found.map(f => vscode.Uri.file(f)), context);
}

// ── File watcher ────────────────────────────────────────────────────────────

function setupWatcher(context: vscode.ExtensionContext): void {
  const slnWatcher = vscode.workspace.createFileSystemWatcher('**/*.sln');
  const csprojWatcher = vscode.workspace.createFileSystemWatcher('**/*.{csproj,fsproj,vbproj}');

  slnWatcher.onDidChange(async uri => {
    const slnData = provider.getSlnData();
    if (slnData && uri.fsPath === slnData.slnPath) {
      await openSln(uri.fsPath, context);
    }
  });

  csprojWatcher.onDidChange(uri => {
    provider.invalidateProject(uri.fsPath);
  });

  context.subscriptions.push(slnWatcher, csprojWatcher);
}

// ── Symbol index upkeep ──────────────────────────────────────────────────────
// Refresh per-file on save (an editor event, NOT a FileSystemWatcher — see
// ADR-0001). Rebuild from scratch when the provider strategy setting changes.

function setupSymbolIndexUpkeep(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      void symbolIndex.reindexFile(doc.uri.fsPath);
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('solutionExplorer.symbolProvider')) {
        symbolIndex.invalidate();
      }
    }),
  );
}

// ── Command registration ─────────────────────────────────────────────────────

function registerCommands(context: vscode.ExtensionContext): void {
  const reg = (id: string, fn: (...args: unknown[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  reg('solutionExplorer.refresh', () => provider.refresh());

  reg('solutionExplorer.openSln', async () => {
    await promptOpenSln(context);
  });

  reg('solutionExplorer.openFolder', async () => {
    await promptOpenFolder(context);
  });

  reg('solutionExplorer.addFile', async (node: unknown) => {
    try {
      const target = resolveAddTarget(node);
      if (!target) { vscode.window.showErrorMessage(`Add File: no valid node selected (got ${JSON.stringify(node)?.slice(0, 80)})`); return; }
      await addFile(target, provider);
    } catch (err) { vscode.window.showErrorMessage(`Add File failed: ${err}`); }
  });

  reg('solutionExplorer.addFolder', async (node: unknown) => {
    try {
      const target = resolveAddTarget(node);
      if (!target) { vscode.window.showErrorMessage(`Add Folder: no valid node selected (got ${JSON.stringify(node)?.slice(0, 80)})`); return; }
      await addFolder(target, provider);
    } catch (err) { vscode.window.showErrorMessage(`Add Folder failed: ${err}`); }
  });

  // F2 / context menu — dispatch by node kind so the tree behaves like a file tree.
  reg('solutionExplorer.rename', async (node: unknown) => {
    const target = node ?? treeView.selection[0];
    if (isSolutionFolderNode(target)) { await renameSolutionFolder(target, provider); return; }
    const fileOrFolder = isFileOrFolder(target) ? target : treeView.selection.find(isFileOrFolder);
    if (fileOrFolder) await renameNode(fileOrFolder, provider);
  });

  // Delete / Del key — dispatch by node kind. Files/folders keep batch delete.
  reg('solutionExplorer.delete', async (...args: unknown[]) => {
    const [node, rawAll] = args;
    const target = node ?? treeView.selection[0];
    if (isSolutionFolderNode(target)) { await deleteSolutionFolder(target, provider); return; }
    if (isProjectNode(target)) { await deleteProject(target, provider); return; }
    if (!isFileOrFolder(target)) return;
    const fromArg = Array.isArray(rawAll) ? rawAll.filter(isFileOrFolder) : [];
    // Keyboard shortcut omits the second arg — fall back to treeView.selection
    const batch = fromArg.length > 0 ? fromArg : treeView.selection.filter(isFileOrFolder);
    await deleteNode(target, provider, batch.length > 0 ? batch : undefined);
  });

  reg('solutionExplorer.moveToProject', async (...args: unknown[]) => {
    const [node, rawAll] = args;
    const primary = isFileOrFolder(node) ? node : undefined;
    if (!primary) return;
    const fromArg = Array.isArray(rawAll) ? rawAll.filter(isFileOrFolder) : [];
    const batch = fromArg.length > 0 ? fromArg : treeView.selection.filter(isFileOrFolder);
    await moveBatchCommand(batch.length > 0 ? batch : [primary], provider);
  });

  reg('solutionExplorer.pinProject', async (node: unknown) => {
    if (!isProjectNode(node)) return;
    const slnData = provider.getSlnData();
    if (!slnData) return;
    await provider.pins.pin(slnData.slnPath, node.guid);
    provider.refresh();
  });

  reg('solutionExplorer.unpinProject', async (node: unknown) => {
    if (!isProjectNode(node)) return;
    const slnData = provider.getSlnData();
    if (!slnData) return;
    await provider.pins.unpin(slnData.slnPath, node.guid);
    provider.refresh();
  });

  reg('solutionExplorer.removeFromSolution', async (node: unknown) => {
    if (!isProjectNode(node)) return;
    await removeProjectFromSolution(node, provider);
  });

  reg('solutionExplorer.deleteProject', async (node: unknown) => {
    if (!isProjectNode(node)) return;
    await deleteProject(node, provider);
  });

  reg('solutionExplorer.newSolutionFolder', async (node: unknown) => {
    await newSolutionFolder(provider, isSolutionFolderNode(node) ? node : undefined);
  });

  reg('solutionExplorer.renameSolutionFolder', async (node: unknown) => {
    if (!isSolutionFolderNode(node)) return;
    await renameSolutionFolder(node, provider);
  });

  reg('solutionExplorer.deleteSolutionFolder', async (node: unknown) => {
    if (!isSolutionFolderNode(node)) return;
    await deleteSolutionFolder(node, provider);
  });

  reg('solutionExplorer.moveToSolutionFolder', async (node: unknown) => {
    if (isProjectNode(node) || isSolutionFolderNode(node)) {
      await moveToSolutionFolder(node, provider);
    }
  });

  reg('solutionExplorer.addExistingProject', async (node: unknown) => {
    await addExistingProject(provider, isSolutionFolderNode(node) ? node : undefined);
  });

  reg('solutionExplorer.newProject', async (node: unknown) => {
    await revealProjectByGuid(await newProject(provider, isSolutionFolderNode(node) ? node : undefined));
  });

  reg('solutionExplorer.toggleExcludedFiles', (node: unknown) => {
    if (!isProjectNode(node)) return;
    provider.toggleExcluded(node.projectPath);
  });

  reg('solutionExplorer.searchSymbol', async () => {
    if (!provider.getSlnData()) {
      vscode.window.showInformationMessage('No solution loaded.');
      return;
    }
    try {
      await runSymbolSearch(symbolIndex);
    } catch (err) {
      vscode.window.showErrorMessage(`Symbol search failed: ${err}`);
    }
  });

  reg('solutionExplorer.openProjectFile', async (node: unknown) => {
    if (!isProjectNode(node)) return;
    await openProjectFile(node);
  });

  reg('solutionExplorer.revealInOS', async (node: unknown) => {
    if (isProjectNode(node) || isFileNode(node) || isFolderNode(node)) await revealInOS(node);
  });

  reg('solutionExplorer.openInTerminal', async (node: unknown) => {
    if (isProjectNode(node) || isFolderNode(node)) await openInTerminal(node);
  });

  reg('solutionExplorer.copyPath', async (node: unknown) => {
    if (isProjectNode(node) || isFileNode(node) || isFolderNode(node)) await copyPath(node);
  });

  reg('solutionExplorer.copyRelativePath', async (node: unknown) => {
    if (isProjectNode(node) || isFileNode(node) || isFolderNode(node)) await copyRelativePath(node);
  });

  reg('solutionExplorer.revealActiveFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    await revealFile(editor.document.uri.fsPath);
  });

  reg('solutionExplorer.toggleRevealActiveFile', () => {
    const config = vscode.workspace.getConfiguration('solutionExplorer');
    const current = config.get<boolean>('autoRevealActiveFile', false);
    config.update('autoRevealActiveFile', !current, vscode.ConfigurationTarget.Workspace);
  });

  // Auto-reveal listener
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async editor => {
      const config = vscode.workspace.getConfiguration('solutionExplorer');
      if (!config.get<boolean>('autoRevealActiveFile', false)) return;
      if (!editor) return;
      await revealFile(editor.document.uri.fsPath);
    })
  );
}

/** Reveal (and expand to) a project after a create/rename, so it's never hidden under collapsed solution folders. */
async function revealProjectByGuid(guid: string | undefined): Promise<void> {
  if (!guid) return;
  const node = provider.projectNodeByGuid(guid);
  if (!node) return;
  try {
    await treeView.reveal(node, { select: true, focus: true, expand: true });
  } catch {
    // node not yet materialised in the tree; ignore
  }
}

async function revealFile(filePath: string): Promise<void> {
  const slnData = provider.getSlnData();
  if (!slnData) return;

  // Find which project contains this file
  const { resolveFromDir } = await import('./utils/pathUtils');
  for (const [guid, proj] of slnData.projects) {
    if (proj.isSolutionFolder) continue;
    const projectPath = resolveFromDir(proj.relativePath, slnData.slnDir);
    const projectDir = path.dirname(projectPath);
    if (!filePath.startsWith(projectDir + path.sep) && !filePath.startsWith(projectDir + '/')) continue;

    // Build a FileNode and reveal it
    const fileNode: FileNode = {
      kind: NodeKind.File,
      name: path.basename(filePath),
      filePath,
      project: {
        kind: NodeKind.Project,
        guid,
        name: proj.name,
        projectPath,
        showExcluded: false,
      },
    };

    try {
      await treeView.reveal(fileNode, { select: true, focus: false, expand: 3 });
    } catch {
      // reveal may fail if node not yet in tree
    }
    return;
  }
}

// ── Type guards ─────────────────────────────────────────────────────────────

function resolveAddTarget(node: unknown): ProjectNode | FolderNode | undefined {
  if (isProjectNode(node)) return node;
  if (isFolderNode(node)) return node;
  // Right-clicked a file → treat parent folder as target
  if (isFileNode(node)) {
    const parentDir = path.dirname(node.filePath);
    const parentFolder: FolderNode = {
      kind: NodeKind.Folder,
      name: path.basename(parentDir),
      folderPath: parentDir,
      project: node.project,
    };
    return parentFolder;
  }
  return undefined;
}

function isSolutionFolderNode(node: unknown): node is SolutionFolderNode {
  return !!(node && typeof node === 'object' && (node as { kind?: unknown }).kind === NodeKind.SolutionFolder);
}

function isProjectNode(node: unknown): node is ProjectNode {
  return !!(node && typeof node === 'object' && 'projectPath' in node && 'guid' in node && !('folderPath' in node) && !('filePath' in node));
}

function isFolderNode(node: unknown): node is FolderNode {
  return !!(node && typeof node === 'object' && 'folderPath' in node && 'project' in node);
}

function isFileNode(node: unknown): node is FileNode {
  return !!(node && typeof node === 'object' && 'filePath' in node && 'project' in node);
}

function isFileOrFolder(node: unknown): node is FileNode | FolderNode {
  return isFileNode(node) || isFolderNode(node);
}
