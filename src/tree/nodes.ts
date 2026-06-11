import { SlnData } from '../parser/slnParser';
import { ProjectData } from '../parser/csprojParser';

export enum NodeKind {
  Solution = 'solution',
  SolutionFolder = 'solutionFolder',
  Project = 'project',
  Folder = 'folder',
  File = 'file',
}

export interface SolutionNode {
  kind: NodeKind.Solution;
  slnData: SlnData;
}

export interface SolutionFolderNode {
  kind: NodeKind.SolutionFolder;
  guid: string;
  name: string;
  slnData: SlnData;
}

export interface ProjectNode {
  kind: NodeKind.Project;
  guid: string;
  name: string;
  projectPath: string;
  projectData?: ProjectData;
  showExcluded: boolean;
}

export interface FolderNode {
  kind: NodeKind.Folder;
  name: string;
  folderPath: string;
  project: ProjectNode;
}

export interface FileNode {
  kind: NodeKind.File;
  name: string;
  filePath: string;
  project: ProjectNode;
}

export type TreeNode = SolutionNode | SolutionFolderNode | ProjectNode | FolderNode | FileNode;

export function nodeId(node: TreeNode): string {
  switch (node.kind) {
    case NodeKind.Solution: return node.slnData.slnPath;
    case NodeKind.SolutionFolder: return node.guid;
    case NodeKind.Project: return node.projectPath;
    case NodeKind.Folder: return node.folderPath;
    case NodeKind.File: return node.filePath;
  }
}
