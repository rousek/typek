import fs from "fs";
import path from "path";
import { compile } from "@typek/compiler";

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
        if (entry.name === "node_modules" || entry.name === ".typek" || entry.name.startsWith(".")) continue;
        walk(fullPath);
      } else if (entry.name.endsWith(".tk")) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

export function compileAll(checkOnly = false): void {
  const projectRoot = findTsconfigRoot();
  const sourceRoot = findSourceRoot(projectRoot);
  const typekDir = path.join(projectRoot, ".typek");
  const templateFiles = findTemplateFiles(sourceRoot);

  if (templateFiles.length === 0) {
    console.log("No .tk template files found.");
    return;
  }

  let errors = 0;

  // Track which templates are layouts and which reference layouts
  const compiledTemplates = new Map<string, { relativePath: string; isLayout: boolean; layoutDeps: string[] }>();

  for (const templatePath of templateFiles) {
    const relativePath = path.relative(sourceRoot, templatePath);
    const outputRelative = relativePath.replace(/\.tk$/, ".ts");
    const outputPath = path.join(typekDir, outputRelative);

    try {
      const template = fs.readFileSync(templatePath, "utf-8");
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
          const prefix = diag.severity === "error" ? "error" : "warning";
          console.error(`  ${prefix} in ${relativePath}: ${diag.message}`);
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
      console.error(`  error in ${relativePath}: ${err instanceof Error ? err.message : err}`);
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
      const resolvedDep = path.resolve(path.dirname(filePath), dep + ".tk");
      const depInfo = compiledTemplates.get(resolvedDep);
      if (depInfo && !depInfo.isLayout) {
        errors++;
        console.error(`  error in ${info.relativePath}: layout "${dep}" does not contain {{@content}}`);
      }
    }
  }

  console.log(`\n${templateFiles.length} template(s), ${errors} error(s).`);

  if (errors > 0) {
    process.exitCode = 1;
  }
}
