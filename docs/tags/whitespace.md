# `{{~ ~}}` Whitespace stripping

The `~` modifier strips whitespace adjacent to a tag. It can be placed on either or both sides of an expression.

## Syntax

| Syntax | Effect |
|--------|--------|
| `{{~ expr}}` | Strips whitespace **before** the tag |
| `{{expr ~}}` | Strips whitespace **after** the tag |
| `{{~ expr ~}}` | Strips whitespace on **both** sides |

The `~` can also be used on block tags:

| Syntax | Effect |
|--------|--------|
| `{{~#if cond}}` | Strips whitespace before the opening tag |
| `{{/if ~}}` | Strips whitespace after the closing tag |

## What gets stripped

The `~` modifier removes all whitespace (spaces, tabs, newlines) between the tag and the adjacent text.

## Examples

Without stripping:

```
Hello,   {{ name }}   !
```

Output: `Hello,   Alice   !`

With stripping:

```
Hello, {{~ name ~}} !
```

Output: `Hello,Alice!`

## Standalone line stripping

Block tags (`{{#if}}`, `{{#for}}`, `{{#with}}`, `{{#switch}}`, `{{#layout}}`, `{{! comment}}`) on their own line are automatically stripped of the surrounding whitespace and newline — no `~` needed. The `~` modifier is primarily useful for inline expressions where you need precise control.
