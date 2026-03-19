# `{{#if}}`

Conditionally renders content based on a truthy/falsy expression. Supports `{{#else}}` and `{{#else if}}` branches.

## Syntax

```
{{#if condition}}
  ...
{{/if}}
```

With else:

```
{{#if condition}}
  ...
{{#else}}
  ...
{{/if}}
```

With else if:

```
{{#if condition}}
  ...
{{#else if otherCondition}}
  ...
{{#else}}
  ...
{{/if}}
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `condition` | Yes | Any expression. Rendered if truthy. |

## Truthiness

A value is **falsy** if it is `false`, `0`, `""`, `null`, or `undefined`. Everything else is truthy.

## Union type narrowing

When the condition checks for a property that exists on some members of a union type but not others, Typek automatically narrows the type inside the block.

Given:

```typescript
interface Company {
  companyName: string;
  revenue: number;
}
interface Person {
  firstName: string;
  lastName: string;
}
type Customer = Company | Person;
```

```
{{#if customer.companyName}}
  {{! customer is narrowed to Company here }}
  {{customer.revenue}}
{{#else}}
  {{! customer is narrowed to Person here }}
  {{customer.firstName}}
{{/if}}
```

### Logical operators

Narrowing works with `||`, `&&`, and `!`:

| Condition | Consequent type | Alternate type |
|-----------|----------------|----------------|
| `customer.companyName` | `Company` | `Person` |
| `customer.companyName \|\| customer.revenue` | `Company` | `Person` |
| `customer.firstName && customer.lastName` | `Person` | `Company` |
| `!customer.companyName` | `Person` | `Company` |

### Truthiness narrowing

When the condition is a simple property access on a union type that includes `null` or `undefined`, the type is narrowed by removing those members:

```
{{#if user.email}}
  {{! user.email is string here, not string | null }}
{{/if}}
```

## Examples

Simple boolean:

```
{{#if isActive}}
  <span class="badge">Active</span>
{{/if}}
```

With comparison:

```
{{#if items.length > 0}}
  <ul>...</ul>
{{#else}}
  <p>No items.</p>
{{/if}}
```

Chained conditions:

```
{{#if role == "admin"}}
  <a href="/admin">Dashboard</a>
{{#else if role == "editor"}}
  <a href="/editor">Edit</a>
{{#else}}
  <p>Welcome, guest.</p>
{{/if}}
```
