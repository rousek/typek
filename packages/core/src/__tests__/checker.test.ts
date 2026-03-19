import { describe, it, expect } from "vitest";
import { parse } from "../parser.js";
import { typecheck, type Diagnostic } from "../checker.js";
import { TypeKind, type Type } from "../types.js";

// Helper: build an object type from a plain object
function obj(props: Record<string, Type>): Type {
  return { kind: TypeKind.Object, properties: new Map(Object.entries(props)) };
}

const userType = obj({
  name: { kind: TypeKind.String },
  email: { kind: TypeKind.String },
  age: { kind: TypeKind.Number },
  isActive: { kind: TypeKind.Boolean },
  role: {
    kind: TypeKind.Union,
    types: [
      { kind: TypeKind.StringLiteral, value: "admin" },
      { kind: TypeKind.StringLiteral, value: "editor" },
      { kind: TypeKind.StringLiteral, value: "viewer" },
    ],
  },
  address: {
    kind: TypeKind.Union,
    types: [
      obj({ street: { kind: TypeKind.String }, city: { kind: TypeKind.String } }),
      { kind: TypeKind.Null },
    ],
  },
});

const pageDataType = obj({
  title: { kind: TypeKind.String },
  users: { kind: TypeKind.Array, elementType: userType },
  showHeader: { kind: TypeKind.Boolean },
});

function check(template: string, dataType: Type): Diagnostic[] {
  const ast = parse(template);
  return typecheck(ast, dataType);
}

