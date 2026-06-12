import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { FileNode, FolderNode, ProjectNode, NodeKind } from '../tree/nodes';
import { addFileToCsproj, removeFileFromCsproj, getItemType } from '../parser/csprojParser';
import { inferNamespace, getNamespaceStyle, buildFileContent } from '../utils/namespaceInferrer';
import { SolutionTreeProvider } from '../tree/solutionTreeProvider';

export async function moveBatchCommand(
  nodes: (FileNode | FolderNode)[],
  provider: SolutionTreeProvider
): Promise<void> {
  const slnData = provider.getSlnData();
  if (!slnData) return;

  const label = nodes.length === 1 ? `"${nodes[0].name}"` : `${nodes.length} items`;

  const projectItems = [...slnData.projects.values()]
    .filter(p => !p.isSolutionFolder)
    .map(p => ({
      label: p.name,
      description: p.relativePath,
      projectPath: p.relativePath,
    }));

  const picked = await vscode.window.showQuickPick(projectItems, {
    title: `Move ${label} to Project`,
    placeHolder: 'Select target project',
  });
  if (!picked) return;

  const { resolveFromDir } = await import('../utils/pathUtils');
  const targetProjectPath = resolveFromDir(picked.projectPath, slnData.slnDir);

  const { parseProjectFile } = await import('../parser/csprojParser');
  const targetProjectData = await parseProjectFile(targetProjectPath);

  const targetProject: ProjectNode = {
    kind: NodeKind.Project,
    guid: '',
    name: picked.label,
    projectPath: targetProjectPath,
    projectData: targetProjectData,
    showExcluded: false,
  };

  const targetDir = targetProjectData.projectDir;

  for (const node of nodes) {
    if (node.kind === NodeKind.File) {
      await executeMoveFile(node.filePath, targetDir, targetProject, provider, node.project);
    } else {
      await executeMoveFolder(node.folderPath, targetDir, targetProject, provider, node.project);
    }
  }
}

export async function executeMoveFile(
  sourceFilePath: string,
  targetDir: string,
  targetProject: ProjectNode,
  provider: SolutionTreeProvider,
  sourceProject?: ProjectNode
): Promise<void> {
  const fileName = path.basename(sourceFilePath);
  const destPath = path.join(targetDir, fileName);

  if (sourceFilePath === destPath) return;

  if (fs.existsSync(destPath)) {
    const overwrite = await vscode.window.showWarningMessage(
      `"${fileName}" already exists in target. Overwrite?`,
      { modal: true }, 'Overwrite'
    );
    if (overwrite !== 'Overwrite') return;
  }

  const srcProject = sourceProject ?? (await resolveSourceProject(sourceFilePath, provider));

  if (srcProject?.projectData && !srcProject.projectData.isSDKStyle) {
    await removeFileFromCsproj(srcProject.projectPath, sourceFilePath);
  }

  await vscode.workspace.fs.copy(
    vscode.Uri.file(sourceFilePath),
    vscode.Uri.file(destPath),
    { overwrite: true }
  );
  await vscode.workspace.fs.delete(vscode.Uri.file(sourceFilePath), { useTrash: true });

  if (targetProject.projectData && !targetProject.projectData.isSDKStyle) {
    await addFileToCsproj(targetProject.projectPath, destPath, getItemType(fileName));
  }

  if (destPath.endsWith('.cs') && targetProject.projectData) {
    await updateNamespaceInFile(
      destPath,
      targetDir,
      targetProject.projectData.projectDir,
      targetProject.projectData.rootNamespace
    );
  }

  if (srcProject) provider.invalidateProject(srcProject.projectPath);
  provider.invalidateProject(targetProject.projectPath);
}

