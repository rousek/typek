import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeResult,
  TextDocumentSyncKind,
  CompletionItemKind,
  DiagnosticSeverity,
  MarkupKind,
  InsertTextFormat,
  type CompletionItem,
  type Diagnostic,
  type Hover,
  type InitializeParams,
  type Location,
  type TextDocumentPositionParams,
  type CompletionParams,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
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
import { scanRegions, getRegionAtOffset, getHostLanguage } from "./regions.js";
import { registerEmbeddedLanguage, getEmbeddedLanguage } from "./embedded.js";
import { HTMLEmbeddedService } from "./embedded-html.js";
import { TypeScriptEmbeddedService } from "./embedded-typescript.js";
import fs from "fs";
import path from "path";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

interface TypecekConfig {
  typecheckEnabled: boolean;
  typecheckDebounce: number;
  snippetsEnabled: boolean;
  propertyCompletions: boolean;
  tagHelpHover: boolean;
  typeInfoHover: boolean;
}

let globalConfig: TypecekConfig = {
  typecheckEnabled: true,
  typecheckDebounce: 200,
  snippetsEnabled: false,
  propertyCompletions: true,
  tagHelpHover: true,
  typeInfoHover: true,
};

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  registerEmbeddedLanguage("html", new HTMLEmbeddedService());
  registerEmbeddedLanguage("typescript", new TypeScriptEmbeddedService());

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      completionProvider: {
        triggerCharacters: [".", "#", "/", ">", '"', "'", "<", " ", ":", "-"],
      },
      hoverProvider: true,
      definitionProvider: true,
    },
  };
});

connection.onInitialized(async () => {
  const cfg = await connection.workspace.getConfiguration("typecek");
  if (cfg) {
    globalConfig = {
      typecheckEnabled: cfg["typecheck.enabled"] ?? cfg.typecheck?.enabled ?? true,
      typecheckDebounce: cfg["typecheck.debounce"] ?? cfg.typecheck?.debounce ?? 200,
      snippetsEnabled: cfg["completions.snippets"] ?? cfg.completions?.snippets ?? false,
      propertyCompletions: cfg["completions.properties"] ?? cfg.completions?.properties ?? true,
      tagHelpHover: cfg["hover.tagHelp"] ?? cfg.hover?.tagHelp ?? true,
      typeInfoHover: cfg["hover.typeInfo"] ?? cfg.hover?.typeInfo ?? true,
    };
  }
});

connection.onDidChangeConfiguration(async () => {
  const cfg = await connection.workspace.getConfiguration("typecek");
  if (cfg) {
    globalConfig = {
      typecheckEnabled: cfg["typecheck.enabled"] ?? cfg.typecheck?.enabled ?? true,
      typecheckDebounce: cfg["typecheck.debounce"] ?? cfg.typecheck?.debounce ?? 200,
      snippetsEnabled: cfg["completions.snippets"] ?? cfg.completions?.snippets ?? false,
      propertyCompletions: cfg["completions.properties"] ?? cfg.completions?.properties ?? true,
      tagHelpHover: cfg["hover.tagHelp"] ?? cfg.hover?.tagHelp ?? true,
      typeInfoHover: cfg["hover.typeInfo"] ?? cfg.hover?.typeInfo ?? true,
    };
  }

  // Re-check all open documents
  documents.all().forEach(checkDocument);
});

// --- Resolve data type ---

const resolveCache = new Map<string, { ast: ReturnType<typeof parse>; dataType: Type }>();

function resolveDataType(document: TextDocument): { ast: ReturnType<typeof parse>; dataType: Type } | undefined {
  const uri = document.uri;
  try {
    const ast = parse(document.getText());
    if (!ast.typeDirective) return undefined;
    const { typeName, from } = ast.typeDirective;
    const templateDir = path.dirname(URI.parse(document.uri).fsPath);
    const typeFilePath = path.resolve(templateDir, from.endsWith(".ts") ? from : from + ".ts");
    const dataType = resolveType(typeFilePath, typeName);
    const result = { ast, dataType };
    resolveCache.set(uri, result);
    return result;
  } catch {
    return resolveCache.get(uri);
  }
}

// --- Tag help ---

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