describe("type checker", () => {
  describe("valid templates", () => {
    it("accepts valid identifier", () => {
      const diags = check('{{#import T from "./t"}}\n{{name}}', userType);
      expect(diags).toEqual([]);
    });

    it("accepts valid property access", () => {
      const diags = check('{{#import T from "./t"}}\n{{address.street}}', userType);
      expect(diags).toEqual([]);
    });

    it("accepts valid for loop", () => {
      const diags = check(
        '{{#import T from "./t"}}\n{{#for user in users}}{{user.name}}{{/for}}',
        pageDataType,
      );
      expect(diags).toEqual([]);
    });

    it("accepts valid if block", () => {
      const diags = check('{{#import T from "./t"}}\n{{#if isActive}}yes{{/if}}', userType);
      expect(diags).toEqual([]);
    });

    it("accepts valid switch block", () => {
      const diags = check(
        '{{#import T from "./t"}}\n{{#switch role}}{{#case "admin"}}Admin{{/case}}{{/switch}}',
        userType,
      );
      expect(diags).toEqual([]);
    });

    it("accepts string literal in expression", () => {
      const diags = check('{{#import T from "./t"}}\n{{#if role == "admin"}}yes{{/if}}', userType);
      expect(diags).toEqual([]);
    });

    it("accepts number literal in expression", () => {
      const diags = check('{{#import T from "./t"}}\n{{age + 1}}', userType);
      expect(diags).toEqual([]);
    });

    it("accepts nested property through for loop", () => {
      const diags = check(
        '{{#import T from "./t"}}\n{{#for user in users}}{{user.address.city}}{{/for}}',
        pageDataType,
      );
      expect(diags).toEqual([]);
    });

    it("accepts raw expression", () => {
      const diags = check('{{#import T from "./t"}}\n{{{name}}}', userType);
      expect(diags).toEqual([]);
    });
  });

  describe("invalid templates", () => {
    it("reports missing property", () => {
      const diags = check('{{#import T from "./t"}}\n{{nonexistent}}', userType);
      expect(diags).toHaveLength(1);
      expect(diags[0].severity).toBe("error");
      expect(diags[0].message).toContain("nonexistent");
      expect(diags[0].message).toContain("does not exist");
    });

    it("reports missing nested property", () => {
      const diags = check('{{#import T from "./t"}}\n{{address.zipCode}}', userType);
      expect(diags).toHaveLength(1);
      expect(diags[0].severity).toBe("error");
      expect(diags[0].message).toContain("zipCode");
    });

    it("reports property access on primitive", () => {
      const diags = check('{{#import T from "./t"}}\n{{name.foo}}', userType);
      expect(diags).toHaveLength(1);
      expect(diags[0].severity).toBe("error");
      expect(diags[0].message).toContain("foo");
    });

    it("reports non-iterable in for loop", () => {
      const diags = check(
        '{{#import T from "./t"}}\n{{#for x in name}}{{x}}{{/for}}',
        userType,
      );
      expect(diags).toHaveLength(1);
      expect(diags[0].severity).toBe("error");
      expect(diags[0].message).toContain("not iterable");
    });

    it("reports missing property in for loop body", () => {
      const diags = check(
        '{{#import T from "./t"}}\n{{#for user in users}}{{user.missing}}{{/for}}',
        pageDataType,
      );
      expect(diags).toHaveLength(1);
      expect(diags[0].severity).toBe("error");
      expect(diags[0].message).toContain("missing");
    });

    it("reports missing property in if condition", () => {
      const diags = check('{{#import T from "./t"}}\n{{#if missing}}yes{{/if}}', userType);
      expect(diags).toHaveLength(1);
      expect(diags[0].severity).toBe("error");
      expect(diags[0].message).toContain("missing");
    });

    it("reports missing property in both if branches", () => {
      const diags = check(
        '{{#import T from "./t"}}\n{{#if isActive}}{{foo}}{{#else}}{{bar}}{{/if}}',
        userType,
      );
      expect(diags).toHaveLength(2);
      expect(diags[0].message).toContain("foo");
      expect(diags[1].message).toContain("bar");
    });
  });

  describe("warnings", () => {
    it("warns on arithmetic with non-number", () => {
      const diags = check('{{#import T from "./t"}}\n{{name * 2}}', userType);
      expect(diags).toHaveLength(1);
      expect(diags[0].severity).toBe("warning");
      expect(diags[0].message).toContain("string");
    });
  });

  describe("if-block narrowing", () => {
    const companyType = obj({ companyName: { kind: TypeKind.String }, revenue: { kind: TypeKind.Number } });
    (companyType as any).name = "Company";
    const personType = obj({ firstName: { kind: TypeKind.String }, lastName: { kind: TypeKind.String } });
    (personType as any).name = "Person";

    const customerData = obj({
      customer: { kind: TypeKind.Union, types: [companyType, personType] },
    });

    it("narrows union by property access in consequent", () => {
      // customer.firstName only exists on Person → customer is Person inside the if
      const diags = check(
        '{{#import T from "./t"}}\n{{#if customer.firstName}}{{customer.lastName}}{{/if}}',
        customerData,
      );
      expect(diags).toEqual([]);
    });

    it("narrows union in else branch to remaining members", () => {
      // In else: customer is Company
      const diags = check(
        '{{#import T from "./t"}}\n{{#if customer.firstName}}{{customer.lastName}}{{#else}}{{customer.companyName}}{{/if}}',
        customerData,
      );
      expect(diags).toEqual([]);
    });

    it("reports error for wrong member in narrowed block", () => {
      // customer is Person inside if → companyName doesn't exist
      const diags = check(
        '{{#import T from "./t"}}\n{{#if customer.firstName}}{{customer.companyName}}{{/if}}',
        customerData,
      );
      expect(diags).toHaveLength(1);
      expect(diags[0].message).toContain("companyName");
    });

    it("reports error for wrong member in else branch", () => {
      // customer is Company in else → firstName doesn't exist
      const diags = check(
        '{{#import T from "./t"}}\n{{#if customer.firstName}}ok{{#else}}{{customer.firstName}}{{/if}}',
        customerData,
      );
      expect(diags).toHaveLength(1);
      expect(diags[0].message).toContain("firstName");
    });

    it("narrows with || (either property narrows)", () => {
      // customer.firstName || customer.lastName → both on Person → customer is Person
      const diags = check(
        '{{#import T from "./t"}}\n{{#if customer.firstName || customer.lastName}}{{customer.lastName}}{{#else}}{{customer.revenue}}{{/if}}',
        customerData,
      );
      expect(diags).toEqual([]);
    });

    it("narrows with ! (inverts narrowing)", () => {
      // !customer.firstName → consequent is Company, else is Person
      const diags = check(
        '{{#import T from "./t"}}\n{{#if !customer.firstName}}{{customer.companyName}}{{#else}}{{customer.lastName}}{{/if}}',
        customerData,
      );
      expect(diags).toEqual([]);
    });

    it("truthiness narrowing removes null/undefined", () => {
      // address is { street, city } | null → inside if, it's the object type
      const diags = check(
        '{{#import T from "./t"}}\n{{#if address}}{{address.street}}{{/if}}',
        userType,
      );
      expect(diags).toEqual([]);
    });
  });

  describe("loop variable scoping", () => {
    it("loop variable shadows data property", () => {
      // Even if "name" exists on data type, inside for loop it refers to loop var
      const type = obj({
        name: { kind: TypeKind.String },
        items: { kind: TypeKind.Array, elementType: obj({ label: { kind: TypeKind.String } }) },
      });
      // Using "name" as loop variable should work and refer to array element
      const diags = check(
        '{{#import T from "./t"}}\n{{#for name in items}}{{name.label}}{{/for}}',
        type,
      );
      expect(diags).toEqual([]);
    });

    it("loop variable not accessible outside loop", () => {
      const diags = check(
        '{{#import T from "./t"}}\n{{#for user in users}}{{user.name}}{{/for}}{{user.name}}',
        pageDataType,
      );
      // "user" outside loop should try to resolve from data type and fail
      expect(diags).toHaveLength(1);
      expect(diags[0].message).toContain("user");
    });
  });
});
