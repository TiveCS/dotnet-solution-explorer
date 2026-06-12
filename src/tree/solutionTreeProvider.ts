import * as path from 'path';
import * as vscode from 'vscode';
import { SlnData } from '../parser/slnParser';
import { ProjectData, parseProjectFile } from '../parser/csprojParser';
import { buildFolderTree, FolderTree, resolveFromDir } from '../utils/pathUtils';
import {
  TreeNode, NodeKind,
  PinBoardNode, SolutionNode, SolutionFolderNode, ProjectNode, FolderNode, FileNode,
  nodeId,
} from './nodes';
import { PinStore } from './pinStore';

export class SolutionTreeProvider
  implements vscode.TreeDataProvider<TreeNode>, vscode.TreeDragAndDropController<TreeNode> {

  readonly dragMimeTypes = ['application/vnd.code.tree.solutionexplorer'];
  readonly dropMimeTypes = ['application/vnd.code.tree.solutionexplorer'];

  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private slnData: SlnData | null = null;
  private projectCache = new Map<string, ProjectData>();
  private showExcludedSet = new Set<string>();
  readonly pins: PinStore;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.pins = new PinStore(context.globalState);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  load(slnData: SlnData): void {
    this.slnData = slnData;
    this.projectCache.clear();
    this._onDidChangeTreeData.fire();
    this.backgroundParseAll(slnData);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  refreshNode(node: TreeNode): void {
    this._onDidChangeTreeData.fire(node);
  }

  invalidateProject(projectPath: string): void {
    this.projectCache.delete(projectPath);
    this._onDidChangeTreeData.fire();
  }

  getSlnData(): SlnData | null {
    return this.slnData;
  }

  /**
   * All source files across the solution, paired with their owning project name.
   * Parses any not-yet-cached projects. Used to seed the symbol index.
   */
  async getAllIndexableFiles(): Promise<{ filePath: string; project?: string }[]> {
    if (!this.slnData) return [];
    const out: { filePath: string; project?: string }[] = [];
    const seen = new Set<string>();
    for (const [, proj] of this.slnData.projects) {
      if (proj.isSolutionFolder) continue;
      const projectPath = resolveFromDir(proj.relativePath, this.slnData.slnDir);
      const ext = path.extname(projectPath).toLowerCase();
      if (ext !== '.csproj' && ext !== '.fsproj' && ext !== '.vbproj') continue;
      let data = this.projectCache.get(projectPath);
      if (!data) {
        data = await parseProjectFile(projectPath);
        this.projectCache.set(projectPath, data);
      }
      for (const f of data.files) {
        if (seen.has(f)) continue;
        seen.add(f);
        out.push({ filePath: f, project: proj.name });
      }
    }
    return out;
  }

  /** The owning project name for a file path, if it falls under a known project. */
  projectNameForFile(filePath: string): string | undefined {
    if (!this.slnData) return undefined;
    for (const [, proj] of this.slnData.projects) {
      if (proj.isSolutionFolder) continue;
      const projectPath = resolveFromDir(proj.relativePath, this.slnData.slnDir);
      const projectDir = path.dirname(projectPath);
      if (filePath.startsWith(projectDir + path.sep)) return proj.name;
    }
    return undefined;
  }

  toggleExcluded(projectPath: string): void {
    if (this.showExcludedSet.has(projectPath)) {
      this.showExcludedSet.delete(projectPath);
    } else {
      this.showExcludedSet.add(projectPath);
    }
    this.invalidateProject(projectPath);
  }

  // ── TreeDataProvider ──────────────────────────────────────────────────────

  getTreeItem(node: TreeNode): vscode.TreeItem {
    switch (node.kind) {
      case NodeKind.PinBoard: return this.buildPinBoardItem(node);
      case NodeKind.Solution: return this.buildSolutionItem(node);
      case NodeKind.SolutionFolder: return this.buildSolutionFolderItem(node);
      case NodeKind.Project: return this.buildProjectItem(node);
      case NodeKind.Folder: return this.buildFolderItem(node);
      case NodeKind.File: return this.buildFileItem(node);
    }
  }

  async getChildren(node?: TreeNode): Promise<TreeNode[]> {
    if (!this.slnData) return [];

    if (!node) {
      const solutionNode: SolutionNode = { kind: NodeKind.Solution, slnData: this.slnData };
      const pins = this.pins.getPins(this.slnData.slnPath);
      const validPins = [...pins].filter(guid => this.slnData!.projects.has(guid));
      if (validPins.length > 0) {
        const pinBoard: PinBoardNode = { kind: NodeKind.PinBoard, slnPath: this.slnData.slnPath };
        return [pinBoard, solutionNode];
      }
      return [solutionNode];
    }

    switch (node.kind) {
      case NodeKind.PinBoard:
        return this.getPinBoardChildren(node);
      case NodeKind.Solution:
        return this.getSlnChildren(node.slnData, undefined);
      case NodeKind.SolutionFolder:
        return this.getSlnChildren(node.slnData, node.guid);
      case NodeKind.Project:
        return this.getProjectChildren(node);
      case NodeKind.Folder:
        return this.getFolderChildren(node);
      case NodeKind.File:
        return [];
    }
  }

  getParent(node: TreeNode): TreeNode | undefined {
    if (node.kind === NodeKind.Solution) return undefined;
    if (node.kind === NodeKind.SolutionFolder) {
      const proj = this.slnData?.projects.get(node.guid);
      if (!proj?.parentGuid) return { kind: NodeKind.Solution, slnData: this.slnData! };
      const parent = this.slnData!.projects.get(proj.parentGuid)!;
      return { kind: NodeKind.SolutionFolder, guid: proj.parentGuid, name: parent.name, slnData: this.slnData! };
    }
    return undefined;
  }

  // ── Drag and Drop ─────────────────────────────────────────────────────────

  handleDrag(source: readonly TreeNode[], dataTransfer: vscode.DataTransfer): void {
    const files = source.filter((n): n is FileNode => n.kind === NodeKind.File).map(n => n.filePath);
    const folders = source.filter((n): n is FolderNode => n.kind === NodeKind.Folder).map(n => n.folderPath);
    if (files.length > 0 || folders.length > 0) {
      dataTransfer.set(
        'application/vnd.code.tree.solutionexplorer',
        new vscode.DataTransferItem({ files, folders })
      );
    }
  }

  async handleDrop(target: TreeNode | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    if (!target) return;
    const item = dataTransfer.get('application/vnd.code.tree.solutionexplorer');
    if (!item) return;

    const payload = item.value as { files?: string[]; folders?: string[] };
    const filePaths: string[] = payload.files ?? [];
    const folderPaths: string[] = payload.folders ?? [];

    let targetProjectNode: ProjectNode | undefined;
    let targetDir: string | undefined;

    if (target.kind === NodeKind.Project) {
      targetProjectNode = target;
      targetDir = target.projectData?.projectDir ?? path.dirname(target.projectPath);
    } else if (target.kind === NodeKind.Folder) {
      targetProjectNode = target.project;
      targetDir = target.folderPath;
    } else {
      return;
    }

    if (!targetDir || !targetProjectNode) return;

    const { executeMoveFile, executeMoveFolder } = await import('../operations/moveOperation');
    for (const filePath of filePaths) {
      await executeMoveFile(filePath, targetDir, targetProjectNode, this);
    }
    for (const folderPath of folderPaths) {
      await executeMoveFolder(folderPath, targetDir, targetProjectNode, this);
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private getPinBoardChildren(node: PinBoardNode): TreeNode[] {
    if (!this.slnData) return [];
    const pins = this.pins.getPins(node.slnPath);
    const result: TreeNode[] = [];
    for (const guid of pins) {
      const p = this.slnData.projects.get(guid);
      if (!p || p.isSolutionFolder) continue;
      const projectPath = resolveFromDir(p.relativePath, this.slnData.slnDir);
      const projectData = this.projectCache.get(projectPath);
      result.push({
        kind: NodeKind.Project,
        guid,
        name: p.name,
        projectPath,
        projectData,
        showExcluded: this.showExcludedSet.has(projectPath),
        pinned: true,
      } as ProjectNode);
    }
    return result;
  }

  private getSlnChildren(slnData: SlnData, parentGuid: string | undefined): TreeNode[] {
    const guids = parentGuid
      ? (slnData.projects.get(parentGuid)?.childGuids ?? [])
      : slnData.rootGuids;

    const result: TreeNode[] = [];
    for (const guid of guids) {
      const p = slnData.projects.get(guid);
      if (!p) continue;
      if (p.isSolutionFolder) {
        result.push({ kind: NodeKind.SolutionFolder, guid, name: p.name, slnData } as SolutionFolderNode);
      } else {
        const projectPath = resolveFromDir(p.relativePath, slnData.slnDir);
        const projectData = this.projectCache.get(projectPath);
        result.push({
          kind: NodeKind.Project,
          guid,
          name: p.name,
          projectPath,
          projectData,
          showExcluded: this.showExcludedSet.has(projectPath),
        } as ProjectNode);
      }
    }
    return result;
  }

  private async getProjectChildren(node: ProjectNode): Promise<TreeNode[]> {
    let data = this.projectCache.get(node.projectPath);
    if (!data) {
      data = await parseProjectFile(node.projectPath);
      this.projectCache.set(node.projectPath, data);
      node.projectData = data;
    }
    const files = node.showExcluded
      ? [...data.files, ...data.explicitExcludes]
      : data.files;
    const tree = buildFolderTree(files, data.projectDir, data.dirs);
    return this.treeNodeChildren(tree, data.projectDir, node);
  }

  private getFolderChildren(node: FolderNode): TreeNode[] {
    const data = this.projectCache.get(node.project.projectPath);
    if (!data) return [];
    const rel = path.relative(data.projectDir, node.folderPath);
    const parts = rel.split(path.sep);
    const files = node.project.showExcluded
      ? [...data.files, ...data.explicitExcludes]
      : data.files;
    const tree = buildFolderTree(files, data.projectDir, data.dirs);
    let sub: FolderTree = tree;
    for (const part of parts) {
      const next = sub.folders.get(part);
      if (!next) return [];
      sub = next;
    }
    return this.treeNodeChildren(sub, node.folderPath, node.project);
  }

  private treeNodeChildren(tree: FolderTree, dirPath: string, project: ProjectNode): TreeNode[] {
    const folders: FolderNode[] = [...tree.folders.keys()].sort().map(name => ({
      kind: NodeKind.Folder,
      name,
      folderPath: path.join(dirPath, name),
      project,
    }));
    const files: FileNode[] = tree.files.sort().map(name => ({
      kind: NodeKind.File,
      name,
      filePath: path.join(dirPath, name),
      project,
    }));
    return [...folders, ...files];
  }

  private buildPinBoardItem(_node: PinBoardNode): vscode.TreeItem {
    const item = new vscode.TreeItem('Pinned', vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = 'pinBoard';
    item.iconPath = new vscode.ThemeIcon('pin');
    item.id = '__pinboard__';
    return item;
  }

  private buildSolutionItem(node: SolutionNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.slnData.solutionName, vscode.TreeItemCollapsibleState.Expanded);
    item.contextValue = 'solution';
    item.iconPath = new vscode.ThemeIcon('symbol-namespace');
    item.id = nodeId(node);
    return item;
  }

  private buildSolutionFolderItem(node: SolutionFolderNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Collapsed);
    item.contextValue = 'solutionFolder';
    item.iconPath = new vscode.ThemeIcon('folder');
    item.id = nodeId(node);
    return item;
  }

  private buildProjectItem(node: ProjectNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Collapsed);
    const isPinned = node.pinned || (this.slnData
      ? this.pins.isPinned(this.slnData.slnPath, node.guid)
      : false);
    item.contextValue = isPinned ? 'pinnedProject' : 'project';
    item.iconPath = new vscode.ThemeIcon('project');
    item.description = path.extname(node.projectPath).slice(1);
    item.tooltip = node.projectPath;
    item.id = nodeId(node);
    return item;
  }

  private buildFolderItem(node: FolderNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Collapsed);
    item.contextValue = 'folder';
    item.iconPath = vscode.ThemeIcon.Folder;
    item.resourceUri = vscode.Uri.file(node.folderPath);
    item.id = nodeId(node);
    return item;
  }

  private buildFileItem(node: FileNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'file';
    item.resourceUri = vscode.Uri.file(node.filePath);
    item.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [vscode.Uri.file(node.filePath), { preview: true, preserveFocus: true }],
    };
    item.id = nodeId(node);
    return item;
  }

  private backgroundParseAll(slnData: SlnData): void {
    for (const [, proj] of slnData.projects) {
      if (proj.isSolutionFolder) continue;
      const projectPath = resolveFromDir(proj.relativePath, slnData.slnDir);
      if (this.projectCache.has(projectPath)) continue;
      parseProjectFile(projectPath).then(data => {
        this.projectCache.set(projectPath, data);
      }).catch(() => undefined);
    }
  }
}
