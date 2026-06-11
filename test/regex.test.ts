import { RegexSymbolProvider } from '../src/symbols/regexProvider';

const p = new RegexSymbolProvider();
let failures = 0;

function check(name: string, cond: boolean) {
  if (!cond) { console.error('FAIL:', name); failures++; }
  else console.log('ok  :', name);
}

// User's exact scenario: 3 types in one misnamed file
const viewModels = `
using System;

namespace App.Audit;

public class AuditFindingListItemViewModel
{
    public string Title { get; set; }
}

public record AuditFindingQueryParams(int Page, int Size);

public sealed class AuditFindingDetailsViewModel
{
}
`;

const syms = p.extract('D:/app/AuditFindingViewModel.cs', viewModels, 'App');
check('finds 3 types', syms.length === 3);
check('finds list item', syms.some(s => s.name === 'AuditFindingListItemViewModel' && s.kind === 'class'));
check('finds query params record', syms.some(s => s.name === 'AuditFindingQueryParams' && s.kind === 'record'));
check('finds details vm', syms.some(s => s.name === 'AuditFindingDetailsViewModel' && s.kind === 'class'));

const qp = syms.find(s => s.name === 'AuditFindingQueryParams')!;
check('query params line correct', qp.line === 10);
check('column points at name', viewModels.split(/\r?\n/)[qp.line].slice(qp.column).startsWith('AuditFindingQueryParams'));

// Kinds
const kinds = `
public interface IApproval { }
public enum Status { A, B }
public struct Point { }
public delegate void Handler(int x);
internal abstract partial class Base { }
public record struct Money(decimal Amount);
`;
const ks = p.extract('X.cs', kinds);
check('interface', ks.some(s => s.name === 'IApproval' && s.kind === 'interface'));
check('enum', ks.some(s => s.name === 'Status' && s.kind === 'enum'));
check('struct', ks.some(s => s.name === 'Point' && s.kind === 'struct'));
check('delegate name (not return type)', ks.some(s => s.name === 'Handler' && s.kind === 'delegate'));
check('partial abstract class', ks.some(s => s.name === 'Base' && s.kind === 'class'));
check('record struct', ks.some(s => s.name === 'Money' && s.kind === 'record'));

// Must NOT match inside comments or strings
const noise = `
// public class CommentedOut { }
/* public class BlockCommented { } */
public class Real
{
    private string s = "public class StringLiteral { }";
}
`;
const ns = p.extract('N.cs', noise);
check('ignores commented type', !ns.some(s => s.name === 'CommentedOut'));
check('ignores block-commented type', !ns.some(s => s.name === 'BlockCommented'));
check('ignores string-literal type', !ns.some(s => s.name === 'StringLiteral'));
check('finds the real class only', ns.length === 1 && ns[0].name === 'Real');

// .razor → single component symbol named after file
const razor = p.extract('D:/app/Components/AuditList.razor', '<h1>hi</h1>\n@code { private int x; }', 'App');
check('razor component named after file', razor.length === 1 && razor[0].name === 'AuditList' && razor[0].kind === 'component');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
