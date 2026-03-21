import * as vscode from "vscode";
import {
  parse,
  ParseError,
  typecheck,
  resolveType,
  listExportedTypes,
  findDeclaration,
  typeAtPosition,
  completionsAtPosition,
  resolveChainAtPosition,
  formatTypeDefinition,
  formatType,
  TypeKind,
  type Type,
} from "@typecek/core";
import fs from "fs";
import path from "path";

const TYPEK_LANGUAGES = ["typecek", "typecek-html", "typecek-ts"];
const TYPEK_SELECTORS: vscode.DocumentSelector = TYPEK_LANGUAGES.map((lang) => ({ language: lang }));

let diagnosticCollection: vscode.DiagnosticCollection;

interface TypecekConfig {
  typecheckEnabled: boolean;
  typecheckDebounce: number;
  snippetsEnabled: boolean;
  propertyCompletions: boolean;
  tagHelpHover: boolean;
  typeInfoHover: boolean;
}

function getConfig(): TypecekConfig {
  const cfg = vscode.workspace.getConfiguration("typecek");
  return {
    typecheckEnabled: cfg.get<boolean>("typecheck.enabled", true),
    typecheckDebounce: cfg.get<number>("typecheck.debounce", 200),
    snippetsEnabled: cfg.get<boolean>("completions.snippets", false),
    propertyCompletions: cfg.get<boolean>("completions.properties", true),
    tagHelpHover: cfg.get<boolean>("hover.tagHelp", true),
    typeInfoHover: cfg.get<boolean>("hover.typeInfo", true),
  };
}

export function activate(context: vscode.ExtensionContext): void {
  diagnosticCollection = vscode.languages.createDiagnosticCollection("typecek");
  context.subscriptions.push(diagnosticCollection);

  // Check active editor on activation
  if (vscode.window.activeTextEditor) {
    checkDocument(vscode.window.activeTextEditor.document);
  }

  // Check on file open
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) checkDocument(editor.document);
    }),
  );

  // Check on file save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      checkDocument(document);
    }),
  );

  // Check on content change (with debounce)
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      const delay = getConfig().typecheckDebounce;
      debounceTimer = setTimeout(() => {
        checkDocument(event.document);
      }, delay);
    }),
  );

  // Clear diagnostics when file is closed
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      diagnosticCollection.delete(document.uri);
    }),
  );

  // Hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(TYPEK_SELECTORS, {
      provideHover(document, position) {
        return getHover(document, position);
      },
    }),
  );

  // Definition provider (Go to Definition / Ctrl+Click)
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(TYPEK_SELECTORS, {
      provideDefinition(document, position) {
        return getDefinition(document, position);
      },
    }),
  );

  // Completion provider
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      TYPEK_SELECTORS,
      {
        provideCompletionItems(document, position) {
          return getCompletions(document, position);
        },
      },
      ".", "#", "/", ">", '"', "'",
    ),
  );
}

function isTypecekDocument(document: vscode.TextDocument): boolean {
  return TYPEK_LANGUAGES.includes(document.languageId);
}

const resolveCache = new Map<string, { ast: ReturnType<typeof parse>; dataType: Type }>();

function resolveDataType(document: vscode.TextDocument): { ast: ReturnType<typeof parse>; dataType: Type } | undefined {
  const uri = document.uri.toString();
  try {
    const ast = parse(document.getText());
    if (!ast.typeDirective) return undefined;
    const { typeName, from } = ast.typeDirective;
    const templateDir = path.dirname(document.uri.fsPath);
    const typeFilePath = path.resolve(templateDir, from.endsWith(".ts") ? from : from + ".ts");
    const dataType = resolveType(typeFilePath, typeName);
    const result = { ast, dataType };
    resolveCache.set(uri, result);
    return result;
  } catch {
    // Return cached result when the document can't be parsed (e.g. mid-typing)
    return resolveCache.get(uri);
  }
}

