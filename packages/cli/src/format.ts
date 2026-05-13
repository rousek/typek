import { execFileSync } from "child_process";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import os from "os";

let prettierBin: string | null | undefined;

function findPrettierBin(): string | null {
  if (prettierBin !== undefined) return prettierBin;
  try {
    const req = createRequire(process.cwd() + "/noop.js");
    const prettierEntry = req.resolve("prettier");
    prettierBin = prettierEntry.replace(/index\.cjs$/, "bin/prettier.cjs");
    return prettierBin;
  } catch {
    prettierBin = null;
    return null;
  }
}

/**
 * Try to format code with the project's prettier installation.
 * Returns the original code unchanged if prettier is not available.
 */
export function formatWithPrettier(code: string, filepath: string): string {
  const bin = findPrettierBin();
  if (!bin) return code;

  const tmpFile = path.join(os.tmpdir(), `typecek-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`);
  try {
    fs.writeFileSync(tmpFile, code);
    execFileSync(
      process.execPath,
      [bin, "--write", "--parser", "typescript", tmpFile],
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10_000,
      },
    );
    return fs.readFileSync(tmpFile, "utf-8");
  } catch {
    return code;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}
