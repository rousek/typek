import { describe, it, expect } from "vitest";
import { parse, NodeType } from "../parser.js";

describe("parser", () => {
  describe("type directive", () => {
    it("parses type directive on line 1", () => {
      const ast = parse('{{#import UserProfile from "./types"}}\n<div>{{name}}</div>');
      expect(ast.typeDirective).toEqual({
        typeName: "UserProfile",
        from: "./types",
        typeNameLine: 0,
        typeNameColumn: 10,
      });
    });

    it("errors if type directive is not on line 1", () => {
      expect(() => parse('<div></div>\n{{#import UserProfile from "./types"}}')).toThrow();
    });

    it("errors if there are multiple type directives", () => {
      expect(() =>
        parse('{{#import A from "./a"}}\n{{#import B from "./b"}}')
      ).toThrow();
    });

    it("allows missing type directive", () => {
      const ast = parse("<div>hello</div>");
      expect(ast.typeDirective).toBeNull();
    });
  });

  describe("text nodes", () => {
    it("parses plain text", () => {
      const ast = parse('{{#import T from "./t"}}\nhello world');
      const body = ast.body;
      expect(body).toContainEqual(
        expect.objectContaining({ type: NodeType.Text, value: "hello world" })
      );
    });
  });

  describe("expression nodes", () => {
    it("parses simple property access", () => {
      const ast = parse('{{#import T from "./t"}}\n{{user.name}}');
      const expr = ast.body.find((n) => n.type === NodeType.Expression);
      expect(expr).toBeDefined();
      expect(expr!.expression.type).toBe(NodeType.PropertyAccess);
    });

    it("parses nested property access", () => {
      const ast = parse('{{#import T from "./t"}}\n{{user.address.city}}');
      const expr = ast.body.find((n) => n.type === NodeType.Expression);
      expect(expr).toBeDefined();
    });

    it("parses raw expression", () => {
      const ast = parse('{{#import T from "./t"}}\n{{{content}}}');
      const expr = ast.body.find((n) => n.type === NodeType.RawExpression);
      expect(expr).toBeDefined();
    });

    it("parses comparison expression", () => {
      const ast = parse('{{#import T from "./t"}}\n{{age >= 18}}');
      const expr = ast.body.find((n) => n.type === NodeType.Expression);
      expect(expr!.expression.type).toBe(NodeType.BinaryExpression);
      expect(expr!.expression.operator).toBe(">=");
    });

    it("parses arithmetic expression", () => {
      const ast = parse('{{#import T from "./t"}}\n{{price * qty}}');
      const expr = ast.body.find((n) => n.type === NodeType.Expression);
      expect(expr!.expression.type).toBe(NodeType.BinaryExpression);
      expect(expr!.expression.operator).toBe("*");
    });

    it("parses logical expression", () => {
      const ast = parse('{{#import T from "./t"}}\n{{a && b || c}}');
      const expr = ast.body.find((n) => n.type === NodeType.Expression);
      expect(expr!.expression.type).toBe(NodeType.BinaryExpression);
    });

    it("parses unary not expression", () => {
      const ast = parse('{{#import T from "./t"}}\n{{!hidden}}');
      const expr = ast.body.find((n) => n.type === NodeType.Expression);
      expect(expr!.expression.type).toBe(NodeType.UnaryExpression);
      expect(expr!.expression.operator).toBe("!");
    });

    it("parses grouped expression with parentheses", () => {
      const ast = parse('{{#import T from "./t"}}\n{{(a || b) && c}}');
      const expr = ast.body.find((n) => n.type === NodeType.Expression);
      expect(expr!.expression.type).toBe(NodeType.BinaryExpression);
      expect(expr!.expression.operator).toBe("&&");
    });

    it("respects operator precedence (multiplication before addition)", () => {
      const ast = parse('{{#import T from "./t"}}\n{{a + b * c}}');
      const expr = ast.body.find((n) => n.type === NodeType.Expression);
      // a + (b * c) — top-level should be +
      expect(expr!.expression.operator).toBe("+");
      expect(expr!.expression.right.operator).toBe("*");
    });
  });

  describe("if blocks", () => {
    it("parses simple if block", () => {
      const ast = parse('{{#import T from "./t"}}\n{{#if active}}yes{{/if}}');
      const ifNode = ast.body.find((n) => n.type === NodeType.IfBlock);
      expect(ifNode).toBeDefined();
      expect(ifNode!.consequent).toHaveLength(1);
      expect(ifNode!.alternate).toBeNull();
    });

    it("parses if/else block", () => {
      const ast = parse('{{#import T from "./t"}}\n{{#if active}}yes{{#else}}no{{/if}}');
      const ifNode = ast.body.find((n) => n.type === NodeType.IfBlock);
      expect(ifNode!.consequent).toBeDefined();
      expect(ifNode!.alternate).toBeDefined();
    });

    it("parses if/else if/else chain", () => {
      const ast = parse(
        '{{#import T from "./t"}}\n{{#if a}}1{{#else if b}}2{{#else}}3{{/if}}'
      );
      const ifNode = ast.body.find((n) => n.type === NodeType.IfBlock);
      expect(ifNode).toBeDefined();
      // else if is represented as a nested IfBlock in the alternate
      expect(ifNode!.alternate.type).toBe(NodeType.IfBlock);
    });

    it("parses negated if condition", () => {
      const ast = parse('{{#import T from "./t"}}\n{{#if !blocked}}ok{{/if}}');
      const ifNode = ast.body.find((n) => n.type === NodeType.IfBlock);
      expect(ifNode!.condition.type).toBe(NodeType.UnaryExpression);
      expect(ifNode!.condition.operator).toBe("!");
    });

    it("errors on unclosed if block", () => {
      expect(() => parse('{{#import T from "./t"}}\n{{#if active}}yes')).toThrow();
    });
  });

  describe("for blocks", () => {
    it("parses simple for..in block", () => {
      const ast = parse(
        '{{#import T from "./t"}}\n{{#for item in items}}{{item.name}}{{/for}}'
      );
      const forNode = ast.body.find((n) => n.type === NodeType.ForBlock);
      expect(forNode).toBeDefined();
      expect(forNode!.variable).toBe("item");
      expect(forNode!.iterable.type).toBe(NodeType.Identifier);
      expect(forNode!.emptyBlock).toBeNull();
    });

    it("parses for..in with nested property as iterable", () => {
      const ast = parse(
        '{{#import T from "./t"}}\n{{#for item in order.items}}{{item.name}}{{/for}}'
      );
      const forNode = ast.body.find((n) => n.type === NodeType.ForBlock);
      expect(forNode!.iterable.type).toBe(NodeType.PropertyAccess);
    });

    it("parses for..in with empty block", () => {
      const ast = parse(
        '{{#import T from "./t"}}\n{{#for item in items}}{{item.name}}{{#empty}}none{{/empty}}{{/for}}'
      );
      const forNode = ast.body.find((n) => n.type === NodeType.ForBlock);
      expect(forNode!.emptyBlock).toBeDefined();
      expect(forNode!.emptyBlock).toHaveLength(1);
    });

    it("allows meta-variables inside for block", () => {
      const ast = parse(
        '{{#import T from "./t"}}\n{{#for item in items}}{{@index}}{{@first}}{{@last}}{{@length}}{{/for}}'
      );
      const forNode = ast.body.find((n) => n.type === NodeType.ForBlock);
      const metaVars = forNode!.body.filter((n) => n.type === NodeType.MetaVariable);
      expect(metaVars).toHaveLength(4);
    });

    it("errors on meta-variables outside for block", () => {
      expect(() => parse('{{#import T from "./t"}}\n{{@index}}')).toThrow();
    });

    it("errors on unclosed for block", () => {
      expect(() =>
        parse('{{#import T from "./t"}}\n{{#for item in items}}content')
      ).toThrow();
    });
  });

  describe("switch blocks", () => {
    it("parses switch with cases", () => {
      const ast = parse(
        '{{#import T from "./t"}}\n{{#switch role}}{{#case "admin"}}Admin{{/case}}{{#case "user"}}User{{/case}}{{/switch}}'
      );
      const switchNode = ast.body.find((n) => n.type === NodeType.SwitchBlock);
      expect(switchNode).toBeDefined();
      expect(switchNode!.cases).toHaveLength(2);
      expect(switchNode!.defaultCase).toBeNull();
    });

    it("parses switch with default", () => {
      const ast = parse(
        '{{#import T from "./t"}}\n{{#switch role}}{{#case "admin"}}Admin{{/case}}{{#default}}Guest{{/default}}{{/switch}}'
      );
      const switchNode = ast.body.find((n) => n.type === NodeType.SwitchBlock);
      expect(switchNode!.cases).toHaveLength(1);
      expect(switchNode!.defaultCase).toBeDefined();
    });

    it("each case has exactly one value", () => {
      const ast = parse(
        '{{#import T from "./t"}}\n{{#switch role}}{{#case "admin"}}Admin{{/case}}{{/switch}}'
      );
      const switchNode = ast.body.find((n) => n.type === NodeType.SwitchBlock);
      expect(switchNode!.cases[0].value).toBe("admin");
    });

    it("errors on unclosed switch block", () => {
      expect(() =>
        parse('{{#import T from "./t"}}\n{{#switch role}}{{#case "admin"}}Admin{{/case}}')
      ).toThrow();
    });
  });

  describe("comments", () => {
    it("parses comments as non-output nodes", () => {
      const ast = parse('{{#import T from "./t"}}\n{{! this is a comment }}text');
      const comments = ast.body.filter((n) => n.type === NodeType.Comment);
      expect(comments).toHaveLength(1);
    });

    it("comment does not appear in output body content", () => {
      const ast = parse('{{#import T from "./t"}}\n{{! hidden }}visible');
      const textNodes = ast.body.filter((n) => n.type === NodeType.Text);
      expect(textNodes).toContainEqual(
        expect.objectContaining({ value: "visible" })
      );
    });
  });

  describe("escaping", () => {
    it("parses escaped braces as text", () => {
      const ast = parse('{{#import T from "./t"}}\n\\{{ expression \\}}');
      const textNodes = ast.body.filter((n) => n.type === NodeType.Text);
      expect(textNodes).toContainEqual(
        expect.objectContaining({ value: "{{ expression }}" })
      );
    });

    it("parses raw block content as text", () => {
      const ast = parse('{{#import T from "./t"}}\n{{#raw}}{{ anything }}{{/raw}}');
      const textNodes = ast.body.filter((n) => n.type === NodeType.Text);
      expect(textNodes).toContainEqual(
        expect.objectContaining({ value: "{{ anything }}" })
      );
    });
  });

  describe("whitespace control", () => {
    it("strips leading whitespace with tilde on open", () => {
      const ast = parse('{{#import T from "./t"}}\n  {{~#if active}}yes{{/if}}');
      const ifNode = ast.body.find((n) => n.type === NodeType.IfBlock);
      expect(ifNode!.stripLeading).toBe(true);
    });

    it("strips trailing whitespace with tilde on close", () => {
      const ast = parse('{{#import T from "./t"}}\n{{#if active}}yes{{/if~}}  ');
      const ifNode = ast.body.find((n) => n.type === NodeType.IfBlock);
      expect(ifNode!.stripTrailing).toBe(true);
    });
  });

  describe("partials", () => {
    it("parses partial without data", () => {
      const ast = parse('{{#import T from "./t"}}\n{{> "./header.html.tc"}}');
      const partial = ast.body.find((n) => n.type === NodeType.Partial);
      expect(partial).toBeDefined();
      expect(partial!.path).toBe("./header.html.tc");
      expect(partial!.dataExpr).toBeNull();
    });

    it("parses partial with data expression", () => {
      const ast = parse('{{#import T from "./t"}}\n{{> "./header.html.tc" page}}');
      const partial = ast.body.find((n) => n.type === NodeType.Partial);
      expect(partial!.path).toBe("./header.html.tc");
      expect(partial!.dataExpr).toBeDefined();
    });
  });

  describe("nested blocks", () => {
    it("parses if inside for", () => {
      const ast = parse(
        '{{#import T from "./t"}}\n{{#for item in items}}{{#if item.active}}{{item.name}}{{/if}}{{/for}}'
      );
      const forNode = ast.body.find((n) => n.type === NodeType.ForBlock);
      const ifNode = forNode!.body.find((n) => n.type === NodeType.IfBlock);
      expect(ifNode).toBeDefined();
    });

    it("parses switch inside if", () => {
      const ast = parse(
        '{{#import T from "./t"}}\n{{#if show}}{{#switch role}}{{#case "admin"}}A{{/case}}{{/switch}}{{/if}}'
      );
      const ifNode = ast.body.find((n) => n.type === NodeType.IfBlock);
      const switchNode = ifNode!.consequent.find((n) => n.type === NodeType.SwitchBlock);
      expect(switchNode).toBeDefined();
    });
  });
});
