import { CompletionItemKind, MarkupKind, type CompletionItem, type Hover, type Location } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import ts from "typescript";
import fs from "fs";
import type { EmbeddedLanguageService } from "./embedded.js";
import { scanRegions, getVirtualContent } from "./regions.js";

export class TypeScriptEmbeddedService implements EmbeddedLanguageService {
  private virtualFiles = new Map<string, { version: number; content: string }>();
  private service: ts.LanguageService | undefined;

  private getService(): ts.LanguageService {
    if (this.service) return this.service;

    const virtualFiles = this.virtualFiles;
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => [...virtualFiles.keys()],
      getScriptVersion: (fileName) => String(virtualFiles.get(fileName)?.version ?? 0),
      getScriptSnapshot: (fileName) => {
        const file = virtualFiles.get(fileName);
        if (file) return ts.ScriptSnapshot.fromString(file.content);
        try {
          const content = fs.readFileSync(fileName, "utf-8");
          return ts.ScriptSnapshot.fromString(content);
        } catch {
          return undefined;
        }
      },
      getCurrentDirectory: () => process.cwd(),
      getCompilationSettings: () => ({
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        allowJs: true,
      }),
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };

    this.service = ts.createLanguageService(host);
    return this.service;
  }

  private getVirtualFileName(uri: string): string {
    const fsPath = URI.parse(uri).fsPath;
    return fsPath.replace(/\.ts\.tc$/, ".ts.tc.ts");
  }

  private updateVirtualFile(document: TextDocument): string {
    const text = document.getText();
    const regions = scanRegions(text, "typescript");
    const virtualContent = getVirtualContent(text, regions, "typescript");
    const fileName = this.getVirtualFileName(document.uri);
    const existing = this.virtualFiles.get(fileName);
    this.virtualFiles.set(fileName, {
      version: (existing?.version ?? 0) + 1,
      content: virtualContent,
    });
    return fileName;
  }

  doHover(document: TextDocument, position: { line: number; character: number }): Hover | null {
    const fileName = this.updateVirtualFile(document);
    const service = this.getService();
    const offset = document.offsetAt(position);
    const info = service.getQuickInfoAtPosition(fileName, offset);
    if (!info) return null;

    const display = ts.displayPartsToString(info.displayParts);
    const docs = ts.displayPartsToString(info.documentation);
    let value = "```typescript\n" + display + "\n```";
    if (docs) value += "\n\n" + docs;

    return {
      contents: { kind: MarkupKind.Markdown, value },
      range: info.textSpan ? {
        start: document.positionAt(info.textSpan.start),
        end: document.positionAt(info.textSpan.start + info.textSpan.length),
      } : undefined,
    };
  }

  doComplete(document: TextDocument, position: { line: number; character: number }): CompletionItem[] | null {
    const fileName = this.updateVirtualFile(document);
    const service = this.getService();
    const offset = document.offsetAt(position);
    const completions = service.getCompletionsAtPosition(fileName, offset, undefined);
    if (!completions) return null;

    return completions.entries.map((entry) => ({
      label: entry.name,
      kind: tsCompletionKindToLSP(entry.kind),
      sortText: entry.sortText,
      detail: entry.kind,
    }));
  }

  doDefinition(document: TextDocument, position: { line: number; character: number }): Location | null {
    const fileName = this.updateVirtualFile(document);
    const service = this.getService();
    const offset = document.offsetAt(position);
    const definitions = service.getDefinitionAtPosition(fileName, offset);
    if (!definitions || definitions.length === 0) return null;

    const def = definitions[0];

    if (def.fileName === fileName) {
      return {
        uri: document.uri,
        range: {
          start: document.positionAt(def.textSpan.start),
          end: document.positionAt(def.textSpan.start + def.textSpan.length),
        },
      };
    }

    const targetUri = URI.file(def.fileName).toString();
    try {
      const content = fs.readFileSync(def.fileName, "utf-8");
      const targetDoc = TextDocument.create(targetUri, "typescript", 0, content);
      return {
        uri: targetUri,
        range: {
          start: targetDoc.positionAt(def.textSpan.start),
          end: targetDoc.positionAt(def.textSpan.start + def.textSpan.length),
        },
      };
    } catch {
      return {
        uri: targetUri,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      };
    }
  }

  onDocumentClose(uri: string): void {
    this.virtualFiles.delete(this.getVirtualFileName(uri));
  }
}

function tsCompletionKindToLSP(kind: string): CompletionItemKind {
  switch (kind) {
    case ts.ScriptElementKind.functionElement:
    case ts.ScriptElementKind.memberFunctionElement:
    case ts.ScriptElementKind.constructSignatureElement:
    case ts.ScriptElementKind.callSignatureElement:
      return CompletionItemKind.Function;
    case ts.ScriptElementKind.memberVariableElement:
    case ts.ScriptElementKind.memberGetAccessorElement:
    case ts.ScriptElementKind.memberSetAccessorElement:
      return CompletionItemKind.Property;
    case ts.ScriptElementKind.variableElement:
    case ts.ScriptElementKind.localVariableElement:
    case ts.ScriptElementKind.letElement:
    case ts.ScriptElementKind.constElement:
      return CompletionItemKind.Variable;
    case ts.ScriptElementKind.classElement:
      return CompletionItemKind.Class;
    case ts.ScriptElementKind.interfaceElement:
    case ts.ScriptElementKind.typeElement:
      return CompletionItemKind.Interface;
    case ts.ScriptElementKind.enumElement:
      return CompletionItemKind.Enum;
    case ts.ScriptElementKind.enumMemberElement:
      return CompletionItemKind.EnumMember;
    case ts.ScriptElementKind.moduleElement:
      return CompletionItemKind.Module;
    case ts.ScriptElementKind.keyword:
      return CompletionItemKind.Keyword;
    default:
      return CompletionItemKind.Text;
  }
}
