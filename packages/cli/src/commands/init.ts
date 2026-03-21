import fs from "fs";
import path from "path";

export function init(): void {
  const cwd = process.cwd();
  const tsconfigPath = path.join(cwd, "tsconfig.json");
  const gitignorePath = path.join(cwd, ".gitignore");

  // Update tsconfig.json
  if (!fs.existsSync(tsconfigPath)) {
    console.error("tsconfig.json not found in current directory.");
    process.exitCode = 1;
    return;
  }

  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
  const compilerOptions = tsconfig.compilerOptions ?? {};
  const rootDirs: string[] = compilerOptions.rootDirs ?? [];

  let tsconfigChanged = false;

  // Add .typecek to rootDirs
  if (!rootDirs.includes("./.typecek")) {
    rootDirs.push("./.typecek");
    compilerOptions.rootDirs = rootDirs;
    tsconfig.compilerOptions = compilerOptions;
    tsconfigChanged = true;
  }

  // Ensure rootDirs has the source dir too
  const rootDir = compilerOptions.rootDir ?? "./src";
  if (!rootDirs.includes(rootDir) && !rootDirs.includes(rootDir.replace(/^\.\//, ""))) {
    rootDirs.unshift(rootDir);
    tsconfigChanged = true;
  }

  // Remove rootDir — it conflicts with rootDirs when .typecek/ files are outside it
  if (compilerOptions.rootDir) {
    delete compilerOptions.rootDir;
    tsconfigChanged = true;
  }

  // Ensure include covers .typecek/
  const include: string[] = tsconfig.include ?? [];
  const hasTypecekInclude = include.some((p: string) => p.startsWith(".typecek"));
  if (!hasTypecekInclude) {
    include.push(".typecek/**/*.ts");
    tsconfig.include = include;
    tsconfigChanged = true;
  }

  if (tsconfigChanged) {
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n");
    console.log("Updated tsconfig.json.");
  } else {
    console.log("tsconfig.json already configured.");
  }

  // Update .gitignore
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf-8");
    if (!content.includes(".typecek")) {
      fs.appendFileSync(gitignorePath, "\n# Typecek compiled output\n.typecek/\n");
      console.log("Added .typecek/ to .gitignore.");
    } else {
      console.log(".gitignore already includes .typecek/.");
    }
  } else {
    fs.writeFileSync(gitignorePath, "# Typecek compiled output\n.typecek/\n");
    console.log("Created .gitignore with .typecek/.");
  }

  // Create .typecek directory
  const typecekDir = path.join(cwd, ".typecek");
  if (!fs.existsSync(typecekDir)) {
    fs.mkdirSync(typecekDir, { recursive: true });
  }

  console.log("Typecek initialized.");
}
