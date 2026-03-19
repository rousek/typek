import {
  NodeType,
  type ASTNode,
  type ExprNode,
  type TemplateAST,
} from "./parser.js";
import { TypeKind, type Type } from "./types.js";
import { TypeResolver, resolveProperty, formatExpr } from "./type-resolver.js";

export interface HoverResult {
  type: Type;
  name: string;
  propertyPath: string[];
  line: number;
  column: number;
  length: number;
}

function nodeContains(node: { line: number; column: number }, exprText: string, line: number, column: number): boolean {
  if (node.line !== line) return false;
  return column >= node.column && column < node.column + exprText.length;
}

export function typeAtPosition(
  ast: TemplateAST,
  dataType: Type,
  line: number,
  column: number,
): HoverResult | undefined {
  const resolver = new TypeResolver(dataType);
  const scopePathStack: string[][] = [[]];
  // Track loop var paths separately (TypeResolver handles types)
  const loopVarPaths: Array<{ variable: string; iterablePath: string[] }> = [];

  function resolveExprPath(node: ExprNode): string[] {
    switch (node.type) {
      case NodeType.Identifier: {
        if (node.depth > 0) {
          const idx = scopePathStack.length - 1 - node.depth;
          const scopePath = idx >= 0 ? scopePathStack[idx] : [];
          return [...scopePath, node.name];
        }
        for (let i = loopVarPaths.length - 1; i >= 0; i--) {
          if (loopVarPaths[i].variable === node.name) return loopVarPaths[i].iterablePath;
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

  function findInExpr(node: ExprNode): HoverResult | undefined {
    if (node.type === NodeType.PropertyAccess) {
      const objText = formatExpr(node.object);
      const propStart = node.column + objText.length + 1;
      if (line === node.line && column >= propStart && column < propStart + node.property.length) {
        const type = resolver.resolveExprType(node);
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
      const type = resolver.resolveExprType(node);
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

        const narrowings = resolver.extractNarrowings(node.condition);

        const consequentMap = resolver.buildNarrowingMap(narrowings, "consequent");
        resolver.pushNarrowing(consequentMap);
        for (const child of node.consequent) {
          const r = findInNode(child);
          if (r) { resolver.popNarrowing(consequentMap); return r; }
        }
        resolver.popNarrowing(consequentMap);

        if (node.alternate) {
          const alternateMap = resolver.buildNarrowingMap(narrowings, "alternate");
          resolver.pushNarrowing(alternateMap);
          if (Array.isArray(node.alternate)) {
            for (const child of node.alternate) {
              const r = findInNode(child);
              if (r) { resolver.popNarrowing(alternateMap); return r; }
            }
          } else {
            const r = findInNode(node.alternate);
            if (r) { resolver.popNarrowing(alternateMap); return r; }
          }
          resolver.popNarrowing(alternateMap);
        }
        return undefined;
      }
      case NodeType.ForBlock: {
        const iterResult = findInExpr(node.iterable);
        if (iterResult) return iterResult;

        const iterableType = resolver.resolveExprType(node.iterable);
        const elementType = iterableType.kind === TypeKind.Array ? iterableType.elementType : { kind: TypeKind.Any as const };
        const iterablePath = resolveExprPath(node.iterable);

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

        resolver.pushLoopVar(node.variable, elementType);
        loopVarPaths.push({ variable: node.variable, iterablePath });

        for (const child of node.body) {
          const r = findInNode(child);
          if (r) { resolver.popLoopVar(); loopVarPaths.pop(); return r; }
        }
        if (node.emptyBlock) {
          for (const child of node.emptyBlock) {
            const r = findInNode(child);
            if (r) { resolver.popLoopVar(); loopVarPaths.pop(); return r; }
          }
        }
        resolver.popLoopVar();
        loopVarPaths.pop();
        return undefined;
      }
      case NodeType.WithBlock: {
        const exprResult = findInExpr(node.expression);
        if (exprResult) return exprResult;

        const withType = resolver.resolveExprType(node.expression);
        const withPath = resolveExprPath(node.expression);
        resolver.pushScope(withType);
        scopePathStack.push(withPath);

        for (const child of node.body) {
          const r = findInNode(child);
          if (r) { resolver.popScope(); scopePathStack.pop(); return r; }
        }
        resolver.popScope();
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
        if (node.dataExpr) {
          const r = findInExpr(node.dataExpr);
          if (r) return r;
        }
        return undefined;
      }
      case NodeType.LayoutBlock: {
        if (node.dataExpr) {
          const dataResult = findInExpr(node.dataExpr);
          if (dataResult) return dataResult;
        }
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

  const dir = ast.typeDirective;
  if (
    dir &&
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

export function completionsAtPosition(
  ast: TemplateAST,
  dataType: Type,
  line: number,
  column: number,
): CompletionEntry[] {
  const resolver = new TypeResolver(dataType);

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

  function posAfterNode(node: { line: number; column: number }): boolean {
    return line > node.line || (line === node.line && column > node.column);
  }

  function searchNode(node: ASTNode): CompletionEntry[] | null {
    switch (node.type) {
      case NodeType.ForBlock: {
        const iterableType = resolver.resolveExprType(node.iterable);
        const elementType = iterableType.kind === TypeKind.Array ? iterableType.elementType : { kind: TypeKind.Any as const };
        resolver.pushLoopVar(node.variable, elementType);
        for (const child of node.body) {
          const r = searchNode(child);
          if (r) { resolver.popLoopVar(); return r; }
        }
        if (node.emptyBlock) {
          for (const child of node.emptyBlock) {
            const r = searchNode(child);
            if (r) { resolver.popLoopVar(); return r; }
          }
        }
        resolver.popLoopVar();
        return null;
      }
      case NodeType.WithBlock: {
        const withType = resolver.resolveExprType(node.expression);
        resolver.pushScope(withType);
        for (const child of node.body) {
          const r = searchNode(child);
          if (r) { resolver.popScope(); return r; }
        }
        resolver.popScope();
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
          const entries = getProperties(resolver.currentScope());
          return entries;
        }
        return null;
      default:
        return null;
    }
  }

  for (const node of ast.body) {
    const result = searchNode(node);
    if (result) return result;
  }

  return getProperties(resolver.currentScope());
}
