import fs from "fs";
import path from "path";
import { compile } from "@typecek/compiler";
import type { Diagnostic } from "@typecek/core";

// ANSI color helpers
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

export function findTsconfigRoot(): string {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "tsconfig.json"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export function findSourceRoot(projectRoot: string): string {
  const tsconfigPath = path.join(projectRoot, "tsconfig.json");
  if (fs.existsSync(tsconfigPath)) {
    try {
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
      const rootDir = tsconfig.compilerOptions?.rootDir;
      if (rootDir) return path.resolve(projectRoot, rootDir);
      const include = tsconfig.include;
      if (Array.isArray(include) && include.length > 0) {
        const first = include[0].replace(/\/\*\*.*$/, "");
        return path.resolve(projectRoot, first);
      }
    } catch {
      // fall through
    }
  }
  // Default to src/ or project root
  const srcDir = path.join(projectRoot, "src");
  if (fs.existsSync(srcDir)) return srcDir;
  return projectRoot;
}

function findTemplateFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".typecek" || entry.name.startsWith(".")) continue;
        walk(fullPath);
      } else if (entry.name.endsWith(".tc")) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

function formatDiagnostic(
  diag: Diagnostic,
  templatePath: string,
  sourceLines: string[],
): string {
  const isError = diag.severity === "error";
  const color = isError ? red : yellow;
  const label = isError ? red("error") : yellow("warning");

  // file:line:col — clickable in terminals
  const location = cyan(`${templatePath}:${diag.line + 1}:${diag.column + 1}`);

  let out = `\n${location} - ${label}${bold(":")} ${diag.message}\n`;

  // Show the source line with underline
  const sourceLine = sourceLines[diag.line];
  if (sourceLine !== undefined) {
    const lineNum = String(diag.line + 1);
    const gutter = dim(`${lineNum} | `);
    out += `${gutter}${sourceLine}\n`;

    const underlineLen = Math.max(diag.length, 1);
    const padding = " ".repeat(lineNum.length + 3 + diag.column);
    out += `${padding}${color("~".repeat(underlineLen))}\n`;
  }

  return out;
}

function formatSimpleError(
  message: string,
  templatePath: string,
  line?: number,
  column?: number,
): string {
  const loc = line !== undefined
    ? cyan(`${templatePath}:${line + 1}:${(column ?? 0) + 1}`)
    : cyan(templatePath);
  return `\n${loc} - ${red("error")}${bold(":")} ${message}\n`;
}

export function compileAll(checkOnly = false): void {
  const projectRoot = findTsconfigRoot();
  const sourceRoot = findSourceRoot(projectRoot);
  const typecekDir = path.join(projectRoot, ".typecek");
  const templateFiles = findTemplateFiles(sourceRoot);

  if (templateFiles.length === 0) {
    console.log("No .tc template files found.");
    return;
  }

  let errors = 0;

  // Track which templates are layouts and which reference layouts
  const compiledTemplates = new Map<string, { relativePath: string; isLayout: boolean; layoutDeps: string[] }>();

  for (const templatePath of templateFiles) {
    const relativePath = path.relative(sourceRoot, templatePath);
    const outputRelative = relativePath.replace(/\.tc$/, ".ts");
    const outputPath = path.join(typecekDir, outputRelative);

    try {
      const template = fs.readFileSync(templatePath, "utf-8");
      const sourceLines = template.split("\n");
      const result = compile({
        template,
        filename: path.basename(templatePath),
        templatePath,
        typecheck: true,
      });

      compiledTemplates.set(templatePath, {
        relativePath,
        isLayout: result.isLayout,
        layoutDeps: result.layoutDeps,
      });

      if (result.diagnostics.length > 0) {
        for (const diag of result.diagnostics) {
          console.error(formatDiagnostic(diag, relativePath, sourceLines));
          if (diag.severity === "error") errors++;
        }
      }

      if (!checkOnly) {
        const outputDir = path.dirname(outputPath);
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(outputPath, result.code);
      }

      const diagCount = result.diagnostics.filter((d) => d.severity === "error").length;
      if (diagCount === 0) {
        console.log(`  ${checkOnly ? "checked" : "compiled"} ${relativePath}`);
      }
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      // ParseError has line/column info
      const parseErr = err as { line?: number; column?: number };
      console.error(formatSimpleError(message, relativePath, parseErr.line, parseErr.column));
    }
  }

  // Validate layout usage
  const layoutFiles = new Set<string>();
  for (const [filePath, info] of compiledTemplates) {
    if (info.isLayout) layoutFiles.add(filePath);
  }

  for (const [filePath, info] of compiledTemplates) {
    // Check that {{#layout}} references point to templates with {{@content}}
    for (const dep of info.layoutDeps) {
      const resolvedDep = path.resolve(path.dirname(filePath), dep + ".tc");
      const depInfo = compiledTemplates.get(resolvedDep);
      if (depInfo && !depInfo.isLayout) {
        errors++;
        console.error(formatSimpleError(
          `layout "${dep}" does not contain {{@content}}`,
          info.relativePath,
        ));
      }
    }
  }

  const errorSummary = errors > 0 ? red(`${errors} error(s)`) : `${errors} error(s)`;
  console.log(`\n${templateFiles.length} template(s), ${errorSummary}.`);

  if (errors > 0) {
    process.exitCode = 1;
  }
}
