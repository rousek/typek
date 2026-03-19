# `{{#layout}}`

Wraps the block's content in a layout template. The layout template receives the content via [`{{@content}}`](content.md).

## Syntax

```
{{#layout "path" dataExpression}}
  ...
{{/layout}}
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `path` | Yes | Relative path to the layout template file (string literal) |
| `dataExpression` | No | Expression passed as the layout template's data |

## How it works

1. The content between `{{#layout}}` and `{{/layout}}` is rendered first
2. The rendered content is passed to the layout template as `{{@content}}`
3. The layout template wraps the content with its own markup

### Layout template

A layout template is a regular `.tk` file that contains exactly one `{{@content}}` tag:

```
{{#import PageLayout from "./types"}}
<html>
<head><title>{{title}}</title></head>
<body>
  <header><h1>{{heading}}</h1></header>
  <main>{{@content}}</main>
  <footer>&copy; 2025</footer>
</body>
</html>
```

### Page template

```
{{#import StorePage from "./types"}}
{{#layout "../layouts/layout.html.tk" layout}}
<h2>Products</h2>
{{#for product in products}}
  <div>{{product.name}}</div>
{{/for}}
{{/layout}}
```

The `layout` expression is a property on the page's data type that matches the layout template's expected type.

## Validation

The compiler enforces:

- The referenced template **must contain** `{{@content}}` — otherwise it's not a layout (use [`{{> partial}}`](partial.md) instead)
- A layout template can only have **one** `{{@content}}`
- Multiple `{{#layout}}` blocks can appear in one template (wrapping different sections with different layouts)

## Examples

With data:

```
{{#layout "./base.html.tk" layout}}
  <article>{{body}}</article>
{{/layout}}
```

Without data (layout has no dynamic content):

```
{{#layout "./wrapper.html.tk"}}
  <p>Simple wrapped content</p>
{{/layout}}
```
