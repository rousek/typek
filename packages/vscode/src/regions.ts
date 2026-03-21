export interface DocumentRegion {
  start: number;
  end: number;
  languageId: string;
}

/**
 * Scan a template document and split it into regions:
 * - Typecek regions inside {{ }} and {{{ }}}
 * - Host language regions (html, typescript, etc.) outside
 */
export function scanRegions(text: string, hostLanguage: string): DocumentRegion[] {
  const regions: DocumentRegion[] = [];
  // Match {{ ... }}, {{{ ... }}}, and {{! ... }}
  const pattern = /\{\{\{.*?\}\}\}|\{\{.*?\}\}/gs;
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Host region before this expression
    if (match.index > lastEnd) {
      regions.push({ start: lastEnd, end: match.index, languageId: hostLanguage });
    }
    // Typecek region
    regions.push({ start: match.index, end: match.index + match[0].length, languageId: "typecek" });
    lastEnd = match.index + match[0].length;
  }

  // Trailing host content
  if (lastEnd < text.length) {
    regions.push({ start: lastEnd, end: text.length, languageId: hostLanguage });
  }

  return regions;
}

/**
 * Generate a virtual document for a specific language by replacing
 * other language regions with whitespace (preserving line/column mapping).
 */
export function getVirtualContent(text: string, regions: DocumentRegion[], languageId: string): string {
  const chars = text.split("");
  for (const region of regions) {
    if (region.languageId !== languageId) {
      for (let i = region.start; i < region.end; i++) {
        if (chars[i] !== "\n") {
          chars[i] = " ";
        }
      }
    }
  }
  return chars.join("");
}

/**
 * Find which region contains the given offset.
 */
export function getRegionAtOffset(regions: DocumentRegion[], offset: number): DocumentRegion | undefined {
  for (const region of regions) {
    if (offset >= region.start && offset < region.end) {
      return region;
    }
  }
  return undefined;
}

/**
 * Map of document language IDs to host languages.
 * Add entries here to support new file types (e.g. "typecek-xml" -> "xml").
 */
const hostLanguageMap: Record<string, string> = {
  "typecek-html": "html",
  "typecek-ts": "typescript",
};

export function registerHostLanguage(documentLanguageId: string, hostLanguage: string): void {
  hostLanguageMap[documentLanguageId] = hostLanguage;
}

/**
 * Determine the host language from the document language ID.
 */
export function getHostLanguage(languageId: string): string {
  return hostLanguageMap[languageId] ?? "plaintext";
}
