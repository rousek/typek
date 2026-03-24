import ts from "typescript";
import fs from "fs";
import path from "path";
import { TypeKind, type Type } from "./types.js";

// Cache TS programs by file path + mtime to avoid re-parsing unchanged files
const programCache = new Map<string, { program: ts.Program; mtimeMs: number }>();

const compilerOptions: ts.CompilerOptions = {
  strict: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
};

// Locate the TypeScript lib directory. When TS is bundled (e.g. in the VS Code
// extension), ts.getDefaultLibFilePath() points to a non-existent path inside
// the bundle. We find the real lib directory by looking for typescript/lib in
// node_modules relative to the target file.
function findTsLibDir(fromDir: string): string | undefined {
  const defaultLib = ts.getDefaultLibFilePath(compilerOptions);
  if (fs.existsSync(defaultLib)) return path.dirname(defaultLib);

  // Walk up from the target file to find node_modules/typescript/lib
  let dir = fromDir;
  while (true) {
    const candidate = path.join(dir, "node_modules", "typescript", "lib");
    if (fs.existsSync(path.join(candidate, "lib.esnext.full.d.ts"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function createHost(filePath: string, options: ts.CompilerOptions): ts.CompilerHost | undefined {
  const libDir = findTsLibDir(path.dirname(filePath));
  if (!libDir) return undefined;

  const host = ts.createCompilerHost(options);
  host.getDefaultLibFileName = () => path.join(libDir, ts.getDefaultLibFileName(options));
  host.getDefaultLibLocation = () => libDir;
  return host;
}

function getProgram(filePath: string): ts.Program {
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch {}

  const cached = programCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.program;
  }

  const host = createHost(filePath, compilerOptions);
  const program = ts.createProgram([filePath], compilerOptions, host, cached?.program);
  programCache.set(filePath, { program, mtimeMs });
  return program;
}

/**
 * Resolves a TypeScript type from a source file into the internal type representation.
 */
export function resolveType(filePath: string, typeName: string): Type {
  const program = getProgram(filePath);

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) {
    throw new Error(`Could not read file '${filePath}'`);
  }

  const checker = program.getTypeChecker();

  // Find the type by looking up exports from the module symbol
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol) {
    const exports = checker.getExportsOfModule(moduleSymbol);
    for (const exp of exports) {
      if (exp.name === typeName) {
        const resolvedSymbol = exp.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exp)
          : exp;
        const decl = resolvedSymbol.declarations?.[0];
        if (decl) {
          const type = checker.getTypeAtLocation(decl);
          return convertType(type, checker, new Set());
        }
      }
    }
  }

  throw new Error(`Type '${typeName}' not found in '${filePath}'`);
}

/**
 * Lists all exported interface and type alias names from a TypeScript source file.
 */
export function listExportedTypes(filePath: string): string[] {
  const program = getProgram(filePath);

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) return [];

  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return [];

  return checker.getExportsOfModule(moduleSymbol)
    .filter(exp => {
      const resolved = exp.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exp)
        : exp;
      return resolved.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias);
    })
    .map(exp => exp.name);
}

export interface DeclarationLocation {
  filePath: string;
  line: number;
  column: number;
}

/**
 * Finds the source declaration of a property path within a type.
 * E.g. findDeclaration("types.ts", "StorePage", ["user", "name"])
 * returns the location of the `name` property in the User interface.
 */
export function findDeclaration(
  filePath: string,
  typeName: string,
  propertyPath: string[],
): DeclarationLocation | undefined {
  const program = getProgram(filePath);

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) return undefined;

  const checker = program.getTypeChecker();

  // Find the type symbol via module exports (handles re-exports)
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return undefined;

  const exports = checker.getExportsOfModule(moduleSymbol);
  const exportSymbol = exports.find(e => e.name === typeName);
  if (!exportSymbol) return undefined;

  const resolvedSymbol = exportSymbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(exportSymbol)
    : exportSymbol;

  const typeDecl = resolvedSymbol.declarations?.[0];
  if (!typeDecl) return undefined;

  // No property path — go to the type declaration itself
  if (propertyPath.length === 0) {
    const declSourceFile = typeDecl.getSourceFile();
    const pos = declSourceFile.getLineAndCharacterOfPosition(typeDecl.getStart());
    return { filePath: declSourceFile.fileName, line: pos.line, column: pos.character };
  }

  let tsType = checker.getTypeAtLocation(typeDecl);
  let declaration: ts.Declaration | undefined;

  function unwrapUnion(type: ts.Type, propName: string): ts.Type {
    if (!type.isUnion()) return type;
    // Prefer the member that has the property
    const match = type.types.find(t => !!t.getProperty(propName));
    if (match) return match;
    // Fall back to first non-null/undefined member
    for (const t of type.types) {
      if (!(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))) return t;
    }
    return type;
  }

  for (const propName of propertyPath) {
    tsType = unwrapUnion(tsType, propName);
    // Unwrap arrays to get element type
    if (checker.isArrayType(tsType)) {
      const typeArgs = checker.getTypeArguments(tsType as ts.TypeReference);
      if (typeArgs[0]) tsType = typeArgs[0];
    }
    tsType = unwrapUnion(tsType, propName);

    const prop = tsType.getProperty(propName);
    if (!prop) return undefined;
    declaration = prop.valueDeclaration ?? prop.declarations?.[0];
    if (!declaration) return undefined;
    tsType = checker.getTypeOfSymbolAtLocation(prop, declaration);
  }

  if (declaration) {
    const declSourceFile = declaration.getSourceFile();
    const pos = declSourceFile.getLineAndCharacterOfPosition(declaration.getStart());
    return { filePath: declSourceFile.fileName, line: pos.line, column: pos.character };
  }

  return undefined;
}

