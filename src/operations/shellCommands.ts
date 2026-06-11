import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectNode, FileNode, FolderNode } from '../tree/nodes';

export async function openProjectFile(node: ProjectNode): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(node.projectPath));
  await vscode.window.showTextDocument(doc);
}

export async function revealInOS(node: ProjectNode | FileNode | FolderNode): Promise<void> {
  const target = targetPath(node);
  await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(target));
}

export async function openInTerminal(node: ProjectNode | FolderNode): Promise<void> {
  const dir = node.kind === 'project' ? path.dirname(node.projectPath) : node.folderPath;
  const terminal = vscode.window.createTerminal({ cwd: dir, name: path.basename(dir) });
  terminal.show();
}

export async function copyPath(node: ProjectNode | FileNode | FolderNode): Promise<void> {
  await vscode.env.clipboard.writeText(targetPath(node));
  vscode.window.setStatusBarMessage('Path copied', 2000);
}

export async function copyRelativePath(node: ProjectNode | FileNode | FolderNode): Promise<void> {
  const rel = vscode.workspace.asRelativePath(targetPath(node));
  await vscode.env.clipboard.writeText(rel);
  vscode.window.setStatusBarMessage('Relative path copied', 2000);
}

function targetPath(node: ProjectNode | FileNode | FolderNode): string {
  if (node.kind === 'project') return node.projectPath;
  if (node.kind === 'file') return node.filePath;
  return node.folderPath;
}
