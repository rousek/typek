import {
  getLanguageService as getJSONLanguageService,
  type LanguageService as JSONLanguageService,
} from "vscode-json-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import type {
  CompletionItem,
  Hover,
  Location,
} from "vscode-languageserver/node";
import type { EmbeddedLanguageService } from "./embedded.js";
import { getVirtualContent, scanRegions } from "./regions.js";

export class JSONEmbeddedService implements EmbeddedLanguageService {
  private jsonService: JSONLanguageService;

  constructor() {
    this.jsonService = getJSONLanguageService({});
  }

  async doHover(
    document: TextDocument,
    position: { line: number; character: number },
  ): Promise<Hover | null> {
    const virtualDoc = this.getVirtual(document);
    const jsonDoc = this.jsonService.parseJSONDocument(virtualDoc);
    return (
      (await this.jsonService.doHover(virtualDoc, position, jsonDoc)) ?? null
    );
  }

  async doComplete(
    document: TextDocument,
    position: { line: number; character: number },
  ): Promise<CompletionItem[] | null> {
    const virtualDoc = this.getVirtual(document);
    const jsonDoc = this.jsonService.parseJSONDocument(virtualDoc);
    const result = await this.jsonService.doComplete(
      virtualDoc,
      position,
      jsonDoc,
    );
    return result?.items ?? null;
  }

  doDefinition(
    _document: TextDocument,
    _position: { line: number; character: number },
  ): Location | null {
    return null;
  }

  private getVirtual(document: TextDocument): TextDocument {
    const text = document.getText();
    const regions = scanRegions(text, "json");
    const virtualContent = getVirtualContent(text, regions, "json");
    return TextDocument.create(
      document.uri,
      "json",
      document.version,
      virtualContent,
    );
  }
}
