import {
  NodeType,
  type ASTNode,
  type ExprNode,
  type TemplateAST,
} from "./parser.js";
import { TypeKind, type Type } from "./types.js";

export interface HoverResult {
  type: Type;
  /** Display name of the expression being hovered (e.g. "user", "user.name") */
  name: string;
  /** Property path from the root type for "Go to Definition" (e.g. ["user", "name"]) */
  propertyPath: string[];
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

function nodeContains(node: { line: number; column: number }, exprText: string, line: number, column: number): boolean {
  if (node.line !== line) return false;
  return column >= node.column && column < node.column + exprText.length;
}

/**
 * Given an AST, the resolved data type, and a cursor position,
 * returns the type of the expression under the cursor (if any).
 */
export function typeAtPosition(
  ast: TemplateAST,
  dataType: Type,
  line: number,
  column: number,
): HoverResult | undefined {
  const loopVarStack: Array<{ variable: string; type: Type; iterablePath: string[] }> = [];
  const scopeStack: Type[] = [dataType];
  const scopePathStack: string[][] = [[]];

  function currentScope(): Type {
    return scopeStack[scopeStack.length - 1];
  }

  function scopeAtDepth(depth: number): Type {
    const idx = scopeStack.length - 1 - depth;
    if (idx < 0) return dataType;
    return scopeStack[idx];
  }

  function resolveExprPath(node: ExprNode): string[] {
    switch (node.type) {
      case NodeType.Identifier: {
        if (node.depth > 0) {
          const idx = scopePathStack.length - 1 - node.depth;
          const scopePath = idx >= 0 ? scopePathStack[idx] : [];
          return [...scopePath, node.name];
        }
        for (let i = loopVarStack.length - 1; i >= 0; i--) {
          if (loopVarStack[i].variable === node.name) return loopVarStack[i].iterablePath;
        }
        const scopePath = scopePathStack[scopePathStack.length - 1];
        return [...scopePath, node.name];
      }
      case NodeType.PropertyAccess: {
        const objPath = resolveExprPath(node.object);
        return [...objPath, node.property];
      }
      default:
        return [];
    }
  }

  function resolveExprType(node: ExprNode): Type {
    switch (node.type) {
      case NodeType.Identifier: {
        if (node.depth > 0) {
          const scope = scopeAtDepth(node.depth);
          return resolveProperty(scope, node.name) ?? { kind: TypeKind.Any };
        }
        for (let i = loopVarStack.length - 1; i >= 0; i--) {
          if (loopVarStack[i].variable === node.name) return loopVarStack[i].type;
        }
        return resolveProperty(currentScope(), node.name) ?? { kind: TypeKind.Any };
      }
      case NodeType.PropertyAccess: {
        const objectType = resolveExprType(node.object);
        return resolveProperty(objectType, node.property) ?? { kind: TypeKind.Any };
      }
      case NodeType.StringLiteral:
        return { kind: TypeKind.String };
      case NodeType.NumberLiteral:
        return { kind: TypeKind.Number };
      case NodeType.BinaryExpression: {
        resolveExprType(node.left);
        resolveExprType(node.right);
        if (["-", "*", "/"].includes(node.operator)) return { kind: TypeKind.Number };
        if (node.operator === "+") return { kind: TypeKind.Any };
        return { kind: TypeKind.Boolean };
      }
      case NodeType.UnaryExpression:
        resolveExprType(node.operand);
        return { kind: TypeKind.Boolean };
    }
  }

  function findInExpr(node: ExprNode): HoverResult | undefined {
    if (node.type === NodeType.PropertyAccess) {
      const objText = formatExpr(node.object);
      const propStart = node.column + objText.length + 1;
      if (line === node.line && column >= propStart && column < propStart + node.property.length) {
        const type = resolveExprType(node);
        const text = formatExpr(node);
        return { type, name: text, propertyPath: resolveExprPath(node), line: node.line, column: node.column, length: text.length };
      }
      const objResult = findInExpr(node.object);
      if (objResult) return objResult;
    }

    if (node.type === NodeType.BinaryExpression) {
      const leftResult = findInExpr(node.left);
      if (leftResult) return leftResult;
      const rightResult = findInExpr(node.right);
      if (rightResult) return rightResult;
    }

    if (node.type === NodeType.UnaryExpression) {
      const operandResult = findInExpr(node.operand);
      if (operandResult) return operandResult;
    }

    const text = formatExpr(node);
    if (nodeContains(node, text, line, column)) {
      const type = resolveExprType(node);
      return { type, name: text, propertyPath: resolveExprPath(node), line: node.line, column: node.column, length: text.length };
    }

    return undefined;
  }

  function findInNode(node: ASTNode): HoverResult | undefined {
    switch (node.type) {
      case NodeType.Expression:
        return findInExpr(node.expression);
      case NodeType.RawExpression:
        return findInExpr(node.expression);
      case NodeType.IfBlock: {
        const condResult = findInExpr(node.condition);
        if (condResult) return condResult;
        for (const child of node.consequent) {
          const r = findInNode(child);
          if (r) return r;
        }
        if (node.alternate) {
          if (Array.isArray(node.alternate)) {
            for (const child of node.alternate) {
              const r = findInNode(child);
              if (r) return r;
            }
          } else {
            const r = findInNode(node.alternate);
            if (r) return r;
          }
        }
        return undefined;
      }
      case NodeType.ForBlock: {
        const iterResult = findInExpr(node.iterable);
        if (iterResult) return iterResult;

        const iterableType = resolveExprType(node.iterable);
        const elementType = iterableType.kind === TypeKind.Array ? iterableType.elementType : { kind: TypeKind.Any as const };
        const iterablePath = resolveExprPath(node.iterable);

        // Check if hovering over the loop variable name in {{#for variable in ...}}
        if (
          line === node.variableLine &&
          column >= node.variableColumn &&
          column < node.variableColumn + node.variable.length
        ) {
          return {
            type: elementType,
            name: node.variable,
            propertyPath: iterablePath,
            line: node.variableLine,
            column: node.variableColumn,
            length: node.variable.length,
          };
        }

        loopVarStack.push({ variable: node.variable, type: elementType, iterablePath });

        for (const child of node.body) {
          const r = findInNode(child);
          if (r) { loopVarStack.pop(); return r; }
        }
        if (node.emptyBlock) {
          for (const child of node.emptyBlock) {
            const r = findInNode(child);
            if (r) { loopVarStack.pop(); return r; }
          }
        }
        loopVarStack.pop();
        return undefined;
      }
      case NodeType.WithBlock: {
        const exprResult = findInExpr(node.expression);
        if (exprResult) return exprResult;

        const withType = resolveExprType(node.expression);
        const withPath = resolveExprPath(node.expression);
        scopeStack.push(withType);
        scopePathStack.push(withPath);

        for (const child of node.body) {
          const r = findInNode(child);
          if (r) { scopeStack.pop(); scopePathStack.pop(); return r; }
        }
        scopeStack.pop();
        scopePathStack.pop();
        if (node.emptyBlock) {
          for (const child of node.emptyBlock) {
            const r = findInNode(child);
            if (r) return r;
          }
        }
        return undefined;
      }
      case NodeType.SwitchBlock: {
        const exprResult = findInExpr(node.expression);
        if (exprResult) return exprResult;
        for (const c of node.cases) {
          for (const child of c.body) {
            const r = findInNode(child);
            if (r) return r;
          }
        }
        if (node.defaultCase) {
          for (const child of node.defaultCase) {
            const r = findInNode(child);
            if (r) return r;
          }
        }
        return undefined;
      }
      case NodeType.Partial: {
        const r = findInExpr(node.dataExpr);
        if (r) return r;
        return undefined;
      }
      case NodeType.LayoutBlock: {
        const dataResult = findInExpr(node.dataExpr);
        if (dataResult) return dataResult;
        for (const child of node.body) {
          const r = findInNode(child);
          if (r) return r;
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }

  // Check if hovering the type name in the directive
  const dir = ast.typeDirective;
  if (
    line === dir.typeNameLine &&
    column >= dir.typeNameColumn &&
    column < dir.typeNameColumn + dir.typeName.length
  ) {
    return {
      type: dataType,
      name: dir.typeName,
      propertyPath: [],
      line: dir.typeNameLine,
      column: dir.typeNameColumn,
      length: dir.typeName.length,
    };
  }

  for (const node of ast.body) {
    const result = findInNode(node);
    if (result) return result;
  }

  return undefined;
}

export interface CompletionEntry {
  name: string;
  type: Type;
}

/**
 * Returns the properties available at a given position in the template,
 * considering {{#with}} scopes and loop variables.
 */
export function completionsAtPosition(
  ast: TemplateAST,
  dataType: Type,
  line: number,
  column: number,
): CompletionEntry[] {
  const loopVarStack: Array<{ variable: string; type: Type }> = [];
  const scopeStack: Type[] = [dataType];

  function currentScope(): Type {
    return scopeStack[scopeStack.length - 1];
  }

  function getProperties(type: Type): CompletionEntry[] {
    if (type.kind === TypeKind.Object) {
      return [...type.properties.entries()].map(([name, t]) => ({ name, type: t }));
    }
    if (type.kind === TypeKind.Union) {
      for (const t of type.types) {
        if (t.kind === TypeKind.Null || t.kind === TypeKind.Undefined) continue;
        const props = getProperties(t);
        if (props.length > 0) return props;
      }
    }
    return [];
  }

  function resolveExprType(node: ExprNode): Type {
    switch (node.type) {
      case NodeType.Identifier: {
        if (node.depth > 0) {
          const idx = scopeStack.length - 1 - node.depth;
          const scope = idx >= 0 ? scopeStack[idx] : dataType;
          return resolveProperty(scope, node.name) ?? { kind: TypeKind.Any };
        }
        for (let i = loopVarStack.length - 1; i >= 0; i--) {
          if (loopVarStack[i].variable === node.name) return loopVarStack[i].type;
        }
        return resolveProperty(currentScope(), node.name) ?? { kind: TypeKind.Any };
      }
      case NodeType.PropertyAccess: {
        const objectType = resolveExprType(node.object);
        return resolveProperty(objectType, node.property) ?? { kind: TypeKind.Any };
      }
      default:
        return { kind: TypeKind.Any };
    }
  }

  // Check if a line/column is within a node's block body range
  function posAfterNode(node: { line: number; column: number }): boolean {
    return line > node.line || (line === node.line && column > node.column);
  }

  function searchNode(node: ASTNode): CompletionEntry[] | null {
    switch (node.type) {
      case NodeType.ForBlock: {
        const iterableType = resolveExprType(node.iterable);
        const elementType = iterableType.kind === TypeKind.Array ? iterableType.elementType : { kind: TypeKind.Any as const };
        loopVarStack.push({ variable: node.variable, type: elementType });
        for (const child of node.body) {
          const r = searchNode(child);
          if (r) { loopVarStack.pop(); return r; }
        }
        if (node.emptyBlock) {
          for (const child of node.emptyBlock) {
            const r = searchNode(child);
            if (r) { loopVarStack.pop(); return r; }
          }
        }
        loopVarStack.pop();
        return null;
      }
      case NodeType.WithBlock: {
        const withType = resolveExprType(node.expression);
        scopeStack.push(withType);
        for (const child of node.body) {
          const r = searchNode(child);
          if (r) { scopeStack.pop(); return r; }
        }
        scopeStack.pop();
        if (node.emptyBlock) {
          for (const child of node.emptyBlock) {
            const r = searchNode(child);
            if (r) return r;
          }
        }
        return null;
      }
      case NodeType.IfBlock: {
        for (const child of node.consequent) {
          const r = searchNode(child);
          if (r) return r;
        }
        if (node.alternate) {
          if (Array.isArray(node.alternate)) {
            for (const child of node.alternate) {
              const r = searchNode(child);
              if (r) return r;
            }
          } else {
            const r = searchNode(node.alternate);
            if (r) return r;
          }
        }
        return null;
      }
      case NodeType.SwitchBlock: {
        for (const c of node.cases) {
          for (const child of c.body) {
            const r = searchNode(child);
            if (r) return r;
          }
        }
        if (node.defaultCase) {
          for (const child of node.defaultCase) {
            const r = searchNode(child);
            if (r) return r;
          }
        }
        return null;
      }
      case NodeType.LayoutBlock: {
        for (const child of node.body) {
          const r = searchNode(child);
          if (r) return r;
        }
        return null;
      }
      case NodeType.Expression:
      case NodeType.RawExpression:
        if (node.line === line && posAfterNode(node)) {
          // Build completions from current scope + loop vars
          const entries = getProperties(currentScope());
          for (let i = loopVarStack.length - 1; i >= 0; i--) {
            entries.push({ name: loopVarStack[i].variable, type: loopVarStack[i].type });
          }
          return entries;
        }
        return null;
      default:
        return null;
    }
  }

  // Walk the AST to find the scope at the position
  for (const node of ast.body) {
    const result = searchNode(node);
    if (result) return result;
  }

  // Default: return root scope properties + loop vars
  const entries = getProperties(currentScope());
  for (let i = loopVarStack.length - 1; i >= 0; i--) {
    entries.push({ name: loopVarStack[i].variable, type: loopVarStack[i].type });
  }
  return entries;
}
