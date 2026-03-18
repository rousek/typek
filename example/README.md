# Typek Example

A sample e-commerce project demonstrating Typek's typed templating features.

## Templates

| File | Type | Description |
|------|------|-------------|
| `store.html.tk` | `StorePage` | Product listing with categories, featured product, loops, and conditionals |
| `cart.html.tk` | `CartPage` | Shopping cart with user info, `{{#with}}` scoping, `{{#switch}}`, and `{{#empty}}` |
| `profile.html.tk` | `UserProfile` | User profile with nested order list, status badges, and address display |
| `email.html.tk` | `EmailData` | Marketing email template |

## How to run

```bash
# Install dependencies
pnpm install

# Compile templates (.tk → .ts) and render with sample data
pnpm build

# Or step by step:
pnpm compile    # Compiles .tk templates into .typek/ directory
pnpm render     # Runs render.ts which outputs HTML into dist/
```

Open the files in `dist/` in your browser to see the results.

## What's happening

1. **`pnpm compile`** runs the Typek CLI which:
   - Finds all `.tk` files in `src/`
   - Type-checks each template against its declared TypeScript type
   - Generates `.ts` render functions in `.typek/`

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
    store.html.tk     Product listing page template
    cart.html.tk      Shopping cart page template
    profile.html.tk   User profile page template
    email.html.tk     Email template
  dist/               Generated HTML files (after running pnpm build)
  .typek/             Generated TypeScript render functions (after compile)
```
