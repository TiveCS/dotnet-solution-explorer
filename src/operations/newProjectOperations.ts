import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { SlnData } from '../parser/slnParser';
import { addProjectEntry, newGuid, typeGuidForProjectFile } from '../parser/slnWriter';
import { resolveFromDir } from '../utils/pathUtils';
import { SolutionFolderNode } from '../tree/nodes';
import { SolutionTreeProvider } from '../tree/solutionTreeProvider';

const execFile = promisify(cp.execFile);
const PROJECT_EXTS = ['.csproj', '.fsproj', '.vbproj'];

async function writeSln(provider: SolutionTreeProvider, slnData: SlnData, transform: (content: string) => string): Promise<void> {
  const content = await fs.promises.readFile(slnData.slnPath, 'utf-8');
  await fs.promises.writeFile(slnData.slnPath, transform(content), 'utf-8');
  // Reload directly: the .sln watcher only fires for in-workspace solutions.
  await provider.reloadFromDisk();
}

/** Solution-folder names from the solution root down to a given folder. */
function folderPathSegments(slnData: SlnData, folderGuid: string | undefined): string[] {
  const segments: string[] = [];
  let guid = folderGuid;
  while (guid) {
    const p = slnData.projects.get(guid);
    if (!p) break;
    segments.unshift(p.name);
    guid = p.parentGuid;
  }
  return segments;
}

/**
 * Default on-disk directory for a new project. Solution folders are virtual, so
 * we only descend into a folder segment when a real directory of that name
 * exists; the first virtual segment stops the descent (project lands at the
 * deepest real prefix, falling back to the solution root).
 */
function defaultProjectDir(slnData: SlnData, folderGuid: string | undefined, name: string): string {
  let baseDir = slnData.slnDir;
  for (const seg of folderPathSegments(slnData, folderGuid)) {
    const candidate = path.join(baseDir, seg);
    try {
      if (fs.statSync(candidate).isDirectory()) { baseDir = candidate; continue; }
    } catch { /* not a real dir */ }
    break;
  }
  return path.join(baseDir, name);
}

// ── Add Existing Project ─────────────────────────────────────────────────────

export async function addExistingProject(
  provider: SolutionTreeProvider,
  parent?: SolutionFolderNode,
): Promise<void> {
  const slnData = provider.getSlnData();
  if (!slnData) return;

  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'Project Files': ['csproj', 'fsproj', 'vbproj'] },
    title: 'Add Existing Project',
  });
  if (!uris || uris.length === 0) return;

  const projectPath = uris[0].fsPath;

  // Reject if this project file is already referenced.
  for (const [, p] of slnData.projects) {
    if (p.isSolutionFolder) continue;
    if (resolveFromDir(p.relativePath, slnData.slnDir) === projectPath) {
      vscode.window.showWarningMessage(`"${p.name}" is already in the solution.`);
      return;
    }
  }

  const name = path.basename(projectPath, path.extname(projectPath));
  const relativePath = path.relative(slnData.slnDir, projectPath);
  const typeGuid = typeGuidForProjectFile(projectPath);

  await writeSln(provider, slnData, c =>
    addProjectEntry(c, name, relativePath, newGuid(), typeGuid, parent?.guid));
}

// ── New Project (dotnet new) ─────────────────────────────────────────────────

interface DotnetTemplate {
  name: string;
  shortName: string;
}

let templateCache: DotnetTemplate[] | null = null;

