import fs from "fs";
import path from "path";
import {
  parse,
  NodeType,
  type ASTNode,
  type ExprNode,
  type TemplateAST,
} from "./parser.js";
import { TypeKind, formatType, type Type } from "./types.js";
import { resolveType } from "./resolver.js";

export interface Diagnostic {
  message: string;
  severity: "error" | "warning";
  line: number;
  column: number;
  length: number;
}

function formatExpr(node: ExprNode): string {
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

function resolveProperty(type: Type, name: string): Type | undefined {
  if (type.kind === TypeKind.Any) return { kind: TypeKind.Any };
  if (type.kind === TypeKind.Object) {
    return type.properties.get(name);
  }
  if (type.kind === TypeKind.Union) {
    // Try to resolve from non-null/undefined members
    for (const t of type.types) {
      if (t.kind === TypeKind.Null || t.kind === TypeKind.Undefined) continue;
      const resolved = resolveProperty(t, name);
      if (resolved) return resolved;
    }
    return undefined;
  }
  return undefined;
}

function describeType(type: Type): string {
  if (type.kind === TypeKind.Object && type.name) return type.name;
  if (type.kind === TypeKind.Union) {
    for (const t of type.types) {
      if (t.kind === TypeKind.Object && t.name) return t.name;
    }
  }
  return formatType(type);
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

/** Check if `source` type is structurally assignable to `target` type */
function isAssignable(source: Type, target: Type): boolean {
  if (target.kind === TypeKind.Any || source.kind === TypeKind.Any) return true;

  // Same primitive kinds
  if (target.kind === TypeKind.String && source.kind === TypeKind.String) return true;
  if (target.kind === TypeKind.Number && source.kind === TypeKind.Number) return true;
  if (target.kind === TypeKind.Boolean && source.kind === TypeKind.Boolean) return true;
  if (target.kind === TypeKind.Null && source.kind === TypeKind.Null) return true;
  if (target.kind === TypeKind.Undefined && source.kind === TypeKind.Undefined) return true;

  // String literal assignable to string
  if (target.kind === TypeKind.String && source.kind === TypeKind.StringLiteral) return true;
  if (target.kind === TypeKind.StringLiteral && source.kind === TypeKind.StringLiteral) return source.value === target.value;
  // Number literal assignable to number
  if (target.kind === TypeKind.Number && source.kind === TypeKind.NumberLiteral) return true;
  if (target.kind === TypeKind.NumberLiteral && source.kind === TypeKind.NumberLiteral) return source.value === target.value;
  // Boolean literal assignable to boolean
  if (target.kind === TypeKind.Boolean && (source.kind === TypeKind.BooleanLiteral || source.kind === TypeKind.Boolean)) return true;
  if (target.kind === TypeKind.BooleanLiteral && source.kind === TypeKind.BooleanLiteral) return source.value === target.value;

  // Array: element type must be assignable
  if (target.kind === TypeKind.Array && source.kind === TypeKind.Array) {
    return isAssignable(source.elementType, target.elementType);
  }

  // Union target: source must be assignable to at least one member
  if (target.kind === TypeKind.Union) {
    // If source is also a union, every member must be assignable to the target union
    if (source.kind === TypeKind.Union) {
      return source.types.every(st => target.types.some(tt => isAssignable(st, tt)));
    }
    return target.types.some(t => isAssignable(source, t));
  }

  // Source is union: every member must be assignable to target
  if (source.kind === TypeKind.Union) {
    return source.types.every(t => isAssignable(t, target));
  }

  // Object: source must have all target properties with compatible types
  if (target.kind === TypeKind.Object && source.kind === TypeKind.Object) {
    for (const [key, targetPropType] of target.properties) {
      const sourcePropType = source.properties.get(key);
      if (!sourcePropType) return false;
      if (!isAssignable(sourcePropType, targetPropType)) return false;
    }
    return true;
  }

  return false;
}

interface TemplateTypeResult {
  /** Whether the target template accepts data (has {{#import}}) */
  acceptsData: boolean;
  /** Whether the target template contains {{@content}} */
  hasContent: boolean;
  /** The resolved type and name, if data is accepted */
  type?: Type;
  typeName?: string;
}

type TemplateResolution = {
  kind: "resolved";
  result: TemplateTypeResult;
} | {
  kind: "not_found";
  path: string;
};

/** Resolve the expected data type of a referenced template (.tk file) */
function resolveTemplateType(templateDir: string, refPath: string): TemplateResolution {
  const fullPath = path.resolve(templateDir, refPath.endsWith(".tk") ? refPath : refPath + ".tk");
  let template: string;
  try {
    template = fs.readFileSync(fullPath, "utf-8");
  } catch {
    return { kind: "not_found", path: refPath };
  }

  let ast;
  try {
    ast = parse(template);
  } catch {
    return { kind: "resolved", result: { acceptsData: false, hasContent: false } };
  }

  const dir = ast.typeDirective;
  if (!dir) return { kind: "resolved", result: { acceptsData: false, hasContent: ast.hasContent } };

  const typeFileDir = path.dirname(fullPath);
  const typeFilePath = path.resolve(typeFileDir, dir.from.endsWith(".ts") ? dir.from : dir.from + ".ts");
  try {
    const type = resolveType(typeFilePath, dir.typeName);
    return { kind: "resolved", result: { acceptsData: true, hasContent: ast.hasContent, type, typeName: dir.typeName } };
  } catch {
    return { kind: "resolved", result: { acceptsData: false, hasContent: ast.hasContent } };
  }
}

export interface TypecheckContext {
  /** Absolute directory of the template being checked (for resolving relative paths) */
  templateDir: string;
}

export function typecheck(ast: TemplateAST, dataType: Type, context?: TypecheckContext): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const loopVarStack: Array<{ variable: string; type: Type }> = [];
  const scopeStack: Type[] = [dataType];
  // Narrowing: stack of maps from variable name to narrowed type
  const narrowingStack: Array<Map<string, Type>> = [];

  function currentScope(): Type {
    return scopeStack[scopeStack.length - 1];
  }

  function scopeAtDepth(depth: number): Type | undefined {
    const idx = scopeStack.length - 1 - depth;
    if (idx < 0) return undefined;
    return scopeStack[idx];
  }

  function error(message: string, node: ExprNode) {
    diagnostics.push({ message, severity: "error", line: node.line, column: node.column, length: exprLength(node) });
  }

  function warning(message: string, node: ExprNode) {
    diagnostics.push({ message, severity: "warning", line: node.line, column: node.column, length: exprLength(node) });
  }

  function exprLength(node: ExprNode): number {
    return formatExpr(node).length;
  }

  /** Look up a variable's type without emitting errors (for narrowing analysis) */
  function lookupVariableType(name: string): Type | undefined {
    for (let i = loopVarStack.length - 1; i >= 0; i--) {
      if (loopVarStack[i].variable === name) return loopVarStack[i].type;
    }
    return resolveProperty(currentScope(), name);
  }

  /** Get a narrowed type for a variable, checking the narrowing stack */
  function getNarrowedType(name: string): Type | undefined {
    for (let i = narrowingStack.length - 1; i >= 0; i--) {
      const narrowed = narrowingStack[i].get(name);
      if (narrowed) return narrowed;
    }
    return undefined;
  }

  function makeUnionType(types: Type[]): Type {
    if (types.length === 0) return { kind: TypeKind.Any };
    if (types.length === 1) return types[0];
    return { kind: TypeKind.Union, types };
  }

  // --- Narrowing extraction ---

  interface NarrowingInfo {
    passing: Type[];
    failing: Type[];
  }

  /** Extract narrowing facts from an if condition.
   *  Returns a map from variable name to which union members pass/fail the check. */
  function extractNarrowings(expr: ExprNode): Map<string, NarrowingInfo> {
    // Property access: customer.firstName → narrow customer based on which union members have firstName
    if (expr.type === NodeType.PropertyAccess && expr.object.type === NodeType.Identifier && expr.object.depth === 0) {
      const varName = expr.object.name;
      const varType = getNarrowedType(varName) ?? lookupVariableType(varName);
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

    // Simple identifier: address → narrow away null/undefined (truthiness)
    if (expr.type === NodeType.Identifier && expr.depth === 0) {
      const varName = expr.name;
      const varType = getNarrowedType(varName) ?? lookupVariableType(varName);
      if (varType && varType.kind === TypeKind.Union) {
        const passing = varType.types.filter(t => t.kind !== TypeKind.Null && t.kind !== TypeKind.Undefined);
        const failing = varType.types.filter(t => t.kind === TypeKind.Null || t.kind === TypeKind.Undefined);
        if (passing.length > 0 && failing.length > 0) {
          return new Map([[varName, { passing, failing }]]);
        }
      }
    }

    // || : passing = union of both sides, failing = intersection
    if (expr.type === NodeType.BinaryExpression && expr.operator === "||") {
      const left = extractNarrowings(expr.left);
      const right = extractNarrowings(expr.right);
      return combineNarrowings(left, right, "or");
    }

    // && : passing = intersection, failing = union
    if (expr.type === NodeType.BinaryExpression && expr.operator === "&&") {
      const left = extractNarrowings(expr.left);
      const right = extractNarrowings(expr.right);
      return combineNarrowings(left, right, "and");
    }

    // ! : swap passing and failing
    if (expr.type === NodeType.UnaryExpression) {
      const inner = extractNarrowings(expr.operand);
      const result = new Map<string, NarrowingInfo>();
      for (const [name, info] of inner) {
        result.set(name, { passing: info.failing, failing: info.passing });
      }
      return result;
    }

    return new Map();
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
          // passing: union (either check passes), failing: intersection (both must fail)
          const passing = [...new Set([...l.passing, ...r.passing])];
          const failing = l.failing.filter(t => r.failing.includes(t));
          result.set(name, { passing, failing });
        } else {
          // passing: intersection (both must pass), failing: union (either fails)
          const passing = l.passing.filter(t => r.passing.includes(t));
          const failing = [...new Set([...l.failing, ...r.failing])];
          result.set(name, { passing, failing });
        }
      } else {
        // Only one side narrows this variable — keep it as-is
        result.set(name, (l ?? r)!);
      }
    }
    return result;
  }

  function buildNarrowingMap(narrowings: Map<string, NarrowingInfo>, branch: "consequent" | "alternate"): Map<string, Type> {
    const map = new Map<string, Type>();
    for (const [name, info] of narrowings) {
      const types = branch === "consequent" ? info.passing : info.failing;
      if (types.length > 0) {
        map.set(name, makeUnionType(types));
      }
    }
    return map;
  }

  function resolveExprType(node: ExprNode): Type {
    switch (node.type) {
      case NodeType.Identifier: {
        // If depth > 0, resolve in parent scope (../ syntax)
        if (node.depth > 0) {
          const scope = scopeAtDepth(node.depth);
          if (!scope) {
            const maxDepth = scopeStack.length - 1;
            error(`'${"../".repeat(node.depth)}' goes ${node.depth} level(s) up, but only ${maxDepth} level(s) of scope exist`, node);
            return { kind: TypeKind.Any };
          }
          const resolved = resolveProperty(scope, node.name);
          if (!resolved) {
            error(`Property '${node.name}' does not exist on type ${describeType(scope)}${formatExpectedProps(scope)}`, node);
            return { kind: TypeKind.Any };
          }
          return resolved;
        }
        // Check narrowing first
        const narrowed = getNarrowedType(node.name);
        if (narrowed) return narrowed;
        // Check loop variables (innermost scope wins)
        for (let i = loopVarStack.length - 1; i >= 0; i--) {
          if (loopVarStack[i].variable === node.name) {
            return loopVarStack[i].type;
          }
        }
        // Resolve from current scope
        const scope = currentScope();
        const resolved = resolveProperty(scope, node.name);
        if (!resolved) {
          error(`Property '${node.name}' does not exist on type ${describeType(scope)}${formatExpectedProps(scope)}`, node);
          return { kind: TypeKind.Any };
        }
        return resolved;
      }

      case NodeType.PropertyAccess: {
        const objectType = resolveExprType(node.object);
        if (objectType.kind === TypeKind.Any) return { kind: TypeKind.Any };
        const resolved = resolveProperty(objectType, node.property);
        if (!resolved) {
          error(`Property '${node.property}' does not exist on type ${describeType(objectType)}${formatExpectedProps(objectType)}`, node);
          return { kind: TypeKind.Any };
        }
        return resolved;
      }

      case NodeType.StringLiteral:
        return { kind: TypeKind.String };

      case NodeType.NumberLiteral:
        return { kind: TypeKind.Number };

      case NodeType.BinaryExpression: {
        const leftType = resolveExprType(node.left);
        const rightType = resolveExprType(node.right);

        // Arithmetic operators (except +) require numbers
        if (["-", "*", "/"].includes(node.operator)) {
          if (!isNumeric(leftType) && leftType.kind !== TypeKind.Any) {
            warning(`Left operand of '${node.operator}' is ${formatType(leftType)}, expected number`, node.left);
          }
          if (!isNumeric(rightType) && rightType.kind !== TypeKind.Any) {
            warning(`Right operand of '${node.operator}' is ${formatType(rightType)}, expected number`, node.right);
          }
          return { kind: TypeKind.Number };
        }

        // + can be number or string concatenation
        if (node.operator === "+") {
          return { kind: TypeKind.Any };
        }

        // Comparison and logical operators return boolean
        return { kind: TypeKind.Boolean };
      }

      case NodeType.UnaryExpression:
        resolveExprType(node.operand);
        return { kind: TypeKind.Boolean };
    }
  }

  function isNumeric(type: Type): boolean {
    if (type.kind === TypeKind.Number || type.kind === TypeKind.NumberLiteral) return true;
    if (type.kind === TypeKind.Union) return type.types.every(isNumeric);
    return false;
  }

  function checkNode(node: ASTNode): void {
    switch (node.type) {
      case NodeType.Expression:
        resolveExprType(node.expression);
        break;

      case NodeType.RawExpression:
        resolveExprType(node.expression);
        break;

      case NodeType.IfBlock: {
        resolveExprType(node.condition);
        const narrowings = extractNarrowings(node.condition);

        // Consequent: apply passing narrowings
        const consequentMap = buildNarrowingMap(narrowings, "consequent");
        if (consequentMap.size > 0) narrowingStack.push(consequentMap);
        node.consequent.forEach(checkNode);
        if (consequentMap.size > 0) narrowingStack.pop();

        // Alternate: apply failing narrowings
        if (node.alternate) {
          const alternateMap = buildNarrowingMap(narrowings, "alternate");
          if (alternateMap.size > 0) narrowingStack.push(alternateMap);
          if (Array.isArray(node.alternate)) {
            node.alternate.forEach(checkNode);
          } else {
            checkNode(node.alternate);
          }
          if (alternateMap.size > 0) narrowingStack.pop();
        }
        break;
      }

      case NodeType.ForBlock: {
        const iterableType = resolveExprType(node.iterable);
        let elementType: Type = { kind: TypeKind.Any };

        if (iterableType.kind === TypeKind.Array) {
          elementType = iterableType.elementType;
        } else if (iterableType.kind !== TypeKind.Any) {
          error(`${formatExpr(node.iterable)} is not iterable (type ${describeType(iterableType)} is not an array)`, node.iterable);
        }

        loopVarStack.push({ variable: node.variable, type: elementType });
        node.body.forEach(checkNode);
        if (node.emptyBlock) node.emptyBlock.forEach(checkNode);
        loopVarStack.pop();
        break;
      }

      case NodeType.SwitchBlock: {
        const switchType = resolveExprType(node.expression);
        for (const c of node.cases) {
          // Validate case value against expression type
          if (switchType.kind !== TypeKind.Any) {
            if (switchType.kind === TypeKind.String || switchType.kind === TypeKind.StringLiteral) {
              // String switch with string literal cases — check if it's a valid value
              if (switchType.kind === TypeKind.StringLiteral && c.value !== switchType.value) {
                diagnostics.push({
                  message: `Case "${c.value}" can never match expression of type "${switchType.value}"`,
                  severity: "warning",
                  line: c.line,
                  column: c.column,
                  length: c.value.length + 2,
                });
              }
            } else if (switchType.kind === TypeKind.Union) {
              // If union contains plain string, any case value is valid
              const hasPlainString = switchType.types.some(t => t.kind === TypeKind.String);
              if (!hasPlainString) {
                // Check if the case value matches any string literal member
                const stringMembers = switchType.types.filter(
                  (t): t is { kind: TypeKind.StringLiteral; value: string } => t.kind === TypeKind.StringLiteral
                );
                if (stringMembers.length > 0 && !stringMembers.some(m => m.value === c.value)) {
                  const validValues = stringMembers.map(m => `"${m.value}"`).join(", ");
                  diagnostics.push({
                    message: `Case "${c.value}" is not a valid member of type ${formatType(switchType)}. Valid values: ${validValues}`,
                    severity: "error",
                    line: c.line,
                    column: c.column,
                    length: c.value.length + 2,
                  });
                } else if (stringMembers.length === 0) {
                  // Union has no string members at all
                  diagnostics.push({
                    message: `Switch cases use string values, but expression is ${formatType(switchType)}`,
                    severity: "warning",
                    line: node.line,
                    column: node.column,
                    length: formatExpr(node.expression).length,
                  });
                }
              }
            } else {
              diagnostics.push({
                message: `Switch cases use string values, but expression is ${formatType(switchType)}`,
                severity: "warning",
                line: node.line,
                column: node.column,
                length: formatExpr(node.expression).length,
              });
            }
          }
          c.body.forEach(checkNode);
        }
        if (node.defaultCase) node.defaultCase.forEach(checkNode);
        break;
      }

      case NodeType.WithBlock: {
        const withType = resolveExprType(node.expression);
        scopeStack.push(withType);
        node.body.forEach(checkNode);
        scopeStack.pop();
        if (node.emptyBlock) node.emptyBlock.forEach(checkNode);
        break;
      }

      case NodeType.Partial: {
        const passedType = node.dataExpr ? resolveExprType(node.dataExpr) : undefined;
        if (context) {
          const resolution = resolveTemplateType(context.templateDir, node.path);
          if (resolution.kind === "not_found") {
            diagnostics.push({
              message: `Partial template not found: '${node.path}'`,
              severity: "error",
              line: node.line,
              column: node.column,
              length: node.path.length,
            });
          } else {
            const target = resolution.result;
            if (passedType && !target.acceptsData) {
              diagnostics.push({
                message: `Partial '${node.path}' does not accept data (no {{#import}} directive)`,
                severity: "error",
                line: node.dataExpr!.line,
                column: node.dataExpr!.column,
                length: exprLength(node.dataExpr!),
              });
            } else if (passedType && target.acceptsData && target.type && !isAssignable(passedType, target.type)) {
              diagnostics.push({
                message: `Type '${formatType(passedType)}' is not assignable to partial's expected type '${target.typeName}'`,
                severity: "error",
                line: node.dataExpr!.line,
                column: node.dataExpr!.column,
                length: exprLength(node.dataExpr!),
              });
            } else if (!passedType && target.acceptsData) {
              diagnostics.push({
                message: `Partial '${node.path}' expects data of type '${target.typeName}', but no data was passed`,
                severity: "error",
                line: node.line,
                column: node.column,
                length: node.path.length,
              });
            }
            if (target.hasContent) {
              diagnostics.push({
                message: `'${node.path}' contains {{@content}} and should be used as a layout, not a partial`,
                severity: "error",
                line: node.line,
                column: node.column,
                length: node.path.length,
              });
            }
          }
        }
        break;
      }

      case NodeType.LayoutBlock: {
        const passedType = node.dataExpr ? resolveExprType(node.dataExpr) : undefined;
        if (context) {
          const resolution = resolveTemplateType(context.templateDir, node.path);
          if (resolution.kind === "not_found") {
            diagnostics.push({
              message: `Layout template not found: '${node.path}'`,
              severity: "error",
              line: node.line,
              column: node.column,
              length: node.path.length,
            });
          } else {
            const target = resolution.result;
            if (passedType && !target.acceptsData) {
              diagnostics.push({
                message: `Layout '${node.path}' does not accept data (no {{#import}} directive)`,
                severity: "error",
                line: node.dataExpr!.line,
                column: node.dataExpr!.column,
                length: exprLength(node.dataExpr!),
              });
            } else if (passedType && target.acceptsData && target.type && !isAssignable(passedType, target.type)) {
              diagnostics.push({
                message: `Type '${formatType(passedType)}' is not assignable to layout's expected type '${target.typeName}'`,
                severity: "error",
                line: node.dataExpr!.line,
                column: node.dataExpr!.column,
                length: exprLength(node.dataExpr!),
              });
            } else if (!passedType && target.acceptsData) {
              diagnostics.push({
                message: `Layout '${node.path}' expects data of type '${target.typeName}', but no data was passed`,
                severity: "error",
                line: node.line,
                column: node.column,
                length: node.path.length,
              });
            }
            if (!target.hasContent) {
              diagnostics.push({
                message: `Layout '${node.path}' does not contain {{@content}}. Use a partial instead if no content wrapping is needed`,
                severity: "error",
                line: node.line,
                column: node.column,
                length: node.path.length,
              });
            }
          }
        }
        node.body.forEach(checkNode);
        break;
      }

      // Text, Comment, MetaVariable, Content — no type checking needed
      default:
        break;
    }
  }

  ast.body.forEach(checkNode);
  return diagnostics;
}
