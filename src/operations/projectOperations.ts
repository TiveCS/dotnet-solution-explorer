import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectNode } from '../tree/nodes';
import { removeProjectFromSln } from '../parser/slnParser';
import { SolutionTreeProvider } from '../tree/solutionTreeProvider';

export async function removeProjectFromSolution(
  node: ProjectNode,
  provider: SolutionTreeProvider
): Promise<void> {
  const slnData = provider.getSlnData();
  if (!slnData) return;

  const confirm = await vscode.window.showWarningMessage(
    `Remove "${node.name}" from solution? Project files are not deleted.`,
    { modal: true },
    'Remove'
  );
  if (confirm !== 'Remove') return;

  let content = await fs.promises.readFile(slnData.slnPath, 'utf-8');
  content = removeProjectFromSln(content, node.guid);
  await fs.promises.writeFile(slnData.slnPath, content, 'utf-8');
  // Watcher will reload the solution automatically
}

export async function deleteProject(
  node: ProjectNode,
  provider: SolutionTreeProvider
): Promise<void> {
  const slnData = provider.getSlnData();
  if (!slnData) return;

  const answer = await vscode.window.showWarningMessage(
    `Remove "${node.name}" from solution?`,
    { modal: true },
    'Remove only',
    'Remove and delete files'
  );
  if (!answer) return;

  let content = await fs.promises.readFile(slnData.slnPath, 'utf-8');
  content = removeProjectFromSln(content, node.guid);
  await fs.promises.writeFile(slnData.slnPath, content, 'utf-8');

  if (answer === 'Remove and delete files') {
    const projectDir = node.projectData?.projectDir ?? path.dirname(node.projectPath);
    await vscode.workspace.fs.delete(vscode.Uri.file(projectDir), {
      recursive: true,
      useTrash: true,
    });
  }
}
