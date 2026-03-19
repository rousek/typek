# Template Tags

Every Typek template is built from tags enclosed in `{{ }}`. This page lists all available tags with links to detailed documentation.

## Overview

| Tag | Type | Closing tag | Description |
|-----|------|-------------|-------------|
| [`{{expr}}`](tags/expression.md) | Inline | — | Output an expression (HTML-escaped in `.html.tk`) |
| [`{{{expr}}}`](tags/raw-expression.md) | Inline | — | Output an expression without escaping |
| [`{{#import}}`](tags/import.md) | Directive | — | Declare the template's data type |
| [`{{#if}}`](tags/if.md) | Block | `{{/if}}` | Conditional rendering with optional `{{#else}}` / `{{#else if}}` |
| [`{{#for}}`](tags/for.md) | Block | `{{/for}}` | Loop over an array, with optional `{{#empty}}` fallback |
| [`{{#with}}`](tags/with.md) | Block | `{{/with}}` | Scope into a nested object, with optional `{{#empty}}` fallback |
| [`{{#switch}}`](tags/switch.md) | Block | `{{/switch}}` | Match a value against string cases |
| [`{{#layout}}`](tags/layout.md) | Block | `{{/layout}}` | Wrap content in a layout template |
| [`{{> partial}}`](tags/partial.md) | Inline | — | Render another template inline |
| [`{{@content}}`](tags/content.md) | Inline | — | Content insertion point in layout templates |
| [`{{@index}}`](tags/meta-variables.md) | Inline | — | Loop meta-variable: current index (0-based) |
| [`{{@first}}`](tags/meta-variables.md) | Inline | — | Loop meta-variable: `true` on first iteration |
| [`{{@last}}`](tags/meta-variables.md) | Inline | — | Loop meta-variable: `true` on last iteration |
| [`{{@length}}`](tags/meta-variables.md) | Inline | — | Loop meta-variable: total array length |
| [`{{! comment}}`](tags/comment.md) | Inline | — | Comment (not rendered in output) |
| [`{{#raw}}`](tags/raw.md) | Block | `{{/raw}}` | Output content without parsing `{{ }}` tags |
| [`{{~ expr ~}}`](tags/whitespace.md) | Modifier | — | Whitespace stripping on expressions |

## Tag types

- **Inline** — self-contained, no closing tag needed
- **Block** — paired with a closing tag, wraps a body of content
- **Directive** — must appear as the first line of the template
- **Modifier** — modifies the behavior of another tag
