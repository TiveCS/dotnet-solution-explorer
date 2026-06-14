import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectNode, FolderNode, FileNode, NodeKind, TreeNode } from '../tree/nodes';
import { addFileToCsproj, removeFileFromCsproj, getItemType } from '../parser/csprojParser';
import {
  pickTemplate, resolveExtension, loadCustomTemplates, detectTemplate, fileNameFromPattern,
} from '../templates/templateManager';
import { BUILTIN_TEMPLATES, FileTemplate } from '../templates/builtinTemplates';
import {
  inferNamespace, getNamespaceStyle, buildFileContent, resolveCustomSlots,
} from '../utils/namespaceInferrer';
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

  // Custom templates may auto-detect from the typed name and carry ${NAME} patterns.
  const customTemplates = await loadCustomTemplates();
  const allTemplates: FileTemplate[] = [...BUILTIN_TEMPLATES, ...customTemplates];

  // Step 1: input — the user types a Stem (or a full name a pattern recovers from).
  const inputBox = vscode.window.createInputBox();
  inputBox.title = 'Add File';
  inputBox.placeholder = 'File name / stem (without extension)';
  inputBox.prompt = 'Type a name. Extension and any name suffix come from the template.';

  const typed = await new Promise<string | undefined>(resolve => {
    inputBox.onDidChangeValue(value => {
      const match = detectTemplate(value.trim(), customTemplates);
      inputBox.prompt = match
        ? `Template auto-detected: ${match.templateId}`
        : 'Type a name. Extension and any name suffix come from the template.';
    });
    inputBox.onDidAccept(() => {
      inputBox.hide();
      resolve(inputBox.value.trim() || undefined);
    });
    inputBox.onDidHide(() => resolve(undefined));
    inputBox.show();
  });

  if (!typed) return;

  // Step 2: detect → pick template (detection preselects).
  const detected = detectTemplate(typed, customTemplates);
  const template = await pickTemplate(allTemplates, typed, detected?.templateId);
  if (!template) return;

  // Recover the stem: the detection's capture only applies if it matched THIS template.
  const stem = detected && detected.templateId === template.id ? detected.stem : typed;

  // Built-ins: filename = stem + extension. Custom patterns: ${NAME} → stem.
  const fileName = template.namePattern
    ? fileNameFromPattern(template.namePattern, stem)
    : stem + resolveExtension(template, stem);
  const absoluteFilePath = path.join(targetDir, fileName);

  if (fs.existsSync(absoluteFilePath)) {
    vscode.window.showWarningMessage(`File already exists: ${fileName}`);
    return;
  }

  const rootNamespace = project.projectData?.rootNamespace ?? project.name;
  const namespace = await inferNamespace(absoluteFilePath, projectDir, rootNamespace);
  const style = await getNamespaceStyle(targetDir);

  if (template.isCustom) {
    // Hybrid engine: write an empty file, then insert the template as a snippet so
    // tab stops / $TM_FILENAME_BASE / choices resolve natively and the cursor lands
    // on the first tab stop. The file is left dirty for the user to fill in.
    await fs.promises.writeFile(absoluteFilePath, '', 'utf-8');
    if (project.projectData && !project.projectData.isSDKStyle) {
      await addFileToCsproj(project.projectPath, absoluteFilePath, getItemType(fileName));
    }
    provider.invalidateProject(project.projectPath);

    const doc = await vscode.workspace.openTextDocument(absoluteFilePath);
    const editor = await vscode.window.showTextDocument(doc);
    const body = resolveCustomSlots(template.content, namespace, stem, style);
    await editor.insertSnippet(new vscode.SnippetString(body), new vscode.Position(0, 0));
    return;
  }

  // Built-in path: deterministic byte write (no interactive snippet).
  const content = buildFileContent(template.content, namespace, stem, style);
  await fs.promises.writeFile(absoluteFilePath, content, 'utf-8');
  if (project.projectData && !project.projectData.isSDKStyle) {
    await addFileToCsproj(project.projectPath, absoluteFilePath, getItemType(fileName));
  }
  provider.invalidateProject(project.projectPath);

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
  provider: SolutionTreeProvider,
  allNodes?: (FileNode | FolderNode)[],
): Promise<void> {
  const nodes = allNodes && allNodes.length > 0 ? allNodes : [node];

  let label: string;
  if (nodes.length === 1) {
    const n = nodes[0];
    label = n.kind === NodeKind.File ? n.name : `folder "${n.name}" and all contents`;
  } else {
    label = `${nodes.length} items`;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Delete ${label}?`,
    { modal: true },
    'Move to Trash'
  );
  if (confirm !== 'Move to Trash') return;

  // Group legacy-project files by project to batch csproj edits
  const legacyFilesByProject = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.kind === NodeKind.File && !n.project.projectData?.isSDKStyle) {
      const arr = legacyFilesByProject.get(n.project.projectPath) ?? [];
      arr.push(n.filePath);
      legacyFilesByProject.set(n.project.projectPath, arr);
    }
  }
  for (const [projectPath, filePaths] of legacyFilesByProject) {
    for (const filePath of filePaths) {
      await removeFileFromCsproj(projectPath, filePath);
    }
  }

  const invalidated = new Set<string>();
  await Promise.all(nodes.map(async n => {
    const isFile = n.kind === NodeKind.File;
    const uri = vscode.Uri.file(isFile ? n.filePath : n.folderPath);
    await vscode.workspace.fs.delete(uri, { recursive: !isFile, useTrash: true });
    invalidated.add(n.project.projectPath);
  }));

  for (const projectPath of invalidated) {
    provider.invalidateProject(projectPath);
  }
}

export async function renameNode(
  node: FileNode | FolderNode,
  provider: SolutionTreeProvider
): Promise<void> {
  const isFile = node.kind === NodeKind.File;
  const oldPath = isFile ? node.filePath : node.folderPath;
  const oldName = node.name;

  const ext = isFile ? path.extname(oldName) : '';
  const newName = await vscode.window.showInputBox({
    title: 'Rename',
    value: oldName,
    valueSelection: [0, oldName.length - ext.length],
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
