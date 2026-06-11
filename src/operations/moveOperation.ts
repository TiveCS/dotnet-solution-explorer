import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { FileNode, ProjectNode, NodeKind } from '../tree/nodes';
import { addFileToCsproj, removeFileFromCsproj, getItemType } from '../parser/csprojParser';
import { inferNamespace, getNamespaceStyle, buildFileContent } from '../utils/namespaceInferrer';
import { SolutionTreeProvider } from '../tree/solutionTreeProvider';

export async function moveFileCommand(
  node: FileNode,
  provider: SolutionTreeProvider
): Promise<void> {
  const slnData = provider.getSlnData();
  if (!slnData) return;

  const projectItems = [...slnData.projects.values()]
    .filter(p => !p.isSolutionFolder)
    .map(p => ({
      label: p.name,
      description: p.relativePath,
      projectPath: p.relativePath,
    }));

  const picked = await vscode.window.showQuickPick(projectItems, {
    title: `Move "${node.name}" to Project`,
    placeHolder: 'Select target project',
  });
  if (!picked) return;

  const { resolveFromDir } = await import('../utils/pathUtils');
  const targetProjectPath = resolveFromDir(picked.projectPath, slnData.slnDir);

  const { parseProjectFile } = await import('../parser/csprojParser');
  const targetProjectData = await parseProjectFile(targetProjectPath);
  const targetDir = targetProjectData.projectDir;

  await executeMoveFiles(node.filePath, targetDir, {
    kind: NodeKind.Project,
    guid: '',
    name: picked.label,
    projectPath: targetProjectPath,
    projectData: targetProjectData,
    showExcluded: false,
  }, provider, node.project);
}

export async function executeMoveFiles(
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

  // Determine source project if not provided
  let srcProject = sourceProject;
  if (!srcProject) {
    const srcProjectPath = findProjectForFile(sourceFilePath, provider);
    if (srcProjectPath) {
      const { parseProjectFile } = await import('../parser/csprojParser');
      const data = await parseProjectFile(srcProjectPath);
      srcProject = {
        kind: NodeKind.Project,
        guid: '',
        name: path.basename(srcProjectPath, path.extname(srcProjectPath)),
        projectPath: srcProjectPath,
        projectData: data,
        showExcluded: false,
      };
    }
  }

  // Remove from source .csproj (legacy)
  if (srcProject?.projectData && !srcProject.projectData.isSDKStyle) {
    await removeFileFromCsproj(srcProject.projectPath, sourceFilePath);
  }

  // Copy file
  await vscode.workspace.fs.copy(
    vscode.Uri.file(sourceFilePath),
    vscode.Uri.file(destPath),
    { overwrite: true }
  );

  // Delete original
  await vscode.workspace.fs.delete(vscode.Uri.file(sourceFilePath), { useTrash: true });

  // Add to target .csproj (legacy)
  if (targetProject.projectData && !targetProject.projectData.isSDKStyle) {
    await addFileToCsproj(targetProject.projectPath, destPath, getItemType(fileName));
  }

  // Update namespace in moved file (only for .cs files)
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

  // Replace file-scoped namespace
  const fileScopedMatch = content.match(/^namespace\s+([\w.]+)\s*;/m);
  if (fileScopedMatch) {
    const updated = content.replace(/^namespace\s+[\w.]+\s*;/m, `namespace ${newNamespace};`);
    await fs.promises.writeFile(filePath, updated, 'utf-8');
    return;
  }

  // Replace block-scoped namespace
  const blockMatch = content.match(/^namespace\s+([\w.]+)\s*\n?\s*\{/m);
  if (blockMatch) {
    const updated = content.replace(/^namespace\s+[\w.]+(\s*\n?\s*\{)/m, `namespace ${newNamespace}$1`);
    await fs.promises.writeFile(filePath, updated, 'utf-8');
  }
}

function findProjectForFile(filePath: string, provider: SolutionTreeProvider): string | undefined {
  const slnData = provider.getSlnData();
  if (!slnData) return undefined;
  const { resolveFromDir } = require('../utils/pathUtils');
  for (const [, proj] of slnData.projects) {
    if (proj.isSolutionFolder) continue;
    const projectPath = resolveFromDir(proj.relativePath, slnData.slnDir);
    const projectDir = path.dirname(projectPath);
    if (filePath.startsWith(projectDir + path.sep)) return projectPath;
  }
  return undefined;
}
