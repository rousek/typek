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
import { scanRegions } from "./regions.js";

export class CSSEmbeddedService implements EmbeddedLanguageService {
  private cssService: CSSLanguageService;
  private languageId: string;

  constructor(languageId: "css" | "scss") {
    this.languageId = languageId;
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
    // Replace each typecek region with a CSS-identifier-safe placeholder
    // derived from the expression text (e.g. {{email}} -> __email__).
    // Same length as the original so positions still map correctly.
    const chars = text.split("");
    for (const region of regions) {
      if (region.languageId === this.languageId) continue;
      const original = text.slice(region.start, region.end);
      const placeholder = makeCssPlaceholder(original);
      for (let i = 0; i < placeholder.length; i++) {
        chars[region.start + i] = placeholder[i];
      }
    }
    const virtualContent = chars.join("");
    return TextDocument.create(
      document.uri,
      this.languageId,
      document.version,
      virtualContent,
    );
  }
}

/**
 * Build a CSS-identifier-safe placeholder of the same length as the
 * original {{...}} expression, derived from its inner text.
 *
 * Examples:
 *   {{email}}      -> __email__
 *   {{user.name}}  -> __user_name__
 *   {{#if x}}      -> ___if_x__
 *   {{ }}          -> _____
 */
function makeCssPlaceholder(original: string): string {
  const len = original.length;
  // Strip enclosing braces ({{...}} or {{{...}}}) and sigils, sanitize.
  const inner = original.replace(/^\{+|\}+$/g, "");
  const safe = inner.replace(/[^A-Za-z0-9]/g, "_").replace(/^_+|_+$/g, "");

  if (!safe) return "_".repeat(len);
  if (safe.length >= len) return safe.slice(0, len);

  // Center the safe text, pad both sides with underscores.
  const padTotal = len - safe.length;
  const padLeft = Math.floor(padTotal / 2);
  const padRight = padTotal - padLeft;
  return "_".repeat(padLeft) + safe + "_".repeat(padRight);
}
