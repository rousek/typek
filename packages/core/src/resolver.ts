import ts from "typescript";
import { TypeKind, type Type } from "./types.js";

/**
 * Resolves a TypeScript type from a source file into the internal type representation.
 */
export function resolveType(filePath: string, typeName: string): Type {
  const program = ts.createProgram([filePath], {
    strict: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
  });

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) {
    throw new Error(`Could not read file '${filePath}'`);
  }

  const checker = program.getTypeChecker();

  // Find the declaration by iterating source file statements
  for (const statement of sourceFile.statements) {
    if (
      ts.isInterfaceDeclaration(statement) &&
      statement.name.text === typeName
    ) {
      const type = checker.getTypeAtLocation(statement.name);
      return convertType(type, checker, new Set());
    }
    if (
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === typeName
    ) {
      const type = checker.getTypeAtLocation(statement.name);
      return convertType(type, checker, new Set());
    }
  }

  throw new Error(`Type '${typeName}' not found in '${filePath}'`);
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

  // Object / Interface — check for properties (with circular reference guard)
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

  if (properties.size > 0) {
    // Preserve the type name if it has a symbol (named interface/type alias)
    const symbol = tsType.getSymbol() ?? tsType.aliasSymbol;
    const name = symbol?.name && symbol.name !== "__type" ? symbol.name : undefined;
    return { kind: TypeKind.Object, properties, name };
  }

  return { kind: TypeKind.Any };
}
