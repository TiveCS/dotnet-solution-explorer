import * as vscode from 'vscode';

interface NamingRule {
  pattern: string;
  template: string;
}

export function detectTemplateFromName(fileName: string): string | undefined {
  const config = vscode.workspace.getConfiguration('solutionExplorer');
  const rules = config.get<NamingRule[]>('namingConventions', []);

  for (const rule of rules) {
    if (matchWildcard(fileName, rule.pattern)) {
      return rule.template;
    }
  }
  return undefined;
}

function matchWildcard(str: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(str);
}
