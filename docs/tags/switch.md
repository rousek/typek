# `{{#switch}}`

Matches a value against string literal cases. Similar to a JavaScript `switch` statement.

## Syntax

```
{{#switch expression}}
  {{#case "value1"}}...{{/case}}
  {{#case "value2"}}...{{/case}}
  {{#default}}...{{/default}}
{{/switch}}
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `expression` | Yes | Expression to match against cases |

## Sub-tags

| Tag | Required | Parameters | Description |
|-----|----------|------------|-------------|
| `{{#case "value"}}` | At least one | String literal | Renders when expression matches the value |
| `{{#default}}` | No | — | Renders when no case matches |

## Type checking

When the expression is a string literal union type (e.g. `"admin" | "editor" | "viewer"`), the compiler validates:

- Each `{{#case}}` value is a member of the union
- A case value that doesn't exist in the union produces an error

## Examples

Role-based content:

```
{{#switch role}}
  {{#case "admin"}}
    <a href="/admin">Admin Panel</a>
  {{/case}}
  {{#case "editor"}}
    <a href="/editor">Edit Content</a>
  {{/case}}
  {{#default}}
    <p>Welcome, guest.</p>
  {{/default}}
{{/switch}}
```

Status badge:

```
<span class="badge badge-{{status}}">
  {{#switch status}}
    {{#case "active"}}Active{{/case}}
    {{#case "pending"}}Pending Review{{/case}}
    {{#case "archived"}}Archived{{/case}}
  {{/switch}}
</span>
```
