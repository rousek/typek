export enum TypeKind {
  String,
  Number,
  Boolean,
  Null,
  Undefined,
  Any,
  Array,
  Object,
  Union,
  StringLiteral,
  NumberLiteral,
  BooleanLiteral,
}

export interface TString {
  kind: TypeKind.String;
}
export interface TNumber {
  kind: TypeKind.Number;
}
export interface TBoolean {
  kind: TypeKind.Boolean;
}
export interface TNull {
  kind: TypeKind.Null;
}
export interface TUndefined {
  kind: TypeKind.Undefined;
}
export interface TAny {
  kind: TypeKind.Any;
}
export interface TArray {
  kind: TypeKind.Array;
  elementType: Type;
}
export interface TObject {
  kind: TypeKind.Object;
  properties: Map<string, Type>;
  name?: string;
}
export interface TUnion {
  kind: TypeKind.Union;
  types: Type[];
}
export interface TStringLiteral {
  kind: TypeKind.StringLiteral;
  value: string;
}
export interface TNumberLiteral {
  kind: TypeKind.NumberLiteral;
  value: number;
}
export interface TBooleanLiteral {
  kind: TypeKind.BooleanLiteral;
  value: boolean;
}

export type Type =
  | TString
  | TNumber
  | TBoolean
  | TNull
  | TUndefined
  | TAny
  | TArray
  | TObject
  | TUnion
  | TStringLiteral
  | TNumberLiteral
  | TBooleanLiteral;

/**
 * Recursively flattens nested unions into a flat array of non-union types.
 */
export function flattenUnion(type: Type): Type[] {
  if (type.kind !== TypeKind.Union) return [type];
  return type.types.flatMap(flattenUnion);
}

/**
 * Removes null and undefined from a type (like TypeScript's truthiness narrowing).
 * Returns undefined if the type is entirely nullish.
 */
export function narrowNullish(type: Type): Type | undefined {
  const flat = flattenUnion(type);
  const filtered = flat.filter(
    t => t.kind !== TypeKind.Null && t.kind !== TypeKind.Undefined,
  );
  if (filtered.length === 0) return undefined;
  if (filtered.length === 1) return filtered[0];
  return { kind: TypeKind.Union, types: filtered };
}

/**
 * Formats a type as a multi-line TypeScript-like definition.
 * For named object types, renders as `interface Name { ... }`.
 * For other types, renders as `type: ...`.
 */
function findSingleObjectType(type: Type): TObject | undefined {
  if (type.kind === TypeKind.Object && type.properties.size > 0) return type;
  if (type.kind === TypeKind.Array) return findSingleObjectType(type.elementType);
  if (type.kind === TypeKind.Union) {
    let found: TObject | undefined;
    for (const t of type.types) {
      const obj = findSingleObjectType(t);
      if (obj) {
        if (found) return undefined; // more than one object type
        found = obj;
      }
    }
    return found;
  }
  return undefined;
}

export function formatTypeDefinition(type: Type, label?: string): string {
  const name = label ?? "(value)";
  return `${name}: ${formatType(type)}`;
}

export function formatType(type: Type): string {
  switch (type.kind) {
    case TypeKind.String:
      return "string";
    case TypeKind.Number:
      return "number";
    case TypeKind.Boolean:
      return "boolean";
    case TypeKind.Null:
      return "null";
    case TypeKind.Undefined:
      return "undefined";
    case TypeKind.Any:
      return "any";
    case TypeKind.Array: {
      const inner = formatType(type.elementType);
      return type.elementType.kind === TypeKind.Union ? `(${inner})[]` : `${inner}[]`;
    }
    case TypeKind.Object: {
      if (type.name) return type.name;
      const entries = [...type.properties.entries()];
      if (entries.length === 0) return "{}";
      const props = entries.map(([k, v]) => `${k}: ${formatType(v)}`).join("; ");
      return `{ ${props} }`;
    }
    case TypeKind.Union: {
      const sorted = [...type.types].sort((a, b) => {
        const aNullish = a.kind === TypeKind.Null || a.kind === TypeKind.Undefined ? 1 : 0;
        const bNullish = b.kind === TypeKind.Null || b.kind === TypeKind.Undefined ? 1 : 0;
        return aNullish - bNullish;
      });
      const parts = sorted.map(formatType);
      return [...new Set(parts)].join(" | ");
    }
    case TypeKind.StringLiteral:
      return JSON.stringify(type.value);
    case TypeKind.NumberLiteral:
      return String(type.value);
    case TypeKind.BooleanLiteral:
      return String(type.value);
  }
}
