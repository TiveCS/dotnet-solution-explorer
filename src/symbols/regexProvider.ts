import * as path from 'path';
import { CodeSymbol, SymbolKind, SymbolProvider } from './types';

/**
 * Lightweight regex-based C# type extractor.
 *
 * Matches top-level and nested type declarations:
 *   [modifiers] (class|interface|record|struct|enum|delegate) Name
 *
 * Deliberately tolerant, not a full parser. Skips comments and strings with a
 * cheap line-level pre-filter. See ADR-0001 for why this is regex, not Roslyn.
 */

const CSHARP_EXTS = new Set(['.cs']);

// Modifiers that may precede a type keyword. Non-capturing, repeated.
const MODIFIERS =
  '(?:public|private|protected|internal|static|sealed|abstract|partial|readonly|ref|unsafe|new|file|sealed)\\s+';

// record can be `record class`/`record struct`; handle the optional trailing kind.
const TYPE_DECL = new RegExp(
  `^\\s*(?:${MODIFIERS})*` +
    `(class|interface|record|struct|enum|delegate)\\b` +
    `(?:\\s+(?:class|struct))?` + // record class / record struct
    `\\s+([A-Za-z_][A-Za-z0-9_]*)`,
);

// For delegates the name comes after the return type:
//   public delegate ReturnType Name(...)
const DELEGATE_DECL = new RegExp(
  `^\\s*(?:${MODIFIERS})*delegate\\s+[A-Za-z_][A-Za-z0-9_<>,.\\[\\]\\s]*?\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*[(<]`,
);

export class RegexSymbolProvider implements SymbolProvider {
  readonly id = 'regex';
  readonly supportedExtensions = new Set(['.cs', '.razor.cs', '.cshtml.cs', '.razor']);

  extract(filePath: string, content: string, project?: string): CodeSymbol[] {
    const lower = filePath.toLowerCase();

    // A .razor file (not .razor.cs) contributes one component symbol.
    if (lower.endsWith('.razor')) {
      const base = path.basename(filePath, path.extname(filePath));
      return [{
        name: base,
        kind: 'component',
        filePath,
        line: 0,
        column: 0,
        project,
      }];
    }

    if (!this.isCSharpLike(lower)) return [];

    return this.extractCSharp(filePath, content, project);
  }

  private isCSharpLike(lowerPath: string): boolean {
    return lowerPath.endsWith('.cs'); // covers .cs, .razor.cs, .cshtml.cs
  }

  private extractCSharp(filePath: string, content: string, project?: string): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const lines = content.split(/\r?\n/);
    let inBlockComment = false;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const { code, blockCommentOpen } = stripComments(raw, inBlockComment);
      inBlockComment = blockCommentOpen;
      if (!code.trim()) continue;

      // Delegate first (different shape — name after return type)
      if (/\bdelegate\b/.test(code)) {
        const dm = DELEGATE_DECL.exec(code);
        if (dm) {
          symbols.push(makeSymbol(dm[1], 'delegate', filePath, i, code, project));
          continue;
        }
      }

      const m = TYPE_DECL.exec(code);
      if (m) {
        const kind = m[1] as SymbolKind;
        symbols.push(makeSymbol(m[2], kind, filePath, i, code, project));
      }
    }

    return symbols;
  }
}

function makeSymbol(
  name: string,
  kind: SymbolKind,
  filePath: string,
  line: number,
  code: string,
  project?: string,
): CodeSymbol {
  const column = Math.max(0, code.indexOf(name));
  return { name, kind, filePath, line, column, project };
}

/**
 * Remove // line comments, /* block comments *​/, and naive string literals from
 * a single line so declarations inside them aren't matched. Tracks block-comment
 * state across lines.
 */
function stripComments(
  line: string,
  inBlockComment: boolean,
): { code: string; blockCommentOpen: boolean } {
  let out = '';
  let i = 0;
  let block = inBlockComment;
  let inString: '"' | "'" | null = null;

  while (i < line.length) {
    const two = line.slice(i, i + 2);

    if (block) {
      if (two === '*/') { block = false; i += 2; continue; }
      i += 1; continue;
    }
    if (inString) {
      if (line[i] === '\\') { i += 2; continue; }
      if (line[i] === inString) { inString = null; }
      i += 1; continue;
    }
    if (two === '//') break; // rest of line is comment
    if (two === '/*') { block = true; i += 2; continue; }
    if (line[i] === '"' || line[i] === "'") { inString = line[i] as '"' | "'"; i += 1; continue; }

    out += line[i];
    i += 1;
  }

  return { code: out, blockCommentOpen: block };
}
