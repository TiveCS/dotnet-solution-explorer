import * as fs from 'fs';
import * as path from 'path';

export type NamespaceStyle = 'file_scoped' | 'block_scoped';

export async function detectNamespaceStyle(startDir: string): Promise<NamespaceStyle> {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, '.editorconfig');
    try {
      const content = await fs.promises.readFile(candidate, 'utf-8');
      const style = parseNamespaceStyleFromEditorconfig(content);
      if (style) return style;
      // If root = true, stop searching upward
      if (/^\s*root\s*=\s*true/im.test(content)) break;
    } catch {
      // file doesn't exist, continue up
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return 'file_scoped'; // default: modern style
}

function parseNamespaceStyleFromEditorconfig(content: string): NamespaceStyle | null {
  // Look for csharp_style_namespace_declarations in any [*.cs] section
  const lines = content.split(/\r?\n/);
  let inCSharpSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      inCSharpSection = trimmed === '[*.cs]' || trimmed === '[*]' || trimmed.includes('*.cs');
      continue;
    }
    if (!inCSharpSection) continue;
    const match = trimmed.match(/^csharp_style_namespace_declarations\s*=\s*(\w+)/i);
    if (match) {
      return match[1].includes('file') ? 'file_scoped' : 'block_scoped';
    }
  }
  return null;
}
