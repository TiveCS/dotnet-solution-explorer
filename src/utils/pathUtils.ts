import * as path from 'path';
import * as fs from 'fs';

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function resolveFromDir(relativePath: string, baseDir: string): string {
  const normalized = relativePath.replace(/\\/g, path.sep);
  if (path.isAbsolute(normalized)) return normalized;
  return path.resolve(baseDir, normalized);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const SDK_EXCLUDES = new Set(['obj', 'bin', '.vs', '.git', 'node_modules', '.idea', '.vscode']);
const PROJECT_FILE_EXTS = new Set(['.csproj', '.fsproj', '.vbproj', '.sln', '.slnx']);

export interface DirScan {
  files: string[];
  dirs: string[];
}

export async function readDirRecursive(dir: string): Promise<DirScan> {
  const files: string[] = [];
  const dirs: string[] = [];

  async function recurse(current: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (SDK_EXCLUDES.has(entry.name) || entry.name.startsWith('.')) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        dirs.push(fullPath);
        await recurse(fullPath);
      } else if (!PROJECT_FILE_EXTS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  await recurse(dir);
  return { files, dirs };
}

/**
 * Recursively find all `.sln` files under a directory, applying the standard
 * obj/bin/.git/node_modules exclusions. Used to scan an arbitrary picked folder
 * (which may live outside the workspace, where `workspace.findFiles` is unreliable).
 */
export async function findSlnFiles(dir: string, limit = 50): Promise<string[]> {
  const found: string[] = [];

  async function recurse(current: string): Promise<void> {
    if (found.length >= limit) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= limit) return;
      if (entry.isDirectory()) {
        if (SDK_EXCLUDES.has(entry.name) || entry.name.startsWith('.')) continue;
        await recurse(path.join(current, entry.name));
      } else if (entry.name.toLowerCase().endsWith('.sln')) {
        found.push(path.join(current, entry.name));
      }
    }
  }

  await recurse(dir);
  return found;
}

export interface FolderTree {
  folders: Map<string, FolderTree>;
  files: string[];
}

export function buildFolderTree(
  absoluteFilePaths: string[],
  rootDir: string,
  absoluteDirPaths: string[] = []
): FolderTree {
  const root: FolderTree = { folders: new Map(), files: [] };

  const ensureDir = (parts: string[]): FolderTree => {
    let node = root;
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (!node.folders.has(part)) {
        node.folders.set(part, { folders: new Map(), files: [] });
      }
      node = node.folders.get(part)!;
    }
    return node;
  };

  // Create folder nodes for every directory (so empty folders appear)
  for (const dirPath of absoluteDirPaths) {
    const rel = path.relative(rootDir, dirPath);
    if (rel.startsWith('..')) continue;
    ensureDir(rel.split(path.sep));
  }

  for (const filePath of absoluteFilePaths) {
    const rel = path.relative(rootDir, filePath);
    const parts = rel.split(path.sep);
    const node = ensureDir(parts.slice(0, -1));
    node.files.push(parts[parts.length - 1]);
  }
  return root;
}
