export type SymbolKind =
  | 'class'
  | 'interface'
  | 'record'
  | 'struct'
  | 'enum'
  | 'delegate'
  | 'component';

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  filePath: string;
  /** 0-based line of the declaration */
  line: number;
  /** 0-based column where the type name starts */
  column: number;
  /** Owning project display name, if known */
  project?: string;
}

/**
 * Pluggable source of symbols. Default impl is the regex provider.
 * A future language-server-backed provider can implement the same shape.
 */
export interface SymbolProvider {
  readonly id: string;
  /** Extract symbols from a single file's text content. */
  extract(filePath: string, content: string, project?: string): CodeSymbol[];
  /** File extensions this provider knows how to read (lowercase, with dot). */
  readonly supportedExtensions: ReadonlySet<string>;
}

const THEME_ICON_BY_KIND: Record<SymbolKind, string> = {
  class: 'symbol-class',
  interface: 'symbol-interface',
  record: 'symbol-structure',
  struct: 'symbol-structure',
  enum: 'symbol-enum',
  delegate: 'symbol-event',
  component: 'symbol-misc',
};

export function iconForKind(kind: SymbolKind): string {
  return THEME_ICON_BY_KIND[kind] ?? 'symbol-misc';
}
