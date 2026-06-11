import * as path from 'path';
import * as vscode from 'vscode';
import { CodeSymbol, iconForKind } from './types';
import { SymbolIndex } from './symbolIndex';

interface SymbolPick extends vscode.QuickPickItem {
  symbol: CodeSymbol;
}

export async function runSymbolSearch(index: SymbolIndex): Promise<void> {
  await index.ensureBuilt();

  const symbols = index.getAll();
  if (symbols.length === 0) {
    vscode.window.showInformationMessage('No symbols found in the solution.');
    return;
  }

  const config = vscode.workspace.getConfiguration('solutionExplorer');
  const livePreview = config.get<boolean>('symbolSearch.livePreview', true);

  const items = toPicks(symbols);

  const qp = vscode.window.createQuickPick<SymbolPick>();
  qp.items = items;
  qp.placeholder = 'Search type by name (class, interface, record, enum…)';
  qp.matchOnDescription = true;
  qp.matchOnDetail = false;

  // Remember where the user was, to restore on cancel.
  const origEditor = vscode.window.activeTextEditor;
  const origViewColumn = origEditor?.viewColumn;

  let accepted = false;

  if (livePreview) {
    qp.onDidChangeActive(async (active: readonly SymbolPick[]) => {
      const pick = active[0];
      if (!pick) return;
      await revealSymbol(pick.symbol, { preview: true, preserveFocus: true });
    });
  }

  qp.onDidAccept(async () => {
    const pick = qp.selectedItems[0] ?? qp.activeItems[0];
    if (pick) {
      accepted = true;
      qp.hide();
      await revealSymbol(pick.symbol, { preview: false, preserveFocus: false });
    } else {
      qp.hide();
    }
  });

  qp.onDidHide(async () => {
    qp.dispose();
    if (!accepted && livePreview && origEditor) {
      // Restore the editor the user started from.
      try {
        await vscode.window.showTextDocument(origEditor.document, {
          viewColumn: origViewColumn,
          preview: false,
          preserveFocus: false,
        });
      } catch {
        // original doc may have closed; ignore
      }
    }
  });

  qp.show();
}

function toPicks(symbols: CodeSymbol[]): SymbolPick[] {
  return symbols
    .map(symbol => ({
      label: `$(${iconForKind(symbol.kind)}) ${symbol.name}`,
      description: vscode.workspace.asRelativePath(symbol.filePath),
      detail: symbol.project,
      symbol,
    }))
    .sort((a, b) => a.symbol.name.localeCompare(b.symbol.name));
}

async function revealSymbol(
  symbol: CodeSymbol,
  opts: { preview: boolean; preserveFocus: boolean },
): Promise<void> {
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(symbol.filePath));
    const editor = await vscode.window.showTextDocument(doc, {
      preview: opts.preview,
      preserveFocus: opts.preserveFocus,
    });
    const start = new vscode.Position(symbol.line, symbol.column);
    const end = new vscode.Position(symbol.line, symbol.column + symbol.name.length);
    editor.selection = new vscode.Selection(start, end);
    editor.revealRange(
      new vscode.Range(start, end),
      vscode.TextEditorRevealType.InCenter,
    );
  } catch {
    // file may have been deleted since indexing; ignore
  }
}
