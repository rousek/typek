<p align="center">
  <img src="icons/tc_logo_128.png" alt="Typecek" width="100" />
</p>

<h1 align="center">Typecek for VS Code</h1>

VS Code extension for [Typecek](https://github.com/rousek/typecek) — a typed templating language for TypeScript. Provides real-time diagnostics, autocomplete, hover info, and navigation for `.tc` template files.

## Features

### Type-checking diagnostics

Errors appear inline as you type — misspelled properties, type mismatches, missing imports, and invalid tag usage are all caught instantly without running the compiler.

![Type error diagnostics](https://raw.githubusercontent.com/rousek/typecek/main/resources/demos/error.gif)

### Autocomplete

Property completions, loop variables, tag snippets, and import paths — all driven by your TypeScript types.

![Autocomplete](https://raw.githubusercontent.com/rousek/typecek/main/resources/demos/for_loop.gif)

### Union types

Properties are resolved across all union members, with type narrowing inside `{{#if}}` blocks.

![Union type support](https://raw.githubusercontent.com/rousek/typecek/main/resources/demos/duck_typing.gif)

### Go to Definition

Ctrl+Click any property to jump to its TypeScript type definition. Also works on file paths in `{{#import}}`, `{{#layout}}`, and `{{> partial}}`.

![Go to Definition](https://raw.githubusercontent.com/rousek/typecek/main/resources/demos/go_to_definition.gif)

### Also included

- **Hover info** — see resolved types (`user.name: string`) and tag syntax help
- **Syntax highlighting** — full TextMate grammar for `.tc`, `.html.tc`, and `.ts.tc` with embedded HTML/TypeScript
- **Embedded language support** — HTML and CSS completions inside host language regions
- **Custom file icon** — diamond icon for `.tc` files in the explorer and tabs

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `typecek.typecheck.enabled` | `true` | Enable real-time type checking |
| `typecek.typecheck.debounce` | `200` | Delay (ms) before re-checking after edits |
| `typecek.completions.properties` | `true` | Property completions from imported types |
| `typecek.completions.snippets` | `false` | Snippet completions for block tags |
| `typecek.hover.typeInfo` | `true` | Show types on hover |
| `typecek.hover.tagHelp` | `true` | Show tag syntax help on hover |

## What is Typecek?

Typecek is a typed templating engine for TypeScript. Templates declare their data type via `{{#import}}` and the compiler validates every expression at build time. See the [project README](https://github.com/rousek/typecek) for full documentation.

```
npm install @typecek/cli @typecek/runtime
npx typecek init
npx typecek compile
```

## Links

- [GitHub](https://github.com/rousek/typecek)
- [Documentation](https://github.com/rousek/typecek/tree/main/docs)
- [Tag Reference](https://github.com/rousek/typecek/blob/main/docs/tags.md)
