import * as vscode from "vscode";
import {
  parse,
  ParseError,
  typecheck,
  resolveType,
  typeAtPosition,
  formatTypeDefinition,
  formatType,
  TypeKind,
  type Type,
} from "@typek/core";
import path from "path";

const TYPEK_LANGUAGES = ["typek", "typek-html", "typek-ts"];
const TYPEK_SELECTORS: vscode.DocumentSelector = TYPEK_LANGUAGES.map((lang) => ({ language: lang }));

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext): void {
  diagnosticCollection = vscode.languages.createDiagnosticCollection("typek");
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
      debounceTimer = setTimeout(() => {
        checkDocument(event.document);
      }, 200);
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
}

function isTypekDocument(document: vscode.TextDocument): boolean {
  return TYPEK_LANGUAGES.includes(document.languageId);
}

function resolveDataType(document: vscode.TextDocument): { ast: ReturnType<typeof parse>; dataType: Type } | undefined {
  try {
    const ast = parse(document.getText());
    const { typeName, from } = ast.typeDirective;
    const templateDir = path.dirname(document.uri.fsPath);
    const typeFilePath = path.resolve(templateDir, from.endsWith(".ts") ? from : from + ".ts");
    const dataType = resolveType(typeFilePath, typeName);
    return { ast, dataType };
  } catch {
    return undefined;
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
      md.appendCodeblock(help.syntax, "typek");
      md.appendMarkdown(help.description);
      const range = new vscode.Range(position.line, tagStart, position.line, tagEnd);
      return new vscode.Hover(md, range);
    }
  }

  // Match meta variables: {{@name}}
  const metaPattern = /\{\{\s*(@(?:index|first|last|length))\s*\}\}/g;
  while ((match = metaPattern.exec(line)) !== null) {
    const name = match[1];
    const start = match.index + match[0].indexOf(name);
    const end = start + name.length;
    if (col >= start && col < end) {
      const md = new vscode.MarkdownString();
      md.appendCodeblock(`{{${name}}}`, "typek");
      md.appendMarkdown({
        "@index": "Zero-based index of the current iteration.",
        "@first": "`true` on the first iteration.",
        "@last": "`true` on the last iteration.",
        "@length": "Total number of items in the collection.",
      }[name] ?? "");
      const range = new vscode.Range(position.line, start, position.line, end);
      return new vscode.Hover(md, range);
    }
  }

  return undefined;
}

function getHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
  if (!isTypekDocument(document)) return undefined;

  // Check tag help first (no parsing needed)
  const tagHover = getTagHover(document, position);
  if (tagHover) return tagHover;

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

function checkDocument(document: vscode.TextDocument): void {
  if (!isTypekDocument(document)) return;

  const template = document.getText();
  const diagnostics: vscode.Diagnostic[] = [];

  try {
    const ast = parse(template);
    const { typeName, from } = ast.typeDirective;

    // Resolve the type file path relative to the template
    const templateDir = path.dirname(document.uri.fsPath);
    const typeFilePath = path.resolve(templateDir, from.endsWith(".ts") ? from : from + ".ts");

    try {
      const dataType = resolveType(typeFilePath, typeName);
      const checkerDiags = typecheck(ast, dataType);

      for (const diag of checkerDiags) {
        const range = new vscode.Range(diag.line, diag.column, diag.line, diag.column + diag.length);
        const severity = diag.severity === "error"
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning;

        const vsDiag = new vscode.Diagnostic(range, diag.message, severity);
        vsDiag.source = "typek";
        diagnostics.push(vsDiag);
      }
    } catch (err) {
      // Type resolution failed (e.g., file not found, type not found)
      const message = err instanceof Error ? err.message : String(err);
      const range = new vscode.Range(0, 0, 0, template.indexOf("\n") || template.length);
      const vsDiag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
      vsDiag.source = "typek";
      diagnostics.push(vsDiag);
    }
  } catch (err) {
    // Parse error
    const message = err instanceof Error ? err.message : String(err);
    const range = err instanceof ParseError
      ? new vscode.Range(err.line, err.column, err.line, err.column + err.length)
      : new vscode.Range(0, 0, 0, template.indexOf("\n") || template.length);
    const vsDiag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
    vsDiag.source = "typek";
    diagnostics.push(vsDiag);
  }

  diagnosticCollection.set(document.uri, diagnostics);
}

export function deactivate(): void {}
