import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { main } from "../index.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("cli", () => {
  let originalCwd: string;
  let tmpDir: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "typecek-test-"));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("command routing", () => {
    it("defaults to help when no args", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      main([]);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("typecek"));
    });

    it("recognizes help command", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      main(["help"]);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("typecek"));
    });

    it("rejects unknown command", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      main(["invalid"]);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("unknown command"));
    });

    it("sets exit code 1 for unknown command", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      main(["invalid"]);
      expect(process.exitCode).toBe(1);
    });
  });

  describe("init command", () => {
    it("updates tsconfig.json with rootDirs", () => {
      fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), JSON.stringify({
        compilerOptions: { target: "ES2022" },
      }));

      vi.spyOn(console, "log").mockImplementation(() => {});
      main(["init"]);

      const tsconfig = JSON.parse(fs.readFileSync(path.join(tmpDir, "tsconfig.json"), "utf-8"));
      expect(tsconfig.compilerOptions.rootDirs).toContain("./.typecek");
    });

    it("creates .gitignore with .typecek/ entry", () => {
      fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
      vi.spyOn(console, "log").mockImplementation(() => {});
      main(["init"]);

      const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain(".typecek/");
    });

    it("errors when tsconfig.json not found", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      main(["init"]);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("tsconfig.json"));
    });
  });

  describe("compile command", () => {
    it("compiles .tc files to .typecek/ directory", () => {
      const srcDir = path.join(tmpDir, "src");
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), JSON.stringify({
        compilerOptions: { rootDir: "./src" },
      }));
      fs.writeFileSync(path.join(srcDir, "types.ts"),
        'export interface User { name: string; }');
      fs.writeFileSync(path.join(srcDir, "test.html.tc"),
        '{{#import User from "./types"}}\n<h1>{{name}}</h1>');

      vi.spyOn(console, "log").mockImplementation(() => {});
      main(["compile"]);

      const outputPath = path.join(tmpDir, ".typecek", "test.html.ts");
      expect(fs.existsSync(outputPath)).toBe(true);

      const output = fs.readFileSync(outputPath, "utf-8");
      expect(output).toContain("export default function render");
      expect(output).toContain("User");
    });

    it("reports no templates when none exist", () => {
      fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      main(["compile"]);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("No .tc"));
    });
  });

  describe("check command", () => {
    it("checks templates without generating output", () => {
      const srcDir = path.join(tmpDir, "src");
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), JSON.stringify({
        compilerOptions: { rootDir: "./src" },
      }));
      fs.writeFileSync(path.join(srcDir, "types.ts"),
        'export interface User { name: string; }');
      fs.writeFileSync(path.join(srcDir, "test.html.tc"),
        '{{#import User from "./types"}}\n<h1>{{name}}</h1>');

      vi.spyOn(console, "log").mockImplementation(() => {});
      main(["check"]);

      const outputPath = path.join(tmpDir, ".typecek", "test.html.ts");
      expect(fs.existsSync(outputPath)).toBe(false);
    });
  });

  describe("clean command", () => {
    it("removes .typecek/ directory", () => {
      fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
      const typecekDir = path.join(tmpDir, ".typecek");
      fs.mkdirSync(typecekDir);
      fs.writeFileSync(path.join(typecekDir, "test.ts"), "test");

      vi.spyOn(console, "log").mockImplementation(() => {});
      main(["clean"]);

      expect(fs.existsSync(typecekDir)).toBe(false);
    });

    it("clear is an alias for clean", () => {
      fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), "{}");
      const typecekDir = path.join(tmpDir, ".typecek");
      fs.mkdirSync(typecekDir);

      vi.spyOn(console, "log").mockImplementation(() => {});
      main(["clear"]);

      expect(fs.existsSync(typecekDir)).toBe(false);
    });
  });

  describe("list command", () => {
    it("lists templates with their types", () => {
      const srcDir = path.join(tmpDir, "src");
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(tmpDir, "tsconfig.json"), JSON.stringify({
        compilerOptions: { rootDir: "./src" },
      }));
      fs.writeFileSync(path.join(srcDir, "types.ts"),
        'export interface CardProps { title: string; }');
      fs.writeFileSync(path.join(srcDir, "card.html.tc"),
        '{{#import CardProps from "./types"}}\n<div>{{title}}</div>');

      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      main(["list"]);

      const allOutput = spy.mock.calls.map((c) => c[0]).join("\n");
      expect(allOutput).toContain("card.html.tc");
      expect(allOutput).toContain("CardProps");
    });
  });
});
