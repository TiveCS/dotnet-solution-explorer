import * as fs from 'fs';
import * as vscode from 'vscode';
import { SlnData } from '../parser/slnParser';
import {
  addSolutionFolder, renameEntry, setNestedParent, removeEntry, newGuid,
} from '../parser/slnWriter';
import { SolutionFolderNode, ProjectNode } from '../tree/nodes';
import { SolutionTreeProvider } from '../tree/solutionTreeProvider';

async function writeSln(provider: SolutionTreeProvider, slnData: SlnData, transform: (content: string) => string): Promise<void> {
  const content = await fs.promises.readFile(slnData.slnPath, 'utf-8');
  await fs.promises.writeFile(slnData.slnPath, transform(content), 'utf-8');
  // Reload directly: the .sln watcher only fires for in-workspace solutions.
  await provider.reloadFromDisk();
}

/** Names of the solution folders that are direct children of a given parent (or root). */
function siblingFolderNames(slnData: SlnData, parentGuid: string | undefined): Set<string> {
  const guids = parentGuid
    ? (slnData.projects.get(parentGuid)?.childGuids ?? [])
    : slnData.rootGuids;
  const names = new Set<string>();
  for (const g of guids) {
    const p = slnData.projects.get(g);
    if (p?.isSolutionFolder) names.add(p.name.toLowerCase());
  }
  return names;
}

export async function newSolutionFolder(
  provider: SolutionTreeProvider,
  parent?: SolutionFolderNode,
): Promise<void> {
  const slnData = provider.getSlnData();
  if (!slnData) return;

  const parentGuid = parent?.guid;
  const existing = siblingFolderNames(slnData, parentGuid);

  const name = await vscode.window.showInputBox({
    title: parent ? `New Solution Folder in "${parent.name}"` : 'New Solution Folder',
    prompt: 'Solution folder name',
    validateInput: v => {
      const t = v.trim();
      if (!t) return 'Name required';
      if (existing.has(t.toLowerCase())) return 'A solution folder with that name already exists here';
      return null;
    },
  });
  if (!name) return;

  await writeSln(provider, slnData, c => addSolutionFolder(c, name.trim(), newGuid(), parentGuid));
}

export async function renameSolutionFolder(
  node: SolutionFolderNode,
  provider: SolutionTreeProvider,
): Promise<void> {
  const slnData = provider.getSlnData();
  if (!slnData) return;

  const proj = slnData.projects.get(node.guid);
  const siblings = siblingFolderNames(slnData, proj?.parentGuid);
  siblings.delete(node.name.toLowerCase());

  const name = await vscode.window.showInputBox({
    title: 'Rename Solution Folder',
    value: node.name,
    prompt: 'New name',
    validateInput: v => {
      const t = v.trim();
      if (!t) return 'Name required';
      if (t === node.name) return 'Same name';
      if (siblings.has(t.toLowerCase())) return 'A solution folder with that name already exists here';
      return null;
    },
  });
  if (!name || name.trim() === node.name) return;

  await writeSln(provider, slnData, c => renameEntry(c, node.guid, name.trim(), true));
}

/** All descendant GUIDs (folders + projects) under a solution folder, depth-first. */
function descendants(slnData: SlnData, guid: string): string[] {
  const out: string[] = [];
  for (const child of slnData.projects.get(guid)?.childGuids ?? []) {
    out.push(child);
    out.push(...descendants(slnData, child));
  }
  return out;
}

export async function deleteSolutionFolder(
  node: SolutionFolderNode,
  provider: SolutionTreeProvider,
): Promise<void> {
  const slnData = provider.getSlnData();
  if (!slnData) return;

  const all = descendants(slnData, node.guid);
  const projectCount = all.filter(g => !slnData.projects.get(g)?.isSolutionFolder).length;

  const detail = projectCount > 0
    ? `Remove "${node.name}" and ${projectCount} project${projectCount === 1 ? '' : 's'} from the solution? Project files are not deleted.`
    : `Remove "${node.name}" from the solution?`;

  const confirm = await vscode.window.showWarningMessage(detail, { modal: true }, 'Remove');
  if (confirm !== 'Remove') return;

  await writeSln(provider, slnData, c => {
    let next = c;
    for (const g of [node.guid, ...all]) next = removeEntry(next, g);
    return next;
  });
}

/** Reparent a project/solution-folder GUID to a new parent (or undefined = root). */
export async function reparentEntry(
  childGuid: string,
  parentGuid: string | undefined,
  provider: SolutionTreeProvider,
): Promise<void> {
  const slnData = provider.getSlnData();
  if (!slnData) return;
  if (childGuid === parentGuid) return;
  // Don't allow nesting a folder inside its own descendant.
  if (parentGuid && descendants(slnData, childGuid).includes(parentGuid)) {
    vscode.window.showErrorMessage('Cannot move a solution folder into one of its own subfolders.');
    return;
  }
  await writeSln(provider, slnData, c => setNestedParent(c, childGuid, parentGuid));
}

export async function moveToSolutionFolder(
  node: ProjectNode | SolutionFolderNode,
  provider: SolutionTreeProvider,
): Promise<void> {
  const slnData = provider.getSlnData();
  if (!slnData) return;

  const childGuid = node.guid;
  const items: (vscode.QuickPickItem & { guid?: string })[] = [{ label: '(solution root)', guid: undefined }];
  for (const [guid, p] of slnData.projects) {
    if (!p.isSolutionFolder) continue;
    if (guid === childGuid) continue;
    if (descendants(slnData, childGuid).includes(guid)) continue; // no self-descendant
    items.push({ label: p.name, description: 'solution folder', guid });
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: `Move "${node.name}" to…`,
    placeHolder: 'Select a destination solution folder',
  });
  if (!picked) return;

  await reparentEntry(childGuid, picked.guid, provider);
}
