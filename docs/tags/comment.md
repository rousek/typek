# `{{! comment}}`

A comment that is not included in the rendered output.

## Syntax

```
{{! comment text}}
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `comment text` | No | Any text — not parsed or rendered |

## Examples

```
{{! This section shows the user's profile }}
<div class="profile">
  {{name}}
</div>

{{! TODO: add avatar support }}
```

## Notes

- Comments are completely stripped from the output
- When a comment is on its own line, the surrounding whitespace and newline are also stripped (standalone line stripping)
- Unlike HTML comments (`<!-- -->`), Typecek comments are never sent to the browser