// --- Hover ---

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const languageId = getLanguageId(document);
  const hostLang = getHostLanguage(languageId);

  // Check if cursor is in a host language region — delegate to embedded service
  const embedded = getEmbeddedLanguage(hostLang);
  if (embedded) {
    const text = document.getText();
    const offset = document.offsetAt(params.position);
    const regions = scanRegions(text, hostLang);
    const region = getRegionAtOffset(regions, offset);
    if (region && region.languageId !== "typecek") {
      const hover = embedded.doHover(document, params.position);
      if (hover) return hover;
    }
  }

  // Typecek hover
  // Tag help first
  if (globalConfig.tagHelpHover) {
    const tagHover = getTagHover(document, params.position);
    if (tagHover) return tagHover;
  }

  if (!globalConfig.typeInfoHover) return null;

  const resolved = resolveDataType(document);
  if (!resolved) return null;

  const result = typeAtPosition(resolved.ast, resolved.dataType, params.position.line, params.position.character);
  if (!result) return null;

  const code = formatTypeDefinition(result.type, result.name);
  return {
    contents: { kind: MarkupKind.Markdown, value: "```typescript\n" + code + "\n```" },
    range: {
      start: { line: result.line, character: result.column },
      end: { line: result.line, character: result.column + result.length },
    },
  };
});

function getTagHover(document: TextDocument, position: { line: number; character: number }): Hover | null {
  const line = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  });
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
      if (!help) return null;
      return {
        contents: { kind: MarkupKind.Markdown, value: "```typecek\n" + help.syntax + "\n```\n" + help.description },
        range: {
          start: { line: position.line, character: tagStart },
          end: { line: position.line, character: tagEnd },
        },
      };
    }
  }

  // Match tilde whitespace stripping
  const tildePattern = /\{\{~|~\}\}/g;
  while ((match = tildePattern.exec(line)) !== null) {
    const tildeChar = match[0].indexOf("~");
    const tildePos = match.index + tildeChar;
    if (col === tildePos) {
      return {
        contents: { kind: MarkupKind.Markdown, value: "```typecek\n{{~ expr}} or {{expr ~}}\n```\nThe `~` strips whitespace on that side of the tag." },
        range: {
          start: { line: position.line, character: tildePos },
          end: { line: position.line, character: tildePos + 1 },
        },
      };
    }
  }

  // Match meta variables
  const metaPattern = /\{\{\s*(@(?:index|first|last|length|content))\s*\}\}/g;
  while ((match = metaPattern.exec(line)) !== null) {
    const name = match[1];
    const start = match.index + match[0].indexOf(name);
    const end = start + name.length;
    if (col >= start && col < end) {
      const descriptions: Record<string, string> = {
        "@index": "Zero-based index of the current iteration.",
        "@first": "`true` on the first iteration.",
        "@last": "`true` on the last iteration.",
        "@length": "Total number of items in the collection.",
        "@content": "Outputs the wrapped content passed by a `{{#layout}}` block.",
      };
      return {
        contents: { kind: MarkupKind.Markdown, value: "```typecek\n{{" + name + "}}\n```\n" + (descriptions[name] ?? "") },
        range: {
          start: { line: position.line, character: start },
          end: { line: position.line, character: end },
        },
      };
    }
  }

  // Match partial tag
  const partialPattern = /\{\{>/g;
  while ((match = partialPattern.exec(line)) !== null) {
    const start = match.index;
    const end = start + 3;
    if (col >= start && col < end) {
      return {
        contents: { kind: MarkupKind.Markdown, value: '```typecek\n{{> "./partial.html.tc" data}}\n```\nRenders a partial template inline.' },
        range: {
          start: { line: position.line, character: start },
          end: { line: position.line, character: end },
        },
      };
    }
  }

  return null;
}

// --- Definition ---

connection.onDefinition((params: TextDocumentPositionParams): Location | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  // Check if cursor is in a host language region — delegate to embedded service
  const languageId = getLanguageId(document);
  const hostLang = getHostLanguage(languageId);
  const embedded = getEmbeddedLanguage(hostLang);
  if (embedded) {
    const text = document.getText();
    const offset = document.offsetAt(params.position);
    const regions = scanRegions(text, hostLang);
    const region = getRegionAtOffset(regions, offset);
    if (region && region.languageId !== "typecek") {
      const def = embedded.doDefinition(document, params.position);
      if (def) return def;
    }
  }

  // File path definitions first
  const filePathDef = getFilePathDefinition(document, params.position);
  if (filePathDef) return filePathDef;

  // Property definition
  const resolved = resolveDataType(document);
  if (!resolved) return null;

  const result = typeAtPosition(resolved.ast, resolved.dataType, params.position.line, params.position.character);
  if (!result) return null;

  const dir = resolved.ast.typeDirective;
  if (!dir) return null;

  const templateDir = path.dirname(URI.parse(document.uri).fsPath);
  const typeFilePath = path.resolve(templateDir, dir.from.endsWith(".ts") ? dir.from : dir.from + ".ts");

  const decl = findDeclaration(typeFilePath, dir.typeName, result.propertyPath);
  if (!decl) return null;

  return {
    uri: URI.file(decl.filePath).toString(),
    range: {
      start: { line: decl.line, character: decl.column },
      end: { line: decl.line, character: decl.column },
    },
  };
});

