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

interface CacheEntry {
  mtime: number;
  providerId: string;
  symbols: CodeSymbol[];
}

interface DiskCache {
  version: number;
  entries: Record<string, CacheEntry>;
}

const CACHE_VERSION = 1;
const CACHE_FILENAME = 'symbol-cache.json';

/**
 * In-memory symbol index. Built lazily on first search, cached, and updated
 * per-file on document save (no FileSystemWatcher — see ADR-0001).
 * Persists parsed symbols to disk keyed by file path + mtime so large
 * codebases don't re-parse unchanged files across VS Code restarts.
 */
export class SymbolIndex {
  private provider: SymbolProvider;
  private byFile = new Map<string, CodeSymbol[]>();
  private built = false;
  private building: Promise<void> | null = null;

  private diskEntries = new Map<string, CacheEntry>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly fileSource: FileSource,
    provider?: SymbolProvider,
    private readonly cacheUri?: vscode.Uri,
  ) {
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
    // Keep diskEntries — mtime validation handles staleness on next build
  }

  /** Build the index if not already built. Safe to call repeatedly. */
  async ensureBuilt(): Promise<void> {
    if (this.built) return;
    if (this.building) return this.building;

    const build = Promise.resolve(
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'Indexing symbols…' },
        async () => {
          await this.loadDiskCache();
          const files = await this.fileSource();
          const targets = files.filter(f => this.isIndexable(f.filePath));
          await Promise.all(targets.map(f => this.indexFile(f.filePath, f.project)));
          this.built = true;
          void this.saveDiskCache();
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
    this.scheduleSave();
  }

  removeFile(filePath: string): void {
    this.byFile.delete(filePath);
    this.diskEntries.delete(filePath);
    this.scheduleSave();
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
    // Check disk cache first: if mtime and provider match, skip re-parsing
    const cached = this.diskEntries.get(filePath);
    if (cached && cached.providerId === this.provider.id) {
      try {
        const stat = await fs.promises.stat(filePath);
        if (Math.trunc(stat.mtimeMs) === cached.mtime) {
          if (cached.symbols.length > 0) {
            this.byFile.set(filePath, cached.symbols);
          }
          return;
        }
      } catch {
        // file gone — fall through to delete path below
      }
    }

    let content: string;
    try {
      content = await fs.promises.readFile(filePath, 'utf-8');
    } catch {
      this.byFile.delete(filePath);
      this.diskEntries.delete(filePath);
      return;
    }
    try {
      const symbols = this.provider.extract(filePath, content, project);
      const mtime = Math.trunc((await fs.promises.stat(filePath)).mtimeMs);
      if (symbols.length > 0) {
        this.byFile.set(filePath, symbols);
        this.diskEntries.set(filePath, { mtime, providerId: this.provider.id, symbols });
      } else {
        this.byFile.delete(filePath);
        this.diskEntries.delete(filePath);
      }
    } catch {
      this.byFile.delete(filePath);
      this.diskEntries.delete(filePath);
    }
  }

  // ── disk cache ─────────────────────────────────────────────────────────────

  private cacheFilePath(): string | undefined {
    return this.cacheUri ? path.join(this.cacheUri.fsPath, CACHE_FILENAME) : undefined;
  }

  private async loadDiskCache(): Promise<void> {
    const cachePath = this.cacheFilePath();
    if (!cachePath) return;
    try {
      const raw = await fs.promises.readFile(cachePath, 'utf-8');
      const data: DiskCache = JSON.parse(raw);
      if (data.version !== CACHE_VERSION) return;
      this.diskEntries.clear();
      for (const [fp, entry] of Object.entries(data.entries)) {
        this.diskEntries.set(fp, entry);
      }
    } catch {
      // missing or corrupt — start fresh
    }
  }

  private async saveDiskCache(): Promise<void> {
    const cachePath = this.cacheFilePath();
    if (!cachePath) return;
    const data: DiskCache = {
      version: CACHE_VERSION,
      entries: Object.fromEntries(this.diskEntries),
    };
    try {
      await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.promises.writeFile(cachePath, JSON.stringify(data), 'utf-8');
    } catch {
      // non-fatal: degraded to in-memory-only for this session
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveDiskCache();
    }, 2000);
  }
}
