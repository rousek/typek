import fs from "fs";
import path from "path";
import { findTsconfigRoot, findSourceRoot } from "./compile.js";

const TYPE_DIRECTIVE_RE = /\{\{#import\s+(\w+)\s+from\s+["']([^"']+)["']\s*\}\}/;

export function list(): void {
  const projectRoot = findTsconfigRoot();
  const sourceRoot = findSourceRoot(projectRoot);
  const templateFiles = findTemplateFilesRecursive(sourceRoot);

  if (templateFiles.length === 0) {
    console.log("No .tc template files found.");
    return;
  }

  console.log(`Found ${templateFiles.length} template(s):\n`);

  for (const templatePath of templateFiles) {
    const relativePath = path.relative(projectRoot, templatePath);
    const firstLine = readFirstLine(templatePath);
    const match = firstLine ? TYPE_DIRECTIVE_RE.exec(firstLine) : null;

    if (match) {
      console.log(`  ${relativePath}  →  ${match[1]} from "${match[2]}"`);
    } else {
      console.log(`  ${relativePath}  →  (no type directive)`);
    }
  }
}

function readFirstLine(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const newlineIndex = content.indexOf("\n");
    return newlineIndex === -1 ? content : content.slice(0, newlineIndex);
  } catch {
    return null;
  }
}

function findTemplateFilesRecursive(dir: string): string[] {
  const results: string[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(fullPath);
      } else if (entry.name.endsWith(".tc")) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}
