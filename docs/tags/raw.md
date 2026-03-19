# `{{#raw}}`

Outputs content as plain text without parsing `{{ }}` tags. Useful for showing template syntax in documentation or embedding template-like content that should not be interpreted.

## Syntax

```
{{#raw}}
  ...
{{/raw}}
```

## Parameters

None.

## Examples

Showing template syntax in output:

```
{{#raw}}
  Use {{name}} to output a value.
  Use {{#if condition}} for conditionals.
{{/raw}}
```

This renders the `{{ }}` tags as literal text instead of trying to parse them as expressions.
