import { randomUUID } from 'crypto';

// Project type GUIDs (braced, upper-case — the form stored in .sln files).
export const SLN_TYPE_GUIDS = {
  solutionFolder: '{2150E333-8FDC-42A3-9474-1A3956D46DE8}',
  csharp: '{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}',
  fsharp: '{F2A71F9B-5D33-465A-A702-920D77279786}',
  vbnet: '{F184B08F-C81C-45F6-A57F-5ABD9991F28F}',
} as const;

/** A fresh, braced, upper-case GUID in the form .sln files use. */
export function newGuid(): string {
  return `{${randomUUID().toUpperCase()}}`;
}

/** Pick the project type GUID for a project file by extension. Defaults to C#. */
export function typeGuidForProjectFile(projectFilePath: string): string {
  const lower = projectFilePath.toLowerCase();
  if (lower.endsWith('.fsproj')) return SLN_TYPE_GUIDS.fsharp;
  if (lower.endsWith('.vbproj')) return SLN_TYPE_GUIDS.vbnet;
  return SLN_TYPE_GUIDS.csharp;
}

function detectEol(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Insert a `Project(...)\nEndProject\n` block. New blocks go directly before the
 * `Global` line (the standard layout: all Project blocks, then the Global section).
 * Falls back to appending if no `Global` line exists.
 */
function insertProjectBlock(content: string, block: string): string {
  const eol = detectEol(content);
  const m = content.match(/^Global\r?$/m);
  if (m && m.index !== undefined) {
    return content.slice(0, m.index) + block + content.slice(m.index);
  }
  const trailing = content.endsWith(eol) ? '' : eol;
  return content + trailing + block;
}

/** Add a new Solution Folder entry. Optionally nests it under a parent solution folder. */
export function addSolutionFolder(
  content: string,
  name: string,
  guid: string,
  parentGuid?: string,
): string {
  const eol = detectEol(content);
  const block =
    `Project("${SLN_TYPE_GUIDS.solutionFolder}") = "${name}", "${name}", "${guid}"${eol}` +
    `EndProject${eol}`;
  let next = insertProjectBlock(content, block);
  if (parentGuid) next = setNestedParent(next, guid, parentGuid);
  return next;
}

/**
 * Add an existing/created project entry to the solution.
 * `relativePath` is stored with backslashes (the .sln convention).
 */
export function addProjectEntry(
  content: string,
  name: string,
  relativePath: string,
  guid: string,
  typeGuid: string,
  parentGuid?: string,
): string {
  const eol = detectEol(content);
  const winPath = relativePath.replace(/\//g, '\\');
  const block =
    `Project("${typeGuid}") = "${name}", "${winPath}", "${guid}"${eol}` +
    `EndProject${eol}`;
  let next = insertProjectBlock(content, block);
  if (parentGuid) next = setNestedParent(next, guid, parentGuid);
  return next;
}

/**
 * Rename a Project/Solution Folder entry by GUID. For a solution folder both the
 * name and the path field carry the name, so both are rewritten; for a real
 * project only the display name changes (the relative path is left untouched).
 */
export function renameEntry(
  content: string,
  guid: string,
  newName: string,
  isSolutionFolder: boolean,
): string {
  const esc = escapeRegex(guid);
  const re = new RegExp(
    `^(Project\\("[^"]*"\\)\\s*=\\s*)"[^"]*"(,\\s*)"([^"]*)"(,\\s*"${esc}")`,
    'm',
  );
  return content.replace(re, (_full, head: string, sep: string, oldPath: string, tail: string) => {
    const path = isSolutionFolder ? newName : oldPath;
    return `${head}"${newName}"${sep}"${path}"${tail}`;
  });
}

/** Rewrite a project entry's display name AND relative path (used when renaming the .csproj file). */
export function renameProjectEntry(
  content: string,
  guid: string,
  newName: string,
  newRelativePath: string,
): string {
  const esc = escapeRegex(guid);
  const winPath = newRelativePath.replace(/\//g, '\\');
  const re = new RegExp(
    `^(Project\\("[^"]*"\\)\\s*=\\s*)"[^"]*"(,\\s*)"[^"]*"(,\\s*"${esc}")`,
    'm',
  );
  return content.replace(re, `$1"${newName}"$2"${winPath}"$3`);
}

/**
 * Set (or clear) the NestedProjects parent of an entry. Passing `undefined`/`null`
 * for `parentGuid` removes the nesting (moves the entry to the solution root).
 * Creates the NestedProjects GlobalSection if it does not yet exist.
 */
export function setNestedParent(
  content: string,
  childGuid: string,
  parentGuid?: string | null,
): string {
  const eol = detectEol(content);
  const escChild = escapeRegex(childGuid);

  // Drop any existing nesting line for this child.
  content = content.replace(
    new RegExp(`^[ \\t]*${escChild}\\s*=\\s*\\{[^}]+\\}\\r?\\n`, 'm'),
    '',
  );

  if (!parentGuid) return content;

  const line = `\t\t${childGuid} = ${parentGuid}${eol}`;

  const section = content.match(
    /^[ \t]*GlobalSection\(NestedProjects\)[^\n]*\r?\n([\s\S]*?)^[ \t]*EndGlobalSection\r?\n/m,
  );
  if (section && section.index !== undefined) {
    // Insert before this section's EndGlobalSection.
    const endIdx = content.indexOf('EndGlobalSection', section.index);
    const lineStart = content.lastIndexOf('\n', endIdx) + 1;
    return content.slice(0, lineStart) + line + content.slice(lineStart);
  }

  // No NestedProjects section — create one before EndGlobal.
  const newSection =
    `\tGlobalSection(NestedProjects) = preSolution${eol}` +
    line +
    `\tEndGlobalSection${eol}`;
  const endGlobal = content.match(/^EndGlobal\r?$/m);
  if (endGlobal && endGlobal.index !== undefined) {
    return content.slice(0, endGlobal.index) + newSection + content.slice(endGlobal.index);
  }
  // No Global section at all — nothing sensible to do; return unchanged.
  return content;
}

/**
 * Remove a single entry (project or solution folder) from the solution by GUID:
 * its Project block plus any NestedProjects lines referencing it as child or parent.
 */
export function removeEntry(content: string, guid: string): string {
  const esc = escapeRegex(guid);
  content = content.replace(
    new RegExp(
      `^Project\\("[^"]*"\\)\\s*=\\s*"[^"]*",\\s*"[^"]*",\\s*"${esc}"[\\s\\S]*?^EndProject\\r?\\n?`,
      'mi',
    ),
    '',
  );
  content = content.replace(new RegExp(`^[ \\t]*${esc}[ \\t]*=[ \\t]*\\{[^}]+\\}\\r?\\n?`, 'gim'), '');
  content = content.replace(new RegExp(`^[ \\t]*\\{[^}]+\\}[ \\t]*=[ \\t]*${esc}\\r?\\n?`, 'gim'), '');
  return content;
}