async function dotnetAvailable(): Promise<boolean> {
  try {
    await execFile('dotnet', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/** Parse `dotnet new list` table output by its `----` separator row. */
function parseTemplateList(stdout: string): DotnetTemplate[] {
  const lines = stdout.split(/\r?\n/);
  const sepIdx = lines.findIndex(l => /^-{2,}(\s+-{2,})+/.test(l.trim()) || /^-{3,}/.test(l.trim()));
  if (sepIdx === -1) return [];
  const templates: DotnetTemplate[] = [];
  for (const line of lines.slice(sepIdx + 1)) {
    if (!line.trim()) continue;
    const cols = line.split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
    if (cols.length < 2) continue;
    const shortName = cols[1].split(/[,\s]/)[0];
    if (shortName) templates.push({ name: cols[0], shortName });
  }
  return templates;
}

async function loadTemplates(): Promise<DotnetTemplate[]> {
  if (templateCache) return templateCache;
  const env = { ...process.env, DOTNET_CLI_UI_LANGUAGE: 'en' };
  let stdout = '';
  try {
    ({ stdout } = await execFile('dotnet', ['new', 'list'], { env }));
  } catch {
    try {
      ({ stdout } = await execFile('dotnet', ['new', '--list'], { env })); // older SDKs
    } catch {
      return [];
    }
  }
  templateCache = parseTemplateList(stdout);
  return templateCache;
}

export async function newProject(
  provider: SolutionTreeProvider,
  parent?: SolutionFolderNode,
): Promise<string | undefined> {
  const slnData = provider.getSlnData();
  if (!slnData) return undefined;

  if (!(await dotnetAvailable())) {
    vscode.window.showErrorMessage(
      'New Project requires the .NET SDK on your PATH. Use "Add Existing Project" to add a project that already exists.',
    );
    return undefined;
  }

  const templates = await loadTemplates();
  if (templates.length === 0) {
    vscode.window.showErrorMessage('Could not read templates from `dotnet new list`.');
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(
    templates.map(t => ({ label: t.name, description: t.shortName, template: t })),
    { title: 'New Project — select a template', placeHolder: 'Choose a project template' },
  );
  if (!picked) return undefined;

  const name = await vscode.window.showInputBox({
    title: 'New Project — name',
    prompt: 'Project name',
    validateInput: v => (v.trim() ? null : 'Name required'),
  });
  if (!name) return undefined;

  const defaultDir = defaultProjectDir(slnData, parent?.guid, name.trim());
  const outDir = await vscode.window.showInputBox({
    title: 'New Project — location',
    value: defaultDir,
    prompt: 'Directory for the new project (created if missing)',
    validateInput: v => (v.trim() ? null : 'Location required'),
  });
  if (!outDir) return undefined;

  const projName = name.trim();
  const targetDir = outDir.trim();
  let createdGuid: string | undefined;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Creating ${projName}…` },
    async () => {
      const env = { ...process.env, DOTNET_CLI_UI_LANGUAGE: 'en' };
      try {
        await execFile('dotnet', ['new', picked.template.shortName, '-n', projName, '-o', targetDir], { env });
      } catch (err) {
        vscode.window.showErrorMessage(`dotnet new failed: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      const projectFile = await findProjectFile(targetDir);
      if (!projectFile) {
        vscode.window.showWarningMessage(
          `Project created in ${targetDir}, but no project file was found to add to the solution.`,
        );
        return;
      }

      const relativePath = path.relative(slnData.slnDir, projectFile);
      const typeGuid = typeGuidForProjectFile(projectFile);
      const entryName = path.basename(projectFile, path.extname(projectFile));
      const guid = newGuid();
      await writeSln(provider, slnData, c =>
        addProjectEntry(c, entryName, relativePath, guid, typeGuid, parent?.guid));
      createdGuid = guid;
    },
  );

  return createdGuid;
}

/** Find the first project file directly inside (or nested under) a directory. */
async function findProjectFile(dir: string): Promise<string | undefined> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }
  // Prefer a project file at the top level.
  for (const e of entries) {
    if (e.isFile() && PROJECT_EXTS.includes(path.extname(e.name).toLowerCase())) {
      return path.join(dir, e.name);
    }
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const found = await findProjectFile(path.join(dir, e.name));
      if (found) return found;
    }
  }
  return undefined;
}