function getFilePathDefinition(document: TextDocument, position: { line: number; character: number }): Location | null {
  const lineText = document.getText({
    start: { line: position.line, character: 0 },
    end: { line: position.line + 1, character: 0 },
  });
  const col = position.character;
  const templateDir = path.dirname(URI.parse(document.uri).fsPath);

  const stringRegex = /["']([^"']+)["']/g;
  let match;
  while ((match = stringRegex.exec(lineText)) !== null) {
    const start = match.index + 1;
    const end = start + match[1].length;
    if (col >= start && col <= end) {
      const filePath = match[1];

      if (lineText.match(/\{\{#import\s+\w+\s+from\s+/)) {
        const resolved = path.resolve(templateDir, filePath.endsWith(".ts") ? filePath : filePath + ".ts");
        if (fs.existsSync(resolved)) {
          return { uri: URI.file(resolved).toString(), range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } };
        }
      }

      if (lineText.match(/\{\{#layout\s+/) || lineText.match(/\{\{>\s+/)) {
        const resolved = path.resolve(templateDir, filePath);
        if (fs.existsSync(resolved)) {
          return { uri: URI.file(resolved).toString(), range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } };
        }
      }
    }
  }

  return null;
}

// --- Completions ---

connection.onCompletion((params: CompletionParams): CompletionItem[] | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const languageId = getLanguageId(document);
  const hostLang = getHostLanguage(languageId);

  const lineText = document.getText({
    start: { line: params.position.line, character: 0 },
    end: { line: params.position.line + 1, character: 0 },
  });
  const textBefore = lineText.slice(0, params.position.character);

  // Check if we're inside a Typecek expression
  const inTypecekExpr = textBefore.match(/\{\{~?\s*[^}]*$/) || textBefore.match(/\{\{#\w+\s+[^}]*$/) || textBefore.match(/\{\{[#/]\w*$/);

  if (inTypecekExpr) {
    return getTypecekCompletions(document, params.position, textBefore, lineText);
  }

  // Delegate to embedded language service
  const embedded = getEmbeddedLanguage(hostLang);
  if (embedded) {
    return embedded.doComplete(document, params.position);
  }

  return null;
});

function getTypecekCompletions(document: TextDocument, position: { line: number; character: number }, textBefore: string, lineText: string): CompletionItem[] | null {
  // 1. Tag name completion after {{# or {{/
  const blockMatch = textBefore.match(/\{\{#(\w*)$/);
  if (blockMatch) {
    const items: CompletionItem[] = [];

    if (globalConfig.snippetsEnabled) {
      const snippets = [
        { label: "if", snippet: "if ${1:condition}}}$0{{/if}}", doc: "Conditionally renders content." },
        { label: "if...else", snippet: "if ${1:condition}}}$0{{#else}}{{/if}}", doc: "Conditional with else branch." },
        { label: "for", snippet: "for ${1:item} in ${2:collection}}}$0{{/for}}", doc: "Iterates over an array." },
        { label: "for...empty", snippet: "for ${1:item} in ${2:collection}}}$0{{#empty}}{{/empty}}{{/for}}", doc: "Loop with empty fallback." },
        { label: "with", snippet: "with ${1:expression}}}$0{{/with}}", doc: "Scopes into a nested property." },
        { label: "with...empty", snippet: "with ${1:expression}}}$0{{#empty}}{{/empty}}{{/with}}", doc: "Scope with empty fallback." },
        { label: "switch", snippet: 'switch ${1:expression}}}{{#case "${2:value}"}}$0{{/case}}{{/switch}}', doc: "Matches expression against string cases." },
        { label: "layout", snippet: 'layout "${1:./layout.html.tc}" ${2:data}}}$0{{/layout}}', doc: "Wraps content with a layout template." },
        { label: "import", snippet: 'import ${1:Type} from "${2:./types}"}}', doc: "Import a TypeScript type for type checking." },
      ];

      for (const s of snippets) {
        items.push({
          label: s.label,
          kind: CompletionItemKind.Snippet,
          insertText: s.snippet,
          insertTextFormat: InsertTextFormat.Snippet,
          documentation: { kind: MarkupKind.Markdown, value: s.doc },
          sortText: `0_${s.label}`,
        });
      }
    }

    const tags = ["if", "for", "with", "switch", "case", "default", "empty", "raw", "else", "layout"];
    for (const tag of tags) {
      const help = TAG_HELP[tag];
      items.push({
        label: tag,
        kind: CompletionItemKind.Keyword,
        documentation: help ? { kind: MarkupKind.Markdown, value: `\`${help.syntax}\`\n\n${help.description}` } : undefined,
        sortText: `1_${tag}`,
      });
    }

    return items;
  }

  const closeMatch = textBefore.match(/\{\{\/(\w*)$/);
  if (closeMatch) {
    const tags = ["if", "for", "with", "switch", "case", "default", "empty", "raw", "layout"];
    return tags.map((tag) => ({ label: tag, kind: CompletionItemKind.Keyword }));
  }

  // 2. Partial snippet after {{>
  if (globalConfig.snippetsEnabled) {
    const partialMatch = textBefore.match(/\{\{>\s*$/);
    if (partialMatch) {
      return [{
        label: "partial",
        kind: CompletionItemKind.Snippet,
        insertText: ' "${1:./partial.html.tc}" ${2:data}}}',
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: { kind: MarkupKind.Markdown, value: "Renders a partial template inline." },
      }];
    }
  }

  // 3. Import path completion
  const importPathMatch = textBefore.match(/\{\{#import\s+\w+\s+from\s+["']([^"']*)$/);
  if (importPathMatch) {
    const partial = importPathMatch[1];
    const templateDir = path.dirname(URI.parse(document.uri).fsPath);
    const searchDir = partial.includes("/")
      ? path.resolve(templateDir, partial.substring(0, partial.lastIndexOf("/") + 1))
      : templateDir;

    try {
      const entries = fs.readdirSync(searchDir, { withFileTypes: true });
      const items: CompletionItem[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          items.push({
            label: entry.name,
            kind: CompletionItemKind.Folder,
            insertText: entry.name + "/",
          });
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
          items.push({
            label: entry.name.replace(/\.ts$/, ""),
            kind: CompletionItemKind.File,
          });
        }
      }
      return items;
    } catch {
      return null;
    }
  }

  // 4. Import type name completion
  const importTypeMatch = textBefore.match(/\{\{#import\s+(\w*)$/);
  if (importTypeMatch) {
    const fromMatch = lineText.match(/from\s+["']([^"']+)["']/);
    if (fromMatch) {
      const templateDir = path.dirname(URI.parse(document.uri).fsPath);
      const importPath = fromMatch[1];
      const typeFilePath = path.resolve(templateDir, importPath.endsWith(".ts") ? importPath : importPath + ".ts");
      try {
        const names = listExportedTypes(typeFilePath);
        return names.map((name) => ({ label: name, kind: CompletionItemKind.Interface }));
      } catch {
        return null;
      }
    }
    return null;
  }

  // 5. Property completion inside expressions
  if (!globalConfig.propertyCompletions) return null;

  const inExpr = textBefore.match(/\{\{~?\s*[^}]*$/) || textBefore.match(/\{\{#\w+\s+[^}]*$/);
  if (!inExpr) return null;

  const resolved = resolveDataType(document);
  if (!resolved) return null;

  // Dot completion
  const dotMatch = textBefore.match(/(\w+(?:\.\w+)*)\.\s*(\w*)$/);
  if (dotMatch) {
    const chain = dotMatch[1].split(".");
    const partial = dotMatch[2] || "";
    const type = resolveChainAtPosition(resolved.ast, resolved.dataType, chain, position.line);
    if (!type) return null;
    const items = getPropertyItems(type);
    const replaceStart = position.character - partial.length;
    for (const item of items) {
      item.textEdit = {
        range: {
          start: { line: position.line, character: replaceStart },
          end: { line: position.line, character: position.character },
        },
        newText: item.label as string,
      };
    }
    return items;
  }

  // Bare identifier completion
  try {
    const entries = completionsAtPosition(resolved.ast, resolved.dataType, position.line, position.character);
    return entries.map((entry) => ({
      label: entry.name,
      kind: CompletionItemKind.Property,
      detail: formatType(entry.type),
    }));
  } catch {
    return null;
  }
}

function getPropertyItems(type: Type): CompletionItem[] {
  const items: CompletionItem[] = [];
  if (type.kind === TypeKind.Object) {
    for (const [name, propType] of type.properties) {
      items.push({ label: name, kind: CompletionItemKind.Property, detail: formatType(propType) });
    }
  } else if (type.kind === TypeKind.Union) {
    for (const t of type.types) {
      if (t.kind === TypeKind.Null || t.kind === TypeKind.Undefined) continue;
      items.push(...getPropertyItems(t));
    }
  }
  return items;
}

// --- Diagnostics ---

let debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

documents.onDidChangeContent((change) => {
  const uri = change.document.uri;
  const existing = debounceTimers.get(uri);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    checkDocument(change.document);
    debounceTimers.delete(uri);
  }, globalConfig.typecheckDebounce);

  debounceTimers.set(uri, timer);
});

documents.onDidClose((event) => {
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
  resolveCache.delete(event.document.uri);
  const hostLang = getHostLanguage(getLanguageId(event.document));
  const embedded = getEmbeddedLanguage(hostLang);
  embedded?.onDocumentClose?.(event.document.uri);
  const timer = debounceTimers.get(event.document.uri);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(event.document.uri);
  }
});

function checkDocument(document: TextDocument): void {
  if (!globalConfig.typecheckEnabled) {
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    return;
  }

  const template = document.getText();
  const diagnostics: Diagnostic[] = [];

  try {
    const ast = parse(template);
    const dir = ast.typeDirective;

    if (!dir) {
      connection.sendDiagnostics({ uri: document.uri, diagnostics });
      return;
    }

    const { typeName, from } = dir;
    const templateDir = path.dirname(URI.parse(document.uri).fsPath);
    const typeFilePath = path.resolve(templateDir, from.endsWith(".ts") ? from : from + ".ts");

    try {
      const dataType = resolveType(typeFilePath, typeName);
      const checkerDiags = typecheck(ast, dataType, { templateDir });

      for (const diag of checkerDiags) {
        diagnostics.push({
          range: {
            start: { line: diag.line, character: diag.column },
            end: { line: diag.line, character: diag.column + diag.length },
          },
          message: diag.message,
          severity: diag.severity === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
          source: "typecek",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      diagnostics.push({
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: template.indexOf("\n") || template.length },
        },
        message,
        severity: DiagnosticSeverity.Error,
        source: "typecek",
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const range = err instanceof ParseError
      ? { start: { line: err.line, character: err.column }, end: { line: err.line, character: err.column + err.length } }
      : { start: { line: 0, character: 0 }, end: { line: 0, character: template.indexOf("\n") || template.length } };
    diagnostics.push({
      range,
      message,
      severity: DiagnosticSeverity.Error,
      source: "typecek",
    });
  }

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// --- Helpers ---

function getLanguageId(document: TextDocument): string {
  // The document's languageId comes from VS Code's language registration
  // For our documents: "typecek-html", "typecek-ts", "typecek"
  return document.languageId;
}

// --- Start ---

documents.listen(connection);
connection.listen();
