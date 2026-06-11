import * as path from 'path';
import * as fs from 'fs';
import { XMLParser } from 'fast-xml-parser';
import { readDirRecursive } from '../utils/pathUtils';

export interface ProjectData {
  projectPath: string;
  projectDir: string;
  isSDKStyle: boolean;
  rootNamespace: string;
  files: string[];
  dirs: string[];
  explicitExcludes: string[];
}

const ITEM_TYPES = ['Compile', 'Content', 'None', 'EmbeddedResource', 'AdditionalFiles', 'TypeScriptCompile'];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => [...ITEM_TYPES, 'ItemGroup', 'PropertyGroup', 'Folder'].includes(name),
  parseTagValue: true,
  trimValues: true,
});

export async function parseProjectFile(projectPath: string): Promise<ProjectData> {
  const projectDir = path.dirname(projectPath);
  let content: string;
  try {
    content = await fs.promises.readFile(projectPath, 'utf-8');
  } catch {
    return { projectPath, projectDir, isSDKStyle: false, rootNamespace: '', files: [], dirs: [], explicitExcludes: [] };
  }

  const parsed = xmlParser.parse(content);
  const project = parsed?.Project ?? {};
  const isSDKStyle = !!(project['@_Sdk'] || content.includes(' Sdk="'));

  const rootNamespace = extractRootNamespace(project, projectPath);

  let files: string[];
  let dirs: string[] = [];
  let explicitExcludes: string[] = [];

  if (isSDKStyle) {
    ({ files, dirs, explicitExcludes } = await loadSDKStyleFiles(project, projectDir));
  } else {
    ({ files, dirs } = loadLegacyFiles(project, projectDir));
  }

  return { projectPath, projectDir, isSDKStyle, rootNamespace, files, dirs, explicitExcludes };
}

function extractRootNamespace(project: Record<string, unknown>, projectPath: string): string {
  const groups = toArray(project['PropertyGroup']) as Record<string, unknown>[];
  for (const group of groups) {
    if (group['RootNamespace']) return String(group['RootNamespace']);
  }
  return path.basename(projectPath, path.extname(projectPath));
}

async function loadSDKStyleFiles(
  project: Record<string, unknown>,
  projectDir: string
): Promise<{ files: string[]; dirs: string[]; explicitExcludes: string[] }> {
  const scan = await readDirRecursive(projectDir);
  const itemGroups = toArray(project['ItemGroup']) as Record<string, unknown>[];
  const explicitExcludes: string[] = [];

  for (const group of itemGroups) {
    for (const itemType of ITEM_TYPES) {
      const items = toArray(group[itemType]) as Record<string, unknown>[];
      for (const item of items) {
        const rem = item['@_Remove'] as string | undefined;
        if (rem) explicitExcludes.push(path.resolve(projectDir, rem.replace(/\\/g, path.sep)));
      }
    }
  }

  const excludeSet = new Set(explicitExcludes);
  const files = scan.files.filter(f => !excludeSet.has(f));
  return { files, dirs: scan.dirs, explicitExcludes };
}

function loadLegacyFiles(
  project: Record<string, unknown>,
  projectDir: string
): { files: string[]; dirs: string[] } {
  const itemGroups = toArray(project['ItemGroup']) as Record<string, unknown>[];
  const files: string[] = [];
  const dirs: string[] = [];

  for (const group of itemGroups) {
    // Explicit <Folder Include="..."/> entries (empty folders in legacy projects)
    const folders = toArray(group['Folder']) as Record<string, unknown>[];
    for (const folder of folders) {
      const inc = folder['@_Include'] as string | undefined;
      if (inc) dirs.push(path.resolve(projectDir, inc.replace(/\\/g, path.sep)));
    }
    for (const itemType of ITEM_TYPES) {
      const items = toArray(group[itemType]) as Record<string, unknown>[];
      for (const item of items) {
        const inc = item['@_Include'] as string | undefined;
        if (inc) {
          files.push(path.resolve(projectDir, inc.replace(/\\/g, path.sep)));
        }
      }
    }
  }

  return { files, dirs };
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value !== null && value !== undefined) return [value];
  return [];
}

export async function addFileToCsproj(
  projectPath: string,
  absoluteFilePath: string,
  itemType = 'Compile'
): Promise<void> {
  const projectDir = path.dirname(projectPath);
  const relativePath = path.relative(projectDir, absoluteFilePath);
  const entry = `    <${itemType} Include="${relativePath}" />\n`;

  let content = await fs.promises.readFile(projectPath, 'utf-8');

  const lastItemGroupClose = content.lastIndexOf('</ItemGroup>');
  if (lastItemGroupClose === -1) {
    content = content.replace('</Project>', `  <ItemGroup>\n${entry}  </ItemGroup>\n</Project>`);
  } else {
    content = content.slice(0, lastItemGroupClose) + entry + content.slice(lastItemGroupClose);
  }

  await fs.promises.writeFile(projectPath, content, 'utf-8');
}

export async function removeFileFromCsproj(projectPath: string, absoluteFilePath: string): Promise<void> {
  const projectDir = path.dirname(projectPath);
  const rel = path.relative(projectDir, absoluteFilePath).replace(/\\/g, '\\\\');
  let content = await fs.promises.readFile(projectPath, 'utf-8');
  content = content.replace(
    new RegExp(`[ \\t]*<\\w+\\s+Include="${rel.replace(/\\/g, '\\\\')}"\\s*/>\\r?\\n?`, 'i'),
    ''
  );
  await fs.promises.writeFile(projectPath, content, 'utf-8');
}

export function getItemType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (['.cs', '.fs', '.vb', '.razor', '.cshtml'].includes(ext)) return 'Compile';
  if (['.json', '.xml', '.config', '.yaml', '.yml', '.html', '.css', '.js', '.ts'].includes(ext)) return 'Content';
  if (['.resx'].includes(ext)) return 'EmbeddedResource';
  return 'None';
}
