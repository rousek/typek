import {
  NodeType,
  type ASTNode,
  type ExprNode,
  type TemplateAST,
} from "./parser.js";
import { TypeKind, formatType, type Type } from "./types.js";

export interface Diagnostic {
  message: string;
  severity: "error" | "warning";
  line: number;
  column: number;
  length: number;
}

function formatExpr(node: ExprNode): string {
  switch (node.type) {
    case NodeType.Identifier:
      return node.name;
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

export function typecheck(ast: TemplateAST, dataType: Type): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const loopVarStack: Array<{ variable: string; type: Type }> = [];

  function error(message: string, node: ExprNode) {
    diagnostics.push({ message, severity: "error", line: node.line, column: node.column, length: exprLength(node) });
  }

  function warning(message: string, node: ExprNode) {
    diagnostics.push({ message, severity: "warning", line: node.line, column: node.column, length: exprLength(node) });
  }

  function exprLength(node: ExprNode): number {
    return formatExpr(node).length;
  }

  function resolveExprType(node: ExprNode): Type {
    switch (node.type) {
      case NodeType.Identifier: {
        // Check loop variables first (innermost scope wins)
        for (let i = loopVarStack.length - 1; i >= 0; i--) {
          if (loopVarStack[i].variable === node.name) {
            return loopVarStack[i].type;
          }
        }
        // Resolve from data type
        const resolved = resolveProperty(dataType, node.name);
        if (!resolved) {
          error(`Property '${node.name}' does not exist on type ${describeType(dataType)}${formatExpectedProps(dataType)}`, node);
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

      case NodeType.IfBlock:
        resolveExprType(node.condition);
        node.consequent.forEach(checkNode);
        if (node.alternate) {
          if (Array.isArray(node.alternate)) {
            node.alternate.forEach(checkNode);
          } else {
            checkNode(node.alternate);
          }
        }
        break;

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

      case NodeType.SwitchBlock:
        resolveExprType(node.expression);
        for (const c of node.cases) {
          c.body.forEach(checkNode);
        }
        if (node.defaultCase) node.defaultCase.forEach(checkNode);
        break;

      case NodeType.Partial:
        for (const expr of Object.values(node.props)) {
          resolveExprType(expr);
        }
        break;

      // Text, Comment, MetaVariable — no type checking needed
      default:
        break;
    }
  }

  ast.body.forEach(checkNode);
  return diagnostics;
}
