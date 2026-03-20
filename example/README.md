# Typecek Example

A sample e-commerce project demonstrating Typecek's typed templating features.

## Templates

| File | Type | Description |
|------|------|-------------|
| `store.html.tc` | `StorePage` | Product listing with categories, featured product, loops, and conditionals |
| `cart.html.tc` | `CartPage` | Shopping cart with user info, `{{#with}}` scoping, `{{#switch}}`, and `{{#empty}}` |
| `profile.html.tc` | `UserProfile` | User profile with nested order list, status badges, and address display |
| `email.html.tc` | `EmailData` | Marketing email template |

## How to run

```bash
# Install dependencies
pnpm install

# Compile templates (.tc → .ts) and render with sample data
pnpm build

# Or step by step:
pnpm compile    # Compiles .tc templates into .typecek/ directory
pnpm render     # Runs render.ts which outputs HTML into dist/
```

Open the files in `dist/` in your browser to see the results.

## What's happening

1. **`pnpm compile`** runs the Typecek CLI which:
   - Finds all `.tc` files in `src/`
   - Type-checks each template against its declared TypeScript type
   - Generates `.ts` render functions in `.typecek/`

2. **`pnpm render`** runs `src/render.ts` which:
   - Imports the compiled render functions
   - Passes the sample data from `src/data.ts`
   - Writes the resulting HTML to `dist/`

## Project structure

```
example/
  src/
    types.ts          TypeScript interfaces (Product, User, Order, etc.)
    data.ts           Sample data matching those types
    render.ts         Script that calls render functions and writes HTML
    store.html.tc     Product listing page template
    cart.html.tc      Shopping cart page template
    profile.html.tc   User profile page template
    email.html.tc     Email template
  dist/               Generated HTML files (after running pnpm build)
  .typecek/             Generated TypeScript render functions (after compile)
```
