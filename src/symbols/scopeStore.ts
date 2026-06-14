import * as vscode from 'vscode';

const KEY_PREFIX = 'searchScope.';

/**
 * Per-solution Symbol Search scope. Stores the GUIDs of projects the user has
 * *excluded* from Symbol Search — default (no entry) means every project is
 * included. Persisted in global state, keyed by .sln path (PinStore-style),
 * so the scope is personal and never committed to the repo.
 */
export class ScopeStore {
  constructor(private readonly state: vscode.Memento) {}

  private key(slnPath: string): string {
    return KEY_PREFIX + slnPath;
  }

  getExcluded(slnPath: string): Set<string> {
    return new Set(this.state.get<string[]>(this.key(slnPath), []));
  }

  isExcluded(slnPath: string, guid: string): boolean {
    return this.getExcluded(slnPath).has(guid);
  }

  async exclude(slnPath: string, guid: string): Promise<void> {
    const excluded = this.getExcluded(slnPath);
    excluded.add(guid);
    await this.state.update(this.key(slnPath), [...excluded]);
  }

  async include(slnPath: string, guid: string): Promise<void> {
    const excluded = this.getExcluded(slnPath);
    excluded.delete(guid);
    await this.state.update(this.key(slnPath), [...excluded]);
  }

  /** Replace the entire excluded set for a solution (used by "Set Search Scope…"). */
  async setExcluded(slnPath: string, guids: Iterable<string>): Promise<void> {
    await this.state.update(this.key(slnPath), [...new Set(guids)]);
  }
}
