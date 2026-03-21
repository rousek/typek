import type { CompletionItem, Hover, Location } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";

/**
 * Interface for embedded language services.
 *
 * Implement this to add support for a new host language (e.g. XML, CSS, YAML).
 * Each method receives the original document and cursor position.
 * The implementation is responsible for creating virtual documents
 * (via `getVirtualContent`) and delegating to the underlying language service.
 */
export interface EmbeddedLanguageService {
  doHover(document: TextDocument, position: { line: number; character: number }): Hover | null;
  doComplete(document: TextDocument, position: { line: number; character: number }): CompletionItem[] | null;
  doDefinition(document: TextDocument, position: { line: number; character: number }): Location | null;
  onDocumentClose?(uri: string): void;
}

const registry = new Map<string, EmbeddedLanguageService>();

/**
 * Register an embedded language service for a host language.
 *
 * Example:
 * ```ts
 * registerEmbeddedLanguage("xml", new XMLEmbeddedService());
 * ```
 */
export function registerEmbeddedLanguage(hostLanguage: string, service: EmbeddedLanguageService): void {
  registry.set(hostLanguage, service);
}

/**
 * Get the embedded language service for a host language, if registered.
 */
export function getEmbeddedLanguage(hostLanguage: string): EmbeddedLanguageService | undefined {
  return registry.get(hostLanguage);
}
