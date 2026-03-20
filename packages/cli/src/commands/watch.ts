import fs from "fs";
import path from "path";
import { compile } from "@typecek/compiler";
import { findTsconfigRoot, findSourceRoot } from "./compile.js";

export function watch(): void {
  const projectRoot = findTsconfigRoot();
  const sourceRoot = findSourceRoot(projectRoot);
  const typecekDir = path.join(projectRoot, ".typecek");

  console.log(`Watching for .tc file changes in ${path.relative(process.cwd(), sourceRoot) || "."}...`);
  console.log("Press Ctrl+C to stop.\n");

  fs.watch(sourceRoot, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith(".tc")) return;

    const templatePath = path.join(sourceRoot, filename);
    const relativePath = filename;
    const outputRelative = relativePath.replace(/\.tc$/, ".ts");
    const outputPath = path.join(typecekDir, outputRelative);

    // Handle deletion
    if (!fs.existsSync(templatePath)) {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
        console.log(`  deleted ${relativePath}`);
      }
      return;
    }

    // Compile
    try {
      const template = fs.readFileSync(templatePath, "utf-8");
      const result = compile({ template, filename: path.basename(templatePath) });

      const outputDir = path.dirname(outputPath);
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(outputPath, result.code);

      console.log(`  compiled ${relativePath}`);
    } catch (err) {
      console.error(`  error in ${relativePath}: ${err instanceof Error ? err.message : err}`);
    }
  });
}
