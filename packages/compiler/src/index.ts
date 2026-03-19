import {
  parse,
  NodeType,
  typecheck,
  resolveType,
  type ASTNode,
  type ExprNode,
  type ForBlockNode,
  type Diagnostic,
} from "@typek/core";
import path from "path";

export interface CompileOptions {
  template: string;
  filename: string;
  /** Absolute path to the template file, required for type checking */
  templatePath?: string;
  /** Enable type checking against the resolved TypeScript type */
  typecheck?: boolean;
}

export interface CompileResult {
  code: string;
  diagnostics: Diagnostic[];
  /** True if this template uses {{@content}} (is a layout template) */
  isLayout: boolean;
  /** Paths of layout templates referenced by {{#layout}} blocks */
  layoutDeps: string[];
}

function getEscapeMode(filename: string): "html" | "none" {
  if (filename.endsWith(".html.tk")) return "html";
  return "none";
}

export function compile(options: CompileOptions): CompileResult {
  const ast = parse(options.template);
  const escapeMode = getEscapeMode(options.filename);
  const { typeName, from } = ast.typeDirective;

  // Type checking
  let diagnostics: Diagnostic[] = [];
  if (options.typecheck && options.templatePath) {
    try {
      const templateDir = path.dirname(options.templatePath);
      const typeFilePath = path.resolve(templateDir, from.endsWith(".ts") ? from : from + ".ts");
      const dataType = resolveType(typeFilePath, typeName);
      diagnostics = typecheck(ast, dataType);
    } catch (err) {
      diagnostics = [{
        message: err instanceof Error ? err.message : String(err),
        severity: "error",
        line: 0,
        column: 0,
        length: 0,
      }];
    }
  }

  let loopCounter = 0;
  let withCounter = 0;
  let layoutCounter = 0;
  let partialCounter = 0;
  // Stack to track loop variable names for nested loops
  const loopVarStack: Array<{ variable: string; arrVar: string; indexVar: string }> = [];
  // Stack to track scope variables for {{#with}} blocks
  const scopeVarStack: string[] = ["data"];
  // Stack to track output variable (for layout content accumulation)
  const outputVarStack: string[] = ["__out"];
  // Layout and partial imports collected during compilation
  const layoutImports: Array<{ varName: string; importPath: string }> = [];
  const partialImports: Array<{ varName: string; importPath: string }> = [];
  // Track whether this template uses {{@content}}
  let hasContentTag = false;

  function currentOutputVar(): string {
    return outputVarStack[outputVarStack.length - 1];
  }

  function currentScopeVar(): string {
    return scopeVarStack[scopeVarStack.length - 1];
  }

  function scopeVarAtDepth(depth: number): string {
    const idx = scopeVarStack.length - 1 - depth;
    if (idx < 0) {
      const maxDepth = scopeVarStack.length - 1;
      throw new Error(`'${"../".repeat(depth)}' goes ${depth} level(s) up, but only ${maxDepth} level(s) of scope exist`);
    }
    return scopeVarStack[idx];
  }

  function isLoopVariable(name: string): boolean {
    return loopVarStack.some((l) => l.variable === name);
  }

  function getLoopContext(): { arrVar: string; indexVar: string } | undefined {
    return loopVarStack[loopVarStack.length - 1];
  }

  function compileExpr(node: ExprNode): string {
    switch (node.type) {
      case NodeType.Identifier:
        if (node.depth > 0) return `${scopeVarAtDepth(node.depth)}.${node.name}`;
        if (isLoopVariable(node.name)) return node.name;
        return `${currentScopeVar()}.${node.name}`;
      case NodeType.PropertyAccess:
        return `${compileExpr(node.object)}.${node.property}`;
      case NodeType.BinaryExpression:
        return `(${compileExpr(node.left)} ${node.operator} ${compileExpr(node.right)})`;
      case NodeType.UnaryExpression:
        return `(!${compileExpr(node.operand)})`;
      case NodeType.StringLiteral:
        return JSON.stringify(node.value);
      case NodeType.NumberLiteral:
        return String(node.value);
      default:
        throw new Error(`Unknown expression node type: ${(node as ExprNode).type}`);
    }
  }

  function compileNode(node: ASTNode): string {
    const out = currentOutputVar();
    switch (node.type) {
      case NodeType.Text:
        return `${out} += ${JSON.stringify(node.value)};\n`;

      case NodeType.Expression: {
        const expr = compileExpr(node.expression);
        if (escapeMode === "html") {
          return `${out} += __escapeHtml(String(${expr}));\n`;
        }
        return `${out} += String(${expr});\n`;
      }

      case NodeType.RawExpression:
        return `${out} += String(${compileExpr(node.expression)});\n`;

      case NodeType.IfBlock:
        return compileIfBlock(node);

      case NodeType.ForBlock:
        return compileForBlock(node);

      case NodeType.SwitchBlock:
        return compileSwitchBlock(node);

      case NodeType.WithBlock:
        return compileWithBlock(node);

      case NodeType.Comment:
        return "";

      case NodeType.Partial:
        return compilePartial(node);

      case NodeType.MetaVariable:
        return compileMetaVariable(node);

      case NodeType.LayoutBlock:
        return compileLayoutBlock(node);

      case NodeType.Content:
        hasContentTag = true;
        return `${out} += __content;\n`;

      default:
        return "";
    }
  }

  function compileBody(nodes: ASTNode[]): string {
    return nodes.map(compileNode).join("");
  }

  function compileIfBlock(node: ASTNode): string {
    if (node.type !== NodeType.IfBlock) return "";
    let code = `if (${compileExpr(node.condition)}) {\n`;
    code += compileBody(node.consequent);
    code += `}`;

    if (node.alternate) {
      if (Array.isArray(node.alternate)) {
        code += ` else {\n${compileBody(node.alternate)}}`;
      } else {
        // else if (nested IfBlock)
        code += ` else ${compileIfBlock(node.alternate)}`;
      }
    }

    code += "\n";
    return code;
  }

  function compileForBlock(node: ForBlockNode): string {
    const n = loopCounter++;
    const arrVar = `__arr_${n}`;
    const indexVar = `__i_${n}`;

    loopVarStack.push({ variable: node.variable, arrVar, indexVar });

    let code = `const ${arrVar} = ${compileExpr(node.iterable)};\n`;

    if (node.emptyBlock) {
      code += `if (${arrVar}.length > 0) {\n`;
    }

    code += `for (let ${indexVar} = 0; ${indexVar} < ${arrVar}.length; ${indexVar}++) {\n`;
    code += `const ${node.variable} = ${arrVar}[${indexVar}];\n`;
    code += compileBody(node.body);
    code += `}\n`;

    if (node.emptyBlock) {
      code += `} else {\n`;
      code += compileBody(node.emptyBlock);
      code += `}\n`;
    }

    loopVarStack.pop();
    return code;
  }

  function compileSwitchBlock(node: ASTNode): string {
    if (node.type !== NodeType.SwitchBlock) return "";
    let code = `switch (${compileExpr(node.expression)}) {\n`;

    for (const c of node.cases) {
      code += `case ${JSON.stringify(c.value)}: {\n`;
      code += compileBody(c.body);
      code += `break;\n}\n`;
    }

    if (node.defaultCase) {
      code += `default: {\n`;
      code += compileBody(node.defaultCase);
      code += `break;\n}\n`;
    }

    code += `}\n`;
    return code;
  }

  function compileWithBlock(node: ASTNode): string {
    if (node.type !== NodeType.WithBlock) return "";
    const n = withCounter++;
    const scopeVar = `__with_${n}`;

    let code = `const ${scopeVar} = ${compileExpr(node.expression)};\n`;

    if (node.emptyBlock) {
      code += `if (${scopeVar}) {\n`;
    } else {
      code += `if (${scopeVar}) {\n`;
    }

    scopeVarStack.push(scopeVar);
    code += compileBody(node.body);
    scopeVarStack.pop();
    code += `}`;

    if (node.emptyBlock) {
      code += ` else {\n`;
      code += compileBody(node.emptyBlock);
      code += `}`;
    }

    code += "\n";
    return code;
  }

  function compilePartial(node: ASTNode): string {
    if (node.type !== NodeType.Partial) return "";
    const out = currentOutputVar();
    const n = partialCounter++;
    const partialVar = `__partial_${n}`;
    const importPath = node.path.replace(/\.tk$/, "");

    partialImports.push({ varName: partialVar, importPath });

    return `${out} += ${partialVar}(${compileExpr(node.dataExpr)});\n`;
  }

  function compileMetaVariable(node: ASTNode): string {
    if (node.type !== NodeType.MetaVariable) return "";
    const out = currentOutputVar();
    const ctx = getLoopContext();
    if (!ctx) return "";

    switch (node.name) {
      case "@index":
        return `${out} += String(${ctx.indexVar});\n`;
      case "@first":
        return `${out} += String(${ctx.indexVar} === 0);\n`;
      case "@last":
        return `${out} += String(${ctx.indexVar} === ${ctx.arrVar}.length - 1);\n`;
      case "@length":
        return `${out} += String(${ctx.arrVar}.length);\n`;
      default:
        return "";
    }
  }

  function compileLayoutBlock(node: ASTNode): string {
    if (node.type !== NodeType.LayoutBlock) return "";
    const n = layoutCounter++;
    const layoutVar = `__layout_${n}`;
    const contentVar = `__layout_content_${n}`;
    const importPath = node.path.replace(/\.tk$/, "");

    layoutImports.push({ varName: layoutVar, importPath });

    let code = `let ${contentVar} = "";\n`;
    outputVarStack.push(contentVar);
    code += compileBody(node.body);
    outputVarStack.pop();
    code += `${currentOutputVar()} += ${layoutVar}(${compileExpr(node.dataExpr)}, ${contentVar});\n`;

    return code;
  }

  // Compile the body first so we collect layout imports and detect @content
  const bodyCode = compileBody(ast.body);

  // Build the output module
  let code = `// Auto-generated by Typek — do not edit\n`;
  code += `import type { ${typeName} } from "${from}";\n`;

  if (escapeMode === "html") {
    code += `import { escapeHtml as __escapeHtml } from "@typek/runtime";\n`;
  }

  for (const { varName, importPath } of layoutImports) {
    code += `import ${varName} from "${importPath}";\n`;
  }

  for (const { varName, importPath } of partialImports) {
    code += `import ${varName} from "${importPath}";\n`;
  }

  code += `\n`;
  if (hasContentTag) {
    code += `export default function render(data: ${typeName}, __content: string = ""): string {\n`;
  } else {
    code += `export default function render(data: ${typeName}): string {\n`;
  }
  code += `let __out = "";\n`;
  code += bodyCode;
  code += `return __out;\n`;
  code += `}\n`;

  return { code, diagnostics, isLayout: hasContentTag, layoutDeps: layoutImports.map(l => l.importPath) };
}
