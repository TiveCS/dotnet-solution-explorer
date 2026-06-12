import { SlnData } from '../parser/slnParser';
import { ProjectData } from '../parser/csprojParser';

export enum NodeKind {
  PinBoard = 'pinBoard',
  Solution = 'solution',
  SolutionFolder = 'solutionFolder',
  Project = 'project',
  Folder = 'folder',
  File = 'file',
}

export interface PinBoardNode {
  kind: NodeKind.PinBoard;
  slnPath: string;
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
  /** Set only when the node appears in the Pin Board — distinguishes it from the same project in the main tree */
  pinned?: true;
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

export type TreeNode = PinBoardNode | SolutionNode | SolutionFolderNode | ProjectNode | FolderNode | FileNode;

export function nodeId(node: TreeNode): string {
  switch (node.kind) {
    case NodeKind.PinBoard: return '__pinboard__';
    case NodeKind.Solution: return node.slnData.slnPath;
    case NodeKind.SolutionFolder: return node.guid;
    case NodeKind.Project: return (node.pinned ? 'pinned:' : '') + node.projectPath;
    case NodeKind.Folder: return node.folderPath;
    case NodeKind.File: return node.filePath;
  }
}