function convertType(tsType: ts.Type, checker: ts.TypeChecker, seen: Set<number>): Type {
  const flags = tsType.getFlags();

  // Primitives
  if (flags & ts.TypeFlags.String) return { kind: TypeKind.String };
  if (flags & ts.TypeFlags.Number) return { kind: TypeKind.Number };
  if (flags & ts.TypeFlags.Null) return { kind: TypeKind.Null };
  if (flags & ts.TypeFlags.Undefined) return { kind: TypeKind.Undefined };
  if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return { kind: TypeKind.Any };
  if (flags & ts.TypeFlags.Void) return { kind: TypeKind.Undefined };
  if (flags & ts.TypeFlags.Never) return { kind: TypeKind.Any };

  // String literal
  if (tsType.isStringLiteral()) {
    return { kind: TypeKind.StringLiteral, value: tsType.value };
  }

  // Number literal
  if (tsType.isNumberLiteral()) {
    return { kind: TypeKind.NumberLiteral, value: tsType.value };
  }

  // Boolean literal (true / false)
  if (flags & ts.TypeFlags.BooleanLiteral) {
    const intrinsicName = (tsType as unknown as { intrinsicName: string }).intrinsicName;
    return { kind: TypeKind.BooleanLiteral, value: intrinsicName === "true" };
  }

  // Boolean (non-literal)
  if (flags & ts.TypeFlags.Boolean) {
    return { kind: TypeKind.Boolean };
  }

  // Union (including boolean which TS represents as true | false)
  if (tsType.isUnion()) {
    const types = tsType.types.map((t) => convertType(t, checker, seen));

    // Collapse true | false into boolean
    const hasTrueLiteral = types.some((t) => t.kind === TypeKind.BooleanLiteral && t.value === true);
    const hasFalseLiteral = types.some((t) => t.kind === TypeKind.BooleanLiteral && t.value === false);
    if (hasTrueLiteral && hasFalseLiteral) {
      const filtered = types.filter((t) => t.kind !== TypeKind.BooleanLiteral);
      filtered.push({ kind: TypeKind.Boolean });
      if (filtered.length === 1) return filtered[0];
      return { kind: TypeKind.Union, types: filtered };
    }

    return { kind: TypeKind.Union, types };
  }

  // Array
  if (checker.isArrayType(tsType)) {
    const typeArgs = checker.getTypeArguments(tsType as ts.TypeReference);
    const elementType = typeArgs[0] ? convertType(typeArgs[0], checker, seen) : { kind: TypeKind.Any as const };
    return { kind: TypeKind.Array, elementType };
  }

  // Object / Interface — circular reference guard using internal type id.
  // Arrays are already handled above so their shared ids won't collide here.
  const typeId = (tsType as { id?: number }).id;
  if (typeId !== undefined && seen.has(typeId)) return { kind: TypeKind.Any };
  if (typeId !== undefined) seen.add(typeId);

  const properties = new Map<string, Type>();
  for (const prop of tsType.getProperties()) {
    const declaration = prop.valueDeclaration ?? prop.declarations?.[0];
    if (!declaration) continue;
    const propType = checker.getTypeOfSymbolAtLocation(prop, declaration);
    properties.set(prop.name, convertType(propType, checker, seen));
  }

  // Remove from seen after processing — allow the same type to be
  // referenced multiple times (e.g. Product in both products[] and featuredProduct).
  // The guard only prevents actual circular references during traversal.
  if (typeId !== undefined) seen.delete(typeId);

  if (properties.size > 0) {
    const symbol = tsType.getSymbol() ?? tsType.aliasSymbol;
    const name = symbol?.name && symbol.name !== "__type" ? symbol.name : undefined;
    return { kind: TypeKind.Object, properties, name };
  }

  return { kind: TypeKind.Any };
}
