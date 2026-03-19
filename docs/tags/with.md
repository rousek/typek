# `{{#with}}`

Scopes into a nested property, making its fields directly accessible. Only renders if the value is truthy. Supports an optional `{{#empty}}` fallback.

## Syntax

```
{{#with expression}}
  ...
{{/with}}
```

With empty fallback:

```
{{#with expression}}
  ...
{{#empty}}
  ...
{{/empty}}
{{/with}}
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `expression` | Yes | Property to scope into (must resolve to an object type) |

## Scope access

Inside a `{{#with}}` block, properties of the scoped object are accessed directly without a prefix:

```
{{#with user.address}}
  {{street}}, {{city}}, {{country}}
{{/with}}
```

Without `{{#with}}`, you'd write `{{user.address.street}}`, `{{user.address.city}}`, etc.

### Explicit scope prefixes

| Prefix | Meaning | Example |
|--------|---------|---------|
| `./` | Current scope (explicit) | `{{./street}}` |
| `../` | Parent scope | `{{../name}}` |
| `../../` | Grandparent scope | `{{../../title}}` |

The `../` prefix can be chained to go up multiple scope levels. The compiler validates that the depth does not exceed the number of available scopes.

## Empty block

The `{{#empty}}` block renders when the expression is falsy (`null`, `undefined`, `false`, `0`, `""`):

```
{{#with user.address}}
  <p>{{street}}, {{city}}</p>
{{#empty}}
  <p>No address on file.</p>
{{/empty}}
{{/with}}
```

## Examples

Simplify deep property access:

```
{{#with order.shippingAddress}}
  <p>{{street}}</p>
  <p>{{city}}, {{state}} {{zip}}</p>
  <p>{{country}}</p>
{{/with}}
```

Access parent scope:

```
{{#with profile}}
  <h2>{{displayName}}</h2>
  <p>Email: {{../email}}</p>
{{/with}}
```
