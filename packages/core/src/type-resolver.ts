import { NodeType, type ExprNode } from "./parser.js";
import { TypeKind, type Type } from "./types.js";

export function resolveProperty(type: Type, name: string): Type | undefined {
  if (type.kind === TypeKind.Any) return { kind: TypeKind.Any };
  if (type.kind === TypeKind.Object) return type.properties.get(name);
  if (type.kind === TypeKind.Union) {
    for (const t of type.types) {
      if (t.kind === TypeKind.Null || t.kind === TypeKind.Undefined) continue;
      const resolved = resolveProperty(t, name);
      if (resolved) return resolved;
    }
  }
  return undefined;
}

export function formatExpr(node: ExprNode): string {
  switch (node.type) {
    case NodeType.Identifier: {
      const prefix = "../".repeat(node.depth);
      return prefix + node.name;
    }
    case NodeType.PropertyAccess:
      return `${formatExpr(node.object)}.${node.property}`;
    case NodeType.BinaryExpression:
      return `${formatExpr(node.left)} ${node.operator} ${formatExpr(node.right)}`;
    case NodeType.UnaryExpression:
      return `!${formatExpr(node.operand)}`;
    case NodeType.StringLiteral:
      return JSON.stringify(node.value);
    case NodeType.NumberLiteral:
      return String(node.value);
  }
}

export interface NarrowingInfo {
  passing: Type[];
  failing: Type[];
}

export type NarrowingMap = Map<string, Type>;

export interface ErrorHandler {
  error(message: string, node: ExprNode): void;
  warning(message: string, node: ExprNode): void;
}

/**
 * Shared expression type resolver used by both the checker and hover provider.
 * Manages scope stack, loop variables, and type narrowing.
 */
export class TypeResolver {
  private readonly scopeStack: Type[];
  private readonly loopVarStack: Array<{ variable: string; type: Type }> = [];
  private readonly narrowingStack: Array<NarrowingMap> = [];
  private readonly errors: ErrorHandler | undefined;

  constructor(dataType: Type, errors?: ErrorHandler) {
    this.scopeStack = [dataType];
    this.errors = errors;
  }

  currentScope(): Type {
    return this.scopeStack[this.scopeStack.length - 1];
  }

  scopeAtDepth(depth: number): Type | undefined {
    const idx = this.scopeStack.length - 1 - depth;
    if (idx < 0) return undefined;
    return this.scopeStack[idx];
  }

  maxDepth(): number {
    return this.scopeStack.length - 1;
  }

  pushScope(type: Type): void {
    this.scopeStack.push(type);
  }

  popScope(): void {
    this.scopeStack.pop();
  }

  pushLoopVar(variable: string, type: Type): void {
    this.loopVarStack.push({ variable, type });
  }

  popLoopVar(): void {
    this.loopVarStack.pop();
  }

  pushNarrowing(map: NarrowingMap): void {
    if (map.size > 0) this.narrowingStack.push(map);
  }

  popNarrowing(map: NarrowingMap): void {
    if (map.size > 0) this.narrowingStack.pop();
  }

  getNarrowedType(name: string): Type | undefined {
    for (let i = this.narrowingStack.length - 1; i >= 0; i--) {
      const narrowed = this.narrowingStack[i].get(name);
      if (narrowed) return narrowed;
    }
    return undefined;
  }

  lookupVariableType(name: string): Type | undefined {
    for (let i = this.loopVarStack.length - 1; i >= 0; i--) {
      if (this.loopVarStack[i].variable === name) return this.loopVarStack[i].type;
    }
    return resolveProperty(this.currentScope(), name);
  }

  resolveExprType(node: ExprNode): Type {
    switch (node.type) {
      case NodeType.Identifier: {
        if (node.depth > 0) {
          const scope = this.scopeAtDepth(node.depth);
          if (!scope) {
            this.errors?.error(
              `'${"../".repeat(node.depth)}' goes ${node.depth} level(s) up, but only ${this.maxDepth()} level(s) of scope exist`,
              node,
            );
            return { kind: TypeKind.Any };
          }
          const resolved = resolveProperty(scope, node.name);
          if (!resolved) {
            this.errors?.error(
              `Property '${node.name}' does not exist on type ${describeType(scope)}${formatExpectedProps(scope)}`,
              node,
            );
            return { kind: TypeKind.Any };
          }
          return resolved;
        }
        const narrowed = this.getNarrowedType(node.name);
        if (narrowed) return narrowed;
        for (let i = this.loopVarStack.length - 1; i >= 0; i--) {
          if (this.loopVarStack[i].variable === node.name) return this.loopVarStack[i].type;
        }
        const scope = this.currentScope();
        const resolved = resolveProperty(scope, node.name);
        if (!resolved) {
          this.errors?.error(
            `Property '${node.name}' does not exist on type ${describeType(scope)}${formatExpectedProps(scope)}`,
            node,
          );
          return { kind: TypeKind.Any };
        }
        return resolved;
      }

      case NodeType.PropertyAccess: {
        const objectType = this.resolveExprType(node.object);
        if (objectType.kind === TypeKind.Any) return { kind: TypeKind.Any };
        const resolved = resolveProperty(objectType, node.property);
        if (!resolved) {
          this.errors?.error(
            `Property '${node.property}' does not exist on type ${describeType(objectType)}${formatExpectedProps(objectType)}`,
            node,
          );
          return { kind: TypeKind.Any };
        }
        return resolved;
      }

      case NodeType.StringLiteral:
        return { kind: TypeKind.String };
      case NodeType.NumberLiteral:
        return { kind: TypeKind.Number };

      case NodeType.BinaryExpression: {
        const leftType = this.resolveExprType(node.left);
        const rightType = this.resolveExprType(node.right);
        if (["-", "*", "/"].includes(node.operator)) {
          if (!isNumeric(leftType) && leftType.kind !== TypeKind.Any) {
            this.errors?.warning(`Left operand of '${node.operator}' is ${formatTypeImport(leftType)}, expected number`, node.left);
          }
          if (!isNumeric(rightType) && rightType.kind !== TypeKind.Any) {
            this.errors?.warning(`Right operand of '${node.operator}' is ${formatTypeImport(rightType)}, expected number`, node.right);
          }
          return { kind: TypeKind.Number };
        }
        if (node.operator === "+") return { kind: TypeKind.Any };
        return { kind: TypeKind.Boolean };
      }

      case NodeType.UnaryExpression:
        this.resolveExprType(node.operand);
        return { kind: TypeKind.Boolean };
    }
  }

