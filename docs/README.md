<p align="center">
  <img src="../resources/tc_logo.svg" alt="Typecek" width="120" />
</p>

# Getting Started with Typecek

Typecek is a typed templating language for TypeScript. Templates declare their data type upfront and the compiler validates every expression against it — catching typos, missing properties, and type mismatches at build time.

## Prerequisites

- Node.js 18+
- TypeScript project with `tsconfig.json`

## Installation

<!-- TODO: Update once packages are published to npm -->

```bash
npm install @typecek/cli @typecek/runtime
```

> `@typecek/cli` includes the compiler and core packages as dependencies, so you only need to install these two. The CLI is also available as `typecku` for convenience.

## Project Setup

### 1. Create your project

```bash
mkdir my-app && cd my-app
npm init -y
npm install typescript @typecek/cli @typecek/runtime
npx tsc --init
```

### 2. Configure TypeScript

Run the init command to set up your `tsconfig.json` and `.gitignore`:

```bash
npx typecek init
```

This does three things:
- Adds `rootDirs` to `tsconfig.json` so TypeScript can resolve compiled templates
- Adds `.typecek/**/*.ts` to `include`
- Adds `.typecek/` to `.gitignore`

### 3. Add scripts to `package.json`

```json
{
  "type": "module",
  "scripts": {
    "compile": "typecek compile",
    "build": "npm run compile && npx tsx src/main.ts"
  }
}
```

## Hello World

Let's build a simple greeting template that takes a user's name and prints HTML to the console.

### 1. Define your data type

Create `src/types.ts`:

```typescript
export interface Greeting {
  name: string;
  excited: boolean;
}
```

### 2. Create a template

Create `src/templates/hello.html.tc`:

```
{{#import Greeting from "../types"}}
<h1>
  Hello, {{name}}{{#if excited}}!!!{{/if}}
</h1>
```

Every `.tc` template starts with `{{#import}}` — this tells the compiler what type the template expects. The compiler will check that `name` and `excited` actually exist on the `Greeting` interface.

### 3. Compile

```bash
npx typecek compile
```

This reads all `.tc` files, type-checks them against your TypeScript types, and generates render functions in the `.typecek/` directory. You should see:

```
Compiled 1 template (0 errors)
```

If you misspell a property (e.g. `{{naem}}`), the compiler tells you:

```
src/templates/hello.html.tc:3:10 - error: Property 'naem' does not exist on type Greeting
```

### 4. Use the render function

Create `src/main.ts`:

```typescript
import render from "./templates/hello.html";

const html = render({
  name: "World",
  excited: true,
});

console.log(html);
```

The import `./templates/hello.html` resolves to `.typecek/templates/hello.html.ts` via the `rootDirs` config that `typecek init` set up. The render function is fully typed — TypeScript will error if you pass the wrong data shape.

> **Note:** `rootDirs` is a compile-time feature. If you use `tsx` or `ts-node` to run directly without compiling, you'll need to add a `paths` mapping instead: `"@typecek/render/*": ["./.typecek/*"]` and import as `@typecek/render/templates/hello.html`.

### 5. Run it

```bash
npx tsx src/main.ts
```

Output:

```html
<h1>
  Hello, World!!!
</h1>
```

Or combine both steps:

```bash
npm run build
```

## What just happened?

1. You wrote a **type** (`Greeting`) and a **template** (`hello.html.tc`) that references it
2. `typecek compile` parsed the template, resolved the TypeScript type, validated all expressions, and generated a `render(data: Greeting): string` function
3. You imported that function and called it with data — getting type-safe HTML output

The generated render function (in `.typecek/templates/hello.html.ts`) looks roughly like:

```typescript
import type { Greeting } from "../types";
import { escapeHtml } from "@typecek/runtime";

export default function render(data: Greeting): string {
  let out = "";
  out += "<h1>\n  Hello, ";
  out += escapeHtml(String(data.name));
  if (data.excited) {
    out += "!!!";
  }
  out += "\n</h1>\n";
  return out;
}
```

Since the template file ends in `.html.tc`, all `{{expressions}}` are HTML-escaped automatically. Use `{{{triple braces}}}` for raw output.

## Next Steps

- Read the [Template Syntax](../README.md#template-syntax) reference for all available tags
- Use `{{#for item in items}}` for loops with meta-variables like `{{@index}}`, `{{@first}}`, `{{@last}}`
- Use `{{#layout}}` and `{{@content}}` to wrap pages in reusable layouts
- Use `{{> "path" data}}` to include partials
- Use `{{#with obj}}` to scope into nested objects
- Run `typecek watch` during development for automatic recompilation
- Run `typecek check` to type-check without generating output

<!-- TODO: Add link to VS Code extension once published to the marketplace -->

### VS Code Extension

Install the **Typecek** extension for the best development experience:

- Real-time type error diagnostics as you type
- Hover over expressions to see their types
- Ctrl+Click on properties to jump to their TypeScript definition
- Autocomplete for properties, block tags, and import paths
- Syntax highlighting for `.tc` files
