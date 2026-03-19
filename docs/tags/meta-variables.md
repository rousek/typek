# Meta-variables

Meta-variables provide loop state information inside [`{{#for}}`](for.md) blocks. They are prefixed with `@`.

## Available meta-variables

| Variable | Type | Description |
|----------|------|-------------|
| `{{@index}}` | number | Current iteration index, starting from 0 |
| `{{@first}}` | boolean | `true` on the first iteration, `false` otherwise |
| `{{@last}}` | boolean | `true` on the last iteration, `false` otherwise |
| `{{@length}}` | number | Total number of elements in the array |

## Rules

- Can **only** be used inside a `{{#for}}` block — using them outside produces a parse error
- Always prefixed with `@`

## Examples

Numbered list:

```
{{#for item in items}}
  <p>{{@index}}. {{item.name}}</p>
{{/for}}
```

Comma-separated list:

```
{{#for tag in tags}}
  {{#if !@first}}, {{/if}}{{tag}}
{{/for}}
```

First/last styling:

```
{{#for item in items}}
  <div class="{{#if @first}}first{{/if}} {{#if @last}}last{{/if}}">
    {{item.name}}
  </div>
{{/for}}
```

Showing total:

```
{{#for item in items}}
  <p>Item {{@index + 1}} of {{@length}}</p>
{{/for}}
```
