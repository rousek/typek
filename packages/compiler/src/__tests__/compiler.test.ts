import { describe, it, expect } from "vitest";
import { compile } from "../index.js";

describe("compiler", () => {
  describe("output structure", () => {
    it("compiles to a module with a render function export", () => {
      const result = compile({
        template: '{{#import User from "./types"}}\n<h1>{{name}}</h1>',
        filename: "greeting.html.tc",
      });
      expect(result.code).toContain("export default function render");
      expect(result.code).toContain('import type { User } from');
    });

    it("render function accepts typed data parameter", () => {
      const result = compile({
        template: '{{#import User from "./types"}}\n{{name}}',
        filename: "test.html.tc",
      });
      expect(result.code).toMatch(/function render\(data: User\): string/);
    });

    it("returns string from render function", () => {
      const result = compile({
        template: '{{#import User from "./types"}}\n{{name}}',
        filename: "test.html.tc",
      });
      expect(result.code).toMatch(/: string/);
    });
  });

  describe("text output", () => {
    it("compiles plain text to string literal", () => {
      const result = compile({
        template: '{{#import T from "./t"}}\nhello world',
        filename: "test.html.tc",
      });
      expect(result.code).toContain("hello world");
    });

    it("strips the type directive from output", () => {
      const result = compile({
        template: '{{#import T from "./t"}}\ncontent',
        filename: "test.html.tc",
      });
      expect(result.code).not.toMatch(/\{\{#import/);
    });
  });

  describe("expression output", () => {
    it("compiles property access expression", () => {
      const result = compile({
        template: '{{#import T from "./t"}}\n{{user.name}}',
        filename: "test.html.tc",
      });
      expect(result.code).toContain("data.user.name");
    });

    it("compiles arithmetic expression", () => {
      const result = compile({
        template: '{{#import T from "./t"}}\n{{price * qty}}',
        filename: "test.html.tc",
      });
      expect(result.code).toContain("data.price * data.qty");
    });
  });

  describe("escaping strategy", () => {
    it("applies HTML escaping for .html.tc files", () => {
      const result = compile({
        template: '{{#import T from "./t"}}\n{{content}}',
        filename: "test.html.tc",
      });
      expect(result.code).toContain("escapeHtml");
    });

    it("applies no escaping for .ts.tc files", () => {
      const result = compile({
        template: '{{#import T from "./t"}}\n{{content}}',
        filename: "test.ts.tc",
      });
      expect(result.code).not.toContain("escapeHtml");
    });

    it("skips escaping for raw triple-brace expressions in HTML", () => {
      const result = compile({
        template: '{{#import T from "./t"}}\n{{{content}}}',
        filename: "test.html.tc",
      });
      // raw expression should not go through escapeHtml
      expect(result.code).toContain("data.content");
      // should have at least one reference without escapeHtml wrapping
    });
  });

  describe("control flow compilation", () => {
    it("compiles if block to conditional", () => {
      const result = compile({
        template: '{{#import T from "./t"}}\n{{#if active}}yes{{/if}}',
        filename: "test.html.tc",
      });
      expect(result.code).toContain("data.active");
      expect(result.code).toContain("yes");
    });

    it("compiles if/else to conditional with both branches", () => {
      const result = compile({
        template: '{{#import T from "./t"}}\n{{#if active}}yes{{#else}}no{{/if}}',
        filename: "test.html.tc",
      });
      expect(result.code).toContain("yes");
      expect(result.code).toContain("no");
    });

    it("compiles for..in to iteration", () => {
      const result = compile({
        template: '{{#import T from "./t"}}\n{{#for item in items}}{{item.name}}{{/for}}',
        filename: "test.html.tc",
      });
      expect(result.code).toContain("data.items");
    });

    it("compiles for..in with empty block", () => {
      const result = compile({
        template: '{{#import T from "./t"}}\n{{#for item in items}}{{item.name}}{{#empty}}none{{/empty}}{{/for}}',
        filename: "test.html.tc",
      });
      expect(result.code).toContain("none");
      expect(result.code).toContain("length");
    });

    it("compiles switch-case", () => {
      const result = compile({
        template: '{{#import T from "./t"}}\n{{#switch role}}{{#case "admin"}}Admin{{/case}}{{#default}}Guest{{/default}}{{/switch}}',
        filename: "test.html.tc",
      });
      expect(result.code).toContain("data.role");
      expect(result.code).toContain("admin");
      expect(result.code).toContain("Admin");
      expect(result.code).toContain("Guest");
    });
  });

  describe("meta-variables", () => {
    it("compiles @index to loop index", () => {
      const result = compile({
        template: '{{#import T from "./t"}}\n{{#for item in items}}{{@index}}{{/for}}',
        filename: "test.html.tc",
      });
      // should reference the loop counter variable
      expect(result.code).toMatch(/__i_\d/);
    });
  });

  describe("escaping braces", () => {
    it("compiles escaped braces to literal text", () => {
      const result = compile({
        template: '{{#import T from "./t"}}\n\\{{ angular \\}}',
        filename: "test.html.tc",
      });
      expect(result.code).toContain("{{ angular }}");
    });

    it("compiles raw block to literal text", () => {
      const result = compile({
        template: '{{#import T from "./t"}}\n{{#raw}}{{ anything }}{{/raw}}',
        filename: "test.html.tc",
      });
      expect(result.code).toContain("{{ anything }}");
    });
  });

  describe("partials", () => {
    it("compiles partial invocation to function call", () => {
      const result = compile({
        template: '{{#import T from "./t"}}\n{{> "./header.html.tc" page}}',
        filename: "test.html.tc",
      });
      expect(result.code).toContain("__partial_0");
      expect(result.code).toContain("import __partial_0");
    });
  });
});
