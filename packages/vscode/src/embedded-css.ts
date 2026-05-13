import {
  getCSSLanguageService,
  getSCSSLanguageService,
  type LanguageService as CSSLanguageService,
} from "vscode-css-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import type {
  CompletionItem,
  Hover,
  Location,
} from "vscode-languageserver/node";
import type { EmbeddedLanguageService } from "./embedded.js";
import { getVirtualContent, scanRegions } from "./regions.js";

export class CSSEmbeddedService implements EmbeddedLanguageService {
  private cssService: CSSLanguageService;
  private languageId: string;

  constructor(languageId: "css" | "scss" | "sass") {
    this.languageId = languageId;
    // SASS (indented syntax) falls back to SCSS service as closest match
    this.cssService =
      languageId === "css" ? getCSSLanguageService() : getSCSSLanguageService();
  }

  doHover(
    document: TextDocument,
    position: { line: number; character: number },
  ): Hover | null {
    const virtualDoc = this.getVirtual(document);
    const stylesheet = this.cssService.parseStylesheet(virtualDoc);
    return this.cssService.doHover(virtualDoc, position, stylesheet) ?? null;
  }

  doComplete(
    document: TextDocument,
    position: { line: number; character: number },
  ): CompletionItem[] | null {
    const virtualDoc = this.getVirtual(document);
    const stylesheet = this.cssService.parseStylesheet(virtualDoc);
    const result = this.cssService.doComplete(virtualDoc, position, stylesheet);
    return result?.items ?? null;
  }

  doDefinition(
    document: TextDocument,
    position: { line: number; character: number },
  ): Location | null {
    const virtualDoc = this.getVirtual(document);
    const stylesheet = this.cssService.parseStylesheet(virtualDoc);
    const location = this.cssService.findDefinition(
      virtualDoc,
      position,
      stylesheet,
    );
    return location ?? null;
  }

  private getVirtual(document: TextDocument): TextDocument {
    const text = document.getText();
    const regions = scanRegions(text, this.languageId);
    const virtualContent = getVirtualContent(text, regions, this.languageId);
    return TextDocument.create(
      document.uri,
      this.languageId,
      document.version,
      virtualContent,
    );
  }
}
