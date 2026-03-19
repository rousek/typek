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
import { TypeResolver, formatExpr, type ErrorHandler } from "./type-resolver.js";

export interface Diagnostic {
  message: string;
  severity: "error" | "warning";
  line: number;
  column: number;
  length: number;
}

/** Check if `source` type is structurally assignable to `target` type */
function isAssignable(source: Type, target: Type): boolean {
  if (target.kind === TypeKind.Any || source.kind === TypeKind.Any) return true;

  if (target.kind === TypeKind.String && source.kind === TypeKind.String) return true;
  if (target.kind === TypeKind.Number && source.kind === TypeKind.Number) return true;
  if (target.kind === TypeKind.Boolean && source.kind === TypeKind.Boolean) return true;
  if (target.kind === TypeKind.Null && source.kind === TypeKind.Null) return true;
  if (target.kind === TypeKind.Undefined && source.kind === TypeKind.Undefined) return true;

  if (target.kind === TypeKind.String && source.kind === TypeKind.StringLiteral) return true;
  if (target.kind === TypeKind.StringLiteral && source.kind === TypeKind.StringLiteral) return source.value === target.value;
  if (target.kind === TypeKind.Number && source.kind === TypeKind.NumberLiteral) return true;
  if (target.kind === TypeKind.NumberLiteral && source.kind === TypeKind.NumberLiteral) return source.value === target.value;
  if (target.kind === TypeKind.Boolean && (source.kind === TypeKind.BooleanLiteral || source.kind === TypeKind.Boolean)) return true;
  if (target.kind === TypeKind.BooleanLiteral && source.kind === TypeKind.BooleanLiteral) return source.value === target.value;

  if (target.kind === TypeKind.Array && source.kind === TypeKind.Array) {
    return isAssignable(source.elementType, target.elementType);
  }

  if (target.kind === TypeKind.Union) {
    if (source.kind === TypeKind.Union) {
      return source.types.every(st => target.types.some(tt => isAssignable(st, tt)));
    }
    return target.types.some(t => isAssignable(source, t));
  }

  if (source.kind === TypeKind.Union) {
    return source.types.every(t => isAssignable(t, target));
  }

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
  acceptsData: boolean;
  hasContent: boolean;
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
  templateDir: string;
}

export function typecheck(ast: TemplateAST, dataType: Type, context?: TypecheckContext): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  function exprLength(node: ExprNode): number {
    return formatExpr(node).length;
  }

  const errors: ErrorHandler = {
    error(message, node) {
      diagnostics.push({ message, severity: "error", line: node.line, column: node.column, length: exprLength(node) });
    },
    warning(message, node) {
      diagnostics.push({ message, severity: "warning", line: node.line, column: node.column, length: exprLength(node) });
    },
  };

  const resolver = new TypeResolver(dataType, errors);

  function checkNode(node: ASTNode): void {
    switch (node.type) {
      case NodeType.Expression:
        resolver.resolveExprType(node.expression);
        break;

      case NodeType.RawExpression:
        resolver.resolveExprType(node.expression);
        break;

      case NodeType.IfBlock: {
        resolver.resolveExprType(node.condition);
        const narrowings = resolver.extractNarrowings(node.condition);

        const consequentMap = resolver.buildNarrowingMap(narrowings, "consequent");
        resolver.pushNarrowing(consequentMap);
        node.consequent.forEach(checkNode);
        resolver.popNarrowing(consequentMap);

        if (node.alternate) {
          const alternateMap = resolver.buildNarrowingMap(narrowings, "alternate");
          resolver.pushNarrowing(alternateMap);
          if (Array.isArray(node.alternate)) {
            node.alternate.forEach(checkNode);
          } else {
            checkNode(node.alternate);
          }
          resolver.popNarrowing(alternateMap);
        }
        break;
      }

      case NodeType.ForBlock: {
        const iterableType = resolver.resolveExprType(node.iterable);
        let elementType: Type = { kind: TypeKind.Any };

        if (iterableType.kind === TypeKind.Array) {
          elementType = iterableType.elementType;
        } else if (iterableType.kind !== TypeKind.Any) {
          errors.error(`${formatExpr(node.iterable)} is not iterable (type is not an array)`, node.iterable);
        }

        resolver.pushLoopVar(node.variable, elementType);
        node.body.forEach(checkNode);
        if (node.emptyBlock) node.emptyBlock.forEach(checkNode);
        resolver.popLoopVar();
        break;
      }

      case NodeType.SwitchBlock: {
        const switchType = resolver.resolveExprType(node.expression);
        for (const c of node.cases) {
          if (switchType.kind !== TypeKind.Any) {
            if (switchType.kind === TypeKind.String || switchType.kind === TypeKind.StringLiteral) {
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
              const hasPlainString = switchType.types.some(t => t.kind === TypeKind.String);
              if (!hasPlainString) {
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
        const withType = resolver.resolveExprType(node.expression);
        resolver.pushScope(withType);
        node.body.forEach(checkNode);
        resolver.popScope();
        if (node.emptyBlock) node.emptyBlock.forEach(checkNode);
        break;
      }

      case NodeType.Partial: {
        const passedType = node.dataExpr ? resolver.resolveExprType(node.dataExpr) : undefined;
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
        const passedType = node.dataExpr ? resolver.resolveExprType(node.dataExpr) : undefined;
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

      default:
        break;
    }
  }

  ast.body.forEach(checkNode);
  return diagnostics;
}
