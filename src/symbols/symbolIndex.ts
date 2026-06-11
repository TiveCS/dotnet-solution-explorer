import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CodeSymbol, SymbolProvider } from './types';
import { RegexSymbolProvider } from './regexProvider';

export interface IndexableFile {
  filePath: string;
  project?: string;
}

export type FileSource = () => Promise<IndexableFile[]>;

/**
 * In-memory symbol index. Built lazily on first search, cached, and updated
 * per-file on document save (no FileSystemWatcher — see ADR-0001).
 */
export class SymbolIndex {
  private provider: SymbolProvider;
  private byFile = new Map<string, CodeSymbol[]>();
  private built = false;
  private building: Promise<void> | null = null;

  constructor(private readonly fileSource: FileSource, provider?: SymbolProvider) {
    this.provider = provider ?? new RegexSymbolProvider();
  }

  setProvider(provider: SymbolProvider): void {
    this.provider = provider;
    this.invalidate();
  }

  invalidate(): void {
    this.byFile.clear();
    this.built = false;
    this.building = null;
  }

  /** Build the index if not already built. Safe to call repeatedly. */
  async ensureBuilt(): Promise<void> {
    if (this.built) return;
    if (this.building) return this.building;

    const build = Promise.resolve(
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'Indexing symbols…' },
        async () => {
          const files = await this.fileSource();
          const targets = files.filter(f => this.isIndexable(f.filePath));
          await Promise.all(targets.map(f => this.indexFile(f.filePath, f.project)));
          this.built = true;
        },
      ),
    ).then(() => undefined);

    this.building = build;
    return build;
  }

  /** Re-index a single file (called on save). No-op if not indexable. */
  async reindexFile(filePath: string): Promise<void> {
    if (!this.built) return; // nothing indexed yet; first search will pick it up
    if (!this.isIndexable(filePath)) return;
    await this.indexFile(filePath, this.projectForExisting(filePath));
  }

  removeFile(filePath: string): void {
    this.byFile.delete(filePath);
  }

  getAll(): CodeSymbol[] {
    const out: CodeSymbol[] = [];
    for (const list of this.byFile.values()) out.push(...list);
    return out;
  }

  get size(): number {
    return this.byFile.size;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private isIndexable(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    for (const ext of this.provider.supportedExtensions) {
      if (lower.endsWith(ext)) return true;
    }
    return false;
  }

  private projectForExisting(filePath: string): string | undefined {
    const existing = this.byFile.get(filePath);
    return existing?.[0]?.project;
  }

  private async indexFile(filePath: string, project?: string): Promise<void> {
    let content: string;
    try {
      content = await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      this.byFile.delete(filePath);
      return;
    }
    try {
      const symbols = this.provider.extract(filePath, content, project);
      if (symbols.length > 0) {
        this.byFile.set(filePath, symbols);
      } else {
        this.byFile.delete(filePath);
      }
    } catch {
      // tolerate a single bad file
      this.byFile.delete(filePath);
    }
  }
}
