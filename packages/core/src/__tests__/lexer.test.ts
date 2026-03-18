import { describe, it, expect } from "vitest";
import { tokenize, TokenType, type Token } from "../lexer.js";

// Strip position info for cleaner assertions
function bare(tokens: Token[]) {
  return tokens.map(({ type, value }) => ({ type, value }));
}

function bareContains(tokens: Token[], expected: { type: TokenType; value: string }) {
  return tokens.some((t) => t.type === expected.type && t.value === expected.value);
}

describe("lexer", () => {
  describe("text", () => {
    it("tokenizes plain text", () => {
      const tokens = tokenize("hello world");
      expect(bare(tokens)).toEqual([
        { type: TokenType.Text, value: "hello world" },
      ]);
    });

    it("tokenizes empty string", () => {
      const tokens = tokenize("");
      expect(tokens).toEqual([]);
    });
  });

  describe("expressions", () => {
    it("tokenizes simple expression", () => {
      const tokens = tokenize("{{name}}");
      expect(bare(tokens)).toEqual([
        { type: TokenType.OpenExpression, value: "{{" },
        { type: TokenType.Identifier, value: "name" },
        { type: TokenType.CloseExpression, value: "}}" },
      ]);
    });

    it("tokenizes property access", () => {
      const tokens = tokenize("{{user.name}}");
      expect(bare(tokens)).toEqual([
        { type: TokenType.OpenExpression, value: "{{" },
        { type: TokenType.Identifier, value: "user" },
        { type: TokenType.Dot, value: "." },
        { type: TokenType.Identifier, value: "name" },
        { type: TokenType.CloseExpression, value: "}}" },
      ]);
    });

    it("tokenizes expression with surrounding text", () => {
      const tokens = tokenize("Hello {{name}}!");
      expect(tokens[0].type).toBe(TokenType.Text);
      expect(tokens[0].value).toBe("Hello ");
      expect(tokens[tokens.length - 1].type).toBe(TokenType.Text);
      expect(tokens[tokens.length - 1].value).toBe("!");
    });

    it("tokenizes raw/unescaped expression with triple braces", () => {
      const tokens = tokenize("{{{content}}}");
      expect(bare(tokens)).toEqual([
        { type: TokenType.OpenRawExpression, value: "{{{" },
        { type: TokenType.Identifier, value: "content" },
        { type: TokenType.CloseRawExpression, value: "}}}" },
      ]);
    });
  });

  describe("operators", () => {
    it("tokenizes logical operators", () => {
      const tokens = tokenize("{{a && b || !c}}");
      const types = tokens.map((t) => t.type);
      expect(types).toContain(TokenType.And);
      expect(types).toContain(TokenType.Or);
      expect(types).toContain(TokenType.Not);
    });

    it("tokenizes comparison operators", () => {
      const tokens = tokenize("{{a == b}}");
      expect(bareContains(tokens, { type: TokenType.Equal, value: "==" })).toBe(true);
    });

    it("tokenizes not-equal operator", () => {
      const tokens = tokenize("{{a != b}}");
      expect(bareContains(tokens, { type: TokenType.NotEqual, value: "!=" })).toBe(true);
    });

    it("tokenizes greater/less than operators", () => {
      const tokens = tokenize("{{a > b}}");
      expect(bareContains(tokens, { type: TokenType.GreaterThan, value: ">" })).toBe(true);

      const tokens2 = tokenize("{{a < b}}");
      expect(bareContains(tokens2, { type: TokenType.LessThan, value: "<" })).toBe(true);
    });

    it("tokenizes greater/less than or equal operators", () => {
      const tokens = tokenize("{{a >= b}}");
      expect(bareContains(tokens, { type: TokenType.GreaterThanOrEqual, value: ">=" })).toBe(true);

      const tokens2 = tokenize("{{a <= b}}");
      expect(bareContains(tokens2, { type: TokenType.LessThanOrEqual, value: "<=" })).toBe(true);
    });

    it("tokenizes arithmetic operators", () => {
      const tokens = tokenize("{{a + b - c * d / e}}");
      const types = tokens.map((t) => t.type);
      expect(types).toContain(TokenType.Plus);
      expect(types).toContain(TokenType.Minus);
      expect(types).toContain(TokenType.Star);
      expect(types).toContain(TokenType.Slash);
    });

    it("tokenizes parentheses", () => {
      const tokens = tokenize("{{(a || b) && !c}}");
      expect(bareContains(tokens, { type: TokenType.OpenParen, value: "(" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.CloseParen, value: ")" })).toBe(true);
    });
  });

  describe("import directive", () => {
    it("tokenizes import directive", () => {
      const tokens = tokenize('{{#import UserProfile from "./types"}}');
      expect(bareContains(tokens, { type: TokenType.OpenBlock, value: "{{#" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.BlockName, value: "import" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.Identifier, value: "UserProfile" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.From, value: "from" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.StringLiteral, value: "./types" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.CloseExpression, value: "}}" })).toBe(true);
    });
  });

  describe("comments", () => {
    it("tokenizes regular comment", () => {
      const tokens = tokenize("{{! this is a comment }}");
      expect(tokens[0].type).toBe(TokenType.OpenComment);
      expect(tokens[0].value).toBe("{{!");
    });
  });

  describe("control flow", () => {
    it("tokenizes #if block open", () => {
      const tokens = tokenize("{{#if condition}}");
      expect(bareContains(tokens, { type: TokenType.OpenBlock, value: "{{#" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.BlockName, value: "if" })).toBe(true);
    });

    it("tokenizes /if block close", () => {
      const tokens = tokenize("{{/if}}");
      expect(bareContains(tokens, { type: TokenType.CloseBlock, value: "{{/" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.BlockName, value: "if" })).toBe(true);
    });

    it("tokenizes #else", () => {
      const tokens = tokenize("{{#else}}");
      expect(bareContains(tokens, { type: TokenType.OpenBlock, value: "{{#" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.BlockName, value: "else" })).toBe(true);
    });

    it("tokenizes #else if", () => {
      const tokens = tokenize("{{#else if condition}}");
      expect(bareContains(tokens, { type: TokenType.BlockName, value: "else" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.BlockName, value: "if" })).toBe(true);
    });

    it("tokenizes #for..in", () => {
      const tokens = tokenize("{{#for item in items}}");
      expect(bareContains(tokens, { type: TokenType.OpenBlock, value: "{{#" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.BlockName, value: "for" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.Identifier, value: "item" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.In, value: "in" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.Identifier, value: "items" })).toBe(true);
    });

    it("tokenizes #empty and /empty", () => {
      const tokens = tokenize("{{#empty}}no items{{/empty}}");
      expect(bareContains(tokens, { type: TokenType.BlockName, value: "empty" })).toBe(true);
    });

    it("tokenizes #switch", () => {
      const tokens = tokenize("{{#switch user.role}}");
      expect(bareContains(tokens, { type: TokenType.BlockName, value: "switch" })).toBe(true);
    });

    it("tokenizes #case with string literal", () => {
      const tokens = tokenize('{{#case "admin"}}');
      expect(bareContains(tokens, { type: TokenType.BlockName, value: "case" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.StringLiteral, value: "admin" })).toBe(true);
    });

    it("tokenizes #default", () => {
      const tokens = tokenize("{{#default}}");
      expect(bareContains(tokens, { type: TokenType.BlockName, value: "default" })).toBe(true);
    });
  });

  describe("meta-variables", () => {
    it("tokenizes @index", () => {
      const tokens = tokenize("{{@index}}");
      expect(bareContains(tokens, { type: TokenType.MetaVariable, value: "@index" })).toBe(true);
    });

    it("tokenizes @first", () => {
      const tokens = tokenize("{{@first}}");
      expect(bareContains(tokens, { type: TokenType.MetaVariable, value: "@first" })).toBe(true);
    });

    it("tokenizes @last", () => {
      const tokens = tokenize("{{@last}}");
      expect(bareContains(tokens, { type: TokenType.MetaVariable, value: "@last" })).toBe(true);
    });

    it("tokenizes @length", () => {
      const tokens = tokenize("{{@length}}");
      expect(bareContains(tokens, { type: TokenType.MetaVariable, value: "@length" })).toBe(true);
    });
  });

  describe("partials", () => {
    it("tokenizes partial invocation", () => {
      const tokens = tokenize("{{> header}}");
      expect(bareContains(tokens, { type: TokenType.OpenPartial, value: "{{>" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.Identifier, value: "header" })).toBe(true);
    });

    it("tokenizes partial with props", () => {
      const tokens = tokenize("{{> header title=page.title}}");
      expect(bareContains(tokens, { type: TokenType.Identifier, value: "title" })).toBe(true);
      expect(bareContains(tokens, { type: TokenType.Assign, value: "=" })).toBe(true);
    });
  });

  describe("escaping", () => {
    it("tokenizes escaped braces as text", () => {
      const tokens = tokenize("\\{{ expression \\}}");
      expect(bare(tokens)).toEqual([
        { type: TokenType.Text, value: "{{ expression }}" },
      ]);
    });

    it("tokenizes #raw block content as text", () => {
      const tokens = tokenize("{{#raw}}{{ anything }}{{/raw}}");
      expect(bareContains(tokens, { type: TokenType.Text, value: "{{ anything }}" })).toBe(true);
    });
  });

  describe("whitespace control", () => {
    it("tokenizes tilde on opening tag", () => {
      const tokens = tokenize("{{~#if condition}}");
      expect(bareContains(tokens, { type: TokenType.OpenBlock, value: "{{~#" })).toBe(true);
    });

    it("tokenizes tilde on closing tag", () => {
      const tokens = tokenize("{{/if~}}");
      expect(bareContains(tokens, { type: TokenType.WhitespaceStrip, value: "~" })).toBe(true);
    });

    it("tokenizes tilde on expression", () => {
      const tokens = tokenize("{{~ name ~}}");
      expect(bareContains(tokens, { type: TokenType.WhitespaceStrip, value: "~" })).toBe(true);
    });
  });

  describe("string literals", () => {
    it("tokenizes double-quoted strings", () => {
      const tokens = tokenize('{{#case "hello"}}');
      expect(bareContains(tokens, { type: TokenType.StringLiteral, value: "hello" })).toBe(true);
    });

    it("tokenizes single-quoted strings", () => {
      const tokens = tokenize("{{#case 'hello'}}");
      expect(bareContains(tokens, { type: TokenType.StringLiteral, value: "hello" })).toBe(true);
    });
  });

  describe("number literals", () => {
    it("tokenizes integer", () => {
      const tokens = tokenize("{{42}}");
      expect(bareContains(tokens, { type: TokenType.NumberLiteral, value: "42" })).toBe(true);
    });

    it("tokenizes decimal", () => {
      const tokens = tokenize("{{3.14}}");
      expect(bareContains(tokens, { type: TokenType.NumberLiteral, value: "3.14" })).toBe(true);
    });
  });

  describe("position tracking", () => {
    it("tracks line and column for tokens", () => {
      const tokens = tokenize("{{name}}");
      const ident = tokens.find((t) => t.type === TokenType.Identifier);
      expect(ident?.line).toBe(0);
      expect(ident?.column).toBe(2);
    });

    it("tracks positions across lines", () => {
      const tokens = tokenize("line1\n{{name}}");
      const ident = tokens.find((t) => t.type === TokenType.Identifier);
      expect(ident?.line).toBe(1);
      expect(ident?.column).toBe(2);
    });

    it("tracks positions for multi-line template", () => {
      const tokens = tokenize("{{#import T from \"./t\"}}\n<h1>{{title}}</h1>\n<p>{{body}}</p>");
      const title = tokens.find((t) => t.type === TokenType.Identifier && t.value === "title");
      const body = tokens.find((t) => t.type === TokenType.Identifier && t.value === "body");
      expect(title?.line).toBe(1);
      expect(body?.line).toBe(2);
    });
  });
});
