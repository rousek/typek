<p align="center">
  <img src="resources/tc_logo.svg" alt="Typecek" width="120" />
</p>

<h1 align="center">Typecek</h1>

A typed templating language for TypeScript. Write `.tc` templates with full type safety — the compiler catches property typos, type mismatches, and missing fields at build time, not runtime.

## Why Typecek?

Traditional template engines (Handlebars, EJS, Pug) have no idea what data you're passing in. Typecek templates declare their data type upfront and the compiler validates every expression against it.

```html
{{#import User from "./types"}}
<div class="card">
  <h2>{{name}}</h2>
  <p>{{email}}</p>
  {{#if isActive}}
    <span class="badge">Active</span>
  {{/if}}
</div>
```

```typescript
// types.ts
export interface User {
  name: string;
  email: string;
  isActive: boolean;
}
```

Misspell `{{naem}}`? The compiler tells you: `Property 'naem' does not exist on type User. Expected: name, email, isActive`.

## Features

- **Type-checked templates** — errors at compile time, not runtime
- **Compiles to TypeScript** — each `.tc` file becomes a `render(data: T): string` function
- **Layout templates** — wrap content with reusable layouts via `{{#layout}}` and `{{@content}}`
- **VS Code extension** — diagnostics, hover type info, Go to Definition, autocomplete for properties/tags/imports
- **Familiar syntax** — `{{#if}}`, `{{#for}}`, `{{#switch}}`, `{{#with}}`, `{{#layout}}`
- **HTML auto-escaping** — `.html.tc` files escape output by default, `{{{raw}}}` for unescaped
- **Whitespace control** — `{{~ expr ~}}` strips surrounding whitespace

## Template Syntax

See the [complete tag reference](docs/tags.md) for detailed documentation on each tag.

### Expressions

```
{{name}}              Output (auto-escaped in .html.tc)
{{{rawHtml}}}         Unescaped output
{{user.address.city}} Property access
{{a + b}}             Arithmetic
{{age >= 18}}         Comparison
{{!hidden}}           Negation
```

### Import

Every template starts with an import that declares its data type:

```
{{#import User from "./types"}}
{{#import PageData from '../models/page'}}
```

### Conditionals

```
{{#if condition}}
  ...
{{#else if otherCondition}}
  ...
{{#else}}
  ...
{{/if}}
```

### Loops

```
{{#for item in items}}
  {{@index}}. {{item.name}}
{{#empty}}
  No items found.
{{/empty}}
{{/for}}
```

Meta-variables inside loops: `{{@index}}`, `{{@first}}`, `{{@last}}`, `{{@length}}`.

### Switch

```
{{#switch role}}
  {{#case "admin"}}Administrator{{/case}}
  {{#case "editor"}}Editor{{/case}}
  {{#default}}Guest{{/default}}
{{/switch}}
```

### Scoping with `with`

Scopes into a nested property. Only renders if the value is truthy.

```
{{#with address}}
  {{street}}, {{city}}
  {{./street}}           Explicitly reference current scope with ./
  {{../name}}            Access parent scope with ../
{{#empty}}
  No address on file.
{{/empty}}
{{/with}}
```

The `../` prefix can be chained (`../../name`) to go up multiple levels. The compiler validates that the depth does not exceed the number of available scope levels.

### Layout Templates

Wrap content with reusable layouts using `{{#layout}}` and `{{@content}}`.

**Layout** (`layout.html.tc`):
```
{{#import PageLayout from "./types"}}
<html>
<head><title>{{title}}</title></head>
<body>
  {{@content}}
</body>
</html>
```

**Page** (`store.html.tc`):
```
{{#import StorePage from "./types"}}
{{#layout "./layout.html.tc" layoutData}}
<main>
  <h1>{{title}}</h1>
</main>
{{/layout}}
```

- The first argument is the path to the layout template
- The second argument is the data expression passed to the layout's render function
- Multiple `{{#layout}}` blocks can appear in one template
- Only one `{{@content}}` is allowed per layout template
- The compiler validates that layout templates contain `{{@content}}`

### Partials

Render another template inline:

```
{{> "./product-card.html.tc" product}}
```

The first argument is the path to the partial template, the second is the data passed to its render function. The partial is a regular `.tc` template with its own `{{#import}}` directive.

### Other

```
{{! This is a comment }}
{{#raw}}{{ not parsed }}{{/raw}}
{{~ expr ~}}            Whitespace stripping
\{{ escaped braces \}}
```

## Getting Started

### Install

```bash
npm install @typecek/cli @typecek/runtime
npx typecek init
```

> The CLI is also available as `typecku` for convenience.

### Compile

```bash
npx typecek compile
```

This finds all `.tc` files in your source directory, type-checks them, and outputs render functions in `.typecek/`.

### Use in code

```typescript
import renderUser from "./user-card.html";

const html = renderUser({
  name: "Alice",
  email: "alice@example.com",
  isActive: true,
});
```

### VS Code Extension

Install the **Typecek** extension for:
- Real-time type error diagnostics
- Hover to see types (`user: User | null`)
- Go to Definition (Ctrl+Click) on properties to jump to TypeScript source
- Autocomplete for properties, tag names, and import paths
- Tag help popups for all block tags and meta variables
- Syntax highlighting

## Project Structure

```
packages/
  core/       Lexer, parser, type checker, type resolver, hover/completions
  compiler/   Compiles .tc templates to TypeScript
  runtime/    Runtime helpers (HTML escaping)
  cli/        CLI tool (compile, watch, list)
  vscode/     VS Code extension
```

## Development

```bash
pnpm install
pnpm build
pnpm test
```

Run the VS Code extension in dev mode: open `packages/vscode` in VS Code and press **F5**.

## License

MIT