export async function executeMoveFolder(
  sourceFolderPath: string,
  targetDir: string,
  targetProject: ProjectNode,
  provider: SolutionTreeProvider,
  sourceProject?: ProjectNode
): Promise<void> {
  const folderName = path.basename(sourceFolderPath);
  const destPath = path.join(targetDir, folderName);

  if (sourceFolderPath === destPath) return;

  if (fs.existsSync(destPath)) {
    const overwrite = await vscode.window.showWarningMessage(
      `Folder "${folderName}" already exists in target. Overwrite?`,
      { modal: true }, 'Overwrite'
    );
    if (overwrite !== 'Overwrite') return;
  }

  const srcProject = sourceProject ?? (await resolveSourceProject(sourceFolderPath, provider));

  if (srcProject?.projectData && !srcProject.projectData.isSDKStyle) {
    const sourceFiles = await collectFiles(sourceFolderPath);
    for (const f of sourceFiles) {
      await removeFileFromCsproj(srcProject.projectPath, f);
    }
  }

  await vscode.workspace.fs.copy(
    vscode.Uri.file(sourceFolderPath),
    vscode.Uri.file(destPath),
    { overwrite: true }
  );
  await vscode.workspace.fs.delete(vscode.Uri.file(sourceFolderPath), { recursive: true, useTrash: true });

  const destFiles = await collectFiles(destPath);

  if (targetProject.projectData && !targetProject.projectData.isSDKStyle) {
    for (const f of destFiles) {
      await addFileToCsproj(targetProject.projectPath, f, getItemType(path.basename(f)));
    }
  }

  if (targetProject.projectData) {
    for (const f of destFiles) {
      if (f.endsWith('.cs')) {
        await updateNamespaceInFile(
          f,
          path.dirname(f),
          targetProject.projectData.projectDir,
          targetProject.projectData.rootNamespace
        );
      }
    }
  }

  if (srcProject) provider.invalidateProject(srcProject.projectPath);
  provider.invalidateProject(targetProject.projectPath);
}

// Keep old export name so drag-and-drop in solutionTreeProvider still compiles
export const executeMoveFiles = executeMoveFile;

async function resolveSourceProject(
  sourcePath: string,
  provider: SolutionTreeProvider
): Promise<ProjectNode | undefined> {
  const slnData = provider.getSlnData();
  if (!slnData) return undefined;
  const { resolveFromDir } = await import('../utils/pathUtils');
  for (const [, proj] of slnData.projects) {
    if (proj.isSolutionFolder) continue;
    const projectPath = resolveFromDir(proj.relativePath, slnData.slnDir);
    const projectDir = path.dirname(projectPath);
    if (sourcePath.startsWith(projectDir + path.sep)) {
      const { parseProjectFile } = await import('../parser/csprojParser');
      const data = await parseProjectFile(projectPath);
      return {
        kind: NodeKind.Project,
        guid: '',
        name: path.basename(projectPath, path.extname(projectPath)),
        projectPath,
        projectData: data,
        showExcluded: false,
      };
    }
  }
  return undefined;
}

async function collectFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

async function updateNamespaceInFile(
  filePath: string,
  fileDir: string,
  projectDir: string,
  rootNamespace: string
): Promise<void> {
  let content: string;
  try {
    content = await fs.promises.readFile(filePath, 'utf-8');
  } catch { return; }

  const newNamespace = await inferNamespace(filePath, projectDir, rootNamespace);
  const style = await getNamespaceStyle(fileDir);

  const fileScopedMatch = content.match(/^namespace\s+([\w.]+)\s*;/m);
  if (fileScopedMatch) {
    const updated = content.replace(/^namespace\s+[\w.]+\s*;/m, `namespace ${newNamespace};`);
    await fs.promises.writeFile(filePath, updated, 'utf-8');
    return;
  }

  const blockMatch = content.match(/^namespace\s+([\w.]+)\s*\n?\s*\{/m);
  if (blockMatch) {
    const updated = content.replace(/^namespace\s+[\w.]+(\s*\n?\s*\{)/m, `namespace ${newNamespace}$1`);
    await fs.promises.writeFile(filePath, updated, 'utf-8');
  }
}
