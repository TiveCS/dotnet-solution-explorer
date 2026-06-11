export interface FileTemplate {
  id: string;
  label: string;
  extension: string;
  content: string;
  description?: string;
}

export const BUILTIN_TEMPLATES: FileTemplate[] = [
  {
    id: 'Class',
    label: 'Class',
    extension: '.cs',
    description: 'C# class',
    content: `namespace $NAMESPACE;

public class $TM_FILENAME_BASE
{
}
`,
  },
  {
    id: 'Interface',
    label: 'Interface',
    extension: '.cs',
    description: 'C# interface',
    content: `namespace $NAMESPACE;

public interface $TM_FILENAME_BASE
{
}
`,
  },
  {
    id: 'Record',
    label: 'Record',
    extension: '.cs',
    description: 'C# record',
    content: `namespace $NAMESPACE;

public record $TM_FILENAME_BASE();
`,
  },
  {
    id: 'Enum',
    label: 'Enum',
    extension: '.cs',
    description: 'C# enum',
    content: `namespace $NAMESPACE;

public enum $TM_FILENAME_BASE
{
}
`,
  },
  {
    id: 'AbstractClass',
    label: 'Abstract Class',
    extension: '.cs',
    description: 'C# abstract class',
    content: `namespace $NAMESPACE;

public abstract class $TM_FILENAME_BASE
{
}
`,
  },
  {
    id: 'RazorComponent',
    label: 'Razor Component',
    extension: '.razor',
    description: 'Blazor reusable component (no @page)',
    content: `@code {
}
`,
  },
  {
    id: 'RazorPageComponent',
    label: 'Razor Page (routable)',
    extension: '.razor',
    description: 'Blazor page with @page directive',
    content: `@page "/$TM_FILENAME_BASE"

@code {
}
`,
  },
  {
    id: 'RazorComponentCodeBehind',
    label: 'Razor Component (code-behind)',
    extension: '.razor.cs',
    description: 'Blazor component code-behind',
    content: `namespace $NAMESPACE;

public partial class $TM_FILENAME_BASE
{
}
`,
  },
  {
    id: 'RazorPage',
    label: 'Razor Page',
    extension: '.cshtml',
    description: 'Razor Page view',
    content: `@page
@model $NAMESPACE.$TM_FILENAME_BASE\Model

@{
    ViewData["Title"] = "$TM_FILENAME_BASE";
}

<h1>$TM_FILENAME_BASE</h1>
`,
  },
  {
    id: 'RazorPageModel',
    label: 'Razor Page Model',
    extension: '.cshtml.cs',
    description: 'Razor PageModel code-behind',
    content: `using Microsoft.AspNetCore.Mvc.RazorPages;

namespace $NAMESPACE;

public class $TM_FILENAME_BASE\Model : PageModel
{
    public void OnGet()
    {
    }
}
`,
  },
  {
    id: 'Blank',
    label: 'Blank File',
    extension: '',
    description: 'Empty file',
    content: '',
  },
];

export function getTemplate(id: string): FileTemplate | undefined {
  return BUILTIN_TEMPLATES.find(t => t.id === id);
}
