# `{{#import}}`

Declares the TypeScript type that the template expects as its data. Must be the first line of the template. Each template can have exactly one import directive.

## Syntax

```
{{#import TypeName from "path"}}
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `TypeName` | Yes | The name of the exported TypeScript interface or type |
| `path` | Yes | Relative path to the TypeScript file (with or without `.ts` extension) |

## Examples

```
{{#import User from "./types"}}
{{#import ProductPage from "../models/product"}}
{{#import DashboardData from "../models/dashboard.ts"}}
```

## How it works

The import directive tells the Typecek compiler:

1. **Where to find the type** — the path is resolved relative to the template file
2. **What type to validate against** — every `{{expression}}` in the template is checked against this type
3. **What parameter the render function expects** — the compiled output becomes `render(data: TypeName): string`

## Rules

- Must be the **first line** of the template — no text or tags can appear before it
- Only **one** `{{#import}}` per template
- The type must be **exported** from the referenced file (`export interface` or `export type`)
- The path is relative to the template file, just like TypeScript imports

## Type resolution

The compiler uses the TypeScript compiler API to resolve the type. It supports:

- `interface` declarations
- `type` aliases
- Union types (`A | B`)
- Array types (`items: Product[]`)
- Nested objects
- Literal types (`"admin" | "user"`)
- Optional properties (treated as `T | undefined`)
