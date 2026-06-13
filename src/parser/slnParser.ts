import * as path from 'path';

export const SOLUTION_FOLDER_TYPE_GUID = '2150E333-8FDC-42A3-9474-1A3956D46DE8';

export interface SlnProject {
  typeGuid: string;
  name: string;
  relativePath: string;
  guid: string;
  isSolutionFolder: boolean;
  solutionItems: string[];
  childGuids: string[];
  parentGuid?: string;
}

export interface SlnData {
  slnPath: string;
  slnDir: string;
  solutionName: string;
  projects: Map<string, SlnProject>;
  rootGuids: string[];
}

export function parseSlnFile(content: string, slnPath: string): SlnData {
  const slnDir = path.dirname(slnPath);
  const solutionName = path.basename(slnPath, '.sln');
  const projects = new Map<string, SlnProject>();
  const lines = content.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    const m = line.match(/^Project\("(\{[^}]+\})"\)\s*=\s*"([^"]+)",\s*"([^"]+)",\s*"(\{[^}]+\})"/);
    if (m) {
      const [, typeGuid, name, relativePath, guid] = m;
      const typeGuidNorm = typeGuid.replace(/[{}]/g, '').toUpperCase();
      const project: SlnProject = {
        typeGuid,
        name,
        relativePath: relativePath.replace(/\\/g, '/'),
        guid,
        isSolutionFolder: typeGuidNorm === SOLUTION_FOLDER_TYPE_GUID,
        solutionItems: [],
        childGuids: [],
      };

      i++;
      while (i < lines.length) {
        const inner = lines[i].trim();
        if (inner === 'EndProject') break;
        if (inner.startsWith('ProjectSection(SolutionItems)')) {
          i++;
          while (i < lines.length && !lines[i].trim().startsWith('EndProjectSection')) {
            const itemMatch = lines[i].trim().match(/^(.+?)\s*=/);
            if (itemMatch) project.solutionItems.push(itemMatch[1].trim());
            i++;
          }
        }
        i++;
      }
      projects.set(guid, project);
    }
    i++;
  }

  // NestedProjects section
  const nestedSection = content.match(/GlobalSection\(NestedProjects\)[^\n]*\n([\s\S]*?)EndGlobalSection/);
  if (nestedSection) {
    for (const ln of nestedSection[1].split(/\r?\n/)) {
      const nm = ln.match(/(\{[^}]+\})\s*=\s*(\{[^}]+\})/);
      if (nm) {
        const [, childGuid, parentGuid] = nm;
        const child = projects.get(childGuid);
        const parent = projects.get(parentGuid);
        if (child && parent) {
          child.parentGuid = parentGuid;
          parent.childGuids.push(childGuid);
        }
      }
    }
  }

  const rootGuids = [...projects.keys()].filter(g => !projects.get(g)!.parentGuid);
  return { slnPath, slnDir, solutionName, projects, rootGuids };
}

export { removeEntry as removeProjectFromSln } from './slnWriter';
