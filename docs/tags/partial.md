# `{{> partial}}`

Renders another template inline, passing data to it. The partial is a regular `.tc` file with its own `{{#import}}` directive.

## Syntax

```
{{> "path" dataExpression}}
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `path` | Yes | Relative path to the partial template file (string literal) |
| `dataExpression` | No | Expression passed as the partial's data |

## How it works

1. The partial template is compiled into its own render function
2. At the call site, the render function is called with the data expression
3. The partial's output is inserted inline into the parent template's output

## Validation

The compiler enforces:

- The referenced template **must not contain** `{{@content}}` — templates with `{{@content}}` are layouts (use [`{{#layout}}`](layout.md) instead)

## Examples

Render a product card:

```
{{#for product in products}}
  {{> "../partials/product-card.html.tc" product}}
{{/for}}
```

Where `product-card.html.tc` is:

```
{{#import Product from "../models/types"}}
<div class="card">
  <h3>{{name}}</h3>
  <p>${{price}}</p>
</div>
```

Without data:

```
{{> "./footer.html.tc"}}
```
