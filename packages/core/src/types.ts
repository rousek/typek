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
    case TypeKind.Array:
      return `${formatType(type.elementType)}[]`;
    case TypeKind.Object: {
      const entries = [...type.properties.entries()];
      if (entries.length === 0) return "{}";
      const props = entries.map(([k, v]) => `${k}: ${formatType(v)}`).join("; ");
      return `{ ${props} }`;
    }
    case TypeKind.Union:
      return type.types.map(formatType).join(" | ");
    case TypeKind.StringLiteral:
      return JSON.stringify(type.value);
    case TypeKind.NumberLiteral:
      return String(type.value);
    case TypeKind.BooleanLiteral:
      return String(type.value);
  }
}