const TAG_HELP: Record<string, { syntax: string; description: string }> = {
  "if": {
    syntax: "{{#if condition}}...{{#else}}...{{/if}}",
    description: "Conditionally renders content. The condition can be any expression.",
  },
  "else": {
    syntax: "{{#if condition}}...{{#else}}...{{/if}}",
    description: "Fallback branch of an `{{#if}}` block. Also supports `{{#else if condition}}`.",
  },
  "for": {
    syntax: "{{#for item in collection}}...{{/for}}",
    description: "Iterates over an array. Inside the loop you can use `{{@index}}`, `{{@first}}`, `{{@last}}`, and `{{@length}}`.",
  },
  "empty": {
    syntax: "{{#for item in list}}...{{#empty}}...{{/empty}}{{/for}}",
    description: "Rendered when the collection in a `{{#for}}` loop is empty.",
  },
  "switch": {
    syntax: '{{#switch expr}}{{#case "value"}}...{{/case}}{{#default}}...{{/default}}{{/switch}}',
    description: "Matches an expression against string cases.",
  },
  "case": {
    syntax: '{{#case "value"}}...{{/case}}',
    description: "A branch inside a `{{#switch}}` block. The value must be a string literal.",
  },
  "default": {
    syntax: "{{#default}}...{{/default}}",
    description: "Fallback branch inside a `{{#switch}}` block when no case matches.",
  },
  "raw": {
    syntax: "{{#raw}}...{{/raw}}",
    description: "Content inside is output as-is without parsing template expressions.",
  },
  "with": {
    syntax: "{{#with expression}}...{{#empty}}...{{/empty}}{{/with}}",
    description: "Scopes into a nested property. Inside the block, identifiers resolve against the expression's type. Use `../` to access the parent scope. Only renders if the value is truthy; use `{{#empty}}` for the fallback.",
  },
  "layout": {
    syntax: '{{#layout "./layout.html.tc" data}}...{{/layout}}',
    description: "Wraps content with a layout template. The layout template must contain `{{@content}}` to mark where the wrapped content is inserted. The second argument is the data passed to the layout's render function.",
  },
};

function getTagHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
  const line = document.lineAt(position.line).text;
  const col = position.character;

  // Match opening tags: {{#tagName or {{/tagName
  const tagPattern = /\{\{[#/]\s*(\w+)/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(line)) !== null) {
    const tagName = match[1];
    const tagStart = match.index + match[0].length - tagName.length;
    const tagEnd = tagStart + tagName.length;
    if (col >= tagStart && col < tagEnd) {
      const help = TAG_HELP[tagName];
      if (!help) return undefined;
      const md = new vscode.MarkdownString();
      md.appendCodeblock(help.syntax, "typecek");
      md.appendMarkdown(help.description);
      const range = new vscode.Range(position.line, tagStart, position.line, tagEnd);
      return new vscode.Hover(md, range);
    }
  }

  // Match tilde whitespace stripping: {{~ or ~}}
  const tildePattern = /\{\{~|~\}\}/g;
  while ((match = tildePattern.exec(line)) !== null) {
    const tildeChar = match[0].indexOf("~");
    const tildePos = match.index + tildeChar;
    if (col === tildePos) {
      const md = new vscode.MarkdownString();
      md.appendCodeblock("{{~ expr}} or {{expr ~}}", "typecek");
      md.appendMarkdown("The `~` strips whitespace on that side of the tag. Use on the left (`{{~`) to trim whitespace before, or on the right (`~}}`) to trim whitespace after.");
      const range = new vscode.Range(position.line, tildePos, position.line, tildePos + 1);
      return new vscode.Hover(md, range);
    }
  }

  // Match meta variables: {{@name}}
  const metaPattern = /\{\{\s*(@(?:index|first|last|length|content))\s*\}\}/g;
  while ((match = metaPattern.exec(line)) !== null) {
    const name = match[1];
    const start = match.index + match[0].indexOf(name);
    const end = start + name.length;
    if (col >= start && col < end) {
      const md = new vscode.MarkdownString();
      md.appendCodeblock(`{{${name}}}`, "typecek");
      md.appendMarkdown({
        "@index": "Zero-based index of the current iteration.",
        "@first": "`true` on the first iteration.",
        "@last": "`true` on the last iteration.",
        "@length": "Total number of items in the collection.",
        "@content": "Outputs the wrapped content passed by a `{{#layout}}` block. Only one `{{@content}}` is allowed per template.",
      }[name] ?? "");
      const range = new vscode.Range(position.line, start, position.line, end);
      return new vscode.Hover(md, range);
    }
  }

  // Match partial tag: {{>
  const partialPattern = /\{\{>/g;
  while ((match = partialPattern.exec(line)) !== null) {
    const start = match.index;
    const end = start + 3;
    if (col >= start && col < end) {
      const md = new vscode.MarkdownString();
      md.appendCodeblock('{{> "./partial.html.tc" data}}', "typecek");
      md.appendMarkdown("Renders a partial template inline. The first argument is the path to the partial template, the second is the data passed to its render function.");
      const range = new vscode.Range(position.line, start, position.line, end);
      return new vscode.Hover(md, range);
    }
  }

  return undefined;
}

function getHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
  if (!isTypecekDocument(document)) return undefined;
  const config = getConfig();

  // Check tag help first (no parsing needed)
  if (config.tagHelpHover) {
    const tagHover = getTagHover(document, position);
    if (tagHover) return tagHover;
  }

  if (!config.typeInfoHover) return undefined;

  const resolved = resolveDataType(document);
  if (!resolved) return undefined;

  const result = typeAtPosition(resolved.ast, resolved.dataType, position.line, position.character);
  if (!result) return undefined;

  const code = formatTypeDefinition(result.type, result.name);
  const markdown = new vscode.MarkdownString();
  markdown.appendCodeblock(code, "typescript");

  const range = new vscode.Range(result.line, result.column, result.line, result.column + result.length);
  return new vscode.Hover(markdown, range);
}

function getFilePathDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.Location | undefined {
  const lineText = document.lineAt(position.line).text;
  const col = position.character;
  const templateDir = path.dirname(document.uri.fsPath);

  // Find the string literal (single or double quoted) the cursor is inside
  const stringRegex = /["']([^"']+)["']/g;
  let match;
  while ((match = stringRegex.exec(lineText)) !== null) {
    const start = match.index + 1; // after opening quote
    const end = start + match[1].length;
    if (col >= start && col <= end) {
      const filePath = match[1];

      // {{#import Type from "./path"}} — resolve as .ts file
      if (lineText.match(/\{\{#import\s+\w+\s+from\s+/)) {
        const resolved = path.resolve(templateDir, filePath.endsWith(".ts") ? filePath : filePath + ".ts");
        if (fs.existsSync(resolved)) {
          return new vscode.Location(vscode.Uri.file(resolved), new vscode.Position(0, 0));
        }
      }

      // {{#layout "./path.tc" ...}} or {{> "./path.tc" ...}} — resolve as .tc file
      if (lineText.match(/\{\{#layout\s+/) || lineText.match(/\{\{>\s+/)) {
        const resolved = path.resolve(templateDir, filePath);
        if (fs.existsSync(resolved)) {
          return new vscode.Location(vscode.Uri.file(resolved), new vscode.Position(0, 0));
        }
      }
    }
  }

  return undefined;
}

function getDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.Location | undefined {
  if (!isTypecekDocument(document)) return undefined;

  // Check for file path definitions first (import, layout, partial paths)
  const filePathDef = getFilePathDefinition(document, position);
  if (filePathDef) return filePathDef;

  // Fall back to property definition via type resolution
  const resolved = resolveDataType(document);
  if (!resolved) return undefined;

  const result = typeAtPosition(resolved.ast, resolved.dataType, position.line, position.character);
  if (!result) return undefined;

  const dir = resolved.ast.typeDirective;
  if (!dir) return undefined;

  const templateDir = path.dirname(document.uri.fsPath);
  const typeFilePath = path.resolve(templateDir, dir.from.endsWith(".ts") ? dir.from : dir.from + ".ts");

  const decl = findDeclaration(typeFilePath, dir.typeName, result.propertyPath);
  if (!decl) return undefined;

  const uri = vscode.Uri.file(decl.filePath);
  const pos = new vscode.Position(decl.line, decl.column);
  return new vscode.Location(uri, pos);
}

function getCompletions(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] | undefined {
  if (!isTypecekDocument(document)) return undefined;

  const lineText = document.lineAt(position.line).text;
  const textBefore = lineText.slice(0, position.character);

  const config = getConfig();

  // 1. Tag name completion after {{# or {{/
  const blockMatch = textBefore.match(/\{\{#(\w*)$/);
  if (blockMatch) {
    const items: vscode.CompletionItem[] = [];

    // Snippet completions for block tags
    const snippets: Array<{ label: string; snippet: string; doc: string }> = [
      { label: "if", snippet: "if ${1:condition}}}$0{{/if}}", doc: "Conditionally renders content." },
      { label: "if...else", snippet: "if ${1:condition}}}$0{{#else}}{{/if}}", doc: "Conditional with else branch." },
      { label: "for", snippet: "for ${1:item} in ${2:collection}}}$0{{/for}}", doc: "Iterates over an array." },
      { label: "for...empty", snippet: "for ${1:item} in ${2:collection}}}$0{{#empty}}{{/empty}}{{/for}}", doc: "Loop with empty fallback." },
      { label: "with", snippet: "with ${1:expression}}}$0{{/with}}", doc: "Scopes into a nested property." },
      { label: "with...empty", snippet: "with ${1:expression}}}$0{{#empty}}{{/empty}}{{/with}}", doc: "Scope with empty fallback." },
      { label: "switch", snippet: "switch ${1:expression}}}{{#case \"${2:value}\"}}$0{{/case}}{{/switch}}", doc: "Matches expression against string cases." },
      { label: "layout", snippet: "layout \"${1:./layout.html.tc}\" ${2:data}}}$0{{/layout}}", doc: "Wraps content with a layout template." },
      { label: "import", snippet: "import ${1:Type} from \"${2:./types}\"}}", doc: "Import a TypeScript type for type checking." },
    ];

    if (config.snippetsEnabled) {
      for (const s of snippets) {
        const item = new vscode.CompletionItem(s.label, vscode.CompletionItemKind.Snippet);
        item.insertText = new vscode.SnippetString(s.snippet);
        item.documentation = new vscode.MarkdownString(s.doc);
        item.sortText = `0_${s.label}`; // sort snippets before plain keywords
        items.push(item);
      }
    }

    // Plain keyword completions (for when user just wants the tag name)
    const tags = ["if", "for", "with", "switch", "case", "default", "empty", "raw", "else", "layout"];
    for (const tag of tags) {
      const item = new vscode.CompletionItem(tag, vscode.CompletionItemKind.Keyword);
      const help = TAG_HELP[tag];
      if (help) item.documentation = new vscode.MarkdownString(`\`${help.syntax}\`\n\n${help.description}`);
      item.sortText = `1_${tag}`; // sort after snippets
      items.push(item);
    }

    return items;
  }
  const closeMatch = textBefore.match(/\{\{\/(\w*)$/);
  if (closeMatch) {
    const tags = ["if", "for", "with", "switch", "case", "default", "empty", "raw", "layout"];
    return tags.map((tag) => {
      const item = new vscode.CompletionItem(tag, vscode.CompletionItemKind.Keyword);
      return item;
    });
  }

  // 2. Partial snippet after {{>
  if (config.snippetsEnabled) {
    const partialMatch = textBefore.match(/\{\{>\s*$/);
    if (partialMatch) {
      const item = new vscode.CompletionItem("partial", vscode.CompletionItemKind.Snippet);
      item.insertText = new vscode.SnippetString(" \"${1:./partial.html.tc}\" ${2:data}}}");
      item.documentation = new vscode.MarkdownString("Renders a partial template inline.");
      return [item];
    }
  }

  // 3. Import path completion: {{#import TypeName from "... or '...
  const importPathMatch = textBefore.match(/\{\{#import\s+\w+\s+from\s+["']([^"']*)$/);
  if (importPathMatch) {
    const partial = importPathMatch[1];
    const templateDir = path.dirname(document.uri.fsPath);
    const searchDir = partial.includes("/")
      ? path.resolve(templateDir, partial.substring(0, partial.lastIndexOf("/") + 1))
      : templateDir;

    try {
      const entries = fs.readdirSync(searchDir, { withFileTypes: true });
      const items: vscode.CompletionItem[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const item = new vscode.CompletionItem(entry.name, vscode.CompletionItemKind.Folder);
          item.insertText = entry.name + "/";
          item.command = { title: "", command: "editor.action.triggerSuggest" };
          items.push(item);
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
          const item = new vscode.CompletionItem(entry.name.replace(/\.ts$/, ""), vscode.CompletionItemKind.File);
          items.push(item);
        }
      }
      return items;
    } catch {
      return undefined;
    }
  }

  // 4. Import type name completion: {{#import <cursor>
  const importTypeMatch = textBefore.match(/\{\{#import\s+(\w*)$/);
  if (importTypeMatch) {
    // Look ahead for the from clause to find the file
    const fullLine = lineText;
    const fromMatch = fullLine.match(/from\s+["']([^"']+)["']/);
    if (fromMatch) {
      const templateDir = path.dirname(document.uri.fsPath);
      const importPath = fromMatch[1];
      const typeFilePath = path.resolve(templateDir, importPath.endsWith(".ts") ? importPath : importPath + ".ts");
      try {
        const names = listExportedTypes(typeFilePath);
        return names.map((name) => {
          const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Interface);
          return item;
        });
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  // 5. Property completion inside expressions
  if (!config.propertyCompletions) return undefined;

  const inExpr = textBefore.match(/\{\{~?\s*[^}]*$/) || textBefore.match(/\{\{#\w+\s+[^}]*$/);
  if (!inExpr) return undefined;

  const resolved = resolveDataType(document);
  if (!resolved) return undefined;

  // Check if completing after a dot (property access)
  const dotMatch = textBefore.match(/(\w+(?:\.\w+)*)\.\s*(\w*)$/);
  if (dotMatch) {
    const chain = dotMatch[1].split(".");
    const partial = dotMatch[2] || "";
    let type = resolveChainAtPosition(resolved.ast, resolved.dataType, chain, position.line);
    if (!type) return undefined;
    const items = getPropertyCompletions(type);
    const replaceRange = new vscode.Range(
      position.line, position.character - partial.length,
      position.line, position.character,
    );
    for (const item of items) {
      item.range = replaceRange;
    }
    return items;
  }

  // Bare identifier completion
  try {
    const entries = completionsAtPosition(resolved.ast, resolved.dataType, position.line, position.character);
    return entries.map((entry) => {
      const item = new vscode.CompletionItem(entry.name, vscode.CompletionItemKind.Property);
      item.detail = formatType(entry.type);
      return item;
    });
  } catch {
    return undefined;
  }
}

function getPropertyCompletions(type: Type): vscode.CompletionItem[] {
  const items: vscode.CompletionItem[] = [];
  if (type.kind === TypeKind.Object) {
    for (const [name, propType] of type.properties) {
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Property);
      item.detail = formatType(propType);
      items.push(item);
    }
  } else if (type.kind === TypeKind.Union) {
    for (const t of type.types) {
      if (t.kind === TypeKind.Null || t.kind === TypeKind.Undefined) continue;
      items.push(...getPropertyCompletions(t));
    }
  }
  return items;
}

function checkDocument(document: vscode.TextDocument): void {
  if (!isTypecekDocument(document)) return;

  if (!getConfig().typecheckEnabled) {
    diagnosticCollection.delete(document.uri);
    return;
  }

  const template = document.getText();
  const diagnostics: vscode.Diagnostic[] = [];

  try {
    const ast = parse(template);
    const dir = ast.typeDirective;

    if (!dir) {
      // No type directive — no type checking possible
      diagnosticCollection.set(document.uri, diagnostics);
      return;
    }

    const { typeName, from } = dir;

    // Resolve the type file path relative to the template
    const templateDir = path.dirname(document.uri.fsPath);
    const typeFilePath = path.resolve(templateDir, from.endsWith(".ts") ? from : from + ".ts");

    try {
      const dataType = resolveType(typeFilePath, typeName);
      const checkerDiags = typecheck(ast, dataType, { templateDir });

      for (const diag of checkerDiags) {
        const range = new vscode.Range(diag.line, diag.column, diag.line, diag.column + diag.length);
        const severity = diag.severity === "error"
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning;

        const vsDiag = new vscode.Diagnostic(range, diag.message, severity);
        vsDiag.source = "typecek";
        diagnostics.push(vsDiag);
      }
    } catch (err) {
      // Type resolution failed (e.g., file not found, type not found)
      const message = err instanceof Error ? err.message : String(err);
      const range = new vscode.Range(0, 0, 0, template.indexOf("\n") || template.length);
      const vsDiag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
      vsDiag.source = "typecek";
      diagnostics.push(vsDiag);
    }
  } catch (err) {
    // Parse error
    const message = err instanceof Error ? err.message : String(err);
    const range = err instanceof ParseError
      ? new vscode.Range(err.line, err.column, err.line, err.column + err.length)
      : new vscode.Range(0, 0, 0, template.indexOf("\n") || template.length);
    const vsDiag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
    vsDiag.source = "typecek";
    diagnostics.push(vsDiag);
  }

  diagnosticCollection.set(document.uri, diagnostics);
}

export function deactivate(): void {}
