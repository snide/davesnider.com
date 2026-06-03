# Claude Code Instructions

## Code Quality Checks

Always run these checks before considering code complete:

```bash
pnpm check              # TypeScript + Svelte type checking
pnpm lint               # ESLint
pnpm prettier --check "src/**/*.{ts,svelte}"  # Formatting
```

Fix any issues before finishing:

```bash
pnpm prettier --write "src/**/*.{ts,svelte}"
```

## Database Migrations

**Never create or generate Drizzle migrations directly.** Always prompt the user to run:

```bash
pnpm db:generate
```

The user will handle migration generation and review. You may edit the schema in `src/db/schema.ts`, but migrations must be user-generated.

## CSS Naming Convention

Use strict BEM (Block Element Modifier) naming:

```
.componentName__elementName--modifierName
```

Examples:

- `.filePage` - block
- `.filePage__title` - element
- `.filePage__title--large` - modifier
- `.colorBand` - block
- `.colorBand__color` - element

Rules:

- Block names use camelCase
- Elements use double underscore `__`
- Modifiers use double hyphen `--`
- Never nest BEM selectors beyond one level
