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

function addUndefined(type: Type): Type {
  if (type.kind === TypeKind.Undefined) return type;
  if (type.kind === TypeKind.Union) {
    if (type.types.some(t => t.kind === TypeKind.Undefined)) return type;
    return { kind: TypeKind.Union, types: [...type.types, { kind: TypeKind.Undefined }] };
  }
  return { kind: TypeKind.Union, types: [type, { kind: TypeKind.Undefined }] };
}

function deduplicateTypes(types: Type[]): Type[] {
  const seen = new Set<string>();
  const result: Type[] = [];
  for (const t of types) {
    const key = typeKey(t);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(t);
    }
  }
  return result;
}

function typeKey(t: Type): string {
  if (t.kind === TypeKind.Object) return "object:" + [...t.properties.keys()].sort().join(",");
  if (t.kind === TypeKind.Union) return "union:" + t.types.map(typeKey).sort().join("|");
  if (t.kind === TypeKind.Array) return "array:" + typeKey(t.elementType);
  if (t.kind === TypeKind.StringLiteral) return "strlit:" + t.value;
  if (t.kind === TypeKind.NumberLiteral) return "numlit:" + t.value;
  if (t.kind === TypeKind.BooleanLiteral) return "boollit:" + t.value;
  return TypeKind[t.kind];
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
      const objectTypes = type.types.filter(
        (t): t is Type & { kind: TypeKind.Object } =>
          t.kind === TypeKind.Object,
      );
      if (objectTypes.length === 0) return [];

      // Collect all property names across all object members
      const allNames = new Set<string>();
      for (const t of objectTypes) {
        for (const name of t.properties.keys()) allNames.add(name);
      }

      return [...allNames].map((name) => {
        const memberTypes: Type[] = [];
        let missingCount = 0;
        for (const t of objectTypes) {
          const prop = t.properties.get(name);
          if (prop) {
            memberTypes.push(prop);
          } else {
            missingCount++;
          }
        }
        // If not present in all members, add undefined
        let propType: Type;
        if (memberTypes.length === 1) {
          propType = memberTypes[0];
        } else {
          // Deduplicate identical types
          const unique = deduplicateTypes(memberTypes);
          propType = unique.length === 1 ? unique[0] : { kind: TypeKind.Union, types: unique };
        }
        if (missingCount > 0) {
          propType = addUndefined(propType);
        }
        return { name, type: propType };
      });
    }
    return [];
  }

  function buildResult(): CompletionEntry[] {
    const entries = getProperties(resolver.currentScope()).map(entry => {
      const narrowed = resolver.getNarrowedType(entry.name);
      return narrowed ? { name: entry.name, type: narrowed } : entry;
    });
    const loopVars = resolver.getLoopVars().map(lv => {
      const narrowed = resolver.getNarrowedType(lv.variable);
      return { name: lv.variable, type: narrowed ?? lv.type };
    });
    return [...loopVars, ...entries];
  }

  // Walk the AST and find the deepest block containing the cursor line.
  // Track the resolver state (scopes, loop vars, narrowings) as we go,
  // so that the result reflects the context at the cursor position.
  let bestResult: CompletionEntry[] = buildResult();

  function walkNodes(nodes: ASTNode[]): void {
    for (const node of nodes) {
      // Only process nodes at or before the cursor line
      if (node.line > line) continue;
      walkNode(node);
    }
  }

  function walkNode(node: ASTNode): void {
    switch (node.type) {
      case NodeType.ForBlock: {
        const iterableType = resolver.resolveExprType(node.iterable);
        const elementType = iterableType.kind === TypeKind.Array ? iterableType.elementType : { kind: TypeKind.Any as const };
        resolver.pushLoopVar(node.variable, elementType);
        bestResult = buildResult();
        walkNodes(node.body);
        if (node.emptyBlock) walkNodes(node.emptyBlock);
        resolver.popLoopVar();
        break;
      }
      case NodeType.WithBlock: {
        const withType = resolver.resolveExprType(node.expression);
        resolver.pushScope(withType);
        bestResult = buildResult();
        walkNodes(node.body);
        resolver.popScope();
        if (node.emptyBlock) walkNodes(node.emptyBlock);
        break;
      }
      case NodeType.IfBlock: {
        const narrowings = resolver.extractNarrowings(node.condition);

        const consequentMap = resolver.buildNarrowingMap(narrowings, "consequent");
        resolver.pushNarrowing(consequentMap);
        const savedBeforeConsequent = bestResult;
        bestResult = buildResult();
        walkNodes(node.consequent);
        const consequentResult = bestResult;
        resolver.popNarrowing(consequentMap);

        if (node.alternate) {
          // Check if the alternate branch starts at or before the cursor line
          const altFirstLine = Array.isArray(node.alternate)
            ? node.alternate[0]?.line
            : node.alternate.line;

          if (altFirstLine !== undefined && altFirstLine <= line) {
            const alternateMap = resolver.buildNarrowingMap(narrowings, "alternate");
            resolver.pushNarrowing(alternateMap);
            bestResult = buildResult();
            if (Array.isArray(node.alternate)) {
              walkNodes(node.alternate);
            } else {
              walkNode(node.alternate);
            }
            resolver.popNarrowing(alternateMap);
          } else {
            bestResult = consequentResult;
          }
        }
        break;
      }
      case NodeType.SwitchBlock: {
        for (const c of node.cases) {
          walkNodes(c.body);
        }
        if (node.defaultCase) walkNodes(node.defaultCase);
        break;
      }
      case NodeType.LayoutBlock: {
        walkNodes(node.body);
        break;
      }
      default:
        break;
    }
  }

  walkNodes(ast.body);
  return bestResult;
}

/**
 * Resolve the type of a dotted chain (e.g. ["customer", "address"]) at a
 * given cursor position, accounting for loop variables and type narrowing.
 */
export function resolveChainAtPosition(
  ast: TemplateAST,
  dataType: Type,
  chain: string[],
  line: number,
): Type | undefined {
  // First, get the completions at this position to find the root variable type
  const entries = completionsAtPosition(ast, dataType, line, 0);
  if (chain.length === 0) return undefined;

  const rootName = chain[0];
  const rootEntry = entries.find(e => e.name === rootName);
  if (!rootEntry) return undefined;

  let type = rootEntry.type;
  for (let i = 1; i < chain.length; i++) {
    const name = chain[i];
    if (type.kind === TypeKind.Object) {
      const prop = type.properties.get(name);
      if (!prop) return undefined;
      type = prop;
    } else if (type.kind === TypeKind.Union) {
      const objectTypes = type.types.filter(t => t.kind === TypeKind.Object);
      const memberTypes: Type[] = [];
      let missingCount = 0;
      for (const t of objectTypes) {
        if (t.kind !== TypeKind.Object) continue;
        const prop = t.properties.get(name);
        if (prop) {
          memberTypes.push(prop);
        } else {
          missingCount++;
        }
      }
      if (memberTypes.length === 0) return undefined;
      type = memberTypes.length === 1 ? memberTypes[0] : { kind: TypeKind.Union, types: deduplicateTypes(memberTypes) };
      if (missingCount > 0) type = addUndefined(type);
    } else if (type.kind === TypeKind.Any) {
      return type;
    } else {
      return undefined;
    }
  }
  return type;
}
