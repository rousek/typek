# `{{{expression}}}`

Outputs the value of an expression **without HTML escaping**. Use this when the value contains trusted HTML that should be rendered as-is.

## Syntax

```
{{{expression}}}
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `expression` | Yes | Any valid expression (same as [`{{expression}}`](expression.md)) |

## Examples

```
{{{htmlContent}}}
{{{user.bio}}}
```

## When to use

Use triple braces when the value contains HTML that should be rendered:

```
{{#import Article from "./types"}}
<article>
  <h1>{{title}}</h1>
  <div class="body">{{{bodyHtml}}}</div>
</article>
```

With double braces, `<p>Hello</p>` would render as the literal text `&lt;p&gt;Hello&lt;/p&gt;`. With triple braces, it renders as actual HTML.

## Note

In plain `.tc` files (not `.html.tc`), no escaping is applied regardless of brace count, so `{{expr}}` and `{{{expr}}}` behave identically.
