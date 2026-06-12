import * as vscode from 'vscode';

const KEY_PREFIX = 'pinBoard.';

export class PinStore {
  constructor(private readonly state: vscode.Memento) {}

  private key(slnPath: string): string {
    return KEY_PREFIX + slnPath;
  }

  getPins(slnPath: string): Set<string> {
    const stored = this.state.get<string[]>(this.key(slnPath), []);
    return new Set(stored);
  }

  async pin(slnPath: string, guid: string): Promise<void> {
    const pins = this.getPins(slnPath);
    pins.add(guid);
    await this.state.update(this.key(slnPath), [...pins]);
  }

  async unpin(slnPath: string, guid: string): Promise<void> {
    const pins = this.getPins(slnPath);
    pins.delete(guid);
    await this.state.update(this.key(slnPath), [...pins]);
  }

  isPinned(slnPath: string, guid: string): boolean {
    return this.getPins(slnPath).has(guid);
  }
}
