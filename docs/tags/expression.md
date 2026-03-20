# `{{expression}}`

Outputs the value of an expression. In `.html.tc` files, the output is automatically HTML-escaped.

## Syntax

```
{{expression}}
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `expression` | Yes | Any valid expression: identifier, property access, arithmetic, comparison, or logical |

## Expressions

Typecek supports the following expression types:

| Expression | Example | Description |
|------------|---------|-------------|
| Identifier | `{{name}}` | Access a property on the current data object |
| Property access | `{{user.address.city}}` | Dot-separated property chain |
| Arithmetic | `{{price * quantity}}` | `+`, `-`, `*`, `/` |
| Comparison | `{{age >= 18}}` | `==`, `!=`, `<`, `>`, `<=`, `>=` |
| Logical | `{{isActive && !isHidden}}` | `&&`, `\|\|`, `!` |
| Parentheses | `{{(a + b) * c}}` | Group sub-expressions |
| Scope prefix | `{{./name}}` | Explicit current scope |
| Parent scope | `{{../title}}` | Access parent scope (inside `{{#with}}`) |

All expressions are type-checked against the imported type at compile time.

## HTML escaping

In `.html.tc` files, the following characters are escaped:

| Character | Escaped as |
|-----------|------------|
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` | `&gt;` |
| `"` | `&quot;` |
| `'` | `&#x27;` |

In plain `.tc` files, no escaping is applied.

To output without escaping in `.html.tc` files, use [`{{{triple braces}}}`](raw-expression.md).

## Examples

```
<h1>{{title}}</h1>
<p>{{user.firstName}} {{user.lastName}}</p>
<span>{{price * quantity}}</span>
<span class="{{isActive && "active"}}">Status</span>
```

## Type checking

The compiler validates that every property in the expression exists on the data type. For example:

```
{{#import User from "./types"}}
{{naem}}
```

Produces:

```
Property 'naem' does not exist on type User
```
