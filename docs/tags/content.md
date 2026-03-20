# `{{@content}}`

Marks the insertion point for content in a layout template. When a page uses [`{{#layout}}`](layout.md), its body is rendered and placed where `{{@content}}` appears.

## Syntax

```
{{@content}}
```

## Parameters

None.

## Rules

- Only valid inside **layout templates** — templates that are referenced by `{{#layout}}`
- Exactly **one** `{{@content}}` per template — duplicates produce a parse error
- A template containing `{{@content}}` **cannot** be used as a partial (`{{> ...}}`)

## Example

Layout template (`layout.html.tc`):

```
{{#import PageLayout from "./types"}}
<!DOCTYPE html>
<html>
<head><title>{{title}}</title></head>
<body>
  {{@content}}
</body>
</html>
```

Page template:

```
{{#import Page from "./types"}}
{{#layout "./layout.html.tc" layout}}
  <h1>Hello!</h1>
{{/layout}}
```

Output:

```html
<!DOCTYPE html>
<html>
<head><title>My Page</title></head>
<body>
  <h1>Hello!</h1>
</body>
</html>
```
