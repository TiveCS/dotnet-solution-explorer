import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectNode, FolderNode, FileNode, NodeKind, TreeNode } from '../tree/nodes';
import { addFileToCsproj, removeFileFromCsproj, getItemType } from '../parser/csprojParser';
import { pickTemplate, resolveExtension } from '../templates/templateManager';
import { detectTemplateFromName } from '../templates/namingConventions';
import { inferNamespace, getNamespaceStyle, buildFileContent } from '../utils/namespaceInferrer';
import { SolutionTreeProvider } from '../tree/solutionTreeProvider';

export async function addFile(
  node: ProjectNode | FolderNode,
  provider: SolutionTreeProvider
): Promise<void> {
  const targetDir = node.kind === NodeKind.Folder
    ? node.folderPath
    : path.dirname(node.projectPath);
  const project = node.kind === NodeKind.Folder ? node.project : node;

  const projectDir = project.projectData?.projectDir ?? path.dirname(project.projectPath);

  // Step 1: input file name
  const inputBox = vscode.window.createInputBox();
  inputBox.title = 'Add File';
  inputBox.placeholder = 'File name (without extension)';
  inputBox.prompt = 'Type a name. Extension will be added by template.';

  const detectedId = await new Promise<string | undefined>(resolve => {
    inputBox.onDidChangeValue(value => {
      const detected = detectTemplateFromName(value);
      inputBox.prompt = detected ? `Template auto-detected: ${detected}` : 'Type a name. Extension added by template.';
    });
    inputBox.onDidAccept(() => {
      inputBox.hide();
      resolve(inputBox.value.trim() || undefined);
    });
    inputBox.onDidHide(() => resolve(undefined));
    inputBox.show();
  });

  if (!detectedId) return;

  const baseName = detectedId;

  // Step 2: pick template
  const template = await pickTemplate(baseName);
  if (!template) return;

  const ext = resolveExtension(template, baseName);
  const fileName = baseName + ext;
  const absoluteFilePath = path.join(targetDir, fileName);

  // Check existing
  if (fs.existsSync(absoluteFilePath)) {
    vscode.window.showWarningMessage(`File already exists: ${fileName}`);
    return;
  }

  // Infer namespace
  const rootNamespace = project.projectData?.rootNamespace ?? project.name;
  const namespace = await inferNamespace(absoluteFilePath, projectDir, rootNamespace);
  const style = await getNamespaceStyle(targetDir);
  const content = buildFileContent(template.content, namespace, baseName, style);

  // Write file
  await fs.promises.writeFile(absoluteFilePath, content, 'utf-8');

  // Update .csproj for legacy projects
  if (project.projectData && !project.projectData.isSDKStyle) {
    await addFileToCsproj(project.projectPath, absoluteFilePath, getItemType(fileName));
  }

  provider.invalidateProject(project.projectPath);

  // Open the file
  const doc = await vscode.workspace.openTextDocument(absoluteFilePath);
  await vscode.window.showTextDocument(doc);
}

export async function addFolder(
  node: ProjectNode | FolderNode,
  provider: SolutionTreeProvider
): Promise<void> {
  const targetDir = node.kind === NodeKind.Folder
    ? node.folderPath
    : path.dirname(node.projectPath);
  const project = node.kind === NodeKind.Folder ? node.project : node;

  const inputBox = vscode.window.createInputBox();
  inputBox.title = 'Add Folder';
  inputBox.placeholder = 'Folder name';
  inputBox.prompt = `Creating in: ${targetDir}`;

  const folderName = await new Promise<string | undefined>(resolve => {
    inputBox.onDidAccept(() => {
      inputBox.hide();
      resolve(inputBox.value.trim() || undefined);
    });
    inputBox.onDidHide(() => resolve(undefined));
    inputBox.show();
  });

  if (!folderName) return;

  const folderPath = path.join(targetDir, folderName);
  try {
    await fs.promises.mkdir(folderPath, { recursive: true });
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to create folder: ${err}`);
    return;
  }
  provider.invalidateProject(project.projectPath);
}

export async function deleteNode(
  node: FileNode | FolderNode,
  provider: SolutionTreeProvider
): Promise<void> {
  const isFile = node.kind === NodeKind.File;
  const label = isFile ? node.name : `folder "${node.name}" and all contents`;
  const confirm = await vscode.window.showWarningMessage(
    `Delete ${label}?`,
    { modal: true },
    'Move to Trash'
  );
  if (confirm !== 'Move to Trash') return;

  const uri = vscode.Uri.file(isFile ? node.filePath : node.folderPath);

  if (isFile && !node.project.projectData?.isSDKStyle) {
    await removeFileFromCsproj(node.project.projectPath, node.filePath);
  }

  await vscode.workspace.fs.delete(uri, { recursive: !isFile, useTrash: true });
  provider.invalidateProject(node.project.projectPath);
}

export async function renameNode(
  node: FileNode | FolderNode,
  provider: SolutionTreeProvider
): Promise<void> {
  const isFile = node.kind === NodeKind.File;
  const oldPath = isFile ? node.filePath : node.folderPath;
  const oldName = node.name;

  const newName = await vscode.window.showInputBox({
    title: 'Rename',
    value: oldName,
    prompt: 'Enter new name',
    validateInput: v => (!v.trim() ? 'Name required' : v.trim() === oldName ? 'Same name' : null),
  });
  if (!newName || newName.trim() === oldName) return;

  const newPath = path.join(path.dirname(oldPath), newName.trim());

  if (isFile && !node.project.projectData?.isSDKStyle) {
    await removeFileFromCsproj(node.project.projectPath, node.filePath);
  }

  await vscode.workspace.fs.rename(vscode.Uri.file(oldPath), vscode.Uri.file(newPath));

  if (isFile && !node.project.projectData?.isSDKStyle) {
    await addFileToCsproj(node.project.projectPath, newPath, getItemType(newName.trim()));
  }

  provider.invalidateProject(node.project.projectPath);
}