  // --- Narrowing ---

  extractNarrowings(expr: ExprNode): Map<string, NarrowingInfo> {
    if (expr.type === NodeType.PropertyAccess && expr.object.type === NodeType.Identifier && expr.object.depth === 0) {
      const varName = expr.object.name;
      const varType = this.getNarrowedType(varName) ?? this.lookupVariableType(varName);
      if (varType && varType.kind === TypeKind.Union) {
        const passing: Type[] = [];
        const failing: Type[] = [];
        for (const member of varType.types) {
          if (resolveProperty(member, expr.property)) {
            passing.push(member);
          } else {
            failing.push(member);
          }
        }
        if (passing.length > 0 && failing.length > 0) {
          return new Map([[varName, { passing, failing }]]);
        }
      }
    }

    if (expr.type === NodeType.Identifier && expr.depth === 0) {
      const varName = expr.name;
      const varType = this.getNarrowedType(varName) ?? this.lookupVariableType(varName);
      if (varType && varType.kind === TypeKind.Union) {
        const passing = varType.types.filter(t => t.kind !== TypeKind.Null && t.kind !== TypeKind.Undefined);
        const failing = varType.types.filter(t => t.kind === TypeKind.Null || t.kind === TypeKind.Undefined);
        if (passing.length > 0 && failing.length > 0) {
          return new Map([[varName, { passing, failing }]]);
        }
      }
    }

    if (expr.type === NodeType.BinaryExpression && expr.operator === "||") {
      return combineNarrowings(this.extractNarrowings(expr.left), this.extractNarrowings(expr.right), "or");
    }
    if (expr.type === NodeType.BinaryExpression && expr.operator === "&&") {
      return combineNarrowings(this.extractNarrowings(expr.left), this.extractNarrowings(expr.right), "and");
    }
    if (expr.type === NodeType.UnaryExpression) {
      const inner = this.extractNarrowings(expr.operand);
      const result = new Map<string, NarrowingInfo>();
      for (const [name, info] of inner) {
        result.set(name, { passing: info.failing, failing: info.passing });
      }
      return result;
    }

    return new Map();
  }

  buildNarrowingMap(narrowings: Map<string, NarrowingInfo>, branch: "consequent" | "alternate"): NarrowingMap {
    const map: NarrowingMap = new Map();
    for (const [name, info] of narrowings) {
      const types = branch === "consequent" ? info.passing : info.failing;
      if (types.length === 1) map.set(name, types[0]);
      else if (types.length > 1) map.set(name, { kind: TypeKind.Union, types });
    }
    return map;
  }
}

// --- Helpers ---

function describeType(type: Type): string {
  if (type.kind === TypeKind.Object && type.name) return type.name;
  if (type.kind === TypeKind.Union) {
    for (const t of type.types) {
      if (t.kind === TypeKind.Object && t.name) return t.name;
    }
  }
  return formatTypeImport(type);
}

function getPropertyNames(type: Type): string[] {
  if (type.kind === TypeKind.Object) return [...type.properties.keys()];
  if (type.kind === TypeKind.Union) {
    for (const t of type.types) {
      if (t.kind === TypeKind.Null || t.kind === TypeKind.Undefined) continue;
      const names = getPropertyNames(t);
      if (names.length > 0) return names;
    }
  }
  return [];
}

function formatExpectedProps(type: Type): string {
  const names = getPropertyNames(type);
  if (names.length === 0) return "";
  return `. Expected: ${names.join(", ")}`;
}

function isNumeric(type: Type): boolean {
  if (type.kind === TypeKind.Number || type.kind === TypeKind.NumberLiteral) return true;
  if (type.kind === TypeKind.Union) return type.types.every(isNumeric);
  return false;
}

function combineNarrowings(
  left: Map<string, NarrowingInfo>,
  right: Map<string, NarrowingInfo>,
  mode: "or" | "and",
): Map<string, NarrowingInfo> {
  const result = new Map<string, NarrowingInfo>();
  const allVars = new Set([...left.keys(), ...right.keys()]);
  for (const name of allVars) {
    const l = left.get(name);
    const r = right.get(name);
    if (l && r) {
      if (mode === "or") {
        result.set(name, {
          passing: [...new Set([...l.passing, ...r.passing])],
          failing: l.failing.filter(t => r.failing.includes(t)),
        });
      } else {
        result.set(name, {
          passing: l.passing.filter(t => r.passing.includes(t)),
          failing: [...new Set([...l.failing, ...r.failing])],
        });
      }
    } else {
      result.set(name, (l ?? r)!);
    }
  }
  return result;
}

// Import formatType but alias to avoid name collision with types.ts export
import { formatType as formatTypeImport } from "./types.js";
