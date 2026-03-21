import type { CompletionItem, Hover, Location } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  getLanguageService as getHTMLLanguageService,
  type LanguageService as HTMLLanguageService,
} from "vscode-html-languageservice";
import {
  getCSSLanguageService,
  type LanguageService as CSSLanguageService,
} from "vscode-css-languageservice";
import type { EmbeddedLanguageService } from "./embedded.js";
import { scanRegions, getVirtualContent } from "./regions.js";

interface StyleRegion {
  start: number;
  end: number;
}

export class HTMLEmbeddedService implements EmbeddedLanguageService {
  private htmlService: HTMLLanguageService;
  private cssService: CSSLanguageService;

  constructor() {
    this.htmlService = getHTMLLanguageService();
    this.cssService = getCSSLanguageService();
  }

  doHover(document: TextDocument, position: { line: number; character: number }): Hover | null {
    const { virtualDoc } = this.getVirtual(document);
    const offset = virtualDoc.offsetAt(position);

    // Check if inside a <style> tag — delegate to CSS service
    const styleRegion = this.findStyleRegion(virtualDoc, offset);
    if (styleRegion) {
      const cssDoc = this.getCSSVirtualDoc(virtualDoc, styleRegion);
      const stylesheet = this.cssService.parseStylesheet(cssDoc);
      return this.cssService.doHover(cssDoc, position, stylesheet) ?? null;
    }

    const htmlDoc = this.htmlService.parseHTMLDocument(virtualDoc);
    return this.htmlService.doHover(virtualDoc, position, htmlDoc) ?? null;
  }

  doComplete(document: TextDocument, position: { line: number; character: number }): CompletionItem[] | null {
    const { virtualDoc } = this.getVirtual(document);
    const offset = virtualDoc.offsetAt(position);

    // Check if inside a <style> tag — delegate to CSS service
    const styleRegion = this.findStyleRegion(virtualDoc, offset);
    if (styleRegion) {
      const cssDoc = this.getCSSVirtualDoc(virtualDoc, styleRegion);
      const stylesheet = this.cssService.parseStylesheet(cssDoc);
      const result = this.cssService.doComplete(cssDoc, position, stylesheet);
      return result?.items ?? null;
    }

    const htmlDoc = this.htmlService.parseHTMLDocument(virtualDoc);
    const result = this.htmlService.doComplete(virtualDoc, position, htmlDoc);
    return result?.items ?? null;
  }

  doDefinition(_document: TextDocument, _position: { line: number; character: number }): Location | null {
    return null;
  }

  private getVirtual(document: TextDocument) {
    const text = document.getText();
    const regions = scanRegions(text, "html");
    const virtualContent = getVirtualContent(text, regions, "html");
    const virtualDoc = TextDocument.create(document.uri, "html", document.version, virtualContent);
    return { virtualDoc };
  }

  /**
   * Find the <style> region containing the given offset, if any.
   * Returns the content boundaries (after <style> open tag, before </style>).
   */
  private findStyleRegion(doc: TextDocument, offset: number): StyleRegion | null {
    const text = doc.getText();
    const pattern = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const contentStart = match.index + match[0].indexOf(match[1]);
      const contentEnd = contentStart + match[1].length;
      if (offset >= contentStart && offset <= contentEnd) {
        return { start: contentStart, end: contentEnd };
      }
    }
    return null;
  }

  /**
   * Create a virtual CSS document by blanking everything outside the style region.
   * This preserves line/column mapping so CSS positions map back correctly.
   */
  private getCSSVirtualDoc(htmlDoc: TextDocument, region: StyleRegion): TextDocument {
    const text = htmlDoc.getText();
    const chars = text.split("");
    for (let i = 0; i < text.length; i++) {
      if (i < region.start || i >= region.end) {
        if (chars[i] !== "\n") {
          chars[i] = " ";
        }
      }
    }
    return TextDocument.create(htmlDoc.uri, "css", htmlDoc.version, chars.join(""));
  }
}
