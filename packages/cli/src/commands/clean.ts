import fs from "fs";
import path from "path";
import { findTsconfigRoot } from "./compile.js";

export function clean(): void {
  const projectRoot = findTsconfigRoot();
  const typecekDir = path.join(projectRoot, ".typecek");

  if (fs.existsSync(typecekDir)) {
    fs.rmSync(typecekDir, { recursive: true, force: true });
    console.log("Removed .typecek/ directory.");
  } else {
    console.log("Nothing to clean — .typecek/ does not exist.");
  }
}
