# `{{#for}}`

Iterates over an array, rendering the body once for each element. Supports an optional `{{#empty}}` block for when the array is empty.

## Syntax

```
{{#for item in items}}
  ...
{{/for}}
```

With empty fallback:

```
{{#for item in items}}
  ...
{{#empty}}
  ...
{{/empty}}
{{/for}}
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `item` | Yes | Loop variable name — available inside the body |
| `items` | Yes | Expression that resolves to an array type |

## Meta-variables

Inside a `{{#for}}` block, the following meta-variables are available:

| Variable | Type | Description |
|----------|------|-------------|
| `{{@index}}` | number | Current iteration index (0-based) |
| `{{@first}}` | boolean | `true` on the first iteration |
| `{{@last}}` | boolean | `true` on the last iteration |
| `{{@length}}` | number | Total number of elements in the array |

See [Meta-variables](meta-variables.md) for details.

## Empty block

The `{{#empty}}...{{/empty}}` block renders when the array has zero elements. It is placed inside the `{{#for}}` block, before the closing `{{/for}}`:

```
{{#for product in products}}
  <div>{{product.name}}</div>
{{#empty}}
  <p>No products found.</p>
{{/empty}}
{{/for}}
```

## Type checking

- The `items` expression must resolve to an array type
- The loop variable `item` is typed as the array's element type
- If `items` is `Product[]`, then `item` is `Product`

## Examples

Basic list:

```
<ul>
  {{#for item in items}}
    <li>{{item.name}}</li>
  {{/for}}
</ul>
```

With index and separators:

```
{{#for tag in tags}}
  {{#if !@first}}, {{/if}}
  {{tag}}
{{/for}}
```

Nested loops:

```
{{#for category in categories}}
  <h2>{{category.name}}</h2>
  {{#for product in category.products}}
    <div>{{product.name}} — ${{product.price}}</div>
  {{/for}}
{{/for}}
```
